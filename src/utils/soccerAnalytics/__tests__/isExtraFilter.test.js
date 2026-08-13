import { describe, it, expect } from 'vitest';
import { calcSynergyMatrix } from '../calcSynergyMatrix';
import { calcGoldenTrio } from '../calcGoldenTrio';
import { calcGkChemistry } from '../calcGkChemistry';
import { calcTrends } from '../calcTrends';

// is_extra(연습/이벤트성) 매치는 calcPlayerSummary/calcMonthlyRanking과 동일하게
// 모든 지표 계산에서 제외되어야 함 — 화면 간 수치 불일치 방지.

describe('is_extra 매치 제외 일관성', () => {
  it('calcSynergyMatrix: is_extra 매치는 페어 승률 집계에서 제외', () => {
    const matchLogs = [
      { date: '2026-01-01', match_id: 'R1_C0', our_members_json: '["A","B"]', our_score: 1, opponent_score: 0 },
      { date: '2026-01-01', match_id: 'X1_C0', our_members_json: '["A","B"]', our_score: 0, opponent_score: 5, is_extra: true },
    ];
    const r = calcSynergyMatrix({ matchLogs, minRounds: 1 });
    expect(r.cells['A|B'].games).toBe(1);
    expect(r.cells['A|B'].wins).toBe(1);
  });

  it('calcGoldenTrio: is_extra 매치는 듀오 케미 집계에서 제외', () => {
    const matchLogs = [
      { date: '2026-01-01', match_id: 'R1_C0', our_members_json: '["A","B"]', our_score: 1, opponent_score: 0 },
      { date: '2026-01-01', match_id: 'X1_C0', our_members_json: '["A","B"]', our_score: 0, opponent_score: 5, is_extra: true },
    ];
    const r = calcGoldenTrio({ matchLogs, minRounds: 1 });
    expect(r).toHaveLength(1);
    expect(r[0].games).toBe(1);
    expect(r[0].winRate).toBe(1);
  });

  it('calcGkChemistry: is_extra 매치는 무실점률 집계에서 제외', () => {
    const matchLogs = [
      { date: '2026-01-01', match_id: 'R1_C0', our_gk: 'GK1', our_members_json: '["GK1","A"]', our_score: 1, opponent_score: 0 },
      { date: '2026-01-01', match_id: 'X1_C0', our_gk: 'GK1', our_members_json: '["GK1","A"]', our_score: 1, opponent_score: 0, is_extra: true },
    ];
    const r = calcGkChemistry({ matchLogs, threshold: 1, includeOpponent: false });
    const pairA = r.byGk['GK1'].pairs.find(p => p.field === 'A');
    expect(pairA.rounds).toBe(1);
    expect(pairA.cleanSheets).toBe(1);
  });

  it('calcTrends: is_extra 매치는 세션 승률/경기수 분모에서 제외', () => {
    const playerLogs = [{ player: 'A', date: '2026-01-01', goals: 1, assists: 0 }];
    const matchLogs = [
      { date: '2026-01-01', our_members_json: '["A"]', our_score: 1, opponent_score: 0 },
      { date: '2026-01-01', our_members_json: '["A"]', our_score: 0, opponent_score: 5, is_extra: true },
    ];
    const r = calcTrends({ playerName: 'A', playerLogs, matchLogs });
    expect(r.points[0].winRate).toBe(1);
    expect(r.points[0].gpg).toBe(1);
  });
});
