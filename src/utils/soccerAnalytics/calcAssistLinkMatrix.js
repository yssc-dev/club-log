// 나의 짝꿍 어시-골 연결: (득점자, 어시) 쌍을 정렬키로 누적.
// 키 규약은 calcSynergyMatrix와 동일 (가나다 정렬, localeCompare 'ko').
// owngoal/단독골/자기어시는 제외. eventLogs 기반(matchLogs 아님).

function pairKey(x, y) {
  return [x, y].sort((a, b) => a.localeCompare(b, 'ko')).join('|');
}

export function calcAssistLinkMatrix({ eventLogs }) {
  const cells = {};
  for (const e of eventLogs || []) {
    if (e.event_type !== 'goal') continue;
    const scorer = e.player;
    const assister = e.related_player;
    if (!scorer || !assister || scorer === assister) continue;
    const [a, b] = [scorer, assister].sort((x, y) => x.localeCompare(y, 'ko'));
    const key = `${a}|${b}`;
    if (!cells[key]) cells[key] = { total: 0, aToB: 0, bToA: 0 };
    cells[key].total++;
    // aToB = a가 득점(b가 어시), bToA = b가 득점(a가 어시)
    if (scorer === a) cells[key].aToB++;
    else cells[key].bToA++;
  }
  return { cells };
}

// 선택된 본인 기준 방향 추출: iAssisted=내가 어시(짝꿍 득점), iScored=내가 득점(짝꿍 어시)
// cells.aToB=a득점(b어시), cells.bToA=b득점(a어시).
export function personalLink({ linkMatrix, player, partner }) {
  const cell = linkMatrix?.cells?.[pairKey(player, partner)];
  if (!cell) return { total: 0, iAssisted: 0, iScored: 0 };
  const [a] = [player, partner].sort((x, y) => x.localeCompare(y, 'ko'));
  const iAmA = player === a;
  return {
    total: cell.total,
    // aToB=a득점(b어시), bToA=b득점(a어시)
    // iAmA=true(나=a): 내가 어시=bToA(b=짝꿍 득점), 내가 득점=aToB
    // iAmA=false(나=b): 내가 어시=aToB(a=짝꿍 득점), 내가 득점=bToA
    iAssisted: iAmA ? cell.bToA : cell.aToB,
    iScored: iAmA ? cell.aToB : cell.bToA,
  };
}
