import { describe, it, expect } from 'vitest';
import { calcSynergyMatrix } from '../calcSynergyMatrix';
import { calcGoldenTrio } from '../calcGoldenTrio';

// match_id가 빈 레거시 행: 같은 날짜의 서로 다른 매치가 동일 roundKey('date|')로
// 합쳐져 첫 매치 이후가 dedupe로 누락되면 안 됨.

describe('빈 match_id 매치의 roundKey 충돌 방지', () => {
  const matchLogs = [
    { date: '2026-01-01', match_id: '', our_members_json: '["A","B"]', our_score: 1, opponent_score: 0 },
    { date: '2026-01-01', match_id: '', our_members_json: '["A","B"]', our_score: 0, opponent_score: 1 },
  ];

  it('calcSynergyMatrix: 같은 날짜의 id 없는 매치 2개를 각각 집계', () => {
    const r = calcSynergyMatrix({ matchLogs, minRounds: 1 });
    expect(r.cells['A|B'].games).toBe(2);
    expect(r.cells['A|B'].wins).toBe(1);
    expect(r.cells['A|B'].losses).toBe(1);
  });

  it('calcGoldenTrio: 같은 날짜의 id 없는 매치 2개를 각각 집계', () => {
    const r = calcGoldenTrio({ matchLogs, minRounds: 1 });
    expect(r[0].games).toBe(2);
  });
});
