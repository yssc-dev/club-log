// 대시보드 전용 계산기. 분석 유틸(tennisAnalytics/tennisStandings)과 무관, 재사용만.
// 클럽 이번달 요약: 경기수(distinct match_id)·최다출전·핫플레이어(회원=비게스트).
export function buildMonthSummary({ rows, month }) {
  const inMonth = (rows || []).filter(r => (r.date || '').slice(0, 7) === month);
  const matches = new Set(inMonth.map(r => r.match_id).filter(Boolean)).size;

  const perPlayer = new Map();
  for (const r of inMonth) {
    if (r.is_guest === true || !r.player) continue;
    const c = perPlayer.get(r.player) || { name: r.player, games: 0, wins: 0 };
    c.games++;
    if (r.result === '승') c.wins++;
    perPlayer.set(r.player, c);
  }
  const players = [...perPlayer.values()];
  const topAttender = players.slice()
    .sort((a, b) => b.games - a.games || a.name.localeCompare(b.name, 'ko'))[0] || null;
  const hotPlayer = players
    .filter(p => p.games >= 3)
    .map(p => ({ ...p, rate: p.games ? p.wins / p.games : 0 }))
    .sort((a, b) => b.rate - a.rate || b.games - a.games)[0] || null;

  return { month, matches, topAttender, hotPlayer, playerCount: players.length };
}
