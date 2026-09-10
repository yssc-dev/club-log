import { describe, it, expect } from 'vitest';
import { subPool } from '../subPool';

const m = {
  assignments: { 0: 'a1', 1: 'a2' }, gk: 'a1',
  sideB: { name: 'B팀', assignments: { 0: 'b1', 1: 'b2' }, gk: 'b1' },
  events: [
    { id: '1', type: 'redCard', side: 'B', player: 'b2' },
    { id: '2', type: 'redCard', side: 'A', player: 'a2' },
  ],
};
const attendees = ['a1', 'a2', 'a3', 'b1', 'b2', 'b3', 'c1'];

describe('subPool', () => {
  it('A 탭: B 피치·B 퇴장자만 제외(내 편은 레코더가 제외)', () => {
    expect(subPool(m, 'A', attendees)).toEqual(['a1', 'a2', 'a3', 'b3', 'c1']);
  });
  it('B 탭: A 피치·A 퇴장자만 제외', () => {
    expect(subPool(m, 'B', attendees)).toEqual(['a3', 'b1', 'b2', 'b3', 'c1']);
  });
  it('외부전은 참석자를 그대로 돌려준다', () => {
    const ext = { assignments: { 0: 'a1' }, events: [] };
    expect(subPool(ext, 'A', attendees)).toBe(attendees);
  });
});
