import { describe, it, expect } from 'vitest';
import { calcGoldenTrio } from '../calcGoldenTrio';

const mk = (id, members, our_score, opponent_score) => ({
  match_id: id,
  our_members_json: JSON.stringify(members),
  our_score,
  opponent_score,
});

describe('calcGoldenTrio', () => {
  it('sorts pairs by chemistry desc (winRate above individual avg)', () => {
    const matchLogs = [
      mk('R1_C1', ['A','B','C'], 2, 0),
      mk('R2_C1', ['A','B','C'], 3, 1),
      mk('R3_C1', ['A','B','C'], 0, 1),
      mk('R4_C1', ['A','B','D'], 1, 0),
      mk('R5_C1', ['A','B','D'], 0, 2),
      mk('R6_C1', ['A','B','D'], 0, 2),
    ];
    const r = calcGoldenTrio({ matchLogs, minRounds: 3, topN: 5 });
    expect(r[0].winRate).toBeCloseTo(2 / 3, 5);
    expect(r[0].chemistry).toBeGreaterThan(0);
    expect(r[r.length - 1].chemistry).toBeLessThanOrEqual(r[0].chemistry);
  });

  it('filters trios below minRounds', () => {
    const matchLogs = [
      mk('R1_C1', ['A','B','C'], 1, 0),
      mk('R2_C1', ['A','B','D'], 1, 0),
      mk('R3_C1', ['A','B','D'], 1, 0),
      mk('R4_C1', ['A','B','D'], 1, 0),
    ];
    const r = calcGoldenTrio({ matchLogs, minRounds: 3, topN: 5 });
    const ab = r.find(x => x.members[0] === 'A' && x.members[1] === 'B');
    const ad = r.find(x => x.members[0] === 'A' && x.members[1] === 'D');
    const bd = r.find(x => x.members[0] === 'B' && x.members[1] === 'D');
    expect(ab).toBeTruthy();
    expect(ad).toBeTruthy();
    expect(bd).toBeTruthy();
    expect(r.find(x => x.members.includes('C'))).toBeUndefined();
  });

  it('teams with <2 members produce no pairs', () => {
    const matchLogs = [
      mk('R1_C1', ['A'], 1, 0),
    ];
    const r = calcGoldenTrio({ matchLogs, minRounds: 1, topN: 5 });
    expect(r).toEqual([]);
  });

  it('개인 baseline은 duo 라운드 제외하고 계산', () => {
    // A, B는 R1~R5 같이 뛰며 5승, R6~R10은 따로 5패
    const logs = [];
    for (let i = 1; i <= 5; i++) logs.push(mk(`R${i}_C1`, ['A','B','X'], 1, 0));
    for (let i = 6; i <= 10; i++) logs.push(mk(`R${i}_C1`, ['A','C'], 0, 1));
    for (let i = 11; i <= 15; i++) logs.push(mk(`R${i}_C1`, ['B','D'], 0, 1));
    const r = calcGoldenTrio({ matchLogs: logs, minRounds: 5, topN: 5 });
    const ab = r.find(x => x.members[0] === 'A' && x.members[1] === 'B');
    expect(ab.winRate).toBe(1);
    // A 개인(duo 제외) = 0/5, B 개인(duo 제외) = 0/5 → indivAvg=0
    expect(ab.indivAvg).toBe(0);
    expect(ab.chemistry).toBe(1);
  });

  it('항상 동행 페어는 baselineUnavailable=true, 정렬 시 측정 가능한 페어 뒤로', () => {
    const logs = [
      // A,B 항상 함께 3승 (단독 표본 없음 → 측정 불가)
      mk('R1_C1', ['A','B'], 1, 0),
      mk('R2_C1', ['A','B'], 1, 0),
      mk('R3_C1', ['A','B'], 1, 0),
      // C,D 함께 3승 + 각자 단독 1패 (측정 가능, chemistry > 0)
      mk('R4_C1', ['C','D'], 1, 0),
      mk('R5_C1', ['C','D'], 1, 0),
      mk('R6_C1', ['C','D'], 1, 0),
      mk('R7_C1', ['C','X'], 0, 1),
      mk('R8_C1', ['D','Y'], 0, 1),
    ];
    const r = calcGoldenTrio({ matchLogs: logs, minRounds: 3, topN: 5 });
    const ab = r.find(x => x.members[0] === 'A' && x.members[1] === 'B');
    const cd = r.find(x => x.members[0] === 'C' && x.members[1] === 'D');
    expect(ab.baselineUnavailable).toBe(true);
    expect(cd.baselineUnavailable).toBe(false);
    // 측정 가능한 CD가 측정 불가 AB보다 앞
    expect(r.indexOf(cd)).toBeLessThan(r.indexOf(ab));
  });

  it('한쪽만 단독 표본이 없어도 baselineUnavailable=true (비대칭 오염 방지)', () => {
    const logs = [
      mk('R1_C1', ['A','B'], 1, 0),
      mk('R2_C1', ['A','B'], 1, 0),
      mk('R3_C1', ['A','B'], 1, 0),
      mk('R4_C1', ['A','C'], 0, 1), // A만 단독 표본 보유
    ];
    const r = calcGoldenTrio({ matchLogs: logs, minRounds: 3, topN: 5 });
    const ab = r.find(x => x.members[0] === 'A' && x.members[1] === 'B');
    expect(ab.baselineUnavailable).toBe(true);
  });

  it('attackLift = 함께 뛴 라운드 팀득점/경기 − 개인 평균(duo 제외) 팀득점/경기', () => {
    const logs = [
      // A,B 함께 3라운드 — 팀 3득점씩 (경기당 3.0)
      mk('R1_C1', ['A','B'], 3, 0),
      mk('R2_C1', ['A','B'], 3, 1),
      mk('R3_C1', ['A','B'], 3, 2),
      // A 단독 2라운드 — 팀 1득점씩, B 단독 2라운드 — 팀 1득점씩 (개인 평균 1.0)
      mk('R4_C1', ['A','X'], 1, 0),
      mk('R5_C1', ['A','Y'], 1, 0),
      mk('R6_C1', ['B','X'], 1, 0),
      mk('R7_C1', ['B','Y'], 1, 0),
    ];
    const r = calcGoldenTrio({ matchLogs: logs, minRounds: 3, topN: 5 });
    const ab = r.find(x => x.members[0] === 'A' && x.members[1] === 'B');
    expect(ab.pairGoalsPerGame).toBeCloseTo(3.0, 5);
    expect(ab.indivGoalsPerGame).toBeCloseTo(1.0, 5);
    expect(ab.attackLift).toBeCloseTo(2.0, 5);
  });

  it('respects topN', () => {
    const matchLogs = [];
    let id = 0;
    for (const trio of [['A','B','C'], ['A','B','D'], ['A','B','E']]) {
      for (let i = 0; i < 3; i++) {
        matchLogs.push(mk(`R${++id}_C1`, trio, 1, 0));
      }
    }
    const r = calcGoldenTrio({ matchLogs, minRounds: 3, topN: 2 });
    expect(r).toHaveLength(2);
  });
});
