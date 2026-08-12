# 테니스 커스텀 스코어링 옵션 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 경기 생성 시 상단에서 TB 방식(7점↔1점 데스)과 에이스/DF 스코어 반영(끔↔켬)을 골라 경기에 스냅샷 저장하고, 스코어링 엔진이 그대로 동작하게 한다.

**Architecture:** 스코어링 순수함수(`tennisScoring.js`)를 `scoringRules` 파라미터로 열고, 리듀서가 `state.scoringRules`를 전달한다. 설정은 팀 기본값(`getEffectiveSettings`)에서 로드해 경기 생성 시 `state.scoringRules`로 고정한다.

**Tech Stack:** React(Vite)+vitest. 테니스 파일 + `settings.js`의 테니스 블록 + `firebaseSyncDiff.js`의 테니스 상수만 수정.

**Spec:** `docs/superpowers/specs/2026-08-12-tennis-custom-scoring-design.md` — 어긋나면 스펙이 이긴다.

## Global Constraints

- **풋살/축구 무영향.** `scoringRules`는 **테니스 전용 필드**(풋살엔 없음). `firebaseSyncDiff.js`의 풋살 상수(META/WHOLE_REPLACE/CHILD_NODE) 수정 금지 — `TENNIS_WHOLE_REPLACE_FIELDS`에만 추가. `settings.js`는 `SPORT_DEFAULTS.테니스`만.
- **회귀 교훈(직전 커밋 7b138e6)**: reconstructState의 테니스 전용 필드는 기본값 땜질(`|| {}`) 금지 — normalize 단일 지점이 담당. 단, scoringRules는 테니스 전용이라 풋살 공유 필드 함정과 무관. 동기화 왕복 테스트 필수.
- TB 진입은 **5:5 고정**(6:6 미지원). `isTiebreakActive`(5:5 판정)는 수정하지 않는다.
- 에이스/DF 스코어 반영은 **TB 진행 중 미적용**(stats만). 되돌리기(UNDO)는 stats와 게임 점수를 **함께** 되돌린다.
- 설정은 **경기 시작(phase 'setup') 전에만** 변경 가능. 기존/진행 중 경기는 normalize 기본값(`'7point'`, `false`)으로 폴백.
- 렌더 검증 공백(메모리 규칙): jsx 변경은 선언 순서 육안 + diff 정독 + 브라우저 스모크.
- 커밋 스타일 `feat(tennis): …`. 테스트 `npx vitest run <파일>`, 전체 `npm test`(현재 781 통과 유지).

---

### Task 1: 설정 스키마 + 스코어링 엔진 파라미터화

**Files:**
- Modify: `src/config/settings.js` (`SPORT_DEFAULTS.테니스`에 scoringRules)
- Modify: `src/utils/tennis/tennisScoring.js` (`incrementTiebreakPoint`에 rules 인자)
- Test: `src/utils/tennis/__tests__/tennisScoring.test.js` (블록 추가)

**Interfaces:**
- Produces: `SPORT_DEFAULTS.테니스.scoringRules = { tiebreakMode: '7point', acesDfAffectScore: false }`. `incrementTiebreakPoint(set, side, rules = {})` — `rules.tiebreakMode === '1point'`이면 첫 포인트(threshold 1)에 6게임 확정, 아니면 7점(기존).

- [ ] **Step 1: 실패 테스트 추가** — `tennisScoring.test.js`에 append(기존 import 재사용):

```js
import { incrementTiebreakPoint } from '../tennisScoring';

describe('incrementTiebreakPoint — 모드별', () => {
  const tbSet = { a: 5, b: 5, tbA: 0, tbB: 0, done: false }; // 5:5 TB 활성

  it("기본(7point): 6점까진 게임 안 오르고 7점에 6:5", () => {
    let s = tbSet;
    for (let i = 0; i < 6; i++) s = incrementTiebreakPoint(s, 'A', { tiebreakMode: '7point' });
    expect(s).toMatchObject({ tbA: 6, a: 5 }); // 아직 게임 안 오름
    s = incrementTiebreakPoint(s, 'A', { tiebreakMode: '7point' });
    expect(s).toMatchObject({ tbA: 7, a: 6, b: 5 }); // 7점 → 6게임
  });

  it("1point 모드: 첫 포인트에 즉시 6:5", () => {
    const s = incrementTiebreakPoint(tbSet, 'A', { tiebreakMode: '1point' });
    expect(s).toMatchObject({ tbA: 1, a: 6, b: 5 });
    const sB = incrementTiebreakPoint(tbSet, 'B', { tiebreakMode: '1point' });
    expect(sB).toMatchObject({ tbB: 1, b: 6, a: 5 });
  });

  it("rules 없으면 7point 기본", () => {
    let s = tbSet;
    for (let i = 0; i < 7; i++) s = incrementTiebreakPoint(s, 'A');
    expect(s).toMatchObject({ tbA: 7, a: 6 });
  });

  it("5:5 아니면(TB 비활성) 변화 없음", () => {
    const notTb = { a: 4, b: 3, tbA: 0, tbB: 0, done: false };
    expect(incrementTiebreakPoint(notTb, 'A', { tiebreakMode: '1point' })).toBe(notTb);
  });
});
```

- [ ] **Step 2: 실패 확인** — `npx vitest run src/utils/tennis/__tests__/tennisScoring.test.js` → FAIL (arity 불일치로 1point 케이스 실패)

- [ ] **Step 3: tennisScoring.js 수정** — `incrementTiebreakPoint`를 rules 인자로:

```js
export function incrementTiebreakPoint(set, side, rules = {}) {
  if (!set || set.done || !isTiebreakActive(set)) return set;
  const key = side === 'A' ? 'tbA' : 'tbB';
  const next = { ...set, [key]: (set[key] || 0) + 1 };
  const threshold = rules.tiebreakMode === '1point' ? 1 : TIEBREAK_POINTS_TO_WIN;
  if (next[key] >= threshold) {
    // 승자가 6번째 게임을 가져간다 → 6:5
    if (side === 'A') next.a = GAMES_TO_WIN_SET;
    else next.b = GAMES_TO_WIN_SET;
  }
  return next;
}
```

파일 상단 규칙 주석에 "타이브레이크는 7점 노애드가 기본, 팀 설정에 따라 1포인트 단판 데스도 가능" 한 줄 추가.

- [ ] **Step 4: settings.js 수정** — `SPORT_DEFAULTS.테니스`의 `pointRules` 아래(같은 객체 내)에:

```js
    // 경기 스코어링 규칙. 경기 생성 시 이 값을 state.scoringRules로 스냅샷한다.
    scoringRules: {
      tiebreakMode: '7point',     // '7point'(5:5 노애드 7점) | '1point'(5:5 단판 데스)
      acesDfAffectScore: false,   // false(분석 전용) | true(에이스=서버편 득점, DF=상대편 득점)
    },
```

- [ ] **Step 5: 통과 확인 + 커밋** — `npx vitest run src/utils/tennis/__tests__/tennisScoring.test.js` → PASS, 이어 `npm test` 전체 PASS.

```bash
git add src/config/settings.js src/utils/tennis/tennisScoring.js src/utils/tennis/__tests__/tennisScoring.test.js
git commit -m "feat(tennis): 스코어링 규칙 설정 + TB 1점 데스 모드 파라미터화"
```

---

### Task 2: 리듀서 통합 + normalize + 동기화

**Files:**
- Modify: `src/utils/tennis/normalizeTennisMatch.js` (scoringRules 보정 + export)
- Modify: `src/hooks/useTennisReducer.js` (initialState, SET_SCORING_RULES, INCREMENT_TIEBREAK_POINT/INCREMENT_STAT/UNDO)
- Modify: `src/services/firebaseSyncDiff.js` (TENNIS_WHOLE_REPLACE_FIELDS + reconstructState)
- Test: `src/hooks/__tests__/tennisReducerScoring.test.js`, `src/utils/tennis/__tests__/normalizeTennisMatch.test.js`(블록 추가), `src/services/__tests__/tennisSyncCoverage.test.js`(왕복 케이스)

**Interfaces:**
- Consumes: Task 1의 `incrementTiebreakPoint(set, side, rules)`, `SPORT_DEFAULTS.테니스.scoringRules`.
- Produces: `state.scoringRules` 상태, `SET_SCORING_RULES { rules }` 액션(phase 'setup'에서만), `normalizeScoringRules(v)` export(normalizeTennisMatch.js). INCREMENT_STAT이 `acesDfAffectScore`면 게임 점수 반영, UNDO가 이를 되돌림.

- [ ] **Step 1: normalize 실패 테스트** — `normalizeTennisMatch.test.js`에 append:

```js
describe('scoringRules 보정', () => {
  it('없으면 기본값(7point, false)', () => {
    expect(normalizeTennisMatch({ rounds: [] }).scoringRules)
      .toEqual({ tiebreakMode: '7point', acesDfAffectScore: false });
  });
  it('부분/이상 값은 정규화', () => {
    expect(normalizeTennisMatch({ rounds: [], scoringRules: { tiebreakMode: '1point' } }).scoringRules)
      .toEqual({ tiebreakMode: '1point', acesDfAffectScore: false });
    expect(normalizeTennisMatch({ rounds: [], scoringRules: { tiebreakMode: 'xxx', acesDfAffectScore: true } }).scoringRules)
      .toEqual({ tiebreakMode: '7point', acesDfAffectScore: true });
  });
});
```

- [ ] **Step 2: 실패 확인** — `npx vitest run src/utils/tennis/__tests__/normalizeTennisMatch.test.js` → FAIL

- [ ] **Step 3: normalize 구현** — `normalizeTennisMatch.js`에 helper 추가 + 반환 필드:

```js
export function normalizeScoringRules(v) {
  const d = { tiebreakMode: '7point', acesDfAffectScore: false };
  if (!v || typeof v !== 'object') return d;
  return {
    tiebreakMode: v.tiebreakMode === '1point' ? '1point' : '7point',
    acesDfAffectScore: v.acesDfAffectScore === true,
  };
}
```

`normalizeTennisMatch` 반환 객체에 `scoringRules: normalizeScoringRules(state.scoringRules),` 추가.

- [ ] **Step 4: 리듀서 실패 테스트** — `src/hooks/__tests__/tennisReducerScoring.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { tennisReducer, tennisInitialState } from '../useTennisReducer';

const playingCourt = (over = {}) => ({
  courtId: 1, format: '단식', bestOf: 1, status: 'playing', currentSet: 0,
  sideA: ['갑'], sideB: ['을'], sets: [{ a: 2, b: 1, tbA: 0, tbB: 0, done: false }],
  stats: {}, undoStack: [], ...over,
});
const base = (rules, courtOver) => ({
  ...tennisInitialState, phase: 'playing', scoringRules: rules,
  rounds: [{ roundIdx: 1, courts: [playingCourt(courtOver)] }],
});
const court0 = (s) => s.rounds[0].courts[0];

describe('SET_SCORING_RULES', () => {
  it('setup에서만 변경, 이후 무시', () => {
    const s0 = { ...tennisInitialState }; // phase 'setup'
    const s1 = tennisReducer(s0, { type: 'SET_SCORING_RULES', rules: { tiebreakMode: '1point', acesDfAffectScore: true } });
    expect(s1.scoringRules).toEqual({ tiebreakMode: '1point', acesDfAffectScore: true });
    const playing = { ...s1, phase: 'playing' };
    expect(tennisReducer(playing, { type: 'SET_SCORING_RULES', rules: { tiebreakMode: '7point', acesDfAffectScore: false } })).toBe(playing);
  });
});

describe('INCREMENT_STAT 스코어 반영', () => {
  it('acesDfAffectScore=false: stats만 (기존)', () => {
    const s = tennisReducer(base({ tiebreakMode: '7point', acesDfAffectScore: false }),
      { type: 'INCREMENT_STAT', roundIdx: 1, courtId: 1, player: '갑', stat: 'aces' });
    expect(court0(s).stats['갑'].aces).toBe(1);
    expect(court0(s).sets[0]).toMatchObject({ a: 2, b: 1 }); // 점수 불변
  });
  it('true: 에이스=서버편 게임 +1', () => {
    const s = tennisReducer(base({ tiebreakMode: '7point', acesDfAffectScore: true }),
      { type: 'INCREMENT_STAT', roundIdx: 1, courtId: 1, player: '갑', stat: 'aces' });
    expect(court0(s).stats['갑'].aces).toBe(1);
    expect(court0(s).sets[0]).toMatchObject({ a: 3, b: 1 }); // 갑=sideA → a+1
  });
  it('true: DF=상대편 게임 +1', () => {
    const s = tennisReducer(base({ tiebreakMode: '7point', acesDfAffectScore: true }),
      { type: 'INCREMENT_STAT', roundIdx: 1, courtId: 1, player: '갑', stat: 'df' });
    expect(court0(s).sets[0]).toMatchObject({ a: 2, b: 2 }); // 갑 DF → 상대 b+1
  });
  it('true지만 TB 활성 중: stats만', () => {
    const s = tennisReducer(base({ tiebreakMode: '7point', acesDfAffectScore: true }, { sets: [{ a: 5, b: 5, tbA: 0, tbB: 0, done: false }] }),
      { type: 'INCREMENT_STAT', roundIdx: 1, courtId: 1, player: '갑', stat: 'aces' });
    expect(court0(s).stats['갑'].aces).toBe(1);
    expect(court0(s).sets[0]).toMatchObject({ a: 5, b: 5 }); // 게임 불변
  });
  it('UNDO: 스코어 반영분도 함께 되돌림', () => {
    const s1 = tennisReducer(base({ tiebreakMode: '7point', acesDfAffectScore: true }),
      { type: 'INCREMENT_STAT', roundIdx: 1, courtId: 1, player: '갑', stat: 'aces' });
    const s2 = tennisReducer(s1, { type: 'UNDO', roundIdx: 1, courtId: 1 });
    expect(court0(s2).stats['갑'].aces).toBe(0);
    expect(court0(s2).sets[0]).toMatchObject({ a: 2, b: 1 }); // 게임도 원복
  });
});

describe('INCREMENT_TIEBREAK_POINT 1point 모드', () => {
  it('첫 포인트에 6:5 세트', () => {
    const s = tennisReducer(base({ tiebreakMode: '1point', acesDfAffectScore: false }, { sets: [{ a: 5, b: 5, tbA: 0, tbB: 0, done: false }] }),
      { type: 'INCREMENT_TIEBREAK_POINT', roundIdx: 1, courtId: 1, side: 'A' });
    expect(court0(s).sets[0]).toMatchObject({ tbA: 1, a: 6, b: 5 });
  });
  it('UNDO: 6게임 → 5게임 복원(1point threshold)', () => {
    const s1 = tennisReducer(base({ tiebreakMode: '1point', acesDfAffectScore: false }, { sets: [{ a: 5, b: 5, tbA: 0, tbB: 0, done: false }] }),
      { type: 'INCREMENT_TIEBREAK_POINT', roundIdx: 1, courtId: 1, side: 'A' });
    const s2 = tennisReducer(s1, { type: 'UNDO', roundIdx: 1, courtId: 1 });
    expect(court0(s2).sets[0]).toMatchObject({ tbA: 0, a: 5 });
  });
});
```

- [ ] **Step 5: 실패 확인** — `npx vitest run src/hooks/__tests__/tennisReducerScoring.test.js` → FAIL

- [ ] **Step 6: 리듀서 구현** — `useTennisReducer.js`:
  ① import에 `normalizeScoringRules` 추가(`from '../utils/tennis/normalizeTennisMatch'`), `incrementTiebreakPoint`는 이미 import됨.
  ② `tennisInitialState`에 `scoringRules: { tiebreakMode: '7point', acesDfAffectScore: false },` 추가(`gameFinalized` 위).
  ③ `SET_SCORING_RULES` 케이스 추가(`SET_ATTENDEES` 근처):

```js
    case 'SET_SCORING_RULES':
      if (state.phase !== 'setup') return state;   // 경기 시작 후 고정
      return { ...state, scoringRules: normalizeScoringRules(action.rules) };
```

  ④ `INCREMENT_TIEBREAK_POINT`에 rules 전달:

```js
    case 'INCREMENT_TIEBREAK_POINT':
      return mapCourt(state, action.roundIdx, action.courtId, (c) => {
        if (c.status !== 'playing') return c;
        const cur = currentSetOf(c);
        if (!isTiebreakActive(cur)) return c;
        const next = incrementTiebreakPoint(cur, action.side, state.scoringRules);
        return pushUndo(withCurrentSet(c, next), { kind: 'tb', side: action.side, setIdx: c.currentSet });
      });
```

  ⑤ `INCREMENT_STAT`에 스코어 반영:

```js
    case 'INCREMENT_STAT':
      return mapCourt(state, action.roundIdx, action.courtId, (c) => {
        if (c.status !== 'playing') return c;
        const prev = c.stats[action.player] || { aces: 0, df: 0 };
        const stats = { ...c.stats, [action.player]: { ...prev, [action.stat]: (prev[action.stat] || 0) + 1 } };
        let nextCourt = { ...c, stats };
        let scoredSide = null;
        if (state.scoringRules?.acesDfAffectScore) {
          const cur = currentSetOf(c);
          if (cur && !isTiebreakActive(cur)) {   // TB 중엔 stats만
            const playerSide = c.sideA.includes(action.player) ? 'A' : 'B';
            const targetSide = action.stat === 'aces' ? playerSide : (playerSide === 'A' ? 'B' : 'A');
            const incd = incrementGame(cur, targetSide);
            if (incd !== cur) { nextCourt = withCurrentSet(nextCourt, incd); scoredSide = targetSide; }
          }
        }
        return pushUndo(nextCourt, { kind: 'stat', player: action.player, stat: action.stat, scoredSide, setIdx: c.currentSet });
      });
```

  (`incrementGame`은 이미 import됨.)
  ⑥ `UNDO`의 `stat` 케이스를 scoredSide 되돌림 포함으로:

```js
        if (last.kind === 'stat') {
          const prev = c.stats[last.player] || { aces: 0, df: 0 };
          const stats = { ...c.stats, [last.player]: { ...prev, [last.stat]: Math.max(0, (prev[last.stat] || 0) - 1) } };
          let base2 = { ...c, stats, undoStack: rest };
          if (last.scoredSide) {   // 스코어 반영분도 되돌림
            const setsCopy = [...c.sets];
            const key = last.scoredSide === 'A' ? 'a' : 'b';
            const sIdx = last.setIdx ?? c.currentSet;
            const sSet = setsCopy[sIdx];
            if (sSet) setsCopy[sIdx] = { ...sSet, [key]: Math.max(0, (sSet[key] || 0) - 1) };
            base2 = { ...base2, sets: setsCopy };
          }
          return base2;
        }
```

  ⑦ `UNDO`의 `tb` 케이스의 `>= 7 ? 5` 를 모드 반영으로:

```js
        if (last.kind === 'tb') {
          const s = sets[last.setIdx];
          const key = last.side === 'A' ? 'tbA' : 'tbB';
          const games = last.side === 'A' ? 'a' : 'b';
          const nextPoint = Math.max(0, (s[key] || 0) - 1);
          const threshold = state.scoringRules?.tiebreakMode === '1point' ? 1 : 7;
          const nextGames = (s[key] || 0) >= threshold ? 5 : s[games];
          sets[last.setIdx] = { ...s, [key]: nextPoint, [games]: nextGames };
          return { ...c, sets, undoStack: rest };
        }
```

- [ ] **Step 7: 통과 확인** — Step 4 테스트 + 전체 `npm test` PASS.

- [ ] **Step 8: 동기화 등록** — `firebaseSyncDiff.js`:
  ① `TENNIS_WHOLE_REPLACE_FIELDS`를 `['rounds', 'guests', 'confirmedRounds', 'scoringRules']`로.
  ② `reconstructState`의 테니스 whole-replace 구역(`guests: raw.guests,` 옆)에 `scoringRules: raw.scoringRules,` 추가 — 기본값 없이(normalize가 담당).
  ③ `tennisSyncCoverage.test.js`: SAMPLE_TENNIS_STATE에 `scoringRules: { tiebreakMode: '1point', acesDfAffectScore: true }` 추가 + 왕복(expand→reconstruct→normalize) 후 보존 단언. 분류 가드 통과 확인.

- [ ] **Step 9: 전체 + 커밋**

```bash
npm test && npx eslint src/hooks/useTennisReducer.js src/utils/tennis/normalizeTennisMatch.js src/services/firebaseSyncDiff.js
git add src/hooks/useTennisReducer.js src/utils/tennis/normalizeTennisMatch.js src/services/firebaseSyncDiff.js src/hooks/__tests__/tennisReducerScoring.test.js src/utils/tennis/__tests__/normalizeTennisMatch.test.js src/services/__tests__/tennisSyncCoverage.test.js
git commit -m "feat(tennis): scoringRules 리듀서 통합 — 에이스/DF 스코어 반영, UNDO 확장, 동기화"
```

---

### Task 3: UI — 경기 생성 설정 + 로드 + 표시

**Files:**
- Modify: `src/components/tennis/TennisAttendeeSelector.jsx` (규칙 토글)
- Modify: `src/TennisApp.jsx` (설정 로드, prop 전달)
- Modify: `src/components/tennis/TennisCourtCard.jsx` (scoringRules prop 전달)
- Modify: `src/components/tennis/TennisCourtRecorder.jsx` (TB 표시 문구, prop)

**Interfaces:**
- Consumes: Task 2 `SET_SCORING_RULES`, `state.scoringRules`. `getEffectiveSettings(team, '테니스')`(settings.js — 반환에 scoringRules 포함).
- Produces: 경기 생성 화면 규칙 토글 UI, recorder의 모드별 TB 문구.

- [ ] **Step 1: TennisApp 설정 로드** — 상단 import에 `import { getEffectiveSettings } from './config/settings';`. `isNewGame` 초기화 useEffect의 `SET_GAME_META` 디스패치 직후:

```js
      const eff = getEffectiveSettings(team, '테니스');
      if (eff?.scoringRules) dispatch({ type: 'SET_SCORING_RULES', rules: eff.scoringRules });
```

- [ ] **Step 2: TennisAttendeeSelector 토글** — props에 `scoringRules` 추가. `경기 시작` 버튼 위(참석자 칩 아래)에 규칙 선택 카드:

```jsx
      <div style={{ ...s.card, marginTop: 14 }}>
        <div style={s.sectionTitle}>경기 규칙</div>
        <RuleToggle label="타이브레이크(5:5)"
          options={[['7point', '노애드 7점'], ['1point', '단판 1점']]}
          value={scoringRules?.tiebreakMode || '7point'}
          onPick={(v) => dispatch({ type: 'SET_SCORING_RULES', rules: { ...scoringRules, tiebreakMode: v } })}
          C={C} s={s} />
        <RuleToggle label="에이스·더블폴트"
          options={[[false, '분석 전용'], [true, '점수 반영']]}
          value={scoringRules?.acesDfAffectScore || false}
          onPick={(v) => dispatch({ type: 'SET_SCORING_RULES', rules: { ...scoringRules, acesDfAffectScore: v } })}
          C={C} s={s} />
      </div>
```

파일 내부에 `RuleToggle` 로컬 컴포넌트(세그먼트 버튼 2개, 선택된 쪽 강조 — 기존 `s.chip`/`s.btnSm` 관례 사용):

```jsx
function RuleToggle({ label, options, value, onPick, C, s }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
      <span style={{ flex: 1, fontSize: 12, color: C.gray }}>{label}</span>
      <div style={{ display: 'flex', gap: 4 }}>
        {options.map(([v, lbl]) => (
          <button key={String(v)} onClick={() => onPick(v)}
            style={{ ...s.btnSm(), padding: '5px 10px', fontSize: 12,
              background: v === value ? C.accent : C.cardLight,
              color: v === value ? '#fff' : C.gray }}>
            {lbl}
          </button>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: TennisApp에서 selector에 prop 전달** — setup 분기의 `<TennisAttendeeSelector ... />`에 `scoringRules={state.scoringRules}` 추가.

- [ ] **Step 4: recorder TB 문구** — `TennisCourtCard`가 `scoringRules`를 받아 `TennisCourtRecorder`로 전달(TennisApp → card → recorder). recorder의 `타이브레이크 (7점)` 하드코딩을:

```jsx
        {tb ? `타이브레이크 (${court._tbMode === '1point' ? '1점 데스' : '7점'})` : `세트 ${court.currentSet + 1} / ${court.bestOf}`}
```

권장: court에 주입하지 말고 recorder가 `scoringRules` prop을 직접 받아 `scoringRules?.tiebreakMode`로 판정. '포인트 +1' 버튼 라벨도 1point면 '승부 포인트'로. TennisApp의 `<TennisCourtCard ... />`에 `scoringRules={state.scoringRules}` 추가, card가 recorder로 relay.

- [ ] **Step 5: 검증** — `npm test`(781+ 유지) + `npm run lint` + `npm run build`. TennisApp/selector/recorder 선언 순서 육안.

```bash
git add src/components/tennis/TennisAttendeeSelector.jsx src/TennisApp.jsx src/components/tennis/TennisCourtCard.jsx src/components/tennis/TennisCourtRecorder.jsx
git commit -m "feat(tennis): 경기 생성 규칙 토글 UI + 설정 로드 + TB 모드 표시"
```

---

### Task 4: 통합 검증 (브라우저 스모크)

**Files:** 없음(검증 전용).

- [ ] **Step 1: 전체 스위트/린트/빌드** — `npm test`, `npm run lint`, `npm run build`.
- [ ] **Step 2: 브라우저 스모크** — `npm run dev` + Playwright: 새 테니스 경기 생성 → ① 규칙 토글 2개 렌더·선택 동작 ② 단판 1점 선택 후 경기 시작, 코트에서 5:5 만든 뒤 '승부 포인트'(또는 포인트 버튼) 한 번에 6:5 세트 종료 ③ 에이스 '점수 반영' 선택 시 에이스 버튼이 서버 편 게임을 올리는지, DF가 상대 편을 올리는지 ④ UNDO로 stats+게임 함께 원복 ⑤ 경기 시작 후 규칙 토글이 안 보이거나 고정 ⑥ 풋살 팀 무영향. 시트 전송은 안 함(운영 데이터). 테스트 경기는 스모크 후 삭제.
- [ ] **Step 3: 하위 호환** — 진행 중 기존 경기(scoringRules 없음) 열어 현재 동작(7점 TB·분석전용)으로 폴백 렌더 확인.

---

## Self-Review 결과

- **Spec coverage**: §3 스키마(Task1), §4 상태·동기화 5지점(Task2), §5 엔진 파라미터화(Task1·2), §6 에이스/DF+UNDO(Task2), §7 UI(Task3), §8 로그 무변경(설계상 변경 없음 — 코드 변경 없음으로 충족), §9 하위호환(normalize 기본값+Task4 확인), §10 테스트(Task1·2 유닛+Task4 스모크). §11 범위 밖 침범 없음.
- **Placeholder scan**: Task 3 Step 4의 recorder 문구는 두 방식(court 주입 vs prop 직접)을 제시하고 prop 직접을 권장으로 명시 — 구현자가 prop 방식 채택. 그 외 TBD 없음.
- **Type consistency**: `scoringRules` 필드명·`tiebreakMode`/`acesDfAffectScore` 키가 settings→normalize→reducer→UI 전 구간 동일. `SET_SCORING_RULES` 액션·`normalizeScoringRules` 시그니처가 Task2 정의와 Task3 소비부 일치. UNDO 항목의 `scoredSide`/`setIdx`가 INCREMENT_STAT 생성부와 UNDO 소비부 일치.
