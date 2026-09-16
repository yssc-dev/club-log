// src/services/__tests__/sheetCache.rowFilter.test.js
// 스펙 §4.6·§10 불변식 2 — 풋살 정규 데이터셋은 tournament_id 가 빈 행만 돌려준다.
// 모든 반환 경로(L3 폴백·L2 히트·L1 히트·in-flight 합류·refresh)에서 필터가 걸리고,
// 저장(L1/L2)에는 전체 행이 남는다. 축구 어댑터는 필터하지 않는다(하버FC 대회 행 유지).
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  store: new Map(),
  fetchCounts: { matchLog: 0, eventLog: 0, playerGameLog: 0 },
  auth: { team: '마스터FC', mode: '풋살' },
  settings: {},
}));

vi.mock('../../config/firebase', () => ({ firebaseDb: {} }));
vi.mock('firebase/database', () => ({
  ref: (_db, path) => ({ path }),
  get: async (r) => (h.store.has(r.path) ? { val: () => h.store.get(r.path) } : { val: () => null }),
  set: async (r, value) => {
    const v = { ...value };
    if (v.version && v.version.__sv) v.version = Date.now();
    h.store.set(r.path, v);
  },
  remove: async (r) => { h.store.delete(r.path); },
  serverTimestamp: () => ({ __sv: true }),
}));
vi.mock('../authUtil', () => ({ default: { getStored: () => h.auth } }));
vi.mock('../../config/settings', () => ({ getEffectiveSettings: () => h.settings }));
vi.mock('../tennisSync', () => ({ default: {} }));

const REG = { team: '마스터FC', sport: '풋살', mode: '기본', tournament_id: '', date: '2026-09-13', match_id: 'R1_C0', our_team_name: '팀A', opponent_team_name: '팀B', our_score: 1, opponent_score: 0, is_extra: false };
const CUP = { ...REG, mode: '대회', tournament_id: '마스터스컵 2026', date: '2026-09-20', match_id: 'R1_C0' };
const REG_EV = { team: '마스터FC', sport: '풋살', mode: '기본', tournament_id: '', date: '2026-09-13', match_id: 'R1_C0', event_type: 'goal', player: '김철수' };
const CUP_EV = { ...REG_EV, mode: '대회', tournament_id: '마스터스컵 2026', date: '2026-09-20' };
const REG_PG = { team: '마스터FC', sport: '풋살', mode: '기본', tournament_id: '', date: '2026-09-13', player: '김철수', goals: 1 };
const CUP_PG = { ...REG_PG, mode: '대회', tournament_id: '마스터스컵 2026', date: '2026-09-20' };

vi.mock('../appSync', () => ({
  default: {
    getMatchLog: () => { h.fetchCounts.matchLog++; return Promise.resolve({ rows: [REG, CUP] }); },
    getEventLog: () => { h.fetchCounts.eventLog++; return Promise.resolve({ rows: [REG_EV, CUP_EV] }); },
    getPlayerGameLog: () => { h.fetchCounts.playerGameLog++; return Promise.resolve({ rows: [REG_PG, CUP_PG] }); },
    getPointLog: () => Promise.resolve([]),
    getPlayerLog: () => Promise.resolve([]),
    getLatestDeltas: () => Promise.resolve({}),
    getCumulativeBonus: () => Promise.resolve({ crova: {}, goguma: {} }),
  },
}));

import SheetCache from '../sheetCache';

beforeEach(() => {
  h.store.clear();
  h.fetchCounts = { matchLog: 0, eventLog: 0, playerGameLog: 0 };
  h.auth = { team: '마스터FC', mode: '풋살' };
  h.settings = {};
  SheetCache._resetForTest();
});

describe('풋살 정규 데이터셋은 컵 행을 돌려주지 않는다', () => {
  it('L3 폴백: 반환은 정규 행만, L2 노드에는 전체 행 저장', async () => {
    const rows = await SheetCache.get('matchLog', { sport: '풋살' });
    expect(rows).toEqual([REG]);
    expect(h.store.get('cache/마스터FC/풋살/matchLog/all').count).toBe(2);
  });

  it('L1 히트: 두 번째 호출도 필터된 값', async () => {
    await SheetCache.get('matchLog', { sport: '풋살' });
    const rows = await SheetCache.get('matchLog', { sport: '풋살' });
    expect(rows).toEqual([REG]);
    expect(h.fetchCounts.matchLog).toBe(1);
  });

  it('L1 저장은 필터 전 전체 행 — 다른 어댑터로 다시 읽으면 L3 를 다시 치지 않고도 전체를 본다', async () => {
    await SheetCache.get('matchLog', { sport: '풋살' });
    const adapter = SheetCache._adaptersForTest()['풋살'].matchLog;
    const original = adapter.rowFilter;
    adapter.rowFilter = () => true;
    try {
      const rows = await SheetCache.get('matchLog', { sport: '풋살' });
      expect(rows).toHaveLength(2);
      expect(h.fetchCounts.matchLog).toBe(1);
    } finally {
      adapter.rowFilter = original;
    }
  });

  it('in-flight 합류: 동시 호출 둘 다 필터된 값', async () => {
    const [a, b] = await Promise.all([
      SheetCache.get('eventLog', { sport: '풋살' }),
      SheetCache.get('eventLog', { sport: '풋살' }),
    ]);
    expect(a).toEqual([REG_EV]);
    expect(b).toEqual([REG_EV]);
    expect(h.fetchCounts.eventLog).toBe(1);
  });

  it('L2 히트: L1 을 비워도 L3 를 치지 않고 필터된 값', async () => {
    await SheetCache.get('playerGameLog', { sport: '풋살' });
    SheetCache._resetForTest();
    const rows = await SheetCache.get('playerGameLog', { sport: '풋살' });
    // L2 에서 디코드된 행은 20개 열이 전부 채워져 있어 toEqual 대신 핵심 필드만 본다.
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ player: '김철수', date: '2026-09-13' });
    expect(rows[0].tournament_id || '').toBe('');
    expect(h.fetchCounts.playerGameLog).toBe(1);
  });

  it('refresh: rows 는 필터된 값, L2 는 전체', async () => {
    const r = await SheetCache.refresh('matchLog', { sport: '풋살' });
    expect(r.ok).toBe(true);
    expect(r.rows).toEqual([REG]);
    expect(h.store.get('cache/마스터FC/풋살/matchLog/all').count).toBe(2);
  });

  it('로그 3종 모두 rowFilter 를 갖고, 다른 풋살 데이터셋은 갖지 않는다', () => {
    const a = SheetCache._adaptersForTest()['풋살'];
    for (const k of ['matchLog', 'eventLog', 'playerGameLog']) expect(typeof a[k].rowFilter, k).toBe('function');
    for (const k of ['pointLog', 'playerLog', 'latestDeltas', 'cumulativeBonus']) expect(a[k].rowFilter, k).toBeUndefined();
  });
});

describe('축구 어댑터는 필터하지 않는다(하버FC 대회 행 mode=대회 유지)', () => {
  beforeEach(() => { h.auth = { team: '하버FC', mode: '축구' }; });

  it('축구 matchLog 는 tournament_id 가 있는 행도 그대로', async () => {
    const rows = await SheetCache.get('matchLog', { sport: '축구' });
    expect(rows).toEqual([REG, CUP]);
  });

  it('축구·테니스 어댑터에는 rowFilter 가 없다', () => {
    const all = SheetCache._adaptersForTest();
    for (const sport of ['축구', '테니스']) {
      for (const [k, a] of Object.entries(all[sport])) expect(a.rowFilter, `${sport}.${k}`).toBeUndefined();
    }
  });
});
