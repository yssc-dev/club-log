// 지표 테이블 컬럼 정렬용 순수 헬퍼. 계산 유틸과 무관, 행 순서만 바꾼다.
export function defaultDirFor(sampleValue) {
  return typeof sampleValue === 'number' ? 'desc' : 'asc';
}

export function nextSort(sort, key, defaultDir) {
  if (sort && sort.key === key) {
    return { key, dir: sort.dir === 'asc' ? 'desc' : 'asc' };
  }
  return { key, dir: defaultDir };
}

export function sortRows(rows, accessor, dir) {
  const mul = dir === 'desc' ? -1 : 1;
  return [...(rows || [])]
    .map((row, i) => [row, i])
    .sort(([a, ai], [b, bi]) => {
      const va = accessor(a);
      const vb = accessor(b);
      let c;
      if (typeof va === 'number' && typeof vb === 'number') c = va - vb;
      else c = String(va).localeCompare(String(vb), 'ko');
      return c !== 0 ? c * mul : ai - bi; // 안정 정렬: 동값이면 원 인덱스
    })
    .map(([row]) => row);
}
