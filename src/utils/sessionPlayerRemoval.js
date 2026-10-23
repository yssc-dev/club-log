// "오늘 안 온 사람" 완전 제외(REMOVE_SESSION_PLAYER)의 사전 점검.
//
// 온다고 해서 명단에 넣고 라운드마다 휴식으로 돌렸지만 결국 오지 않은 선수를 지우는 용도다.
// 이미 뛴 흔적(골·어시·자책·파울·GK)이 있으면 "애초에 오지 않았다"가 거짓이므로 막는다.
// 그런 선수는 기록을 먼저 지우거나 해당 라운드를 확정취소해야 한다.
//
// React·firebase 의존 없음.

/**
 * @param {{ allEvents?: Array, completedMatches?: Array, gks?: object, gksHistory?: object }} session
 * @param {string} player
 * @returns {{ blocked: boolean, reasons: string[], matchesListed: number }}
 *   blocked        : 기록이 있어 제외하면 안 되는 선수
 *   reasons        : 사용자에게 보여줄 근거 ("골 2", "GK 지정" …)
 *   matchesListed  : 이미 확정된 매치 중 이 선수가 명단에 박제된 수(휴식 포함)
 */
export function inspectSessionPlayerRemoval(session, player) {
  const { allEvents = [], completedMatches = [], gks = {}, gksHistory = {} } = session || {};
  if (!player) return { blocked: false, reasons: [], matchesListed: 0 };

  let goals = 0, assists = 0, owngoals = 0, fouls = 0;
  let wasGk = false;
  for (const e of allEvents) {
    if (!e) continue;
    if (e.player === player) {
      if (e.type === 'goal') goals++;
      else if (e.type === 'owngoal') owngoals++;
      else if (e.type === 'foul') fouls++;
    }
    if (e.assist === player) assists++;
    if (e.concedingGk === player) wasGk = true;
  }
  for (const m of completedMatches) {
    if (m?.homeGk === player || m?.awayGk === player) wasGk = true;
  }
  if (Object.values(gks || {}).includes(player)) wasGk = true;
  for (const h of Object.values(gksHistory || {})) {
    if (h && Object.values(h).includes(player)) wasGk = true;
  }

  const reasons = [];
  if (goals) reasons.push(`골 ${goals}`);
  if (assists) reasons.push(`어시 ${assists}`);
  if (owngoals) reasons.push(`자책 ${owngoals}`);
  if (fouls) reasons.push(`파울 ${fouls}`);
  if (wasGk) reasons.push('GK 지정');

  const matchesListed = completedMatches.filter(m =>
    (m?.homePlayers || []).includes(player) || (m?.awayPlayers || []).includes(player)
  ).length;

  return { blocked: reasons.length > 0, reasons, matchesListed };
}
