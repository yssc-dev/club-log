import { describe, it, expect } from 'vitest';
import { calcDailyMvp } from '../calcDailyMvp';

const pg = (player, date, over = {}) => ({
  player, date, goals: 0, assists: 0, owngoals: 0, cleansheets: 0,
  crova: 0, goguma: 0, rank_score: 0, ...over,
});

describe('calcDailyMvp (최종포인트 = 골+어시+클린시트+크로바+고구마+역주행 — 랭크점수 제외)', () => {
  it('개인 포인트 합산 1위가 MVP — 랭크점수는 공식에 미포함', () => {
    const logs = [
      pg('A', '2026-06-04', { rank_score: 9, goals: 1 }),               // 1점 (랭크 미포함)
      pg('B', '2026-06-04', { rank_score: 1, goals: 2, assists: 1 }),   // 3점 ← MVP
    ];
    const r = calcDailyMvp({ playerGameLogs: logs });
    expect(r.ranking).toHaveLength(1);
    expect(r.ranking[0]).toMatchObject({ player: 'B', value: 1 });
    expect(r.recent[0].points).toBe(3);
  });

  it('역주행 정규화: 양수(개수)는 1개당 −2점, 음수는 이미 포인트라 그대로 합산', () => {
    const logs = [
      pg('A', '2026-06-04', { rank_score: 1, goals: 3, owngoals: 1 }),  // 3 − 2 = 1점 (개수 표기)
      pg('B', '2026-06-04', { rank_score: 1, goals: 4, owngoals: -4 }), // 4 − 4 = 0점 (포인트 표기)
      pg('C', '2026-06-04', { rank_score: 1, goals: 2 }),               // 2점 ← MVP
    ];
    const r = calcDailyMvp({ playerGameLogs: logs });
    expect(r.ranking[0]).toMatchObject({ player: 'C', value: 1 });
    expect(r.recent[0].points).toBe(2);
  });

  it('크로바(+)·고구마(−)·클린시트 모두 합산', () => {
    const logs = [
      pg('A', '2026-06-04', { rank_score: 1, crova: 2, goguma: -1, goals: 1 }), // 2점
      pg('B', '2026-06-04', { rank_score: 1, cleansheets: 2, assists: 1 }),     // 3점 ← MVP
    ];
    const r = calcDailyMvp({ playerGameLogs: logs });
    expect(r.ranking[0]).toMatchObject({ player: 'B', value: 1 });
    expect(r.recent[0].points).toBe(3);
  });

  it('완전 동점이면 공동 MVP (둘 다 +1)', () => {
    const logs = [
      pg('A', '2026-06-04', { rank_score: 1, goals: 2 }),
      pg('B', '2026-06-04', { rank_score: 1, assists: 2 }),
    ];
    const r = calcDailyMvp({ playerGameLogs: logs });
    expect(r.recent[0].mvps).toEqual(['A', 'B']);
    expect(r.ranking.find(x => x.player === 'A').value).toBe(1);
    expect(r.ranking.find(x => x.player === 'B').value).toBe(1);
  });

  it('포인트 제도 미기록 날짜(랭크/크로바/고구마 전원 0)는 골 기록이 있어도 스킵', () => {
    const logs = [
      pg('A', '2026-01-01', { goals: 5 }),
      pg('B', '2026-01-01', { goals: 1 }),
      pg('A', '2026-06-04', { rank_score: 1, goals: 1 }),
    ];
    const r = calcDailyMvp({ playerGameLogs: logs });
    expect(r.ranking[0]).toMatchObject({ player: 'A', value: 1 });
    expect(r.eligibleDates).toBe(1);
  });

  it('recent: 최신순, 새 공식 포인트 표기', () => {
    const logs = [
      pg('A', '2026-06-04', { rank_score: 1, goals: 1 }),
      pg('B', '2026-06-11', { rank_score: 1, crova: 2, assists: 2 }),
    ];
    const r = calcDailyMvp({ playerGameLogs: logs, recentN: 2 });
    expect(r.recent[0]).toMatchObject({ date: '2026-06-11', mvps: ['B'], points: 4 });
    expect(r.recent[1]).toMatchObject({ date: '2026-06-04', mvps: ['A'], points: 1 });
  });
});
