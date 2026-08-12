# 테니스 경기 진행·입력 UX 수정 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 실사용 UX 버그 5건 수정 — 용병 입력칸 가시성/칩 색, 6대2 일괄 입력, 라운드 확정 후 다음 라운드 버튼, 1점 데스 모드 TB 화면 제거.

**Architecture:** 스코어링 로직(이슈 3+5)은 `incrementGame(set, side, rules)` 재설계로 통합, UI 이슈(1,2,4)는 테니스 컴포넌트 스타일/배치 수정. 커스텀 스코어링(scoringRules)의 1점 모드를 "TB 포인트"에서 "게임으로 6:5"로 재정의한다.

**Tech Stack:** React(Vite)+vitest.

**Spec:** `docs/superpowers/specs/2026-08-12-tennis-match-ux-fixes-design.md` — 어긋나면 스펙이 이긴다.

## Global Constraints

- **풋살/축구 무영향.** 테니스 파일(`tennisScoring.js`, `useTennisReducer.js`, `TennisCourtRecorder.jsx`, `TennisAttendeeSelector.jsx`, `TennisConfirmBar.jsx`, `TennisApp.jsx`)만. 공용 `s.input`/`s.chip`(theme.js)은 **수정하지 않고** 사용처에서 오버라이드.
- `incrementGame` 시그니처에 `rules` 추가 — `rules` 미전달 시 7점 기본(하위호환). 호출부(리듀서 2곳) 모두 `state.scoringRules` 전달.
- **1점 모드 재정의**: 5:5에서 게임 버튼으로 6:5(세트승), TB 화면/포인트 없음. 7점 모드는 기존 TB 유지. 기존 1점 테스트(incrementTiebreakPoint threshold 1, INCREMENT_TIEBREAK_POINT 1점)는 incrementGame 1점 케이스로 이전.
- 렌더 검증 공백(메모리 규칙): jsx 선언 순서 육안 + diff 정독 + 브라우저 스모크.
- 커밋 스타일 `fix(tennis): …`. 전체 스위트(807) 통과 유지(1점 테스트 이전으로 카운트 변동 가능).

---

### Task 1: incrementGame(rules) 재설계 + 리듀서 배선 + recorder 1점 화면

**Files:**
- Modify: `src/utils/tennis/tennisScoring.js` (`incrementGame`에 rules)
- Modify: `src/hooks/useTennisReducer.js` (INCREMENT_GAME·INCREMENT_STAT에 scoringRules 전달)
- Modify: `src/components/tennis/TennisCourtRecorder.jsx` (tb 판정에 1점 제외)
- Test: `src/utils/tennis/__tests__/tennisScoring.test.js`(incrementGame 케이스 갱신, 기존 1점 incrementTiebreakPoint 케이스 정리), `src/hooks/__tests__/tennisReducerScoring.test.js`(1점 케이스 incrementGame으로 이전)

**Interfaces:**
- Produces: `incrementGame(set, side, rules = {})` — 스펙 §3.3 코드. 7점 모드 6:0~6:4 + 순서무관, 1점 모드 5:5→6:5 + 6:6 금지.

- [ ] **Step 1: incrementGame 실패 테스트** — `tennisScoring.test.js`의 기존 incrementGame 관련 테스트를 스펙 §5에 맞게 갱신/추가:

```js
describe('incrementGame — rules', () => {
  const s = (a, b) => ({ a, b, tbA: 0, tbB: 0, done: false });
  it('7점 모드(기본): 6게임 후 상대 6:4까지 순서무관, 6:5 금지', () => {
    expect(incrementGame(s(6, 0), 'B')).toMatchObject({ a: 6, b: 1 });      // 6:0→6:1 허용
    expect(incrementGame(s(6, 4), 'B')).toBe(/*변화없음*/ s(6, 4)) === false; // (아래 참조)
    expect(incrementGame(s(6, 4), 'B')).toMatchObject({ a: 6, b: 4 });      // 6:4→6:5 금지(변화없음)
    expect(incrementGame(s(6, 2), 'A')).toMatchObject({ a: 6, b: 2 });      // 7 금지
    expect(incrementGame(s(5, 0), 'A')).toMatchObject({ a: 6, b: 0 });      // 5:0→6:0 허용
  });
  it('7점 모드: 5:5는 게임+1 무시(TB로)', () => {
    const t = s(5, 5);
    expect(incrementGame(t, 'A')).toBe(t); // 변화 없음(참조 동일)
  });
  it('1점 모드: 5:5→6:5 세트승, 6:6 금지', () => {
    const r = { tiebreakMode: '1point' };
    expect(incrementGame(s(5, 5), 'A', r)).toMatchObject({ a: 6, b: 5 });
    expect(incrementGame(s(6, 0), 'B', r)).toMatchObject({ a: 6, b: 1 });
    expect(incrementGame(s(6, 5), 'B', r)).toMatchObject({ a: 6, b: 5 }); // 6:6 금지(변화없음)
    expect(incrementGame(s(6, 2), 'A', r)).toMatchObject({ a: 6, b: 2 }); // 7 금지
  });
});
```

(정확한 단언 형태는 구현자가 vitest 관용에 맞게 다듬되 — "변화 없음"은 반환이 입력과 동일값/참조인지로 검증. 위 `=== false` 줄은 삭제하고 toMatchObject로 통일.) 기존 tennisScoring.test.js의 incrementTiebreakPoint **1점 모드** 케이스는 제거(1점은 이제 incrementGame). 7점 incrementTiebreakPoint 케이스는 유지.

- [ ] **Step 2: 실패 확인** — `npx vitest run src/utils/tennis/__tests__/tennisScoring.test.js` → FAIL

- [ ] **Step 3: incrementGame 구현** — 스펙 §3.3 코드로 교체(rules 인자, oneMode 분기).

- [ ] **Step 4: 통과 확인** → PASS

- [ ] **Step 5: 리듀서 배선** — `useTennisReducer.js`:
  - INCREMENT_GAME(약 198행): `incrementGame(cur, action.side)` → `incrementGame(cur, action.side, state.scoringRules)`
  - INCREMENT_STAT 스코어 반영(약 224행): `incrementGame(cur, targetSide)` → `incrementGame(cur, targetSide, state.scoringRules)`
  - (INCREMENT_TIEBREAK_POINT는 7점 전용으로 그대로. UNDO tb threshold 로직도 그대로 — 1점은 tb undo가 생기지 않음.)

- [ ] **Step 6: 리듀서 1점 테스트 이전** — `tennisReducerScoring.test.js`의 1점 INCREMENT_TIEBREAK_POINT 케이스를, 1점 모드에서 **INCREMENT_GAME으로 5:5→6:5** 되는 케이스로 교체:

```js
it('1점 모드: 5:5에서 게임+1 → 6:5 세트승(TB 액션 없이)', () => {
  const st = base({ tiebreakMode: '1point', acesDfAffectScore: false }, { sets: [{ a: 5, b: 5, tbA: 0, tbB: 0, done: false }] });
  const s = tennisReducer(st, { type: 'INCREMENT_GAME', roundIdx: 1, courtId: 1, side: 'A' });
  expect(court0(s).sets[0]).toMatchObject({ a: 6, b: 5 });
});
```

(base/court0 헬퍼는 기존 파일 것 재사용.)

- [ ] **Step 7: recorder tb 판정** — `TennisCourtRecorder.jsx:84` `const tb = isTiebreakActive(cur);` → `const tb = isTiebreakActive(cur) && scoringRules?.tiebreakMode !== '1point';`. (tbLabel은 1점 모드에서 tb=false라 안 쓰이므로 그대로 둬도 무방.)

- [ ] **Step 8: 전체 + 커밋** — `npm test` + `npm run lint` + `npm run build`.

```bash
git add src/utils/tennis/tennisScoring.js src/hooks/useTennisReducer.js src/components/tennis/TennisCourtRecorder.jsx src/utils/tennis/__tests__/tennisScoring.test.js src/hooks/__tests__/tennisReducerScoring.test.js
git commit -m "fix(tennis): 6대2 일괄 입력 + 1점 데스 TB 화면 제거 — incrementGame rules 재설계"
```

---

### Task 2: 용병 입력칸/칩 + 라운드 확정 후 다음 라운드 버튼

**Files:**
- Modify: `src/components/tennis/TennisAttendeeSelector.jsx` (용병 input border, 용병 칩 파란)
- Modify: `src/components/tennis/TennisConfirmBar.jsx` (확정 상태 다음 라운드 버튼)
- Modify: `src/TennisApp.jsx` (canAddRound·onAddRound 전달)

**Interfaces:**
- Consumes: 기존 `s.chip`, `ADD_ROUND` 액션, `isLastRoundConfirmed`(roundConfirm.js).
- Produces: 용병 UI 개선, 확정 상태 하단 "다음 라운드 시작" 버튼.

- [ ] **Step 1: 용병 입력칸 테두리** — `TennisAttendeeSelector.jsx`의 용병 이름 `<input>`(현재 `style={{ ...s.input, flex: 1 }}`)에 보이는 테두리 추가: `style={{ ...s.input, flex: 1, border: \`1px solid ${C.grayDarker}\` }}`. (공용 s.input 미수정, 이 사용처만.)

- [ ] **Step 2: 용병 칩 파란색** — 용병 칩 `style={{ ...s.chip(false), cursor: 'default' }}` → `style={{ ...s.chip(true), cursor: 'default' }}`(참석=파란). `cursor: 'default'` 유지.

- [ ] **Step 3: TennisConfirmBar 다음 라운드 버튼** — 확정 상태(`isConfirmed`) 분기에서, `canAddRound`이면 주버튼 "다음 라운드 시작"(`s.btnFull(C.accent)`) + 보조 "라운드 N 확정취소"(작게: `s.btnSm` 또는 텍스트 스타일)로. `canAddRound` 아니면 기존 "확정취소"만. props에 `canAddRound`, `onAddRound` 추가:

```jsx
  if (isConfirmed) {
    return (
      <div style={{ ...s.bottomBar, flexDirection: 'column', gap: 6 }}>
        {canAddRound && (
          <button onClick={onAddRound} style={s.btnFull(C.accent)}>
            + 다음 라운드 시작
          </button>
        )}
        <button onClick={onUnconfirm}
          style={canAddRound
            ? { ...s.btnSm(), alignSelf: 'center', background: 'transparent', color: C.gray }
            : s.btnFull(C.orange)}>
          라운드 {round.roundIdx} 확정취소
        </button>
      </div>
    );
  }
```

- [ ] **Step 4: TennisApp 배선** — `<TennisConfirmBar … />`에 `canAddRound={canAddRound}`(이미 파생돼 있음) 와 `onAddRound={() => dispatch({ type: 'ADD_ROUND' })}` 전달. (canAddRound는 `isLastRoundConfirmed(state.rounds, state.confirmedRounds)` — 이미 TennisApp에 있음.)

- [ ] **Step 5: 검증 + 커밋** — `npm test` + `npm run lint` + `npm run build`. selector/confirmbar 선언 순서 육안.

```bash
git add src/components/tennis/TennisAttendeeSelector.jsx src/components/tennis/TennisConfirmBar.jsx src/TennisApp.jsx
git commit -m "fix(tennis): 용병 입력칸 가시성·칩 참석색 + 라운드 확정 후 다음 라운드 버튼"
```

---

### Task 3: 통합 검증 (브라우저 스모크)

**Files:** 없음.

- [ ] **Step 1: 전체 스위트/린트/빌드**.
- [ ] **Step 2: 브라우저 스모크** — `npm run dev` + Playwright:
  - **용병**: 경기 생성 화면에서 용병 이름 입력칸에 테두리 보임, 용병 추가 시 칩이 파란색(참석).
  - **일괄 입력(7점 모드)**: 코트에서 A 게임 6까지 → B 게임 2 입력되어 6:2 됨(순서 무관). 6:5는 게임으로 안 됨.
  - **1점 모드**: 설정/경기생성에서 1점 데스 선택 → 5:5 만들고 → 게임 버튼(TB 화면 없이) 1번 → 6:5 세트 승. "승부 포인트" 화면 안 뜸.
  - **라운드 버튼**: 라운드 확정 후 하단에 "+ 다음 라운드 시작" 큰 버튼 + "확정취소" 작은.
  - **풋살 무영향**: 풋살 팀 화면 정상.
  - 테스트 경기는 삭제 정리.
- [ ] **Step 3: 배포 안내** — Apps Script/시트 무변경 → 유저 반영 불필요.

---

## Self-Review 결과

- **Spec coverage**: §3.1 용병 input(Task2 Step1), §3.2 칩(Step2), §3.3 incrementGame(Task1 Step3+5), §3.4 라운드 버튼(Task2 Step3·4), §3.5 1점 TB 제거(Task1 Step5·7 + 테스트 이전 Step6), §5 테스트(Task1 유닛 + Task3 스모크). 범위 밖(대개편) 침범 없음.
- **Placeholder scan**: Task1 Step1 테스트의 `=== false` 줄은 "삭제하고 toMatchObject로 통일"이라 명시 — 구현자가 정리. 그 외 TBD 없음.
- **Type consistency**: `incrementGame(set, side, rules)` 시그니처가 리듀서 2개 호출부·테스트와 일치. `canAddRound`/`onAddRound` prop이 TennisConfirmBar·TennisApp 정합. `scoringRules?.tiebreakMode` 키가 스코어링 스펙과 동일.
