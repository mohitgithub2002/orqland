import { rankCandidates, type AssignmentCandidate } from './assignment-strategies';

const candidate = (id: string, distance: number | null, load: number, idle = 0): AssignmentCandidate => ({
  agentUserId: id,
  connectionId: `c-${id}`,
  ratePerKm: '12.00',
  distanceToPickupKm: distance,
  activeTasks: load,
  idleSeconds: idle,
});

describe('assignment strategies', () => {
  const pool = [candidate('far', 8, 0), candidate('near', 1, 1), candidate('unknown', null, 0)];

  it('NEAREST prefers the closest agent and puts unknown locations last', () => {
    expect(rankCandidates('NEAREST', pool).map((c) => c.agentUserId)).toEqual(['near', 'far', 'unknown']);
  });

  it('LEAST_LOADED prefers idle agents', () => {
    expect(rankCandidates('LEAST_LOADED', pool)[0].agentUserId).toBe('far');
  });

  it('HYBRID balances distance and load', () => {
    expect(rankCandidates('HYBRID', pool)[0].agentUserId).toBe('near');
  });

  it('breaks ties by longest idle time', () => {
    const tied = [candidate('a', 2, 0, 10), candidate('b', 2, 0, 500)];
    expect(rankCandidates('NEAREST', tied)[0].agentUserId).toBe('b');
  });
});
