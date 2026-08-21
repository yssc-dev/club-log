// 어워드 탭 "지표 Top5" — 개인분석 레이더 6축과 동일한 raw 지표 + 팀득점관여율.
// 소스는 calcPlayerSummary.perPlayer 단일소스.
//
// 진입 기준은 동적(2026-08-21 유저 요청, 풋살만·축구는 고정 10 유지):
//   각 지표를 자기 표본 축 최대치의 ratio(기본 30%, 올림)로 게이트한다.
//   - 득점력/창의력/참석률/승리기여/관여율: rounds >= ceil(max(rounds)×30%)
//   - 수비력: fieldRounds >= ceil(max(fieldRounds)×30%)
//   - 키퍼:   keeperRounds >= ceil(max(keeperRounds)×30%) — 수문장 카드(4경기 고정)와는 이제 다른 기준
//   데이터가 쌓여 최대치가 오르면 진입선도 자동 상향. 시즌 극초반(최대치 자체가 소표본)엔
//   진입선도 같이 낮아지는 건 감수 — 고정 하한은 두지 않기로 함.
//
// 반환: { scoring, creativity, defense, keeping, attendance, winRate, involvement, thresholds }
//   각 지표 [{ player, value, ...표본 필드 }] (최대 topN)
//   defense/keeping은 낮을수록 좋음(오름차순), 나머지는 내림차순.
//   thresholds: 계산된 진입선/최대치 — AwardsTab 캡션이 실제 경기수를 표기하는 데 쓴다.

// minTeamGoals: 관여율 분모(출전 매치 팀득점) 최소치 — 팀 4골 중 3회=75% 같은 소분모 왜곡 방지.
export function calcMetricLeaders({ perPlayer, totalSessions, topN = 5, ratio = 0.3, minTeamGoals = 10 }) {
  const entries = Object.entries(perPlayer || {});
  const maxOf = (key) => entries.reduce((m, [, s]) => Math.max(m, s[key] || 0), 0);
  const maxRounds = maxOf('rounds');
  const maxKeeperRounds = maxOf('keeperRounds');
  const maxFieldRounds = maxOf('fieldRounds');
  const minRounds = Math.ceil(maxRounds * ratio);
  const minKeeperRounds = Math.ceil(maxKeeperRounds * ratio);
  const minFieldRounds = Math.ceil(maxFieldRounds * ratio);
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
    defense: rank(entries.filter(([, s]) => s.fieldRounds >= minFieldRounds).map(([player, s]) => ({
      player, value: s.avgConceded, fieldRounds: s.fieldRounds, fieldConceded: s.fieldConceded, sample: s.fieldRounds,
    })), true),
    keeping: rank(entries.filter(([, s]) => s.keeperRounds >= minKeeperRounds).map(([player, s]) => ({
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
    thresholds: { minRounds, minKeeperRounds, minFieldRounds, maxRounds, maxKeeperRounds, maxFieldRounds },
  };
}
