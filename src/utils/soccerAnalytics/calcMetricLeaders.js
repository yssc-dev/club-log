// 어워드 탭 "지표 Top5" — 개인분석 레이더 6축과 동일한 raw 지표 + 팀득점관여율.
// 소스는 calcPlayerSummary.perPlayer 단일소스.
// 진입 기준 minRounds=10: 레이더 모집단(>=3)보다 높음 — 랭킹 카드는 3경기 2골(0.67골/경기)
// 같은 소표본이 1위를 차지하는 왜곡이 커서 상향. 키퍼는 수문장 카드와 동일(keeperRounds>=4).
//
// 반환: { scoring, creativity, defense, keeping, attendance, winRate, involvement }
//   각 항목 [{ player, value, ...표본 필드 }] (최대 topN)
//   defense/keeping은 낮을수록 좋음(오름차순), 나머지는 내림차순.

// minTeamGoals: 관여율 분모(출전 매치 팀득점) 최소치 — 팀 4골 중 3회=75% 같은 소분모 왜곡 방지.
export function calcMetricLeaders({ perPlayer, totalSessions, topN = 5, minRounds = 10, minKeeperRounds = 4, minTeamGoals = 10 }) {
  const entries = Object.entries(perPlayer || {});
  const rated = entries.filter(([, s]) => s.rounds >= minRounds);

  // asc=false: value 내림차순 / asc=true: 오름차순. 동률은 표본(sample) 큰 쪽, 그다음 이름순.
  const rank = (list, asc = false) =>
    list
      .sort((a, b) =>
        (asc ? a.value - b.value : b.value - a.value) ||
        (b.sample - a.sample) ||
        a.player.localeCompare(b.player, 'ko'))
      .slice(0, topN)
      .map(({ sample, ...rest }) => { void sample; return rest; });

  return {
    scoring: rank(rated.map(([player, s]) => ({
      player, value: s.goals / s.rounds, goals: s.goals, rounds: s.rounds, sample: s.rounds,
    }))),
    creativity: rank(rated.map(([player, s]) => ({
      player, value: s.assists / s.rounds, assists: s.assists, rounds: s.rounds, sample: s.rounds,
    }))),
    defense: rank(rated.filter(([, s]) => s.fieldRounds >= minRounds).map(([player, s]) => ({
      player, value: s.avgConceded, fieldRounds: s.fieldRounds, fieldConceded: s.fieldConceded, sample: s.fieldRounds,
    })), true),
    keeping: rank(rated.filter(([, s]) => s.keeperRounds >= minKeeperRounds).map(([player, s]) => ({
      player, value: s.keeperRounds > 0 ? s.conceded / s.keeperRounds : 0, keeperRounds: s.keeperRounds, conceded: s.conceded, sample: s.keeperRounds,
    })), true),
    attendance: rank(rated.map(([player, s]) => ({
      player, value: totalSessions > 0 ? s.games / totalSessions : 0, games: s.games, totalSessions, sample: s.games,
    }))),
    winRate: rank(rated.map(([player, s]) => ({
      player, value: s.winRate, matches: s.matches, wins: s.wins, draws: s.draws, losses: s.losses, sample: s.matches,
    }))),
    involvement: rank(rated.filter(([, s]) => s.teamGoals >= minTeamGoals).map(([player, s]) => ({
      player, value: s.goalInvolvement, goals: s.goals, assists: s.assists, teamGoals: s.teamGoals, sample: s.rounds,
    }))),
  };
}
