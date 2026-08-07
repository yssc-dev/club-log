// 랭킹 포인트는 단식(길로틴리그) 전용이며 조건별로 누적된다.
//   기본승 1
//   + 동일 리그에서 승률 낮은 쪽이 이김  2   ┐ 같은 리그 / 다른 리그라
//   + 장미가 기사를 이김                 3   ┘ 둘은 상호 배타적이다
//   + 하위 등급이 상위 등급을 이김       5
// 최대 1+3+5 = 9점.
//
// ★ 등급이 2단계 이상 차이날 때(동배가 금배를 이김)의 점수는 의뢰인 확인 대기 중이다.
//   기본값은 "차이 무관 고정 5점"이고, gradeUpsetPerStep을 켜면 단계당 가산으로 바뀐다.
//   확정되면 이 파일이 아니라 호출부의 rules 객체만 바꾸면 된다.

import { GRADE_RANK, LEAGUE_BR, COMPETITION_SINGLES } from './tennisSchema';

export const DEFAULT_POINT_RULES = {
  baseWin: 1,
  sameLeagueUpset: 2,
  leagueUpset: 3,
  gradeUpset: 5,
  gradeUpsetPerStep: false,
};

export function calcMatchPoints(ctx, rules = DEFAULT_POINT_RULES) {
  if (!ctx || ctx.format !== '단식') return 0;
  if (ctx.league !== COMPETITION_SINGLES) return 0;

  const w = ctx.winner || {};
  const l = ctx.loser || {};
  let points = rules.baseWin;

  const sameLeague = w.leagueTier === l.leagueTier;
  if (sameLeague) {
    if ((w.winRate || 0) < (l.winRate || 0)) points += rules.sameLeagueUpset;
  } else if (w.leagueTier === LEAGUE_BR) {
    points += rules.leagueUpset;
  }

  // 용병은 명부에 없어 등급이 없다. 빈 문자열을 등급 상수와 비교하지 않는다.
  if (!w.isGuest && !l.isGuest) {
    const wr = GRADE_RANK[w.grade];
    const lr = GRADE_RANK[l.grade];
    if (wr !== undefined && lr !== undefined && wr < lr) {
      points += rules.gradeUpsetPerStep
        ? rules.gradeUpset * (lr - wr)
        : rules.gradeUpset;
    }
  }

  return points;
}
