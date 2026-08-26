import { describe, it, expect } from 'vitest';
import { calcRecentHotStreak } from '../calcRecentHotStreak';

// 축구 PG 1행 = 그날의 집계. 하루 2~3경기라 분모는 행 수가 아니라 games 열의 합.
const pg = (date, player, games, o = {}) => ({
  date, player, games,
  goals: 0, assists: 0, cleansheets: 0, crova: 0, goguma: 0, owngoals: 0,
  ...o,
});

describe('calcRecentHotStreak (축구)', () => {
  it('분모는 PG 행 수가 아니라 games 합', () => {
    const logs = [
      pg('2026-08-20', 'A', 3, { goals: 6 }),
      pg('2026-08-13', 'A', 3, { goals: 6 }),
      pg('2026-08-20', 'B', 3, { goals: 1 }),
      pg('2026-08-13', 'B', 3, { goals: 1 }),
    ];
    const r = calcRecentHotStreak({ playerLogs: logs });
    const a = r.rows.find(x => x.player === 'A');
    expect(a.games).toBe(6);   // 행 수 2가 아니라 games 합 6
    expect(a.sessions).toBe(2);
    expect(a.ppg).toBe(2);     // 12점 / 6경기
  });

  it('games가 0인 행만 있는 선수는 후보에서 빠진다 (0으로 나누기 방어)', () => {
    const logs = [
      pg('2026-08-20', 'A', 3, { goals: 6 }), pg('2026-08-13', 'A', 3, { goals: 6 }),
      pg('2026-08-20', '유령', 0, { goals: 9 }), pg('2026-08-13', '유령', 0, { goals: 9 }),
    ];
    const r = calcRecentHotStreak({ playerLogs: logs });
    expect(r.rows.map(x => x.player)).toEqual(['A']);
  });

  it('진입선도 games 축 — 창 내 최대 경기수의 30%(하한 2)', () => {
    const logs = [
      pg('2026-08-20', '주전', 10, { goals: 10 }), pg('2026-08-13', '주전', 10, { goals: 10 }),
      pg('2026-08-20', '한경기', 1, { goals: 5 }),
    ];
    const r = calcRecentHotStreak({ playerLogs: logs });
    expect(r.minGames).toBe(6); // ceil(20 * 0.3)
    expect(r.rows.map(x => x.player)).toEqual(['주전']);
  });

  it('기준일·통화·평소 비교는 풋살과 같은 규약', () => {
    const logs = [
      pg('2026-08-20', 'A', 2, { goals: 3, assists: 1, cleansheets: 1, owngoals: 1 }),
      pg('2026-08-13', 'A', 2, { goals: 3 }),
      pg('2026-06-04', 'A', 2, { goals: 1 }),
      pg('2026-06-11', 'A', 2, { goals: 1 }),
      pg('2026-06-18', 'A', 2, { goals: 1 }),
      pg('2026-08-20', 'B', 2), pg('2026-08-13', 'B', 2),
    ];
    const r = calcRecentHotStreak({ playerLogs: logs });
    expect(r.anchor).toBe('2026-08-20');
    expect(r.cutoff).toBe('2026-07-21');
    const a = r.rows.find(x => x.player === 'A');
    // 최근: (3+1+1-2) + 3 = 6점 / 4경기 = 1.5
    expect(a.points).toBe(6);
    expect(a.ppg).toBe(1.5);
    // 평소: 3점 / 6경기 = 0.5
    expect(a.basePpg).toBe(0.5);
    expect(a.delta).toBe(1);
  });
});
