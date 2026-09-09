# 시트 캐시 풋살·축구 확장 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 풋살·축구의 Apps Script 읽기 7종을 기존 3층 캐시에 태워, `TeamDashboard` 5~6회 / `PlayerAnalytics` 3회 / 앱 진입 1회의 Apps Script 왕복을 캐시 히트 시 0회로 만든다.

**Architecture:** 기존 `sheetCache.js`(테니스 배포 완료)에 **`raw` 저장 모드**와 **`sheetName` 드리프트 가드**를 더한 뒤, `ADAPTERS`에 `'풋살'`·`'축구'` 키를 등록하고 호출부 6개를 전환한다. 저장 형식·히트 판정·in-flight 중복 제거·강등 로직은 그대로 재사용한다.

**Tech Stack:** React 19 + Vite, Firebase Realtime Database (`firebase/database` 모듈러 API), Vitest + jsdom, Apps Script(읽기 원본, 무수정)

**Spec:** `docs/superpowers/specs/2026-09-09-sheet-cache-soccer-futsal-design.md`
(선행: `docs/superpowers/specs/2026-09-08-sheet-cache-design.md` — 테니스, 배포 완료)

## Global Constraints

- **`tennisSync.js` / `appSync.js` / `apps-script/Code.js` 는 수정하지 않는다.** L3는 그대로 재사용한다.
- **테니스 경로를 깨뜨리지 않는다.** `'테니스'` 어댑터 3종은 `mode` 를 선언하지 않으며, 기본값 `'rows'` 로 지금과 똑같이 동작해야 한다.
- 캐시 노드 경로는 `cache/{safeTeam}/{sport}/{dataset}/all`.
- 저장 형식: `mode:'rows'` → `{ version, sheetName?, headers, rows, count }` · `mode:'raw'` → `{ version, sheetName?, data }`.
- **히트 판정은 `version` 존재 여부로 한다** (RTDB는 빈 배열/빈 객체를 저장하지 않는다).
- **`get()` 은 빈 결과를 L1/L2에 쓰지 않는다**(`shouldStore`). **`refresh()` 는 빈 결과를 실패로 보고 노드를 강등한다**(스펙 §5). 이 비대칭은 의도된 것이다.
- **캐시의 어떤 실패도 화면·마감을 죽이지 않는다.** `refresh` 는 throw 하지 않고 `{ ok, rows }` 를 반환한다.
- `DISABLED` 롤백 스위치가 `get`/`refresh`/`status` 전부에 적용된 상태를 유지한다.
- **캐시하지 않는 것**: `fetchSheetData` / `fetchAttendanceData`(CSV 직접, 참석명단은 경기 당일 변경) · `recoverFinalizedFromSheets`(관리자 복구, 신선도가 정확성 요건) · `getSheetList` · `getRankingHistory`(동적 인자).
- 커밋 메시지는 한국어. 기존 스타일(`feat:` / `fix:` / `refactor:` / `docs:`)을 따른다.
- 테스트: `npx vitest run <path>`. 전체 `npm test`. 빌드 `npm run build`. 린트 `npm run lint`
  (`appSync.js:13`, `tennisSync.js:16` 의 `no-misleading-character-class` 에러 2건은 **사전 존재**이며 이 작업 범위 밖이다).
- **`npm run dev` 를 띄우거나 운영 시트/RTDB에 쓰는 스크립트를 실행하지 않는다.**

---

## File Structure

| 파일 | 책임 |
|---|---|
| `src/services/sheetCacheCore.js` (수정) | `raw` 모드 인코딩/디코딩, `readCacheNode` 의 mode·sheetName 분기 |
| `src/services/sheetCache.js` (수정) | 어댑터 레지스트리에 풋살·축구 등록, mode/sheetName 배선 |
| `src/utils/soccerCacheColumns.js` (신규) | `POINT_LOG_CACHE_COLUMNS` / `PLAYER_LOG_CACHE_COLUMNS` — Apps Script **응답 키** 미러 |
| `src/components/dashboard/TeamDashboard.jsx` (수정) | 읽기 3종 전환 |
| `src/components/dashboard/analytics/{DualTeamTab,RecentFormTop3,DefenseTopCards}.jsx` (수정) | 읽기 각 1종 전환 |
| `src/components/dashboard/PlayerAnalytics.jsx` (수정) | 읽기 3종 전환 + `.rows` → 배열 |
| `src/App.jsx` (수정) | `getCumulativeBonus` 전환 + 마감 후 무효화 |
| `src/SoccerApp.jsx` (수정) | 마감 후 무효화 |
| `src/components/tournament/TournamentMatchManager.jsx` (수정) | 대회 기록 전송 후 무효화 |
| `src/components/common/SettingsScreen.jsx` (수정) | 로그_매치 재전송 후 무효화 |
| `src/components/common/syncStatusText.js` (수정) | `DATASET_LABELS` 7개 추가 |

---

## Task 1: `raw` 저장 모드

7종 중 2종(`getLatestDeltas`, `getCumulativeBonus`)이 **중첩 맵**을 반환해 배열형 모델이 안 맞는다. 응답을 그대로 보관하는 모드를 더한다.

**Files:**
- Modify: `src/services/sheetCacheCore.js`
- Test: `src/services/__tests__/sheetCacheCore.test.js`

**Interfaces:**
- Consumes: 기존 `encodeRows` / `decodeRows` / `shouldStore` / `MISS_*`
- Produces:
  - `encodeRaw(value): { data: any }`
  - `readCacheNode(node, opts, ttlMs, now)` — **시그니처 변경**. `opts` 는
    `{ mode?: 'rows'|'raw', columns?: string[], sheetName?: string }`.
    반환은 기존대로 `{ ok: true, rows }` 또는 `{ ok: false, reason }`.
    `mode:'raw'` 일 때 `rows` 자리에 저장된 값(맵이든 배열이든)이 그대로 들어간다.
  - 새 상수 `MISS_MODE = 'mode'`, `MISS_SHEET = 'sheet'`
  - `shouldStoreValue(value, mode): boolean` — `rows` 모드는 기존 `shouldStore`,
    `raw` 모드는 "null/undefined 가 아니고, 빈 객체·빈 배열이 아님"

- [ ] **Step 1: 실패하는 테스트 작성**

`src/services/__tests__/sheetCacheCore.test.js` **끝에** 추가한다(기존 테스트는 건드리지 않는다):

```js
import {
  encodeRaw, shouldStoreValue, MISS_MODE, MISS_SHEET,
} from '../sheetCacheCore';

describe('raw 모드', () => {
  const NOW2 = 1_757_000_000_000;
  const TTL2 = 30 * 60 * 1000;
  const MAP = { 박성언: { goals: 2, assists: 1 }, 김원희: { goals: 0, assists: 3 } };

  it('encodeRaw 는 값을 data 에 그대로 담는다', () => {
    expect(encodeRaw(MAP)).toEqual({ data: MAP });
  });

  it('raw 노드를 읽으면 저장한 맵이 그대로 나온다', () => {
    const node = { version: NOW2 - 1000, ...encodeRaw(MAP) };
    const r = readCacheNode(node, { mode: 'raw' }, TTL2, NOW2);
    expect(r.ok).toBe(true);
    expect(r.rows).toEqual(MAP);
  });

  // rows 모드로 저장된 노드를 raw 로 읽으면(또는 그 반대) 형태가 어긋난다.
  // 모드 전환 배포 직후 낡은 노드가 그대로 살아있는 상황을 막는다.
  it('모드가 다른 노드는 미스', () => {
    const rowsNode = { version: NOW2 - 1000, headers: ['a'], rows: [['x']], count: 1 };
    expect(readCacheNode(rowsNode, { mode: 'raw' }, TTL2, NOW2).reason).toBe(MISS_MODE);
    const rawNode = { version: NOW2 - 1000, data: MAP };
    expect(readCacheNode(rawNode, { mode: 'rows', columns: ['a'] }, TTL2, NOW2).reason).toBe(MISS_MODE);
  });

  it('raw 도 version 이 없으면 미스', () => {
    expect(readCacheNode({ data: MAP }, { mode: 'raw' }, TTL2, NOW2).reason).toBe(MISS_NO_VERSION);
  });

  it('raw 도 TTL 을 넘기면 미스', () => {
    const node = { version: NOW2 - TTL2 - 1, data: MAP };
    expect(readCacheNode(node, { mode: 'raw' }, TTL2, NOW2).reason).toBe(MISS_EXPIRED);
  });
});

describe('sheetName 드리프트 가드', () => {
  const NOW3 = 1_757_000_000_000;
  const TTL3 = 30 * 60 * 1000;
  const COLS3 = ['date', 'name'];
  const node = (sheetName) => ({
    version: NOW3 - 1000, sheetName, headers: COLS3, rows: [['2026-09-01', '박성언']], count: 1,
  });

  it('시트명이 같으면 히트', () => {
    const r = readCacheNode(node('마스터FC 포인트 로그'), { columns: COLS3, sheetName: '마스터FC 포인트 로그' }, TTL3, NOW3);
    expect(r.ok).toBe(true);
  });

  // 캐시 키는 팀+종목이라 설정에서 시트명을 바꿔도 같은 노드를 가리킨다.
  it('시트명이 다르면 미스', () => {
    const r = readCacheNode(node('옛 시트'), { columns: COLS3, sheetName: '새 시트' }, TTL3, NOW3);
    expect(r.reason).toBe(MISS_SHEET);
  });

  it('시트명을 요구하지 않는 데이터셋은 가드를 적용하지 않는다', () => {
    const bare = { version: NOW3 - 1000, headers: COLS3, rows: [['2026-09-01', '박성언']], count: 1 };
    expect(readCacheNode(bare, { columns: COLS3 }, TTL3, NOW3).ok).toBe(true);
  });

  it('시트명을 요구하는데 노드에 없으면 미스', () => {
    const bare = { version: NOW3 - 1000, headers: COLS3, rows: [['2026-09-01', '박성언']], count: 1 };
    expect(readCacheNode(bare, { columns: COLS3, sheetName: '어떤 시트' }, TTL3, NOW3).reason).toBe(MISS_SHEET);
  });
});

describe('shouldStoreValue', () => {
  it('rows 모드는 빈 배열을 거부한다', () => {
    expect(shouldStoreValue([], 'rows')).toBe(false);
    expect(shouldStoreValue([{ a: 1 }], 'rows')).toBe(true);
  });
  it('raw 모드는 빈 맵/빈 배열/null 을 거부한다', () => {
    expect(shouldStoreValue({}, 'raw')).toBe(false);
    expect(shouldStoreValue([], 'raw')).toBe(false);
    expect(shouldStoreValue(null, 'raw')).toBe(false);
    expect(shouldStoreValue(undefined, 'raw')).toBe(false);
  });
  it('raw 모드는 내용이 있으면 저장한다', () => {
    expect(shouldStoreValue({ 박성언: { goals: 1 } }, 'raw')).toBe(true);
    expect(shouldStoreValue({ crova: {}, goguma: { 박성언: 1 } }, 'raw')).toBe(true);
  });
});
```

> 파일 상단의 기존 import 줄에 `encodeRaw`, `shouldStoreValue`, `MISS_MODE`, `MISS_SHEET` 를
> 추가한다. **새 import 줄을 만들지 말 것** — 중복 import 는 에러다.

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/services/__tests__/sheetCacheCore.test.js`
Expected: FAIL — `encodeRaw is not a function` 계열 + `readCacheNode` 시그니처 불일치

- [ ] **Step 3: 구현**

`src/services/sheetCacheCore.js` 를 다음과 같이 고친다.

상수 추가(기존 `MISS_EXPIRED` 아래):

```js
export const MISS_MODE = 'mode';
export const MISS_SHEET = 'sheet';
```

`encodeRaw` 추가(`encodeRows` 아래):

```js
// 응답 값을 그대로 보관한다. 중첩 맵처럼 배열형에 맞지 않는 데이터셋용이며,
// 대상이 수 KB라 배열형 압축 이득이 없다. 캐시가 데이터를 재해석하지 않는 편이
// 의미론적으로도 정확하다.
export function encodeRaw(value) {
  return { data: value };
}
```

`readCacheNode` 를 교체한다:

```js
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
```

`shouldStoreValue` 추가(`shouldStore` 아래, `shouldStore` 는 그대로 남긴다):

```js
// 모드별 "저장할 가치가 있는 결과인가". rows 는 기존 규칙 그대로,
// raw 는 빈 맵/빈 배열도 조회 실패와 구분할 수 없으므로 저장하지 않는다.
export function shouldStoreValue(value, mode = 'rows') {
  if (mode !== 'raw') return shouldStore(value);
  if (value === null || value === undefined) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.keys(value).length > 0;
  return true;
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run src/services/__tests__/sheetCacheCore.test.js`
Expected: PASS — 기존 테스트 + 새 테스트 전부

- [ ] **Step 5: 호출부 시그니처 수정**

`readCacheNode` 시그니처가 바뀌었으므로 `src/services/sheetCache.js` 의 유일한 호출부를 고친다:

```js
        const res = readCacheNode(snap.val(), { columns: adapter.columns }, L2_TTL_MS, Date.now());
```

(Task 2에서 mode/sheetName 을 마저 배선한다. 지금은 테니스가 깨지지 않는 최소 수정만.)

- [ ] **Step 6: 전체 회귀**

Run: `npm test && npm run build`
Expected: 전부 PASS — 특히 `src/services/__tests__/sheetCache.test.js` 의 테니스 경로가 그대로 통과해야 한다

- [ ] **Step 7: 커밋**

```bash
git add src/services/sheetCacheCore.js src/services/__tests__/sheetCacheCore.test.js src/services/sheetCache.js
git commit -m "feat: 시트 캐시에 raw 저장 모드 + sheetName 드리프트 가드 추가

풋살·축구 7종 중 2종(latestDeltas/cumulativeBonus)이 중첩 맵을 반환해
배열형 모델이 맞지 않는다. 수 KB라 압축 이득도 없어 응답을 그대로 보관한다.

pointLog/playerLog 는 시트명이 팀 설정에서 오는데 캐시 키는 팀+종목이라
설정에서 시트명을 바꿔도 같은 노드를 가리킨다 — 노드에 sheetName 을 함께
저장하고 불일치 시 미스로 처리한다(headers 드리프트 가드와 같은 방식).

readCacheNode 가 opts 객체를 받도록 바꿨다. 아직 아무도 mode/sheetName 을
넘기지 않으므로 테니스 동작은 그대로다."
```

---

## Task 2: 어댑터 레지스트리 확장

**Files:**
- Create: `src/utils/soccerCacheColumns.js`
- Modify: `src/services/sheetCache.js`
- Test: `src/services/__tests__/sheetCache.test.js`

**Interfaces:**
- Consumes: Task 1의 `encodeRaw` / `shouldStoreValue` / `readCacheNode(node, opts, ttl, now)`
- Produces:
  - `POINT_LOG_CACHE_COLUMNS` / `PLAYER_LOG_CACHE_COLUMNS` (`src/utils/soccerCacheColumns.js`)
  - `SheetCache.datasetsOf('풋살')` / `('축구')` → `['matchLog','eventLog','playerGameLog','pointLog','playerLog','latestDeltas','cumulativeBonus']`
  - 어댑터 항목 형태: `{ mode?, columns?, sheetOf?, fetch }` — `fetch` 는 `(settings) => Promise<any>`

- [ ] **Step 1: 컬럼 상수를 서버와 대조해 검증**

`apps-script/Code.js` 의 `_getPointLog` / `_getPlayerLog` 의 `push({...})` 블록을 **직접 열어**
키 목록과 순서를 확인하라. 2026-09-09 시점 추출값은 다음과 같다:

```
_getPointLog  : date matchId myTeam opponent scorer assist ownGoal foul concedingGk
_getPlayerLog : date name goals assists ownGoals conceded cleanSheets crova goguma keeperGames rankScore
```

다르면 **서버 쪽을 진실로 삼아** 아래 상수를 고쳐라(서버는 수정 금지). 불일치해도
`MISS_SCHEMA` 로 자동 강등되어 데이터 손상은 없지만 캐시가 항상 미스가 된다.

- [ ] **Step 2: 실패하는 테스트 작성**

`src/services/__tests__/sheetCache.test.js` 의 **목 정의를 확장**한다. 기존 `vi.hoisted` 블록에
카운터를 추가하고, `appSync` 목을 새로 만든다(기존 `tennisSync` 목은 그대로 둔다):

```js
vi.mock('../appSync', () => ({
  default: {
    getMatchLog: () => { h.fetchCounts.matchLog++; return Promise.resolve({ rows: [{ team: '마스터FC', date: '2026-09-01', match_id: 'R1_C0' }] }); },
    getEventLog: () => { h.fetchCounts.eventLog++; return Promise.resolve({ rows: [{ team: '마스터FC', event_type: 'goal', player: '박성언' }] }); },
    getPlayerGameLog: () => { h.fetchCounts.playerGameLog++; return Promise.resolve({ rows: [{ team: '마스터FC', player: '박성언', games: 3 }] }); },
    getPointLog: () => { h.fetchCounts.pointLog++; return Promise.resolve([{ date: '2026-09-01', scorer: '박성언', assist: '김원희' }]); },
    getPlayerLog: () => { h.fetchCounts.playerLog++; return Promise.resolve([{ date: '2026-09-01', name: '박성언', goals: 2 }]); },
    getLatestDeltas: () => { h.fetchCounts.latestDeltas++; return Promise.resolve({ 박성언: { goals: 1, assists: 0 } }); },
    getCumulativeBonus: () => { h.fetchCounts.cumulativeBonus++; return Promise.resolve({ crova: { 박성언: 2 }, goguma: {} }); },
  },
}));
```

`h.fetchCounts` 초기화에 7개 키를 더하고, `beforeEach` 도 함께 맞춘다.

`AuthUtil` 목과 `settings` 목을 종목 전환 가능하게 바꾼다:

```js
vi.mock('../authUtil', () => ({
  default: { getStored: () => h.auth },
}));
vi.mock('../../config/settings', () => ({
  getEffectiveSettings: () => h.settings,
}));
```

`vi.hoisted` 에 `auth: { team: '몽피스', mode: '테니스' }`, `settings: {}` 를 넣고,
`beforeEach` 에서 그 기본값으로 되돌린다.

그리고 새 describe 를 파일 끝에 추가한다:

```js
describe('풋살·축구 어댑터', () => {
  beforeEach(() => {
    h.auth = { team: '마스터FC', mode: '풋살' };
    h.settings = { pointLogSheet: '마스터FC 포인트 로그', playerLogSheet: '마스터FC 선수별집계기록 로그' };
  });

  it('풋살·축구 데이터셋 7종', () => {
    const expected = ['matchLog', 'eventLog', 'playerGameLog', 'pointLog', 'playerLog', 'latestDeltas', 'cumulativeBonus'];
    expect(SheetCache.datasetsOf('풋살')).toEqual(expected);
    expect(SheetCache.datasetsOf('축구')).toEqual(expected);
  });

  it('로그 3종은 {rows} 래퍼를 벗겨 배열로 캐시한다', async () => {
    const rows = await SheetCache.get('eventLog');
    expect(Array.isArray(rows)).toBe(true);
    expect(rows[0].player).toBe('박성언');
    const node = h.store.get('cache/마스터FC/풋살/eventLog/all');
    expect(node.count).toBe(1);
    expect(node.headers).toContain('event_type');
  });

  it('맵 2종은 raw 모드로 그대로 보관된다', async () => {
    const v = await SheetCache.get('latestDeltas');
    expect(v).toEqual({ 박성언: { goals: 1, assists: 0 } });
    const node = h.store.get('cache/마스터FC/풋살/latestDeltas/all');
    expect(node.data).toEqual({ 박성언: { goals: 1, assists: 0 } });
    expect(node.headers).toBeUndefined();
  });

  it('raw 노드도 L2 히트로 재사용된다(L3 재호출 없음)', async () => {
    await SheetCache.get('cumulativeBonus');
    expect(h.fetchCounts.cumulativeBonus).toBe(1);
    SheetCache._resetForTest();
    const v = await SheetCache.get('cumulativeBonus');
    expect(v).toEqual({ crova: { 박성언: 2 }, goguma: {} });
    expect(h.fetchCounts.cumulativeBonus).toBe(1);
  });

  it('시트명 의존 데이터셋은 노드에 sheetName 을 남긴다', async () => {
    await SheetCache.get('pointLog');
    expect(h.store.get('cache/마스터FC/풋살/pointLog/all').sheetName).toBe('마스터FC 포인트 로그');
  });

  it('설정에서 시트명을 바꾸면 캐시가 미스가 되어 다시 읽는다', async () => {
    await SheetCache.get('pointLog');
    expect(h.fetchCounts.pointLog).toBe(1);
    SheetCache._resetForTest();
    h.settings = { ...h.settings, pointLogSheet: '새 포인트 로그' };
    await SheetCache.get('pointLog');
    expect(h.fetchCounts.pointLog).toBe(2);
  });

  it('축구는 같은 데이터셋을 다른 노드에 캐시한다', async () => {
    await SheetCache.get('matchLog');
    h.auth = { team: '하버FC', mode: '축구' };
    await SheetCache.get('matchLog');
    expect(h.store.has('cache/마스터FC/풋살/matchLog/all')).toBe(true);
    expect(h.store.has('cache/하버FC/축구/matchLog/all')).toBe(true);
  });
});
```

기존 `어댑터 등록 커버리지` 테스트를 **모드까지 검증하도록 확장**한다:

```js
describe('어댑터 등록 커버리지', () => {
  it('모든 종목의 모든 어댑터가 mode 에 맞는 필드를 갖는다', () => {
    const all = SheetCache._adaptersForTest();
    for (const [sport, datasets] of Object.entries(all)) {
      for (const [name, a] of Object.entries(datasets)) {
        const where = `${sport}.${name}`;
        expect(typeof a.fetch, where).toBe('function');
        const mode = a.mode || 'rows';
        expect(['rows', 'raw'], where).toContain(mode);
        if (mode === 'rows') {
          expect(Array.isArray(a.columns), where).toBe(true);
          expect(a.columns.length, where).toBeGreaterThan(0);
        } else {
          expect(a.columns, where).toBeUndefined();
        }
        if (a.sheetOf !== undefined) expect(typeof a.sheetOf, where).toBe('function');
      }
    }
  });
});
```

- [ ] **Step 3: 실패 확인**

Run: `npx vitest run src/services/__tests__/sheetCache.test.js`
Expected: FAIL — `datasetsOf('풋살')` 이 `[]`

- [ ] **Step 4: 컬럼 상수 파일 생성**

`src/utils/soccerCacheColumns.js`:

```js
// 풋살·축구 캐시의 컬럼 상수.
//
// ★ 시트 헤더가 아니라 Apps Script 응답 객체의 키다. 서버(_getPointLog/_getPlayerLog)가
//   시트 열을 camelCase 키로 매핑해서 내리므로 시트 헤더와 이름이 다르다.
//   서버 반환 shape 이 바뀌면 여기도 고칠 것 — 안 고쳐도 MISS_SCHEMA 로 자동 강등되어
//   데이터 손상은 없지만 캐시가 항상 미스가 된다.
//
// 로그 3종(matchLog/eventLog/playerGameLog)은 별도 상수가 필요 없다 —
// RAW_MATCH_COLUMNS / RAW_EVENT_COLUMNS / RAW_PLAYER_GAME_COLUMNS 가 서버 헤더와
// 완전히 일치함을 확인했다(2026-09-09).

export const POINT_LOG_CACHE_COLUMNS = [
  'date', 'matchId', 'myTeam', 'opponent', 'scorer', 'assist', 'ownGoal', 'foul', 'concedingGk',
];

export const PLAYER_LOG_CACHE_COLUMNS = [
  'date', 'name', 'goals', 'assists', 'ownGoals', 'conceded', 'cleanSheets',
  'crova', 'goguma', 'keeperGames', 'rankScore',
];
```

- [ ] **Step 5: 어댑터 등록**

`src/services/sheetCache.js` 상단 import 에 추가한다:

```js
import AppSync from './appSync';
import { getEffectiveSettings } from '../config/settings';
import { RAW_MATCH_COLUMNS } from '../utils/matchRowBuilder';
import { RAW_EVENT_COLUMNS, RAW_PLAYER_GAME_COLUMNS } from '../utils/rawLogBuilders';
import { POINT_LOG_CACHE_COLUMNS, PLAYER_LOG_CACHE_COLUMNS } from '../utils/soccerCacheColumns';
import { encodeRaw, shouldStoreValue } from './sheetCacheCore';
```

(`encodeRows` / `readCacheNode` / `shouldStore` 는 이미 import 되어 있다 — 기존 줄에 합칠 것.)

`ADAPTERS` 위에 팩토리를 둔다:

```js
// 풋살·축구는 같은 Apps Script 함수를 쓰지만 sport 인자와 시트명이 다르다.
// {rows} 래퍼는 여기서 벗겨 배열만 캐시한다 — 호출부도 배열을 직접 받는다.
function soccerLikeAdapters(sport) {
  return {
    matchLog:      { columns: RAW_MATCH_COLUMNS,       fetch: () => AppSync.getMatchLog({ sport }).then(r => r?.rows || []) },
    eventLog:      { columns: RAW_EVENT_COLUMNS,       fetch: () => AppSync.getEventLog({ sport }).then(r => r?.rows || []) },
    playerGameLog: { columns: RAW_PLAYER_GAME_COLUMNS, fetch: () => AppSync.getPlayerGameLog({ sport }).then(r => r?.rows || []) },
    pointLog:  { columns: POINT_LOG_CACHE_COLUMNS,  sheetOf: s => s.pointLogSheet,  fetch: s => AppSync.getPointLog(s.pointLogSheet) },
    playerLog: { columns: PLAYER_LOG_CACHE_COLUMNS, sheetOf: s => s.playerLogSheet, fetch: s => AppSync.getPlayerLog(s.playerLogSheet) },
    latestDeltas:    { mode: 'raw', sheetOf: s => s.playerLogSheet, fetch: s => AppSync.getLatestDeltas(s.playerLogSheet) },
    // cumulativeBonus 는 풋살 진입 경로만 호출하지만, 양쪽에 등록해 어댑터 표를 단순하게 둔다.
    cumulativeBonus: { mode: 'raw', sheetOf: s => s.playerLogSheet, fetch: s => AppSync.getCumulativeBonus(s.playerLogSheet) },
  };
}
```

`ADAPTERS` 에 두 종목을 더한다:

```js
const ADAPTERS = {
  '테니스': { /* 기존 3종 그대로 */ },
  '풋살': soccerLikeAdapters('풋살'),
  '축구': soccerLikeAdapters('축구'),
};
```

- [ ] **Step 6: mode/sheetName 배선**

`_ctx()` 가 설정도 함께 주도록 바꾼다:

```js
function _ctx() {
  const a = AuthUtil.getStored();
  const team = a?.team || '';
  const sport = a?.mode || '';
  return { team, sport, settings: getEffectiveSettings(team, sport) || {} };
}
```

노드를 만드는 두 지점(`get` 의 미스 경로, `_fetchAndStore`)을 공통 헬퍼로 묶는다:

```js
// 어댑터가 선언한 모드로 저장 노드를 만든다. sheetOf 가 있으면 sheetName 도 남긴다.
function _encodeNode(adapter, value, settings) {
  const mode = adapter.mode || 'rows';
  const body = mode === 'raw' ? encodeRaw(value) : encodeRows(adapter.columns, value);
  const sheetName = adapter.sheetOf ? adapter.sheetOf(settings) : undefined;
  return sheetName === undefined ? body : { ...body, sheetName };
}

function _readOpts(adapter, settings) {
  const opts = { mode: adapter.mode || 'rows', columns: adapter.columns };
  if (adapter.sheetOf) opts.sheetName = adapter.sheetOf(settings);
  return opts;
}
```

`get()` 안에서:
- `adapter.fetch()` → `adapter.fetch(settings)`
- `readCacheNode(snap.val(), { columns: adapter.columns }, ...)` → `readCacheNode(snap.val(), _readOpts(adapter, settings), ...)`
- 저장은 `set(ref(firebaseDb, path), { ..._encodeNode(adapter, rows, settings), version: serverTimestamp() })`
- `shouldStore(rows)` → `shouldStoreValue(rows, adapter.mode || 'rows')` (L2 저장 판정과 L1 저장 판정 **둘 다**)
- **반환 변수명이 `rows` 지만 raw 모드에서는 맵이 담긴다.** 주석으로 명시할 것.

`_fetchAndStore` 도 같은 방식으로:

```js
async function _fetchAndStore(adapter, path, settings) {
  const value = (await adapter.fetch(settings)) || (adapter.mode === 'raw' ? null : []);
  if (!shouldStoreValue(value, adapter.mode || 'rows')) {
    throw new Error('재적재가 빈 결과를 받음 — 강등 대상');
  }
  await set(ref(firebaseDb, path), {
    ..._encodeNode(adapter, value, settings),
    version: serverTimestamp(),
  });
  return value;
}
```

`refresh()` 는 `_fetchAndStore(adapter, path, settings)` 로 호출하고, `refreshAll` 의
`count: rows.length` 를 raw 안전하게 바꾼다:

```js
      const { ok, rows } = await this.refresh(dataset);
      out.push({ dataset, ok, count: Array.isArray(rows) ? rows.length : Object.keys(rows || {}).length });
```

- [ ] **Step 7: 통과 확인**

Run: `npx vitest run src/services/__tests__/sheetCache.test.js`
Expected: PASS — 기존 테니스 테스트 + 새 풋살·축구 테스트 전부

- [ ] **Step 8: 전체 회귀**

Run: `npm test && npm run build`
Expected: 전부 PASS. **아직 호출부를 전환하지 않았으므로 앱 동작 변화는 0이다.**

- [ ] **Step 9: 커밋**

```bash
git add src/utils/soccerCacheColumns.js src/services/sheetCache.js src/services/__tests__/sheetCache.test.js
git commit -m "feat: 시트 캐시에 풋살·축구 어댑터 7종 등록

로그 3종(matchLog/eventLog/playerGameLog)은 기존 RAW_*_COLUMNS 를 그대로 쓴다 —
클라 미러가 서버 헤더와 완전히 일치함을 확인해 새 드리프트 원천을 만들지 않았다.
pointLog/playerLog 는 서버 응답 키를 미러하는 상수를 새로 정의했다.
맵 2종은 raw 모드.

아직 호출부를 전환하지 않아 앱 동작 변화는 없다."
```

---

## Task 3: 읽기 경로 전환

여기서 체감 개선이 나온다. `TeamDashboard` 한 번 마운트에 `getPlayerLog` 가 두 번
나가는데(본체 + 내부 `DualTeamTab`) in-flight 중복 제거가 이를 1회로 합친다.

**Files:**
- Modify: `src/components/dashboard/TeamDashboard.jsx`
- Modify: `src/components/dashboard/analytics/DualTeamTab.jsx`
- Modify: `src/components/dashboard/analytics/RecentFormTop3.jsx`
- Modify: `src/components/dashboard/analytics/DefenseTopCards.jsx`
- Modify: `src/components/dashboard/PlayerAnalytics.jsx`
- Modify: `src/App.jsx`
- Test: 각 컴포넌트의 기존 테스트 파일(있는 것만)

**Interfaces:**
- Consumes: `SheetCache.get(dataset)` — 로그 3종은 **배열**(`{rows}` 래퍼 아님), 맵 2종은 **객체**
- Produces: 없음

- [ ] **Step 1: 각 호출부의 현재 사용 형태를 확인**

Run: `grep -n "getMatchLog\|getEventLog\|getPlayerGameLog\|getPointLog\|getPlayerLog\|getLatestDeltas\|getCumulativeBonus" src/components/dashboard/TeamDashboard.jsx src/components/dashboard/PlayerAnalytics.jsx src/components/dashboard/analytics/*.jsx src/App.jsx`

각 호출의 **반환값 사용 방식**(`.rows` 접근 여부, `.then` 체인)을 적어두고 전환할 것.
`getMatchLog`/`getEventLog`/`getPlayerGameLog` 는 지금 `{rows}` 를 받아 `.rows` 로 꺼내
쓰거나 `.catch(() => ({ rows: [] }))` 로 폴백한다 — **캐시는 배열을 주므로 `.rows` 를 없애고
`.catch(() => [])` 로 바꾼다.**

- [ ] **Step 2: 테스트 모킹을 먼저 바꿔 실패시킨다**

전환 대상 컴포넌트의 기존 테스트가 `vi.mock('.../appSync', ...)` 로 모킹하고 있으면,
컴포넌트가 `SheetCache` 를 쓰는 순간 그 모킹이 무력화되어 **실물 모듈이 로드되고 테스트가
빈 데이터로 조용히 통과**한다. 모킹 대상을 `sheetCache` 로 교체한다:

```js
vi.mock('../../../services/sheetCache', () => ({
  default: {
    get: (dataset) => Promise.resolve(
      dataset === 'playerLog' ? PLAYER_LOG
      : dataset === 'matchLog' ? MATCH_LOG
      : dataset === 'latestDeltas' ? {}
      : []
    ),
  },
}));
```

(상대경로는 테스트 파일 위치에 맞출 것. 픽스처 변수명은 각 파일의 기존 것을 쓴다.)

- [ ] **Step 3: 실패 확인**

Run: `npm test`
Expected: 모킹을 바꾼 파일이 FAIL — 컴포넌트가 아직 `AppSync` 를 호출한다

- [ ] **Step 4: `TeamDashboard` 전환**

import 추가:

```js
import SheetCache from '../../services/sheetCache';
```

3개 호출을 바꾼다(`AppSync` import 는 다른 용도가 남아 있는지 grep 으로 확인 후 판단):

```js
      SheetCache.get('latestDeltas').then(deltas => {
      SheetCache.get('playerLog').then(plog => {
      SheetCache.get('pointLog').then(events => {
```

`getRankingHistory` 는 **그대로 둔다**(동적 인자, 캐시 대상 아님).

- [ ] **Step 5: 내부 3개 컴포넌트 전환**

`DualTeamTab.jsx`:
```js
      SheetCache.get('playerLog').catch(() => []),
```

`RecentFormTop3.jsx`:
```js
    SheetCache.get('playerGameLog')
```
(`{ sport: activeSport }` 인자를 제거한다 — 캐시가 `AuthUtil` 의 종목으로 판단한다.
`activeSport` 가 다른 용도로 쓰이면 남길 것.)

`DefenseTopCards.jsx`:
```js
    SheetCache.get('matchLog')
```
이어지는 `.rows` 접근을 배열 직접 사용으로 바꾼다.

- [ ] **Step 6: `PlayerAnalytics` 전환**

```js
      SheetCache.get('matchLog').catch(() => []),
      SheetCache.get('eventLog').catch(() => []),
      SheetCache.get('playerGameLog').catch(() => []),
```
`fetchSheetData()` 는 **그대로 둔다**(CSV, 캐시 대상 아님).
이어지는 `.rows` 접근을 전부 배열 직접 사용으로 바꾼다.

- [ ] **Step 7: `App.jsx` 전환**

```js
        ? SheetCache.get('cumulativeBonus').catch(() => ({ crova: {}, goguma: {} }))
```
두 곳(77~79행, 93~95행 부근) 모두. `fetchSheetData` / `fetchAttendanceData` 는 그대로 둔다.

- [ ] **Step 8: 통과 확인 + 잔재 검사**

Run: `npm test && npm run build && npm run lint`
Expected: 전부 PASS, 변경 파일 lint 0 errors

Run:
```bash
grep -n "AppSync.getMatchLog\|AppSync.getEventLog\|AppSync.getPlayerGameLog\|AppSync.getPointLog\|AppSync.getPlayerLog\|AppSync.getLatestDeltas\|AppSync.getCumulativeBonus" src/components src/App.jsx -r
```
Expected: 출력 없음 (`src/utils/recoverFinalizedFromSheets.js` 는 검사 대상에서 제외 — 의도적으로 남긴다)

Run: `grep -n "\.rows" src/components/dashboard/PlayerAnalytics.jsx src/components/dashboard/analytics/DefenseTopCards.jsx`
Expected: 캐시에서 온 값에 대한 `.rows` 접근이 남아 있지 않을 것

- [ ] **Step 9: diff 정독**

Run: `git diff`

이 저장소는 jsx 변경의 렌더 크래시(선언 순서/TDZ)를 build/vitest 가 놓친 이력이 있다.
`SheetCache` import 가 사용처보다 위에 있는지, `useEffect` 의 의존성 배열과 cleanup(`alive`)이
보존됐는지, 괄호 균형이 맞는지 **직접 눈으로 확인**할 것.

- [ ] **Step 10: 커밋**

```bash
git add src/components/dashboard src/App.jsx
git commit -m "feat: 풋살·축구 읽기 경로를 SheetCache 로 전환

TeamDashboard 한 번 마운트에 Apps Script 5~6회(내부 DualTeamTab/RecentFormTop3/
DefenseTopCards 포함), PlayerAnalytics 3회가 나갔다. 캐시 히트 시 0회가 된다.
getPlayerLog 는 TeamDashboard 본체와 DualTeamTab 이 중복 호출하는데
in-flight 중복 제거가 1회로 합친다.

로그 3종은 {rows} 래퍼 대신 배열을 받도록 호출부를 바꿨다.
대시보드·참석명단 CSV와 recoverFinalizedFromSheets 는 그대로 둔다."
```

---

## Task 4: 무효화

**Files:**
- Modify: `src/App.jsx` (풋살 마감)
- Modify: `src/SoccerApp.jsx` (축구 마감)
- Modify: `src/components/tournament/TournamentMatchManager.jsx`
- Modify: `src/components/common/SettingsScreen.jsx`
- Create: `src/utils/refreshAfterFinalize.js`
- Test: `src/utils/__tests__/refreshAfterFinalize.test.js`

**Interfaces:**
- Consumes: `SheetCache.refresh(dataset)` → `Promise<{ ok, rows }>`, throw 하지 않음
- Produces: `refreshAfterFinalize(datasets: string[]): Promise<void>`

- [ ] **Step 1: 실패하는 테스트 작성**

`src/utils/__tests__/refreshAfterFinalize.test.js`:

```js
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({ refreshed: [], fail: new Set() }));

vi.mock('../../services/sheetCache', () => ({
  default: {
    refresh: (d) => {
      h.refreshed.push(d);
      if (h.fail.has(d)) return Promise.reject(new Error('boom'));
      return Promise.resolve({ ok: true, rows: [] });
    },
  },
}));

import { refreshAfterFinalize } from '../refreshAfterFinalize';

beforeEach(() => { h.refreshed.length = 0; h.fail.clear(); });

describe('refreshAfterFinalize', () => {
  it('요청한 데이터셋을 모두 재적재한다', async () => {
    await refreshAfterFinalize(['matchLog', 'eventLog']);
    expect(h.refreshed.sort()).toEqual(['eventLog', 'matchLog']);
  });

  it('병렬로 실행한다(순차 아님)', async () => {
    await refreshAfterFinalize(['a', 'b', 'c']);
    expect(h.refreshed).toEqual(['a', 'b', 'c']); // 모두 즉시 시작됨
  });

  // 캐시는 파생 데이터다. 재적재가 터져도 마감 성공을 되돌리면 안 된다.
  it('일부가 reject 해도 throw 하지 않는다', async () => {
    h.fail.add('eventLog');
    await expect(refreshAfterFinalize(['matchLog', 'eventLog'])).resolves.toBeUndefined();
  });

  it('빈 목록이면 아무것도 하지 않는다', async () => {
    await refreshAfterFinalize([]);
    expect(h.refreshed).toEqual([]);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/utils/__tests__/refreshAfterFinalize.test.js`
Expected: FAIL — `Failed to resolve import "../refreshAfterFinalize"`

- [ ] **Step 3: 구현**

`src/utils/refreshAfterFinalize.js`:

```js
// 시트 쓰기 직후 캐시 재적재. 순차로 돌리면 데이터셋 수 × 콜드스타트라
// 마감 대기가 길어진다 — 병렬로 한 번에 보낸다.
//
// 캐시는 파생 데이터다. 어떤 실패도 마감/전송의 성공을 되돌리지 않는다.
// SheetCache.refresh 는 이미 내부에서 강등 처리하고 throw 하지 않지만,
// 계약이 바뀌어도 마감이 깨지지 않도록 여기서도 삼킨다.
import SheetCache from '../services/sheetCache';

export async function refreshAfterFinalize(datasets) {
  const list = Array.isArray(datasets) ? datasets : [];
  if (list.length === 0) return;
  await Promise.all(list.map(d =>
    SheetCache.refresh(d).catch(e => {
      console.warn(`[sheetCache] ${d} 마감 후 재적재 실패:`, e?.message);
      return null;
    })
  ));
}

// 마감이 건드리는 5개 시트가 캐시 7종 전부를 낡게 만든다
// (맵 2종도 선수별집계 시트에서 파생된다).
export const FINALIZE_DATASETS = [
  'matchLog', 'eventLog', 'playerGameLog', 'pointLog', 'playerLog',
  'latestDeltas', 'cumulativeBonus',
];

// 대회 기록은 로그_이벤트·로그_선수경기에만 쓴다.
export const TOURNAMENT_DATASETS = ['eventLog', 'playerGameLog'];
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run src/utils/__tests__/refreshAfterFinalize.test.js`
Expected: PASS (4 tests)

- [ ] **Step 5: 마감 경로 배선**

`src/App.jsx` — 5개 시트 전송(`742~746행` 부근)이 **전부 성공한 뒤** 호출한다.
기존 성공/실패 판정 로직을 찾아 그 성공 분기에 추가할 것:

```js
import { refreshAfterFinalize, FINALIZE_DATASETS } from './utils/refreshAfterFinalize';
// ...
await refreshAfterFinalize(FINALIZE_DATASETS);
```

`src/SoccerApp.jsx` — `272~276행` 부근에 동일하게. import 경로는 `./utils/refreshAfterFinalize`.

**전송이 하나라도 실패하면 재적재하지 않는다**(기존 "미확정 유지" 규칙과 같은 분기).

- [ ] **Step 6: 대회·재전송 도구 배선**

`src/components/tournament/TournamentMatchManager.jsx` — `writeRawEvents` / `writeRawPlayerGames`
성공 후:

```js
import { refreshAfterFinalize, TOURNAMENT_DATASETS } from '../../utils/refreshAfterFinalize';
// ...
await refreshAfterFinalize(TOURNAMENT_DATASETS);
```

`src/components/common/SettingsScreen.jsx` — `writeMatchLog` 배치 루프가 **전부 끝난 뒤 1회**:

```js
await refreshAfterFinalize(['matchLog']);
```

(루프 안에서 부르면 배치마다 전량 재조회가 돈다.)

- [ ] **Step 7: 전체 회귀 + diff 정독**

Run: `npm test && npm run build && npm run lint`
Expected: 전부 PASS

Run: `git diff`
마감 성공/실패 분기가 보존됐는지, 재적재가 실패 분기에서 호출되지 않는지 확인할 것.

- [ ] **Step 8: 커밋**

```bash
git add src/utils/refreshAfterFinalize.js src/utils/__tests__/refreshAfterFinalize.test.js src/App.jsx src/SoccerApp.jsx src/components/tournament/TournamentMatchManager.jsx src/components/common/SettingsScreen.jsx
git commit -m "feat: 풋살·축구 쓰기 경로 후 캐시 재적재

마감이 5개 시트에 쓰므로 캐시 7종 전부가 낡는다(맵 2종도 선수별집계 시트 파생).
순차면 7 × 콜드스타트라 병렬로 보낸다.

대회 기록 전송은 로그_이벤트·로그_선수경기 2종, 설정의 로그_매치 재전송은
matchLog 1종만 무효화한다(배치 루프가 끝난 뒤 1회).

캐시 실패는 마감 성공을 되돌리지 않는다."
```

---

## Task 5: 수동 동기화 라벨

설정의 동기화 버튼은 `SheetCache.datasetsOf(sport)` 로 동작하므로 풋살·축구에서 **자동으로
켜진다.** 표시 이름만 없어서 데이터셋 키가 그대로 노출된다.

**Files:**
- Modify: `src/components/common/syncStatusText.js`
- Test: `src/components/common/__tests__/settingsSyncBlock.test.jsx`

**Interfaces:**
- Consumes: 없음
- Produces: 없음

- [ ] **Step 1: 실패하는 테스트 작성**

`src/components/common/__tests__/settingsSyncBlock.test.jsx` 끝에 추가:

```js
describe('풋살·축구 데이터셋 라벨', () => {
  const NOW4 = Date.parse('2026-09-09T10:00:00+09:00');
  it('7종 모두 한글 이름으로 표시된다', () => {
    const entries = [
      ['matchLog', 3], ['eventLog', 5], ['playerGameLog', 7], ['pointLog', 11],
      ['playerLog', 13], ['latestDeltas', 17], ['cumulativeBonus', 19],
    ].map(([dataset, count]) => ({ dataset, version: NOW4 - 60_000, count }));
    const s = formatSyncStatus(entries, NOW4);
    for (const label of ['매치', '이벤트', '선수경기', '포인트로그', '선수집계', '최근증감', '누적보너스']) {
      expect(s).toContain(label);
    }
    expect(s).not.toContain('matchLog');
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/components/common/__tests__/settingsSyncBlock.test.jsx`
Expected: FAIL — `matchLog` 가 그대로 출력됨

- [ ] **Step 3: 구현**

`src/components/common/syncStatusText.js` 의 `DATASET_LABELS` 를 교체한다:

```js
const DATASET_LABELS = {
  // 테니스
  roster: '명부', playerGames: '선수경기', legacy: '레거시',
  // 풋살·축구
  matchLog: '매치', eventLog: '이벤트', playerGameLog: '선수경기',
  pointLog: '포인트로그', playerLog: '선수집계',
  latestDeltas: '최근증감', cumulativeBonus: '누적보너스',
};
```

> `playerGames`(테니스)와 `playerGameLog`(풋살·축구)는 라벨이 겹치지만 한 화면에 함께
> 뜨지 않는다 — `datasetsOf(sport)` 가 한 종목의 데이터셋만 돌려준다.

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run src/components/common/__tests__/settingsSyncBlock.test.jsx`
Expected: PASS

- [ ] **Step 5: 전체 회귀 + 커밋**

Run: `npm test && npm run build && npm run lint`

```bash
git add src/components/common/syncStatusText.js src/components/common/__tests__/settingsSyncBlock.test.jsx
git commit -m "feat: 수동 동기화 표시에 풋살·축구 데이터셋 라벨 추가

설정의 동기화 버튼은 datasetsOf(sport) 로 동작해 풋살·축구에서 자동으로
켜지는데, 라벨이 없어 데이터셋 키가 그대로 노출되고 있었다."
```

---

## Self-Review 결과

**Spec coverage:**

| 스펙 절 | 담당 Task |
|---|---|
| §1 목표 | Task 3 (읽기 전환) |
| §2 캐시 제외 대상 | Task 3 Step 6·7 (CSV·recover 미변경), Task 2 (getRankingHistory 미등록) |
| §3 저장 모드 2종 | Task 1 |
| §4.1 로그 3종 기존 상수 재사용 | Task 2 Step 5 |
| §4.2 시트명 가드 + 새 컬럼 상수 | Task 1(가드) + Task 2 Step 1·4(상수·검증) |
| §4.3 어댑터 표 | Task 2 Step 5 |
| §5 맵 파생 미채택 | 계획에 포함하지 않음(의도) |
| §6 호출부 변경 | Task 3 |
| §7 무효화 | Task 4 |
| §8 수동 동기화 UI | Task 5 |
| §9 용량 | 배포 후 확인 항목(§아래) |
| §10 테스트 1~10 | Task 1(1~5), Task 2(6~7), Task 3(8~9), Task 4(10) |
| §11 적용 순서 | Task 1~5 순서가 곧 배포 단계 |
| §12 롤백 | 기존 `DISABLED` — Task 2 Step 6에서 `refresh`/`status` 가드 유지 확인 |

누락 없음.

**Placeholder scan:** "TBD" / "적절히" / "Task N과 유사" 없음. 모든 코드 스텝에 실제 코드가 있다.
Task 3 은 파일마다 기존 코드 형태가 달라 grep 으로 먼저 확인하는 스텝(Step 1)을 두었고,
바꿀 코드 조각은 전부 명시했다.

**Type consistency:** `readCacheNode(node, opts, ttlMs, now)` 시그니처가 Task 1 정의와
Task 2 사용처에서 일치. `encodeRaw(value) → {data}` / `shouldStoreValue(value, mode)` 동일.
어댑터 필드명 `mode`/`columns`/`sheetOf`/`fetch` 가 Task 2 정의·커버리지 테스트·`_encodeNode`/
`_readOpts` 에서 일치. `SheetCache.refresh` → `{ ok, rows }` 가 Task 4 에서 일치.
`FINALIZE_DATASETS` / `TOURNAMENT_DATASETS` 이름이 Task 4 정의와 사용처에서 일치.

## 배포 후 유저 확인 항목

- 마스터FC(풋살) 진입 시 총 다운로드 ≈860 KB — 테니스(635 KB)보다 크다. **모바일 체감 확인**
- DevTools Network 에서 대시보드·분석 탭의 Apps Script 요청 0건
- 마감 1회 실행 후 대시보드 수치가 즉시 갱신되는지
