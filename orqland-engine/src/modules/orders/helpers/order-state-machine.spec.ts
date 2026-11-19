import { allowedNextStatuses, canTransition } from './order-state-machine';

describe('order state machine', () => {
  it('lets the workspace move an order through preparation', () => {
    expect(canTransition('PLACED', 'ACCEPTED', 'WORKSPACE')).toBe(true);
    expect(canTransition('ACCEPTED', 'PREPARING', 'WORKSPACE')).toBe(true);
    expect(canTransition('PREPARING', 'READY_FOR_FULFILMENT', 'WORKSPACE')).toBe(true);
  });

  it('reserves delivery-driven transitions for the system', () => {
    expect(canTransition('READY_FOR_FULFILMENT', 'OUT_FOR_DELIVERY', 'WORKSPACE')).toBe(false);
    expect(canTransition('READY_FOR_FULFILMENT', 'OUT_FOR_DELIVERY', 'SYSTEM')).toBe(true);
    expect(canTransition('OUT_FOR_DELIVERY', 'DELIVERED', 'WORKSPACE')).toBe(false);
  });

  it('only lets customers cancel before acceptance', () => {
    expect(canTransition('PLACED', 'CANCELLED', 'CUSTOMER')).toBe(true);
    expect(canTransition('ACCEPTED', 'CANCELLED', 'CUSTOMER')).toBe(false);
  });

  it('has no exits from terminal states', () => {
    expect(allowedNextStatuses('CANCELLED', 'PLATFORM_ADMIN')).toEqual([]);
    expect(allowedNextStatuses('RETURNED', 'WORKSPACE')).toEqual([]);
  });

  it('lists the workspace actions for a ready order', () => {
    expect(allowedNextStatuses('READY_FOR_FULFILMENT', 'WORKSPACE').sort()).toEqual(
      ['AWAITING_CUSTOMER_PICKUP', 'CANCELLED'].sort(),
    );
  });
});
