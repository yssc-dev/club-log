import { describe, it, expect } from 'vitest';
import { calcFieldDefense } from '../calcFieldDefense';

// 개인 축 필드 수비 지표 (풋살 전용, 포지션·조합 개념 없음):
//   ① 무실점률 = 필드로 뛴 매치 중 팀 무실점 비율
//   ② 실점 억제(suppression) = 그날 세션 전체 사이드 평균 실점 − 본인 사이드 평균 실점 (양수=억제)
// GK가 기록된 사이드만 필드 귀속(기존 정책), 세션 베이스라인엔 전체 매치 포함.

const M = (date, home, away, ourScore, oppScore, gks = {}, id = 'R1_C1') => ({
  date, match_id: id,
  our_members_json: JSON.stringify(home), opponent_members_json: JSON.stringify(away),
  our_score: ourScore, opponent_score: oppScore,
  our_gk: gks.our ?? home[0], opponent_gk: gks.opp ?? away[0],
});

describe('calcFieldDefense', () => {
  it('GK는 제외하고 필드 선수의 무실점/2실점+/경기당 실점을 집계한다', () => {
    const { perPlayer } = calcFieldDefense({ matchLogs: [
      M('2026-06-04', ['G', 'A', 'B'], ['H', 'C'], 1, 0),           // A,B 필드 무실점
      M('2026-06-04', ['G', 'A'], ['H', 'C'], 0, 2, {}, 'R2_C1'),   // A 필드 2실점
    ] });
    expect(perPlayer.A).toMatchObject({ fieldRounds: 2, cleanSheets: 1, multiConceded: 1 });
    expect(perPlayer.A.cleanRate).toBeCloseTo(0.5);
    expect(perPlayer.A.concededPerGame).toBeCloseTo(1.0);
    expect(perPlayer.G).toBeUndefined(); // GK는 필드 집계 제외
  });

  it('실점 억제 = 세션 평균 실점 − 본인 평균 (양수=억제)', () => {
    // 세션 사이드 실점: [0, 1, 2, 3] → 평균 1.5. A는 실점 0·2 매치 출전 → 본인 평균 1.0 → 억제 +0.5
    const { perPlayer } = calcFieldDefense({ matchLogs: [
      M('2026-06-04', ['G', 'A'], ['H', 'B'], 1, 0),                 // A측 실점 0 / B측 실점 1
      M('2026-06-04', ['G', 'A'], ['H', 'B'], 3, 2, {}, 'R2_C1'),    // A측 실점 2 / B측 실점 3
    ] });
    expect(perPlayer.A.suppression).toBeCloseTo(0.5);
    expect(perPlayer.B.suppression).toBeCloseTo(-0.5);
  });

  it('GK 미기록 사이드는 필드 귀속에서 빠지지만 세션 베이스라인에는 들어간다', () => {
    const { perPlayer } = calcFieldDefense({ matchLogs: [
      M('2026-06-04', ['G', 'A'], ['H', 'B'], 0, 0),                              // A 무실점, 세션 실점 [0,0]
      M('2026-06-04', ['C', 'D'], ['E', 'F'], 4, 4, { our: '', opp: '' }, 'R2_C1'), // GK 미기록 — 베이스라인만 [4,4]
    ] });
    expect(perPlayer.C).toBeUndefined();
    // 세션 평균 = (0+0+4+4)/4 = 2 → A 억제 = 2 − 0 = +2
    expect(perPlayer.A.suppression).toBeCloseTo(2);
  });

  it('휴식(absent)·is_extra 제외', () => {
    const { perPlayer } = calcFieldDefense({ matchLogs: [
      { ...M('2026-06-04', ['G', 'A'], ['H', 'B'], 1, 0), our_members_json: JSON.stringify({ players: ['G', 'A', 'Z'], absent: ['Z'] }) },
      { ...M('2026-06-04', ['G', 'A'], ['H', 'B'], 0, 9, {}, 'R2_C1'), is_extra: true },
    ] });
    expect(perPlayer.Z).toBeUndefined();
    expect(perPlayer.A.fieldRounds).toBe(1);
  });

  it('랭킹: 무실점률 내림차순 / 억제 내림차순, 진입선 = 필드 최다의 30%(올림) 동적', () => {
    const many = (n, home, away, ourScore, oppScore) =>
      Array.from({ length: n }, (_, i) => M(`2026-0${1 + (i % 6)}-0${1 + (i % 9)}`, home, away, ourScore, oppScore, {}, `R${i}_C1`));
    const matchLogs = [
      ...many(10, ['G', 'Best'], ['H', 'Worst'], 1, 0),  // Best 10경기 전부 무실점 / Worst 10경기 전부 1실점
      ...many(3, ['G', 'In'], ['H', 'X'], 0, 0),         // In 3경기 무실점 — ceil(10×0.3)=3 → 통과
      ...many(2, ['G', 'Out'], ['H', 'Y'], 0, 0),        // Out 2경기 → 미달
    ];
    const r = calcFieldDefense({ matchLogs });
    expect(r.thresholds.minFieldRounds).toBe(3);
    const cleanNames = r.ranking.cleanRate.map(x => x.player);
    expect(cleanNames).toContain('Best');
    expect(cleanNames).toContain('In');
    expect(cleanNames).not.toContain('Out');
    expect(r.ranking.suppression[0].player).toBe('Best'); // 억제 1위
  });

  it('진입선: 경기 수를 채워도 경기일 수가 최다치의 30% 미만이면 제외', () => {
    const on = (date, n, home, away, ourScore, oppScore) =>
      Array.from({ length: n }, (_, i) => M(date, home, away, ourScore, oppScore, {}, `R${i}_C1`));
    const matchLogs = [
      // Reg: 10일 × 1경기 = 10경기·10일
      ...Array.from({ length: 10 }, (_, i) => M(`2026-07-${10 + i}`, ['G', 'Reg'], ['H', 'X'], 1, 1)),
      // Burst: 2일 × 5경기 = 10경기·2일 (전부 무실점) — 경기 수는 같지만 경기일 진입선 ceil(10×0.3)=3 미달
      ...on('2026-08-01', 5, ['G', 'Burst'], ['H', 'Y'], 1, 0),
      ...on('2026-08-02', 5, ['G', 'Burst'], ['H', 'Y'], 1, 0),
    ];
    const r = calcFieldDefense({ matchLogs });
    expect(r.thresholds).toMatchObject({ minFieldRounds: 3, minFieldDates: 3, maxFieldDates: 10 });
    expect(r.perPlayer.Burst).toMatchObject({ fieldRounds: 10, fieldDates: 2 });
    expect(r.ranking.cleanRate.map(x => x.player)).not.toContain('Burst');
    expect(r.ranking.suppression.map(x => x.player)).not.toContain('Burst');
    expect(r.ranking.cleanRate.map(x => x.player)).toContain('Reg');
  });

  it('보정: 경기일이 적을수록 평균 쪽으로 — 원값이 같아도 경기일 많은 쪽이 위, 원값은 보존', () => {
    // Few·Many 모두 매 경기 무실점(원 무실점률 100%, 원 억제 +0.5). Few 3일, Many 9일.
    const day = (date, name) => M(date, ['G', name], ['H', `opp_${name}`], 1, 0);
    const matchLogs = [
      ...Array.from({ length: 3 }, (_, i) => day(`2026-07-0${1 + i}`, 'Few')),
      ...Array.from({ length: 9 }, (_, i) => day(`2026-08-0${1 + i}`, 'Many')),
    ];
    const r = calcFieldDefense({ matchLogs });
    // 경기일 진입선 K = ceil(9×0.3) = 3 → w(Few)=3/6=0.5, w(Many)=9/12=0.75. 리그 무실점률 = 12/24 = 0.5
    expect(r.thresholds.minFieldDates).toBe(3);
    expect(r.leagueCleanRate).toBeCloseTo(0.5);
    expect(r.perPlayer.Few.cleanRate).toBeCloseTo(1);         // 원값 보존
    expect(r.perPlayer.Few.suppression).toBeCloseTo(0.5);
    expect(r.perPlayer.Few.cleanRateAdj).toBeCloseTo(0.75);   // 0.5 + 0.5×0.5
    expect(r.perPlayer.Many.cleanRateAdj).toBeCloseTo(0.875); // 0.5 + 0.5×0.75
    expect(r.perPlayer.Few.suppressionAdj).toBeCloseTo(0.25);
    expect(r.perPlayer.Many.suppressionAdj).toBeCloseTo(0.375);
    expect(r.ranking.cleanRate.map(x => x.player).slice(0, 2)).toEqual(['Many', 'Few']);
    expect(r.ranking.suppression[0]).toMatchObject({ player: 'Many', raw: 0.5, fieldDates: 9 });
    expect(r.ranking.suppression[0].value).toBeCloseTo(0.375);
  });
});
