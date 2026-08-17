// 대시보드 전용 계산기. 분석 유틸(tennisAnalytics/tennisStandings)과 무관, 재사용만.

// 경기(판) 수 = game_id|match_id distinct. match_id(R{라운드}_C{코트})는 하루 안에서만 유일해
// game_id와 조합해야 날짜 다른 경기가 구분된다.
function countMatches(rows) {
  return new Set((rows || []).filter(r => r.match_id).map(r => `${r.game_id || ''}|${r.match_id}`)).size;
}

// 클럽 이번달 요약: 경기수·경기일·최다출전·핫플레이어(회원=비게스트).
export function buildMonthSummary({ rows, month }) {
  const inMonth = (rows || []).filter(r => (r.date || '').slice(0, 7) === month);
  const matches = countMatches(inMonth);
  const days = new Set(inMonth.map(r => r.date).filter(Boolean)).size;

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

  return { month, matches, days, topAttender, hotPlayer, playerCount: players.length };
}

// 마지막(가장 최근) 경기일 요약: 그 날의 경기수·참석(회원/용병)·다승 1위.
// 요일/경과일은 '오늘' 의존이라 표시단에서 계산(순수 유지). 기록 없으면 null.
export function buildLastMatchDay({ rows }) {
  const dated = (rows || []).filter(r => r.date);
  if (!dated.length) return null;
  const date = dated.map(r => r.date).sort((a, b) => String(a).localeCompare(String(b))).at(-1);
  const onDay = dated.filter(r => r.date === date);
  const matches = countMatches(onDay);
  const members = new Set();
  const guests = new Set();
  const perPlayer = new Map();
  for (const r of onDay) {
    if (!r.player) continue;
    if (r.is_guest === true) { guests.add(r.player); continue; }
    members.add(r.player);
    const c = perPlayer.get(r.player) || { name: r.player, games: 0, wins: 0 };
    c.games++;
    if (r.result === '승') c.wins++;
    perPlayer.set(r.player, c);
  }
  const topWinner = [...perPlayer.values()]
    .sort((a, b) => b.wins - a.wins || b.games - a.games || a.name.localeCompare(b.name, 'ko'))[0] || null;
  return { date, matches, memberCount: members.size, guestCount: guests.size, topWinner };
}
