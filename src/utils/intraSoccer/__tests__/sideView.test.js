import { describe, it, expect } from 'vitest';
import { isIntra, fieldsOfA, fieldsOfB, sideView } from '../sideView';

const intra = {
  matchIdx: 0, status: 'playing', startedAt: 1000, opponent: '파랑',
  lineup: ['a1', 'a2'], gk: 'a1', defenders: ['a2'], formation: '4-4-2',
  assignments: { 0: 'a1', 1: 'a2' }, positionMap: { a1: 'GK', a2: 'DF' }, subs: ['a3'],
  sideA: { name: '주황' },
  sideB: { name: '파랑', lineup: ['b1', 'b2'], gk: 'b1', defenders: ['b2'], formation: '4-3-3',
           assignments: { 0: 'b1', 1: 'b2' }, positionMap: { b1: 'GK', b2: 'DF' } /* subs 누락(RTDB 빈배열 소실) */ },
  events: [
    { id: 'e1', type: 'goal', side: 'A', player: 'a2', assist: 'a1', concedeGk: 'b1', timestamp: 10 },
    { id: 'e2', type: 'goal', side: 'B', player: 'b2', assist: null, concedeGk: 'a1', timestamp: 20 },
    { id: 'e3', type: 'owngoal', side: 'B', player: 'b2', timestamp: 30 },
    { id: 'e4', type: 'sub', side: 'B', playerOut: 'b2', playerIn: 'b3', position: 'DF', posIdx: 1, timestamp: 40 },
    { id: 'e5', type: 'redCard', side: 'A', player: 'a2', timestamp: 50 },
    { id: 'e6', type: 'goal', player: 'a1', concedeGk: 'b1', timestamp: 60 }, // side 누락 = A
  ],
};
const external = { matchIdx: 0, status: 'playing', opponent: '터틀파크', lineup: ['a1'], gk: 'a1', defenders: [],
  events: [{ id: 'x', type: 'opponentGoal', side: 'A', currentGk: 'a1', timestamp: 1 }] };

describe('isIntra / fieldsOf*', () => {
  it('sideB 존재 여부로 자체전을 판정한다', () => {
    expect(isIntra(intra)).toBe(true);
    expect(isIntra(external)).toBe(false);
    expect(isIntra(null)).toBe(false);
  });
  it('fieldsOfA/B 는 배열을 항상 배열로, 이름 기본값을 채운다', () => {
    expect(fieldsOfB(intra).subs).toEqual([]);          // 누락 → []
    expect(fieldsOfB(intra).name).toBe('파랑');
    expect(fieldsOfA({ ...intra, sideA: undefined }).name).toBe('A팀');
    expect(fieldsOfB({ ...intra, sideB: {} }).name).toBe('B팀');
    expect(fieldsOfA(intra).lineup).toEqual(['a1', 'a2']);
  });
});

describe('sideView — 자체전', () => {
  it('A 뷰: A 필드 + opponent=B 이름 + 상대 골은 opponentGoal(concedeGk) 로', () => {
    const v = sideView(intra, 'A');
    expect(v.lineup).toEqual(['a1', 'a2']);
    expect(v.gk).toBe('a1');
    expect(v.opponent).toBe('파랑');
    expect(v.sideA).toBeUndefined();
    expect(v.sideB).toBeUndefined();
    expect(v.events.map(e => [e.id, e.type])).toEqual([
      ['e1', 'goal'], ['e2', 'opponentGoal'], ['e3', 'opponentOwnGoal'], ['e5', 'redCard'], ['e6', 'goal'],
    ]);
    const og = v.events.find(e => e.id === 'e2');
    expect(og).toEqual({ type: 'opponentGoal', currentGk: 'a1', id: 'e2', timestamp: 20, mirrorOf: 'e2' });
  });
  it('B 뷰: B 필드 + opponent=A 이름 + A 골은 opponentGoal(B GK) 로, A 카드·side누락 골은 상대 골로', () => {
    const v = sideView(intra, 'B');
    expect(v.lineup).toEqual(['b1', 'b2']);
    expect(v.subs).toEqual([]);
    expect(v.opponent).toBe('주황');
    expect(v.events.map(e => [e.id, e.type])).toEqual([
      ['e1', 'opponentGoal'], ['e2', 'goal'], ['e3', 'owngoal'], ['e4', 'sub'], ['e6', 'opponentGoal'],
    ]);
    expect(v.events[0].currentGk).toBe('b1');
  });
  it('입력을 변경하지 않는다', () => {
    const snapshot = JSON.stringify(intra);
    sideView(intra, 'A'); sideView(intra, 'B');
    expect(JSON.stringify(intra)).toBe(snapshot);
  });
});

describe('sideView — 외부전', () => {
  it('sideB 가 없으면 입력 참조를 그대로 반환한다', () => {
    expect(sideView(external, 'A')).toBe(external);
    expect(sideView(external, 'B')).toBe(external);
  });
});
