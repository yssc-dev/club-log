// N×N 시너지 매트릭스: 같은팀 출전 라운드의 팀승률
// our_members_json + opponent_members_json 양쪽 모두 처리하고 (date, match_id) 단위로 dedupe
// ★ 휴식 선수는 멤버 명단에서 제외 (actualPlayers 사용)
import { parseActualPlayers } from './parseMembers';
import { winRateExcluding, recordRoundOutcome } from './pairBaseline';

export function calcSynergyMatrix({ matchLogs, minRounds = 5 }) {
  const playerSet = new Set();
  const cells = {};
  const seenByKey = {}; // key -> Set<roundKey>
  const playerRoundOutcomes = {}; // name -> { roundKey: outcome } — duo 제외 베이스라인용
  const bump = (key, outcome, roundKey) => {
    if (!seenByKey[key]) seenByKey[key] = new Set();
    if (seenByKey[key].has(roundKey)) return;
    seenByKey[key].add(roundKey);
    if (!cells[key]) cells[key] = { games: 0, wins: 0, draws: 0, losses: 0 };
    cells[key].games++;
    if (outcome === 'W') cells[key].wins++;
    else if (outcome === 'D') cells[key].draws++;
    else cells[key].losses++;
  };

  const parseMembers = (s) => parseActualPlayers(s);

  let rowSeq = 0;
  for (const m of matchLogs || []) {
    rowSeq++;
    if (m.is_extra) continue; // 연습/이벤트성 매치 제외 — calcPlayerSummary와 동일 기준
    const home = parseMembers(m.our_members_json);
    const away = parseMembers(m.opponent_members_json);
    const our = Number(m.our_score) || 0;
    const opp = Number(m.opponent_score) || 0;
    const homeOutcome = our > opp ? 'W' : (our === opp ? 'D' : 'L');
    const awayOutcome = opp > our ? 'W' : (our === opp ? 'D' : 'L');
    // match_id 없는 레거시 행은 행 단위 고유 키로 폴백 (같은 날짜 매치끼리 합쳐지는 것 방지)
    const roundKey = m.match_id ? `${m.date}|${m.match_id}` : `${m.date}|__row${rowSeq}`;

    const tally = (members, outcome) => {
      if (members.length === 0) return;
      members.forEach(n => playerSet.add(n));
      for (const name of members) {
        bump(`${name}|${name}`, outcome, roundKey);
        recordRoundOutcome(playerRoundOutcomes, name, roundKey, outcome);
      }
      for (let i = 0; i < members.length; i++) {
        for (let j = i + 1; j < members.length; j++) {
          const [a, b] = [members[i], members[j]].sort((x, y) => x.localeCompare(y, 'ko'));
          bump(`${a}|${b}`, outcome, roundKey);
        }
      }
    };

    tally(home, homeOutcome);
    tally(away, awayOutcome);
  }

  // 1차: 각 셀 winRate 계산
  for (const k of Object.keys(cells)) {
    const c = cells[k];
    c.winRate = c.games > 0 ? (c.wins + 0.5 * c.draws) / c.games : 0;
  }
  // 2차: 페어 셀에 liftSymmetric 부착 — 두 사람 "duo 라운드 제외" 개인 승률 평균 대비 추가 효과
  // (calcGoldenTrio chemistry와 동일 베이스라인 — pairBaseline.winRateExcluding 단일 소스)
  // self 셀(name|name)은 개인 전체 승률이므로 lift 0
  // 한쪽이라도 duo 제외 표본이 없으면 폴백(전체 승률)이 섞여 값이 오염 → baselineUnavailable=true
  for (const k of Object.keys(cells)) {
    const [a, b] = k.split('|');
    if (a === b) { cells[k].liftSymmetric = 0; cells[k].baselineUnavailable = false; continue; }
    const duoRounds = seenByKey[k] || new Set();
    const aBase = winRateExcluding(playerRoundOutcomes, a, duoRounds);
    const bBase = winRateExcluding(playerRoundOutcomes, b, duoRounds);
    cells[k].liftSymmetric = cells[k].winRate - (aBase.winRate + bBase.winRate) / 2;
    cells[k].baselineUnavailable = !aBase.hasBaseline || !bBase.hasBaseline;
  }

  return {
    players: [...playerSet].sort((a, b) => a.localeCompare(b, 'ko')),
    cells,
    minRounds,
  };
}
