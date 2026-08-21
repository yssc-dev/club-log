import { describe, it, expect } from 'vitest';
import { calcAssistPairs } from '../calcAssistPairs';

describe('calcAssistPairs', () => {
  it('returns empty for no events', () => {
    expect(calcAssistPairs({ eventLogs: [] })).toEqual([]);
  });

  it('counts (assister, scorer) pairs', () => {
    const eventLogs = [
      { event_type: 'goal', player: 'S', related_player: 'A' },
      { event_type: 'goal', player: 'S', related_player: 'A' },
      { event_type: 'goal', player: 'S', related_player: 'A' },
      { event_type: 'goal', player: 'S', related_player: 'B' },
    ];
    const r = calcAssistPairs({ eventLogs, threshold: 3, topN: 10 });
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ assister: 'A', scorer: 'S', count: 3 });
  });

  it('order matters (A→S != S→A)', () => {
    const eventLogs = [
      { event_type: 'goal', player: 'S', related_player: 'A' },
      { event_type: 'goal', player: 'S', related_player: 'A' },
      { event_type: 'goal', player: 'S', related_player: 'A' },
      { event_type: 'goal', player: 'A', related_player: 'S' },
      { event_type: 'goal', player: 'A', related_player: 'S' },
      { event_type: 'goal', player: 'A', related_player: 'S' },
    ];
    const r = calcAssistPairs({ eventLogs, threshold: 3, topN: 10 });
    expect(r).toHaveLength(2);
    expect(r.find(x => x.assister === 'A' && x.scorer === 'S').count).toBe(3);
    expect(r.find(x => x.assister === 'S' && x.scorer === 'A').count).toBe(3);
  });

  it('skips solo goals (no related_player)', () => {
    const eventLogs = [
      { event_type: 'goal', player: 'S', related_player: '' },
    ];
    expect(calcAssistPairs({ eventLogs, threshold: 1 })).toEqual([]);
  });

  it('skips owngoal', () => {
    const eventLogs = [
      { event_type: 'owngoal', player: 'S', related_player: 'A' },
    ];
    expect(calcAssistPairs({ eventLogs, threshold: 1 })).toEqual([]);
  });

  it('synergyCells 제공 시 sharedGames(함께 뛴 라운드 수)와 perSharedGame 부착', () => {
    const eventLogs = [
      { event_type: 'goal', player: 'S', related_player: 'A' },
      { event_type: 'goal', player: 'S', related_player: 'A' },
      { event_type: 'goal', player: 'S', related_player: 'A' },
    ];
    // calcSynergyMatrix cells 형태 — 키는 가나다 정렬 (A|S)
    const synergyCells = { 'A|S': { games: 10 } };
    const r = calcAssistPairs({ eventLogs, threshold: 3, topN: 10, synergyCells });
    expect(r[0].sharedGames).toBe(10);
    expect(r[0].perSharedGame).toBeCloseTo(0.3, 5);
  });

  it('synergyCells에 페어가 없으면 sharedGames=null (표시만 생략)', () => {
    const eventLogs = [
      { event_type: 'goal', player: 'S', related_player: 'A' },
      { event_type: 'goal', player: 'S', related_player: 'A' },
      { event_type: 'goal', player: 'S', related_player: 'A' },
    ];
    const r = calcAssistPairs({ eventLogs, threshold: 3, topN: 10, synergyCells: {} });
    expect(r[0].sharedGames).toBeNull();
    expect(r[0].perSharedGame).toBeNull();
  });

  it('topN limits result length', () => {
    const eventLogs = [];
    for (let i = 0; i < 15; i++) {
      eventLogs.push({ event_type: 'goal', player: `S${i}`, related_player: 'A' });
      eventLogs.push({ event_type: 'goal', player: `S${i}`, related_player: 'A' });
      eventLogs.push({ event_type: 'goal', player: `S${i}`, related_player: 'A' });
    }
    const r = calcAssistPairs({ eventLogs, threshold: 3, topN: 5 });
    expect(r).toHaveLength(5);
  });
});

// 2026-08-21 동적 진입선: threshold 생략 시 페어 최다 연결의 30%(올림), 반환 배열에 threshold 부착
import { describe as d2, it as it2, expect as ex2 } from 'vitest';
d2('calcAssistPairs 동적 진입선', () => {
  it2('진입선 = 페어 최다 연결의 30%(올림), threshold 부착', () => {
    const g = (assister, scorer) => ({ event_type: 'goal', player: scorer, related_player: assister });
    const eventLogs = [
      ...Array.from({ length: 10 }, () => g('A', 'B')),
      ...Array.from({ length: 3 }, () => g('C', 'D')),
      ...Array.from({ length: 2 }, () => g('E', 'F')),
    ];
    const r = calcAssistPairs({ eventLogs, topN: 20 });
    const keys = r.map(p => `${p.assister}→${p.scorer}`);
    ex2(keys).toContain('C→D');
    ex2(keys).not.toContain('E→F');
    ex2(r.threshold).toBe(3);
  });
});
