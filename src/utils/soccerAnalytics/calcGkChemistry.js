// C4: GK + 같은 라운드 같은 팀 필드 멤버 페어 무실점률.
// 풋살 라운드 로테이션: our/opponent 모두 같은 클럽 선수라 양쪽 다 집계.
//   - our_gk + our_members_json (실점 = opponent_score == 0)
//   - opponent_gk + opponent_members_json (실점 = our_score == 0)
// ★ 휴식 선수는 멤버 명단에서 제외 (actualPlayers 사용)

import { parseActualPlayers } from './parseMembers';

function parseMembers(s) { return parseActualPlayers(s); }

// includeOpponent: 풋살(매주 팀 로테이션)은 양팀 다 우리 클럽이라 true,
// 축구는 opponent가 외부팀이라 false (외부 GK 노이즈 방지)
export function calcGkChemistry({ matchLogs, threshold = 5, includeOpponent = true }) {
  const tally = {};
  function bump(gk, members, isClean) {
    if (!gk) return;
    if (!members || members.length === 0) return;
    if (!tally[gk]) tally[gk] = {};
    for (const field of members) {
      if (field === gk) continue;
      if (!tally[gk][field]) tally[gk][field] = { rounds: 0, cleanSheets: 0 };
      tally[gk][field].rounds += 1;
      if (isClean) tally[gk][field].cleanSheets += 1;
    }
  }
  for (const m of matchLogs || []) {
    if (m.is_extra) continue; // 연습/이벤트성 매치 제외 — calcPlayerSummary와 동일 기준
    const our = Number(m.our_score) || 0;
    const opp = Number(m.opponent_score) || 0;
    bump(m.our_gk, parseMembers(m.our_members_json), opp === 0);
    if (includeOpponent) {
      bump(m.opponent_gk, parseMembers(m.opponent_members_json), our === 0);
    }
  }

  const byGk = {};
  for (const gk of Object.keys(tally)) {
    const allPairs = Object.entries(tally[gk])
      .map(([field, { rounds, cleanSheets }]) => ({
        field, rounds, cleanSheets,
        cleanRate: rounds > 0 ? cleanSheets / rounds : 0,
      }))
      .filter(p => p.rounds >= threshold);

    const pairs = [...allPairs].sort((a, b) =>
      b.cleanRate - a.cleanRate ||
      b.rounds - a.rounds ||
      a.field.localeCompare(b.field, 'ko')
    );
    const worst = [...allPairs].sort((a, b) =>
      a.cleanRate - b.cleanRate ||
      b.rounds - a.rounds ||
      a.field.localeCompare(b.field, 'ko')
    );
    byGk[gk] = { pairs, worst };
  }

  return {
    gks: Object.keys(byGk).sort((a, b) => a.localeCompare(b, 'ko')),
    byGk,
  };
}
