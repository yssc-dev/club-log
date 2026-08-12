// 케미 스코어 TOP N
// 같은 팀으로 뛴 라운드의 듀오 승률에서 "duo 외" 개인 평균 승률을 뺀 값
// 양수일수록 "둘이 같이 뛰면 평소보다 잘함"
// our_members_json + opponent_members_json 모두 처리, (date, match_id)로 dedupe
// ★ 휴식 선수는 멤버 명단에서 제외 (actualPlayers 사용)
// ★ 개인 baseline은 duo가 *함께 뛰지 않은* 라운드만 사용 (소표본 인플레이션 방지)
//   — pairBaseline.winRateExcluding 단일 소스 (calcSynergyMatrix liftSymmetric과 동일)
// ★ 한쪽이라도 duo 제외 표본이 없으면 baselineUnavailable=true (전체승률 폴백 = 오염된 값)
//   → 정렬 시 측정 가능한 페어 뒤로, UI는 '측정 불가(항상 동행)' 표시
import { parseActualPlayers } from './parseMembers';
import { winRateExcluding, recordRoundOutcome, meanExcluding } from './pairBaseline';

export function calcGoldenTrio({ matchLogs, minRounds = 5, topN = 5 }) {
  const pairs = {};
  const players = {};

  const parseMembers = (s) => parseActualPlayers(s);

  const seenIndividual = {}; // playerName -> Set<roundKey>
  const seenPair = {};       // pairKey -> Set<roundKey>
  // playerName -> { roundKey -> outcome } : duo 라운드 제외 baseline 계산용
  const playerRoundOutcomes = {};
  // playerName -> { roundKey -> 그 라운드 자기팀 득점 } : 공격 케미 baseline용
  const playerRoundGoals = {};

  const bumpPlayer = (name, outcome, roundKey, goalsFor) => {
    if (!seenIndividual[name]) seenIndividual[name] = new Set();
    if (seenIndividual[name].has(roundKey)) return;
    seenIndividual[name].add(roundKey);
    if (!players[name]) players[name] = { games: 0, wins: 0, draws: 0, losses: 0 };
    players[name].games++;
    if (outcome === 'W') players[name].wins++;
    else if (outcome === 'D') players[name].draws++;
    else players[name].losses++;
    recordRoundOutcome(playerRoundOutcomes, name, roundKey, outcome);
    if (!playerRoundGoals[name]) playerRoundGoals[name] = {};
    if (!(roundKey in playerRoundGoals[name])) playerRoundGoals[name][roundKey] = goalsFor;
  };

  const bumpPair = (key, outcome, ref, roundKey) => {
    if (!seenPair[key]) seenPair[key] = new Set();
    if (seenPair[key].has(roundKey)) return;
    seenPair[key].add(roundKey);
    if (!pairs[key]) pairs[key] = { games: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, matches: [] };
    pairs[key].games++;
    pairs[key].goalsFor += ref.our;
    if (outcome === 'W') pairs[key].wins++;
    else if (outcome === 'D') pairs[key].draws++;
    else pairs[key].losses++;
    pairs[key].matches.push({ ...ref, outcome });
  };

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

    const homeRef = { date: m.date, match_id: m.match_id, side: 'home', team: m.our_team_name, opponent: m.opponent_team_name, our, opp };
    const awayRef = { date: m.date, match_id: m.match_id, side: 'away', team: m.opponent_team_name, opponent: m.our_team_name, our: opp, opp: our };

    const tally = (members, outcome, ref) => {
      if (members.length === 0) return;
      for (const name of members) bumpPlayer(name, outcome, roundKey, ref.our);
      if (members.length < 2) return;
      const sorted = [...members].sort((a, b) => a.localeCompare(b, 'ko'));
      for (let i = 0; i < sorted.length; i++) {
        for (let j = i + 1; j < sorted.length; j++) {
          bumpPair(`${sorted[i]}|${sorted[j]}`, outcome, ref, roundKey);
        }
      }
    };

    tally(home, homeOutcome, homeRef);
    tally(away, awayOutcome, awayRef);
  }

  return Object.entries(pairs)
    .filter(([, v]) => v.games >= minRounds)
    .map(([key, v]) => {
      const [a, b] = key.split('|');
      const pairWR = (v.wins + 0.5 * v.draws) / v.games;
      const duoRounds = seenPair[key] || new Set();
      const aBase = winRateExcluding(playerRoundOutcomes, a, duoRounds);
      const bBase = winRateExcluding(playerRoundOutcomes, b, duoRounds);
      const indivAvg = (aBase.winRate + bBase.winRate) / 2;
      // 공격 케미: 함께 뛴 라운드의 팀 경기당 득점 vs 개인 평균(duo 제외)
      const aGoal = meanExcluding(playerRoundGoals, a, duoRounds);
      const bGoal = meanExcluding(playerRoundGoals, b, duoRounds);
      const pairGoalsPerGame = v.games > 0 ? v.goalsFor / v.games : 0;
      const indivGoalsPerGame = (aGoal.mean + bGoal.mean) / 2;
      return {
        members: [a, b],
        games: v.games, wins: v.wins, draws: v.draws, losses: v.losses,
        winRate: pairWR,
        indivAvg,
        chemistry: pairWR - indivAvg,
        pairGoalsPerGame,
        indivGoalsPerGame,
        attackLift: pairGoalsPerGame - indivGoalsPerGame,
        baselineUnavailable: !aBase.hasBaseline || !bBase.hasBaseline,
        matches: v.matches,
      };
    })
    .sort((a, b) =>
      // 측정 가능한 페어 우선, 그 안에서 chemistry 내림차순
      (a.baselineUnavailable === b.baselineUnavailable ? 0 : a.baselineUnavailable ? 1 : -1) ||
      b.chemistry - a.chemistry || b.games - a.games)
    .slice(0, topN);
}
