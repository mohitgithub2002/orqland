/**
 * Delivery Management end-to-end spec (real PostgreSQL). Covers: KYC registration + duplicate prevention,
 * workspace connections + limits, dispatch + auto/manual assignment + atomic accept, pickup/OTP/COD delivery,
 * COD settlement → PAID, earnings at the snapshotted rate, decline/reassign/cancel, self-delivery, suspension,
 * Run statements/performance, notifications, support tickets & earnings disputes, and the admin portal APIs.
 *
 * Run with `pnpm run test:e2e` (see test/jest-e2e.json).
 */
import { Client } from 'pg';
import { OrderPaymentHoldJob } from '../orders/jobs/order-payment-hold.job';
import { ConnectionsService } from './services/connections/connections.service';
import { StatementsService } from './services/earnings/statements.service';
import {
  advanceToReady,
  appGet,
  call,
  downloadFile,
  gql,
  gqlError,
  licenceImages,
  PLACE_ORDER as PLACE,
  SEED,
  sqlQuery,
  uploadFile,
  uploadRaw,
  startE2eApp,
  stopE2eApp,
  variantStock,
} from '../orders/testing/e2e-harness';

const REGISTER = `mutation($input: RegisterDeliveryAgentInput!) { registerAsDeliveryAgent(input: $input) { agentStatus licenceStatus vehicleStatus vehicleNumberMasked eligibleForAssignments lastFailureReason } }`;
const ORDER = `query($id: ID!) { orqspaceOrder(orderId: $id) { orderStatus paymentStatus fulfilmentMethod allowedNextStatuses history { toStatus actorRole } delivery { id status } } }`;
const TASK = `query($id: ID!) { orqspaceDeliveryTask(taskId: $id) { status needsAttention attentionReason agentUserId ratePerKmSnapshot estimatedDistanceKm codAmount requiresOtp currentOffer { id agentUserId } events { toStatus actorRole } offers { status agentUserId } } }`;
const placeOrder = async (key: string, qty: number, extra: Record<string, unknown> = {}) =>
  (
    await gql(SEED.customer, PLACE, {
      input: {
        idempotencyKey: key,
        items: [{ listingId: SEED.listingVariants, variantId: SEED.variantSmall, quantity: qty }],
        paymentMethod: 'COD',
        requestedFulfilment: 'DELIVERY',
        addressId: SEED.address,
        ...extra,
      },
    })
  ).placeOrder;

beforeAll(startE2eApp);
afterAll(stopE2eApp);

describe('Delivery agent registration & KYC', () => {
  it('verifies Ravi, grants the role and starts him OFFLINE', async () => {
    const { registerAsDeliveryAgent: p } = await gql(SEED.agentRavi, REGISTER, {
      input: { ...(await licenceImages(SEED.agentRavi)), licenceNumber: 'TN09 2015 0001234', dateOfBirth: '1995-04-12', vehicleNumber: 'tn-09-ab-1234', vehicleCategory: 'MOTORCYCLE', consent: true },
    });
    expect(p).toMatchObject({ agentStatus: 'ACTIVE', licenceStatus: 'VERIFIED', vehicleStatus: 'VERIFIED', vehicleNumberMasked: 'TN09••••34', eligibleForAssignments: true });
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    const roles = await client.query('select roles from orq_users where id = $1', [SEED.agentRavi]);
    const agentRow = await client.query('select vehicle_number from delivery_agents where user_id = $1', [SEED.agentRavi]);
    const raw = await client.query(`select count(*) from delivery_agent_profiles where licence_number_enc like '%TN09%'`);
    await client.end();
    expect(roles.rows[0].roles).toContain('DELIVERY_AGENT');
    expect(agentRow.rows[0].vehicle_number).toBe('TN09••••34');
    expect(raw.rows[0].count).toBe('0'); // stored encrypted
  });

  it('rejects the same licence on a different Orq ID', async () => {
    const message = await gqlError(SEED.agentPriya, REGISTER, {
      input: { ...(await licenceImages(SEED.agentPriya)), licenceNumber: 'TN0920150001234', dateOfBirth: '1995-04-12', vehicleNumber: 'TN10CD5678', vehicleCategory: 'SCOOTER', consent: true },
    });
    expect(message).toMatch(/already registered/);
  });

  it('rejects an unverifiable licence without touching the account, and sends category mismatches to review', async () => {
    const failed = await gql(SEED.agentPriya, REGISTER, {
      input: { ...(await licenceImages(SEED.agentPriya)), licenceNumber: 'TN1020180000000', dateOfBirth: '1998-01-01', vehicleNumber: 'TN10CD5678', vehicleCategory: 'SCOOTER', consent: true },
    });
    expect(failed.registerAsDeliveryAgent.agentStatus).toBe('REJECTED');
    const ok = await gql(SEED.agentPriya, REGISTER, {
      input: { ...(await licenceImages(SEED.agentPriya)), licenceNumber: 'TN1020180004321', dateOfBirth: '1998-01-01', vehicleNumber: 'TN10CD5678', vehicleCategory: 'SCOOTER', consent: true },
    });
    expect(ok.registerAsDeliveryAgent.agentStatus).toBe('ACTIVE');
  });

  it('requires consent', async () => {
    const message = await gqlError(SEED.customer, REGISTER, {
      input: { ...(await licenceImages(SEED.customer)), licenceNumber: 'TN1120190001111', dateOfBirth: '1990-01-01', vehicleNumber: 'TN11EF1111', vehicleCategory: 'CAR', consent: false },
    });
    expect(message).toMatch(/Bad Request|Consent/);
  });
});

describe('Workspace ↔ agent connection', () => {
  let connectionId: string;

  it('searches by Orq ID and invites with a per-km rate', async () => {
    const search = await gql(SEED.owner, `query($i: SearchDeliveryAgentInput!) { searchDeliveryAgent(input: $i) { canInvite reason agent { displayName kycValid phone } } }`, {
      i: { orqspaceId: SEED.orqspace, orqUserId: 'orqravi00003' },
    });
    expect(search.searchDeliveryAgent).toMatchObject({ canInvite: true, agent: { displayName: 'Ravi Kumar', kycValid: true, phone: null } });
    const invite = await gql(SEED.owner, `mutation($i: InviteDeliveryAgentInput!) { inviteDeliveryAgent(input: $i) { id status currentRatePerKm } }`, {
      i: { orqspaceId: SEED.orqspace, orqUserId: 'ORQRAVI00003', ratePerKm: '12', message: 'Join us' },
    });
    expect(invite.inviteDeliveryAgent).toMatchObject({ status: 'PENDING', currentRatePerKm: '12.00' });
    connectionId = invite.inviteDeliveryAgent.id;
  });

  it('only the invited agent can accept; acceptance activates and syncs the legacy table', async () => {
    await gqlError(SEED.agentPriya, `mutation($i: RespondToInvitationInput!) { respondToDeliveryInvitation(input: $i) { status } }`, {
      i: { connectionId, accept: true },
    });
    const accepted = await gql(SEED.agentRavi, `mutation($i: RespondToInvitationInput!) { respondToDeliveryInvitation(input: $i) { status agent { phone } } }`, {
      i: { connectionId, accept: true },
    });
    expect(accepted.respondToDeliveryInvitation).toMatchObject({ status: 'ACTIVE', agent: { phone: '+919800000003' } });
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    const legacy = await client.query('select revoked_at from delivery_agent_assignments where delivery_agent_user_id = $1', [SEED.agentRavi]);
    await client.end();
    expect(legacy.rows).toHaveLength(1);
    expect(legacy.rows[0].revoked_at).toBeNull();
  });

  it('enforces the workspace connection limit (set to 1 in this test run)', async () => {
    const search = await gql(SEED.owner, `query($i: SearchDeliveryAgentInput!) { searchDeliveryAgent(input: $i) { canInvite reason } }`, {
      i: { orqspaceId: SEED.orqspace, orqUserId: 'ORQPRIYA0004' },
    });
    expect(search.searchDeliveryAgent.canInvite).toBe(false);
    expect(search.searchDeliveryAgent.reason).toMatch(/already has 1 active/);
  });

  it('blocks other users from managing the workspace', async () => {
    const message = await gqlError(SEED.customer, `query { orqspaceDeliverySettings(orqspaceId: "${SEED.orqspace}") { timezone } }`);
    expect(message).toMatch(/do not manage/);
  });
});

describe('Order → agent delivery → COD → earnings', () => {
  let orderId: string;
  let taskId: string;

  it('places a COD order with snapshots and reserves stock idempotently', async () => {
    const first = await placeOrder('checkout-0001', 2);
    const replay = await placeOrder('checkout-0001', 2);
    expect(first.replayed).toBe(false);
    expect(replay.replayed).toBe(true);
    expect(replay.orders[0].id).toBe(first.orders[0].id);
    expect(first.orders[0]).toMatchObject({ orderStatus: 'PLACED', totalAmount: '420.00', paymentStatus: 'PENDING' });
    expect(await variantStock(SEED.variantSmall)).toBe(8);
    orderId = first.orders[0].id;
  });

  it('can be dispatched once preparation starts (not before), and to agents only with a pickup point', async () => {
    expect(await gqlError(SEED.owner, `mutation($i: DispatchOrderInput!) { dispatchOrder(input: $i) { id } }`, { i: { orderId, mode: 'AGENT', assignmentType: 'AUTO' } })).toMatch(/Start preparing the order/);
    // Agent assignment is allowed from "start preparation", so the agent travels while the order is prepared.
    for (const m of ['acceptOrder', 'startPreparingOrder']) await gql(SEED.owner, `mutation($id: ID!) { ${m}(input: { orderId: $id }) { orderStatus } }`, { id: orderId });
    expect(await gqlError(SEED.owner, `mutation($i: DispatchOrderInput!) { dispatchOrder(input: $i) { id } }`, { i: { orderId, mode: 'AGENT', assignmentType: 'AUTO' } })).toMatch(/pickup location/);
    await gql(SEED.owner, `mutation($i: UpdateDeliverySettingsInput!) { updateOrqspaceDeliverySettings(input: $i) { readyForAgentDispatch } }`, {
      i: { orqspaceId: SEED.orqspace, pickupLat: 13.0827, pickupLng: 80.2707, pickupAddress: { street: 'Anna Salai', city: 'Chennai', pincode: '600002' }, autoAssignEnabled: true },
    });
  });

  it('flags the task when no connected agent is online, and auto-offers once one is', async () => {
    const d = await gql(SEED.owner, `mutation($i: DispatchOrderInput!) { dispatchOrder(input: $i) { id status needsAttention attentionReason estimatedDistanceKm codAmount requiresOtp } }`, {
      i: { orderId, mode: 'AGENT', assignmentType: 'AUTO' },
    });
    taskId = d.dispatchOrder.id;
    expect(d.dispatchOrder).toMatchObject({ status: 'PENDING_ASSIGNMENT', needsAttention: true, codAmount: '420.00', requiresOtp: true });
    expect(Number(d.dispatchOrder.estimatedDistanceKm)).toBeGreaterThan(6);

    await gql(SEED.agentRavi, `mutation { setMyAvailability(availability: ONLINE) { availability } }`);
    await gql(SEED.agentRavi, `mutation($i: LocationPingInput!) { recordMyLocation(input: $i) { accepted } }`, {
      i: { lat: 13.08, lng: 80.27, accuracyM: 10, recordedAt: new Date().toISOString() },
    });
    const re = await gql(SEED.owner, `mutation($i: ReassignTaskInput!) { reassignDeliveryTask(input: $i) { status currentOffer { agentUserId } } }`, {
      i: { taskId, assignmentType: 'AUTO', reason: 'Agent came online' },
    });
    expect(re.reassignDeliveryTask).toMatchObject({ status: 'OFFERED', currentOffer: { agentUserId: SEED.agentRavi } });
  });

  it('hides the customer address from the agent until acceptance; accept is atomic and snapshots the rate', async () => {
    const home = await gql(SEED.agentRavi, `query { runHome { openOffers { offer { id } task { dropoffSnapshot { street } dropoffArea estimatedEarnings } } } }`);
    const offer = home.runHome.openOffers[0];
    expect(offer.task.dropoffSnapshot).toBeNull();
    expect(offer.task.dropoffArea).toBe('Chennai 600017');
    expect(Number(offer.task.estimatedEarnings)).toBeGreaterThan(70);

    const results = await Promise.all([
      call(SEED.agentRavi, `mutation($i: OfferResponseInput!) { acceptDeliveryOffer(input: $i) { status } }`, { i: { offerId: offer.offer.id } }),
      call(SEED.agentRavi, `mutation($i: OfferResponseInput!) { acceptDeliveryOffer(input: $i) { status } }`, { i: { offerId: offer.offer.id } }),
    ]);
    expect(results.filter((r) => r.data?.acceptDeliveryOffer?.status === 'ACCEPTED')).toHaveLength(1);

    // A rate change after acceptance must not affect this delivery.
    const conn = await gql(SEED.owner, `query { orqspaceDeliveryAgents(filter: { orqspaceId: "${SEED.orqspace}" }) { id } }`);
    await gql(SEED.owner, `mutation($i: UpdateConnectionRateInput!) { updateDeliveryAgentRate(input: $i) { currentRatePerKm } }`, {
      i: { connectionId: conn.orqspaceDeliveryAgents[0].id, ratePerKm: '20', reason: 'Fuel prices' },
    });
    const task = (await gql(SEED.owner, TASK, { id: taskId })).orqspaceDeliveryTask;
    expect(task).toMatchObject({ status: 'ACCEPTED', agentUserId: SEED.agentRavi, ratePerKmSnapshot: '12.00' });
  });

  it('runs pickup → transit → delivery with OTP and COD; order follows the task', async () => {
    const step = (m: string, at: Record<string, number> = {}) => gql(SEED.agentRavi, `mutation($i: TaskActionInput!) { ${m}(input: $i) { status } }`, { i: { taskId, ...at } });
    const PICKUP_SPOT = { lat: 13.0828, lng: 80.2708, accuracyM: 12 }; // ~15 m from the pickup point
    await step('markArrivingAtPickup');
    // Geofence: pickup can only be confirmed within 50 m of the pickup point, with a location.
    expect(await gqlError(SEED.agentRavi, `mutation($i: TaskActionInput!) { confirmDeliveryPickup(input: $i) { status } }`, { i: { taskId } })).toMatch(/Turn on location/);
    expect(
      await gqlError(SEED.agentRavi, `mutation($i: TaskActionInput!) { confirmDeliveryPickup(input: $i) { status } }`, { i: { taskId, lat: 13.0866, lng: 80.2707, accuracyM: 10 } }),
    ).toMatch(/^You are 4\d\d m from the pickup point\. Move within 50 m to confirm pickup$/);
    // At the pickup point but the order is still being prepared.
    expect(await gqlError(SEED.agentRavi, `mutation($i: TaskActionInput!) { confirmDeliveryPickup(input: $i) { status } }`, { i: { taskId, ...PICKUP_SPOT } })).toMatch(/still preparing/);
    await gql(SEED.owner, `mutation($id: ID!) { markOrderReady(input: { orderId: $id }) { orderStatus } }`, { id: orderId });
    const ready = (await gql(SEED.agentRavi, `query { myDeliveryNotifications { items { type } } }`)).myDeliveryNotifications.items;
    expect(ready.map((n: { type: string }) => n.type)).toContain('ORDER_READY_FOR_PICKUP');
    const photoBeforePickup = await uploadFile(SEED.agentRavi, 'PROOF_OF_DELIVERY');
    await step('confirmDeliveryPickup', PICKUP_SPOT);
    expect((await gql(SEED.owner, ORDER, { id: orderId })).orqspaceOrder.orderStatus).toBe('OUT_FOR_DELIVERY');
    await step('startDeliveryTransit');

    const wrong = await gqlError(SEED.agentRavi, `mutation($i: CompleteDeliveryInput!) { completeDelivery(input: $i) { status } }`, {
      i: { taskId, otp: '0000', codCollectedAmount: '420', codMethod: 'CASH' },
    });
    expect(wrong).toMatch(/incorrect|code from the customer/);
    const otp = (await gql(SEED.customer, `query($id: ID!) { myOrder(orderId: $id) { deliveryOtp } }`, { id: orderId })).myOrder.deliveryOtp;
    expect(otp).toMatch(/^\d{4}$/);
    expect(await gqlError(SEED.agentRavi, `mutation($i: CompleteDeliveryInput!) { completeDelivery(input: $i) { status } }`, { i: { taskId, otp } })).toMatch(/cash collected/);
    // Proof of delivery is photo-only and must be captured during this delivery — an older picture is refused.
    expect(
      await gqlError(SEED.agentRavi, `mutation($i: CompleteDeliveryInput!) { completeDelivery(input: $i) { status } }`, {
        i: { taskId, otp, codCollectedAmount: '420', codMethod: 'CASH', photoFileId: photoBeforePickup },
      }),
    ).toMatch(/Take a new photo at the door/);
    const done = await gql(SEED.agentRavi, `mutation($i: CompleteDeliveryInput!) { completeDelivery(input: $i) { status } }`, {
      i: { taskId, otp, codCollectedAmount: '420', codMethod: 'CASH', recipientName: 'Maria', photoFileId: await uploadFile(SEED.agentRavi, 'PROOF_OF_DELIVERY') },
    });
    expect(done.completeDelivery.status).toBe('DELIVERED');

    const order = (await gql(SEED.owner, ORDER, { id: orderId })).orqspaceOrder;
    expect(order).toMatchObject({ orderStatus: 'DELIVERED', paymentStatus: 'PENDING', fulfilmentMethod: 'AGENT_DELIVERY' });
    expect(order.history.map((h: { toStatus: string }) => h.toStatus)).toEqual(['PLACED', 'ACCEPTED', 'PREPARING', 'READY_FOR_FULFILMENT', 'OUT_FOR_DELIVERY', 'DELIVERED']);
  });

  it('marks the order PAID only after the COD handover is settled', async () => {
    const records = await gql(SEED.owner, `query { orqspaceCodRecords(filter: { orqspaceId: "${SEED.orqspace}" }) { id status collectedAmount agentName } }`);
    expect(records.orqspaceCodRecords[0]).toMatchObject({ status: 'COLLECTED', collectedAmount: '420.00', agentName: 'Ravi Kumar' });
    const id = records.orqspaceCodRecords[0].id;
    expect(await gqlError(SEED.owner, `mutation($i: RecordCodSettlementInput!) { recordCodSettlement(input: $i) { status } }`, { i: { codRecordId: id, amount: '500', method: 'CASH' } })).toMatch(/exceeds/);
    const partial = await gql(SEED.owner, `mutation($i: RecordCodSettlementInput!) { recordCodSettlement(input: $i) { status outstandingAmount } }`, { i: { codRecordId: id, amount: '400', method: 'CASH' } });
    expect(partial.recordCodSettlement).toMatchObject({ status: 'PARTIALLY_SETTLED', outstandingAmount: '20.00' });
    expect((await gql(SEED.owner, ORDER, { id: orderId })).orqspaceOrder.paymentStatus).toBe('PENDING');
    const full = await gql(SEED.owner, `mutation($i: RecordCodSettlementInput!) { recordCodSettlement(input: $i) { status } }`, { i: { codRecordId: id, amount: '20', method: 'UPI_TO_SELLER' } });
    expect(full.recordCodSettlement.status).toBe('SETTLED');
    expect((await gql(SEED.owner, ORDER, { id: orderId })).orqspaceOrder.paymentStatus).toBe('PAID');
  });

  it('creates one earning at the snapshotted rate; the workspace approves it', async () => {
    const list = await gql(SEED.owner, `query { orqspaceDeliveryEarnings(filter: { orqspaceId: "${SEED.orqspace}" }) { id status ratePerKm approvedBillableKm baseAmount } }`);
    expect(list.orqspaceDeliveryEarnings).toHaveLength(1);
    const e = list.orqspaceDeliveryEarnings[0];
    expect(e).toMatchObject({ status: 'PENDING_APPROVAL', ratePerKm: '12.00' });
    expect(Number(e.baseAmount)).toBeCloseTo(Number(e.approvedBillableKm) * 12, 1);
    expect(await gqlError(SEED.owner, `mutation($i: ApproveEarningInput!) { approveDeliveryEarning(input: $i) { status } }`, { i: { earningId: e.id, approvedBillableKm: '7' } })).toMatch(/reason/);
    const approved = await gql(SEED.owner, `mutation($i: ApproveEarningInput!) { approveDeliveryEarning(input: $i) { status baseAmount distanceSource } }`, {
      i: { earningId: e.id, approvedBillableKm: '7.5', reason: 'Verified route' },
    });
    expect(approved.approveDeliveryEarning).toMatchObject({ status: 'APPROVED', baseAmount: '90.00', distanceSource: 'WORKSPACE_APPROVED' });
    const month = new Date().toISOString().slice(0, 7);
    const report = await gql(SEED.owner, `query($i: CostReportInput!) { orqspaceDeliveryCostReport(input: $i) { deliveries approvedAmount byAgent { agentName amount } } }`, {
      i: { orqspaceId: SEED.orqspace, periodMonth: month },
    });
    expect(report.orqspaceDeliveryCostReport).toMatchObject({ deliveries: 1, approvedAmount: '90.00', byAgent: [{ agentName: 'Ravi Kumar', amount: '90.00' }] });
    const run = await gql(SEED.agentRavi, `query { myDeliveryEarnings { month { deliveries approved } } runHome { profile { availability } } }`);
    expect(run.myDeliveryEarnings.month).toMatchObject({ deliveries: 1, approved: '90.00' });
    expect(run.runHome.profile.availability).toBe('ONLINE'); // BUSY → ONLINE after completion
  });
});

describe('Integrity rules', () => {
  it('releases stock on rejection and on cancellation before pickup (cancelling the open offer)', async () => {
    const before = await variantStock(SEED.variantSmall);
    const rejected = await placeOrder('checkout-reject', 1);
    await gql(SEED.owner, `mutation($i: OrderReasonInput!) { rejectOrder(input: $i) { orderStatus } }`, { i: { orderId: rejected.orders[0].id, reason: 'Closed today' } });
    expect(await variantStock(SEED.variantSmall)).toBe(before);

    const order = await placeOrder('checkout-cancel', 1);
    const id = order.orders[0].id;
    await advanceToReady(id);
    const d = await gql(SEED.owner, `mutation($i: DispatchOrderInput!) { dispatchOrder(input: $i) { id status } }`, {
      i: { orderId: id, mode: 'AGENT', assignmentType: 'MANUAL', agentUserId: SEED.agentRavi },
    });
    expect(d.dispatchOrder.status).toBe('OFFERED');
    await gql(SEED.owner, `mutation($i: OrderReasonInput!) { cancelOrderByWorkspace(input: $i) { orderStatus } }`, { i: { orderId: id, reason: 'Customer called to cancel' } });
    const task = (await gql(SEED.owner, TASK, { id: d.dispatchOrder.id })).orqspaceDeliveryTask;
    expect(task.status).toBe('CANCELLED');
    expect(task.offers[0].status).toBe('WITHDRAWN');
    expect(await variantStock(SEED.variantSmall)).toBe(before);
  });

  it('a manual offer that is declined waits for the workspace', async () => {
    const order = await gql(SEED.customer, PLACE, {
      input: { idempotencyKey: 'checkout-decline', items: [{ listingId: SEED.listingSimple, quantity: 1 }], paymentMethod: 'ONLINE', requestedFulfilment: 'DELIVERY', addressId: SEED.address },
    });
    const id = order.placeOrder.orders[0].id;
    await advanceToReady(id);
    const d = await gql(SEED.owner, `mutation($i: DispatchOrderInput!) { dispatchOrder(input: $i) { id currentOffer { id } } }`, {
      i: { orderId: id, mode: 'AGENT', assignmentType: 'MANUAL', agentUserId: SEED.agentRavi },
    });
    await gql(SEED.agentRavi, `mutation($i: OfferResponseInput!) { declineDeliveryOffer(input: $i) }`, { i: { offerId: d.dispatchOrder.currentOffer.id, reason: 'Too far' } });
    const task = (await gql(SEED.owner, TASK, { id: d.dispatchOrder.id })).orqspaceDeliveryTask;
    expect(task).toMatchObject({ status: 'PENDING_ASSIGNMENT', needsAttention: true, attentionReason: 'The agent declined the delivery' });
    // The workspace cannot complete an agent task without the audited override.
    expect(await gqlError(SEED.owner, `mutation($i: SelfDeliveryUpdateInput!) { updateSelfDelivery(input: $i) { status } }`, { i: { taskId: d.dispatchOrder.id, step: 'DELIVERED' } })).toMatch(/updated by the agent/);
    await gql(SEED.owner, `mutation($i: TaskReasonInput!) { cancelDeliveryTask(input: $i) { status } }`, { i: { taskId: d.dispatchOrder.id, reason: 'Will deliver ourselves' } });

    // Self-delivery of the same order, with a failed attempt and a re-dispatch.
    const self = await gql(SEED.owner, `mutation($i: DispatchOrderInput!) { dispatchOrder(input: $i) { id mode } }`, { i: { orderId: id, mode: 'SELF', selfStaffName: 'Arun' } });
    const upd = (step: string, extra: Record<string, unknown> = {}) =>
      gql(SEED.owner, `mutation($i: SelfDeliveryUpdateInput!) { updateSelfDelivery(input: $i) { status } }`, { i: { taskId: self.dispatchOrder.id, step, ...extra } });
    await upd('PICKED_UP');
    await upd('FAILED', { reason: 'Customer not reachable' });
    expect((await gql(SEED.owner, ORDER, { id })).orqspaceOrder.orderStatus).toBe('DELIVERY_FAILED');
    await upd('RETURNED_TO_ORIGIN', { reason: 'Back at shop' });
    await gql(SEED.owner, `mutation($id: ID!) { reopenOrderForFulfilment(input: { orderId: $id }) { orderStatus } }`, { id });
    const second = await gql(SEED.owner, `mutation($i: DispatchOrderInput!) { dispatchOrder(input: $i) { id attemptNo } }`, { i: { orderId: id, mode: 'SELF' } });
    expect(second.dispatchOrder.attemptNo).toBe(3);
  });

  it('refuses to disconnect an agent with an active delivery, and suspension blocks going online', async () => {
    const order = await placeOrder('checkout-active-disc', 1);
    await advanceToReady(order.orders[0].id);
    const d = await gql(SEED.owner, `mutation($i: DispatchOrderInput!) { dispatchOrder(input: $i) { currentOffer { id } } }`, {
      i: { orderId: order.orders[0].id, mode: 'AGENT', assignmentType: 'MANUAL', agentUserId: SEED.agentRavi },
    });
    await gql(SEED.agentRavi, `mutation($i: OfferResponseInput!) { acceptDeliveryOffer(input: $i) { status } }`, { i: { offerId: d.dispatchOrder.currentOffer.id } });
    const conn = await gql(SEED.owner, `query { orqspaceDeliveryAgents(filter: { orqspaceId: "${SEED.orqspace}" }) { id } }`);
    expect(await gqlError(SEED.owner, `mutation($i: ConnectionReasonInput!) { disconnectDeliveryAgent(input: $i) { status } }`, { i: { connectionId: conn.orqspaceDeliveryAgents[0].id, reason: 'x' } })).toMatch(/active deliver/);

    expect(await gqlError(SEED.owner, `mutation($i: AdminAgentActionInput!) { suspendDeliveryAgent(input: $i) { agentStatus } }`, { i: { userId: SEED.agentPriya, reason: 'x' } })).toMatch(/Insufficient role/);
    await gql(SEED.admin, `mutation($i: AdminAgentActionInput!) { suspendDeliveryAgent(input: $i) { agentStatus } }`, { i: { userId: SEED.agentPriya, reason: 'Fraud review' } });
    expect(await gqlError(SEED.agentPriya, `mutation { setMyAvailability(availability: ONLINE) { availability } }`)).toMatch(/SUSPENDED/);
  });
});

describe('Run screens 4–6, customer checkout data and admin portal APIs', () => {
  const month = new Date().toISOString().slice(0, 7);

  it('lists the customer checkout addresses', async () => {
    const data = await gql(SEED.customer, `query { myCheckoutAddresses { id city isPrimary } }`);
    expect(data.myCheckoutAddresses).toEqual([{ id: SEED.address, city: 'Chennai', isPrimary: true }]);
  });

  it('builds the monthly statement (with CSV), performance funnel and trend', async () => {
    const data = await gql(
      SEED.agentRavi,
      `query($p: String!) {
        myDeliveryStatement(periodMonth: $p) { periodStart periodEnd grandTotal totals { deliveries } byWorkspace { orqspaceName deliveries amount } lines { taskNumber finalAmount } csv }
        myDeliveryPerformance(periodMonth: $p) { offered accepted declined completed averageEarningPerDelivery }
        myDeliveryEarningsTrend(months: 3) { periodMonth deliveries amount }
      }`,
      { p: month },
    );
    const s = data.myDeliveryStatement;
    expect(s.totals.deliveries).toBe(1);
    expect(s.byWorkspace).toEqual([{ orqspaceName: 'Sj softwares', deliveries: 1, amount: '90.00' }]);
    expect(s.csv.split('\n')[0]).toMatch(/^Delivered,Delivery,Order,Workspace/);
    expect(s.csv.split('\n')).toHaveLength(2);
    expect(data.myDeliveryPerformance).toMatchObject({ completed: 1, declined: 1 });
    expect(data.myDeliveryPerformance.offered).toBeGreaterThanOrEqual(3);
    expect(data.myDeliveryEarningsTrend).toHaveLength(3);
    expect(data.myDeliveryEarningsTrend[2]).toMatchObject({ deliveries: 1, amount: '90.00' });
  });

  it('persists notifications with read/unread state', async () => {
    const before = await gql(SEED.agentRavi, `query { myDeliveryNotifications { unreadCount items { type title readAt } } }`);
    expect(before.myDeliveryNotifications.unreadCount).toBeGreaterThan(0);
    expect(before.myDeliveryNotifications.items.map((n: { type: string }) => n.type)).toContain('KYC_APPROVED');
    const remaining = await gql(SEED.agentRavi, `mutation { markDeliveryNotificationsRead }`);
    expect(remaining.markDeliveryNotificationsRead).toBe(0);
  });

  it('raises an earnings dispute that puts the earning under review, and support can reply and resolve', async () => {
    const earning = (await gql(SEED.owner, `query { orqspaceDeliveryEarnings(filter: { orqspaceId: "${SEED.orqspace}" }) { id status } }`)).orqspaceDeliveryEarnings[0];
    expect(earning.status).toBe('APPROVED');
    const created = await gql(SEED.agentRavi, `mutation($i: CreateSupportTicketInput!) { createSupportTicket(input: $i) { id ticketNumber status priority assignedTeam } }`, {
      i: { category: 'EARNINGS_PAYMENT', subject: 'Km too low', description: 'I rode 9 km, approved 7.5', relatedEarningId: earning.id },
    });
    const ticket = created.createSupportTicket;
    expect(ticket).toMatchObject({ status: 'OPEN', priority: 'NORMAL', assignedTeam: 'FINANCE' });
    const after = (await gql(SEED.owner, `query { orqspaceDeliveryEarnings(filter: { orqspaceId: "${SEED.orqspace}" }) { status } }`)).orqspaceDeliveryEarnings[0];
    expect(after.status).toBe('UNDER_REVIEW');

    expect(await gqlError(SEED.agentRavi, `query { platformSupportTickets(filter: {}) { total } }`)).toMatch(/Insufficient role/);
    const queue = await gql(SEED.admin, `query { platformSupportTickets(filter: { statuses: [OPEN] }) { total items { ticketNumber raisedByName } } }`);
    expect(queue.platformSupportTickets.items[0]).toMatchObject({ ticketNumber: ticket.ticketNumber, raisedByName: 'Ravi Kumar' });
    await gql(SEED.admin, `mutation($i: ReplySupportTicketInput!) { replyToSupportTicketAsSupport(input: $i) { id } }`, { i: { ticketId: ticket.id, body: 'Checking GPS trace', internal: true } });
    await gql(SEED.admin, `mutation($i: ReplySupportTicketInput!) { replyToSupportTicketAsSupport(input: $i) { id } }`, { i: { ticketId: ticket.id, body: 'We asked the workspace to re-approve.' } });
    const mine = await gql(SEED.agentRavi, `query($id: ID!) { mySupportTicket(ticketId: $id) { status messages { body authorName } } }`, { id: ticket.id });
    expect(mine.mySupportTicket.status).toBe('WAITING_ON_AGENT');
    expect(mine.mySupportTicket.messages).toEqual([{ body: 'We asked the workspace to re-approve.', authorName: 'Orqland Support' }]);
    const resolved = await gql(SEED.admin, `mutation($i: UpdateSupportTicketInput!) { updateSupportTicket(input: $i) { status resolvedAt } }`, { i: { ticketId: ticket.id, status: 'RESOLVED' } });
    expect(resolved.updateSupportTicket.resolvedAt).not.toBeNull();
    // the disputed earning can be re-approved by the workspace
    const re = await gql(SEED.owner, `mutation($i: ApproveEarningInput!) { approveDeliveryEarning(input: $i) { status baseAmount } }`, {
      i: { earningId: earning.id, approvedBillableKm: '9', reason: 'Dispute accepted' },
    });
    expect(re.approveDeliveryEarning).toMatchObject({ status: 'APPROVED', baseAmount: '108.00' });
  });

  it('emergency tickets are urgent; tickets cannot reference someone else’s delivery', async () => {
    const t = await gql(SEED.agentRavi, `mutation($i: CreateSupportTicketInput!) { createSupportTicket(input: $i) { priority assignedTeam } }`, {
      i: { category: 'EMERGENCY', subject: 'Accident', description: 'Minor fall near Teynampet' },
    });
    expect(t.createSupportTicket).toMatchObject({ priority: 'URGENT', assignedTeam: 'SAFETY' });
    const someoneElses = '00000000-0000-4000-8000-00000000ffff';
    expect(await gqlError(SEED.agentRavi, `mutation($i: CreateSupportTicketInput!) { createSupportTicket(input: $i) { id } }`, { i: { category: 'DELIVERY', subject: 'x', description: 'y', relatedTaskId: someoneElses } })).toMatch(/not yours/);
  });

  it('admin portal: review queue → approve a name-mismatch application; directory lists agents', async () => {
    const applied = await gql(SEED.customer, REGISTER, {
      input: { ...(await licenceImages(SEED.customer)), licenceNumber: 'TN0720190008888', dateOfBirth: '1992-06-01', vehicleNumber: 'TN07XY4321', vehicleCategory: 'SCOOTER', consent: true },
    });
    expect(applied.registerAsDeliveryAgent.agentStatus).toBe('MANUAL_REVIEW');
    const queue = await gql(SEED.admin, `query { platformDeliveryAgents(filter: { statuses: [MANUAL_REVIEW] }) { total items { profile { userId displayName licenceStatus verifications { checkType status mismatchFields } } } } }`);
    expect(queue.platformDeliveryAgents.total).toBe(1);
    expect(queue.platformDeliveryAgents.items[0].profile.verifications.find((v: { checkType: string }) => v.checkType === 'DRIVING_LICENCE').mismatchFields).toEqual(['holder_name']);
    const decided = await gql(SEED.admin, `mutation($i: AdminReviewDecisionInput!) { decideDeliveryAgentReview(input: $i) { agentStatus } }`, {
      i: { userId: SEED.customer, approve: true, reason: 'Name verified against Aadhaar offline' },
    });
    expect(decided.decideDeliveryAgentReview.agentStatus).toBe('ACTIVE');
    const all = await gql(SEED.admin, `query { platformDeliveryAgents(filter: {}) { total items { profile { orqUserId agentStatus } completedDeliveries } } }`);
    expect(all.platformDeliveryAgents.total).toBe(3);
    expect(all.platformDeliveryAgents.items.find((a: { profile: { orqUserId: string } }) => a.profile.orqUserId === 'ORQRAVI00003').completedDeliveries).toBe(1);
  });
});

describe('Guide gap closures: documents, preferences, disconnect requests, statements, operations, payment hold', () => {
  it('stores licence images privately: type-checked upload, owner and KYC reviewers only', async () => {
    const notAnImage = await uploadRaw(SEED.agentRavi, 'LICENCE_FRONT', Buffer.from('MZ fake executable'), 'image/jpeg');
    expect(notAnImage.status).toBe(400);
    expect(String(notAnImage.body.message)).toMatch(/Upload a JPEG, PNG, WEBP file/);
    expect((await uploadRaw(SEED.agentRavi, 'PASSPORT')).status).toBe(400);

    const profile = (await gql(SEED.agentRavi, `query { myDeliveryAgentProfile { licenceFrontFileId licenceBackFileId } }`)).myDeliveryAgentProfile;
    expect(profile.licenceFrontFileId).toBeTruthy();
    expect(profile.licenceBackFileId).toBeTruthy();
    const [legacy] = await sqlQuery<{ driving_license_image_url: string }>('select driving_license_image_url from delivery_agents where user_id = $1', [SEED.agentRavi]);
    expect(legacy.driving_license_image_url).toBe(`/delivery/files/${profile.licenceFrontFileId}`);

    const own = await downloadFile(SEED.agentRavi, profile.licenceFrontFileId);
    expect(own).toMatchObject({ status: 200, type: 'image/jpeg' });
    expect(own.bytes.subarray(0, 3).toString('hex')).toBe('ffd8ff');
    expect((await downloadFile(SEED.owner, profile.licenceFrontFileId)).status).toBe(403); // workspace admins never see KYC documents
    expect((await downloadFile(SEED.admin, profile.licenceFrontFileId)).status).toBe(200);
    const [audit] = await sqlQuery<{ action: string; actor_user_id: string }>(`select action, actor_user_id from delivery_audit_logs where entity_type = 'delivery_file' and entity_id = $1`, [profile.licenceFrontFileId]);
    expect(audit).toEqual({ action: 'kyc_document.viewed', actor_user_id: SEED.admin });
    const [onDisk] = await sqlQuery<{ storage_key: string }>('select storage_key from delivery_files where id = $1', [profile.licenceFrontFileId]);
    expect(onDisk.storage_key).toMatch(/^licence_front\//);
  });

  it('requires licence images at registration and refuses another user’s upload', async () => {
    const missing = await gqlError(SEED.owner, REGISTER, {
      input: { licenceNumber: 'TN0120200009999', dateOfBirth: '1990-01-01', vehicleNumber: 'TN01AA0001', vehicleCategory: 'SCOOTER', consent: true },
    });
    expect(missing).toMatch(/licence(Front|Back)FileId/);
    const someoneElses = await uploadFile(SEED.agentRavi, 'LICENCE_FRONT');
    const back = await uploadFile(SEED.owner, 'LICENCE_BACK');
    const stolen = await gqlError(SEED.owner, REGISTER, {
      input: { licenceFrontFileId: someoneElses, licenceBackFileId: back, licenceNumber: 'TN0120200009999', dateOfBirth: '1990-01-01', vehicleNumber: 'TN01AA0001', vehicleCategory: 'SCOOTER', consent: true },
    });
    expect(stolen).toMatch(/licence front image again/);
  });

  it('notification preferences: optional types can be muted, safety alerts cannot', async () => {
    const prefs = (await gql(SEED.agentRavi, `query { myNotificationPreferences { type group locked enabled } }`)).myNotificationPreferences;
    expect(prefs.find((p: { type: string }) => p.type === 'DELIVERY_OFFERED')).toMatchObject({ group: 'OFFERS', locked: true, enabled: true });
    expect(await gqlError(SEED.agentRavi, `mutation { setNotificationPreference(type: "DELIVERY_OFFERED", enabled: false) { type } }`)).toMatch(/required for safety/);
    const updated = (await gql(SEED.agentRavi, `mutation { setNotificationPreference(type: "EARNING_PAID", enabled: false) { type enabled } }`)).setNotificationPreference;
    expect(updated.find((p: { type: string }) => p.type === 'EARNING_PAID').enabled).toBe(false);
  });

  it('operations overview reports queue, timings, agent workload, COD and a 14-day trend', async () => {
    const ops = (
      await gql(
        SEED.owner,
        `query($id: ID!) { orqspaceDeliveryOperations(orqspaceId: $id) {
          queue { newOrders readyForFulfilment } deliveries { toPickup deliveredToday }
          timings { windowDays medianDeliverMinutes deliverySlaPercent successRatePercent slaTargets { deliverMinutes } }
          agents { connected connectionLimit workload { orqUserId activeTasks ratePerKm locationStale } }
          cod { outstanding discrepancies } breaches { kind stage } trend { day delivered failed } } }`,
        { id: SEED.orqspace },
      )
    ).orqspaceDeliveryOperations;
    expect(ops.deliveries.deliveredToday).toBeGreaterThanOrEqual(1);
    expect(ops.deliveries.toPickup).toBe(1); // the accepted delivery from the disconnect test
    expect(ops.timings).toMatchObject({ windowDays: 7, slaTargets: { deliverMinutes: 45 } });
    expect(ops.timings.deliverySlaPercent).toBe(100);
    expect(ops.agents).toMatchObject({ connected: 1, connectionLimit: 1 });
    expect(ops.agents.workload[0]).toMatchObject({ orqUserId: 'ORQRAVI00003', activeTasks: 1, ratePerKm: '20.00' });
    expect(ops.trend).toHaveLength(14);
    expect(ops.trend[13].delivered).toBeGreaterThanOrEqual(1);
    expect(await gqlError(SEED.customer, `query { orqspaceDeliveryOperations(orqspaceId: "${SEED.orqspace}") { generatedAt } }`)).toMatch(/do not manage/);
  });

  it('keeps a DRAFT monthly statement and freezes it as FINAL at month end', async () => {
    const month = new Date().toISOString().slice(0, 7);
    const mine = (await gql(SEED.agentRavi, `query { myDeliveryStatements { orqspaceName periodMonth periodEnd status deliveries finalAmount outstandingAmount } }`)).myDeliveryStatements;
    const [earning] = (await gql(SEED.owner, `query { orqspaceDeliveryEarnings(filter: { orqspaceId: "${SEED.orqspace}" }) { finalAmount } }`)).orqspaceDeliveryEarnings;
    expect(mine[0]).toMatchObject({ periodMonth: `${month}-01`, status: 'DRAFT', deliveries: 1, finalAmount: earning.finalAmount });
    const ws = (await gql(SEED.owner, `query($id: ID!, $m: String!) { orqspaceDeliveryStatements(orqspaceId: $id, periodMonth: $m) { agentOrqUserId status } }`, { id: SEED.orqspace, m: month })).orqspaceDeliveryStatements;
    expect(ws).toEqual([{ agentOrqUserId: 'ORQRAVI00003', status: 'DRAFT' }]);

    const nextMonth = new Date();
    nextMonth.setUTCDate(15);
    nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
    expect(await appGet(StatementsService).closeEndedMonths(nextMonth)).toBe(1);
    expect(await appGet(StatementsService).closeEndedMonths(nextMonth)).toBe(0); // idempotent
    const statement = (await gql(SEED.agentRavi, `query($m: String!) { myDeliveryStatement(periodMonth: $m) { status } }`, { m: month })).myDeliveryStatement;
    expect(statement.status).toBe('FINAL');
    const notes = (await gql(SEED.agentRavi, `query { myDeliveryNotifications { items { type } } }`)).myDeliveryNotifications.items;
    expect(notes.map((n: { type: string }) => n.type)).toContain('STATEMENT_READY');
  });

  it('a disconnect request stops new offers and completes once active deliveries reach zero', async () => {
    const CONN = `query { orqspaceDeliveryAgents(filter: { orqspaceId: "${SEED.orqspace}" }) { id status disconnectRequestStatus disconnectRequestedByRole activeTaskCount } }`;
    const conn = (await gql(SEED.owner, CONN)).orqspaceDeliveryAgents[0];
    expect(conn.activeTaskCount).toBe(1);

    const requested = await gql(SEED.agentRavi, `mutation($i: ConnectionReasonInput!) { disconnectFromWorkspace(input: $i) { status disconnectRequestStatus } }`, {
      i: { connectionId: conn.id, reason: 'Moving to another city', afterActiveDeliveries: true },
    });
    expect(requested.disconnectFromWorkspace).toEqual({ status: 'ACTIVE', disconnectRequestStatus: 'REQUESTED' });
    expect(await gqlError(SEED.owner, `mutation { withdrawDeliveryAgentDisconnectRequest(connectionId: "${conn.id}") { id } }`)).toMatch(/Only the side that requested/);

    const order = await placeOrder('checkout-after-request', 1);
    await advanceToReady(order.orders[0].id);
    expect(
      await gqlError(SEED.owner, `mutation($i: DispatchOrderInput!) { dispatchOrder(input: $i) { id } }`, {
        i: { orderId: order.orders[0].id, mode: 'AGENT', assignmentType: 'MANUAL', agentUserId: SEED.agentRavi },
      }),
    ).toMatch(/disconnection is pending/);

    // Nothing happens while the delivery is active …
    expect(await appGet(ConnectionsService).finalizeRequestedDisconnects()).toBe(0);
    // … and the connection closes once it is cancelled (or completed).
    const live = (await gql(SEED.owner, `query { orqspaceLiveDeliveries(orqspaceId: "${SEED.orqspace}") { id status agentUserId } }`)).orqspaceLiveDeliveries;
    const active = live.find((t: { agentUserId: string | null; status: string }) => t.agentUserId === SEED.agentRavi && t.status === 'ACCEPTED');
    await gql(SEED.owner, `mutation($i: TaskReasonInput!) { cancelDeliveryTask(input: $i) { status } }`, { i: { taskId: active.id, reason: 'Agent leaving' } });
    expect(await appGet(ConnectionsService).finalizeRequestedDisconnects()).toBe(1);
    const history = (await gql(SEED.owner, `query { orqspaceDeliveryAgents(filter: { orqspaceId: "${SEED.orqspace}", statuses: [DISCONNECTED] }) { status disconnectRequestStatus disconnectRequestedByRole } }`)).orqspaceDeliveryAgents;
    expect(history[0]).toEqual({ status: 'DISCONNECTED', disconnectRequestStatus: 'COMPLETED', disconnectRequestedByRole: 'AGENT' });
  });

  it('cancels unpaid ONLINE orders when the payment hold expires and releases their stock', async () => {
    const before = await variantStock(SEED.variantSmall);
    const placed = await placeOrder('checkout-unpaid-online', 2, { paymentMethod: 'ONLINE' });
    const id = placed.orders[0].id;
    expect(await variantStock(SEED.variantSmall)).toBe(before - 2);
    const [hold] = await sqlQuery<{ expires_at: Date | null }>('select expires_at from order_inventory_reservations where order_id = $1', [id]);
    expect(hold.expires_at).not.toBeNull();

    expect(await appGet(OrderPaymentHoldJob).run()).toBe(0); // still inside the hold window
    await sqlQuery(`update orders set created_at = now() - interval '2 hours' where id = $1`, [id]);
    expect(await appGet(OrderPaymentHoldJob).run()).toBe(1);
    const order = (await gql(SEED.owner, ORDER, { id })).orqspaceOrder;
    expect(order.orderStatus).toBe('CANCELLED');
    expect(order.history.at(-1)).toEqual({ toStatus: 'CANCELLED', actorRole: 'SYSTEM' });
    expect(await variantStock(SEED.variantSmall)).toBe(before);
  });
});
