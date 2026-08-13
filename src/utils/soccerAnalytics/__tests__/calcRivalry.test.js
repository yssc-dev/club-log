import { describe, it, expect } from 'vitest';
import { calcRivalry, calcPersonalRivalry } from '../calcRivalry';

let seq = 0;
const match = (ourMembers, oppMembers, ourScore, oppScore) => ({
  date: '2026-01-01', match_id: `R${++seq}_C1`,
  our_members_json: JSON.stringify(ourMembers),
  opponent_members_json: JSON.stringify(oppMembers),
  our_score: ourScore, opponent_score: oppScore,
});

describe('calcRivalry', () => {
  it('반대팀으로 만난 라운드의 상대전적 집계 (A 2승 1패 vs B)', () => {
    const matchLogs = [
      match(['A'], ['B'], 1, 0), // A 승
      match(['A'], ['B'], 2, 1), // A 승
      match(['B'], ['A'], 3, 0), // B 승 (A 어웨이 자리)
    ];
    const r = calcRivalry({ matchLogs });
    const p = calcPersonalRivalry({ rivalry: r, player: 'A', minRounds: 1 });
    const vsB = p.opponents.find(x => x.opponent === 'B');
    expect(vsB).toMatchObject({ games: 3, wins: 2, losses: 1, draws: 0 });
    // B 관점은 미러
    const pb = calcPersonalRivalry({ rivalry: r, player: 'B', minRounds: 1 });
    expect(pb.opponents.find(x => x.opponent === 'A')).toMatchObject({ games: 3, wins: 1, losses: 2 });
  });

  it('같은 팀으로 뛴 라운드는 대결로 집계하지 않는다', () => {
    const matchLogs = [
      match(['A', 'B'], ['C'], 1, 0), // A,B 같은 팀
    ];
    const r = calcRivalry({ matchLogs });
    const p = calcPersonalRivalry({ rivalry: r, player: 'A', minRounds: 1 });
    expect(p.opponents.find(x => x.opponent === 'B')).toBeUndefined();
    expect(p.opponents.find(x => x.opponent === 'C')).toMatchObject({ games: 1, wins: 1 });
  });

  it('무승부 반영 + minRounds 미달은 personal 목록에서 isLowSample', () => {
    const matchLogs = [
      match(['A'], ['B'], 2, 2),
    ];
    const r = calcRivalry({ matchLogs });
    const p = calcPersonalRivalry({ rivalry: r, player: 'A', minRounds: 5 });
    const vsB = p.opponents.find(x => x.opponent === 'B');
    expect(vsB).toMatchObject({ games: 1, draws: 1, isLowSample: true });
    expect(vsB.winRate).toBeCloseTo(0.5, 5);
  });

  it('같은 (date, match_id) 중복 행은 한 번만 집계', () => {
    const row = match(['A'], ['B'], 1, 0);
    const r = calcRivalry({ matchLogs: [row, { ...row }] });
    const p = calcPersonalRivalry({ rivalry: r, player: 'A', minRounds: 1 });
    expect(p.opponents.find(x => x.opponent === 'B').games).toBe(1);
  });
});
