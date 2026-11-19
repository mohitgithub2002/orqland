import { canTaskTransition } from './delivery-state-machine';

describe('delivery task state machine', () => {
  it('follows the agent lifecycle', () => {
    expect(canTaskTransition('OFFERED', 'ACCEPTED', 'PERFORMER')).toBe(true);
    expect(canTaskTransition('ACCEPTED', 'ARRIVING_AT_PICKUP', 'PERFORMER')).toBe(true);
    expect(canTaskTransition('ARRIVING_AT_PICKUP', 'PICKED_UP', 'PERFORMER')).toBe(true);
    expect(canTaskTransition('PICKED_UP', 'IN_TRANSIT', 'PERFORMER')).toBe(true);
    expect(canTaskTransition('IN_TRANSIT', 'DELIVERED', 'PERFORMER')).toBe(true);
  });

  it('prevents workspaces from completing agent tasks without the override path', () => {
    expect(canTaskTransition('IN_TRANSIT', 'DELIVERED', 'WORKSPACE')).toBe(false);
  });

  it('allows reassignment and cancellation only before pickup', () => {
    expect(canTaskTransition('ACCEPTED', 'PENDING_ASSIGNMENT', 'WORKSPACE')).toBe(true);
    expect(canTaskTransition('PICKED_UP', 'PENDING_ASSIGNMENT', 'WORKSPACE')).toBe(false);
    expect(canTaskTransition('PICKED_UP', 'CANCELLED', 'WORKSPACE')).toBe(false);
  });

  it('treats failure, return and delivery as separate paths', () => {
    expect(canTaskTransition('IN_TRANSIT', 'FAILED', 'PERFORMER')).toBe(true);
    expect(canTaskTransition('FAILED', 'RETURNED_TO_ORIGIN', 'WORKSPACE')).toBe(true);
    expect(canTaskTransition('FAILED', 'DELIVERED', 'PERFORMER')).toBe(false);
  });
});
