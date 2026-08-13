// 페어 케미 공용 베이스라인: "duo 라운드를 제외한" 개인 승률.
// calcGoldenTrio(chemistry)와 calcSynergyMatrix(liftSymmetric)가 같은 케미 개념을
// 다른 공식으로 계산하던 불일치를 해소하기 위한 단일 소스.
//
// playerRoundOutcomes: { name: { roundKey: 'W'|'D'|'L' } }
// duoRounds: Set<roundKey> — 두 사람이 함께 뛴 라운드
//
// 반환 { winRate, hasBaseline }:
//   hasBaseline=false → duo 제외 표본 0 (항상 동행). winRate는 전체 승률 폴백이며
//   이 값으로 계산한 lift/chemistry는 오염되므로 소비자는 baselineUnavailable로 표시해야 함.
export function winRateExcluding(playerRoundOutcomes, name, duoRounds) {
  const ro = playerRoundOutcomes[name];
  if (!ro) return { winRate: 0, hasBaseline: false };
  let games = 0, wins = 0, draws = 0;
  let allGames = 0, allWins = 0, allDraws = 0;
  for (const rk of Object.keys(ro)) {
    const o = ro[rk];
    allGames++;
    if (o === 'W') allWins++;
    else if (o === 'D') allDraws++;
    if (duoRounds && duoRounds.has(rk)) continue;
    games++;
    if (o === 'W') wins++;
    else if (o === 'D') draws++;
  }
  if (games === 0) {
    return {
      winRate: allGames > 0 ? (allWins + 0.5 * allDraws) / allGames : 0,
      hasBaseline: false,
    };
  }
  return { winRate: (wins + 0.5 * draws) / games, hasBaseline: true };
}

// 첫 기록 우선 (같은 roundKey 중복 행 방어 — 집계 dedupe와 동일 규칙)
export function recordRoundOutcome(playerRoundOutcomes, name, roundKey, outcome) {
  if (!playerRoundOutcomes[name]) playerRoundOutcomes[name] = {};
  if (!(roundKey in playerRoundOutcomes[name])) {
    playerRoundOutcomes[name][roundKey] = outcome;
  }
}

// 라운드별 수치(예: 그 라운드 자기팀 득점)의 duo 제외 평균 — 공격 케미 베이스라인용.
// playerRoundValues: { name: { roundKey: number } }
export function meanExcluding(playerRoundValues, name, duoRounds) {
  const rv = playerRoundValues[name];
  if (!rv) return { mean: 0, hasBaseline: false };
  let sum = 0, n = 0, allSum = 0, allN = 0;
  for (const rk of Object.keys(rv)) {
    const v = rv[rk];
    allSum += v; allN++;
    if (duoRounds && duoRounds.has(rk)) continue;
    sum += v; n++;
  }
  if (n === 0) return { mean: allN > 0 ? allSum / allN : 0, hasBaseline: false };
  return { mean: sum / n, hasBaseline: true };
}
