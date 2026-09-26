// src/services/__tests__/sheetCache.alias.test.js
// 3단계 스펙 §4.1 — 컵 alias 뷰(cupMatchLog/cupEventLog)는 원본 노드를 공유하고 반환만 컵 행으로 거른다.
// 정규 뷰 ∪ 컵 뷰 = 전체, 교집합 없음. alias 는 datasetsOf/refreshAll/status 대상이 아니다.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  store: new Map(),
  fetchCounts: { matchLog: 0, eventLog: 0 },
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
const CUP = { ...REG, mode: '대회', tournament_id: '마스터스컵 2026', date: '2026-10-01' };
const REG_EV = { team: '마스터FC', sport: '풋살', mode: '기본', tournament_id: '', date: '2026-09-13', match_id: 'R1_C0', event_type: 'goal', player: '김철수' };
const CUP_EV = { ...REG_EV, mode: '대회', tournament_id: '마스터스컵 2026', date: '2026-10-01' };

vi.mock('../appSync', () => ({
  default: {
    getMatchLog: () => { h.fetchCounts.matchLog++; return Promise.resolve({ rows: [REG, CUP] }); },
    getEventLog: () => { h.fetchCounts.eventLog++; return Promise.resolve({ rows: [REG_EV, CUP_EV] }); },
    getPlayerGameLog: () => Promise.resolve({ rows: [] }),
    getPointLog: () => Promise.resolve([]),
    getPlayerLog: () => Promise.resolve([]),
    getLatestDeltas: () => Promise.resolve({}),
    getCumulativeBonus: () => Promise.resolve({ crova: {}, goguma: {} }),
  },
}));

import SheetCache from '../sheetCache';

beforeEach(() => {
  h.store.clear();
  h.fetchCounts = { matchLog: 0, eventLog: 0 };
  h.auth = { team: '마스터FC', mode: '풋살' };
  h.settings = {};
  SheetCache._resetForTest();
});

describe('alias 레지스트리', () => {
  it('datasetsOf(풋살) 에 alias 가 없다(재적재·상태 대상 불변)', () => {
    const ds = SheetCache.datasetsOf('풋살');
    expect(ds).not.toContain('cupMatchLog');
    expect(ds).not.toContain('cupEventLog');
    expect(ds).toHaveLength(7);
  });
  it('alias 는 존재하는 원본 어댑터를 가리키고 rowFilter 를 갖는다; 축구·테니스에는 없다', () => {
    const aliases = SheetCache._aliasesForTest();
    const adapters = SheetCache._adaptersForTest();
    expect(Object.keys(aliases['풋살']).sort()).toEqual(['cupEventLog', 'cupMatchLog']);
    for (const [k, a] of Object.entries(aliases['풋살'])) {
      expect(adapters['풋살'][a.alias], k).toBeDefined();
      expect(typeof a.rowFilter, k).toBe('function');
    }
    expect(aliases['축구']).toBeUndefined();
    expect(aliases['테니스']).toBeUndefined();
  });
  it('축구에서 cupMatchLog 를 부르면 빈 배열(어댑터 없음과 동일)', async () => {
    expect(await SheetCache.get('cupMatchLog', { sport: '축구' })).toEqual([]);
  });
});

describe('컵 뷰 반환·경로 공유', () => {
  it('L3 폴백: 컵 행만 돌려주고 노드는 원본 경로에 전체 행', async () => {
    const rows = await SheetCache.get('cupMatchLog', { sport: '풋살' });
    expect(rows).toEqual([CUP]);
    expect(h.store.get('cache/마스터FC/풋살/matchLog/all').count).toBe(2);
    expect([...h.store.keys()].some(k => k.includes('cupMatchLog'))).toBe(false);
  });
  it('정규 뷰 ∪ 컵 뷰 = 전체, 교집합 없음, L3 는 1회', async () => {
    const reg = await SheetCache.get('matchLog', { sport: '풋살' });
    const cup = await SheetCache.get('cupMatchLog', { sport: '풋살' });
    expect(reg).toEqual([REG]);
    expect(cup).toEqual([CUP]);
    expect(h.fetchCounts.matchLog).toBe(1);
  });
  it('in-flight 공유: 두 뷰를 동시에 불러도 L3 1회, 각자 자기 필터', async () => {
    const [reg, cup] = await Promise.all([
      SheetCache.get('eventLog', { sport: '풋살' }),
      SheetCache.get('cupEventLog', { sport: '풋살' }),
    ]);
    expect(reg).toEqual([REG_EV]);
    expect(cup).toEqual([CUP_EV]);
    expect(h.fetchCounts.eventLog).toBe(1);
  });
  it('L2 히트: L1 을 비워도 L3 를 치지 않고 컵 행만', async () => {
    await SheetCache.get('cupMatchLog', { sport: '풋살' });
    SheetCache._resetForTest();
    const rows = await SheetCache.get('cupMatchLog', { sport: '풋살' });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ tournament_id: '마스터스컵 2026', date: '2026-10-01' });
    expect(h.fetchCounts.matchLog).toBe(1);
  });
  it('refresh(alias): 원본 경로 재적재, rows 는 컵 행만', async () => {
    const r = await SheetCache.refresh('cupMatchLog', { sport: '풋살' });
    expect(r.ok).toBe(true);
    expect(r.rows).toEqual([CUP]);
    expect(h.store.get('cache/마스터FC/풋살/matchLog/all').count).toBe(2);
    expect(h.fetchCounts.matchLog).toBe(1);
  });
  it('alias 로 읽어도 원본 어댑터 객체의 rowFilter 는 바뀌지 않는다', async () => {
    await SheetCache.get('cupMatchLog', { sport: '풋살' });
    const adapter = SheetCache._adaptersForTest()['풋살'].matchLog;
    expect(adapter.rowFilter(REG)).toBe(true);
    expect(adapter.rowFilter(CUP)).toBe(false);
  });
});
