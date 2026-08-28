import { describe, it, expect } from 'vitest';
import { calcMatchPoints, DEFAULT_POINT_RULES } from '../rankPoints';
import { LEAGUE_TOUR, LEAGUE_CHALLENGER } from '../tennisSchema';

const p = (over = {}) => ({
  name: 'x', grade: '동배', leagueTier: LEAGUE_TOUR, winRate: 0.5, isGuest: false, ...over,
});
const ctx = (over = {}) => ({
  format: '단식', league: '길로틴', winner: p(), loser: p({ name: 'y' }), ...over,
});

describe('기본', () => {
  it('아무 조건도 안 걸리면 기본승 1점', () => {
    expect(calcMatchPoints(ctx({
      winner: p({ winRate: 0.8 }), loser: p({ name: 'y', winRate: 0.3 }),
    }))).toBe(1);
  });

  it('복식은 포인트가 없다', () => {
    expect(calcMatchPoints(ctx({ format: '복식', league: '투몽' }))).toBe(0);
  });

  it('리그 미성립 판은 포인트가 없다', () => {
    expect(calcMatchPoints(ctx({ league: '미반영' }))).toBe(0);
  });
});

describe('승률 역전 (+2)', () => {
  it('같은 리그에서 승률 낮은 쪽이 이기면 1+2', () => {
    expect(calcMatchPoints(ctx({
      winner: p({ winRate: 0.2, leagueTier: LEAGUE_TOUR }),
      loser: p({ name: 'y', winRate: 0.9, leagueTier: LEAGUE_TOUR }),
    }))).toBe(3);
  });

  it('승률이 같으면 역전이 아니다', () => {
    expect(calcMatchPoints(ctx({
      winner: p({ winRate: 0.5 }), loser: p({ name: 'y', winRate: 0.5 }),
    }))).toBe(1);
  });

  it('리그가 다르면 +2는 걸리지 않는다 (상호 배타)', () => {
    const got = calcMatchPoints(ctx({
      winner: p({ winRate: 0.2, leagueTier: LEAGUE_TOUR }),
      loser: p({ name: 'y', winRate: 0.9, leagueTier: LEAGUE_CHALLENGER }),
    }));
    expect(got).toBe(1); // 기사가 장미를 이긴 것 — 역전 아님
  });
});

describe('리그 역전 (+3)', () => {
  it('장미가 기사를 이기면 1+3', () => {
    expect(calcMatchPoints(ctx({
      winner: p({ leagueTier: LEAGUE_CHALLENGER, winRate: 0.9 }),
      loser: p({ name: 'y', leagueTier: LEAGUE_TOUR, winRate: 0.9 }),
    }))).toBe(4);
  });

  it('기사가 장미를 이기면 보너스 없음', () => {
    expect(calcMatchPoints(ctx({
      winner: p({ leagueTier: LEAGUE_TOUR }),
      loser: p({ name: 'y', leagueTier: LEAGUE_CHALLENGER }),
    }))).toBe(1);
  });
});

describe('등급 역전 (+5)', () => {
  it('동배가 은배를 이기면 1+5', () => {
    expect(calcMatchPoints(ctx({
      winner: p({ grade: '동배', winRate: 0.9 }),
      loser: p({ name: 'y', grade: '은배', winRate: 0.9 }),
    }))).toBe(6);
  });

  it('기본 규칙에서는 2단계 차이도 5점 (차이 무관)', () => {
    expect(calcMatchPoints(ctx({
      winner: p({ grade: '동배', winRate: 0.9 }),
      loser: p({ name: 'y', grade: '금배', winRate: 0.9 }),
    }))).toBe(6);
  });

  it('gradeUpsetPerStep을 켜면 단계당 가산 — 동배→금배는 1+10', () => {
    expect(calcMatchPoints(ctx({
      winner: p({ grade: '동배', winRate: 0.9 }),
      loser: p({ name: 'y', grade: '금배', winRate: 0.9 }),
    }), { ...DEFAULT_POINT_RULES, gradeUpsetPerStep: true })).toBe(11);
  });

  it('용병이 끼면 등급 가산을 건너뛴다', () => {
    expect(calcMatchPoints(ctx({
      league: '길로틴',
      winner: p({ grade: '', isGuest: true, winRate: 0.9 }),
      loser: p({ name: 'y', grade: '은배', winRate: 0.9 }),
    }))).toBe(1);
  });
});

describe('누적 최대', () => {
  it('장미+동배가 기사+은배를 이기면 1+3+5 = 9점', () => {
    expect(calcMatchPoints(ctx({
      winner: p({ leagueTier: LEAGUE_CHALLENGER, grade: '동배', winRate: 0.9 }),
      loser: p({ name: 'y', leagueTier: LEAGUE_TOUR, grade: '은배', winRate: 0.9 }),
    }))).toBe(9);
  });

  it('동일리그 승률역전 + 등급역전은 1+2+5 = 8점', () => {
    expect(calcMatchPoints(ctx({
      winner: p({ leagueTier: LEAGUE_TOUR, grade: '동배', winRate: 0.1 }),
      loser: p({ name: 'y', leagueTier: LEAGUE_TOUR, grade: '은배', winRate: 0.9 }),
    }))).toBe(8);
  });
});
