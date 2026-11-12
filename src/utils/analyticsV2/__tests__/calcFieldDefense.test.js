import { describe, it, expect } from 'vitest';
import { calcFieldDefense } from '../calcFieldDefense';

// 풋살 「수비력」 단일 소스 (2026-11-11 통일, 포지션·조합 개념 없음):
//   수비력(suppression) = 그날 세션 전체 사이드 평균 실점 − 본인 사이드 평균 실점 (양수=덜 먹힘)
//   랭킹은 원값 그대로(평균 쪽 보정 없음) + 근거(경기·실점·경기당·그날 평균) 동봉.
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

  it('랭킹: 수비력 내림차순, 진입선 = 필드 최다의 30%(올림) 동적', () => {
    const many = (n, home, away, ourScore, oppScore) =>
      Array.from({ length: n }, (_, i) => M(`2026-0${1 + (i % 6)}-0${1 + (i % 9)}`, home, away, ourScore, oppScore, {}, `R${i}_C1`));
    const matchLogs = [
      ...many(10, ['G', 'Best'], ['H', 'Worst'], 1, 0),  // Best 10경기 전부 무실점 / Worst 10경기 전부 1실점
      ...many(3, ['G', 'In'], ['H', 'X'], 0, 0),         // In 3경기 무실점 — ceil(10×0.3)=3 → 통과
      ...many(2, ['G', 'Out'], ['H', 'Y'], 0, 0),        // Out 2경기 → 미달
    ];
    const r = calcFieldDefense({ matchLogs });
    expect(r.thresholds.minFieldRounds).toBe(3);
    const names = r.ranking.map(x => x.player);
    expect(names).toContain('In');
    expect(names).not.toContain('Out');
    expect(names[0]).toBe('Best');
    expect(names.indexOf('Best')).toBeLessThan(names.indexOf('Worst'));
  });

  // 2026-11-12: 경기일 진입선 기본 해제(필드 경기 수 30%만). minFieldDates 를 명시하면 여전히 건다.
  it('진입선: 기본은 필드 경기 수 30%만 — 경기일이 적어도 통과, minFieldDates 명시 시 제외', () => {
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
    expect(r.thresholds).toMatchObject({ minFieldRounds: 3, minFieldDates: 0, maxFieldDates: 10 });
    expect(r.perPlayer.Burst).toMatchObject({ fieldRounds: 10, fieldDates: 2 });
    expect(r.ranking.map(x => x.player)).toContain('Burst');
    expect(r.ranking.map(x => x.player)).toContain('Reg');
    const gated = calcFieldDefense({ matchLogs, minFieldDates: 3 });
    expect(gated.ranking.map(x => x.player)).not.toContain('Burst');
  });

  // 2026-11-12: 랭킹 값 = 필드 경기당 실점(낮은 순). 그날 평균 대비(suppression)는 perPlayer 에만 남는다.
  it('랭킹 값은 필드 경기당 실점(낮은 순)이고 근거 수치를 함께 싣는다', () => {
    // 하루: A측 실점 [0, 2], B측 실점 [1, 3]. A = 2경기 2실점 경기당 1.0, B = 2경기 4실점 경기당 2.0
    const matchLogs = [
      M('2026-06-04', ['G', 'A'], ['H', 'B'], 1, 0),
      M('2026-06-04', ['G', 'A'], ['H', 'B'], 3, 2, {}, 'R2_C1'),
    ];
    const r = calcFieldDefense({ matchLogs });
    expect(r.ranking[0]).toMatchObject({ player: 'A', fieldRounds: 2, fieldDates: 1, conceded: 2, cleanSheets: 1 });
    expect(r.ranking[0].value).toBeCloseTo(1.0);
    expect(r.ranking[0].concededPerGame).toBeCloseTo(1.0);
    expect(r.ranking[0].baselinePerGame).toBeCloseTo(1.5);
    expect(r.ranking[1]).toMatchObject({ player: 'B', conceded: 4 });
    expect(r.ranking[1].value).toBeCloseTo(2.0);
    expect(r.perPlayer.A.suppression).toBeCloseTo(0.5); // 계산은 남지만 순위엔 안 쓴다
    expect(r.perPlayer.A.suppressionAdj).toBeUndefined(); // 보정값 폐기
  });
});
