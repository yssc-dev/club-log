// 시트 캐시의 순수 로직. firebase 를 import 하지 않는다 — 브라우저·러너·테스트
// 어디서든 쓸 수 있어야 한다.
//
// 저장 형식은 배열형: { version, headers, rows, count }
//   - 객체 배열로 저장하면 컬럼 이름이 매 행마다 반복된다. 배열형은 그 41~55% 크기다
//     (실측: 설계 문서 §4.1).
//   - headers 를 함께 저장해 스키마가 바뀌면 자동으로 미스가 되게 한다.

export const MISS_NO_NODE = 'no-node';
export const MISS_NO_VERSION = 'no-version';
export const MISS_SCHEMA = 'schema';
export const MISS_EXPIRED = 'expired';
export const MISS_MODE = 'mode';
export const MISS_SHEET = 'sheet';

// 객체 배열 → 배열형.
// null/undefined 를 '' 로 정규화하는 것은 의도적이다: RTDB 는 배열 원소의 null 을
// 드롭해 {"0":a,"2":c} 로 저장하므로, 되읽을 때 인덱스가 밀려 컬럼 매핑이 통째로
// 어긋난다. 0 과 false 는 유효값이므로 보존한다.
export function encodeRows(columns, objects) {
  const list = Array.isArray(objects) ? objects : [];
  return {
    headers: columns,
    rows: list.map(o => columns.map(c => {
      const v = o?.[c];
      return v === null || v === undefined ? '' : v;
    })),
    count: list.length,
  };
}

// 응답 값을 그대로 보관한다. 중첩 맵처럼 배열형에 맞지 않는 데이터셋용이며,
// 대상이 수 KB라 배열형 압축 이득이 없다. 캐시가 데이터를 재해석하지 않는 편이
// 의미론적으로도 정확하다.
export function encodeRaw(value) {
  return { data: value };
}

// 배열형 → 객체 배열.
export function decodeRows(headers, rows) {
  const list = Array.isArray(rows) ? rows : [];
  return list.map(r => {
    const o = {};
    for (let i = 0; i < headers.length; i++) {
      const v = Array.isArray(r) ? r[i] : undefined;
      o[headers[i]] = v === undefined || v === null ? '' : v;
    }
    return o;
  });
}

// 캐시 노드 히트 판정.
// ★ 히트 여부는 rows 가 아니라 version 으로 판정한다 — RTDB 는 빈 배열/빈 객체를
//   저장하지 않으므로, 내용이 사라진 노드와 "진짜 0행"을 내용으로는 구분할 수 없다.
//
// opts = { mode='rows', columns, sheetName }
//  - mode 'rows': columns 와 저장된 headers 를 배열 동등 비교(스키마 드리프트 가드)
//  - mode 'raw' : data 를 그대로 돌려준다
//  - sheetName 을 넘기면 노드의 sheetName 과 일치해야 한다. 캐시 키가 팀+종목이라
//    설정에서 시트명을 바꿔도 같은 노드를 가리키기 때문이다.
export function readCacheNode(node, opts, ttlMs, now) {
  const { mode = 'rows', columns, sheetName } = opts || {};
  if (!node || typeof node !== 'object') return { ok: false, reason: MISS_NO_NODE };
  if (typeof node.version !== 'number') return { ok: false, reason: MISS_NO_VERSION };

  const nodeIsRaw = Object.prototype.hasOwnProperty.call(node, 'data');
  if ((mode === 'raw') !== nodeIsRaw) return { ok: false, reason: MISS_MODE };

  if (sheetName !== undefined && node.sheetName !== sheetName) {
    return { ok: false, reason: MISS_SHEET };
  }

  if (mode === 'rows') {
    const h = node.headers;
    if (!Array.isArray(h) || h.length !== (columns || []).length || h.some((c, i) => c !== columns[i])) {
      return { ok: false, reason: MISS_SCHEMA };
    }
  }

  // now - version 이 음수(기기 시계가 뒤처짐)면 만료가 아니다.
  if (now - node.version > ttlMs) return { ok: false, reason: MISS_EXPIRED };

  return { ok: true, rows: mode === 'raw' ? node.data : decodeRows(node.headers, node.rows) };
}

// L3 가 빈 배열을 주면 캐시에 쓰지 않는다.
// tennisSync._safeRead 는 조회 실패도 [] 로 삼키므로, 그 [] 를 저장하면 빈 캐시가
// TTL 동안 고착돼 앱이 데이터를 잃은 것처럼 보인다. "진짜 0행"과 "조회 실패"를
// 구분할 방법이 없으므로 보수적으로 간다 — 첫 데이터가 생기는 순간 캐시가 채워진다.
export function shouldStore(objects) {
  return Array.isArray(objects) && objects.length > 0;
}

// 모드별 "저장할 가치가 있는 결과인가". rows 는 기존 규칙 그대로,
// raw 는 빈 맵/빈 배열도 조회 실패와 구분할 수 없으므로 저장하지 않는다.
export function shouldStoreValue(value, mode = 'rows') {
  if (mode !== 'raw') return shouldStore(value);
  if (value === null || value === undefined) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.keys(value).length > 0;
  return true;
}
