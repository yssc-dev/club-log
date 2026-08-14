// 상대팀별 개인성적 (축구 전용): 선수별 × 상대팀별 골/어시/경기/승패/경기당 포인트.
// 상대팀명은 로그_매치 (date|match_id) 조인으로 정규화 — 이벤트쪽 표기 흔들림('터틀' 등) 방지.
//
// 주 지표(goals/assists/games/승패/pointsPerGame)는 **앱 기록 구간만** 집계한다.
// 앱 이전 명단은 골 이벤트 역산 부분명단이라 분모로 못 쓴다(appEraScope 주석 참고).
// 분자만 전 기간으로 두면 경기당 포인트가 크게 부풀려진다
// (김형욱 터틀파크: 전기간골 15 / 앱구간경기 11 = 1.36 vs 앱구간 10/11 = 0.91).
//
// 통산 골·어시는 careerGoals/careerAssists로 따로 남긴다 — 화면이 "통산 8골 7어시,
// 앱 이전 2골 3어시 포함"처럼 차이를 밝힐 수 있게. 이벤트 기반이라 앱 이전도 원본이 정확하다.
import { parseActualPlayers } from './parseMembers';
import { isLegacyMatch } from './appEraScope';

export function calcOpponentBreakdown({ eventLogs, matchLogs }) {
  const oppByKey = {};
  const extraKeys = new Set();
  const appEraKeys = new Set();
  for (const m of matchLogs || []) {
    const key = `${m.date}|${String(m.match_id ?? '')}`;
    const opp = String(m.opponent_team_name || '').trim();
    if (opp) oppByKey[key] = opp;
    if (m.is_extra) extraKeys.add(key);
    else if (!isLegacyMatch(m)) appEraKeys.add(key);
  }

  const cells = {};
  const ensure = (name, opp) => {
    if (!cells[name]) cells[name] = {};
    if (!cells[name][opp]) {
      cells[name][opp] = {
        goals: 0, assists: 0, careerGoals: 0, careerAssists: 0,
        games: 0, wins: 0, draws: 0, losses: 0,
      };
    }
    return cells[name][opp];
  };

  for (const e of eventLogs || []) {
    if (e.event_type !== 'goal') continue; // goal 행 dedupe 금지 — 한 행 = 한 골
    const key = `${e.date}|${String(e.match_id ?? '')}`;
    if (extraKeys.has(key)) continue;
    const opp = oppByKey[key] || String(e.opponent || '').trim();
    if (!opp) continue;
    const appEra = appEraKeys.has(key);
    if (e.player) { const c = ensure(e.player, opp); c.careerGoals++; if (appEra) c.goals++; }
    if (e.related_player) { const c = ensure(e.related_player, opp); c.careerAssists++; if (appEra) c.assists++; }
  }

  for (const m of matchLogs || []) {
    if (m.is_extra) continue;
    if (isLegacyMatch(m)) continue; // 부분명단 — 경기수·승패의 분모로 못 쓴다
    const members = parseActualPlayers(m.our_members_json);
    if (members.length === 0) continue;
    const opp = String(m.opponent_team_name || '').trim();
    if (!opp) continue;
    const our = Number(m.our_score) || 0;
    const their = Number(m.opponent_score) || 0;
    for (const name of members) {
      const c = ensure(name, opp);
      c.games++;
      if (our > their) c.wins++;
      else if (our === their) c.draws++;
      else c.losses++;
    }
  }

  const byPlayer = {};
  for (const name of Object.keys(cells)) {
    byPlayer[name] = Object.entries(cells[name])
      .map(([opponent, c]) => ({
        opponent,
        ...c,
        // 경기수가 없으면 null — 0으로 찍으면 '포인트 0'과 '기록 없음'이 구분되지 않는다
        pointsPerGame: c.games > 0 ? (c.goals + c.assists) / c.games : null,
      }))
      .sort((a, b) => b.games - a.games || b.goals - a.goals || a.opponent.localeCompare(b.opponent, 'ko'));
  }
  return {
    players: Object.keys(byPlayer).sort((a, b) => a.localeCompare(b, 'ko')),
    byPlayer,
  };
}
