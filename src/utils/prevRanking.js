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
//
// 역주행·고구마는 대시보드 시트에 '개수'가 아니라 이미 '감점 포인트(음수)'로
// 저장된다(역주행 1개 = -2). 실측: 마스터FC 78명 전원 역주행 -8~0, 고구마 -9~0,
// 양수 0건. 따라서 감점이 적은(= 0에 가까운, 값이 큰) 쪽이 상위여야 하므로
// 내림차순이다. 오름차순이면 자책이 많은 쪽이 동점 대결에서 이긴다
// (110 동점에서 박재운 자책2가 조재상 자책1보다 위로 오던 버그).
// 축구 대시보드의 자책골 열은 전 선수 0이라(하버FC 49명 실측) 영향 없다.
export function dashboardRankComparator(a, b) {
  if (b.point !== a.point) return b.point - a.point;
  if (a.ownGoals !== b.ownGoals) return b.ownGoals - a.ownGoals;
  if (a.goguma !== b.goguma) return b.goguma - a.goguma;
  if (b.goals !== a.goals) return b.goals - a.goals;
  if (b.assists !== a.assists) return b.assists - a.assists;
  return b.cleanSheets - a.cleanSheets;
}

// 직전 경기 포인트 증분 — 대시보드의 ↑/HOT·COLD 배지가 쓰는 단일 소스.
//
// 대시보드 시트의 '변동' 열(G/I/K/P)을 쓰면 안 된다. 그 열은 기준선이 시즌
// 단위라 '직전 경기'가 아니고(마스터FC 실측: 신관수 골 29 중 변동 +29,
// 어시 49 중 +48), 크로바/고구마는 변동 열 자체가 시트에 없다.
// 대신 getLatestDeltas(선수별집계기록 로그의 최신 경기일 행)를 쓴다 —
// 6개 항목이 모두 있고, 개인 누적 기록의 ▲/▼ 배지와 같은 출처가 된다.
//
// 포인트 6항 합산과 동일한 식이며 역주행/고구마는 이미 부호가 실린 값이다.
// isSoccer면 크로바/고구마를 버린다 — 사유는 파일 상단 주석 참조.
export function latestPointDelta(raw, { isSoccer = false } = {}) {
  if (!raw) return 0;
  const d = isSoccer ? { ...raw, crova: 0, goguma: 0 } : raw;
  return (d.goals || 0) + (d.assists || 0) + (d.ownGoals || 0)
       + (d.cleanSheets || 0) + (d.crova || 0) + (d.goguma || 0);
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
      point: (p.point || 0) - latestPointDelta(raw, { isSoccer }),
    };
  });
  prevMembers.sort(dashboardRankComparator);
  const map = {};
  prevMembers.forEach((p, i) => { map[p.name] = i + 1; });
  return map;
}
