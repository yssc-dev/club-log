// 선수의 최근 세션 트렌드: 경기당 득점/어시, 팀승률 + 이동평균
// ★ 휴식 매치는 본인이 안 뛴 매치이므로 카운트에서 제외 (actualPlayers 사용)
import { parseActualPlayers } from './parseMembers';

export function calcTrends({ playerName, playerLogs, matchLogs, maxSessions = 12, smoothWindow = 3 }) {
  if (!playerName || !playerLogs || !matchLogs) return { points: [], smoothed: [] };

  const playerSessions = playerLogs
    .filter(p => p.player === playerName)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (playerSessions.length === 0) return { points: [], smoothed: [] };

  const sessionMatches = {};
  for (const m of matchLogs) {
    if (m.is_extra) continue; // 연습/이벤트성 매치 제외 — calcPlayerSummary와 동일 기준
    // home/away 양쪽에서 실제 출전한 매치만 카운트 (휴식 제외)
    const homeActual = parseActualPlayers(m.our_members_json);
    const awayActual = parseActualPlayers(m.opponent_members_json);
    if (!homeActual.includes(playerName) && !awayActual.includes(playerName)) continue;
    if (!sessionMatches[m.date]) sessionMatches[m.date] = [];
    sessionMatches[m.date].push({ ...m, _playerSide: homeActual.includes(playerName) ? 'home' : 'away' });
  }

  const points = playerSessions.map(p => {
    const matches = sessionMatches[p.date] || [];
    let wins = 0, draws = 0;
    const total = matches.length;
    for (const m of matches) {
      const our = Number(m.our_score) || 0;
      const opp = Number(m.opponent_score) || 0;
      // 본인이 어웨이 쪽에 있었으면 승률은 opp - our 기준으로 뒤집어 평가
      const myScore = m._playerSide === 'away' ? opp : our;
      const oppScore = m._playerSide === 'away' ? our : opp;
      if (myScore > oppScore) wins++;
      else if (myScore === oppScore) draws++;
    }
    const winRate = total > 0 ? (wins + 0.5 * draws) / total : 0;
    const gpg = total > 0 ? (p.goals || 0) / total : 0;
    const apg = total > 0 ? (p.assists || 0) / total : 0;
    return { date: p.date, gpg, apg, winRate };
  });

  const capped = points.slice(-maxSessions);

  const smoothed = capped.map((_, i) => {
    const start = Math.max(0, i - smoothWindow + 1);
    const window = capped.slice(start, i + 1);
    const avg = (key) => window.reduce((s, w) => s + w[key], 0) / window.length;
    return { date: capped[i].date, gpg: avg('gpg'), apg: avg('apg'), winRate: avg('winRate') };
  });

  return { points: capped, smoothed };
}
