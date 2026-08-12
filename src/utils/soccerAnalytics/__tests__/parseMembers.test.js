import { describe, it, expect } from 'vitest';
import { parseMembersWithAbsent, parseActualPlayers } from '../parseMembers';

describe('parseMembersWithAbsent', () => {
  it('레거시 배열 형식 → players=actual, absent 비어있음', () => {
    expect(parseMembersWithAbsent('["A","B","C"]')).toEqual({
      players: ['A', 'B', 'C'], absent: [], actual: ['A', 'B', 'C'],
    });
  });

  it('객체 형식 → players/absent 분리', () => {
    expect(parseMembersWithAbsent('{"players":["A","B","C","D"],"absent":["D"]}')).toEqual({
      players: ['A', 'B', 'C', 'D'], absent: ['D'], actual: ['A', 'B', 'C'],
    });
  });

  it('absent에 roster에 없는 이름이면 무시', () => {
    expect(parseMembersWithAbsent('{"players":["A","B"],"absent":["Z"]}')).toEqual({
      players: ['A', 'B'], absent: [], actual: ['A', 'B'],
    });
  });

  it('빈/잘못된 입력 → 빈 결과', () => {
    expect(parseMembersWithAbsent('')).toEqual({ players: [], absent: [], actual: [] });
    expect(parseMembersWithAbsent('garbage')).toEqual({ players: [], absent: [], actual: [] });
    expect(parseMembersWithAbsent(null)).toEqual({ players: [], absent: [], actual: [] });
  });

  it('parseActualPlayers는 actual만 반환', () => {
    expect(parseActualPlayers('{"players":["A","B","C"],"absent":["B"]}')).toEqual(['A', 'C']);
    expect(parseActualPlayers('["X","Y"]')).toEqual(['X', 'Y']);
  });
});
