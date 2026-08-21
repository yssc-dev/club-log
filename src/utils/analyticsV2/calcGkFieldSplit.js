// GK vs 필드 스플릿 — "내가 GK일 때 vs 필드일 때 팀 득점/실점" 비교 (개인분석 탭 카드).
// 풋살 로테이션이라 our/opponent 양쪽 다 우리 클럽 선수 → 양 사이드 집계.
//
// GK가 기록된 사이드만 집계한다: GK 미기록 매치(레거시 ~2026-04-23 다수)는
// 그 선수가 GK였는지 필드였는지 확정할 수 없어 사이드 전체를 제외.
// 그래서 여기 games 합계는 calcPlayerSummary.rounds보다 작을 수 있다.
// 휴식(absent) 선수는 parseActualPlayers가 걸러낸다.

import { parseActualPlayers } from './parseMembers';

export function calcGkFieldSplit({ matchLogs = [] } = {}) {
  const perPlayer = {};
  const ensure = (name) => {
    if (!perPlayer[name]) {
      perPlayer[name] = {
        gk: { games: 0, goalsFor: 0, goalsAgainst: 0 },
        field: { games: 0, goalsFor: 0, goalsAgainst: 0 },
      };
    }
    return perPlayer[name];
  };

  const tallySide = (gk, membersJson, goalsFor, goalsAgainst) => {
    if (!gk) return; // GK 미기록 → 필드 여부 확정 불가, 사이드 제외
    // GK가 명단에 빠져 있어도 gk 필드가 출전의 권위 소스이므로 합집합으로 집계
    const players = new Set([...parseActualPlayers(membersJson), gk]);
    for (const name of players) {
      const bucket = name === gk ? ensure(name).gk : ensure(name).field;
      bucket.games += 1;
      bucket.goalsFor += goalsFor;
      bucket.goalsAgainst += goalsAgainst;
    }
  };

  for (const m of matchLogs) {
    if (m.is_extra) continue;
    const our = Number(m.our_score) || 0;
    const opp = Number(m.opponent_score) || 0;
    tallySide(m.our_gk, m.our_members_json, our, opp);
    tallySide(m.opponent_gk, m.opponent_members_json, opp, our);
  }

  return { perPlayer };
}
