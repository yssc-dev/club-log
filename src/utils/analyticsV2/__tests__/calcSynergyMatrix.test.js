import { describe, it, expect } from 'vitest';
import { calcSynergyMatrix } from '../calcSynergyMatrix';

describe('calcSynergyMatrix', () => {
  it('returns unique sorted player list', () => {
    const matchLogs = [
      { our_members_json: '["A","B","C"]', our_score: 1, opponent_score: 0 },
    ];
    const r = calcSynergyMatrix({ matchLogs, minRounds: 1 });
    expect(r.players).toEqual(['A', 'B', 'C']);
  });

  it('counts wins/draws/losses per pair', () => {
    const matchLogs = [
      { match_id: 'R1_C1', our_members_json: '["A","B"]', our_score: 2, opponent_score: 1 },
      { match_id: 'R2_C1', our_members_json: '["A","B"]', our_score: 1, opponent_score: 1 },
      { match_id: 'R3_C1', our_members_json: '["A","B"]', our_score: 0, opponent_score: 1 },
    ];
    const r = calcSynergyMatrix({ matchLogs, minRounds: 1 });
    const ab = r.cells['A|B'];
    expect(ab.games).toBe(3);
    expect(ab.wins).toBe(1);
    expect(ab.draws).toBe(1);
    expect(ab.losses).toBe(1);
    expect(ab.winRate).toBeCloseTo((1 + 0.5) / 3, 6);
  });

  it('diagonal = individual overall winRate, liftSymmetric=0', () => {
    const matchLogs = [
      { match_id: 'R1_C1', our_members_json: '["A","B"]', our_score: 2, opponent_score: 1 },
      { match_id: 'R2_C1', our_members_json: '["A","C"]', our_score: 0, opponent_score: 1 },
    ];
    const r = calcSynergyMatrix({ matchLogs, minRounds: 1 });
    const aa = r.cells['A|A'];
    expect(aa.games).toBe(2);
    expect(aa.wins).toBe(1);
    expect(aa.winRate).toBe(0.5);
    expect(aa.liftSymmetric).toBe(0);
  });

  it('liftSymmetric = pair winRate - duo 라운드 제외 개인 승률 평균 (calcGoldenTrio와 동일 베이스라인)', () => {
    const matchLogs = [
      // A,B 같이 4승 0패 → pair 1.0
      ...Array.from({ length: 4 }, (_, i) => ({ match_id: `R${i}_C1`, our_members_json: '["A","B"]', our_score: 1, opponent_score: 0 })),
      // A 혼자 (B 없이) 0승 2패
      { match_id: 'X1_C1', our_members_json: '["A","C"]', our_score: 0, opponent_score: 1 },
      { match_id: 'X2_C1', our_members_json: '["A","D"]', our_score: 0, opponent_score: 1 },
      // B 혼자 0승 2패
      { match_id: 'Y1_C1', our_members_json: '["B","E"]', our_score: 0, opponent_score: 1 },
      { match_id: 'Y2_C1', our_members_json: '["B","F"]', our_score: 0, opponent_score: 1 },
    ];
    const r = calcSynergyMatrix({ matchLogs, minRounds: 1 });
    // duo 제외 A 개인: 0승 2패 = 0, duo 제외 B 개인: 0승 2패 = 0, AB pair: 1.0
    // lift = 1.0 - (0 + 0)/2 = 1.0 (duo 라운드가 개인 베이스라인을 오염시키지 않음)
    expect(r.cells['A|B'].liftSymmetric).toBeCloseTo(1.0, 5);
    expect(r.cells['A|B'].baselineUnavailable).toBe(false);
  });

  it('항상 동행한 페어는 baselineUnavailable=true (한쪽만 단독 표본 없어도 true)', () => {
    const matchLogs = [
      // A,B 항상 함께 2승
      { match_id: 'R1_C1', our_members_json: '["A","B"]', our_score: 1, opponent_score: 0 },
      { match_id: 'R2_C1', our_members_json: '["A","B"]', our_score: 1, opponent_score: 0 },
      // A만 단독 표본 1개 보유, B는 단독 표본 없음
      { match_id: 'R3_C1', our_members_json: '["A","C"]', our_score: 0, opponent_score: 1 },
    ];
    const r = calcSynergyMatrix({ matchLogs, minRounds: 1 });
    expect(r.cells['A|B'].baselineUnavailable).toBe(true); // B 단독 표본 없음
    expect(r.cells['A|C'].baselineUnavailable).toBe(true); // C 단독 표본 없음
  });

  it('cells with games < minRounds still present but flagged via games<min', () => {
    const matchLogs = [
      { our_members_json: '["A","B"]', our_score: 1, opponent_score: 0 },
    ];
    const r = calcSynergyMatrix({ matchLogs, minRounds: 5 });
    expect(r.cells['A|B'].games).toBe(1);
  });

  it('skips malformed our_members_json', () => {
    const matchLogs = [
      { our_members_json: 'not-json', our_score: 1, opponent_score: 0 },
      { our_members_json: '["A"]', our_score: 1, opponent_score: 0 },
    ];
    const r = calcSynergyMatrix({ matchLogs, minRounds: 1 });
    expect(r.players).toEqual(['A']);
  });
});

// 2026-08-21 동적 진입선: minRounds 생략 시 동반 최다 라운드(자기 셀 제외)의 30%(올림)
import { describe as d2, it as it2, expect as ex2 } from 'vitest';
d2('calcSynergyMatrix 동적 진입선', () => {
  const mk = (i, home, away) => ({
    date: `2026-01-${String(i + 1).padStart(2, '0')}`, match_id: 'R1_C1',
    our_members_json: JSON.stringify(home), opponent_members_json: JSON.stringify(away),
    our_score: 1, opponent_score: 0,
  });
  it2('자기 셀(개인 출전수)은 최대치에서 제외하고 페어 최다의 30%만 쓴다', () => {
    // A 솔로 10경기(자기 셀 A|A=10, 페어 없음) + C|D 3경기 → 페어 최다 3 → ceil(0.9)=1
    const matchLogs = [
      ...Array.from({ length: 10 }, (_, i) => mk(i, ['A'], ['Z'])),
      ...Array.from({ length: 3 }, (_, i) => mk(i + 10, ['C', 'D'], ['E', 'F'])),
    ];
    const m = calcSynergyMatrix({ matchLogs });
    ex2(m.minRounds).toBe(1); // 자기 셀(10) 포함이면 3이 됨
  });
  it2('minRounds 명시 시 그 값 유지 (축구 경로)', () => {
    const matchLogs = [mk(0, ['C', 'D'], ['E', 'F'])];
    ex2(calcSynergyMatrix({ matchLogs, minRounds: 5 }).minRounds).toBe(5);
  });
});
