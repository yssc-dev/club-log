import { describe, it, expect } from 'vitest';
import { calcSoloGoalRatio } from '../calcSoloGoalRatio';

describe('calcSoloGoalRatio', () => {
  it('returns empty for no events', () => {
    const r = calcSoloGoalRatio({ eventLogs: [], threshold: 10 });
    expect(r.perPlayer).toEqual({});
    expect(r.ranking.soloHeroes).toEqual([]);
  });

  it('counts solo and assisted goals separately', () => {
    const eventLogs = [
      { event_type: 'goal', player: 'A', related_player: '' },
      { event_type: 'goal', player: 'A', related_player: 'B' },
      { event_type: 'goal', player: 'A', related_player: '' },
    ];
    const r = calcSoloGoalRatio({ eventLogs, threshold: 1 });
    expect(r.perPlayer.A).toEqual({ solo: 2, assisted: 1, total: 3, soloRatio: 2 / 3 });
  });

  it('owngoal excluded', () => {
    const eventLogs = [
      { event_type: 'owngoal', player: 'A', related_player: '' },
      { event_type: 'goal',    player: 'A', related_player: '' },
    ];
    const r = calcSoloGoalRatio({ eventLogs, threshold: 1 });
    expect(r.perPlayer.A.total).toBe(1);
    expect(r.perPlayer.A.solo).toBe(1);
  });

  it('threshold filters ranking', () => {
    const eventLogs = [
      { event_type: 'goal', player: 'A', related_player: '' },
      { event_type: 'goal', player: 'A', related_player: '' },
    ];
    const r = calcSoloGoalRatio({ eventLogs, threshold: 10 });
    expect(r.perPlayer.A.total).toBe(2);
    expect(r.ranking.soloHeroes).toEqual([]);
  });

  it('ranking sorts by soloRatio desc, ties by name', () => {
    const eventLogs = [
      ...Array(8).fill({ event_type: 'goal', player: 'A', related_player: '' }),
      ...Array(2).fill({ event_type: 'goal', player: 'A', related_player: 'X' }),
      ...Array(5).fill({ event_type: 'goal', player: 'B', related_player: '' }),
      ...Array(5).fill({ event_type: 'goal', player: 'B', related_player: 'X' }),
    ];
    const r = calcSoloGoalRatio({ eventLogs, threshold: 10 });
    expect(r.ranking.soloHeroes[0].player).toBe('A');  // 0.8
    expect(r.ranking.soloHeroes[1].player).toBe('B');  // 0.5
  });
});
