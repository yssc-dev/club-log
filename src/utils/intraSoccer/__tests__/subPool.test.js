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
  it('상대 편에서 교체 아웃된 선수도 내 편 후보에서 제외한다(출전 이력 기준)', () => {
    const mm = {
      lineup: ['a1', 'a2'], assignments: { 0: 'a1', 1: 'a2' }, gk: 'a1',
      sideB: { name: 'B팀', lineup: ['b1', 'b2'], assignments: { 0: 'b1', 1: 'b3' }, gk: 'b1' },
      events: [
        { id: 's1', type: 'sub', side: 'B', playerOut: 'b2', playerIn: 'b3', position: 'DF', posIdx: 1 },
      ],
    };
    // b2 는 B 피치에 없지만 B 로 뛰었다 → A 후보에서 제외. b3(교체 투입)·b1(피치)도 제외.
    expect(subPool(mm, 'A', ['a1', 'a2', 'a3', 'b1', 'b2', 'b3', 'c1'])).toEqual(['a1', 'a2', 'a3', 'c1']);
    // B 탭: A 출전자(a1,a2) 제외
    expect(subPool(mm, 'B', ['a1', 'a2', 'a3', 'b1', 'b2', 'b3', 'c1'])).toEqual(['a3', 'b1', 'b2', 'b3', 'c1']);
  });
});
