// 상대팀별 개인성적 (축구 전용): 선수별 × 상대팀별 골/어시/경기/승패.
// 골·어시 = 로그_이벤트 전 기간. 경기수·승패 = 명단 신뢰 경기만(legacy_ 백필 부분명단 제외).
// 상대팀명은 로그_매치 (date|match_id) 조인으로 정규화 — 이벤트쪽 표기 흔들림('터틀' 등) 방지.
import { parseActualPlayers } from './parseMembers';

const isTrustedRoster = (m) => !String(m.game_id || '').startsWith('legacy_');

export function calcOpponentBreakdown({ eventLogs, matchLogs }) {
  const oppByKey = {};
  const extraKeys = new Set();
  for (const m of matchLogs || []) {
    const key = `${m.date}|${String(m.match_id ?? '')}`;
    const opp = String(m.opponent_team_name || '').trim();
    if (opp) oppByKey[key] = opp;
    if (m.is_extra) extraKeys.add(key);
  }

  const cells = {};
  const ensure = (name, opp) => {
    if (!cells[name]) cells[name] = {};
    if (!cells[name][opp]) cells[name][opp] = { goals: 0, assists: 0, games: 0, wins: 0, draws: 0, losses: 0 };
    return cells[name][opp];
  };

  for (const e of eventLogs || []) {
    if (e.event_type !== 'goal') continue; // goal 행 dedupe 금지 — 한 행 = 한 골
    const key = `${e.date}|${String(e.match_id ?? '')}`;
    if (extraKeys.has(key)) continue;
    const opp = oppByKey[key] || String(e.opponent || '').trim();
    if (!opp) continue;
    if (e.player) ensure(e.player, opp).goals++;
    if (e.related_player) ensure(e.related_player, opp).assists++;
  }

  for (const m of matchLogs || []) {
    if (m.is_extra) continue;
    if (!isTrustedRoster(m)) continue; // legacy 백필 명단 = 골 관여자 역산 부분명단 → 경기수 오염 방지
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
      .map(([opponent, c]) => ({ opponent, ...c }))
      .sort((a, b) => b.games - a.games || b.goals - a.goals || a.opponent.localeCompare(b.opponent, 'ko'));
  }
  return {
    players: Object.keys(byPlayer).sort((a, b) => a.localeCompare(b, 'ko')),
    byPlayer,
  };
}
