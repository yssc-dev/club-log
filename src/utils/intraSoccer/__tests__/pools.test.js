import { describe, it, expect } from 'vitest';
import { resolvePair, rosterOf, floatingOf, setupPoolA, setupPoolB, sidePool, canIntra, mergeFormationState } from '../pools';

const eleven = (p) => Array.from({ length: 11 }, (_, i) => `${p}${i + 1}`);
const teams = [
  { name: '주황', players: [...eleven('a'), 'a12'] },
  { name: '파랑', players: eleven('b') },
];
const attendees = [...eleven('a'), 'a12', ...eleven('b'), 'x1', 'x2'];   // x1,x2 = 유동 인원

describe('resolvePair / rosterOf / floatingOf', () => {
  it('유효하지 않은 selectedPair 는 [0,1]', () => {
    expect(resolvePair(teams, undefined)).toEqual([0, 1]);
    expect(resolvePair(teams, [1, 0])).toEqual([1, 0]);
    expect(resolvePair(teams, [0, 5])).toEqual([0, 1]);
    expect(resolvePair(teams, [1, 1])).toEqual([0, 1]);
  });
  it('rosterOf 는 이름으로, 없으면 null', () => {
    expect(rosterOf(teams, '파랑')).toEqual(eleven('b'));
    expect(rosterOf(teams, '없음')).toBeNull();
  });
  it('floatingOf 는 어느 팀에도 없는 참석자', () => {
    expect(floatingOf(attendees, teams)).toEqual(['x1', 'x2']);
    expect(floatingOf(attendees, [])).toEqual(attendees);
  });
});

describe('setupPoolA / setupPoolB', () => {
  it('A 풀 = A 명단 ∪ 유동, 참석자에 없는 명단은 제외', () => {
    const att = attendees.filter(n => n !== 'a12');           // a12 불참 처리
    expect(setupPoolA({ teams, a: 0, attendees: att })).toEqual([...eleven('a'), 'x1', 'x2']);
  });
  it('B 풀 = B 명단 ∪ 유동 − A 가 고른 선수', () => {
    const aAssigned = [...eleven('a').slice(0, 10), 'x1'];   // A 가 유동 x1 을 선발로 썼다
    expect(setupPoolB({ teams, b: 1, attendees, aAssigned })).toEqual([...eleven('b'), 'x2']);
  });
});

describe('sidePool', () => {
  const m = {
    lineup: eleven('a'), gk: 'a1', assignments: Object.fromEntries(eleven('a').map((n, i) => [i, n])),
    sideA: { name: '주황' },
    sideB: { name: '파랑', lineup: eleven('b'), gk: 'b1', assignments: Object.fromEntries(eleven('b').map((n, i) => [i, n])) },
    events: [{ id: 's', type: 'sub', side: 'B', playerOut: 'b11', playerIn: 'x2', position: 'FW', posIdx: 10 }],
  };
  it('A 탭 = A 명단∪유동 − B 출전 이력(x2 는 B 로 뛰었으니 제외)', () => {
    expect(sidePool(m, 'A', attendees, teams)).toEqual([...eleven('a'), 'a12', 'x1']);
  });
  it('B 탭 = B 명단∪유동 − A 출전 이력', () => {
    expect(sidePool(m, 'B', attendees, teams)).toEqual([...eleven('b'), 'x1', 'x2']);
  });
  it('편 이름이 팀 목록에 없으면 attendees 로 폴백, 외부전은 attendees 참조 그대로', () => {
    const mm = { ...m, sideA: { name: '누구' } };
    expect(sidePool(mm, 'A', attendees, teams)).toEqual(attendees.filter(n => !eleven('b').includes(n) && n !== 'x2'));
    const ext = { lineup: ['a1'], gk: 'a1', events: [] };
    expect(sidePool(ext, 'A', attendees, teams)).toBe(attendees);
  });
});

describe('canIntra', () => {
  it('두 팀 각 11명 이상 + 참석 22명 이상이면 ok', () => {
    expect(canIntra({ teams, attendees, pair: undefined })).toEqual({ ok: true, reason: '' });
  });
  it('팀 열 1개면 불가', () => {
    expect(canIntra({ teams: [teams[0]], attendees }).ok).toBe(false);
  });
  it('한 팀이 유동 포함 11명 미만이면 불가, 이유에 인원 표시', () => {
    const r = canIntra({ teams, attendees: attendees.filter(n => !['b9', 'b10', 'b11', 'x1', 'x2'].includes(n)) });
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('파랑 8명');
  });
  it('참석 22명 미만이면 불가', () => {
    const small = [...eleven('a'), ...eleven('b').slice(0, 10)];
    const t = [{ name: '주황', players: eleven('a') }, { name: '파랑', players: eleven('b') }];
    expect(canIntra({ teams: t, attendees: small }).ok).toBe(false);
  });
  it('팀 3개면 pair 기준으로 평가하고 기본은 [0,1]', () => {
    const t3 = [...teams, { name: '검정', players: ['c1'] }];
    expect(canIntra({ teams: t3, attendees }).ok).toBe(true);
    expect(canIntra({ teams: t3, attendees, pair: [0, 2] }).ok).toBe(false);
  });
});

describe('mergeFormationState', () => {
  it('saved 의 intra 를 보존하고 current·updates 를 덮는다', () => {
    const saved = { viewState: 'formation', selectedOpponent: 'X', selectedPlayers: ['p'], intra: { teams, syncedAt: 1, selectedPair: [1, 0] } };
    const out = mergeFormationState(saved, { viewState: 'selectOpponent', selectedOpponent: null, selectedPlayers: [] }, { viewState: 'formation' });
    expect(out).toEqual({ viewState: 'formation', selectedOpponent: null, selectedPlayers: [], intra: saved.intra });
    expect(mergeFormationState(null, { viewState: 'a' }, {})).toEqual({ viewState: 'a' });
  });
});
