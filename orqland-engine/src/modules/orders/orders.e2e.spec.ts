/**
 * Order Management end-to-end spec (real PostgreSQL). Covers: idempotent multi-line checkout with snapshots,
 * uniform stock reservation for multi-variant and single products (default variant, review §2.1),
 * PRODUCT-only scope (review §2.2), workspace authorization through the standalone helper (review §2.3),
 * the preparation lifecycle, oversell protection under concurrency, stock release/restore,
 * customer pickup, payments, cancellation and returns.
 *
 * Run with `pnpm run test:e2e` (see test/jest-e2e.json).
 */
import {
  advanceToReady,
  call,
  downloadFile,
  gql,
  gqlError,
  PLACE_ORDER,
  SEED,
  sqlQuery,
  startE2eApp,
  stopE2eApp,
  uploadFile,
  variantStock,
} from './testing/e2e-harness';

const ORDER = `query($id: ID!) { orqspaceOrder(orderId: $id) { orderStatus paymentStatus fulfilmentMethod allowedNextStatuses items { variantId variantLabel sku } history { toStatus actorRole } } }`;

const place = (key: string, items: Record<string, unknown>[], extra: Record<string, unknown> = {}) =>
  call(SEED.customer, PLACE_ORDER, {
    input: { idempotencyKey: key, items, paymentMethod: 'ONLINE', requestedFulfilment: 'PICKUP', ...extra },
  });

beforeAll(startE2eApp);
afterAll(stopE2eApp);

describe('Checkout & inventory (review §2.1 — every product has a variant)', () => {
  it('places one order with snapshots and reserves stock idempotently', async () => {
    const input = [{ listingId: SEED.listingVariants, variantId: SEED.variantSmall, quantity: 2 }];
    const first = (await place('orders-e2e-0001', input)).data.placeOrder;
    const replay = (await place('orders-e2e-0001', input)).data.placeOrder;
    expect(first.replayed).toBe(false);
    expect(replay.replayed).toBe(true);
    expect(replay.orders[0].id).toBe(first.orders[0].id);
    expect(first.orders[0]).toMatchObject({ orderStatus: 'PLACED', totalAmount: '420.00' });
    expect(await variantStock(SEED.variantSmall)).toBe(8);
  });

  it('resolves the default variant of a has_variants = false product and reserves its stock the same way', async () => {
    const before = await variantStock(SEED.variantSimpleDefault);
    const body = await place('orders-e2e-simple', [{ listingId: SEED.listingSimple, quantity: 3 }]);
    const order = body.data.placeOrder.orders[0];
    expect(order.items[0].variantId).toBe(SEED.variantSimpleDefault);
    expect(order.totalAmount).toBe('1512.00');
    expect(await variantStock(SEED.variantSimpleDefault)).toBe(before - 3);
    const [reservation] = await sqlQuery<{ variant_id: string; status: string }>(
      'select variant_id, status from order_inventory_reservations where order_id = $1',
      [order.id],
    );
    expect(reservation).toEqual({ variant_id: SEED.variantSimpleDefault, status: 'RESERVED' });
  });

  it('requires an explicit option for multi-variant listings', async () => {
    const body = await place('orders-e2e-novariant', [{ listingId: SEED.listingVariants, quantity: 1 }]);
    expect(body.errors?.[0].message).toMatch(/Choose an option/);
  });

  it('rejects SERVICE listings — they follow the booking pipeline (review §2.2)', async () => {
    const body = await place('orders-e2e-service', [{ listingId: SEED.listingService, quantity: 1 }]);
    expect(body.errors?.[0].message).toMatch(/SERVICE listings are booked/);
  });

  it('never oversells under concurrent checkouts', async () => {
    const remaining = await variantStock(SEED.variantSmall);
    const attempts = await Promise.all(
      Array.from({ length: 4 }, (_, i) => place(`orders-race-${i}-xxxxxxxx`, [{ listingId: SEED.listingVariants, variantId: SEED.variantSmall, quantity: remaining - 1 }])),
    );
    expect(attempts.filter((a) => a.data?.placeOrder).length).toBe(1);
    expect(attempts.filter((a) => a.errors?.[0]?.message.includes('not have enough stock')).length).toBe(3);
    expect(await variantStock(SEED.variantSmall)).toBe(1);
  });
});

describe('Workspace authorization (review §2.3 — standalone assertWorkspaceAccess helper)', () => {
  it('allows the workspace owner, blocks other users and allows platform admins as an override', async () => {
    const q = `query { orqspaceOrderCounts(orqspaceId: "${SEED.orqspace}") { status count } }`;
    expect((await gql(SEED.owner, q)).orqspaceOrderCounts.length).toBeGreaterThan(0);
    expect(await gqlError(SEED.customer, q)).toMatch(/do not manage/);
    expect(await gqlError(SEED.agentRavi, q)).toMatch(/do not manage/);
    expect((await gql(SEED.admin, q)).orqspaceOrderCounts.length).toBeGreaterThan(0);
  });
});

describe('Order lifecycle', () => {
  it('releases stock on rejection and on customer cancellation', async () => {
    const before = await variantStock(SEED.variantSimpleDefault);
    const rejected = (await place('orders-e2e-reject', [{ listingId: SEED.listingSimple, quantity: 1 }])).data.placeOrder.orders[0];
    await gql(SEED.owner, `mutation($i: OrderReasonInput!) { rejectOrder(input: $i) { orderStatus } }`, { i: { orderId: rejected.id, reason: 'Closed today' } });
    expect(await variantStock(SEED.variantSimpleDefault)).toBe(before);

    const cancelled = (await place('orders-e2e-cancel', [{ listingId: SEED.listingSimple, quantity: 2 }])).data.placeOrder.orders[0];
    await gql(SEED.customer, `mutation($i: OrderReasonInput!) { cancelMyOrder(input: $i) { orderStatus } }`, { i: { orderId: cancelled.id, reason: 'Changed my mind' } });
    expect(await variantStock(SEED.variantSimpleDefault)).toBe(before);
    expect(await gqlError(SEED.customer, `mutation($i: OrderReasonInput!) { cancelMyOrder(input: $i) { orderStatus } }`, { i: { orderId: cancelled.id, reason: 'again' } })).toMatch(/can no longer be cancelled/);
  });

  it('runs customer pickup with a recorded online payment', async () => {
    const order = (await place('orders-e2e-pickup', [{ listingId: SEED.listingSimple, quantity: 2 }])).data.placeOrder.orders[0];
    await advanceToReady(order.id);
    await gql(SEED.owner, `mutation($id: ID!) { markOrderAwaitingPickup(input: { orderId: $id }) { orderStatus } }`, { id: order.id });
    await gql(SEED.owner, `mutation($i: RecordOrderPaymentInput!) { recordOrderPayment(input: $i) { paymentStatus } }`, {
      i: { orderId: order.id, kind: 'PAYMENT', method: 'ONLINE', amount: '1008.00', providerReference: 'UPI-REF-1' },
    });
    // A reused provider reference is refused with a clear message (not a raw database error).
    const other = (await place('orders-e2e-dup-ref', [{ listingId: SEED.listingSimple, quantity: 1 }])).data.placeOrder.orders[0];
    expect(
      await gqlError(SEED.owner, `mutation($i: RecordOrderPaymentInput!) { recordOrderPayment(input: $i) { paymentStatus } }`, {
        i: { orderId: other.id, kind: 'PAYMENT', method: 'ONLINE', amount: '504.00', providerReference: 'UPI-REF-1' },
      }),
    ).toBe('Payment reference UPI-REF-1 is already recorded');
    const done = await gql(SEED.owner, `mutation($id: ID!) { confirmCustomerPickup(input: { orderId: $id }) { orderStatus paymentStatus fulfilmentMethod } }`, { id: order.id });
    expect(done.confirmCustomerPickup).toMatchObject({ orderStatus: 'PICKED_UP', paymentStatus: 'PAID', fulfilmentMethod: 'PICKUP' });
    const detail = (await gql(SEED.owner, ORDER, { id: order.id })).orqspaceOrder;
    expect(detail.history.map((h: { toStatus: string }) => h.toStatus)).toEqual(['PLACED', 'ACCEPTED', 'PREPARING', 'READY_FOR_FULFILMENT', 'AWAITING_CUSTOMER_PICKUP', 'PICKED_UP']);
    expect(detail.items[0]).toMatchObject({ variantId: SEED.variantSimpleDefault, variantLabel: null, sku: 'BDS-STD' });
  });

  it('handles a return request with restocking and a refund', async () => {
    const order = (await place('orders-e2e-return', [{ listingId: SEED.listingSimple, quantity: 1 }])).data.placeOrder.orders[0];
    await advanceToReady(order.id);
    await gql(SEED.owner, `mutation($id: ID!) { markOrderAwaitingPickup(input: { orderId: $id }) { orderStatus } }`, { id: order.id });
    await gql(SEED.owner, `mutation($i: RecordOrderPaymentInput!) { recordOrderPayment(input: $i) { paymentStatus } }`, {
      i: { orderId: order.id, kind: 'PAYMENT', method: 'ONLINE', amount: '504.00', providerReference: 'UPI-REF-2' },
    });
    await gql(SEED.owner, `mutation($id: ID!) { confirmCustomerPickup(input: { orderId: $id }) { orderStatus } }`, { id: order.id });
    const stockAfterSale = await variantStock(SEED.variantSimpleDefault);

    await gql(SEED.customer, `mutation($i: OrderReasonInput!) { requestOrderReturn(input: $i) { orderStatus } }`, { i: { orderId: order.id, reason: 'Dent on the lid' } });
    const returned = await gql(SEED.owner, `mutation($i: MarkOrderReturnedInput!) { markOrderReturned(input: $i) { orderStatus paymentStatus } }`, {
      i: { orderId: order.id, reason: 'Inspected — resaleable', restock: true },
    });
    expect(returned.markOrderReturned).toMatchObject({ orderStatus: 'RETURNED', paymentStatus: 'REFUND_PENDING' });
    expect(await variantStock(SEED.variantSimpleDefault)).toBe(stockAfterSale + 1);
    const refunded = await gql(SEED.owner, `mutation($i: RecordOrderPaymentInput!) { recordOrderPayment(input: $i) { paymentStatus } }`, {
      i: { orderId: order.id, kind: 'REFUND', method: 'ONLINE', amount: '504.00', providerReference: 'UPI-RF-2' },
    });
    expect(refunded.recordOrderPayment.paymentStatus).toBe('REFUNDED');
  });
});

describe('Order cards: preparation timer, tabs, cancel requests, returns, refunds, invoices', () => {
  const CARD = `query($id: ID!) { orqspaceOrder(orderId: $id) { orderStatus paymentStatus preparationMinutes preparationDueAt cancelRequestStatus cancelRequestReason returnPickupDate scheduledFor items { stockRemaining } invoice { id mimeType } } }`;
  const queueIds = async (queue: string) =>
    (await gql(SEED.owner, `query($f: OrqspaceOrdersFilterInput!) { orqspaceOrders(filter: $f) { items { id } } }`, { f: { orqspaceId: SEED.orqspace, queue } })).orqspaceOrders.items.map(
      (o: { id: string }) => o.id,
    );
  const mutate = (user: string, name: string, type: string, input: Record<string, unknown>, fields = 'orderStatus') =>
    gql(user, `mutation($i: ${type}!) { ${name}(input: $i) { ${fields} } }`, { i: input });

  it('"Accept & Start Prep" starts the timer; "+2 Mins" extends it; tabs and summary follow the order', async () => {
    const order = (await place('orders-e2e-card-prep', [{ listingId: SEED.listingSimple, quantity: 1 }])).data.placeOrder.orders[0];
    expect(await queueIds('NEW')).toContain(order.id);
    expect(await queueIds('UPCOMING')).toContain(order.id);
    const accepted = (await mutate(SEED.owner, 'acceptOrder', 'AcceptOrderInput', { orderId: order.id, startPreparation: true, preparationMinutes: 15 }, 'orderStatus preparationMinutes preparationDueAt')).acceptOrder;
    expect(accepted).toMatchObject({ orderStatus: 'PREPARING', preparationMinutes: 15 });
    const due = new Date(accepted.preparationDueAt).getTime();
    expect(Math.abs(due - (Date.now() + 15 * 60_000))).toBeLessThan(5_000);

    const extended = (await mutate(SEED.owner, 'extendOrderPreparation', 'ExtendPreparationInput', { orderId: order.id }, 'preparationMinutes preparationDueAt')).extendOrderPreparation;
    expect(extended.preparationMinutes).toBe(17);
    expect(new Date(extended.preparationDueAt).getTime() - due).toBe(2 * 60_000);
    expect(await queueIds('PROCESSING')).toContain(order.id);
    expect(await queueIds('UPCOMING')).not.toContain(order.id);

    const summary = (
      await gql(SEED.owner, `query($id: ID!) { orqspaceOrderSummary(orqspaceId: $id) { totalSales ongoingOrders completedOrders tabs { queue count } } }`, { id: SEED.orqspace })
    ).orqspaceOrderSummary;
    expect(Number(summary.totalSales)).toBeGreaterThan(0);
    expect(summary.ongoingOrders).toBeGreaterThanOrEqual(1);
    expect(summary.tabs.map((t: { queue: string }) => t.queue)).toEqual(['ALL', 'NEW', 'UPCOMING', 'PROCESSING', 'ONGOING', 'COMPLETED', 'CANCELLED', 'CANCEL_REQUESTS', 'SUPPORT']);
    expect(summary.tabs.find((t: { queue: string }) => t.queue === 'PROCESSING').count).toBeGreaterThanOrEqual(1);
    expect((await gql(SEED.owner, CARD, { id: order.id })).orqspaceOrder.items[0].stockRemaining).toBeGreaterThan(0);
  });

  it('after acceptance the customer can only request a cancellation; the workspace approves or declines it', async () => {
    const order = (await place('orders-e2e-card-cancel', [{ listingId: SEED.listingSimple, quantity: 2 }])).data.placeOrder.orders[0];
    const stockBefore = await variantStock(SEED.variantSimpleDefault);
    await mutate(SEED.owner, 'acceptOrder', 'AcceptOrderInput', { orderId: order.id });
    const requested = (await mutate(SEED.customer, 'cancelMyOrder', 'OrderReasonInput', { orderId: order.id, reason: 'Ordered by mistake' }, 'orderStatus cancelRequestStatus')).cancelMyOrder;
    expect(requested).toEqual({ orderStatus: 'ACCEPTED', cancelRequestStatus: 'REQUESTED' });
    expect(await queueIds('CANCELLED')).toContain(order.id);
    expect(await queueIds('CANCEL_REQUESTS')).toContain(order.id);
    expect(await queueIds('UPCOMING')).not.toContain(order.id);

    await mutate(SEED.owner, 'declineOrderCancellation', 'OrderReasonInput', { orderId: order.id, reason: 'Already packed and on schedule' });
    expect((await gql(SEED.owner, CARD, { id: order.id })).orqspaceOrder.cancelRequestStatus).toBe('DECLINED');
    expect(await queueIds('UPCOMING')).toContain(order.id);
    expect(await queueIds('CANCEL_REQUESTS')).not.toContain(order.id);

    await mutate(SEED.customer, 'cancelMyOrder', 'OrderReasonInput', { orderId: order.id, reason: 'Really need to cancel' });
    const approved = (await mutate(SEED.owner, 'approveOrderCancellation', 'OrderActionInput', { orderId: order.id }, 'orderStatus cancelRequestStatus cancellationReason')).approveOrderCancellation;
    expect(approved).toEqual({ orderStatus: 'CANCELLED', cancelRequestStatus: 'APPROVED', cancellationReason: 'Customer request: Really need to cancel' });
    expect(await variantStock(SEED.variantSimpleDefault)).toBe(stockBefore + 2);
  });

  it('returns: schedule the pickup, confirm it, then approve the refund (Support tab)', async () => {
    const order = (await place('orders-e2e-card-return', [{ listingId: SEED.listingSimple, quantity: 1 }])).data.placeOrder.orders[0];
    await advanceToReady(order.id);
    await gql(SEED.owner, `mutation($id: ID!) { markOrderAwaitingPickup(input: { orderId: $id }) { orderStatus } }`, { id: order.id });
    await mutate(SEED.owner, 'recordOrderPayment', 'RecordOrderPaymentInput', { orderId: order.id, kind: 'PAYMENT', method: 'ONLINE', amount: '504.00', providerReference: 'UPI-CARD-3' }, 'paymentStatus');
    await gql(SEED.owner, `mutation($id: ID!) { confirmCustomerPickup(input: { orderId: $id }) { orderStatus } }`, { id: order.id });
    expect(await queueIds('COMPLETED')).toContain(order.id);

    await mutate(SEED.customer, 'requestOrderReturn', 'OrderReasonInput', { orderId: order.id, reason: 'Wrong colour' });
    expect(await queueIds('SUPPORT')).toContain(order.id);
    expect(await gqlError(SEED.owner, `mutation($i: ScheduleReturnPickupInput!) { scheduleOrderReturnPickup(input: $i) { orderStatus } }`, { i: { orderId: order.id, pickupDate: '2020-01-01' } })).toMatch(
      /today or a later date/,
    );
    const pickupDate = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    expect((await mutate(SEED.owner, 'scheduleOrderReturnPickup', 'ScheduleReturnPickupInput', { orderId: order.id, pickupDate }, 'returnPickupDate')).scheduleOrderReturnPickup.returnPickupDate).toBe(pickupDate);
    await mutate(SEED.owner, 'markOrderReturned', 'MarkOrderReturnedInput', { orderId: order.id, reason: 'Picked up from the customer', restock: true });
    expect(await queueIds('SUPPORT')).toContain(order.id); // refund still due
    expect((await gql(SEED.owner, `query($id: ID!) { orqspaceOrder(orderId: $id) { amountPaid } }`, { id: order.id })).orqspaceOrder.amountPaid).toBe('504.00');
    const refunded = (await mutate(SEED.owner, 'approveOrderRefund', 'ApproveRefundInput', { orderId: order.id, providerReference: 'UPI-RF-CARD-3' }, 'orderStatus paymentStatus')).approveOrderRefund;
    expect(refunded).toEqual({ orderStatus: 'RETURNED', paymentStatus: 'REFUNDED' });
    expect((await gql(SEED.owner, `query($id: ID!) { orqspaceOrder(orderId: $id) { amountPaid } }`, { id: order.id })).orqspaceOrder.amountPaid).toBe('0.00');
    expect(await queueIds('SUPPORT')).not.toContain(order.id);
    expect(await gqlError(SEED.owner, `mutation($i: ApproveRefundInput!) { approveOrderRefund(input: $i) { orderStatus } }`, { i: { orderId: order.id } })).toMatch(/no refund due/);
  });

  it('returns are only possible within the return window', async () => {
    const order = (await place('orders-e2e-card-window', [{ listingId: SEED.listingSimple, quantity: 1 }])).data.placeOrder.orders[0];
    await advanceToReady(order.id);
    await gql(SEED.owner, `mutation($id: ID!) { markOrderAwaitingPickup(input: { orderId: $id }) { orderStatus } }`, { id: order.id });
    await gql(SEED.owner, `mutation($id: ID!) { confirmCustomerPickup(input: { orderId: $id }) { orderStatus } }`, { id: order.id });
    await sqlQuery(`update orders set completed_at = now() - interval '3 days' where id = $1`, [order.id]);
    expect(await gqlError(SEED.customer, `mutation($i: OrderReasonInput!) { requestOrderReturn(input: $i) { orderStatus } }`, { i: { orderId: order.id, reason: 'Late' } })).toMatch(
      /within 48 hours of delivery/,
    );
  });

  it('scheduled orders must be at least 30 minutes ahead and sort by their time in Upcoming', async () => {
    const soon = new Date(Date.now() + 10 * 60_000).toISOString();
    const bad = await place('orders-e2e-card-sched-bad', [{ listingId: SEED.listingSimple, quantity: 1 }], { scheduledFor: soon });
    expect(bad.errors?.[0].message).toMatch(/at least 30 minutes/);
    const later = new Date(Date.now() + 26 * 3_600_000);
    const o = (await place('orders-e2e-card-sched', [{ listingId: SEED.listingSimple, quantity: 1 }], { scheduledFor: later.toISOString() })).data.placeOrder.orders[0];
    expect(new Date((await gql(SEED.owner, CARD, { id: o.id })).orqspaceOrder.scheduledFor).getTime()).toBe(later.getTime());
    const upcoming = await queueIds('UPCOMING');
    expect(upcoming.indexOf(o.id)).toBe(upcoming.length - 1);
  });

  it('the workspace uploads an invoice that only the customer and the workspace can open', async () => {
    const order = (await place('orders-e2e-card-invoice', [{ listingId: SEED.listingSimple, quantity: 1 }])).data.placeOrder.orders[0];
    const fileId = await uploadFile(SEED.owner, 'ORDER_INVOICE');
    expect(await gqlError(SEED.agentRavi, `mutation { attachOrderInvoice(orderId: "${order.id}", fileId: "${fileId}") { id } }`)).toMatch(/do not manage/);
    await gql(SEED.owner, `mutation { attachOrderInvoice(orderId: "${order.id}", fileId: "${fileId}") { id } }`);
    expect((await gql(SEED.owner, CARD, { id: order.id })).orqspaceOrder.invoice).toEqual({ id: fileId, mimeType: 'image/jpeg' });
    expect((await downloadFile(SEED.customer, fileId)).status).toBe(200);
    expect((await downloadFile(SEED.owner, fileId)).status).toBe(200);
    expect((await downloadFile(SEED.agentRavi, fileId)).status).toBe(403);
  });
});
