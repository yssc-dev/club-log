# 마스터스컵 1단계 — 격리 게이트 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 컵 세션(`tournamentId`가 있는 풋살 세션)이 마감돼도 마스터FC 정규 포인트·★ 랭킹·분석탭이 절대 오염되지 않는 게이트를 UI 없이 먼저 배포한다.

**Architecture:** 세션 state에 `tournamentId` 문자열 하나를 추가하고(META 동기화), 판별·태그는 `isCupSession`/`logTagsOf` 단일 헬퍼로만 한다. 읽기 차단은 SheetCache 풋살 어댑터의 `rowFilter`(반환 시점 필터, L1/L2에는 전체 행 저장) + 복구 유틸 필터. 쓰기 분리는 `handleFinalize`의 컵 분기(로그 3종만, 정규 분기는 else로 무수정)와 설정 화면 재기록 도구의 태그를 같은 헬퍼로 통일. 이 단계에서는 `tournamentId`를 채우는 UI가 없으므로 배포해도 동작 변화가 없다.

**Tech Stack:** React 18 + Vite, vitest(jsdom), Firebase RTDB(테스트에서는 vi.mock), Google Apps Script(변경 없음).

**Spec:** `docs/superpowers/specs/2026-09-16-masters-cup-design.md` — §3(용어), §4.1(state), §4.4(태그), §4.6(캐시 rowFilter), §5(격리), §6.5(마감), §10 불변식 1·2(정규 필터)·3·4·8·9·10, §11 1단계.

## Global Constraints

- 하버FC·빅마스터FC(축구)·몽피스(테니스) 동작 변화 0. 축구 어댑터에는 rowFilter를 넣지 않는다(스펙 §4.6).
- 정규 세션 마감 경로(포인트로그 → 선수별집계 → 로그_이벤트 → 로그_선수경기 → 로그_매치, legacyOk/rawFailed 판정)는 else 분기에 그대로 둔다. 값이 같은 표현식 치환(`mode:'기본'` → `logTagsOf` 결과) 외에 정규 분기 로직을 바꾸지 않는다(스펙 §6.5).
- 로그 태그 값: 정규 `{ mode:'기본', tournamentId:'' }`, 컵 `{ mode:'대회', tournamentId: state.tournamentId }` (스펙 §3·§4.4).
- 새 state 필드는 firebaseSyncDiff 4범주 중 하나에 반드시 분류(`syncCoverage` 테스트). `tournamentId`는 `META_FIELDS`.
- 자식 컴포넌트 `useState(prop)` 금지, 골 이벤트 dedupe 금지(이 단계에서 이벤트 생성 로직은 건드리지 않는다).
- Apps Script(`apps-script/Code.js`)·Firebase 규칙·`src/utils/analyticsV2/*`·`src/utils/soccerAnalytics/*`·`src/utils/intraSoccer/*` 수정 금지.
- 시트는 실제 이름으로 부른다: 마스터FC 포인트 로그 / 마스터FC 선수별집계기록 로그 / 로그_이벤트 / 로그_선수경기 / 로그_매치.
- 커밋 메시지는 한국어 `feat:`/`test:`/`refactor:` 접두 + 아래 트레일러 두 줄:
  ```
  Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01AqpBTxNBiezjumZN5AzJ6D
  ```
- 테스트 실행: `npx vitest run <파일>` (단일), `npm test` (전체). 빌드 `npm run build`, 린트 `npm run lint`.
- 이 계획의 범위 밖(2단계 이후): 설정 키 `cupName`/`cupRosterSheet`, 컵 버튼·탭, 명단 로더, cup 뷰(alias) 데이터셋, 순위표. alias 어댑터 메커니즘은 3단계에서 cup 뷰 등록과 함께 구현한다(등록 대상이 없으면 테스트할 수 없다).

---

## File Structure

| 파일 | 책임 |
|---|---|
| `src/utils/cup/cupSession.js` (신규) | `isCupSession(state)`, `logTagsOf(state)` — 컵 판별·태그 단일 소스 |
| `src/utils/cup/finalizeWrites.js` (신규) | `selectFinalizeWrites(isCup)` — 마감 시 전송 시트 목록(순수) |
| `src/utils/finalizedRows.js` (신규) | `rowsForFinalizedSession(...)` — 확정 세션 1건 → 로그_매치 rows(태그는 `logTagsOf`) |
| `src/services/finalizedSummary.js` (신규) | `buildFinalizedSummary(gameId, state)` — 아카이브 목록 요약(🏆 파트 포함). `firebaseSync.js`의 `_buildSummary`를 옮긴 것 |
| `src/hooks/useGameReducer.js` | `initialState.tournamentId`, RESTORE_STATE 복원 |
| `src/services/firebaseSyncDiff.js` | `META_FIELDS`에 `tournamentId`, `reconstructState` 기본값 |
| `src/services/firebaseSync.js` | `_buildSummary` 제거 → `buildFinalizedSummary` 사용 |
| `src/utils/rawLogBuilders.js` | 풋살 빌더 2개에 `mode`/`tournamentId` 선택 인자 |
| `src/utils/refreshAfterFinalize.js` | `CUP_FINALIZE_DATASETS` 상수 |
| `src/services/sheetCache.js` | 어댑터 `rowFilter` 옵션, `get()` 세 반환 지점·`refresh()` 반환에 필터 적용, 풋살 로그 3종에 `!tournament_id` 필터 |
| `src/utils/recoverFinalizedFromSheets.js` | `!tournament_id` 필터 |
| `src/components/common/SettingsScreen.jsx` | 로그_매치 재기록 도구가 `rowsForFinalizedSession` 사용 |
| `src/App.jsx` | `handleFinalize` 컵 분기(로그 3종만, `refreshDatasets(CUP_FINALIZE_DATASETS)`), 빌더 호출에 `logTagsOf` |
| 테스트(신규) | `src/utils/__tests__/cupSession.test.js`, `finalizeWrites.test.js`, `finalizedRows.test.js`, `recoverFinalizedFromSheets.test.js`; `src/services/__tests__/finalizedSummary.test.js`, `sheetCache.rowFilter.test.js`, `logReaders.guard.test.js`; `src/hooks/__tests__/useGameReducer.cupRoundTrip.test.js` |
| 테스트(수정) | `src/services/__tests__/firebaseSyncDiff.test.js`, `src/utils/__tests__/rawLogBuilders.test.js`, `src/utils/__tests__/refreshAfterFinalize.test.js` |

---

### Task 1: 컵 판별·태그 헬퍼 `cupSession.js`

**Files:**
- Create: `src/utils/cup/cupSession.js`
- Test: `src/utils/__tests__/cupSession.test.js`

**Interfaces:**
- Produces: `isCupSession(state: object|null|undefined): boolean` — `state.tournamentId`가 비어 있지 않은 문자열일 때만 true.
- Produces: `logTagsOf(state): { mode: '기본'|'대회', tournamentId: string }`.

- [ ] **Step 1: Write the failing test**

```js
// src/utils/__tests__/cupSession.test.js
import { describe, it, expect } from 'vitest';
import { isCupSession, logTagsOf } from '../cup/cupSession';

describe('isCupSession', () => {
  it('tournamentId 가 비어 있지 않은 문자열이면 컵 세션', () => {
    expect(isCupSession({ tournamentId: '마스터스컵 2026' })).toBe(true);
  });
  it("''·undefined·null·비문자열은 정규 세션", () => {
    expect(isCupSession({ tournamentId: '' })).toBe(false);
    expect(isCupSession({})).toBe(false);
    expect(isCupSession({ tournamentId: null })).toBe(false);
    expect(isCupSession({ tournamentId: 7 })).toBe(false);
    expect(isCupSession(null)).toBe(false);
    expect(isCupSession(undefined)).toBe(false);
  });
});

describe('logTagsOf', () => {
  it('정규 세션은 mode=기본, tournamentId 빈 문자열', () => {
    expect(logTagsOf({ tournamentId: '' })).toEqual({ mode: '기본', tournamentId: '' });
    expect(logTagsOf({})).toEqual({ mode: '기본', tournamentId: '' });
  });
  it('컵 세션은 mode=대회, tournamentId 그대로', () => {
    expect(logTagsOf({ tournamentId: '마스터스컵 2026' })).toEqual({ mode: '대회', tournamentId: '마스터스컵 2026' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/__tests__/cupSession.test.js`
Expected: FAIL — `Failed to resolve import "../cup/cupSession"`

- [ ] **Step 3: Write minimal implementation**

```js
// src/utils/cup/cupSession.js
// 컵 세션 판별과 로그 태그의 단일 소스 — 스펙 §3.
// 컵 여부는 오직 state.tournamentId 로 판별한다(Root 의 gameMode 는 신규 진입 시점에만 존재하고
// 저장되지 않으므로 재접속·이어서 기록 후에는 이 필드만 남는다 — 스펙 §4.1).
export function isCupSession(state) {
  const id = state?.tournamentId;
  return typeof id === 'string' && id !== '';
}

// 로그_이벤트·로그_선수경기·로그_매치 행의 mode/tournament_id 값 — 스펙 §4.4.
// 마감(App.jsx)과 설정 화면의 로그_매치 재기록 도구가 반드시 이 함수를 쓴다(스펙 §5 우회 경로 차단).
export function logTagsOf(state) {
  return isCupSession(state)
    ? { mode: '대회', tournamentId: state.tournamentId }
    : { mode: '기본', tournamentId: '' };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/__tests__/cupSession.test.js`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/utils/cup/cupSession.js src/utils/__tests__/cupSession.test.js
git commit -m "feat(cup): 컵 세션 판별·로그 태그 단일 헬퍼 isCupSession/logTagsOf (스펙 §3)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01AqpBTxNBiezjumZN5AzJ6D"
```

---

### Task 2: `tournamentId` state 필드 — 초기값·META 동기화·복원

**Files:**
- Modify: `src/hooks/useGameReducer.js:63` (initialState 끝, `settingsSnapshot: null,` 다음) and `:285` (RESTORE_STATE, `if (s.settingsSnapshot != null) ...` 다음)
- Modify: `src/services/firebaseSyncDiff.js:4-10` (META_FIELDS), `:366` (reconstructState, `season: meta.season ?? null,` 다음)
- Test: `src/services/__tests__/firebaseSyncDiff.test.js` (케이스 추가), `src/hooks/__tests__/useGameReducer.cupRoundTrip.test.js` (신규)
- 기존 가드: `src/services/__tests__/syncCoverage.test.js` (수정 없음, 통과해야 함)

**Interfaces:**
- Consumes: `isCupSession` (Task 1).
- Produces: `initialState.tournamentId === ''`; `META_FIELDS`에 `'tournamentId'`; `reconstructState(gameId, raw).tournamentId` (없으면 `''`); `RESTORE_STATE`가 `state.tournamentId`를 복원.

- [ ] **Step 1: Write the failing tests**

`src/services/__tests__/firebaseSyncDiff.test.js`의 `describe('reconstructState', ...)` 블록 안, 마지막 `it` 뒤에 추가:

```js
  it('meta.tournamentId 가 없으면 빈 문자열, 있으면 그대로 (스펙 §4.1)', () => {
    expect(reconstructState('g_1', {}).tournamentId).toBe('');
    expect(reconstructState('g_1', { meta: { tournamentId: '마스터스컵 2026' } }).tournamentId).toBe('마스터스컵 2026');
  });
```

같은 파일 `describe('diffStateToWrites', ...)` 블록 안, 마지막 `it` 뒤에 추가:

```js
  it('tournamentId 변경은 meta/tournamentId 단일 path (META 분류)', () => {
    const prev = { tournamentId: '' };
    const next = { tournamentId: '마스터스컵 2026' };
    expect(diffStateToWrites(prev, next)).toEqual({ 'meta/tournamentId': '마스터스컵 2026' });
  });
```

신규 파일:

```js
// src/hooks/__tests__/useGameReducer.cupRoundTrip.test.js
// 스펙 §4.1 왕복 테스트 — RTDB meta → reconstructState → RESTORE_STATE 를 거쳐도 컵 판별이 유지돼야
// 재접속 후 정규 마감 경로로 흘러가 포인트 로그가 오염되는 사고가 없다.
import { describe, it, expect } from 'vitest';
import { gameReducer, initialState } from '../useGameReducer';
import { reconstructState } from '../../services/firebaseSyncDiff';
import { isCupSession } from '../../utils/cup/cupSession';

describe('tournamentId 왕복 (reconstructState → RESTORE_STATE)', () => {
  it('initialState 는 정규 세션(빈 문자열)', () => {
    expect(initialState.tournamentId).toBe('');
    expect(isCupSession(initialState)).toBe(false);
  });

  it('meta.tournamentId 가 있으면 복원 후에도 컵 세션', () => {
    const raw = { meta: { phase: 'match', tournamentId: '마스터스컵 2026' } };
    const restored = gameReducer(initialState, { type: 'RESTORE_STATE', state: reconstructState('g_1', raw) });
    expect(restored.tournamentId).toBe('마스터스컵 2026');
    expect(isCupSession(restored)).toBe(true);
  });

  it('meta 에 tournamentId 가 없으면 정규 세션으로 복원', () => {
    const cupState = { ...initialState, tournamentId: '마스터스컵 2026' };
    const restored = gameReducer(cupState, { type: 'RESTORE_STATE', state: reconstructState('g_1', { meta: { phase: 'match' } }) });
    // reconstructState 가 '' 를 돌려주고 RESTORE_STATE 가 != null 로 받아들여 정규로 돌아간다
    expect(restored.tournamentId).toBe('');
    expect(isCupSession(restored)).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/services/__tests__/firebaseSyncDiff.test.js src/hooks/__tests__/useGameReducer.cupRoundTrip.test.js src/services/__tests__/syncCoverage.test.js`
Expected: 새 케이스 3~4개 FAIL (`tournamentId` undefined / `diffStateToWrites` 결과 `{}`). syncCoverage는 아직 PASS(필드가 없으므로).

- [ ] **Step 3: Implement**

`src/hooks/useGameReducer.js` — initialState의 `settingsSnapshot: null,` 바로 아래에 추가:

```js
  // 컵 세션 식별자(마스터스컵). 빈 문자열 = 정규 세션. META 동기화(firebaseSyncDiff.META_FIELDS).
  // 판별은 utils/cup/cupSession.isCupSession 만 쓴다 — 스펙 §4.1.
  tournamentId: "",
```

같은 파일 RESTORE_STATE, `if (s.settingsSnapshot != null) updates.settingsSnapshot = s.settingsSnapshot;` 바로 아래에 추가:

```js
      if (s.tournamentId != null) updates.tournamentId = s.tournamentId;
```

`src/services/firebaseSyncDiff.js` — `META_FIELDS` 배열의 `'sport', 'gameDate', 'season',` 다음 줄에 추가:

```js
  'tournamentId', // 컵 세션 식별자(스펙 §4.1) — 빈 문자열이면 정규 세션
```

같은 파일 `reconstructState`의 `season: meta.season ?? null,` 바로 아래에 추가:

```js
    // 컵 세션 식별자. 노드가 없으면(정규 세션·구버전) '' — RESTORE_STATE 의 != null 가드를 통과해야
    // 다른 탭이 컵→정규로 바뀐 것도 반영된다.
    tournamentId: meta.tournamentId ?? '',
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/services/__tests__/firebaseSyncDiff.test.js src/hooks/__tests__/useGameReducer.cupRoundTrip.test.js src/services/__tests__/syncCoverage.test.js src/hooks/__tests__`
Expected: 전부 PASS. syncCoverage의 "initialState 의 모든 필드는 4분류 중 하나" 통과(META에 들어갔으므로).

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useGameReducer.js src/services/firebaseSyncDiff.js src/services/__tests__/firebaseSyncDiff.test.js src/hooks/__tests__/useGameReducer.cupRoundTrip.test.js
git commit -m "feat(cup): 세션 state 에 tournamentId(META 동기화·복원·왕복 테스트) (스펙 §4.1)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01AqpBTxNBiezjumZN5AzJ6D"
```

---

### Task 3: 풋살 로그 빌더에 `mode`/`tournamentId` 선택 인자

**Files:**
- Modify: `src/utils/rawLogBuilders.js:26-30` (`buildRawEventsFromFutsal`), `:50-52` (`buildRawPlayerGamesFromFutsal`)
- Test: `src/utils/__tests__/rawLogBuilders.test.js` (케이스 추가)

**Interfaces:**
- Produces: `buildRawEventsFromFutsal({ team, gameId = '', events, mode = '기본', tournamentId = '' })`, `buildRawPlayerGamesFromFutsal({ team, inputTime, players, mode = '기본', tournamentId = '' })`. 인자를 안 넘기면 출력이 현재와 바이트 단위로 같다(불변식 4).

- [ ] **Step 1: Write the failing test**

`src/utils/__tests__/rawLogBuilders.test.js` 파일 끝에 추가:

```js
describe('풋살 빌더 컵 태그 (스펙 §4.4)', () => {
  const ev = { gameDate: '2026-09-20', matchId: 'R1_C0', myTeam: '팀A', opponentTeam: '팀B', scorer: '김철수', assist: '', inputTime: 't' };
  const pl = { gameDate: '2026-09-20', name: '김철수', playerTeam: '팀A', goals: 1 };

  it('인자 생략 시 mode=기본, tournament_id 빈 문자열(기존 동작)', () => {
    expect(buildRawEventsFromFutsal({ team: '마스터FC', events: [ev] })[0]).toMatchObject({ mode: '기본', tournament_id: '' });
    expect(buildRawPlayerGamesFromFutsal({ team: '마스터FC', inputTime: 't', players: [pl] })[0]).toMatchObject({ mode: '기본', tournament_id: '' });
  });

  it('mode/tournamentId 를 넘기면 두 행 모두에 반영된다', () => {
    const tags = { mode: '대회', tournamentId: '마스터스컵 2026' };
    expect(buildRawEventsFromFutsal({ team: '마스터FC', events: [ev], ...tags })[0]).toMatchObject({ mode: '대회', tournament_id: '마스터스컵 2026', sport: '풋살' });
    expect(buildRawPlayerGamesFromFutsal({ team: '마스터FC', inputTime: 't', players: [pl], ...tags })[0]).toMatchObject({ mode: '대회', tournament_id: '마스터스컵 2026', sport: '풋살' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/__tests__/rawLogBuilders.test.js`
Expected: 두 번째 케이스 FAIL (`mode` 가 `'기본'`으로 고정).

- [ ] **Step 3: Implement**

`src/utils/rawLogBuilders.js` — `buildRawEventsFromFutsal`:

```js
export function buildRawEventsFromFutsal({ team, gameId = '', events, mode = '기본', tournamentId = '' }) {
  const out = [];
  (events || []).forEach(e => {
    const common = {
      team, sport: '풋살', mode, tournament_id: tournamentId,
```
(나머지 본문은 그대로.)

`buildRawPlayerGamesFromFutsal`:

```js
export function buildRawPlayerGamesFromFutsal({ team, inputTime, players, mode = '기본', tournamentId = '' }) {
  return (players || []).map(p => ({
    team, sport: '풋살', mode, tournament_id: tournamentId,
```
(나머지 필드는 그대로.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/utils/__tests__/rawLogBuilders.test.js src/utils/__tests__/matchRowBuilder.test.js`
Expected: 전부 PASS(기존 케이스 포함).

- [ ] **Step 5: Commit**

```bash
git add src/utils/rawLogBuilders.js src/utils/__tests__/rawLogBuilders.test.js
git commit -m "feat(cup): 풋살 로그_이벤트·로그_선수경기 빌더에 mode/tournamentId 선택 인자 (기본값 = 기존 동작)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01AqpBTxNBiezjumZN5AzJ6D"
```

---

### Task 4: 마감 전송 목록 `selectFinalizeWrites` + `CUP_FINALIZE_DATASETS`

**Files:**
- Create: `src/utils/cup/finalizeWrites.js`
- Modify: `src/utils/refreshAfterFinalize.js` (파일 끝에 상수 추가)
- Test: `src/utils/__tests__/finalizeWrites.test.js` (신규), `src/utils/__tests__/refreshAfterFinalize.test.js` (케이스 추가)

**Interfaces:**
- Produces: `REGULAR_FINALIZE_WRITES = ['pointLog','playerLog','rawEvents','rawPlayerGames','matchLog']`, `CUP_FINALIZE_WRITES = ['rawEvents','rawPlayerGames','matchLog']`, `selectFinalizeWrites(isCup: boolean): string[]` (새 배열).
- Produces: `CUP_FINALIZE_DATASETS = ['matchLog','eventLog','playerGameLog']` (SheetCache 데이터셋 키).

- [ ] **Step 1: Write the failing tests**

```js
// src/utils/__tests__/finalizeWrites.test.js
// 스펙 §6.5 불변식 1 — 정규 마감은 5개 시트를 이 순서로, 컵 마감은 로그 3종만.
import { describe, it, expect } from 'vitest';
import { selectFinalizeWrites, REGULAR_FINALIZE_WRITES, CUP_FINALIZE_WRITES } from '../cup/finalizeWrites';

describe('selectFinalizeWrites', () => {
  it('정규: 포인트로그 → 선수별집계 → 로그_이벤트 → 로그_선수경기 → 로그_매치 (App.jsx allSettled 순서)', () => {
    expect(selectFinalizeWrites(false)).toEqual(['pointLog', 'playerLog', 'rawEvents', 'rawPlayerGames', 'matchLog']);
    expect(REGULAR_FINALIZE_WRITES).toEqual(['pointLog', 'playerLog', 'rawEvents', 'rawPlayerGames', 'matchLog']);
  });
  it('컵: 로그 3종만 — 포인트로그·선수별집계는 절대 포함하지 않는다', () => {
    const w = selectFinalizeWrites(true);
    expect(w).toEqual(['rawEvents', 'rawPlayerGames', 'matchLog']);
    expect(w).not.toContain('pointLog');
    expect(w).not.toContain('playerLog');
    expect(CUP_FINALIZE_WRITES).toEqual(w);
  });
  it('반환 배열은 호출마다 새 배열(호출부가 변형해도 상수가 안 바뀜)', () => {
    const a = selectFinalizeWrites(true); a.push('x');
    expect(selectFinalizeWrites(true)).toEqual(['rawEvents', 'rawPlayerGames', 'matchLog']);
  });
});
```

`src/utils/__tests__/refreshAfterFinalize.test.js` — import 줄을 다음으로 바꾸고:

```js
import { refreshAfterFinalize, refreshDatasets, TOURNAMENT_DATASETS, CUP_FINALIZE_DATASETS } from '../refreshAfterFinalize';
```

파일 끝에 추가:

```js
describe('CUP_FINALIZE_DATASETS (스펙 §4.6 불변식 10)', () => {
  it('컵 마감 재적재는 원본 로그 3종 키만 — 포인트로그·선수별집계·누적보너스·latestDeltas 제외', () => {
    expect(CUP_FINALIZE_DATASETS).toEqual(['matchLog', 'eventLog', 'playerGameLog']);
    for (const k of ['pointLog', 'playerLog', 'latestDeltas', 'cumulativeBonus']) {
      expect(CUP_FINALIZE_DATASETS).not.toContain(k);
    }
  });
  it('refreshDatasets(CUP_FINALIZE_DATASETS) 는 그 3개만 재적재한다', async () => {
    await refreshDatasets(CUP_FINALIZE_DATASETS, { sport: '풋살' });
    expect(h.refreshed.sort()).toEqual(['eventLog', 'matchLog', 'playerGameLog']);
    expect(new Set(h.sportsSeen)).toEqual(new Set(['풋살']));
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/utils/__tests__/finalizeWrites.test.js src/utils/__tests__/refreshAfterFinalize.test.js`
Expected: FAIL — 모듈 없음 / `CUP_FINALIZE_DATASETS` undefined.

- [ ] **Step 3: Implement**

```js
// src/utils/cup/finalizeWrites.js
// 마감 시 전송할 시트 목록 — 스펙 §6.5 불변식 1.
// 키는 App.jsx handleFinalize 의 AppSync 호출과 1:1 대응한다:
//   pointLog=마스터FC 포인트 로그, playerLog=마스터FC 선수별집계기록 로그,
//   rawEvents=로그_이벤트, rawPlayerGames=로그_선수경기, matchLog=로그_매치.
// 정규 순서는 handleFinalize 의 Promise.allSettled 순서와 같아야 한다(r1..r5 인덱스 판정).
export const REGULAR_FINALIZE_WRITES = ['pointLog', 'playerLog', 'rawEvents', 'rawPlayerGames', 'matchLog'];
// 컵은 포인트 계열 두 시트를 절대 쓰지 않는다(완전 분리 — 스펙 §1.1).
export const CUP_FINALIZE_WRITES = ['rawEvents', 'rawPlayerGames', 'matchLog'];

export function selectFinalizeWrites(isCup) {
  return isCup ? [...CUP_FINALIZE_WRITES] : [...REGULAR_FINALIZE_WRITES];
}
```

`src/utils/refreshAfterFinalize.js` 파일 끝에 추가:

```js
// 컵 마감(스펙 §4.6·§6.5): 로그 3종만 썼으므로 그 원본 캐시만 재적재한다. refreshAfterFinalize(전체)를
// 부르면 쓰지 않은 포인트로그·선수별집계·누적보너스·latestDeltas 가 빈 결과 강등으로 L2 에서 지워져
// 다음 정규 마감이 콜드스타트를 맞는다.
export const CUP_FINALIZE_DATASETS = ['matchLog', 'eventLog', 'playerGameLog'];
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/utils/__tests__/finalizeWrites.test.js src/utils/__tests__/refreshAfterFinalize.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/utils/cup/finalizeWrites.js src/utils/refreshAfterFinalize.js src/utils/__tests__/finalizeWrites.test.js src/utils/__tests__/refreshAfterFinalize.test.js
git commit -m "feat(cup): 마감 전송 목록 selectFinalizeWrites + 컵 재적재 데이터셋 상수 (스펙 §6.5·§4.6)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01AqpBTxNBiezjumZN5AzJ6D"
```

---

### Task 5: 아카이브 요약 `buildFinalizedSummary` (🏆 파트) — `_buildSummary` 분리

**Files:**
- Create: `src/services/finalizedSummary.js`
- Modify: `src/services/firebaseSync.js:3` (import), `:29-44` (`_buildSummary` 삭제), `:177` (호출 교체)
- Test: `src/services/__tests__/finalizedSummary.test.js`

**Interfaces:**
- Consumes: `isCupSession` (Task 1), `countFinishedSoccerMatches` (`src/utils/soccerScoring.js`, 기존).
- Produces: `buildFinalizedSummary(gameId, state): string` — 기존 `_buildSummary`와 동일한 5파트 문자열, 컵 세션이면 ` | 🏆 {tournamentId}` 6번째 파트 추가(`|`는 전각 `｜`로 치환).

- [ ] **Step 1: Write the failing test**

```js
// src/services/__tests__/finalizedSummary.test.js
// HistoryView 는 summary.split('|') 로 parts[1](작성자)·[3](이벤트)·[4](완료경기)를 읽는다 —
// 6번째 파트를 덧붙여도 앞 5개 인덱스가 그대로여야 한다(스펙 §6.5·§8).
import { describe, it, expect } from 'vitest';
import { buildFinalizedSummary } from '../finalizedSummary';

const parts = (s) => s.split('|').map(x => x.trim());

describe('buildFinalizedSummary', () => {
  it('정규 풋살: 5파트, 🏆 없음', () => {
    const s = buildFinalizedSummary('g_1', { gameCreator: '홍길동', phase: 'summary', allEvents: [{}, {}], completedMatches: [{}] });
    expect(s).toBe('g_1 | 홍길동 | summary | 이벤트 2건 | 완료 1경기');
    expect(parts(s)).toHaveLength(5);
  });
  it('컵 풋살: 앞 5파트 동일 + 6번째 🏆 대회명', () => {
    const s = buildFinalizedSummary('g_1', { gameCreator: '홍길동', phase: 'summary', allEvents: [], completedMatches: [], tournamentId: '마스터스컵 2026' });
    const p = parts(s);
    expect(p.slice(0, 5)).toEqual(['g_1', '홍길동', 'summary', '이벤트 0건', '완료 0경기']);
    expect(p[5]).toBe('🏆 마스터스컵 2026');
  });
  it('대회명의 | 는 전각으로 치환해 split 인덱스를 지킨다', () => {
    const s = buildFinalizedSummary('g_1', { phase: 'x', tournamentId: 'a|b' });
    expect(parts(s)).toHaveLength(6);
    expect(parts(s)[5]).toBe('🏆 a｜b');
  });
  it('축구: soccerMatches 기준 집계(기존 동작 유지)', () => {
    const s = buildFinalizedSummary('s_1', { lastEditor: '김', phase: 'match', soccerMatches: [{ status: 'finished', events: [{}, {}] }, { status: 'playing', events: [] }] });
    expect(s).toBe('s_1 | 김 | match | 이벤트 2건 | 완료 1경기');
  });
  it('테니스: 라운드·완료 코트 요약(기존 동작 유지)', () => {
    const s = buildFinalizedSummary('t_1', { sport: '테니스', gameCreator: '박', phase: 'summary', rounds: [{ courts: [{ status: 'done' }, { status: 'open' }] }] });
    expect(s).toBe('t_1 | 박 | summary | 1라운드 | 완료 1경기');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/services/__tests__/finalizedSummary.test.js`
Expected: FAIL — 모듈 없음.

- [ ] **Step 3: Implement**

```js
// src/services/finalizedSummary.js
// finalized/_meta 의 목록용 요약 문자열. firebaseSync._buildSummary 를 순수 함수로 분리(테스트 가능).
// HistoryView 가 '|' 로 split 해 parts[1]/[3]/[4] 를 읽으므로 파트 순서·개수를 바꾸지 않는다 —
// 컵은 6번째 파트를 "덧붙이기만" 한다(스펙 §6.5·§8).
import { countFinishedSoccerMatches } from '../utils/soccerScoring';
import { isCupSession } from '../utils/cup/cupSession';

export function buildFinalizedSummary(gameId, state) {
  const creator = state.gameCreator || state.lastEditor || '?';
  // 테니스: 이벤트/완료경기가 풋살 필드라 0이 되므로 라운드·완료 코트로 요약.
  if (state.sport === '테니스') {
    const rounds = state.rounds || [];
    const done = rounds.reduce((s, r) => s + (r.courts || []).filter(c => c.status === 'done').length, 0);
    return `${gameId} | ${creator} | ${state.phase || '?'} | ${rounds.length}라운드 | 완료 ${done}경기`;
  }
  const soccer = Array.isArray(state.soccerMatches) && state.soccerMatches.length > 0;
  const evtCount = soccer
    ? state.soccerMatches.reduce((s, m) => s + ((m.events || []).length), 0)
    : (state.allEvents || []).length;
  const matchCount = soccer
    ? countFinishedSoccerMatches(state.soccerMatches)
    : (state.completedMatches || []).length;
  const base = `${gameId} | ${creator} | ${state.phase || '?'} | 이벤트 ${evtCount}건 | 완료 ${matchCount}경기`;
  if (!isCupSession(state)) return base;
  // 설정 화면이 cupName 의 '|' 를 막지만(2단계), 여기서도 한 번 더 지킨다.
  return `${base} | 🏆 ${String(state.tournamentId).replace(/\|/g, '｜')}`;
}
```

`src/services/firebaseSync.js`:
1. 3행 `import { countFinishedSoccerMatches } from '../utils/soccerScoring';` 를 `import { buildFinalizedSummary } from './finalizedSummary';` 로 교체. (교체 전에 `grep -n countFinishedSoccerMatches src/services/firebaseSync.js` 로 `_buildSummary` 밖에 사용처가 없음을 확인한다. 있으면 import 를 지우지 말고 새 import 만 추가.)
2. `function _buildSummary(gameId, state) { ... }` 블록(29~44행) 전체 삭제.
3. 177행 `const summary = _buildSummary(gameId, state);` → `const summary = buildFinalizedSummary(gameId, state);`.

- [ ] **Step 4: Run tests + lint**

Run: `npx vitest run src/services/__tests__/finalizedSummary.test.js && npm run lint`
Expected: PASS, lint에 `_buildSummary`/`countFinishedSoccerMatches` 관련 경고 없음.

- [ ] **Step 5: Commit**

```bash
git add src/services/finalizedSummary.js src/services/firebaseSync.js src/services/__tests__/finalizedSummary.test.js
git commit -m "refactor(cup): 아카이브 요약을 buildFinalizedSummary 로 분리하고 컵 세션에 🏆 파트 추가

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01AqpBTxNBiezjumZN5AzJ6D"
```

---

### Task 6: SheetCache `rowFilter` — 풋살 로그 3종에서 컵 행 차단

**Files:**
- Modify: `src/services/sheetCache.js:46-50` (soccerLikeAdapters 로그 3종), `:126-128` 근처 (헬퍼 추가), `:182-249` (`get`), `:251-276` (`refresh`)
- Test: `src/services/__tests__/sheetCache.rowFilter.test.js` (신규), `src/services/__tests__/sheetCache.test.js` (커버리지 케이스 1줄 추가)

**Interfaces:**
- Produces: 어댑터 선택 옵션 `rowFilter(row, settings) → boolean`. `SheetCache.get()`은 L1 히트·in-flight 합류·L2 히트·L3 폴백·DISABLED 직행 모든 경로에서 필터된 배열을 돌려주고, L1/L2에는 전체 값을 저장한다. `SheetCache.refresh()`의 `rows`도 필터된 값.
- 풋살 `matchLog`/`eventLog`/`playerGameLog` 어댑터: `rowFilter = row => !row?.tournament_id`. 축구·테니스 어댑터: rowFilter 없음.

- [ ] **Step 1: Write the failing test (신규 파일)**

```js
// src/services/__tests__/sheetCache.rowFilter.test.js
// 스펙 §4.6·§10 불변식 2 — 풋살 정규 데이터셋은 tournament_id 가 빈 행만 돌려준다.
// 모든 반환 경로(L3 폴백·L2 히트·L1 히트·in-flight 합류·refresh)에서 필터가 걸리고,
// 저장(L1/L2)에는 전체 행이 남는다. 축구 어댑터는 필터하지 않는다(하버FC 대회 행 유지).
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  store: new Map(),
  fetchCounts: { matchLog: 0, eventLog: 0, playerGameLog: 0 },
  auth: { team: '마스터FC', mode: '풋살' },
  settings: {},
}));

vi.mock('../../config/firebase', () => ({ firebaseDb: {} }));
vi.mock('firebase/database', () => ({
  ref: (_db, path) => ({ path }),
  get: async (r) => (h.store.has(r.path) ? { val: () => h.store.get(r.path) } : { val: () => null }),
  set: async (r, value) => {
    const v = { ...value };
    if (v.version && v.version.__sv) v.version = Date.now();
    h.store.set(r.path, v);
  },
  remove: async (r) => { h.store.delete(r.path); },
  serverTimestamp: () => ({ __sv: true }),
}));
vi.mock('../authUtil', () => ({ default: { getStored: () => h.auth } }));
vi.mock('../../config/settings', () => ({ getEffectiveSettings: () => h.settings }));
vi.mock('../tennisSync', () => ({ default: {} }));

const REG = { team: '마스터FC', sport: '풋살', mode: '기본', tournament_id: '', date: '2026-09-13', match_id: 'R1_C0', our_team_name: '팀A', opponent_team_name: '팀B', our_score: 1, opponent_score: 0, is_extra: false };
const CUP = { ...REG, mode: '대회', tournament_id: '마스터스컵 2026', date: '2026-09-20', match_id: 'R1_C0' };
const REG_EV = { team: '마스터FC', sport: '풋살', mode: '기본', tournament_id: '', date: '2026-09-13', match_id: 'R1_C0', event_type: 'goal', player: '김철수' };
const CUP_EV = { ...REG_EV, mode: '대회', tournament_id: '마스터스컵 2026', date: '2026-09-20' };
const REG_PG = { team: '마스터FC', sport: '풋살', mode: '기본', tournament_id: '', date: '2026-09-13', player: '김철수', goals: 1 };
const CUP_PG = { ...REG_PG, mode: '대회', tournament_id: '마스터스컵 2026', date: '2026-09-20' };

vi.mock('../appSync', () => ({
  default: {
    getMatchLog: () => { h.fetchCounts.matchLog++; return Promise.resolve({ rows: [REG, CUP] }); },
    getEventLog: () => { h.fetchCounts.eventLog++; return Promise.resolve({ rows: [REG_EV, CUP_EV] }); },
    getPlayerGameLog: () => { h.fetchCounts.playerGameLog++; return Promise.resolve({ rows: [REG_PG, CUP_PG] }); },
    getPointLog: () => Promise.resolve([]),
    getPlayerLog: () => Promise.resolve([]),
    getLatestDeltas: () => Promise.resolve({}),
    getCumulativeBonus: () => Promise.resolve({ crova: {}, goguma: {} }),
  },
}));

import SheetCache from '../sheetCache';

beforeEach(() => {
  h.store.clear();
  h.fetchCounts = { matchLog: 0, eventLog: 0, playerGameLog: 0 };
  h.auth = { team: '마스터FC', mode: '풋살' };
  h.settings = {};
  SheetCache._resetForTest();
});

describe('풋살 정규 데이터셋은 컵 행을 돌려주지 않는다', () => {
  it('L3 폴백: 반환은 정규 행만, L2 노드에는 전체 행 저장', async () => {
    const rows = await SheetCache.get('matchLog', { sport: '풋살' });
    expect(rows).toEqual([REG]);
    expect(h.store.get('cache/마스터FC/풋살/matchLog/all').count).toBe(2);
  });

  it('L1 히트: 두 번째 호출도 필터된 값', async () => {
    await SheetCache.get('matchLog', { sport: '풋살' });
    const rows = await SheetCache.get('matchLog', { sport: '풋살' });
    expect(rows).toEqual([REG]);
    expect(h.fetchCounts.matchLog).toBe(1);
  });

  it('in-flight 합류: 동시 호출 둘 다 필터된 값', async () => {
    const [a, b] = await Promise.all([
      SheetCache.get('eventLog', { sport: '풋살' }),
      SheetCache.get('eventLog', { sport: '풋살' }),
    ]);
    expect(a).toEqual([REG_EV]);
    expect(b).toEqual([REG_EV]);
    expect(h.fetchCounts.eventLog).toBe(1);
  });

  it('L2 히트: L1 을 비워도 L3 를 치지 않고 필터된 값', async () => {
    await SheetCache.get('playerGameLog', { sport: '풋살' });
    SheetCache._resetForTest();
    const rows = await SheetCache.get('playerGameLog', { sport: '풋살' });
    // L2 에서 디코드된 행은 20개 열이 전부 채워져 있어 toEqual 대신 핵심 필드만 본다.
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ player: '김철수', date: '2026-09-13' });
    expect(rows[0].tournament_id || '').toBe('');
    expect(h.fetchCounts.playerGameLog).toBe(1);
  });

  it('refresh: rows 는 필터된 값, L2 는 전체', async () => {
    const r = await SheetCache.refresh('matchLog', { sport: '풋살' });
    expect(r.ok).toBe(true);
    expect(r.rows).toEqual([REG]);
    expect(h.store.get('cache/마스터FC/풋살/matchLog/all').count).toBe(2);
  });

  it('로그 3종 모두 rowFilter 를 갖고, 다른 풋살 데이터셋은 갖지 않는다', () => {
    const a = SheetCache._adaptersForTest()['풋살'];
    for (const k of ['matchLog', 'eventLog', 'playerGameLog']) expect(typeof a[k].rowFilter, k).toBe('function');
    for (const k of ['pointLog', 'playerLog', 'latestDeltas', 'cumulativeBonus']) expect(a[k].rowFilter, k).toBeUndefined();
  });
});

describe('축구 어댑터는 필터하지 않는다(하버FC 대회 행 mode=대회 유지)', () => {
  beforeEach(() => { h.auth = { team: '하버FC', mode: '축구' }; });

  it('축구 matchLog 는 tournament_id 가 있는 행도 그대로', async () => {
    const rows = await SheetCache.get('matchLog', { sport: '축구' });
    expect(rows).toEqual([REG, CUP]);
  });

  it('축구·테니스 어댑터에는 rowFilter 가 없다', () => {
    const all = SheetCache._adaptersForTest();
    for (const sport of ['축구', '테니스']) {
      for (const [k, a] of Object.entries(all[sport])) expect(a.rowFilter, `${sport}.${k}`).toBeUndefined();
    }
  });
});
```

`src/services/__tests__/sheetCache.test.js`의 `it('모든 종목의 모든 어댑터가 mode 에 맞는 필드를 갖는다', ...)` 안, `if (a.isEmpty !== undefined) ...` 줄 아래에 추가:

```js
        // rowFilter 는 선택 필드(반환 시점 뷰 필터). 있으면 함수여야 한다.
        if (a.rowFilter !== undefined) expect(typeof a.rowFilter, where).toBe('function');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/services/__tests__/sheetCache.rowFilter.test.js`
Expected: 풋살 블록 6개 중 5개 FAIL(컵 행이 섞여 나옴 / rowFilter undefined). 축구 블록 PASS.

- [ ] **Step 3: Implement**

`src/services/sheetCache.js` — `soccerLikeAdapters(sport)` 안, `return adapters;` 바로 앞(`if (sport === '풋살') { ... }` 블록 뒤)에 추가:

```js
  // 풋살 로그 3종은 컵(마스터스컵) 행을 정규 소비자에게 돌려주지 않는다 — 스펙 §4.6·§5.
  // 저장(L1/L2)은 전체 행, 반환만 거른다(_applyRowFilter). 축구에는 넣지 않는다:
  // 하버FC 축구 대회 모드가 같은 열에 mode='대회' 행을 쓰고 축구 분석이 그 행을 그대로 읽는다.
  if (sport === '풋살') {
    const isRegularRow = (row) => !row?.tournament_id;
    for (const k of ['matchLog', 'eventLog', 'playerGameLog']) adapters[k].rowFilter = isRegularRow;
  }
```

같은 파일 `_fetchValue` 함수 바로 위에 헬퍼 추가:

```js
// 어댑터의 뷰 필터를 "반환 값"에만 적용한다. L1/L2 에는 전체 값을 저장한다(원본 노드 공유 —
// 스펙 §4.6). rows 모드 배열에만 의미가 있고, raw 모드·필터 없음이면 그대로 돌려준다.
function _applyRowFilter(adapter, value, settings) {
  if (!adapter.rowFilter || !Array.isArray(value)) return value;
  return value.filter(row => adapter.rowFilter(row, settings));
}
```

`get()` — 세 반환 지점 교체:

```js
    if (DISABLED) return _applyRowFilter(adapter, await _fetchValue(adapter, settings), settings);
```
```js
    if (hit && Date.now() - hit.ts < L1_TTL_MS) return _applyRowFilter(adapter, hit.value, settings);
```
IIFE 마지막 `return value;` →
```js
      // in-flight 합류(_inflight.get)는 이 Promise 를 공유하므로 여기서 거르면 합류자도 필터된 값을 받는다.
      return _applyRowFilter(adapter, value, settings);
```
(그 위 `_l1.set(path, { value, ts: Date.now() })` 는 전체 값 그대로 저장 — 변경하지 않는다.)

`refresh()` — 성공 반환 교체:

```js
      const rows = await _fetchAndStore(adapter, path, settings);
      _l1.set(path, { value: rows, ts: Date.now() });
      return { ok: true, rows: _applyRowFilter(adapter, rows, settings) };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/services/__tests__/sheetCache.rowFilter.test.js src/services/__tests__/sheetCache.test.js src/services/__tests__/sheetCacheCore.test.js`
Expected: 전부 PASS(기존 sheetCache.test.js 의 풋살 7종·축구 6종 목록 케이스 그대로 통과 — datasetsOf 는 건드리지 않았다).

- [ ] **Step 5: Commit**

```bash
git add src/services/sheetCache.js src/services/__tests__/sheetCache.rowFilter.test.js src/services/__tests__/sheetCache.test.js
git commit -m "feat(cup): SheetCache rowFilter — 풋살 로그 3종은 tournament_id 가 빈 행만 반환(모든 경로), 저장은 전체 행 (스펙 §4.6)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01AqpBTxNBiezjumZN5AzJ6D"
```

---

### Task 7: 시트 복구 유틸 — 컵 행 제외

**Files:**
- Modify: `src/utils/recoverFinalizedFromSheets.js:39-41`
- Test: `src/utils/__tests__/recoverFinalizedFromSheets.test.js` (신규)

**Interfaces:**
- Produces: `recoverFinalizedStateFromSheets({ team, date })` 가 `tournament_id` 가 있는 행을 로그_매치·로그_이벤트·로그_선수경기 모두에서 무시한다. 컵 날짜만 있으면 기존 문구 `로그_매치에 {team} {date} 데이터 없음` 으로 throw.

- [ ] **Step 1: Write the failing test**

```js
// src/utils/__tests__/recoverFinalizedFromSheets.test.js
// 스펙 §5·불변식 9 — 복구 유틸은 AppSync 를 직접 읽는 유일한 우회 경로라 같은 필터를 갖는다.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({ matches: [], events: [], players: [] }));
vi.mock('../../services/appSync', () => ({
  default: {
    getMatchLog: () => Promise.resolve({ rows: h.matches }),
    getEventLog: () => Promise.resolve({ rows: h.events }),
    getPlayerGameLog: () => Promise.resolve({ rows: h.players }),
  },
}));

import { recoverFinalizedStateFromSheets } from '../recoverFinalizedFromSheets';

const T = '마스터FC', D = '2026-09-20';
const regMatch = { team: T, date: D, game_id: 'g_1', match_idx: 1, match_id: 'R1_C0', court_id: 0, tournament_id: '', our_team_name: '팀A', opponent_team_name: '팀B', our_members_json: '["a1"]', opponent_members_json: '["b1"]', our_score: 2, opponent_score: 1, is_extra: false };
const cupMatch = { ...regMatch, match_idx: 2, match_id: 'R2_C0', tournament_id: '마스터스컵 2026', our_team_name: '팀C', opponent_team_name: '팀D', our_members_json: '["c1"]', opponent_members_json: '["d1"]' };
const regEv = { team: T, date: D, match_id: 'R1_C0', event_type: 'goal', player: 'a1', related_player: '', our_team: '팀A', opponent: '팀B', tournament_id: '', input_time: '' };
const cupEv = { ...regEv, match_id: 'R2_C0', player: 'c1', our_team: '팀C', opponent: '팀D', tournament_id: '마스터스컵 2026' };
const regPg = { team: T, date: D, player: 'a1', tournament_id: '' };
const cupPg = { team: T, date: D, player: 'c1', tournament_id: '마스터스컵 2026' };

beforeEach(() => { h.matches = []; h.events = []; h.players = []; });

describe('recoverFinalizedStateFromSheets — 컵 행 제외', () => {
  it('같은 날 정규+컵 행이 섞여 있어도 정규 행만 복구한다', async () => {
    h.matches = [regMatch, cupMatch]; h.events = [regEv, cupEv]; h.players = [regPg, cupPg];
    const { state } = await recoverFinalizedStateFromSheets({ team: T, date: D });
    expect(state.completedMatches.map(m => m.matchId)).toEqual(['R1_C0']);
    expect(state.allEvents.map(e => e.player)).toEqual(['a1']);
    expect(state.teamNames).toEqual(['팀A', '팀B']);
    expect(state.attendees).not.toContain('c1');
  });

  it('컵 행만 있는 날짜는 "데이터 없음" 으로 throw (컵 세션은 아카이브에 이미 있다)', async () => {
    h.matches = [cupMatch]; h.events = [cupEv]; h.players = [cupPg];
    await expect(recoverFinalizedStateFromSheets({ team: T, date: D })).rejects.toThrow('데이터 없음');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/__tests__/recoverFinalizedFromSheets.test.js`
Expected: 첫 케이스 FAIL(`['R1_C0','R2_C0']`), 둘째 FAIL(throw 안 함).

- [ ] **Step 3: Implement**

`src/utils/recoverFinalizedFromSheets.js` 39~41행을 다음으로 교체:

```js
  // 컵(tournament_id 있음) 행은 복구 대상이 아니다 — 컵 세션은 saveFinalized 로 아카이브에 이미 있다(스펙 §5).
  // 이 유틸은 SheetCache 를 거치지 않는 유일한 로그 직접 읽기라 같은 필터를 여기서도 건다.
  const isRegular = (r) => !r.tournament_id;
  const matches = (mlRes.rows || []).filter(r => isRegular(r) && String(r.date) === date && r.team === team);
  const events = (evRes.rows || []).filter(r => isRegular(r) && String(r.date) === date && r.team === team);
  const players = (pgRes.rows || []).filter(r => isRegular(r) && String(r.date) === date && r.team === team);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/__tests__/recoverFinalizedFromSheets.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/utils/recoverFinalizedFromSheets.js src/utils/__tests__/recoverFinalizedFromSheets.test.js
git commit -m "feat(cup): 시트 복구 유틸이 tournament_id 가 있는 컵 행을 무시 (스펙 §5)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01AqpBTxNBiezjumZN5AzJ6D"
```

---

### Task 8: 설정 화면 로그_매치 재기록 도구 — 태그를 `logTagsOf` 로

**Files:**
- Create: `src/utils/finalizedRows.js`
- Modify: `src/components/common/SettingsScreen.jsx:11` (import), `:133-142` (`runFirebasePhaseMigration` 루프)
- Test: `src/utils/__tests__/finalizedRows.test.js`

**Interfaces:**
- Consumes: `logTagsOf` (Task 1), `buildRoundRowsFromFutsal`/`buildRoundRowsFromSoccer` (기존).
- Produces: `rowsForFinalizedSession({ team, sport, gameDate, savedAt, state }): row[]` — 확정 세션 1건의 로그_매치 rows. 태그는 state 에서 파생.

- [ ] **Step 1: Write the failing test**

```js
// src/utils/__tests__/finalizedRows.test.js
// 스펙 §5 우회 경로 — 설정 화면 "Firebase → 로그_매치 정확 덮어쓰기" 가 컵 세션을 태그 없이
// 재기록하면 rowFilter 를 우회해 정규 분석이 오염된다. 태그는 반드시 세션 state 에서 나온다.
import { describe, it, expect } from 'vitest';
import { rowsForFinalizedSession } from '../finalizedRows';

const futsalState = (extra = {}) => ({
  gameId: 'g_1', teams: [['a1'], ['b1']],
  completedMatches: [{ matchId: 'R1_C0', homeIdx: 0, awayIdx: 1, homeTeam: '팀A', awayTeam: '팀B', homeScore: 1, awayScore: 0 }],
  ...extra,
});

describe('rowsForFinalizedSession', () => {
  it('정규 풋살 세션: mode=기본, tournament_id 빈 문자열', () => {
    const rows = rowsForFinalizedSession({ team: '마스터FC', sport: '풋살', gameDate: '2026-09-13', savedAt: 't', state: futsalState() });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ mode: '기본', tournament_id: '', date: '2026-09-13', input_time: 't', our_team_name: '팀A' });
  });
  it('컵 풋살 세션: mode=대회, tournament_id=대회명', () => {
    const rows = rowsForFinalizedSession({ team: '마스터FC', sport: '풋살', gameDate: '2026-09-20', savedAt: '', state: futsalState({ tournamentId: '마스터스컵 2026' }) });
    expect(rows[0]).toMatchObject({ mode: '대회', tournament_id: '마스터스컵 2026' });
  });
  it('축구 세션은 축구 빌더를 쓴다(soccerMatches 기준, 기존 동작)', () => {
    const state = { soccerMatches: [{ matchIdx: 1, opponent: '상대', events: [], lineup: [], startedAt: 1 }] };
    const rows = rowsForFinalizedSession({ team: '하버FC', sport: '축구', gameDate: '2026-09-13', savedAt: 't', state });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ sport: '축구', mode: '기본', tournament_id: '', opponent_team_name: '상대' });
  });
  it('completedMatches 가 없으면 빈 배열', () => {
    expect(rowsForFinalizedSession({ team: '마스터FC', sport: '풋살', gameDate: '2026-09-13', savedAt: '', state: {} })).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/__tests__/finalizedRows.test.js`
Expected: FAIL — 모듈 없음.

- [ ] **Step 3: Implement**

```js
// src/utils/finalizedRows.js
// 확정 세션(finalized stateJSON) 1건 → 로그_매치 rows. 설정 화면의 "Firebase → 로그_매치 정확 덮어쓰기"
// 도구가 쓴다. 태그(mode/tournament_id)는 하드코딩하지 않고 세션 state 에서 파생한다 — 컵 세션을
// 태그 없이 재기록하면 SheetCache rowFilter 를 우회해 정규 분석이 오염된다(스펙 §5).
import { buildRoundRowsFromFutsal, buildRoundRowsFromSoccer } from './matchRowBuilder';
import { logTagsOf } from './cup/cupSession';

export function rowsForFinalizedSession({ team, sport, gameDate, savedAt, state }) {
  const buildFn = sport === '축구' ? buildRoundRowsFromSoccer : buildRoundRowsFromFutsal;
  const { mode, tournamentId } = logTagsOf(state);
  return buildFn({ team, mode, tournamentId, date: gameDate, stateJSON: state, inputTime: savedAt || '' });
}
```

`src/components/common/SettingsScreen.jsx`:
1. 11행 `import { buildRoundRowsFromFutsal, buildRoundRowsFromSoccer } from '../../utils/matchRowBuilder';` → `import { rowsForFinalizedSession } from '../../utils/finalizedRows';`
2. `runFirebasePhaseMigration` 안:
   - `const buildFn = sport === '축구' ? buildRoundRowsFromSoccer : buildRoundRowsFromFutsal;` 줄 삭제.
   - `const rows = buildFn({ team: teamName, mode: '기본', tournamentId: '', date: h.gameDate, stateJSON: gs, inputTime: h.savedAt || '' });` →
     ```js
        // 태그는 세션 state 에서(컵 세션은 mode=대회·tournament_id 유지) — 스펙 §5
        const rows = rowsForFinalizedSession({ team: teamName, sport, gameDate: h.gameDate, savedAt: h.savedAt, state: gs });
     ```

- [ ] **Step 4: Run tests + lint**

Run: `npx vitest run src/utils/__tests__/finalizedRows.test.js && npm run lint`
Expected: PASS, lint 경고 없음(미사용 import 없음).

- [ ] **Step 5: Commit**

```bash
git add src/utils/finalizedRows.js src/utils/__tests__/finalizedRows.test.js src/components/common/SettingsScreen.jsx
git commit -m "fix(cup): 설정 화면 로그_매치 재기록 도구의 태그를 세션 state(logTagsOf)에서 파생 — 컵 세션 태그 유실 방지 (스펙 §5)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01AqpBTxNBiezjumZN5AzJ6D"
```

---

### Task 9: `App.jsx` 마감 컵 분기 (로그 3종만, 정규 분기 무수정)

**Files:**
- Modify: `src/App.jsx:9-11` (import), `:656-668` (handleFinalize 머리·confirm 문구), `:703-706` (rankScore), `:723-740` (빌더 호출), `:742` 직전 (컵 분기 삽입)
- Test: 렌더 하네스 없음(메모리: 컴포넌트 렌더 검증 공백). 검증 = Task 10 정적 가드 + `npm run lint` + `npm run build` + diff 정독.

**Interfaces:**
- Consumes: `isCupSession`, `logTagsOf` (Task 1), 빌더 선택 인자 (Task 3), `selectFinalizeWrites`, `refreshDatasets`, `CUP_FINALIZE_DATASETS` (Task 4), `AppSync.writeRawEvents/writeRawPlayerGames/writeMatchLog`, `FirebaseSync.saveFinalized/syncDiff` (기존).
- Produces: 컵 세션 마감이 로그 3종만 전송하고(`mode='대회'`, `tournament_id`), `rank_score=0`, allOk 시 `saveFinalized`, `refreshDatasets(CUP_FINALIZE_DATASETS, { sport:'풋살' })`. 정규 세션은 기존과 동일.

- [ ] **Step 1: import 추가**

`src/App.jsx` 9행을 교체하고 11행 아래에 한 줄 추가:

```js
import { refreshAfterFinalize, refreshDatasets, CUP_FINALIZE_DATASETS } from './utils/refreshAfterFinalize';
```
```js
import { isCupSession, logTagsOf } from './utils/cup/cupSession';
import { selectFinalizeWrites } from './utils/cup/finalizeWrites';
```

- [ ] **Step 2: handleFinalize 머리 — 판별·태그·confirm 문구**

`const ES = state.settingsSnapshot || gameSettings;` 바로 아래에 추가:

```js
    // 컵 세션 판별·로그 태그는 단일 헬퍼로만(스펙 §3). gameMode 는 재접속 후 없으므로 쓰지 않는다.
    const isCup = isCupSession(state);
    const logTags = logTagsOf(state);
```

`reconfirmMsg` 정의를 다음으로 교체(정규 문구는 글자 하나 바꾸지 않는다):

```js
    const reconfirmMsg = gameFinalized
      ? `⚠️ 이미 전송된 기록입니다.\n재전송 시 구글시트에 중복 저장될 수 있습니다.\n\n수정된 내용을 재전송하시겠습니까?`
      : isCup
        ? `🏆 ${state.tournamentId}\n${gameD.getMonth() + 1}월 ${gameD.getDate()}일 컵대회 기록을 확정하시겠습니까?\n\n로그_이벤트·로그_선수경기·로그_매치에만 저장합니다.\n(포인트로그·선수별집계에는 기록하지 않습니다)`
        : `${gameD.getMonth() + 1}월 ${gameD.getDate()}일 풋살기록을 확정하시겠습니까?\n\n시트에 포인트로그 + 선수별집계를 저장합니다.`;
```

- [ ] **Step 3: rankScore — 컵은 0**

`const rankScore = teamRankScore[playerTeam] || 0;` →

```js
      // 컵은 세션 순위 점수를 쓰지 않는다(스펙 §4.4 rank_score=0). 정규는 기존 값 그대로.
      const rankScore = isCup ? 0 : (teamRankScore[playerTeam] || 0);
```

- [ ] **Step 4: 빌더 호출에 태그 전달**

```js
    const rawEvents = buildRawEventsFromFutsal({ team, gameId: gameState.gameId, events: pointEvents, ...logTags });
    const rawPlayerGames = buildRawPlayerGamesFromFutsal({
      team, inputTime, ...logTags,
      players: playerData.map(p => ({
        ...p,
        owngoals: p.owngoalCount, fouls: p.foulCount, // PG 시트는 원시 횟수
        playerTeam: getPlayerTeamName(p.name),
      })),
    });
    const matchRows = buildRoundRowsFromFutsal({
      team,
      ...logTags,
      date: dateStr,
      stateJSON: gameState,
      inputTime,
    });
```
(`mode: '기본', tournamentId: ''` 두 줄은 삭제된다. 정규 세션에서 `logTags` 는 정확히 그 두 값이다.)

- [ ] **Step 5: 컵 분기 삽입 — 기존 `try {` 바로 앞**

```js
    // ── 컵 세션 마감(스펙 §6.5): 로그 3종만. 정규 분기(아래 try)는 손대지 않는다.
    if (isCup) {
      try {
        // 전송 목록은 selectFinalizeWrites(true) = ['rawEvents','rawPlayerGames','matchLog'] (finalizeWrites.test 가 고정).
        const WRITERS = {
          rawEvents: () => AppSync.writeRawEvents({ rows: rawEvents }),
          rawPlayerGames: () => AppSync.writeRawPlayerGames({ rows: rawPlayerGames }),
          matchLog: () => AppSync.writeMatchLog(matchRows),
        };
        const LABELS = { rawEvents: '로그_이벤트', rawPlayerGames: '로그_선수경기', matchLog: '로그_매치' };
        const keys = selectFinalizeWrites(true);
        const results = await Promise.allSettled(keys.map(k => WRITERS[k]()));
        const rawFailed = keys.filter((k, i) => results[i].status !== 'fulfilled').map(k => LABELS[k]);
        const allOk = rawFailed.length === 0;
        // 아카이브는 정규와 동일(스펙 §1.1) — 요약에 🏆 파트가 붙는다(buildFinalizedSummary).
        if (allOk) {
          await FirebaseSync.saveFinalized(teamContext?.team, gameId, gameState);
        }
        const finalState = { ...gameState, gameFinalized: allOk };
        await FirebaseSync.syncDiff(team, gameId || "legacy", lastSyncedStateRef.current, finalState);
        lastSyncedStateRef.current = finalState;
        set('gameFinalized', allOk);
        // 쓴 시트의 원본 캐시만 재적재(스펙 §4.6). refreshAfterFinalize(전체)를 부르면 쓰지 않은
        // 포인트로그·선수별집계 캐시가 빈 결과 강등으로 지워진다.
        await refreshDatasets(CUP_FINALIZE_DATASETS, { sport: '풋살' });
        const UNIT = { rawEvents: '건', rawPlayerGames: '명', matchLog: '건' };
        const ct = (r, unit) => r.status === 'fulfilled'
          ? `${r.value?.count || 0}${unit}${r.value?.skipped ? ` (skip ${r.value.skipped})` : ''}`
          : '❌ 실패';
        const detail = keys.map((k, i) => `${LABELS[k]}: ${ct(results[i], UNIT[k])}`).join('\n');
        if (allOk) {
          alert(`🏆 컵대회 기록 확정 완료!\n\n${detail}\n\n수정이 필요하면 "경기로" 버튼으로 돌아갈 수 있습니다.`);
        } else {
          alert(`⚠️ 컵대회 로그 일부 전송 실패: ${rawFailed.join(', ')}\n\n${detail}\n\n"기록확정"을 다시 눌러 재전송하세요.\n(전부 성공 전까지 미확정 상태로 둡니다.)`);
        }
      } catch (err) {
        alert("시트 저장 실패: " + err.message);
      }
      return;
    }
```

- [ ] **Step 6: 정규 분기 무수정 확인 (diff 정독)**

Run: `git diff src/App.jsx`
확인 항목:
- 기존 `try { const results = await Promise.allSettled([ AppSync.writePointLog ... ` 블록 내부에 변경된 줄이 **없다**.
- 삭제된 줄은 `mode: '기본',` / `tournamentId: '',` 두 줄뿐이고, 그 자리에 `...logTags` 가 있다.
- `const rankScore` 는 정규에서 `teamRankScore[playerTeam] || 0` 그대로.

- [ ] **Step 7: lint + build**

Run: `npm run lint && npm run build`
Expected: 에러 0. (`refreshAfterFinalize` 는 정규 분기에서 계속 쓰이므로 미사용 경고 없음.)

- [ ] **Step 8: Commit**

```bash
git add src/App.jsx
git commit -m "feat(cup): 풋살 마감 컵 분기 — 로그 3종만 전송(mode=대회·tournament_id), rank_score=0, 원본 캐시 3종만 재적재. 정규 분기 무수정 (스펙 §6.5)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01AqpBTxNBiezjumZN5AzJ6D"
```

---

### Task 10: 정적 가드 테스트 — 로그 직접 읽기 화이트리스트·마감 태그 단일화

**Files:**
- Test: `src/services/__tests__/logReaders.guard.test.js` (신규)

**Interfaces:**
- Produces: (1) `src/` 아래에서 `AppSync.getMatchLog|getEventLog|getPlayerGameLog(` 를 직접 부르는 파일은 `services/sheetCache.js`, `utils/recoverFinalizedFromSheets.js` 뿐(불변식 8). (2) `App.jsx` 는 `logTagsOf(` 를 쓰고 `mode: '기본'`/`tournamentId: ''` 리터럴이 없다(불변식 4·9).

- [ ] **Step 1: Write the test**

```js
// src/services/__tests__/logReaders.guard.test.js
// 스펙 §5·§10 불변식 8·9 — 풋살 로그 3종의 격리는 SheetCache rowFilter 한 곳에서 이뤄진다.
// 그 밖의 파일이 AppSync 로 로그를 직접 읽기 시작하면 컵 행이 새로 새기 시작하므로 정적으로 막는다.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== '__tests__') walk(p, out); }
    else if (/\.(js|jsx)$/.test(e.name)) out.push(p);
  }
  return out;
}
const read = (rel) => fs.readFileSync(path.join(SRC, rel), 'utf8');

// 직접 읽기가 허용된 파일. 새 경로를 추가하려면 같은 tournament_id 필터를 넣고 여기에 등록한다.
const ALLOWED = new Set(['services/sheetCache.js', 'utils/recoverFinalizedFromSheets.js']);

describe('로그 3종 직접 읽기 화이트리스트', () => {
  it('SheetCache 와 복구 유틸 외에는 AppSync.getMatchLog/getEventLog/getPlayerGameLog 를 부르지 않는다', () => {
    const offenders = [];
    for (const f of walk(SRC)) {
      const rel = path.relative(SRC, f).split(path.sep).join('/');
      if (ALLOWED.has(rel)) continue;
      if (/AppSync\.(getMatchLog|getEventLog|getPlayerGameLog)\(/.test(fs.readFileSync(f, 'utf8'))) offenders.push(rel);
    }
    expect(offenders).toEqual([]);
  });
  it('허용 파일 둘은 실제로 tournament_id 필터를 갖는다', () => {
    expect(read('services/sheetCache.js')).toMatch(/tournament_id/);
    expect(read('utils/recoverFinalizedFromSheets.js')).toMatch(/!r\.tournament_id/);
  });
});

describe('App.jsx 마감 태그 단일화', () => {
  const src = read('App.jsx');
  it('logTagsOf 로 태그를 만든다', () => {
    expect(src).toMatch(/logTagsOf\(/);
  });
  it("mode: '기본' / tournamentId: '' 리터럴이 없다", () => {
    expect(src).not.toMatch(/mode:\s*['"]기본['"]/);
    expect(src).not.toMatch(/tournamentId:\s*['"]{2}/);
  });
  it('컵 마감은 refreshAfterFinalize 가 아니라 refreshDatasets(CUP_FINALIZE_DATASETS) 를 부른다', () => {
    expect(src).toMatch(/refreshDatasets\(CUP_FINALIZE_DATASETS/);
  });
  it('컵 마감 전송 목록은 selectFinalizeWrites(true) 에서 온다', () => {
    expect(src).toMatch(/selectFinalizeWrites\(true\)/);
  });
});
```

- [ ] **Step 2: Run test**

Run: `npx vitest run src/services/__tests__/logReaders.guard.test.js`
Expected: PASS (Task 6·7·9 가 끝난 상태). 만약 첫 케이스가 실패하면 offenders 목록의 파일을 SheetCache 경유로 바꾸거나 필터를 넣고 ALLOWED 에 등록한다 — 등록만 하고 필터를 안 넣는 것은 금지.

- [ ] **Step 3: Commit**

```bash
git add src/services/__tests__/logReaders.guard.test.js
git commit -m "test(cup): 로그 3종 직접 읽기 화이트리스트·마감 태그 단일화 정적 가드 (스펙 §10 불변식 8·9)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01AqpBTxNBiezjumZN5AzJ6D"
```

---

### Task 11: 전체 검증·스펙 상태 갱신

**Files:**
- Modify: `docs/superpowers/specs/2026-09-16-masters-cup-design.md` (상태 줄·§11 1단계 항목)

- [ ] **Step 1: 전체 테스트·린트·빌드**

Run: `npm test && npm run lint && npm run build`
Expected: 전부 PASS/에러 0. 실패가 있으면 이 계획의 해당 Task 로 돌아가 고친다(테스트를 약화시키지 않는다).

- [ ] **Step 2: 회귀 스팟 체크 (수동, 정규 동작 불변)**

Run: `git diff main...HEAD --stat` 로 변경 파일이 File Structure 표와 일치하는지 확인. `apps-script/`, `src/utils/analyticsV2/`, `src/utils/soccerAnalytics/`, `src/utils/intraSoccer/` 에 변경이 없어야 한다.

- [ ] **Step 3: 스펙 상태 갱신**

`docs/superpowers/specs/2026-09-16-masters-cup-design.md`:
- 상태 줄을 `- 상태: 1단계(격리 게이트) 구현 완료 — <오늘 날짜>. 2단계 계획 대기` 로 바꾼다.
- §11 "1단계 — 격리 게이트" 두 번째 불릿을 다음으로 바꾼다(alias 는 3단계로 이관된 사실을 반영):
  `- sheetCache \`rowFilter\` 옵션 + \`get()\` 세 반환 지점·\`refresh()\` 반환 필터 + 풋살 정규 3종 필터. (\`alias\`/\`resolveAdapter\`/\`_pathFor\`/\`datasetsOf\` 제외는 등록 대상이 생기는 3단계에서 cup 뷰와 함께.)`
- §11 "3단계" 첫 불릿 맨 앞에 `sheetCache \`alias\`/\`resolveAdapter\`/\`_pathFor\`/\`datasetsOf\` 제외 구현 + ` 를 덧붙인다.

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/specs/2026-09-16-masters-cup-design.md
git commit -m "docs: 마스터스컵 스펙 상태 — 1단계(격리 게이트) 구현 완료, alias 는 3단계로

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01AqpBTxNBiezjumZN5AzJ6D"
```

---

## 완료 기준

- `npm test` 전체 green(신규 8개 테스트 파일 + 수정 3개 포함), `npm run lint`·`npm run build` 에러 0.
- `initialState.tournamentId === ''` 이고 UI 어디에서도 값을 채우지 않는다 → 배포 후 사용자 동작 변화 없음.
- 정규 마감 `Promise.allSettled` 블록 diff 없음.
- 축구 어댑터 rowFilter 없음(테스트 고정), `apps-script/Code.js` 변경 없음.

## 2단계 이후(별도 계획)

2단계 컵 경기일 진입(설정 키·명단 로더·경기관리 컵 버튼·배너·라벨), 3단계 순위표·득점왕·남은 대진(alias 데이터셋 포함), 4단계 마무리. 각 단계는 스펙 §11 을 기준으로 이 계획과 같은 형식으로 작성한다.
