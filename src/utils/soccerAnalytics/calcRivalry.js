// 대결 케미(라이벌): 두 선수가 '반대팀'으로 만난 라운드의 상대전적.
// 매주 팀 로테이션 도메인에서만 성립하는 지표 — 팀 정체성 없이 개인 대 개인 축.
// 동반 출전 케미(calcSynergyMatrix/calcGoldenTrio)와 정확히 반대 방향의 질문:
//   "이 사람과 같은 팀이면 잘 이긴다" vs "이 사람을 상대하면 잘 못 이긴다(천적)".
// (date, match_id) 단위 dedupe — calcSynergyMatrix와 동일 규약.
import { parseActualPlayers } from './parseMembers';

// cells['A|B'] (가나다 정렬 키) = { games, aWins, bWins, draws }
export function calcRivalry({ matchLogs }) {
  const cells = {};
  const seenByKey = {};
  const playerSet = new Set();

  let rowSeq = 0;
  for (const m of matchLogs || []) {
    rowSeq++;
    if (m.is_extra) continue;
    const home = parseActualPlayers(m.our_members_json);
    const away = parseActualPlayers(m.opponent_members_json);
    if (home.length === 0 || away.length === 0) continue;
    const our = Number(m.our_score) || 0;
    const opp = Number(m.opponent_score) || 0;
    const roundKey = m.match_id ? `${m.date}|${m.match_id}` : `${m.date}|__row${rowSeq}`;

    for (const h of home) {
      playerSet.add(h);
      for (const a of away) {
        playerSet.add(a);
        if (h === a) continue;
        const [x, y] = [h, a].sort((p, q) => p.localeCompare(q, 'ko'));
        const key = `${x}|${y}`;
        if (!seenByKey[key]) seenByKey[key] = new Set();
        if (seenByKey[key].has(roundKey)) continue;
        seenByKey[key].add(roundKey);
        if (!cells[key]) cells[key] = { games: 0, aWins: 0, bWins: 0, draws: 0 };
        const c = cells[key];
        c.games++;
        if (our === opp) c.draws++;
        else {
          // h(home측)가 이겼으면 h의 승 — h가 정렬상 x(a측)인지에 따라 귀속
          const homeWon = our > opp;
          const hIsA = h === x;
          if (homeWon === hIsA) c.aWins++;
          else c.bWins++;
        }
      }
    }
  }

  return { players: [...playerSet].sort((a, b) => a.localeCompare(b, 'ko')), cells };
}

// 선택 선수 기준 상대별 전적 추출. winRate = (승 + 0.5×무) / 경기.
export function calcPersonalRivalry({ rivalry, player, minRounds = 5 }) {
  if (!rivalry || !rivalry.cells || !player) return { opponents: [] };
  const opponents = [];
  for (const key of Object.keys(rivalry.cells)) {
    const [a, b] = key.split('|');
    if (a !== player && b !== player) continue;
    const opponent = a === player ? b : a;
    const c = rivalry.cells[key];
    const wins = a === player ? c.aWins : c.bWins;
    const losses = a === player ? c.bWins : c.aWins;
    opponents.push({
      opponent,
      games: c.games,
      wins,
      losses,
      draws: c.draws,
      winRate: c.games > 0 ? (wins + 0.5 * c.draws) / c.games : 0,
      isLowSample: c.games < minRounds,
    });
  }
  opponents.sort((x, y) => y.games - x.games || x.opponent.localeCompare(y.opponent, 'ko'));
  return { opponents };
}
