// 매치별 휴식(absentees) 정합성 헬퍼.
//
// 휴식은 { matchId: { teamIdx: [name] } } 로 저장되지만, 용병은 같은 매치 안에서
// 팀을 옮기거나(제거 후 다른 팀에 재등록) 아예 빠질 수 있다. 그때 이름만 남으면
// "그 팀 명단엔 없는데 휴식으로 박혀있는" 유령 레코드가 된다.
// 유령이 생기면 화면엔 🪑 표시가 안 뜨는데(자기 팀 명단 기준 렌더) 동작만 차단돼
// 사용자가 휴식을 해제할 방법이 없어진다. (2026-08-13 마스터FC R1 B구장 사례)
//
// 읽기는 teamAbsentList 하나로 단일화(표시 == 차단), 쓰기 쪽 정리는 pruneAbsentPlayer.

// 매치 x 팀의 휴식 명단. players 를 주면 그 팀 현재 명단과의 교집합만 반환(유령 제거).
// RTDB 가 { "2": [...] } 를 배열로 coercion 해도 인덱스 접근이라 동일하게 동작.
export function teamAbsentList(absentees, matchId, teamIdx, players) {
  const forMatch = absentees && matchId != null ? absentees[matchId] : null;
  const raw = forMatch && teamIdx != null ? forMatch[teamIdx] : null;
  if (!Array.isArray(raw)) return [];
  if (!Array.isArray(players)) return raw;
  return raw.filter(p => players.includes(p));
}

// player 의 휴식 기록 정리.
//   onlyMatchId : 그 매치 안에서만 제거 (용병 제외 시)
//   keep        : { matchId, teamIdx } — 이 위치만 남기고 전부 제거 (용병 팀 이동 시)
// 변경이 없으면 원본 객체를 그대로 반환한다(불필요한 RTDB 쓰기/리렌더 방지).
export function pruneAbsentPlayer(absentees, player, { onlyMatchId = null, keep = null } = {}) {
  if (!absentees || !player) return absentees;
  let changed = false;
  const next = { ...absentees };
  for (const matchId of Object.keys(next)) {
    if (onlyMatchId != null && matchId !== onlyMatchId) continue;
    const forMatch = next[matchId];
    if (!forMatch) continue;
    let matchChanged = false;
    const nextForMatch = {};
    for (const teamKey of Object.keys(forMatch)) {
      const list = forMatch[teamKey];
      if (!Array.isArray(list)) continue;
      const isKept = keep != null
        && matchId === keep.matchId
        && String(teamKey) === String(keep.teamIdx);
      const updated = isKept ? list : list.filter(p => p !== player);
      if (updated.length !== list.length) matchChanged = true;
      if (updated.length > 0) nextForMatch[teamKey] = updated;
    }
    if (!matchChanged) continue;
    changed = true;
    if (Object.keys(nextForMatch).length === 0) delete next[matchId];
    else next[matchId] = nextForMatch;
  }
  return changed ? next : absentees;
}
