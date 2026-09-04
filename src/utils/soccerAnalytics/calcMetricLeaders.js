// 어워드 탭 "지표 Top5" — 개인분석 레이더 6축과 동일한 raw 지표 + 팀득점관여율.
// 소스는 calcPlayerSummary.perPlayer 단일소스.
// 진입 기준 minRounds=10: 레이더 모집단(>=3)보다 높음 — 랭킹 카드는 3경기 2골(0.67골/경기)
// 같은 소표본이 1위를 차지하는 왜곡이 커서 상향. 키퍼는 수문장 카드와 동일(keeperRounds>=4).
//
// minRounds/minKeeperRounds에 **null을 명시**하면 동적으로 전환된다(풋살과 같은 식:
// 축 최대치의 ratio, 기본 30%, 올림). 어워드 탭의 '최근 한 달' 모드가 이 경로를 쓴다 —
// 30일 창에 고정 10경기를 그대로 걸면 진입선이 표본에 비해 과하게 높기 때문이다.
// 생략(undefined)하면 기존 고정값이라 누적 화면은 무변경.
//
// ★ 풋살과 구조가 다르다(적대적 리뷰 2026-09-04에서 확인):
//   풋살은 defense/keeping을 entries(전원) 위에서 각자의 축(minFieldRounds/minKeeperRounds)으로
//   거르지만, 축구는 rated(이미 minRounds로 걸러진 풀) 위에서 거른다. 여기에
//   minFieldRounds를 새로 도입하면 진입선 완화가 아니라 **모집단 자체가 바뀌는** 의미 변경이라
//   도입하지 않는다. 축구의 수비 축 진입선은 계속 minRounds다.
//
// 반환: { scoring, creativity, defense, keeping, attendance, winRate, involvement, thresholds }
//   각 항목 [{ player, value, ...표본 필드 }] (최대 topN)
//   defense/keeping은 낮을수록 좋음(오름차순), 나머지는 내림차순.
//   thresholds: 실제 적용된 진입선/최대치 — AwardsTab 캡션이 쓴다(풋살과 같은 모양).
import { dynamicMin } from './dynamicMin';

// minTeamGoals: 관여율 분모(출전 매치 팀득점) 최소치 — 팀 4골 중 3회=75% 같은 소분모 왜곡 방지.
export function calcMetricLeaders({ perPlayer, totalSessions, topN = 5, minRounds = 10, minKeeperRounds = 4, minTeamGoals = 10, ratio = 0.3 }) {
  const entries = Object.entries(perPlayer || {});
  const maxOf = (key) => entries.reduce((m, [, s]) => Math.max(m, s[key] || 0), 0);
  const maxRounds = maxOf('rounds');
  const maxKeeperRounds = maxOf('keeperRounds');
  const maxFieldRounds = maxOf('fieldRounds');
  // 하한 1은 0 나눗셈 방어 — 진입선이 0이면 rounds=0인 선수의 goals/rounds가 Infinity가 된다.
  const resolvedMinRounds = Math.max(minRounds ?? dynamicMin(maxRounds, ratio), 1);
  const resolvedMinKeeperRounds = minKeeperRounds ?? dynamicMin(maxKeeperRounds, ratio);
  const rated = entries.filter(([, s]) => s.rounds >= resolvedMinRounds);

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
    defense: rank(rated.filter(([, s]) => s.fieldRounds >= resolvedMinRounds).map(([player, s]) => ({
      player, value: s.avgConceded, fieldRounds: s.fieldRounds, fieldConceded: s.fieldConceded, sample: s.fieldRounds,
    })), true),
    keeping: rank(rated.filter(([, s]) => s.keeperRounds >= resolvedMinKeeperRounds).map(([player, s]) => ({
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
    // minFieldRounds는 축구에 별도 축이 없다 — 수비도 minRounds로 걸리므로 같은 값을 싣는다.
    thresholds: {
      minRounds: resolvedMinRounds, minKeeperRounds: resolvedMinKeeperRounds,
      minFieldRounds: resolvedMinRounds, maxRounds, maxKeeperRounds, maxFieldRounds,
    },
  };
}
