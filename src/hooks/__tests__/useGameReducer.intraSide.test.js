import { describe, it, expect } from 'vitest';
import { gameReducer, initialState } from '../useGameReducer';

const base = () => gameReducer({ ...initialState, soccerMatches: [] }, {
  type: 'CREATE_SOCCER_MATCH', opponent: '파랑', lineup: ['a1', 'a2'], gk: 'a1', defenders: ['a2'],
  subs: ['a3'], formation: '4-4-2', assignments: { 0: 'a1', 1: 'a2' }, positionMap: { a1: 'GK', a2: 'DF' },
});

describe('gameReducer — PATCH_SOCCER_SIDE', () => {
  it('B: 화이트리스트 필드를 sideB 에 생성·병합한다(없는 키 무시)', () => {
    let s = base();
    s = gameReducer(s, { type: 'PATCH_SOCCER_SIDE', matchIdx: 0, side: 'B',
      patch: { name: '파랑', lineup: ['b1', 'b2'], gk: 'b1', defenders: ['b2'], formation: '4-3-3',
               assignments: { 0: 'b1', 1: 'b2' }, positionMap: { b1: 'GK', b2: 'DF' }, subs: ['b3'], status: 'HACK', events: [] } });
    const m = s.soccerMatches[0];
    expect(m.sideB).toEqual({ name: '파랑', lineup: ['b1', 'b2'], gk: 'b1', defenders: ['b2'], formation: '4-3-3',
      assignments: { 0: 'b1', 1: 'b2' }, positionMap: { b1: 'GK', b2: 'DF' }, subs: ['b3'] });
    expect(m.status).toBe('playing');                 // A 필드·status 무변경
    expect(m.lineup).toEqual(['a1', 'a2']);
    s = gameReducer(s, { type: 'PATCH_SOCCER_SIDE', matchIdx: 0, side: 'B', patch: { gk: 'b2' } });
    expect(s.soccerMatches[0].sideB.gk).toBe('b2');
    expect(s.soccerMatches[0].sideB.lineup).toEqual(['b1', 'b2']); // 병합
  });
  it('A: name 만 sideA 에 기록한다', () => {
    const s = gameReducer(base(), { type: 'PATCH_SOCCER_SIDE', matchIdx: 0, side: 'A', patch: { name: '주황', lineup: ['zzz'] } });
    expect(s.soccerMatches[0].sideA).toEqual({ name: '주황' });
    expect(s.soccerMatches[0].lineup).toEqual(['a1', 'a2']);
  });
  it('논리 matchIdx 로 매칭하고 다른 경기는 건드리지 않는다', () => {
    let s = base();
    s = gameReducer(s, { type: 'CREATE_SOCCER_MATCH', opponent: 'X', lineup: ['q'], gk: 'q', defenders: [], subs: [] });
    s = gameReducer(s, { type: 'PATCH_SOCCER_SIDE', matchIdx: 1, side: 'B', patch: { name: 'B2' } });
    expect(s.soccerMatches[0].sideB).toBeUndefined();
    expect(s.soccerMatches[1].sideB).toEqual({ name: 'B2' });
  });
  it('remapEvents 는 그 편 이벤트만 치환한다', () => {
    let s = base();
    s = gameReducer(s, { type: 'PATCH_SOCCER_SIDE', matchIdx: 0, side: 'B', patch: { name: '파랑', lineup: ['b1', 'b2'] } });
    s = gameReducer(s, { type: 'ADD_SOCCER_EVENT', matchIdx: 0, event: { id: 'g1', type: 'goal', side: 'A', player: 'x', assist: 'a1' } });
    s = gameReducer(s, { type: 'ADD_SOCCER_EVENT', matchIdx: 0, event: { id: 'g2', type: 'goal', side: 'B', player: 'x', concedeGk: 'a1' } });
    s = gameReducer(s, { type: 'PATCH_SOCCER_SIDE', matchIdx: 0, side: 'B', patch: { lineup: ['b1', 'y'] }, remapEvents: ['x', 'y'] });
    const ev = s.soccerMatches[0].events;
    expect(ev.find(e => e.id === 'g1').player).toBe('x');  // A 편 이벤트 무변경
    expect(ev.find(e => e.id === 'g2').player).toBe('y');  // B 편만 치환
  });
  it('DELETE_SOCCER_EVENT 로 B 편 교체를 지워도 A 배치는 변하지 않는다(no-op)', () => {
    let s = base();
    s = gameReducer(s, { type: 'PATCH_SOCCER_SIDE', matchIdx: 0, side: 'B',
      patch: { name: '파랑', lineup: ['b1', 'b2'], assignments: { 0: 'b1', 1: 'b3' }, positionMap: { b1: 'GK', b3: 'DF' }, subs: ['b2'] } });
    s = gameReducer(s, { type: 'ADD_SOCCER_EVENT', matchIdx: 0,
      event: { id: 'sb', type: 'sub', side: 'B', playerOut: 'b2', playerIn: 'b3', position: 'DF', posIdx: 1 } });
    const before = s.soccerMatches[0];
    s = gameReducer(s, { type: 'DELETE_SOCCER_EVENT', matchIdx: 0, eventId: 'sb' });
    const after = s.soccerMatches[0];
    expect(after.events.find(e => e.id === 'sb')).toBeUndefined();
    expect(after.assignments).toEqual(before.assignments);   // A 무변경
    expect(after.positionMap).toEqual(before.positionMap);
    expect(after.subs).toEqual(before.subs);
    expect(after.sideB).toEqual(before.sideB);               // 리듀서는 B 를 되돌리지 않는다(오케스트레이터 책임)
  });
});
