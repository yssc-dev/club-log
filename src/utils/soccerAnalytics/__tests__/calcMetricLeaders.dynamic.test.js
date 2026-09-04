// 2026-09-04 어워드 기간 토글: 축구 진입선을 '최근 한 달'에서만 동적으로 전환한다.
// 누적 경로(인자 생략)는 기존 고정값이라 화면이 바뀌면 안 된다 — 그걸 여기서 고정한다.
import { describe, it, expect } from 'vitest';
import { calcMetricLeaders } from '../calcMetricLeaders';

const P = (rounds, extra = {}) => ({
  rounds, keeperRounds: 0, fieldRounds: rounds, games: rounds,
  goals: rounds, assists: 0, conceded: 0, avgConceded: 0,
  matches: rounds, winRate: 0, teamGoals: 100, goalInvolvement: 0, ...extra,
});

describe('soccer calcMetricLeaders — 누적(기존 고정값) 경로', () => {
  const perPlayer = { 많음: P(18), 보통: P(9), 적음: P(3) };

  it('인자를 생략하면 minRounds 10 / minKeeperRounds 4 그대로', () => {
    const r = calcMetricLeaders({ perPlayer, totalSessions: 10 });
    expect(r.thresholds.minRounds).toBe(10);
    expect(r.thresholds.minKeeperRounds).toBe(4);
    expect(r.scoring.map(x => x.player)).toEqual(['많음']); // 9경기·3경기는 컷
  });

  it('명시적 숫자는 그대로 쓰인다 — 기존 호출자 무영향', () => {
    const r = calcMetricLeaders({ perPlayer, totalSessions: 10, minRounds: 3 });
    expect(r.thresholds.minRounds).toBe(3);
    expect(r.scoring).toHaveLength(3);
  });
});

describe('soccer calcMetricLeaders — 최근 한 달(null → 동적) 경로', () => {
  it('null을 넘기면 축 최대치의 30%로 완화된다', () => {
    // 최대 18 → ceil(18*0.3) = 6. 고정 10이면 1명만 통과하던 표본에서 2명이 통과.
    const perPlayer = { 많음: P(18), 보통: P(9), 적음: P(3) };
    const r = calcMetricLeaders({ perPlayer, totalSessions: 5, minRounds: null, minKeeperRounds: null });
    expect(r.thresholds.minRounds).toBe(6);
    expect(r.scoring.map(x => x.player)).toEqual(['많음', '보통']);
  });

  it('키퍼 진입선도 자기 축(keeperRounds) 최대치 기준으로 따로 잡힌다', () => {
    const perPlayer = {
      주전GK: P(10, { keeperRounds: 10, conceded: 5 }),
      백업GK: P(10, { keeperRounds: 3, conceded: 3 }),
    };
    const r = calcMetricLeaders({ perPlayer, totalSessions: 5, minRounds: null, minKeeperRounds: null });
    expect(r.thresholds.minKeeperRounds).toBe(3); // ceil(10*0.3)
    expect(r.keeping.map(x => x.player)).toEqual(['주전GK', '백업GK']);
  });

  it('수비 축은 minRounds를 계속 쓴다 — 축구엔 별도 minFieldRounds 축이 없다', () => {
    // 풋살은 entries(전원) 위에서 minFieldRounds로 거르지만 축구는 rated 위에서 minRounds로 건다.
    // 여기에 별도 축을 만들면 진입선 완화가 아니라 모집단 변경이 된다.
    const perPlayer = { 많음: P(18), 보통: P(9) };
    const r = calcMetricLeaders({ perPlayer, totalSessions: 5, minRounds: null, minKeeperRounds: null });
    expect(r.thresholds.minFieldRounds).toBe(r.thresholds.minRounds);
  });

  it('표본이 극소여도 진입선이 0으로 내려가지 않는다 — 0 나눗셈 방어', () => {
    // rounds=0인 선수는 이벤트만 있고 매치 기록이 없는 경우(레거시 부분명단).
    // 진입선이 0이면 goals/rounds가 Infinity로 1위에 오른다.
    const perPlayer = { 유령: P(0, { goals: 3 }), 실재: P(1, { goals: 1 }) };
    const r = calcMetricLeaders({ perPlayer, totalSessions: 1, minRounds: null, minKeeperRounds: null });
    expect(r.thresholds.minRounds).toBe(1);
    expect(r.scoring.map(x => x.player)).toEqual(['실재']);
    expect(r.scoring.every(x => Number.isFinite(x.value))).toBe(true);
  });
});
