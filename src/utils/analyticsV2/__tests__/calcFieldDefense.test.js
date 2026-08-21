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
});
