// 상대팀별 개인성적 (축구 전용): 선수별 × 상대팀별 골/어시/경기/승패/경기당 포인트.
// 상대팀명은 로그_매치 (date|match_id) 조인으로 정규화 — 이벤트쪽 표기 흔들림('터틀' 등) 방지.
//
// 집계 범위는 골·어시와 경기수를 일치시킨다(전 기간). legacy 구간의 our_members_json은
// 앱 도입 전이라 출전 명단 원본이 없어 골 이벤트에서 역산한 부분 명단이지만(평균 3.2명,
// 검증상 59경기 전부가 '골·어시 참여자 집합'과 정확히 일치), 그 경기에 나와 포인트를 낸
// 것 자체는 사실이다. 골을 분자에 넣으면서 그 경기를 분모에서 빼면 경기당 포인트가
// 크게 부풀려지므로(김형욱 터틀파크 0.94 → 1.36), 명단에 잡힌 legacy 경기는 경기수·승패에도 넣는다.
// 남는 한계: 뛰었지만 공격포인트가 없던 legacy 경기는 어디에도 안 잡혀 분모가 과소집계된다
//           → 경기당 포인트가 실제보다 다소 높다. UI 캡션에 명시.
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
