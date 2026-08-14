// 상대팀별 리더보드 (축구 전용): 상대팀 하나를 골랐을 때의 경기당 포인트 TOP / 수비 실점률 TOP.
//
// 집계 정책은 앱 전체와 동일 — 분자 = 로그의 모든 골·어시, 분모 = 앱 이전 + 현행 출전횟수 전부.
// 앱 전환 이전 구간은 출전 명단 원본이 없어 '골·어시를 낸 경기'만 출전으로 잡히므로,
// 그 시절 기록만 있는 선수는 경기당 포인트가 높게 나온다
// (실측: 박동휘 터틀파크 5경기 전부 앱 이전 → 2.00P로 1위). 이 결핍은 감안하고
// 화면 상단 LegacyDataNotice 배너로 밝힌다 — 화면마다 기준이 갈리지 않는 쪽을 택했다.
//
// 이벤트는 scoped 매치의 키 집합으로 거른다. 그래야 is_extra 매치의 골이 새지 않고,
// calcOpponentBreakdown의 e.opponent 폴백이 스코프 밖 골을 끌어오지 않는다.
import { calcOpponentBreakdown } from './calcOpponentBreakdown';
import { calcDefenseAnalysis, sortDefenseRows } from './calcDefenseAnalysis';

const matchKey = (r) => `${r.date}|${String(r.match_id ?? '')}`;
const oppName = (m) => String(m.opponent_team_name || '').trim();

export function calcOpponentLeaders({
  eventLogs, matchLogs,
  minOpponentMatches = 5, // 이만큼도 안 붙어본 상대는 순위 자체가 무의미
  minGames = 3,
  topN = 5,
} = {}) {
  const scoped = (matchLogs || []).filter(m => !m.is_extra && oppName(m));
  const keys = new Set(scoped.map(matchKey));
  const scopedEvents = (eventLogs || []).filter(e => keys.has(matchKey(e)));

  const matchesByOpp = {};
  for (const m of scoped) matchesByOpp[oppName(m)] = (matchesByOpp[oppName(m)] || 0) + 1;

  const opponents = Object.entries(matchesByOpp)
    .filter(([, n]) => n >= minOpponentMatches)
    .map(([opponent, matches]) => ({ opponent, matches }))
    .sort((a, b) => b.matches - a.matches || a.opponent.localeCompare(b.opponent, 'ko'));

  const breakdown = calcOpponentBreakdown({ eventLogs: scopedEvents, matchLogs: scoped });

  const byOpponent = {};
  for (const { opponent, matches } of opponents) {
    const pointLeaders = breakdown.players
      .map(name => {
        const row = (breakdown.byPlayer[name] || []).find(x => x.opponent === opponent);
        return row ? { name, games: row.games, goals: row.goals, assists: row.assists, pointsPerGame: row.pointsPerGame } : null;
      })
      .filter(x => x && x.games >= minGames && x.pointsPerGame != null)
      .sort((a, b) => b.pointsPerGame - a.pointsPerGame || b.games - a.games || a.name.localeCompare(b.name, 'ko'))
      .slice(0, topN);

    // 그 상대팀 경기만 넘겨 Δ 베이스라인도 '같은 상대 안에서' 잡히게 한다
    const defense = calcDefenseAnalysis({
      matchLogs: scoped.filter(m => oppName(m) === opponent),
      individualThreshold: minGames, pairThreshold: Infinity, trioThreshold: Infinity,
    });
    const defenseLeaders = sortDefenseRows(defense.individuals, { metric: 'conceded', by: 'raw' })
      .slice(0, topN)
      .map(x => ({ name: x.name, games: x.games, concededPerGame: x.concededPerGame, cleanRate: x.cleanRate }));

    byOpponent[opponent] = {
      matches,
      pointLeaders,
      defenseLeaders,
      defenseMatches: defense.scopeMatches,
      teamConcededPerGame: defense.teamConcededPerGame,
    };
  }

  return { opponents, byOpponent };
}
