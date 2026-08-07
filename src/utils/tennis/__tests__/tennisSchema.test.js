import { describe, it, expect } from 'vitest';
import {
  TENNIS_SPORT, GRADES, GRADE_RANK,
  LEAGUE_BK, LEAGUE_BR,
  COMPETITION_SINGLES, COMPETITION_DOUBLES, COMPETITION_NONE,
  TENNIS_MATCH_COLUMNS, TENNIS_PLAYER_GAME_COLUMNS,
} from '../tennisSchema';

describe('상수', () => {
  it('종목/리그/대회 문자열', () => {
    expect(TENNIS_SPORT).toBe('테니스');
    expect(LEAGUE_BK).toBe('흑기사');
    expect(LEAGUE_BR).toBe('흑장미');
    expect(COMPETITION_SINGLES).toBe('길로틴');
    expect(COMPETITION_DOUBLES).toBe('투몽');
    expect(COMPETITION_NONE).toBe('미반영');
  });

  it('등급은 약→강 순서, GRADE_RANK로 비교 가능', () => {
    expect(GRADES).toEqual(['초보자', '동배', '은배', '금배']);
    expect(GRADE_RANK['동배']).toBeLessThan(GRADE_RANK['은배']);
    expect(GRADE_RANK['은배']).toBeLessThan(GRADE_RANK['금배']);
    expect(GRADE_RANK['']).toBeUndefined(); // 용병(등급 없음)
  });
});

describe('TENNIS_MATCH_COLUMNS', () => {
  it('21칸, 스펙 5.2 순서 그대로', () => {
    expect(TENNIS_MATCH_COLUMNS).toHaveLength(21);
    expect(TENNIS_MATCH_COLUMNS[0]).toBe('team');
    expect(TENNIS_MATCH_COLUMNS[8]).toBe('match_id');
    expect(TENNIS_MATCH_COLUMNS[13]).toBe('sets_json');
    expect(TENNIS_MATCH_COLUMNS[18]).toBe('winner');
    expect(TENNIS_MATCH_COLUMNS[20]).toBe('input_time');
  });

  it('구기 전용 필드가 섞이지 않는다', () => {
    for (const banned of ['goals', 'assists', 'our_gk', 'formation']) {
      expect(TENNIS_MATCH_COLUMNS).not.toContain(banned);
    }
  });
});

describe('TENNIS_PLAYER_GAME_COLUMNS', () => {
  it('29칸, 스펙 5.3 순서 그대로', () => {
    expect(TENNIS_PLAYER_GAME_COLUMNS).toHaveLength(29);
    expect(TENNIS_PLAYER_GAME_COLUMNS[0]).toBe('team');
    expect(TENNIS_PLAYER_GAME_COLUMNS[8]).toBe('player');
    expect(TENNIS_PLAYER_GAME_COLUMNS[15]).toBe('result');
    expect(TENNIS_PLAYER_GAME_COLUMNS[28]).toBe('input_time');
  });

  it('2차 지표에 필요한 컬럼이 전부 있다 (마이그레이션 방지)', () => {
    for (const col of [
      'tb_played', 'tb_won', 'aces', 'double_faults',
      'bagels_taken', 'bagels_given', 'grade_at_date',
      'partner', 'opponents_json', 'best_of',
    ]) {
      expect(TENNIS_PLAYER_GAME_COLUMNS).toContain(col);
    }
  });
});
