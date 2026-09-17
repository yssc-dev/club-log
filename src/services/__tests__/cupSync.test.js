// src/services/__tests__/cupSync.test.js
// 스펙 §4.2 — RTDB tournaments/{team}/{cupId} CRUD. firebase/database 를 경로 트리 in-memory 로 대체한다.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({ db: {}, denyWrite: false }));

function segs(path) { return path.split('/').filter(Boolean); }
function getAt(obj, path) { let cur = obj; for (const s of segs(path)) { if (cur == null || typeof cur !== 'object') return undefined; cur = cur[s]; } return cur; }
function setAt(obj, path, value) {
  const p = segs(path); let cur = obj;
  for (let i = 0; i < p.length - 1; i++) { if (cur[p[i]] == null || typeof cur[p[i]] !== 'object') cur[p[i]] = {}; cur = cur[p[i]]; }
  if (value === null || value === undefined) delete cur[p[p.length - 1]]; else cur[p[p.length - 1]] = JSON.parse(JSON.stringify(value));
}

vi.mock('../../config/firebase', () => ({ firebaseDb: {} }));
vi.mock('firebase/database', () => ({
  ref: (_db, path) => ({ path }),
  get: async (r) => { const v = getAt(h.db, r.path); return { exists: () => v !== undefined, val: () => (v === undefined ? null : v) }; },
  set: async (r, value) => { if (h.denyWrite) throw new Error('PERMISSION_DENIED'); setAt(h.db, r.path, value); },
  update: async (r, patch) => { if (h.denyWrite) throw new Error('PERMISSION_DENIED'); for (const [k, v] of Object.entries(patch)) setAt(h.db, `${r.path}/${k}`, v); },
  remove: async (r) => { if (h.denyWrite) throw new Error('PERMISSION_DENIED'); setAt(h.db, r.path, null); },
  serverTimestamp: () => ({ __sv: true }),
}));

import CupSync, { cupPath } from '../cupSync';

beforeEach(() => { h.db = {}; h.denyWrite = false; });

const TEAM = '마스터FC';

describe('cupPath', () => {
  it('tournaments/{safeTeam}/{cupId}', () => {
    expect(cupPath('마스터.FC', 'c1')).toBe('tournaments/마스터_FC/c1');
  });
});

describe('createCup / loadCup / listCups', () => {
  it('생성 → meta 가 저장되고 다시 읽힌다(teams 없음 → [])', async () => {
    const cup = await CupSync.createCup(TEAM, { name: ' 마스터스컵 2026 ', createdBy: '홍길동' });
    expect(cup.meta.id).toBe('마스터스컵 2026');
    expect(cup.meta.status).toBe('active');
    const loaded = await CupSync.loadCup(TEAM, '마스터스컵 2026');
    expect(loaded.meta.createdBy).toBe('홍길동');
    expect(loaded.teams).toEqual([]);
  });
  it('같은 이름은 throw, | 는 throw', async () => {
    await CupSync.createCup(TEAM, { name: '컵A', createdBy: '' });
    await expect(CupSync.createCup(TEAM, { name: '컵A', createdBy: '' })).rejects.toThrow('이미 있습니다');
    await expect(CupSync.createCup(TEAM, { name: 'a|b', createdBy: '' })).rejects.toThrow('| 는 쓸 수 없습니다');
  });
  it('listCups 는 풋살 대회만 createdAt 내림차순, 축구 대회 모드 노드는 제외', async () => {
    h.db = { tournaments: { 마스터FC: {
      old: { meta: { id: 'old', name: 'old', sport: '풋살', status: 'finished', createdAt: 1 } },
      neu: { meta: { id: 'neu', name: 'neu', sport: '풋살', status: 'active', createdAt: 2 } },
      soccer_t: { cache: { schedule: '[]' }, activeGame: null },
    } } };
    const list = await CupSync.listCups(TEAM);
    expect(list.map(c => c.meta.id)).toEqual(['neu', 'old']);
  });
  it('없는 대회는 null, 팀 노드 자체가 없으면 빈 목록', async () => {
    expect(await CupSync.loadCup(TEAM, '없음')).toBeNull();
    expect(await CupSync.listCups(TEAM)).toEqual([]);
  });
});

describe('saveTeams / setStatus / markLocked / deleteCup', () => {
  beforeEach(async () => { await CupSync.createCup(TEAM, { name: '컵', createdBy: '' }); });
  it('saveTeams 는 id 키로 통째 교체(삭제된 팀은 사라짐), updatedAt 갱신', async () => {
    await CupSync.saveTeams(TEAM, '컵', [
      { id: 't1', name: '팀A', captain: 'a', players: ['a', 'b'], order: 0 },
      { id: 't2', name: '팀B', captain: '', players: ['c'], order: 1 },
    ]);
    let cup = await CupSync.loadCup(TEAM, '컵');
    expect(cup.teams.map(t => t.name)).toEqual(['팀A', '팀B']);
    await CupSync.saveTeams(TEAM, '컵', [{ id: 't2', name: '팀B', captain: '', players: ['c'], order: 0 }]);
    cup = await CupSync.loadCup(TEAM, '컵');
    expect(cup.teams.map(t => t.id)).toEqual(['t2']);
    expect(cup.meta.updatedAt).toBeGreaterThan(0);
  });
  it('id 없는 팀은 throw(저장 전에 막는다)', async () => {
    await expect(CupSync.saveTeams(TEAM, '컵', [{ name: '팀A', players: ['a'] }])).rejects.toThrow('팀 id');
  });
  it('setStatus / markLocked(멱등) / deleteCup(잠기면 throw)', async () => {
    await CupSync.setStatus(TEAM, '컵', 'finished');
    expect((await CupSync.loadCup(TEAM, '컵')).meta.status).toBe('finished');
    await CupSync.markLocked(TEAM, '컵');
    const first = (await CupSync.loadCup(TEAM, '컵')).meta.lockedAt;
    expect(first).toBeGreaterThan(0);
    await CupSync.markLocked(TEAM, '컵');
    expect((await CupSync.loadCup(TEAM, '컵')).meta.lockedAt).toBe(first); // 유지
    await expect(CupSync.deleteCup(TEAM, '컵')).rejects.toThrow('잠긴 대회');
  });
  it('잠기지 않은 대회는 삭제되어 노드가 사라진다', async () => {
    await CupSync.deleteCup(TEAM, '컵');
    expect(await CupSync.loadCup(TEAM, '컵')).toBeNull();
  });
  it('권한 거부는 그대로 throw(조용히 삼키지 않는다)', async () => {
    h.denyWrite = true;
    await expect(CupSync.saveTeams(TEAM, '컵', [{ id: 't1', name: '팀A', players: ['a'], order: 0 }])).rejects.toThrow('PERMISSION_DENIED');
  });
});
