import { describe, it, expect } from 'vitest';
import { planAddEvent, planDeleteEvent, sideBSwapPatch, sideBCorrectPatch, pickSidePatch } from '../handlers';
import { FORMATIONS } from '../../formations';

const m = {
  matchIdx: 0, status: 'playing', opponent: '파랑',
  lineup: ['a1', 'a2'], gk: 'a1', defenders: ['a2'], formation: '4-4-2',
  assignments: { 0: 'a1', 1: 'a2' }, positionMap: { a1: 'GK', a2: 'DF' }, subs: ['a3'],
  sideB: { name: '파랑', lineup: ['b1', 'b2'], gk: 'b1', defenders: ['b2'], formation: '4-4-2',
           assignments: { 0: 'b1', 1: 'b3' }, positionMap: { b1: 'GK', b3: 'DF' }, subs: ['b2'] },
  events: [{ id: 'sb', type: 'sub', side: 'B', playerOut: 'b2', playerIn: 'b3', position: 'DF', posIdx: 1 }],
};
const ext = { matchIdx: 0, status: 'playing', opponent: '터틀', lineup: ['a1'], gk: 'a1', events: [] };

describe('planAddEvent', () => {
  it('자체전 A 골: side=A, concedeGk=B GK', () => {
    const r = planAddEvent(m, 'A', { id: 'g', type: 'goal', player: 'a2', assist: null, timestamp: 1 });
    expect(r).toEqual({ kind: 'dispatch', event: { id: 'g', type: 'goal', player: 'a2', assist: null, timestamp: 1, side: 'A', concedeGk: 'b1' } });
  });
  it('자체전 B 골: side=B, concedeGk=A GK', () => {
    expect(planAddEvent(m, 'B', { id: 'g', type: 'goal', player: 'b2', timestamp: 1 }).event.concedeGk).toBe('a1');
  });
  it('자체전에서 상대골 버튼은 저장하지 않고 상대 탭으로 보낸다', () => {
    expect(planAddEvent(m, 'A', { type: 'opponentGoal', currentGk: 'a1' })).toEqual({ kind: 'redirect', toSide: 'B' });
    expect(planAddEvent(m, 'B', { type: 'opponentOwnGoal' })).toEqual({ kind: 'redirect', toSide: 'A' });
  });
  it('교체·카드는 side 만 붙인다(concedeGk 없음)', () => {
    const r = planAddEvent(m, 'B', { id: 's', type: 'sub', playerOut: 'b1', playerIn: 'b9', position: 'GK', posIdx: 0 });
    expect(r.event).toEqual({ id: 's', type: 'sub', playerOut: 'b1', playerIn: 'b9', position: 'GK', posIdx: 0, side: 'B' });
    expect('concedeGk' in r.event).toBe(false);
  });
  it('외부전은 하버FC 그대로 + side A (opponentGoal 도 저장)', () => {
    expect(planAddEvent(ext, 'A', { id: 'o', type: 'opponentGoal', currentGk: 'a1' }))
      .toEqual({ kind: 'dispatch', event: { id: 'o', type: 'opponentGoal', currentGk: 'a1', side: 'A' } });
  });
});

describe('planDeleteEvent', () => {
  it('B 편 교체 삭제: DELETE + B 되돌리기 PATCH', () => {
    const acts = planDeleteEvent(m, 0, 'sb');
    expect(acts[0]).toEqual({ type: 'DELETE_SOCCER_EVENT', matchIdx: 0, eventId: 'sb' });
    expect(acts[1]).toEqual({ type: 'PATCH_SOCCER_SIDE', matchIdx: 0, side: 'B',
      patch: { assignments: { 0: 'b1', 1: 'b2' }, positionMap: { b1: 'GK', b2: 'DF' }, subs: ['b3'], gk: 'b1' } });
  });
  it('A 편 이벤트나 비교체는 DELETE 만', () => {
    const mm = { ...m, events: [...m.events, { id: 'g', type: 'goal', side: 'A', player: 'a2' }] };
    expect(planDeleteEvent(mm, 0, 'g')).toEqual([{ type: 'DELETE_SOCCER_EVENT', matchIdx: 0, eventId: 'g' }]);
    expect(planDeleteEvent(ext, 0, 'nope')).toEqual([{ type: 'DELETE_SOCCER_EVENT', matchIdx: 0, eventId: 'nope' }]);
  });
});

describe('sideBSwapPatch / sideBCorrectPatch / pickSidePatch', () => {
  it('위치교대: 슬롯 0(GK)↔1(DF) 교대 시 gk·positionMap·defenders 갱신', () => {
    const p = sideBSwapPatch(m, 0, 1);
    expect(p.assignments).toEqual({ 0: 'b3', 1: 'b1' });
    expect(p.gk).toBe('b3');
    expect(p.positionMap.b3).toBe('GK');                 // 슬롯 0 역할(GK)을 b3 가 받는다
    expect(p.positionMap.b1).toBe(FORMATIONS['4-4-2'].positions[1].role);
    expect(p.defenders).toEqual(Object.entries(p.positionMap).filter(([, r]) => r === 'DF').map(([n]) => n));
  });
  it('라인업 정정 out→inn: 필드 치환 + out 은 벤치로 + remapEvents', () => {
    const r = sideBCorrectPatch(m, 'b3', 'b7');
    expect(r.remapEvents).toEqual(['b3', 'b7']);
    expect(r.patch.assignments).toEqual({ 0: 'b1', 1: 'b7' });
    expect(r.patch.positionMap).toEqual({ b1: 'GK', b7: 'DF' });
    expect(r.patch.lineup).toEqual(['b1', 'b2']);            // b3 는 lineup 에 없었음 → 그대로
    expect(r.patch.subs).toEqual(['b2', 'b3']);              // out 은 벤치로, inn 은 벤치에서 제외
    expect(r.patch.defenders).toEqual(['b7']);
    expect(r.patch.gk).toBe('b1');
    expect(sideBCorrectPatch(m, 'b1', 'b8').patch.gk).toBe('b8');
  });
  it('pickSidePatch 는 포메이션 필드만 남긴다', () => {
    expect(pickSidePatch({ formation: '4-3-3', gk: 'x', events: [], status: 'y', subs: ['s'] }))
      .toEqual({ formation: '4-3-3', gk: 'x', subs: ['s'] });
  });
});
