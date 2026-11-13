// 지표 Top5 각 행의 "근거" 한 줄 — 값이 어떤 숫자로 나왔는지 보여준다(2026-11-13 유저 요청).
// 입력은 calcMetricLeaders(풋살 analyticsV2 / 축구 soccerAnalytics 동일 모양)의 행.
// 필드가 없으면 빈 문자열 → RankBarList 가 근거 칸을 그리지 않는다.

const has = (...vals) => vals.every(v => Number.isFinite(Number(v)));

export const METRIC_BASIS = {
  scoring: (r) => (has(r.goals, r.rounds) ? `${r.goals}골/${r.rounds}경기` : ''),
  creativity: (r) => (has(r.assists, r.rounds) ? `${r.assists}어시/${r.rounds}경기` : ''),
  keeping: (r) => (has(r.conceded, r.keeperRounds) ? `${r.conceded}실점/${r.keeperRounds}경기` : ''),
  attendance: (r) => (has(r.games, r.totalSessions) ? `${r.games}/${r.totalSessions}일` : ''),
  winRate: (r) => (has(r.wins, r.draws, r.losses) ? `${r.wins}승 ${r.draws}무 ${r.losses}패` : ''),
  involvement: (r) => (has(r.goals, r.assists, r.teamGoals) ? `${Number(r.goals) + Number(r.assists)}/${r.teamGoals}골` : ''),
};

/** rows 에 sub(근거)를 붙인 새 배열 */
export function withBasis(key, rows) {
  const fn = METRIC_BASIS[key];
  return (rows || []).map(r => ({ ...r, sub: fn ? fn(r) : '' }));
}
