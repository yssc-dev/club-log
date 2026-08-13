// 특정 YYYY-MM 기준 득점/어시/공격포인트/종합포인트/승률 TOP N (공동 순위)
// 종합포인트(totalPoints) = goals + assists + cleansheets + crova + goguma + 역주행(감점)
//   — 일일 MVP(calcDailyMvp)와 동일 통화. 랭크점수 미포함, 역주행은 owngoalPoints로 부호 정규화
// yearMonth='ALL'이면 전체 기간 집계 (시즌 뷰)
// winRateMinGames: 승률 랭킹에 노출되기 위한 최소 경기 수 (표본 신뢰도)
// statMinGames: 득점·어시·공격포인트·종합포인트 랭킹의 최소 세션 수 — 1세션 몰아치기가 상위 독식 방지
// ★ 휴식 선수는 매치 출전에서 제외 (actualPlayers 사용)
import { parseActualPlayers } from './parseMembers';
import { buildRankedTop } from './rankUtils';
import { owngoalPoints } from './calcDailyMvp';

export function calcMonthlyRanking({ yearMonth, playerLogs, matchLogs, topN = 5, winRateMinGames = 5, statMinGames = 2 }) {
  if (!yearMonth) return { goals: [], assists: [], attackPoints: [], totalPoints: [], winRate: [] };

  const inMonth = yearMonth === 'ALL'
    ? (d) => typeof d === 'string' && d.length > 0
    : (d) => typeof d === 'string' && d.startsWith(yearMonth + '-');

  // 선수별 기간 누적 + 세션 수 (PG 1행 = 1세션)
  const statMap = {}; // name -> { goals, assists, totalPoints, games }
  for (const p of playerLogs || []) {
    if (!inMonth(p.date)) continue;
    if (!statMap[p.player]) statMap[p.player] = { goals: 0, assists: 0, totalPoints: 0, games: 0 };
    statMap[p.player].goals += Number(p.goals) || 0;
    statMap[p.player].assists += Number(p.assists) || 0;
    statMap[p.player].totalPoints +=
      (Number(p.goals) || 0) + (Number(p.assists) || 0) + (Number(p.cleansheets) || 0) +
      (Number(p.crova) || 0) + (Number(p.goguma) || 0) + owngoalPoints(p.owngoals);
    statMap[p.player].games += 1;
  }

  // 승률: 양 팀 모두 집계해야 함.
  // our_members_json만 보면 자유대진에서 '홈' 자리에 배정된 라운드만 카운트되어
  // 같은 팀이었던 선수끼리도 승률이 갈린다 (opponent 측 라운드가 통째로 누락).
  // → calcPlayerSummary와 동일하게 home=our, away=opp(승패 반전)로 양면 집계.
  const winMap = {};
  for (const m of matchLogs || []) {
    if (m.is_extra) continue;
    if (!inMonth(m.date)) continue;
    const our = Number(m.our_score) || 0;
    const opp = Number(m.opponent_score) || 0;
    const ourWin = our > opp;
    const draw = our === opp;
    const seen = new Set();
    const credit = (name, side) => {
      if (!name || seen.has(name)) return;
      seen.add(name);
      if (!winMap[name]) winMap[name] = { wins: 0, draws: 0, games: 0 };
      winMap[name].games++;
      if (draw) winMap[name].draws++;
      else if (side === 'our' ? ourWin : !ourWin) winMap[name].wins++;
    };
    parseActualPlayers(m.our_members_json).forEach(n => credit(n, 'our'));
    parseActualPlayers(m.opponent_members_json).forEach(n => credit(n, 'opp'));
  }

  // 득점·어시·공격포인트: value>0 이고 세션 수 statMinGames 이상만
  const statList = (valueFn) =>
    buildRankedTop(
      Object.entries(statMap)
        .map(([player, v]) => ({ player, value: valueFn(v), games: v.games }))
        .filter(x => x.value > 0 && x.games >= statMinGames),
      { limit: topN }
    );

  return {
    goals: statList(v => v.goals),
    assists: statList(v => v.assists),
    attackPoints: statList(v => v.goals + v.assists),
    // 종합포인트: 최종포인트(rank_score+crova+goguma) 기간 누적 — '이달의 선수' 종합축
    totalPoints: statList(v => v.totalPoints),
    // 승률은 표본 신뢰도를 위해 최소 winRateMinGames경기 이상만 랭킹 (기본 5)
    winRate: buildRankedTop(
      Object.entries(winMap)
        .map(([player, v]) => ({ player, value: (v.wins + 0.5 * v.draws) / v.games, games: v.games }))
        .filter(x => x.games >= winRateMinGames),
      { limit: topN }
    ),
  };
}
