// 개인 누적 기록의 ▲/▼ 배지 — '직전 경기 이전' 순위 재구성 (TeamDashboard에서 추출).
// 현재 누적에서 최신 경기 증분(getLatestDeltas)을 빼서 이전 상태를 만들고,
// 대시보드와 동일한 정렬로 이전 순위를 매긴다.
//
// isSoccer면 크로바/고구마 증분을 무시한다. 축구엔 두 개념이 없는데,
// 서버 열매핑 폴백이 하버FC 선수기록보관소(크로바/고구마 헤더 없음)에서
// 클린시트/실점 열을 크로바/고구마로 오독해 보냈다 — GK가 실점하면 이전 포인트가
// 실점만큼 깎여 유령 ▲가 붙던 사고(8/18 선효림 ▲5)의 클라이언트 방어선.
// 근본 수정은 Code.js _playerLogColMap 폴백(-1)이며, 이 가드는 서버 미배포 구간을 덮는다.

// 대시보드 포인트 정렬과 동일한 비교자 — pointRankMap/이전 순위 재구성이 공유한다.
export function dashboardRankComparator(a, b) {
  if (b.point !== a.point) return b.point - a.point;
  if (a.ownGoals !== b.ownGoals) return a.ownGoals - b.ownGoals;
  if (a.goguma !== b.goguma) return a.goguma - b.goguma;
  if (b.goals !== a.goals) return b.goals - a.goals;
  if (b.assists !== a.assists) return b.assists - a.assists;
  return b.cleanSheets - a.cleanSheets;
}

export function buildPrevRankMap(members, deltas, { isSoccer = false } = {}) {
  if (!deltas || Object.keys(deltas).length === 0 || !members || members.length === 0) return {};
  const prevMembers = members.map(p => {
    const raw = deltas[p.name];
    if (!raw) return { ...p }; // 증분 없음 = 그 경기 무변동
    const d = isSoccer ? { ...raw, crova: 0, goguma: 0 } : raw;
    return {
      ...p,
      goals: (p.goals || 0) - (d.goals || 0),
      assists: (p.assists || 0) - (d.assists || 0),
      ownGoals: (p.ownGoals || 0) - (d.ownGoals || 0),
      cleanSheets: (p.cleanSheets || 0) - (d.cleanSheets || 0),
      crova: (p.crova || 0) - (d.crova || 0),
      goguma: (p.goguma || 0) - (d.goguma || 0),
      point: (p.point || 0) - ((d.goals || 0) + (d.assists || 0) + (d.ownGoals || 0) + (d.cleanSheets || 0) + (d.crova || 0) + (d.goguma || 0)),
    };
  });
  prevMembers.sort(dashboardRankComparator);
  const map = {};
  prevMembers.forEach((p, i) => { map[p.name] = i + 1; });
  return map;
}
