import { describe, it, expect } from 'vitest';
import { calcMonthlyRanking } from './calcMonthlyRanking';

// 자유대진: 라운드마다 1행, our=홈자리/opponent=어웨이자리 (임의 위치)
const row = (date, ourMembers, oppMembers, ourScore, oppScore, extra = {}) => ({
  date,
  our_members_json: JSON.stringify(ourMembers),
  opponent_members_json: JSON.stringify(oppMembers),
  our_score: ourScore,
  opponent_score: oppScore,
  ...extra,
});

describe('calcMonthlyRanking 승률 — 양 팀 집계', () => {
  it('opponent 측에 배정된 선수도 게임/승패로 카운트된다', () => {
    const matchLogs = [row('2026-06-04', ['A'], ['B'], 3, 1)]; // A 승, B 패
    const r = calcMonthlyRanking({
      yearMonth: '2026-06', playerLogs: [], matchLogs, winRateMinGames: 1,
    });
    const get = (n) => r.winRate.find(x => x.player === n);
    expect(get('A')).toMatchObject({ value: 1, games: 1 });
    expect(get('B')).toMatchObject({ value: 0, games: 1 }); // 이전 버그: B는 아예 누락됐음
  });

  it('같은 팀이었던 두 선수는 홈/어웨이 위치와 무관하게 승률이 같다', () => {
    // 같은 팀(이영문·김종현). 라운드마다 좌우 위치만 뒤바뀜.
    const matchLogs = [
      row('2026-06-04', ['이영문', '김종현'], ['X'], 2, 0), // 홈 자리, 승
      row('2026-06-04', ['Y'], ['이영문', '김종현'], 0, 1), // 어웨이 자리, 승
      row('2026-06-04', ['이영문', '김종현'], ['Z'], 0, 3), // 홈 자리, 패
    ];
    const r = calcMonthlyRanking({
      yearMonth: '2026-06', playerLogs: [], matchLogs, winRateMinGames: 1,
    });
    const lym = r.winRate.find(x => x.player === '이영문');
    const kjh = r.winRate.find(x => x.player === '김종현');
    expect(lym).toMatchObject({ games: 3, value: 2 / 3 });
    // 같은 팀이면 승률·게임수가 반드시 동일 (이전 버그에선 위치 따라 갈렸음)
    expect(kjh.value).toBe(lym.value);
    expect(kjh.games).toBe(lym.games);
  });

  it('득점·어시 랭킹: statMinGames 미달(1세션 몰아치기)은 제외', () => {
    const pg = (player, date, goals, assists = 0) => ({ player, date, goals, assists });
    const playerLogs = [
      pg('몰빵', '2026-06-04', 5),                    // 1세션 5골 → games 1, 제외
      pg('꾸준', '2026-06-04', 2), pg('꾸준', '2026-06-11', 2), // 2세션 4골 → 포함
    ];
    const r = calcMonthlyRanking({ yearMonth: '2026-06', playerLogs, matchLogs: [], statMinGames: 2 });
    expect(r.goals.find(x => x.player === '몰빵')).toBeUndefined();
    expect(r.goals.find(x => x.player === '꾸준')).toMatchObject({ value: 4, games: 2 });
  });

  it('attackPoints = 월간 G+A 합산 랭킹', () => {
    const pg = (player, date, goals, assists = 0) => ({ player, date, goals, assists });
    const playerLogs = [
      pg('A', '2026-06-04', 2, 3), pg('A', '2026-06-11', 1, 0), // G3+A3=6
      pg('B', '2026-06-04', 4, 0), pg('B', '2026-06-11', 1, 0), // G5+A0=5
    ];
    const r = calcMonthlyRanking({ yearMonth: '2026-06', playerLogs, matchLogs: [], statMinGames: 2 });
    expect(r.attackPoints.map(x => x.player)).toEqual(['A', 'B']);
    expect(r.attackPoints[0].value).toBe(6);
  });

  it('동점자는 공동 순위(rank 필드), topN 경계에서 잘리지 않음', () => {
    const pg = (player, date, goals) => ({ player, date, goals, assists: 0 });
    const playerLogs = [
      pg('A', '2026-06-04', 3), pg('A', '2026-06-11', 0),
      pg('B', '2026-06-04', 3), pg('B', '2026-06-11', 0),
      pg('C', '2026-06-04', 1), pg('C', '2026-06-11', 0),
    ];
    const r = calcMonthlyRanking({ yearMonth: '2026-06', playerLogs, matchLogs: [], statMinGames: 2 });
    expect(r.goals.map(x => x.rank)).toEqual([1, 1, 3]);
  });

  it('totalPoints = 월간 최종포인트(골+어시+클린+크로바+고구마+역주행, 랭크 제외) 합산', () => {
    const pg = (player, date, over) => ({ player, date, goals: 0, assists: 0, owngoals: 0, cleansheets: 0, crova: 0, goguma: 0, rank_score: 0, ...over });
    const playerLogs = [
      pg('A', '2026-06-04', { rank_score: 9, crova: 1, goals: 2 }),                  // 3 (랭크 미포함)
      pg('A', '2026-06-11', { rank_score: 5, goguma: -2, assists: 3, owngoals: 1 }), // 3-2-2 = -1 → 합 2
      pg('B', '2026-06-04', { rank_score: 1, cleansheets: 1 }),                      // 1
      pg('B', '2026-06-11', { rank_score: 1, goals: 2, owngoals: -2 }),              // 0 → 합 1
    ];
    const r = calcMonthlyRanking({ yearMonth: '2026-06', playerLogs, matchLogs: [] });
    expect(r.totalPoints[0]).toMatchObject({ player: 'A', value: 2 });
    expect(r.totalPoints[1]).toMatchObject({ player: 'B', value: 1 });
  });

  it("yearMonth='ALL'이면 전체 기간 집계 (시즌 뷰)", () => {
    const pg = (player, date, goals) => ({ player, date, goals, assists: 0 });
    const playerLogs = [
      pg('A', '2026-05-01', 2), pg('A', '2026-06-04', 3),
      pg('B', '2026-06-04', 1), pg('B', '2026-06-11', 1),
    ];
    const r = calcMonthlyRanking({ yearMonth: 'ALL', playerLogs, matchLogs: [] });
    expect(r.goals.find(x => x.player === 'A')).toMatchObject({ value: 5, games: 2 });
  });

  it('is_extra 매치는 승률에서 제외한다', () => {
    const matchLogs = [
      row('2026-06-04', ['A'], ['B'], 3, 1),
      row('2026-06-04', ['A'], ['B'], 0, 3, { is_extra: true }), // 추가경기 → 무시
    ];
    const r = calcMonthlyRanking({
      yearMonth: '2026-06', playerLogs: [], matchLogs, winRateMinGames: 1,
    });
    expect(r.winRate.find(x => x.player === 'A')).toMatchObject({ value: 1, games: 1 });
  });
});
