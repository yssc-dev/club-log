// 상대팀별 개인성적 (축구 전용): 선수별 × 상대팀별 골/어시/경기/승패/경기당 포인트.
// 상대팀명은 로그_매치 (date|match_id) 조인으로 정규화 — 이벤트쪽 표기 흔들림('터틀' 등) 방지.
//
// 집계 정책: 분자 = 로그의 모든 골·어시, 분모 = 앱 이전 + 현행 출전횟수 전부.
// 앱 이전(game_id가 legacy_) 구간의 our_members_json은 출전 명단 원본이 없어 골 이벤트에서
// 역산한 부분 명단이라(실측 평균 3.2명), 그 구간의 출전이 실제보다 적게 잡힌다.
// 그래도 분자·분모를 같은 범위로 두는 쪽을 택한다 — 한쪽만 전 기간이면 경기당 포인트가
// 크게 부풀려지기 때문(김형욱 터틀파크: 15골 / 앱구간 11경기 = 1.36 vs 15/16 = 0.94).
// 남는 한계(분모 과소집계)는 화면 상단 배너로 밝힌다.
import { parseActualPlayers } from './parseMembers';

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
    const members = parseActualPlayers(m.our_members_json);
    if (members.length === 0) continue; // 명단 자체가 없는 행(휴식 등)은 경기수에 안 넣는다
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
