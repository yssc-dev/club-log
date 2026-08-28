import { describe, it, expect } from 'vitest';
import { leagueForComposition, isLeagueByGuests } from '../leagueRule';

describe('leagueForComposition (기록 시점 라벨)', () => {
  it('단식: 회원끼리(2/2)만 길로틴', () => {
    expect(leagueForComposition('단식', 2, 2)).toBe('길로틴');
    expect(leagueForComposition('단식', 1, 2)).toBe('미반영');
    expect(leagueForComposition('단식', 2, 3)).toBe('미반영');   // 인원 불일치
  });
  it('복식: 4명 중 회원 3명 이상이면 투몽, 2명 이하면 미반영', () => {
    expect(leagueForComposition('복식', 4, 4)).toBe('투몽');
    expect(leagueForComposition('복식', 3, 4)).toBe('투몽');
    expect(leagueForComposition('복식', 2, 4)).toBe('미반영');
    expect(leagueForComposition('복식', 3, 3)).toBe('미반영');   // 인원 부족
  });
  it('형식 불명은 미반영', () => {
    expect(leagueForComposition('', 2, 2)).toBe('미반영');
    expect(leagueForComposition(undefined, 4, 4)).toBe('미반영');
  });
});

describe('isLeagueByGuests (분석 시점)', () => {
  it('단식 게스트 0 / 복식 게스트 ≤1', () => {
    expect(isLeagueByGuests('단식', 0)).toBe(true);
    expect(isLeagueByGuests('단식', 1)).toBe(false);
    expect(isLeagueByGuests('복식', 1)).toBe(true);
    expect(isLeagueByGuests('복식', 2)).toBe(false);
    expect(isLeagueByGuests('기타', 0)).toBe(false);
  });
});
