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

// 2026-08-21 동적 진입선: threshold 생략 시 최다 골의 30%(올림)
import { describe as d2, it as it2, expect as ex2 } from 'vitest';
d2('calcSoloGoalRatio 동적 진입선', () => {
  it2('진입선 = 최다 골의 30%(올림), thresholds 반환', () => {
    const g = (player) => ({ event_type: 'goal', player, related_player: '' });
    const eventLogs = [
      ...Array.from({ length: 10 }, () => g('Max')),
      ...Array.from({ length: 3 }, () => g('In')),
      ...Array.from({ length: 2 }, () => g('Out')),
    ];
    const r = calcSoloGoalRatio({ eventLogs });
    const names = r.ranking.soloHeroes.map(x => x.player);
    ex2(names).toContain('Max');
    ex2(names).toContain('In');
    ex2(names).not.toContain('Out');
    ex2(r.thresholds.threshold).toBe(3);
  });
});
