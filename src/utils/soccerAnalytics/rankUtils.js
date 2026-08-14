// 공동 순위 랭킹 공용 유틸 (CrovaGogumaRankTab의 buildTop 로직을 공용화).
// rows: [{ player|name, value, ... }] — value 내림차순, 동률은 이름 가나다순.
// 동점자는 같은 rank, 다음 순위는 인원수만큼 건너뜀 (1,1,3).
// limit는 "rank <= limit" 기준 — 공동 순위가 경계에 걸리면 전원 포함.
export function buildRankedTop(rows, { limit = 5 } = {}) {
  const nameOf = (r) => r.player ?? r.name ?? '';
  const arr = [...rows].sort((a, b) =>
    b.value - a.value || nameOf(a).localeCompare(nameOf(b), 'ko'));
  let rank = 0, prevValue = null;
  const ranked = arr.map((row, i) => {
    if (row.value !== prevValue) { rank = i + 1; prevValue = row.value; }
    return { ...row, rank };
  });
  return ranked.filter(r => r.rank <= limit);
}

// 이름 → 순위 맵. buildRankedTop과 같은 공동 순위 규약(1,1,3)이지만 잘라내지 않고,
// 낮을수록 좋은 축(실점률 등)도 받는다. 개인 화면에서 "내가 몇 위인지" 조회용.
export function rankMap(rows, valueOf, { lowerIsBetter = false } = {}) {
  const nameOf = (r) => r.player ?? r.name ?? '';
  const arr = [...(rows || [])].sort((a, b) => {
    const d = lowerIsBetter ? valueOf(a) - valueOf(b) : valueOf(b) - valueOf(a);
    return d || nameOf(a).localeCompare(nameOf(b), 'ko');
  });
  const map = new Map();
  let rank = 0, prev = null;
  arr.forEach((row, i) => {
    const v = valueOf(row);
    if (v !== prev) { rank = i + 1; prev = v; }
    map.set(nameOf(row), rank);
  });
  return map;
}

// 순위 정렬된 목록에서 특정 인물 주변만 잘라낸다 — 43명 전체를 그리면 읽히지 않으므로
// "내 위 2명 + 나 + 아래 2명"만 본다. 경계(1위·꼴등)에서는 반대쪽으로 밀어 창 크기를 유지한다.
// rows는 이미 순위순이어야 한다(정렬하지 않는다).
export function rankWindow(rows, name, radius = 2) {
  const list = rows || [];
  if (list.length === 0) return [];
  const size = radius * 2 + 1;
  const idx = list.findIndex(r => (r.player ?? r.name) === name);
  if (idx === -1) return list.slice(0, size); // 본인이 없으면 상위부터
  let start = Math.max(0, idx - radius);
  let end = start + size;
  if (end > list.length) { end = list.length; start = Math.max(0, end - size); }
  return list.slice(start, end);
}

// gameStateAnalyzer(orphan)에서 인라인 — soccerAnalytics는 orphan 모듈에 의존하지 않는다
export function percentile(values, value, lowerIsBetter = false) {
  if (values.length === 0) return 50;
  const sorted = [...values].sort((a, b) => a - b);
  let rank = sorted.findIndex(v => v >= value);
  if (rank === -1) rank = sorted.length;
  const pct = (rank / sorted.length) * 100;
  return lowerIsBetter ? 100 - pct : pct;
}
