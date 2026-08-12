# 테니스 라운드 확정 + 마감 2단계화 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 테니스에 풋살식 라운드 확정 게이트(`confirmedRounds`)와 마감 2단계(상단 마감 pill → summary 확인 화면 → 관리자 전송 → 아카이브)를 이식한다.

**Architecture:** 리듀서에 확정 상태·차단 가드를 넣고(다중 탭 동기화 대비 UI 차단만으로 불충분), 게이트 판정은 순수 헬퍼(`roundConfirm.js`)로 분리한다. 하단 바는 확정/확정취소 3상태로 교체, 마감은 상단 pill이 `phase='summary'` 전환만 하고 전송은 summary 화면의 관리자 버튼이 담당한다.

**Tech Stack:** React(Vite)+vitest. 테니스 파일 + `firebaseSyncDiff.js`의 테니스 상수만 수정.

**Spec:** `docs/superpowers/specs/2026-08-12-tennis-round-confirm-design.md` — 어긋나면 스펙이 이긴다.

## Global Constraints

- **풋살/축구 무영향.** 수정 허용 파일 밖은 금지. 특히 `MatchTabBar.jsx`/`MatchHeader.jsx`(공용 셸)는 수정하지 않는다 — 마감 pill은 기존 `tabs` prop 형태(`{key,label,onClick,tone,strong,hidden}`)로만 추가.
- `firebaseSyncDiff.js`에서 풋살 상수(`META_FIELDS`/`WHOLE_REPLACE_FIELDS`/`CHILD_NODE_FIELDS`)는 건드리지 않는다. 테니스 필드는 `TENNIS_WHOLE_REPLACE_FIELDS`에만 추가.
- `reconstructState`의 테니스 필드는 기본값 땜질 금지(`|| {}` 금지) — 기본값 보정은 `normalizeTennisMatch` 단일 지점(파일 상단 주석 규칙).
- **RTDB 배열 변환 함정**: `confirmedRounds`는 숫자 키 객체라 RTDB가 `[null, true, …]` 배열로 되돌릴 수 있다. normalize에서 배열/객체 양쪽을 `{ '1': true }` 형태로 정규화해야 한다(테스트 필수).
- 확정된 라운드의 코트 편집 차단은 **리듀서 레벨 단일 가드**(액션 타입 Set) — 컴포넌트별 산발 차단 금지.
- 렌더 검증 공백(메모리 규칙): jsx 변경은 선언 순서 육안 + diff 정독 + 브라우저 스모크.
- 커밋 스타일 `feat(tennis): …` 한국어. 테스트 `npx vitest run <파일>`, 전체 `npm test`(현재 760개 전부 통과 유지).

---

### Task 1: 리듀서 확정 상태 + 게이트 헬퍼 + 동기화 등록

**Files:**
- Create: `src/utils/tennis/roundConfirm.js`
- Modify: `src/hooks/useTennisReducer.js` (initialState, 가드, 액션 3종)
- Modify: `src/utils/tennis/normalizeTennisMatch.js` (confirmedRounds 보정)
- Modify: `src/services/firebaseSyncDiff.js:23-25` (TENNIS_WHOLE_REPLACE_FIELDS), `:371-374` 근처 (reconstructState)
- Test: `src/utils/tennis/__tests__/roundConfirm.test.js`, `src/hooks/__tests__/tennisReducerConfirm.test.js`, `src/utils/tennis/__tests__/normalizeTennisMatch.test.js`(블록 추가)

**Interfaces:**
- Produces (roundConfirm.js): `isRoundComplete(round)` → boolean (코트 1개 이상 && 전 코트 `status==='done'`), `unfinishedCourtLabels(round)` → `['C4',…]` (done 아닌 코트), `allRoundsConfirmed(rounds, confirmedRounds)` → boolean (라운드 1개 이상 && 모든 roundIdx가 confirmedRounds에 true), `isLastRoundConfirmed(rounds, confirmedRounds)` → boolean (rounds 비면 false).
- Produces (리듀서): `confirmedRounds` 상태 필드, `CONFIRM_ROUND {roundIdx}`, `UNCONFIRM_ROUND {roundIdx}`, `SET_PHASE {phase}` 액션. 확정 라운드에 대한 코트 편집 액션 no-op.
- Produces (normalize): `normalizeTennisMatch(state).confirmedRounds`는 항상 `{ [roundIdx]: true }` 객체.

- [ ] **Step 1: roundConfirm 실패 테스트** — `src/utils/tennis/__tests__/roundConfirm.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { isRoundComplete, unfinishedCourtLabels, allRoundsConfirmed, isLastRoundConfirmed } from '../roundConfirm';

const done = (courtId) => ({ courtId, status: 'done' });
const ready = (courtId) => ({ courtId, status: 'ready' });
const playing = (courtId) => ({ courtId, status: 'playing' });

describe('isRoundComplete / unfinishedCourtLabels', () => {
  it('전 코트 done이면 완료', () => {
    expect(isRoundComplete({ roundIdx: 1, courts: [done(1), done(2)] })).toBe(true);
    expect(unfinishedCourtLabels({ roundIdx: 1, courts: [done(1), done(2)] })).toEqual([]);
  });
  it('배치 중/진행 중 코트가 있으면 미완료 + 라벨', () => {
    const r = { roundIdx: 1, courts: [done(1), ready(4), playing(2)] };
    expect(isRoundComplete(r)).toBe(false);
    expect(unfinishedCourtLabels(r)).toEqual(['C4', 'C2']);
  });
  it('코트 0개 라운드는 미완료', () => {
    expect(isRoundComplete({ roundIdx: 1, courts: [] })).toBe(false);
  });
});

describe('allRoundsConfirmed / isLastRoundConfirmed', () => {
  const rounds = [{ roundIdx: 1, courts: [done(1)] }, { roundIdx: 2, courts: [done(1)] }];
  it('전 라운드 확정이어야 true, 라운드 0개면 false', () => {
    expect(allRoundsConfirmed(rounds, { 1: true, 2: true })).toBe(true);
    expect(allRoundsConfirmed(rounds, { 1: true })).toBe(false);
    expect(allRoundsConfirmed([], {})).toBe(false);
  });
  it('마지막 라운드 확정 여부', () => {
    expect(isLastRoundConfirmed(rounds, { 2: true })).toBe(true);
    expect(isLastRoundConfirmed(rounds, { 1: true })).toBe(false);
    expect(isLastRoundConfirmed([], {})).toBe(false);
  });
});
```

- [ ] **Step 2: 실패 확인** — `npx vitest run src/utils/tennis/__tests__/roundConfirm.test.js` → FAIL (module not found)

- [ ] **Step 3: roundConfirm.js 구현**

```js
// 라운드 확정 게이트 판정. 리듀서와 화면이 같은 판정을 쓰도록 순수 함수로 분리한다.
// confirmedRounds는 RTDB 왕복 후에도 normalizeTennisMatch가 객체로 보정해 준다는 전제.
export function isRoundComplete(round) {
  const courts = round?.courts || [];
  return courts.length > 0 && courts.every(c => c.status === 'done');
}

export function unfinishedCourtLabels(round) {
  return (round?.courts || []).filter(c => c.status !== 'done').map(c => `C${c.courtId}`);
}

export function allRoundsConfirmed(rounds, confirmedRounds) {
  const rs = rounds || [];
  const cf = confirmedRounds || {};
  return rs.length > 0 && rs.every(r => cf[r.roundIdx] === true);
}

export function isLastRoundConfirmed(rounds, confirmedRounds) {
  const rs = rounds || [];
  if (rs.length === 0) return false;
  const last = rs.reduce((m, r) => Math.max(m, r.roundIdx), 0);
  return (confirmedRounds || {})[last] === true;
}
```

- [ ] **Step 4: 통과 확인** — 같은 명령 → PASS

- [ ] **Step 5: 리듀서 실패 테스트** — `src/hooks/__tests__/tennisReducerConfirm.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { tennisReducer, tennisInitialState } from '../useTennisReducer';

const doneCourt = (courtId) => ({
  courtId, format: '단식', bestOf: 1, status: 'done', currentSet: 0,
  sideA: ['갑'], sideB: ['을'], sets: [{ a: 6, b: 4, tbA: 0, tbB: 0, done: true }],
  stats: {}, undoStack: [{ kind: 'endSet', setIdx: 0, endedMatch: true }],
});
const base = {
  ...tennisInitialState, phase: 'playing',
  rounds: [{ roundIdx: 1, courts: [doneCourt(1)] }],
};

describe('CONFIRM_ROUND / UNCONFIRM_ROUND', () => {
  it('전 코트 done이면 확정된다', () => {
    const s = tennisReducer(base, { type: 'CONFIRM_ROUND', roundIdx: 1 });
    expect(s.confirmedRounds).toEqual({ 1: true });
  });
  it('미완료 코트가 있으면 no-op', () => {
    const withReady = { ...base, rounds: [{ roundIdx: 1, courts: [doneCourt(1), { ...doneCourt(4), status: 'ready' }] }] };
    expect(tennisReducer(withReady, { type: 'CONFIRM_ROUND', roundIdx: 1 })).toBe(withReady);
  });
  it('확정취소는 키만 지운다', () => {
    const s1 = tennisReducer(base, { type: 'CONFIRM_ROUND', roundIdx: 1 });
    const s2 = tennisReducer(s1, { type: 'UNCONFIRM_ROUND', roundIdx: 1 });
    expect(s2.confirmedRounds).toEqual({});
    expect(s2.rounds).toEqual(s1.rounds); // 코트 데이터는 그대로 — 풋살식 스냅샷 이동 없음
  });
});

describe('확정 라운드 편집 차단 (리듀서 레벨)', () => {
  const confirmed = tennisReducer(base, { type: 'CONFIRM_ROUND', roundIdx: 1 });
  it.each([
    ['UNDO', { type: 'UNDO', roundIdx: 1, courtId: 1 }],
    ['EDIT_COURT_SETTINGS', { type: 'EDIT_COURT_SETTINGS', roundIdx: 1, courtId: 1 }],
    ['ADD_COURT', { type: 'ADD_COURT', roundIdx: 1 }],
    ['DELETE_COURT', { type: 'DELETE_COURT', roundIdx: 1, courtId: 1 }],
    ['INCREMENT_GAME', { type: 'INCREMENT_GAME', roundIdx: 1, courtId: 1, side: 'A' }],
    ['EXTEND_TO_THREE_SETS', { type: 'EXTEND_TO_THREE_SETS', roundIdx: 1, courtId: 1 }],
  ])('%s는 확정 라운드에서 no-op', (_name, action) => {
    expect(tennisReducer(confirmed, action)).toBe(confirmed);
  });
  it('확정취소 후에는 다시 편집된다', () => {
    const reopened = tennisReducer(confirmed, { type: 'UNCONFIRM_ROUND', roundIdx: 1 });
    const undone = tennisReducer(reopened, { type: 'UNDO', roundIdx: 1, courtId: 1 });
    expect(undone.rounds[0].courts[0].status).toBe('playing');
  });
});

describe('SET_PHASE', () => {
  it('playing↔summary만 허용', () => {
    const s = tennisReducer(base, { type: 'SET_PHASE', phase: 'summary' });
    expect(s.phase).toBe('summary');
    expect(tennisReducer(s, { type: 'SET_PHASE', phase: 'playing' }).phase).toBe('playing');
    expect(tennisReducer(s, { type: 'SET_PHASE', phase: 'done' })).toBe(s); // 화이트리스트 밖 no-op
  });
});
```

- [ ] **Step 6: 실패 확인** — `npx vitest run src/hooks/__tests__/tennisReducerConfirm.test.js` → FAIL

- [ ] **Step 7: 리듀서 구현** — `useTennisReducer.js`:
  ① `tennisInitialState`에 `confirmedRounds: {}` 추가(`gameFinalized` 위줄).
  ② 파일 상단에 import 추가: `import { isRoundComplete } from '../utils/tennis/roundConfirm';`
  ③ `tennisReducer` 함수 첫머리(switch 앞)에 단일 가드:

```js
  // 확정된 라운드의 코트는 편집 불가 — UI 차단만으로는 실시간 동기화 다중 탭에서 뚫린다.
  const COURT_EDIT_ACTIONS = new Set([
    'ADD_COURT', 'DELETE_COURT', 'SET_COURT_FORMAT', 'SET_COURT_BEST_OF',
    'ASSIGN_PLAYER', 'REMOVE_PLAYER', 'SWAP_SIDES', 'START_COURT',
    'INCREMENT_GAME', 'INCREMENT_TIEBREAK_POINT', 'INCREMENT_STAT',
    'END_SET', 'UNDO', 'EDIT_COURT_SETTINGS', 'EXTEND_TO_THREE_SETS',
  ]);
```

  (Set 선언은 모듈 스코프 상수로 — 함수 안에서 매 디스패치마다 재생성하지 않는다.) switch 직전에:

```js
  if (COURT_EDIT_ACTIONS.has(action.type) && (state.confirmedRounds || {})[action.roundIdx]) {
    return state;
  }
```

  ④ 액션 3종 추가(`FINALIZE` case 위):

```js
    case 'CONFIRM_ROUND': {
      const r = (state.rounds || []).find(x => x.roundIdx === action.roundIdx);
      if (!r || !isRoundComplete(r)) return state;
      return { ...state, confirmedRounds: { ...(state.confirmedRounds || {}), [action.roundIdx]: true } };
    }

    case 'UNCONFIRM_ROUND': {
      const next = { ...(state.confirmedRounds || {}) };
      delete next[action.roundIdx];
      return { ...state, confirmedRounds: next };
    }

    case 'SET_PHASE':
      // 마감 확인 화면 왕복 전용. done 전이는 FINALIZE가 담당한다.
      if (action.phase !== 'playing' && action.phase !== 'summary') return state;
      return { ...state, phase: action.phase };
```

- [ ] **Step 8: 통과 확인** — Step 5 테스트 → PASS

- [ ] **Step 9: normalize 실패 테스트** — `normalizeTennisMatch.test.js`에 블록 추가:

```js
describe('confirmedRounds 보정', () => {
  it('없으면 {} — 기존 진행 경기 하위 호환', () => {
    expect(normalizeTennisMatch({ rounds: [] }).confirmedRounds).toEqual({});
  });
  it('RTDB가 배열로 되돌려도 객체로 복원한다', () => {
    // roundIdx가 1부터라 RTDB는 [null, true, true]로 저장할 수 있다
    const out = normalizeTennisMatch({ rounds: [], confirmedRounds: [null, true, true] });
    expect(out.confirmedRounds).toEqual({ 1: true, 2: true });
  });
  it('객체는 true 값만 유지한다', () => {
    const out = normalizeTennisMatch({ rounds: [], confirmedRounds: { 1: true, 2: false, 3: 'x' } });
    expect(out.confirmedRounds).toEqual({ 1: true });
  });
});
```

(기존 파일의 import 형태에 맞춰 `normalizeTennisMatch`만 쓰면 된다.)

- [ ] **Step 10: normalize 구현** — `normalizeTennisMatch.js`에 helper + 반환 필드 추가:

```js
// confirmedRounds는 숫자 키 객체 — RTDB가 [null,true,…] 배열로 되돌릴 수 있다.
function normalizeConfirmedRounds(v) {
  if (!v || typeof v !== 'object') return {};
  const out = {};
  for (const [k, val] of Object.entries(v)) {
    if (val === true) out[k] = true;
  }
  return out;
}
```

`normalizeTennisMatch` 반환 객체에 `confirmedRounds: normalizeConfirmedRounds(state.confirmedRounds),` 추가.

- [ ] **Step 11: 동기화 등록** — `firebaseSyncDiff.js`:
  ① `TENNIS_WHOLE_REPLACE_FIELDS`를 `['rounds', 'guests', 'confirmedRounds']`로.
  ② `reconstructState`의 테니스 whole-replace 구역(`rounds: raw.rounds,` / `guests: raw.guests,` 옆)에 `confirmedRounds: raw.confirmedRounds,` 추가 — 기본값 없이(주석 규칙 준수).
  ③ `npx vitest run src/services/__tests__/tennisSyncCoverage.test.js` → 분류 가드 자동 통과 확인(TENNIS_WHOLE_REPLACE가 allSets에 포함되므로 수정 불필요가 정상. 실패하면 원인 보고).

- [ ] **Step 12: 전체 테스트 + 커밋**

```bash
npm test && npx eslint src/utils/tennis/roundConfirm.js src/hooks/useTennisReducer.js src/utils/tennis/normalizeTennisMatch.js src/services/firebaseSyncDiff.js
git add -A src/utils/tennis src/hooks src/services/firebaseSyncDiff.js
git commit -m "feat(tennis): 라운드 확정 상태 — confirmedRounds, 편집 차단 가드, 동기화 등록"
```

---

### Task 2: 하단 바 3상태 + 확정 UI + 게이트 배선

**Files:**
- Modify: `src/components/tennis/TennisConfirmBar.jsx` (전면 교체)
- Modify: `src/components/tennis/TennisRoundNav.jsx` (+ 라운드 게이트)
- Modify: `src/components/tennis/TennisCourtCard.jsx` (locked prop)
- Modify: `src/TennisApp.jsx` (배선)

**Interfaces:**
- Consumes: Task 1의 `roundConfirm.js` 헬퍼 4종, `CONFIRM_ROUND`/`UNCONFIRM_ROUND`.
- Produces: `<TennisConfirmBar round isConfirmed onConfirm onUnconfirm C styles />`, `<TennisRoundNav … canAddRound />`, `<TennisCourtCard … locked />`. (Task 3이 이 prop 이름에 의존한다.)

- [ ] **Step 1: TennisConfirmBar 교체** — 전체를 다음으로:

```jsx
import { isRoundComplete, unfinishedCourtLabels } from '../../utils/tennis/roundConfirm';

// 하단 고정 바 — 보는 라운드의 확정 상태에 따라 3가지 모습.
//   미확정+전 코트 완료 → [라운드 N 확정]
//   미확정+미완료 존재 → 비활성 + 미완료 코트 안내 (자동 폐기 없음 — 스펙 §2)
//   확정됨           → [라운드 N 확정취소]
export default function TennisConfirmBar({ round, isConfirmed, onConfirm, onUnconfirm, C, styles: s }) {
  if (!round) return null;
  const complete = isRoundComplete(round);
  const unfinished = unfinishedCourtLabels(round);

  if (isConfirmed) {
    return (
      <div style={{ ...s.bottomBar, flexDirection: 'column', gap: 6 }}>
        <button onClick={onUnconfirm} style={s.btnFull(C.orange)}>
          라운드 {round.roundIdx} 확정취소
        </button>
      </div>
    );
  }
  return (
    <div style={{ ...s.bottomBar, flexDirection: 'column', gap: 6 }}>
      {!complete && (
        <div style={{ fontSize: 12, color: C.orange }}>
          미완료 코트: {unfinished.join(', ')} — 삭제하거나 기록을 완료해야 확정할 수 있습니다
        </div>
      )}
      <button disabled={!complete} onClick={onConfirm}
        style={{ ...s.btnFull(complete ? C.accent : C.cardLight), opacity: complete ? 1 : 0.6 }}>
        라운드 {round.roundIdx} 확정
      </button>
    </div>
  );
}
```

- [ ] **Step 2: TennisRoundNav 게이트** — props에 `canAddRound` 추가, '+ 라운드' 버튼을:

```jsx
      <button onClick={() => canAddRound && dispatch({ type: 'ADD_ROUND' })}
        disabled={!canAddRound}
        style={{ ...s.btnSm(), opacity: canAddRound ? 1 : 0.4 }}>
        + 라운드
      </button>
```

- [ ] **Step 3: TennisCourtCard locked** — `TennisCourtCard`와 `DoneCourtCard`에 `locked` prop 추가. `DoneCourtCard`의 버튼 행(`되돌리기`/`설정 수정` div)을 다음으로 감싼다:

```jsx
          {locked ? (
            <div style={{ fontSize: 12, color: C.gray, textAlign: 'center', padding: '4px 0' }}>
              확정된 라운드 — 수정하려면 하단에서 확정취소
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 6 }}>
              {/* 기존 되돌리기/설정 수정 버튼 그대로 */}
            </div>
          )}
```

`TennisCourtCard`는 `locked`를 `DoneCourtCard`로 전달만(확정 라운드엔 done 코트만 존재 — CONFIRM_ROUND 가드가 보장하므로 setup/recorder 분기는 손대지 않는다).

- [ ] **Step 4: TennisApp 배선** — ① import에 `roundConfirm` 헬퍼 추가 ② 파생값:

```jsx
  const viewingConfirmed = !!(state.confirmedRounds || {})[state.viewingRoundIdx];
  const canAddRound = isLastRoundConfirmed(state.rounds, state.confirmedRounds);
```

③ 핸들러(풋살처럼 confirm 다이얼로그):

```jsx
  const handleConfirmRound = () => {
    if (!confirm(`라운드 ${round.roundIdx}을 확정할까요?\n확정하면 이 라운드는 수정할 수 없습니다(확정취소로 해제 가능).`)) return;
    dispatch({ type: 'CONFIRM_ROUND', roundIdx: round.roundIdx });
  };
  const handleUnconfirmRound = () => {
    if (!confirm(`라운드 ${round.roundIdx} 확정을 취소할까요?\n취소하면 이 라운드를 다시 수정할 수 있습니다.`)) return;
    dispatch({ type: 'UNCONFIRM_ROUND', roundIdx: round.roundIdx });
  };
```

④ 렌더 교체: `TennisRoundNav`에 `canAddRound={canAddRound}`, 각 `TennisCourtCard`에 `locked={viewingConfirmed}`, '+ 코트' 버튼을 `{!viewingConfirmed && (…기존 버튼…)}`로, 하단 바를 `<TennisConfirmBar round={round} isConfirmed={viewingConfirmed} onConfirm={handleConfirmRound} onUnconfirm={handleUnconfirmRound} C={C} styles={s} />`로. 기존 `unfinished` useMemo(68-74행)와 `handleFinalize`는 **이 태스크에서 삭제하지 않는다**(Task 3이 이동) — 단 `TennisConfirmBar` 호출부에서 기존 props(`unfinishedCourts`/`onFinalize`/`busy`)는 제거된다. 빌드가 깨지지 않게 `handleFinalize`에 `// eslint-disable-next-line no-unused-vars` 대신 **Task 3까지 임시로 상단 pill 없이 미사용 상태를 허용** — lint가 미사용 함수를 잡으면 Task 3에서 쓰일 것이므로 이 태스크에서 함수 위에 `/* Task 3에서 summary로 이동 예정 */` 주석과 함께 lint 통과 형태(예: 임시 `void handleFinalize;`)로 둔다.

- [ ] **Step 5: 검증 + 커밋** — `npm test`(760+ 유지) + `npm run lint` + `npm run build`, TennisApp/카드 선언 순서 육안 확인.

```bash
git add src/components/tennis src/TennisApp.jsx
git commit -m "feat(tennis): 하단 바를 라운드 확정/확정취소로 교체 — +라운드·+코트 게이트"
```

---

### Task 3: 경기 마감 상단 이동 + TennisSummaryView

**Files:**
- Create: `src/components/tennis/TennisSummaryView.jsx`
- Modify: `src/TennisApp.jsx` (마감 pill, phase 분기, 핸들러 분리)
- Modify: `src/components/tennis/TennisResultsModal.jsx` (세트 문자열에 TB 표시 — 소폭)

**Interfaces:**
- Consumes: Task 1 `allRoundsConfirmed`, Task 2 배선 상태. 기존 전송 체인(`buildTennisMatchRows`/`buildTennisPlayerGameRows`/`TennisSync.writeMatches`/`writePlayerGames`), `FirebaseSync.saveFinalized`/`clearState`.
- Produces: `<TennisSummaryView state roster isAdmin busy gameFinalized onBack onSubmit onArchive C styles />`.

- [ ] **Step 1: TennisResultsModal TB 표시** — `setsStr` 계산을 `DoneCourtCard`와 같은 관례로:

```jsx
            const setsStr = (court.sets || [])
              .filter(set => setWinner(set))
              .map(set => `${set.a}:${set.b}${(set.tbA || set.tbB) ? ` (${set.tbA}-${set.tbB})` : ''}`)
              .join('  ');
```

- [ ] **Step 2: TennisSummaryView 작성**

```jsx
import TennisResultsModal from './TennisResultsModal';

// 마감 확인 화면(phase 'summary'/'done'). 풋살 summary phase 이식 —
// 여기서만 시트 전송이 일어나고(관리자), 성공 후 아카이브로 마무리한다.
export default function TennisSummaryView({ state, isAdmin, busy, onBack, onSubmit, onArchive, C, styles: s }) {
  const finalized = state.gameFinalized === true;

  // 게임 전체 에이스/DF 합산 — court.stats {player: {aces, df}}
  const statTotals = {};
  for (const r of (state.rounds || [])) for (const c of (r.courts || [])) {
    for (const [player, st] of Object.entries(c.stats || {})) {
      const cur = statTotals[player] || { aces: 0, df: 0 };
      statTotals[player] = { aces: cur.aces + (st.aces || 0), df: cur.df + (st.df || 0) };
    }
  }
  const statRows = Object.entries(statTotals)
    .filter(([, v]) => v.aces > 0 || v.df > 0)
    .sort((a, b) => b[1].aces - a[1].aces);

  return (
    <div style={{ paddingBottom: 120 }}>
      {!finalized && (
        <button onClick={onBack} style={{ ...s.btnSm(), margin: '0 16px 10px' }}>← 경기로 돌아가기</button>
      )}

      <div style={s.section}>
        <TennisResultsModal rounds={state.rounds} C={C} styles={s} />

        {statRows.length > 0 && (
          <div style={{ ...s.card, marginTop: 10 }}>
            <div style={s.sectionTitle}>에이스 · 더블폴트</div>
            {statRows.map(([player, v]) => (
              <div key={player} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '3px 0', color: C.gray }}>
                <span style={{ color: C.white }}>{player}</span>
                <span style={{ fontVariantNumeric: 'tabular-nums' }}>🎾 {v.aces} · DF {v.df}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ ...s.bottomBar, flexDirection: 'column', gap: 6 }}>
        <button disabled={!isAdmin || busy || finalized} onClick={onSubmit}
          style={{ ...s.btnFull(finalized ? C.green : isAdmin ? C.accent : C.cardLight), opacity: isAdmin || finalized ? 1 : 0.5 }}>
          {finalized ? '전송 완료' : busy ? '전송 중...' : isAdmin ? '기록확정 (구글시트 전송)' : '기록확정 (관리자만)'}
        </button>
        <button disabled={!finalized} onClick={onArchive}
          style={{ ...s.btnFull(finalized ? C.accent : C.cardLight), opacity: finalized ? 1 : 0.5 }}>
          아카이브 저장
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: TennisApp 개편**
  ① 기존 `handleFinalize`를 둘로 분리:

```jsx
  // summary의 "기록확정" — 시트 전송 + FINALIZE. 실패 시 미확정 유지(기존 규칙).
  const handleSubmitRecords = async () => {
    setBusy(true);
    try {
      const memberSet = new Set(roster.map(m => m.name));
      const gradeByPlayer = Object.fromEntries(roster.map(m => [m.name, m.grade]));
      const inputTime = new Date().toISOString().slice(0, 19).replace('T', ' ');
      const matchRows = buildTennisMatchRows({ team, state, inputTime, memberSet });
      const pgRows = buildTennisPlayerGameRows({ team, state, inputTime, memberSet, gradeByPlayer });
      const results = await Promise.allSettled([
        TennisSync.writeMatches(matchRows),
        TennisSync.writePlayerGames(pgRows),
      ]);
      const failed = results.filter(r => r.status === 'rejected');
      if (failed.length > 0) {
        alert(`전송 실패 ${failed.length}건 — 미확정 상태를 유지합니다.\n${failed.map(f => f.reason?.message).join('\n')}`);
        return;
      }
      dispatch({ type: 'FINALIZE' });
      alert('전송 완료 — 아카이브 저장으로 마무리하세요.');
    } finally {
      setBusy(false);
    }
  };

  // "아카이브 저장" — finalized 노드 보관 후 active 제거(풋살 Archive 관례).
  const handleArchive = async () => {
    setBusy(true);
    try {
      await FirebaseSync.saveFinalized(team, state.gameId, { ...state, gameFinalized: true });
      await FirebaseSync.clearState(team, state.gameId);
      alert('아카이브 완료');
      onBackToMenu();
    } catch (e) {
      alert(`아카이브 실패 — 데이터 보존을 위해 경기를 지우지 않았습니다.\n${e?.message || ''}`);
    } finally {
      setBusy(false);
    }
  };
```

  기존 `handleFinalize`와 `unfinished` useMemo, Task 2의 임시 `void` 처리 제거.
  ② 마감 pill — `MatchTabBar` tabs 배열의 '경기삭제' 앞에:

```jsx
          {
            key: 'finish', label: '경기 마감', tone: 'green',
            strong: allRoundsConfirmed(state.rounds, state.confirmedRounds),
            onClick: () => {
              if (!allRoundsConfirmed(state.rounds, state.confirmedRounds)) {
                alert('모든 라운드를 확정해야 마감할 수 있습니다.');
                return;
              }
              dispatch({ type: 'SET_PHASE', phase: 'summary' });
            },
          },
```

  ③ phase 분기 — `if (state.phase === 'setup')` 분기 아래에:

```jsx
  if (state.phase === 'summary' || state.phase === 'done') {
    return (
      <div style={s.app}>
        <div style={s.header}>
          <div style={s.title}>🎾 경기 마감</div>
          <div style={s.subtitle}>{state.gameDate} · 기록 확인</div>
        </div>
        <TennisSummaryView state={state} isAdmin={teamContext?.role === '관리자'} busy={busy}
          onBack={() => dispatch({ type: 'SET_PHASE', phase: 'playing' })}
          onSubmit={handleSubmitRecords} onArchive={handleArchive} C={C} styles={s} />
      </div>
    );
  }
```

  ④ import 추가(`TennisSummaryView`, `allRoundsConfirmed`), `summarizeCourt` import는 unfinished 제거 후 미사용이면 함께 제거. **선언 순서 육안 검증**(핸들러가 사용하는 값들이 위에 선언돼 있는지).

- [ ] **Step 4: 검증 + 커밋** — `npm test` + `npm run lint` + `npm run build`.

```bash
git add src/components/tennis src/TennisApp.jsx
git commit -m "feat(tennis): 경기 마감 2단계화 — 상단 pill, summary 확인 화면, 관리자 전송+아카이브"
```

---

### Task 4: 통합 검증 (브라우저 스모크)

**Files:** 없음(검증 전용).

- [ ] **Step 1: 전체 스위트/린트/빌드** — `npm test`(신규 포함 전부), `npm run lint`, `npm run build`.
- [ ] **Step 2: 브라우저 스모크** — `npm run dev` + Playwright: 새 테니스 경기를 만들어 ① 코트 완료 전 하단 확정 버튼 비활성+미완료 안내 ② 판 완료 후 확정 → 카드 읽기 전용 문구 + '+ 코트' 숨김 + '+ 라운드' 활성 ③ 확정취소 → 수정 부활 ④ 전 라운드 확정 후 상단 "경기 마감" → summary 렌더(기록 나열·비관리자 버튼 비활성) ⑤ "← 경기로 돌아가기" 왕복 ⑥ 풋살 팀 화면 무영향. 시트 전송/아카이브는 실행하지 않는다(운영 데이터 — 유저가 실경기에서 확인).
- [ ] **Step 3: 하위 호환 확인** — 진행 중인 기존 경기(2026-08-07)를 열어 confirmedRounds 없이도 정상 렌더(전 라운드 미확정 표시)되는지 확인. 이 경기의 실제 정리·확정·마감은 유저 몫이므로 열람만.

---

## Self-Review 결과

- **Spec coverage**: §3 상태·동기화 5곳(Task 1), §4 액션·차단(Task 1), §5.1 하단 바 3상태(Task 2), §5.2 읽기 전용+게이트(Task 2), §5.3 마감 pill+summary+전송+아카이브(Task 3), §6 하위 호환(normalize {} + Task 4 확인), §7 에러(전송 실패 유지·아카이브 실패 보존·no-op 가드), §8 테스트(Task 1 유닛 + Task 4 스모크). §9 범위 밖 침범 없음.
- **Placeholder scan**: Task 3 Step 2의 "기존 되돌리기/설정 수정 버튼 그대로" 주석은 Task 2 Step 3 감싸기 지시의 참조 — 실코드는 기존 파일에 있으므로 placeholder 아님. 그 외 없음.
- **Type consistency**: `confirmedRounds` 키 접근은 전부 `[roundIdx]` 숫자/문자 혼용 — JS 객체 속성 접근은 문자열 강제라 normalize의 문자 키와 리듀서의 숫자 키가 동일 속성으로 수렴함(테스트 `toEqual({1:true})`이 이를 검증). prop 이름(`locked`/`canAddRound`/`isConfirmed`)은 Task 2 Produces와 Task 3 소비부 일치.
