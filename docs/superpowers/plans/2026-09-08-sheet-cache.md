# 구글시트 읽기 캐시(RTDB) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 앱 진입·탭 전환마다 반복되는 구글시트 전량 재조회를 RTDB 캐시로 대체해, 평상시 Apps Script 호출을 0회로 만든다.

**Architecture:** L1 메모리(5분) → L2 RTDB(배열형 노드) → L3 Apps Script/시트의 3층 캐시. 버전 마커를 RTDB에 두어 "바뀌었는지" 확인에 Apps Script 콜드스타트를 쓰지 않는다. 무효화는 쓰기 경로(마감·회원 upsert·자동 업로드 봇)가 시트를 재조회해 노드를 통째로 교체하는 방식이고, TTL과 수동 동기화 버튼이 백스톱이다.

**Tech Stack:** React 19 + Vite, Firebase Realtime Database (`firebase/database` v9 모듈러 API), Vitest + jsdom, Apps Script(읽기 원본, 무수정)

**Spec:** `docs/superpowers/specs/2026-09-08-sheet-cache-design.md`

## Global Constraints

- **`tennisSync.js` / `appSync.js` / `apps-script/Code.js` 는 수정하지 않는다.** L3는 그대로 재사용한다.
- 캐시 노드 경로: `cache/{safeTeam}/{sport}/{dataset}/{shard}`, `shard`는 항상 `'all'`.
- 데이터셋 이름은 `roster` | `playerGames` | `legacy` 셋으로 고정.
- 저장 형식은 배열형 `{ version, headers, rows, count }`. **히트 판정은 `rows`가 아니라 `version` 존재 여부로 한다** (RTDB는 빈 배열을 저장하지 않는다).
- **L3 결과가 비어 있으면 L2에 쓰지 않는다.** `tennisSync._safeRead`가 조회 실패를 `[]`로 삼키므로, 그 `[]`를 저장하면 빈 캐시가 TTL 동안 고착된다.
- **캐시 실패는 절대 화면·업로드를 죽이지 않는다.** 모든 실패는 L3 직행(= 캐시 도입 전과 동일한 동작)으로 폴백한다.
- `team`/`sport`는 `AuthUtil.getStored()`의 `{ team, mode }`에서 얻는다.
- L1 TTL = 5분. L2 TTL = Task 3~4에서 30분, Task 5에서 12시간으로 상향.
- 테스트 실행: `npx vitest run <path>`. 전체: `npm test`. 빌드: `npm run build`. 린트: `npm run lint`.
- 커밋 메시지는 한국어, 본문에 "왜"를 남긴다. 기존 커밋 스타일(`feat:` / `fix:` / `docs:` / `refactor:`)을 따른다.

---

## File Structure

| 파일 | 책임 |
|---|---|
| `src/services/rtdbPath.js` (신규) | RTDB 경로 문자열 생성. 순수 함수만. `safeTeam`의 단일 소스 |
| `src/services/sheetCacheCore.js` (신규) | 인코딩/디코딩/히트판정/저장여부. **Firebase 의존 없음** — 단위 테스트 대상 |
| `src/services/sheetCache.js` (신규) | L1/L2/L3 오케스트레이션, in-flight 중복 제거, 어댑터 레지스트리 |
| `src/utils/tennis/tennisSchema.js` (수정) | `TENNIS_ROSTER_CACHE_COLUMNS` 추가 |
| `src/services/firebaseSync.js` (수정) | `_safeTeam` 자체 구현 → `rtdbPath` 사용 |
| `scripts/tennisAutoUpload.mjs` (수정) | `safeTeam` 복사본 제거 + 업로드 후 캐시 재적재 |
| `src/components/tennis/{TennisDashboard,TennisLeague,TennisAnalyticsTab}.jsx` (수정) | 읽기를 `SheetCache`로 전환 |
| `src/TennisApp.jsx` (수정) | 로스터 읽기 전환 + 마감 성공 후 `refresh('playerGames')` |
| `src/components/tennis/TennisMembers.jsx` (수정) | upsert 성공 후 `refresh('roster')` |
| `src/components/common/SettingsScreen.jsx` (수정) | 수동 동기화 블록 |

---

## Task 1: `rtdbPath.js` — RTDB 경로 단일 소스

`_safeTeam`(팀명 → RTDB 안전 키)이 현재 `firebaseSync.js`와 `tennisAutoUpload.mjs`에 복사본 2개로 존재한다("한쪽을 고치면 다른 쪽도 고칠 것" 주석). 캐시가 세 번째 복사본이 되지 않게 먼저 추출한다.

**Files:**
- Create: `src/services/rtdbPath.js`
- Create: `src/services/__tests__/rtdbPath.test.js`
- Modify: `src/services/firebaseSync.js` (`_safeTeam` 본문)
- Modify: `scripts/tennisAutoUpload.mjs` (`safeTeam` 복사본 제거)

**Interfaces:**
- Produces:
  - `safeKey(value: string, fallback: string): string`
  - `safeTeam(team: string): string` — `safeKey(team, '기본팀')`
  - `cachePath(team: string, sport: string, dataset: string, shard?: string): string`

- [ ] **Step 1: 실패하는 테스트 작성**

`src/services/__tests__/rtdbPath.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { safeKey, safeTeam, cachePath } from '../rtdbPath';

describe('safeTeam', () => {
  it('RTDB 금지문자를 밑줄로 바꾼다', () => {
    expect(safeTeam('마스터.FC#1$/[x]')).toBe('마스터_FC_1____x_');
  });
  it('빈 값이면 기본팀', () => {
    expect(safeTeam('')).toBe('기본팀');
    expect(safeTeam(null)).toBe('기본팀');
    expect(safeTeam(undefined)).toBe('기본팀');
  });
  it('정상 팀명은 그대로', () => {
    expect(safeTeam('몽피스')).toBe('몽피스');
    expect(safeTeam('하버FC')).toBe('하버FC');
  });
});

describe('safeKey', () => {
  it('빈 값이면 지정한 폴백', () => {
    expect(safeKey('', '기타')).toBe('기타');
  });
});

describe('cachePath', () => {
  it('cache/{team}/{sport}/{dataset}/{shard} 형태', () => {
    expect(cachePath('몽피스', '테니스', 'playerGames'))
      .toBe('cache/몽피스/테니스/playerGames/all');
  });
  it('shard를 지정할 수 있다', () => {
    expect(cachePath('몽피스', '테니스', 'playerGames', '2026'))
      .toBe('cache/몽피스/테니스/playerGames/2026');
  });
  it('team/sport의 금지문자를 정리한다', () => {
    expect(cachePath('a.b', 'c#d', 'roster')).toBe('cache/a_b/c_d/roster/all');
  });
  it('sport가 비면 기타로 폴백', () => {
    expect(cachePath('몽피스', '', 'roster')).toBe('cache/몽피스/기타/roster/all');
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/services/__tests__/rtdbPath.test.js`
Expected: FAIL — `Failed to resolve import "../rtdbPath"`

- [ ] **Step 3: 구현**

`src/services/rtdbPath.js`:

```js
// RTDB 경로 문자열의 단일 소스. 순수 함수만 — firebase 를 import 하지 않는다
// (브라우저와 vite-node 러너 양쪽에서 쓰인다).
//
// 이전에는 이 로직이 firebaseSync.js 의 _safeTeam 과 scripts/tennisAutoUpload.mjs 에
// 복사본 2개로 존재했다. 캐시가 세 번째 복사본이 되지 않도록 여기로 모았다.

// RTDB 키에 쓸 수 없는 문자: . # $ / [ ]
const FORBIDDEN = /[.#$/[\]]/g;

export function safeKey(value, fallback) {
  return (value || fallback).replace(FORBIDDEN, '_');
}

export function safeTeam(team) {
  return safeKey(team, '기본팀');
}

// 시트 캐시 노드 경로. shard 는 현재 항상 'all' 이고, 노드가 커지면(설계 §9)
// 연도 샤딩으로 전환할 수 있게 축만 열어둔다.
export function cachePath(team, sport, dataset, shard = 'all') {
  return `cache/${safeTeam(team)}/${safeKey(sport, '기타')}/${dataset}/${shard}`;
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run src/services/__tests__/rtdbPath.test.js`
Expected: PASS (9 tests)

- [ ] **Step 5: 기존 두 복사본을 교체**

`src/services/firebaseSync.js` — import 추가:

```js
import { safeTeam } from './rtdbPath';
```

같은 파일의 `_safeTeam` 본문을 위임으로 바꾼다 (호출부 `this._safeTeam(team)`가 많으므로 메서드는 남긴다):

```js
  _safeTeam(team) {
    return safeTeam(team);
  },
```

`scripts/tennisAutoUpload.mjs` — 다음 블록을 삭제한다:

```js
// firebaseSync._safeTeam 의 복사본. 한쪽을 고치면 다른 쪽도 고칠 것.
function safeTeam(team) {
  return (team || '기본팀').replace(/[.#$/[\]]/g, '_');
}
```

대신 상단 import 블록에 추가한다:

```js
import { safeTeam } from '../src/services/rtdbPath.js';
```

- [ ] **Step 6: 회귀 확인**

Run: `npm test`
Expected: PASS — 기존 테스트 전부 통과 (특히 `firebaseSyncDiff.test.js`, `syncCoverage.test.js`)

Run: `npx vite-node scripts/tennisAutoUpload.mjs` 는 실행하지 않는다(운영 데이터 변경). 대신 import 해석만 확인:
Run: `node --input-type=module -e "import('./src/services/rtdbPath.js').then(m=>console.log(Object.keys(m)))"`
Expected: `[ 'safeKey', 'safeTeam', 'cachePath' ]`

- [ ] **Step 7: 커밋**

```bash
git add src/services/rtdbPath.js src/services/__tests__/rtdbPath.test.js src/services/firebaseSync.js scripts/tennisAutoUpload.mjs
git commit -m "refactor: RTDB 경로 생성을 rtdbPath.js 단일 소스로 추출

_safeTeam 이 firebaseSync 와 tennisAutoUpload 에 복사본 2개로 있었다.
시트 캐시가 세 번째 복사본을 만들지 않도록 먼저 통합한다.
cachePath 는 캐시 노드 경로의 단일 소스이며 shard 축을 미리 연다."
```

---

## Task 2: `sheetCacheCore.js` — 순수 인코딩/판정 로직

Firebase에 의존하지 않는 부분을 먼저 분리해 단위 테스트로 굳힌다. 캐시의 위험한 판단(빈배열 함정, 스키마 드리프트, null 정규화)이 전부 여기에 모인다.

**Files:**
- Create: `src/services/sheetCacheCore.js`
- Create: `src/services/__tests__/sheetCacheCore.test.js`

**Interfaces:**
- Consumes: 없음 (순수 모듈)
- Produces:
  - `encodeRows(columns: string[], objects: object[]): { headers: string[], rows: any[][], count: number }`
  - `decodeRows(headers: string[], rows: any[][] | undefined): object[]`
  - `readCacheNode(node: object|null, columns: string[], ttlMs: number, now: number): { ok: true, rows: object[] } | { ok: false, reason: string }`
  - `shouldStore(objects: any): boolean`
  - 상수 `MISS_NO_NODE`, `MISS_NO_VERSION`, `MISS_SCHEMA`, `MISS_EXPIRED`

- [ ] **Step 1: 실패하는 테스트 작성**

`src/services/__tests__/sheetCacheCore.test.js`:

```js
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
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/services/__tests__/sheetCacheCore.test.js`
Expected: FAIL — `Failed to resolve import "../sheetCacheCore"`

- [ ] **Step 3: 구현**

`src/services/sheetCacheCore.js`:

```js
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
// ★ 히트 여부는 rows 가 아니라 version 으로 판정한다 — RTDB 는 빈 배열을 저장하지
//   않으므로, rows 키가 사라진 노드와 "진짜 0행"을 rows 로는 구분할 수 없다.
export function readCacheNode(node, columns, ttlMs, now) {
  if (!node || typeof node !== 'object') return { ok: false, reason: MISS_NO_NODE };
  if (typeof node.version !== 'number') return { ok: false, reason: MISS_NO_VERSION };
  const h = node.headers;
  if (!Array.isArray(h) || h.length !== columns.length || h.some((c, i) => c !== columns[i])) {
    return { ok: false, reason: MISS_SCHEMA };
  }
  // now - version 이 음수(기기 시계가 뒤처짐)면 만료가 아니다.
  if (now - node.version > ttlMs) return { ok: false, reason: MISS_EXPIRED };
  return { ok: true, rows: decodeRows(h, node.rows) };
}

// L3 가 빈 배열을 주면 캐시에 쓰지 않는다.
// tennisSync._safeRead 는 조회 실패도 [] 로 삼키므로, 그 [] 를 저장하면 빈 캐시가
// TTL 동안 고착돼 앱이 데이터를 잃은 것처럼 보인다. "진짜 0행"과 "조회 실패"를
// 구분할 방법이 없으므로 보수적으로 간다 — 첫 데이터가 생기는 순간 캐시가 채워진다.
export function shouldStore(objects) {
  return Array.isArray(objects) && objects.length > 0;
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run src/services/__tests__/sheetCacheCore.test.js`
Expected: PASS (18 tests)

- [ ] **Step 5: 커밋**

```bash
git add src/services/sheetCacheCore.js src/services/__tests__/sheetCacheCore.test.js
git commit -m "feat: 시트 캐시 순수 로직(sheetCacheCore) 추가

배열형 인코딩으로 객체형 대비 41~55% 크기. headers 를 노드에 함께 저장해
컬럼이 바뀌면 자동으로 캐시 미스가 되게 한다(과거 fouls 중간삽입 계열 오독 차단).
히트 판정은 rows 가 아니라 version 으로 — RTDB 가 빈 배열을 저장하지 않아
rows 로는 '진짜 0행'과 '노드 없음'을 구분할 수 없다.
빈 결과를 저장하지 않는 것은 _safeRead 가 조회 실패를 [] 로 삼키기 때문이다."
```

---

## Task 3: `sheetCache.js` — 3층 오케스트레이션

**Files:**
- Create: `src/services/sheetCache.js`
- Create: `src/services/__tests__/sheetCache.test.js`
- Modify: `src/utils/tennis/tennisSchema.js` (컬럼 상수 추가)

**Interfaces:**
- Consumes: Task 1의 `cachePath`, Task 2의 `encodeRows` / `readCacheNode` / `shouldStore`
- Produces:
  - `SheetCache.get(dataset: string): Promise<object[]>`
  - `SheetCache.refresh(dataset: string): Promise<object[]>`
  - `SheetCache.refreshAll(): Promise<{ dataset: string, ok: boolean, count: number }[]>`
  - `SheetCache.status(): Promise<{ dataset: string, version: number|null, count: number|null }[]>`
  - `SheetCache.datasetsOf(sport: string): string[]`
  - `SheetCache._resetForTest(): void`
  - export 상수 `DISABLED`, `L2_TTL_MS`

- [ ] **Step 1: 로스터 컬럼 상수 추가**

`src/utils/tennis/tennisSchema.js` 의 `TENNIS_LEGACY_COLUMNS` 정의 바로 뒤에 추가한다:

```js
// ★ 시트 헤더(TENNIS_ROSTER_HEADERS)가 아니라 Apps Script _getTennisRoster 가
// 내려주는 객체의 키다. 서버가 생년월일·가입일 등을 빼고 5개만 내린다.
// 캐시 배열형 인코딩의 컬럼 순서로 쓰인다 — 서버 반환 shape 이 바뀌면 함께 고칠 것.
export const TENNIS_ROSTER_CACHE_COLUMNS = [
  'name', 'nickname', 'grade', 'status', 'seasonStartRank',
];
```

- [ ] **Step 2: 실패하는 테스트 작성**

`src/services/__tests__/sheetCache.test.js`:

```js
import { describe, it, expect, vi, beforeEach } from 'vitest';

// firebase/database 를 인메모리 저장소로 대체한다.
const store = new Map();
let getCalls = 0;
let failNextGet = false;
let failNextSet = false;

vi.mock('../../config/firebase', () => ({ firebaseDb: {} }));
vi.mock('firebase/database', () => ({
  ref: (_db, path) => ({ path }),
  get: async (r) => {
    getCalls++;
    if (failNextGet) { failNextGet = false; throw new Error('RTDB down'); }
    return { val: () => (store.has(r.path) ? store.get(r.path) : null) };
  },
  set: async (r, value) => {
    if (failNextSet) { failNextSet = false; throw new Error('write denied'); }
    // serverTimestamp 센티널을 실제 시각으로 치환(RTDB 서버 동작 흉내)
    const v = { ...value };
    if (v.version && v.version.__sv) v.version = Date.now();
    store.set(r.path, v);
  },
  remove: async (r) => { store.delete(r.path); },
  serverTimestamp: () => ({ __sv: true }),
}));

vi.mock('../authUtil', () => ({
  default: { getStored: () => ({ team: '몽피스', mode: '테니스' }) },
}));

const ROSTER = [{ name: '박성언', nickname: '', grade: '금배', status: '활동', seasonStartRank: 1 }];
const GAMES = [{ team: '몽피스', sport: '테니스', date: '2026-09-01', player: '박성언' }];
let fetchCounts;
vi.mock('../tennisSync', () => ({
  default: {
    getRoster: () => { fetchCounts.roster++; return Promise.resolve(ROSTER); },
    getPlayerGames: () => { fetchCounts.playerGames++; return Promise.resolve(GAMES); },
    getLegacyRecords: () => { fetchCounts.legacy++; return Promise.resolve([]); },
  },
}));

import SheetCache from '../sheetCache';

beforeEach(() => {
  store.clear();
  getCalls = 0;
  failNextGet = false;
  failNextSet = false;
  fetchCounts = { roster: 0, playerGames: 0, legacy: 0 };
  SheetCache._resetForTest();
});

describe('get — 3층 캐시', () => {
  it('첫 호출은 L3 에서 읽고 L2 에 저장한다', async () => {
    const rows = await SheetCache.get('roster');
    expect(rows).toEqual(ROSTER);
    expect(fetchCounts.roster).toBe(1);
    expect(store.get('cache/몽피스/테니스/roster/all')).toMatchObject({
      headers: ['name', 'nickname', 'grade', 'status', 'seasonStartRank'],
      count: 1,
    });
  });

  it('두 번째 호출은 L1 히트 — 네트워크를 치지 않는다', async () => {
    await SheetCache.get('roster');
    const before = getCalls;
    const rows = await SheetCache.get('roster');
    expect(rows).toEqual(ROSTER);
    expect(fetchCounts.roster).toBe(1);
    expect(getCalls).toBe(before);
  });

  it('L1 이 비어도 L2 가 있으면 L3 를 치지 않는다', async () => {
    await SheetCache.get('roster');
    SheetCache._resetForTest();          // L1 만 비움(store 는 유지)
    const rows = await SheetCache.get('roster');
    expect(rows).toEqual(ROSTER);
    expect(fetchCounts.roster).toBe(1);  // L3 재호출 없음
  });

  // TennisDashboard 가 Promise.all 로 동시에 쏘는 상황.
  it('동시 호출을 하나로 합친다(in-flight 중복 제거)', async () => {
    const [a, b, c] = await Promise.all([
      SheetCache.get('playerGames'),
      SheetCache.get('playerGames'),
      SheetCache.get('playerGames'),
    ]);
    expect(a).toEqual(GAMES);
    expect(b).toEqual(GAMES);
    expect(c).toEqual(GAMES);
    expect(fetchCounts.playerGames).toBe(1);
    expect(getCalls).toBe(1);
  });

  it('빈 결과는 L2 에 쓰지 않는다', async () => {
    const rows = await SheetCache.get('legacy');
    expect(rows).toEqual([]);
    expect(store.has('cache/몽피스/테니스/legacy/all')).toBe(false);
  });

  it('L2 읽기가 실패하면 조용히 L3 로 폴백한다', async () => {
    failNextGet = true;
    const rows = await SheetCache.get('roster');
    expect(rows).toEqual(ROSTER);
    expect(fetchCounts.roster).toBe(1);
  });

  it('L2 쓰기가 실패해도 데이터는 반환한다', async () => {
    failNextSet = true;
    const rows = await SheetCache.get('roster');
    expect(rows).toEqual(ROSTER);
  });

  it('스키마가 바뀐 노드는 미스 → L3 재조회', async () => {
    store.set('cache/몽피스/테니스/roster/all', {
      version: Date.now(), headers: ['name'], rows: [['옛사람']], count: 1,
    });
    const rows = await SheetCache.get('roster');
    expect(rows).toEqual(ROSTER);
    expect(fetchCounts.roster).toBe(1);
  });

  it('모르는 데이터셋은 빈 배열', async () => {
    expect(await SheetCache.get('없는것')).toEqual([]);
  });
});

describe('refresh', () => {
  it('L1 을 비우고 L3 에서 다시 읽어 L2 를 교체한다', async () => {
    await SheetCache.get('playerGames');
    expect(fetchCounts.playerGames).toBe(1);
    await SheetCache.refresh('playerGames');
    expect(fetchCounts.playerGames).toBe(2);
    expect(store.get('cache/몽피스/테니스/playerGames/all').count).toBe(1);
  });

  it('재적재가 실패하면 노드를 삭제해 강등한다', async () => {
    await SheetCache.get('playerGames');
    expect(store.has('cache/몽피스/테니스/playerGames/all')).toBe(true);
    failNextSet = true;
    await SheetCache.refresh('playerGames');
    expect(store.has('cache/몽피스/테니스/playerGames/all')).toBe(false);
  });
});

describe('datasetsOf / status', () => {
  it('테니스 데이터셋 3종', () => {
    expect(SheetCache.datasetsOf('테니스')).toEqual(['roster', 'playerGames', 'legacy']);
  });
  it('모르는 종목은 빈 배열', () => {
    expect(SheetCache.datasetsOf('야구')).toEqual([]);
  });
  it('status 는 캐시 없는 데이터셋을 null 로 보고한다', async () => {
    const s = await SheetCache.status();
    expect(s).toEqual([
      { dataset: 'roster', version: null, count: null },
      { dataset: 'playerGames', version: null, count: null },
      { dataset: 'legacy', version: null, count: null },
    ]);
  });
  it('status 는 저장된 노드의 version/count 를 보고한다', async () => {
    await SheetCache.get('playerGames');
    const s = await SheetCache.status();
    const pg = s.find(x => x.dataset === 'playerGames');
    expect(pg.count).toBe(1);
    expect(typeof pg.version).toBe('number');
  });
});
```

- [ ] **Step 3: 실패 확인**

Run: `npx vitest run src/services/__tests__/sheetCache.test.js`
Expected: FAIL — `Failed to resolve import "../sheetCache"`

- [ ] **Step 4: 구현**

`src/services/sheetCache.js`:

```js
// 구글시트 읽기 캐시 — L1 메모리 → L2 RTDB → L3 Apps Script/시트.
//
// 목적: 앱 진입·탭 전환마다 시트를 전량 재조회하던 것을 없앤다.
// 핵심 판단: "바뀌었는지"를 Apps Script 에 물으면 확인 자체가 콜드스타트 왕복
// (2~10초)이다. 그래서 버전 마커를 RTDB 에 두고 평상시 Apps Script 를 치지 않는다.
//
// 불변식: 캐시의 어떤 실패도 화면을 죽이지 않는다. 모든 실패 경로는 L3 직행
// (= 캐시 도입 전과 동일한 동작)으로 폴백한다.
//
// 설계: docs/superpowers/specs/2026-09-08-sheet-cache-design.md

import { ref, get, set, remove, serverTimestamp } from 'firebase/database';
import { firebaseDb } from '../config/firebase';
import AuthUtil from './authUtil';
import TennisSync from './tennisSync';
import { cachePath } from './rtdbPath';
import { encodeRows, readCacheNode, shouldStore } from './sheetCacheCore';
import {
  TENNIS_ROSTER_CACHE_COLUMNS,
  TENNIS_PLAYER_GAME_COLUMNS,
  TENNIS_LEGACY_COLUMNS,
} from '../utils/tennis/tennisSchema';

// 롤백 스위치 — true 면 모든 호출이 L3 직행. 캐시 도입 전과 동일한 동작이 된다.
export const DISABLED = false;

const L1_TTL_MS = 5 * 60 * 1000;          // appSync 대회 캐시와 같은 관례.
                                          // 무제한이면 오래 열어둔 탭이 갱신을 영영 못 본다.
export const L2_TTL_MS = 30 * 60 * 1000;  // 쓰기 경로 무효화가 붙기 전(2단계)이라 짧게 둔다.

// 종목 → 데이터셋 → { columns, fetch }.
// 축구·풋살 확장은 여기에 항목을 추가하는 것으로 끝난다.
const ADAPTERS = {
  '테니스': {
    roster:      { columns: TENNIS_ROSTER_CACHE_COLUMNS, fetch: () => TennisSync.getRoster() },
    playerGames: { columns: TENNIS_PLAYER_GAME_COLUMNS,  fetch: () => TennisSync.getPlayerGames() },
    legacy:      { columns: TENNIS_LEGACY_COLUMNS,       fetch: () => TennisSync.getLegacyRecords() },
  },
};

const _l1 = new Map();       // path → { rows, ts }
const _inflight = new Map(); // path → Promise

function _ctx() {
  const a = AuthUtil.getStored();
  return { team: a?.team || '', sport: a?.mode || '' };
}

function _adapter(sport, dataset) {
  return ADAPTERS[sport]?.[dataset] || null;
}

// L3 조회 후 L2 저장. store 실패를 호출부가 구분할 수 있도록 throw 한다.
async function _fetchAndStore(adapter, path) {
  const rows = (await adapter.fetch()) || [];
  if (shouldStore(rows)) {
    await set(ref(firebaseDb, path), {
      ...encodeRows(adapter.columns, rows),
      version: serverTimestamp(),
    });
  }
  return rows;
}

const SheetCache = {
  datasetsOf(sport) {
    return Object.keys(ADAPTERS[sport] || {});
  },

  async get(dataset) {
    const { team, sport } = _ctx();
    const adapter = _adapter(sport, dataset);
    if (!adapter) return [];
    if (DISABLED) return (await adapter.fetch()) || [];

    const path = cachePath(team, sport, dataset);

    const hit = _l1.get(path);
    if (hit && Date.now() - hit.ts < L1_TTL_MS) return hit.rows;

    // 같은 노드를 동시에 요청하면(대시보드의 Promise.all) 하나로 합친다.
    const pending = _inflight.get(path);
    if (pending) return pending;

    const p = (async () => {
      let rows;
      try {
        const snap = await get(ref(firebaseDb, path));
        const res = readCacheNode(snap.val(), adapter.columns, L2_TTL_MS, Date.now());
        if (res.ok) {
          rows = res.rows;
        } else {
          rows = (await adapter.fetch()) || [];
          if (shouldStore(rows)) {
            try {
              await set(ref(firebaseDb, path), {
                ...encodeRows(adapter.columns, rows),
                version: serverTimestamp(),
              });
            } catch (e) { console.warn(`[sheetCache] ${dataset} L2 저장 실패:`, e.message); }
          }
        }
      } catch (e) {
        console.warn(`[sheetCache] ${dataset} L2 읽기 실패, 시트 폴백:`, e.message);
        rows = (await adapter.fetch()) || [];
      }
      _l1.set(path, { rows, ts: Date.now() });
      return rows;
    })();

    _inflight.set(path, p);
    try { return await p; } finally { _inflight.delete(path); }
  },

  // 쓰기 직후 재적재. 그냥 지우면 다음에 들어온 사람이 콜드스타트를 뒤집어쓴다.
  // 재적재가 실패하면 노드를 삭제해 다음 읽기가 시트로 폴백하게 강등한다 —
  // 낡은 캐시를 남기지 않는다.
  async refresh(dataset) {
    const { team, sport } = _ctx();
    const adapter = _adapter(sport, dataset);
    if (!adapter) return [];
    const path = cachePath(team, sport, dataset);
    _l1.delete(path);
    try {
      const rows = await _fetchAndStore(adapter, path);
      _l1.set(path, { rows, ts: Date.now() });
      return rows;
    } catch (e) {
      console.warn(`[sheetCache] ${dataset} 재적재 실패, 캐시 강등:`, e.message);
      try {
        await remove(ref(firebaseDb, path));
      } catch {
        // 삭제까지 실패하면 version 을 0 으로 덮어 즉시 만료시킨다(2단 방어).
        try { await set(ref(firebaseDb, `${path}/version`), 0); } catch { /* best-effort */ }
      }
      return [];
    }
  },

  async refreshAll() {
    const { sport } = _ctx();
    const out = [];
    for (const dataset of this.datasetsOf(sport)) {
      const rows = await this.refresh(dataset);
      out.push({ dataset, ok: true, count: rows.length });
    }
    return out;
  },

  // 설정 화면용. rows 를 내려받지 않도록 version/count 만 얕게 읽는다.
  async status() {
    const { team, sport } = _ctx();
    const out = [];
    for (const dataset of this.datasetsOf(sport)) {
      const path = cachePath(team, sport, dataset);
      try {
        const [v, c] = await Promise.all([
          get(ref(firebaseDb, `${path}/version`)),
          get(ref(firebaseDb, `${path}/count`)),
        ]);
        out.push({ dataset, version: v.val() ?? null, count: c.val() ?? null });
      } catch {
        out.push({ dataset, version: null, count: null });
      }
    }
    return out;
  },

  // 테스트 전용 — L1/in-flight 만 비운다.
  _resetForTest() {
    _l1.clear();
    _inflight.clear();
  },
};

export default SheetCache;
```

- [ ] **Step 5: 통과 확인**

Run: `npx vitest run src/services/__tests__/sheetCache.test.js`
Expected: PASS (16 tests)

- [ ] **Step 6: 어댑터 등록 커버리지 테스트 추가**

`src/services/__tests__/sheetCache.test.js` 끝에 추가한다:

```js
describe('어댑터 등록 커버리지', () => {
  // 새 데이터셋을 추가하면서 columns 나 fetch 를 빠뜨리는 것을 막는다.
  it('모든 데이터셋이 columns 배열과 fetch 함수를 갖는다', async () => {
    for (const dataset of SheetCache.datasetsOf('테니스')) {
      const rows = await SheetCache.get(dataset);
      expect(Array.isArray(rows)).toBe(true);
    }
    // 저장된 노드의 headers 가 비어 있지 않은지 확인(columns 누락 방어)
    const node = store.get('cache/몽피스/테니스/playerGames/all');
    expect(node.headers.length).toBeGreaterThan(0);
    expect(node.headers).toContain('player');
  });
});
```

- [ ] **Step 7: 통과 확인 + 전체 회귀**

Run: `npx vitest run src/services/__tests__/sheetCache.test.js`
Expected: PASS (17 tests)

Run: `npm test && npm run lint`
Expected: 전부 PASS

- [ ] **Step 8: 커밋**

```bash
git add src/services/sheetCache.js src/services/__tests__/sheetCache.test.js src/utils/tennis/tennisSchema.js
git commit -m "feat: 시트 캐시 3층 오케스트레이션(sheetCache) 추가

L1 메모리(5분) → L2 RTDB → L3 Apps Script. 아직 아무도 호출하지 않으므로
동작 변화는 없다.

- in-flight 중복 제거: 대시보드가 Promise.all 로 쏘는 3개를 1회로 합친다
- 모든 실패는 L3 직행으로 폴백 — 캐시가 화면을 죽이지 않는다
- refresh 는 재적재하고, 실패하면 노드 삭제(→ version 0)로 강등한다
- L2 TTL 30분: 쓰기 경로 무효화가 붙기 전이라 짧게 둔다
- TENNIS_ROSTER_CACHE_COLUMNS 는 시트 헤더가 아니라 _getTennisRoster 반환 키다"
```

---

## Task 4: 읽기 경로 전환

여기서 체감 개선이 나온다. 세 탭을 한 번씩 눌렀을 때 Apps Script 왕복이 9회 → 0회(캐시 히트 시)가 된다.

**Files:**
- Modify: `src/components/tennis/TennisDashboard.jsx:92-98`
- Modify: `src/components/tennis/TennisLeague.jsx:22-30`
- Modify: `src/components/tennis/TennisAnalyticsTab.jsx:711-719`
- Modify: `src/TennisApp.jsx:41`
- Modify: `src/components/tennis/__tests__/tennisDashboard.render.test.jsx:20-27`
- Modify: `src/components/tennis/__tests__/tennisAnalyticsTab.render.test.jsx`
- Modify: `src/components/tennis/__tests__/tennisDashboard.smoke.test.jsx`
- Modify: `src/components/tennis/__tests__/tennisAnalyticsTab.smoke.test.jsx`
- Modify: `src/components/tennis/__tests__/tennisLeague.smoke.test.jsx`

**Interfaces:**
- Consumes: Task 3의 `SheetCache.get(dataset)`
- Produces: 없음 (호출부 전환만)

- [ ] **Step 1: 렌더 테스트의 모킹 대상을 먼저 바꿔 실패시킨다**

`src/components/tennis/__tests__/tennisDashboard.render.test.jsx` 의 `vi.mock` 블록을 교체한다:

```js
vi.mock('../../../services/sheetCache', () => ({
  default: {
    get: (dataset) => Promise.resolve(
      dataset === 'playerGames' ? GAMES : dataset === 'roster' ? ROSTER : []
    ),
  },
}));
```

(기존 `vi.mock('../../../services/tennisSync', ...)` 블록은 삭제한다)

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/components/tennis/__tests__/tennisDashboard.render.test.jsx`
Expected: FAIL — 컴포넌트가 아직 `tennisSync`(모킹되지 않은 실물)를 호출해 데이터가 비고, '마지막 경기' 카드 단언이 깨진다

- [ ] **Step 3: `TennisDashboard` 전환**

import 교체:

```js
import SheetCache from '../../services/sheetCache';
```

(기존 `import TennisSync from '../../services/tennisSync';` 삭제 — 이 파일에 다른 `TennisSync` 사용처가 없는지 `grep -n "TennisSync" src/components/tennis/TennisDashboard.jsx` 로 확인할 것)

`useEffect` 교체:

```js
  useEffect(() => {
    let alive = true;
    Promise.all([
      SheetCache.get('playerGames').then(setRows),
      SheetCache.get('roster').then(setRoster),
      SheetCache.get('legacy').then(setLegacyRows),
    ]).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run src/components/tennis/__tests__/tennisDashboard.render.test.jsx`
Expected: PASS

- [ ] **Step 5: `TennisLeague` 전환**

import 교체 후 `useEffect`:

```js
  useEffect(() => {
    let alive = true;
    Promise.all([
      SheetCache.get('playerGames').then(setRows),
      SheetCache.get('legacy').then(setLegacyRows),
      SheetCache.get('roster').then(setRoster),
    ]).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);
```

- [ ] **Step 6: `TennisAnalyticsTab` 전환**

import 교체 후 `useEffect`:

```js
  useEffect(() => {
    let alive = true;
    Promise.all([
      SheetCache.get('playerGames').then(setRows),
      SheetCache.get('legacy').then(setLegacyRows),
      SheetCache.get('roster').then(setRoster),
    ]).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);
```

- [ ] **Step 7: `TennisApp` 로스터 전환**

`src/TennisApp.jsx:41` 을 교체한다:

```js
  useEffect(() => { SheetCache.get('roster').then(setRoster); }, []);
```

import 을 추가한다 (`TennisSync` 는 이 파일의 쓰기 경로에서 계속 쓰이므로 **삭제하지 않는다**):

```js
import SheetCache from './services/sheetCache';
```

- [ ] **Step 8: 나머지 테스트의 모킹 대상 교체**

`tennisAnalyticsTab.render.test.jsx` / `tennisDashboard.smoke.test.jsx` /
`tennisAnalyticsTab.smoke.test.jsx` / `tennisLeague.smoke.test.jsx` 의
`vi.mock('.../tennisSync', ...)` 를 각각 다음 형태로 바꾼다 (각 파일의 픽스처 변수명에 맞춘다):

```js
vi.mock('../../../services/sheetCache', () => ({
  default: {
    get: (dataset) => Promise.resolve(
      dataset === 'playerGames' ? GAMES : dataset === 'roster' ? ROSTER : []
    ),
  },
}));
```

스모크 테스트처럼 모든 데이터셋이 빈 배열이면:

```js
vi.mock('../../../services/sheetCache', () => ({
  default: { get: () => Promise.resolve([]) },
}));
```

- [ ] **Step 9: L2 실패 폴백 렌더 테스트 추가**

`src/components/tennis/__tests__/tennisDashboard.render.test.jsx` 하단에 추가한다:

```js
describe('SheetCache 가 빈 배열을 줘도 렌더가 죽지 않는다', () => {
  it('로딩 게이트 통과 후 크래시 없이 렌더된다', async () => {
    // L2 읽기 실패 → L3 도 실패 → [] 인 최악의 경우.
    // SheetCache 내부가 이미 폴백하므로 컴포넌트는 [] 만 본다.
    vi.resetModules();
    vi.doMock('../../../services/sheetCache', () => ({
      default: { get: () => Promise.resolve([]) },
    }));
    const { default: Fresh } = await import('../TennisDashboard');
    const c = document.createElement('div');
    document.body.appendChild(c);
    let r;
    await act(async () => {
      r = createRoot(c);
      r.render(createElement(ThemeProvider, null, createElement(Fresh, { C: undefined })));
    });
    expect(c.textContent).not.toContain('데이터 로딩중');
    await act(async () => r.unmount());
    c.remove();
  });
});
```

- [ ] **Step 10: 전체 회귀**

Run: `npm test`
Expected: PASS — 테니스 렌더/스모크 테스트 전부 통과

Run: `npm run lint && npm run build`
Expected: 에러 없음

Run: `grep -rn "TennisSync" src/components/tennis/TennisDashboard.jsx src/components/tennis/TennisLeague.jsx src/components/tennis/TennisAnalyticsTab.jsx`
Expected: 출력 없음 (세 파일에서 완전히 제거됨)

- [ ] **Step 11: 브라우저 스모크**

`npm run dev` 로 띄우고 몽피스 테니스로 로그인해 대시보드 → 리그 → 분석 순으로 이동한다.
DevTools Network 탭에서 확인할 것:
- 첫 진입: Apps Script(`script.google.com`) 요청 3건 + RTDB 요청
- 리그·분석 탭 전환: **Apps Script 요청 0건** (L1 히트)
- 새로고침 후 재진입: **Apps Script 요청 0건**, RTDB 만 (L2 히트)

Console 에 `[sheetCache]` 경고가 없어야 한다.

> jsx 변경은 build/vitest 가 렌더 크래시를 못 잡는 경우가 있어(선언 순서/TDZ) 이
> 브라우저 확인을 생략하지 말 것 — memory: feedback_component_render_verification_gap

- [ ] **Step 12: 커밋**

```bash
git add src/components/tennis src/TennisApp.jsx
git commit -m "feat: 테니스 읽기 경로를 SheetCache 로 전환

대시보드/리그/분석 세 탭이 각각 getPlayerGames+getRoster+getLegacyRecords 를
독립 호출해 탭 한 바퀴에 Apps Script 왕복 9회, 매번 시트 전체 스캔이었다.
캐시 히트 시 0회가 된다.

쓰기 경로 무효화는 아직 없으므로 L2 TTL 30분으로 커버한다(다음 커밋에서 상향).
중복 입력 경고(TennisAttendeeSelector)는 정확성 가드라 캐시를 우회한 채 둔다."
```

---

## Task 5: 쓰기 경로 무효화

**Files:**
- Modify: `src/TennisApp.jsx` (`handleSubmitRecords`)
- Modify: `src/components/tennis/TennisMembers.jsx:141-147` (`runWrite`)
- Modify: `src/services/sheetCache.js` (`L2_TTL_MS`)
- Modify: `src/services/__tests__/sheetCache.test.js`
- Create: `src/components/tennis/__tests__/tennisApp.refresh.test.jsx`

**Interfaces:**
- Consumes: Task 3의 `SheetCache.refresh(dataset)`
- Produces: 없음

- [ ] **Step 1: TTL 상향 + 테스트 갱신**

`src/services/sheetCache.js`:

```js
// 모든 쓰기 경로(마감·회원 upsert·자동 업로드 봇)가 재적재하므로 순수 백스톱이다.
export const L2_TTL_MS = 12 * 60 * 60 * 1000;
```

`src/services/__tests__/sheetCache.test.js` 상단에 단언을 추가한다:

```js
import SheetCache, { L2_TTL_MS } from '../sheetCache';

describe('L2 TTL', () => {
  it('12시간 백스톱', () => {
    expect(L2_TTL_MS).toBe(12 * 60 * 60 * 1000);
  });
});
```

Run: `npx vitest run src/services/__tests__/sheetCache.test.js`
Expected: PASS

- [ ] **Step 2: 마감 후 재적재 테스트를 먼저 작성**

`src/components/tennis/__tests__/tennisApp.refresh.test.jsx`:

```js
// 마감 전송 성공 후 playerGames 캐시가 재적재되는지 검증한다.
// 봇(매일 10시)과 함께 이 경로가 캐시 신선도의 주 담당이다.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const refreshed = [];
vi.mock('../../../services/sheetCache', () => ({
  default: {
    get: () => Promise.resolve([]),
    refresh: (d) => { refreshed.push(d); return Promise.resolve([]); },
  },
}));

const writes = [];
vi.mock('../../../services/tennisSync', () => ({
  default: {
    writeMatches: (r) => { writes.push(['matches', r]); return Promise.resolve({ success: true }); },
    writePlayerGames: (r) => { writes.push(['pg', r]); return Promise.resolve({ success: true }); },
  },
}));

import { finalizeTennisRecords } from '../../../utils/tennis/finalizeTennisRecords';

beforeEach(() => { refreshed.length = 0; writes.length = 0; });

describe('finalizeTennisRecords', () => {
  it('전송 성공 후 playerGames 캐시를 재적재한다', async () => {
    const r = await finalizeTennisRecords({ matchRows: [{ a: 1 }], pgRows: [{ b: 2 }] });
    expect(r.ok).toBe(true);
    expect(writes.map(w => w[0])).toEqual(['matches', 'pg']);
    expect(refreshed).toEqual(['playerGames']);
  });

  it('전송이 실패하면 재적재하지 않는다', async () => {
    const { default: TennisSync } = await import('../../../services/tennisSync');
    TennisSync.writePlayerGames = () => Promise.reject(new Error('시트 장애'));
    const r = await finalizeTennisRecords({ matchRows: [{ a: 1 }], pgRows: [{ b: 2 }] });
    expect(r.ok).toBe(false);
    expect(r.failed).toHaveLength(1);
    expect(refreshed).toEqual([]);
  });

  it('재적재가 실패해도 전송 성공을 되돌리지 않는다', async () => {
    const { default: SheetCache } = await import('../../../services/sheetCache');
    SheetCache.refresh = () => Promise.reject(new Error('RTDB down'));
    const r = await finalizeTennisRecords({ matchRows: [{ a: 1 }], pgRows: [{ b: 2 }] });
    expect(r.ok).toBe(true);
  });
});
```

- [ ] **Step 3: 실패 확인**

Run: `npx vitest run src/components/tennis/__tests__/tennisApp.refresh.test.jsx`
Expected: FAIL — `Failed to resolve import "../../../utils/tennis/finalizeTennisRecords"`

- [ ] **Step 4: 전송+재적재 로직을 순수 함수로 추출**

`handleSubmitRecords` 안에 두면 테스트가 불가능하므로 분리한다.

`src/utils/tennis/finalizeTennisRecords.js` (신규):

```js
// 마감 전송 + 캐시 재적재. TennisApp.handleSubmitRecords 에서 UI(alert/busy)를
// 뺀 부분 — 테스트 가능하게 분리했다.
//
// 규칙:
//  - 전송이 하나라도 실패하면 재적재하지 않고 미확정을 유지한다(기존 규칙).
//  - 재적재 실패는 전송 성공을 되돌리지 않는다. 캐시는 파생 데이터이고,
//    SheetCache.refresh 가 실패 시 노드를 삭제해 다음 읽기를 시트로 강등한다.
import TennisSync from '../../services/tennisSync';
import SheetCache from '../../services/sheetCache';

export async function finalizeTennisRecords({ matchRows, pgRows }) {
  const results = await Promise.allSettled([
    TennisSync.writeMatches(matchRows),
    TennisSync.writePlayerGames(pgRows),
  ]);
  const failed = results.filter(r => r.status === 'rejected');
  if (failed.length > 0) {
    return { ok: false, failed: failed.map(f => f.reason?.message || '알 수 없는 오류') };
  }
  try {
    await SheetCache.refresh('playerGames');
  } catch (e) {
    console.warn('[sheetCache] 마감 후 재적재 실패:', e?.message);
  }
  return { ok: true, failed: [] };
}
```

- [ ] **Step 5: 통과 확인**

Run: `npx vitest run src/components/tennis/__tests__/tennisApp.refresh.test.jsx`
Expected: PASS (3 tests)

- [ ] **Step 6: `TennisApp.handleSubmitRecords` 가 이 함수를 쓰도록 교체**

import 추가:

```js
import { finalizeTennisRecords } from './utils/tennis/finalizeTennisRecords';
```

`handleSubmitRecords` 안의 `const results = await Promise.allSettled([...])` 부터
`if (failed.length > 0) { ... return; }` 까지를 다음으로 교체한다:

```js
      const { ok, failed } = await finalizeTennisRecords({ matchRows, pgRows });
      if (!ok) {
        alert(`전송 실패 ${failed.length}건 — 미확정 상태를 유지합니다.\n${failed.join('\n')}`);
        return;
      }
```

(`dispatch({ type: 'FINALIZE' })` 와 성공 alert 은 그대로 둔다)

- [ ] **Step 7: 회원 upsert 후 로스터 재적재**

`src/components/tennis/TennisMembers.jsx` — import 추가:

```js
import SheetCache from '../../services/sheetCache';
```

`runWrite` (파일 141~147행) 의 `.then` 을 교체한다. 기존:

```js
  const runWrite = (payload, okMsg) => {
    setSaving(true); setStatus(null);
    return TennisSync.writeRosterMember(payload)
      .then(() => { setStatus({ type: 'ok', msg: okMsg }); setEditing(null); return reload(); })
      .catch(e => setStatus({ type: 'err', msg: e?.message || '저장에 실패했습니다' }))
      .finally(() => setSaving(false));
  };
```

교체 후:

```js
  const runWrite = (payload, okMsg) => {
    setSaving(true); setStatus(null);
    return TennisSync.writeRosterMember(payload)
      .then(async () => {
        // reload() 는 getRosterAdmin(캐시 비대상)을 다시 읽어 이 화면만 갱신한다.
        // 앱 전역(TennisApp·대시보드·리그·분석)이 쓰는 roster 캐시는 여기서 갱신해야 한다.
        // 캐시 실패를 여기서 삼키는 것은 의도적이다 — 바깥 .catch 로 새면
        // 시트 저장이 성공했는데도 '저장에 실패했습니다' 가 뜬다.
        try { await SheetCache.refresh('roster'); }
        catch (e) { console.warn('[sheetCache] 명부 재적재 실패:', e?.message); }
        setStatus({ type: 'ok', msg: okMsg });
        setEditing(null);
        return reload();
      })
      .catch(e => setStatus({ type: 'err', msg: e?.message || '저장에 실패했습니다' }))
      .finally(() => setSaving(false));
  };
```

- [ ] **Step 8: 전체 회귀**

Run: `npm test && npm run lint && npm run build`
Expected: 전부 PASS

- [ ] **Step 9: 브라우저 스모크**

`npm run dev` 로 띄우고:
1. 회원관리에서 회원 하나의 비고를 수정해 저장한다
2. 대시보드로 이동 → 변경이 즉시 보인다(L1 이 비워지고 재적재된 값이 들어감)
3. Console 에 `[sheetCache]` 경고가 없다

마감 경로는 운영 데이터를 시트에 쓰므로 이 스모크에서 실행하지 않는다 —
단위 테스트(Step 5)로 커버된다.

- [ ] **Step 10: 커밋**

```bash
git add src/TennisApp.jsx src/utils/tennis/finalizeTennisRecords.js src/components/tennis/TennisMembers.jsx src/services/sheetCache.js src/services/__tests__/sheetCache.test.js src/components/tennis/__tests__/tennisApp.refresh.test.jsx
git commit -m "feat: 마감·회원 upsert 후 시트 캐시 재적재 + L2 TTL 12시간

쓰기 경로가 캐시를 갱신하므로 TTL 은 순수 백스톱이 됐다(30분 → 12시간).

전송+재적재를 finalizeTennisRecords 로 분리해 테스트 가능하게 했다.
전송 실패 시 재적재하지 않고 미확정을 유지하는 기존 규칙은 그대로다.
재적재 실패는 전송 성공을 되돌리지 않는다 — 캐시는 파생 데이터이고
refresh 가 실패 시 노드를 삭제해 다음 읽기를 시트로 강등한다."
```

---

## Task 6: 자동 업로드 봇의 캐시 재적재

현재 가장 흔한 쓰기 경로는 브라우저가 아니라 **매일 10:00 KST 의 봇**이다. 봇이 캐시를 안 고치면 앱이 TTL 내내 어제 데이터를 보여준다.

**Files:**
- Modify: `scripts/tennisAutoUpload.mjs`
- Create: `scripts/__tests__/tennisAutoUploadCache.test.js`

**Interfaces:**
- Consumes: Task 1의 `cachePath`, Task 2의 `encodeRows`
- Produces: `refreshPlayerGamesCache(teamKey, teamName): Promise<void>` (모듈 내부 함수, export 하여 테스트)

- [ ] **Step 1: 실패하는 테스트 작성**

`scripts/__tests__/tennisAutoUploadCache.test.js`:

```js
// 봇의 캐시 재적재는 순수 로직만 검증한다(러너 전체 실행은 운영 데이터를 건드린다).
import { describe, it, expect } from 'vitest';
import { cachePath } from '../../src/services/rtdbPath.js';
import { encodeRows } from '../../src/services/sheetCacheCore.js';
import { TENNIS_PLAYER_GAME_COLUMNS } from '../../src/utils/tennis/tennisSchema.js';

describe('봇이 쓰는 캐시 노드', () => {
  it('앱과 같은 경로를 만든다', () => {
    expect(cachePath('몽피스', '테니스', 'playerGames'))
      .toBe('cache/몽피스/테니스/playerGames/all');
  });

  it('앱과 같은 배열형 페이로드를 만든다', () => {
    const rows = [{ team: '몽피스', sport: '테니스', player: '박성언' }];
    const node = encodeRows(TENNIS_PLAYER_GAME_COLUMNS, rows);
    expect(node.headers).toEqual(TENNIS_PLAYER_GAME_COLUMNS);
    expect(node.count).toBe(1);
    expect(node.rows[0][TENNIS_PLAYER_GAME_COLUMNS.indexOf('player')]).toBe('박성언');
    // 빠진 컬럼은 '' — RTDB 가 배열 원소의 null 을 드롭해 인덱스가 밀리는 것을 막는다
    expect(node.rows[0]).not.toContain(null);
    expect(node.rows[0]).not.toContain(undefined);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run scripts/__tests__/tennisAutoUploadCache.test.js`
Expected: FAIL — `vitest.config.js` 의 `include` 가 `src/**` 뿐이라 이 파일이 수집되지 않는다 ("No test files found")

- [ ] **Step 3: vitest include 확장**

`vitest.config.js`:

```js
    include: ['src/**/*.test.{js,jsx}', 'scripts/**/*.test.{js,jsx}'],
```

Run: `npx vitest run scripts/__tests__/tennisAutoUploadCache.test.js`
Expected: PASS (2 tests)

- [ ] **Step 4: 봇에 재적재 구현**

`scripts/tennisAutoUpload.mjs` 상단 import 블록에 추가한다:

```js
import { cachePath } from '../src/services/rtdbPath.js';
import { encodeRows } from '../src/services/sheetCacheCore.js';
import { TENNIS_PLAYER_GAME_COLUMNS } from '../src/utils/tennis/tennisSchema.js';
```

`archiveGame` 함수 뒤에 추가한다:

```js
// 업로드가 있었던 팀의 playerGames 캐시를 재적재한다.
// 봇이 이걸 안 하면 앱이 L2 TTL(12h) 내내 어제 데이터를 보여준다.
// ★ 캐시 실패가 업로드 성공을 되돌리면 안 된다 — 캐시는 파생 데이터다.
//   실패 시 노드를 지워 다음 읽기를 시트로 강등하고, manualCheck 도 세우지 않는다.
async function refreshPlayerGamesCache(teamKey, teamName) {
  const path = cachePath(teamName, SPORT_KEY, 'playerGames');
  try {
    const rows = (await appsScript('getTennisPlayerGames', teamName)).rows || [];
    if (rows.length === 0) {
      console.log('  캐시 재적재 건너뜀 — 조회 결과 0행(조회 실패와 구분 불가)');
      return;
    }
    await rtdb('PUT', path, { ...encodeRows(TENNIS_PLAYER_GAME_COLUMNS, rows), version: { '.sv': 'timestamp' } });
    console.log(`  캐시 재적재 완료 — ${rows.length}행`);
  } catch (e) {
    console.log(`  캐시 재적재 실패, 노드 삭제로 강등: ${e.message}`);
    try { await rtdb('DELETE', path); } catch { /* best-effort */ }
  }
}
```

> `teamKey` 인자는 현재 쓰지 않지만 호출부 대칭을 위해 남긴다. 경로는 `cachePath` 가
> 팀명을 직접 정규화하므로 `teamName` 을 넘긴다 — 앱이 `AuthUtil` 의 팀명으로
> 만드는 경로와 같아야 한다.

- [ ] **Step 5: `processTeam` 에 호출 삽입**

`processTeam` 의 `for (const t of targets)` 루프 **앞에** 플래그를 선언한다:

```js
  let uploaded = false;
```

루프 안 `if (action === ACTION_UPLOAD_ARCHIVE) { ... }` 블록을 다음으로 바꾼다:

```js
      if (action === ACTION_UPLOAD_ARCHIVE) {
        const ok = await uploadRows(teamKey, teamName, t.gameId, t.state);
        if (!ok) continue;   // 등급 출처 없음 — 아카이브도 하지 않는다
        uploaded = true;
      }
```

루프 **뒤에** 추가한다 (경기마다 전량 재조회하지 않도록 실행당 1회로 모은다):

```js
  if (uploaded && !DRY_RUN) {
    await refreshPlayerGamesCache(teamKey, teamName);
  }
```

- [ ] **Step 6: DRY_RUN 으로 봇 동작 확인**

Run:
```bash
DRY_RUN=1 FIREBASE_DATABASE_URL="$(grep VITE_FIREBASE_DATABASE_URL .env | cut -d= -f2- | tr -d '"')" \
  APPS_SCRIPT_URL="$(grep VITE_APPS_SCRIPT_URL .env | cut -d= -f2- | tr -d '"')" \
  TENNIS_BOT_TOKEN="dry:dry:0000" \
  npx vite-node scripts/tennisAutoUpload.mjs
```
Expected: import 해석 에러 없이 실행되고 `[skip]` 또는 `[DRY_RUN]` 로그로 종료.
`uploaded` 가 false 이므로 캐시 재적재는 호출되지 않는다(RTDB 무변경).

- [ ] **Step 7: 전체 회귀**

Run: `npm test && npm run lint`
Expected: 전부 PASS

- [ ] **Step 8: 커밋**

```bash
git add scripts/tennisAutoUpload.mjs scripts/__tests__/tennisAutoUploadCache.test.js vitest.config.js
git commit -m "feat: 자동 업로드 봇이 playerGames 캐시를 재적재

현재 가장 흔한 쓰기 경로는 브라우저가 아니라 매일 10시의 봇이다.
봇이 캐시를 안 고치면 앱이 L2 TTL(12h) 내내 어제 데이터를 보여준다.

- 경기마다가 아니라 실행당 1회로 모아 전량 재조회를 줄인다
- 캐시 실패는 업로드 성공을 되돌리지 않는다. 노드 삭제로 강등만 하고
  manualCheck 도 세우지 않는다 — 캐시는 파생 데이터다
- 조회 결과 0행이면 저장하지 않는다(조회 실패와 구분 불가)
- vitest include 에 scripts/** 추가"
```

---

## Task 7: 설정 화면 수동 동기화

시트를 손으로 고치는 드문 경우의 안전밸브. "거의 없다"고 확인받았으므로 매 진입 자동 감지 대신 이 버튼을 둔다.

**Files:**
- Modify: `src/components/common/SettingsScreen.jsx`
- Create: `src/components/common/__tests__/settingsSyncBlock.test.jsx`

**Interfaces:**
- Consumes: Task 3의 `SheetCache.status()`, `SheetCache.refreshAll()`, `SheetCache.datasetsOf(sport)`
- Produces: 없음

- [ ] **Step 1: 표시 문구 순수 함수 테스트 작성**

`src/components/common/__tests__/settingsSyncBlock.test.jsx`:

```js
import { describe, it, expect } from 'vitest';
import { formatSyncStatus } from '../syncStatusText';

const NOW = Date.parse('2026-09-08T09:26:00+09:00');

describe('formatSyncStatus', () => {
  it('캐시가 없으면 안내 문구', () => {
    expect(formatSyncStatus([
      { dataset: 'roster', version: null, count: null },
    ], NOW)).toBe('아직 캐시 없음');
  });

  it('가장 오래된 동기화 시각과 경과를 보여준다', () => {
    const s = formatSyncStatus([
      { dataset: 'roster', version: Date.parse('2026-09-08T09:14:00+09:00'), count: 42 },
      { dataset: 'playerGames', version: Date.parse('2026-09-08T09:20:00+09:00'), count: 2330 },
    ], NOW);
    expect(s).toContain('09:14');
    expect(s).toContain('12분 전');
    expect(s).toContain('명부 42행');
    expect(s).toContain('선수경기 2,330행');
  });

  it('1시간이 넘으면 시간 단위', () => {
    const s = formatSyncStatus([
      { dataset: 'roster', version: NOW - 3 * 3600 * 1000, count: 1 },
    ], NOW);
    expect(s).toContain('3시간 전');
  });

  it('일부만 캐시된 경우 캐시된 것만 센다', () => {
    const s = formatSyncStatus([
      { dataset: 'roster', version: NOW - 60_000, count: 5 },
      { dataset: 'legacy', version: null, count: null },
    ], NOW);
    expect(s).toContain('명부 5행');
    expect(s).not.toContain('레거시');
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/components/common/__tests__/settingsSyncBlock.test.jsx`
Expected: FAIL — `Failed to resolve import "../syncStatusText"`

- [ ] **Step 3: 구현**

`src/components/common/syncStatusText.js` (신규):

```js
// 설정 화면의 캐시 상태 문구. 렌더에서 분리해 단위 테스트 가능하게 둔다.

const LABELS = { roster: '명부', playerGames: '선수경기', legacy: '레거시' };

function ago(ms) {
  const m = Math.max(0, Math.floor(ms / 60000));
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 전`;
  return `${Math.floor(h / 24)}일 전`;
}

function hhmmKST(ts) {
  const d = new Date(ts + 9 * 3600 * 1000);
  return d.toISOString().slice(11, 16);
}

export function formatSyncStatus(entries, now = Date.now()) {
  const cached = (entries || []).filter(e => typeof e.version === 'number' && e.version > 0);
  if (cached.length === 0) return '아직 캐시 없음';
  const oldest = Math.min(...cached.map(e => e.version));
  const counts = cached
    .map(e => `${LABELS[e.dataset] || e.dataset} ${Number(e.count || 0).toLocaleString('ko-KR')}행`)
    .join(' · ');
  return `마지막 동기화 ${hhmmKST(oldest)} (${ago(now - oldest)}) — ${counts}`;
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run src/components/common/__tests__/settingsSyncBlock.test.jsx`
Expected: PASS (4 tests)

- [ ] **Step 5: 설정 화면에 블록 추가**

`src/components/common/SettingsScreen.jsx` — import 추가:

```js
import SheetCache from '../../services/sheetCache';
import { formatSyncStatus } from './syncStatusText';
```

state 추가 (`const [recoverResult, setRecoverResult] = useState(null);` 아래):

```js
  const [syncing, setSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState(null);   // null = 아직 조회 전
  const [syncResult, setSyncResult] = useState(null);
```

캐시 상태 로드 effect 추가 (`AppSync.getSheetList` effect 아래):

```js
  // 캐시 상태는 version/count 만 얕게 읽는다 — rows 를 내려받지 않는다.
  useEffect(() => {
    if (SheetCache.datasetsOf(sport).length === 0) return;
    let cancelled = false;
    SheetCache.status()
      .then(s => { if (!cancelled) setSyncStatus(s); })
      .catch(() => { if (!cancelled) setSyncStatus([]); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 마운트 시 1회만
  }, []);
```

핸들러 추가:

```js
  const handleManualSync = async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const r = await SheetCache.refreshAll();
      const total = r.reduce((s, x) => s + x.count, 0);
      setSyncResult({ ok: true, total });
      setSyncStatus(await SheetCache.status());
    } catch (e) {
      setSyncResult({ ok: false, error: e?.message || '알 수 없는 오류' });
    } finally {
      setSyncing(false);
    }
  };
```

렌더 블록 추가 — `{isAdmin && !isTennis && (` 블록 **앞에** 넣는다 (테니스에서도 보여야 하고, 전원에게 노출한다):

```jsx
      {SheetCache.datasetsOf(sport).length > 0 && (
        <div style={{ display: "grid", gap: 8, padding: 12, borderRadius: 12, background: "var(--app-card)", marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 700 }}>데이터 동기화</div>
          <div style={{ fontSize: 12, color: "var(--app-gray)" }}>
            {syncStatus === null ? "확인 중..." : formatSyncStatus(syncStatus)}
          </div>
          <div style={{ fontSize: 11, color: "var(--app-gray)" }}>
            구글시트를 앱 밖에서 직접 고쳤을 때만 누르면 됩니다. 평소에는 경기 마감·회원 등록 시 자동으로 갱신됩니다.
          </div>
          <button
            onClick={handleManualSync}
            disabled={syncing}
            style={{ padding: "10px 12px", fontSize: 13, fontWeight: 600, borderRadius: 10, border: "none", cursor: syncing ? "not-allowed" : "pointer", background: "var(--app-accent)", color: "#fff", opacity: syncing ? 0.6 : 1 }}
          >
            {syncing ? "동기화 중..." : "구글시트에서 다시 불러오기"}
          </button>
          {syncResult && (
            <div style={{ fontSize: 12, color: syncResult.ok ? "var(--app-green)" : "var(--app-red)" }}>
              {syncResult.ok ? `✓ 동기화 완료 — 총 ${syncResult.total.toLocaleString('ko-KR')}행` : `✗ 실패: ${syncResult.error}`}
            </div>
          )}
        </div>
      )}
```

- [ ] **Step 6: 렌더 확인**

Run: `npm test && npm run lint && npm run build`
Expected: 전부 PASS

`npm run dev` 로 띄우고 몽피스 테니스 → 설정 진입:
1. "데이터 동기화" 블록이 보이고 `마지막 동기화 HH:MM (N분 전) — 명부 N행 · 선수경기 N행` 이 표시된다
2. 버튼을 누르면 "동기화 중..." → "✓ 동기화 완료 — 총 N행"
3. 상태 문구의 시각이 방금 시각으로 갱신된다
4. 마스터FC(풋살)/하버FC(축구)로 로그인하면 이 블록이 **보이지 않는다** (어댑터 미등록)

- [ ] **Step 7: 커밋**

```bash
git add src/components/common/SettingsScreen.jsx src/components/common/syncStatusText.js src/components/common/__tests__/settingsSyncBlock.test.jsx
git commit -m "feat: 설정에 수동 동기화 버튼

시트를 앱 밖에서 직접 고치는 드문 경우의 안전밸브. 매 진입 자동 감지는
Apps Script 콜드스타트를 모든 사용자에게 물리므로 채택하지 않았다.

- 비파괴적(시트를 읽어 캐시를 덮을 뿐)이라 전원에게 노출한다
- 상태는 version/count 만 얕게 읽는다 — rows 를 내려받지 않는다
- 어댑터가 없는 종목(풋살·축구)에서는 블록이 뜨지 않는다
- 문구 조립은 syncStatusText 로 분리해 단위 테스트한다"
```

---

## Self-Review 결과

**Spec coverage:**

| 스펙 절 | 담당 Task |
|---|---|
| §3 3층 구조 | Task 3 |
| §3.1 in-flight 중복 제거 | Task 3 Step 2 (테스트) |
| §3.2 L1 TTL 5분 | Task 3 |
| §3.3 컨텍스트·데이터셋 이름 | Task 3 (`_ctx`, `ADAPTERS`) |
| §4 RTDB 데이터 모델 | Task 1 (`cachePath`) + Task 2 (`encodeRows`) |
| §4.2 빈배열 함정 | Task 2 (`readCacheNode` version 판정) |
| §4.3 스키마 드리프트 | Task 2 (`MISS_SCHEMA`) |
| §5 무효화 재적재 | Task 5, Task 6 |
| §5.1 봇 | Task 6 |
| §6 에러 처리 | Task 3 (폴백), Task 5·6 (강등) |
| §6.1 빈 결과 미캐싱 | Task 2 (`shouldStore`) |
| §7 캐시 미적용 읽기 | Task 4 (AttendeeSelector 무변경), Task 5 (getRosterAdmin 무변경) |
| §8.1 safeTeam 중복 제거 | Task 1 |
| §9 샤딩 축만 개방 | Task 1 (`cachePath` shard 인자) |
| §10 수동 동기화 | Task 7 |
| §11 TTL 단계 | Task 3 (30분) → Task 5 (12시간) |
| §12 테스트 12항목 | Task 2·3·5·6·7 전반 |
| §13 적용 순서 | Task 1~7 순서가 곧 배포 단계 |
| §14 롤백 | Task 3 (`DISABLED`) |

누락 없음.

**Placeholder scan:** "TBD"/"적절히 처리"/"Task N과 유사" 없음. 모든 코드 스텝에 실제 코드가 들어 있다.

**Type consistency:** `SheetCache.get/refresh/refreshAll/status/datasetsOf/_resetForTest` 이름이 Task 3 정의와 Task 4·5·7 사용처에서 일치. `encodeRows/decodeRows/readCacheNode/shouldStore` 가 Task 2 정의와 Task 3·6 사용처에서 일치. `cachePath(team, sport, dataset, shard?)` 인자 순서가 Task 1·3·6에서 일치. `TENNIS_ROSTER_CACHE_COLUMNS` 가 Task 3 Step 1 정의와 Task 3 Step 4 사용처에서 일치.
