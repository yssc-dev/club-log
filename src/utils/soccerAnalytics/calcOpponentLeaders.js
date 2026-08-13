// 상대팀별 리더보드 (축구 전용): 상대팀 하나를 골랐을 때의 경기당 포인트 TOP / 수비 실점률 TOP.
//
// 개인 화면(calcOpponentBreakdown)과 달리 **legacy 구간을 통째로 뺀다.**
// legacy의 our_members_json은 골 이벤트에서 역산한 부분 명단이라, 그 구간에서 한 선수의
// '경기수'는 사실상 '골·어시를 낸 경기수'다. 개인 기록 표시에는 그래도 쓸 값이지만
// 선수 간 순위에는 못 쓴다 — 분모가 서로 비교 가능하지 않기 때문이다.
// (실측: 박동휘는 터틀파크 5경기가 전부 legacy·정식 0경기여서 전 기간 기준이면 2.0P로 1위가 됐다.)
//
// 이벤트도 같은 키 집합으로 걸러야 한다. matchLogs만 좁히면 calcOpponentBreakdown이
// 이벤트의 opponent 컬럼으로 폴백해 legacy 골을 그대로 집계한다.
import { calcOpponentBreakdown } from './calcOpponentBreakdown';
import { calcDefenseAnalysis, sortDefenseRows } from './calcDefenseAnalysis';

const matchKey = (r) => `${r.date}|${String(r.match_id ?? '')}`;
const isLegacy = (m) => String(m.game_id || '').startsWith('legacy_');
const oppName = (m) => String(m.opponent_team_name || '').trim();

export function calcOpponentLeaders({
  eventLogs, matchLogs,
  minOpponentMatches = 5, // 이만큼도 안 붙어본 상대는 순위 자체가 무의미
  minGames = 3,
  topN = 5,
} = {}) {
  const scoped = (matchLogs || []).filter(m => !m.is_extra && !isLegacy(m) && oppName(m));
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
