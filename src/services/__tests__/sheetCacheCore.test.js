import { describe, it, expect } from 'vitest';
import {
  encodeRows, decodeRows, readCacheNode, shouldStore,
  MISS_NO_NODE, MISS_NO_VERSION, MISS_SCHEMA, MISS_EXPIRED,
} from '../sheetCacheCore';

const COLS = ['date', 'player', 'games'];
const NOW = 1_757_000_000_000;
const TTL = 30 * 60 * 1000;

describe('encodeRows / decodeRows 왕복', () => {
  it('헤더 순서대로 정확히 복원한다', () => {
    const objs = [
      { date: '2026-09-01', player: '박성언', games: 3 },
      { date: '2026-09-02', player: '김원희', games: 5 },
    ];
    const node = encodeRows(COLS, objs);
    expect(node.headers).toEqual(COLS);
    expect(node.rows).toEqual([['2026-09-01', '박성언', 3], ['2026-09-02', '김원희', 5]]);
    expect(node.count).toBe(2);
    expect(decodeRows(node.headers, node.rows)).toEqual(objs);
  });

  it('컬럼에 없는 키는 버리고, 없는 컬럼은 빈 문자열로 채운다', () => {
    const node = encodeRows(COLS, [{ player: '박성언', 잡키: 'x' }]);
    expect(node.rows).toEqual([['', '박성언', '']]);
    expect(decodeRows(COLS, node.rows)).toEqual([{ date: '', player: '박성언', games: '' }]);
  });

  // RTDB 는 배열 원소의 null 을 드롭해 {"0":a,"2":c} 로 저장한다.
  // 되읽으면 인덱스가 밀려 컬럼 매핑이 통째로 어긋난다 — 그래서 '' 로 정규화한다.
  it('null/undefined 를 빈 문자열로 정규화한다', () => {
    const node = encodeRows(COLS, [{ date: null, player: undefined, games: 0 }]);
    expect(node.rows).toEqual([['', '', 0]]);
  });

  it('0 과 false 는 보존한다', () => {
    const node = encodeRows(['a', 'b'], [{ a: 0, b: false }]);
    expect(node.rows).toEqual([[0, false]]);
    expect(decodeRows(['a', 'b'], node.rows)).toEqual([{ a: 0, b: false }]);
  });

  it('빈 입력은 빈 rows', () => {
    expect(encodeRows(COLS, [])).toEqual({ headers: COLS, rows: [], count: 0 });
    expect(encodeRows(COLS, null)).toEqual({ headers: COLS, rows: [], count: 0 });
  });

  it('decodeRows 는 rows 가 없어도 빈 배열', () => {
    expect(decodeRows(COLS, undefined)).toEqual([]);
    expect(decodeRows(COLS, null)).toEqual([]);
  });
});

describe('readCacheNode', () => {
  const fresh = { version: NOW - 1000, headers: COLS, rows: [['2026-09-01', '박성언', 3]], count: 1 };

  it('신선한 노드는 히트', () => {
    const r = readCacheNode(fresh, COLS, TTL, NOW);
    expect(r.ok).toBe(true);
    expect(r.rows).toEqual([{ date: '2026-09-01', player: '박성언', games: 3 }]);
  });

  // RTDB 가 빈 배열을 저장하지 않아 rows 키가 사라진 노드.
  // rows 로 히트를 판정하면 "진짜 0행"을 영원히 미스로 오판한다.
  it('rows 가 없어도 version 이 있으면 히트(빈배열 함정)', () => {
    const r = readCacheNode({ version: NOW - 1000, headers: COLS, count: 0 }, COLS, TTL, NOW);
    expect(r.ok).toBe(true);
    expect(r.rows).toEqual([]);
  });

  it('노드가 없으면 미스', () => {
    expect(readCacheNode(null, COLS, TTL, NOW)).toEqual({ ok: false, reason: MISS_NO_NODE });
  });

  it('version 이 없으면 미스', () => {
    expect(readCacheNode({ headers: COLS, rows: [] }, COLS, TTL, NOW))
      .toEqual({ ok: false, reason: MISS_NO_VERSION });
  });

  it('헤더가 다르면 미스 — 컬럼 추가', () => {
    const node = { ...fresh, headers: ['date', 'player'] };
    expect(readCacheNode(node, COLS, TTL, NOW).reason).toBe(MISS_SCHEMA);
  });

  it('헤더가 다르면 미스 — 순서 변경', () => {
    const node = { ...fresh, headers: ['player', 'date', 'games'] };
    expect(readCacheNode(node, COLS, TTL, NOW).reason).toBe(MISS_SCHEMA);
  });

  it('TTL 을 넘으면 미스', () => {
    const node = { ...fresh, version: NOW - TTL - 1 };
    expect(readCacheNode(node, COLS, TTL, NOW).reason).toBe(MISS_EXPIRED);
  });

  it('TTL 경계(정확히 TTL)는 히트', () => {
    const node = { ...fresh, version: NOW - TTL };
    expect(readCacheNode(node, COLS, TTL, NOW).ok).toBe(true);
  });

  // 기기 시계가 뒤처지면 age 가 음수가 된다 — 만료로 오판하지 않는다.
  it('version 이 미래여도 히트(클럭 스큐)', () => {
    const node = { ...fresh, version: NOW + 3_600_000 };
    expect(readCacheNode(node, COLS, TTL, NOW).ok).toBe(true);
  });

  it('version 을 0 으로 강등한 노드는 미스', () => {
    expect(readCacheNode({ ...fresh, version: 0 }, COLS, TTL, NOW).reason).toBe(MISS_EXPIRED);
  });
});

describe('shouldStore', () => {
  // _safeRead 가 조회 실패를 [] 로 삼키므로 빈 결과는 저장하지 않는다.
  it('빈 배열은 저장하지 않는다', () => {
    expect(shouldStore([])).toBe(false);
    expect(shouldStore(null)).toBe(false);
    expect(shouldStore(undefined)).toBe(false);
  });
  it('1행 이상이면 저장한다', () => {
    expect(shouldStore([{ a: 1 }])).toBe(true);
  });
});
