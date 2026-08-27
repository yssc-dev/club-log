# 테니스 마감 경기 자동 업로드·아카이브 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `autoUpload`를 켠 테니스 팀(현재 몽피스)의 마감된 경기를 매일 오전 10시(KST) GitHub Actions가 시트 업로드 + 아카이브까지 자동 처리한다.

**Architecture:** 앱은 `state.gradeSnapshot`(명부 등급 스냅샷)과 팀설정 체크박스만 추가한다. 실제 자동 실행은 `scripts/tennisAutoUpload.mjs`가 맡고, RTDB REST + Apps Script POST만 쓰되 행 생성 로직은 앱의 `tennisRowBuilders`를 그대로 import해 스키마 이중화를 피한다. 대상 판정은 순수 함수 `classifyAutoTarget`에 몰아 vitest로 검증한다.

**Tech Stack:** React 19 + Vite, Firebase RTDB(REST), Google Apps Script Web App, vitest, vite-node, GitHub Actions

**Spec:** `docs/superpowers/specs/2026-08-27-tennis-auto-upload-design.md`

## Global Constraints

- **풋살·축구 경로 무손상.** 이 계획이 건드리는 앱 파일은 테니스 전용 분기뿐이다. `appSync.js`, `analyticsV2`, 풋살 리듀서/컴포넌트는 한 줄도 수정하지 않는다.
- **`firebaseSyncDiff.js`는 테니스 전용 배열에만 추가한다.** `WHOLE_REPLACE_FIELDS`(풋살 기준 가드)에 넣으면 `tennisSyncCoverage.test.js`의 stale 가드가 깨진다. `TENNIS_WHOLE_REPLACE_FIELDS`에만 넣는다.
- **Apps Script(`apps-script/Code.js`)는 수정하지 않는다.** 기존 액션(`writeTennisMatches`, `writeTennisPlayerGames`, `getTennisRoster`)만 호출한다.
- **대상 조건은 `sport==='테니스'` AND `phase ∈ {summary, done}`.** `setup`/`playing` 경기는 어떤 경우에도 건드리지 않는다(현재 몽피스 active에 방치된 8건이 전부 `setup`).
- **안전 불변식:** 시트 전송 성공 → `meta` 갱신 성공 → `finalized` 쓰기 성공, 셋을 모두 확인한 뒤에만 `active`를 지운다.
- 테스트 실행: `npx vitest run <path>` / 전체 `npm test` / 린트 `npm run lint`
- 커밋 메시지는 기존 관례대로 한국어 (`feat:`, `fix:`, `test:`, `chore:` 접두).

---

### Task 1: 등급 스냅샷 state 필드 (`gradeSnapshot`)

**Files:**
- Modify: `src/hooks/useTennisReducer.js` (`tennisInitialState`, 새 `SET_GRADE_SNAPSHOT` 케이스)
- Modify: `src/services/firebaseSyncDiff.js:25-27` (`TENNIS_WHOLE_REPLACE_FIELDS`), `reconstructState`
- Modify: `src/utils/tennis/normalizeTennisMatch.js` (`normalizeTennisMatch` 반환부)
- Test: `src/hooks/__tests__/useTennisReducer.test.js`, `src/services/__tests__/tennisSyncCoverage.test.js`

**Interfaces:**
- Consumes: 없음 (첫 태스크)
- Produces: `state.gradeSnapshot: Record<string, string>` — 회원이름 → 등급. 액션 `{ type: 'SET_GRADE_SNAPSHOT', grades: Record<string,string> }`

- [ ] **Step 1: 리듀서 실패 테스트 작성**

`src/hooks/__tests__/useTennisReducer.test.js` 파일 맨 끝에 추가:

```js
describe('등급 스냅샷', () => {
  it('SET_GRADE_SNAPSHOT이 명부 등급 맵을 저장한다', () => {
    const s = tennisReducer(tennisInitialState, A('SET_GRADE_SNAPSHOT', { grades: { 성언: '은배', 다빈: '동배' } }));
    expect(s.gradeSnapshot).toEqual({ 성언: '은배', 다빈: '동배' });
  });

  it('이미 스냅샷이 있으면 덮어쓰지 않는다 (경기 당일 등급 고정)', () => {
    const s1 = tennisReducer(tennisInitialState, A('SET_GRADE_SNAPSHOT', { grades: { 성언: '은배' } }));
    const s2 = tennisReducer(s1, A('SET_GRADE_SNAPSHOT', { grades: { 성언: '금배' } }));
    expect(s2.gradeSnapshot).toEqual({ 성언: '은배' });
    expect(s2).toBe(s1);
  });

  it('빈 맵은 무시한다 (명부 로딩 실패를 스냅샷으로 굳히지 않는다)', () => {
    const s = tennisReducer(tennisInitialState, A('SET_GRADE_SNAPSHOT', { grades: {} }));
    expect(s).toBe(tennisInitialState);
  });

  it('마감된 경기(phase done)에는 쓰지 않는다 (지나간 기록을 오늘 등급으로 덮지 않는다)', () => {
    const done = { ...tennisInitialState, phase: 'done' };
    const s = tennisReducer(done, A('SET_GRADE_SNAPSHOT', { grades: { 성언: '은배' } }));
    expect(s).toBe(done);
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run src/hooks/__tests__/useTennisReducer.test.js`
Expected: FAIL — `s.gradeSnapshot`이 `undefined`

- [ ] **Step 3: 리듀서 구현**

`src/hooks/useTennisReducer.js`의 `tennisInitialState`에 필드 추가 (`gameFinalized: false,` 바로 위):

```js
  gradeSnapshot: {},
```

`case 'SET_SCORING_RULES':` 블록 바로 아래에 케이스 추가:

```js
    // 명부 등급 스냅샷 — 참석자 선택 시점에 손에 있는 등급을 state에 고정한다.
    // 시트의 grade_at_date가 나중의 명부 재조회에 의존하지 않게 하는 단일 지점.
    case 'SET_GRADE_SNAPSHOT': {
      const grades = action.grades || {};
      if (Object.keys(grades).length === 0) return state;                    // 명부 로딩 실패를 굳히지 않는다
      if (Object.keys(state.gradeSnapshot || {}).length > 0) return state;   // 최초 1회만 — 당일 등급 고정
      if (state.phase === 'done') return state;                              // 마감된 기록은 손대지 않는다
      return { ...state, gradeSnapshot: grades };
    }
```

- [ ] **Step 4: 리듀서 테스트 통과 확인**

Run: `npx vitest run src/hooks/__tests__/useTennisReducer.test.js`
Expected: PASS (기존 케이스 포함 전부)

- [ ] **Step 5: 동기화 왕복 실패 테스트 작성**

`src/services/__tests__/tennisSyncCoverage.test.js`의 `SAMPLE_TENNIS_STATE`에 필드 추가 (`scoringRules:` 줄 바로 아래):

```js
  gradeSnapshot: { 선수A: '은배', 선수B: '동배' },
```

`scoringRules가 왕복...` it 블록 바로 아래에 추가:

```js
  it('gradeSnapshot이 왕복 후 보존돼야 한다 (사라지면 grade_at_date가 빈 채로 시트에 박힌다)', () => {
    const expanded = expandStateForRtdb(SAMPLE_TENNIS_STATE);
    // TENNIS_WHOLE_REPLACE_FIELDS에 등록되지 않으면 여기서 undefined가 된다
    expect(expanded.gradeSnapshot).toEqual({ 선수A: '은배', 선수B: '동배' });
    const result = reconstructState('game-test-1', expanded);
    expect(result.gradeSnapshot).toEqual({ 선수A: '은배', 선수B: '동배' });
    const normalized = normalizeTennisMatch(result);
    expect(normalized.gradeSnapshot).toEqual({ 선수A: '은배', 선수B: '동배' });
  });

  it('gradeSnapshot이 없던 레거시 경기는 normalize 후 빈 객체가 된다', () => {
    const result = reconstructState('game-test-1', expandStateForRtdb({ ...SAMPLE_TENNIS_STATE, gradeSnapshot: undefined }));
    expect(normalizeTennisMatch(result).gradeSnapshot).toEqual({});
  });
```

- [ ] **Step 6: 테스트가 실패하는지 확인**

Run: `npx vitest run src/services/__tests__/tennisSyncCoverage.test.js`
Expected: FAIL 2건 — 새 왕복 테스트(`expanded.gradeSnapshot`이 undefined) + `테니스 initialState 필드 분류 가드`(`unclassified`에 `gradeSnapshot`)

- [ ] **Step 7: 동기화 3곳 등록**

`src/services/firebaseSyncDiff.js` — `TENNIS_WHOLE_REPLACE_FIELDS`:

```js
export const TENNIS_WHOLE_REPLACE_FIELDS = [
  'rounds', 'guests', 'confirmedRounds', 'scoringRules', 'gradeSnapshot',
];
```

같은 파일 `reconstructState` 안, `scoringRules: raw.scoringRules,` 줄 바로 아래:

```js
    // 등급 스냅샷 — 테니스 전용. 풋살/축구 state에는 undefined로 남아 무영향(rounds/guests와 같은 패턴).
    gradeSnapshot: raw.gradeSnapshot,
```

`src/utils/tennis/normalizeTennisMatch.js` — `normalizeTennisMatch` 반환 객체의 `scoringRules:` 줄 아래:

```js
    gradeSnapshot: (state.gradeSnapshot && typeof state.gradeSnapshot === 'object') ? state.gradeSnapshot : {},
```

- [ ] **Step 8: 전체 테스트 통과 확인**

Run: `npx vitest run src/services src/hooks src/utils/tennis`
Expected: PASS (전부)

- [ ] **Step 9: 커밋**

```bash
git add src/hooks/useTennisReducer.js src/services/firebaseSyncDiff.js src/utils/tennis/normalizeTennisMatch.js \
        src/hooks/__tests__/useTennisReducer.test.js src/services/__tests__/tennisSyncCoverage.test.js
git commit -m "feat: 테니스 등급 스냅샷(state.gradeSnapshot) 필드 + RTDB 동기화 등록"
```

---

### Task 2: 등급·회원 판정 단일 헬퍼 (`resolveGradeSource`)

**Files:**
- Modify: `src/utils/tennis/tennisRowBuilders.js` (`membersFromState` 아래에 추가)
- Test: `src/utils/tennis/__tests__/tennisRowBuilders.test.js`

**Interfaces:**
- Consumes: Task 1의 `state.gradeSnapshot`
- Produces: `resolveGradeSource(state, roster) → { fromSnapshot: boolean, gradeByPlayer: Record<string,string>, memberSet: Set<string> }` — Task 3(앱)과 Task 6(러너)이 공유하는 유일한 등급 출처 규칙

- [ ] **Step 1: 실패 테스트 작성**

`src/utils/tennis/__tests__/tennisRowBuilders.test.js` 상단 import에 `resolveGradeSource`를 추가하고, 파일 맨 끝에:

```js
describe('resolveGradeSource', () => {
  const base = { attendees: ['성언', '다빈', '민환'], guests: ['민환'] };

  it('스냅샷이 있으면 명부를 보지 않는다', () => {
    const st = { ...base, gradeSnapshot: { 성언: '은배', 다빈: '동배' } };
    const r = resolveGradeSource(st, [{ name: '성언', grade: '금배' }]);   // 명부는 다른 등급
    expect(r.fromSnapshot).toBe(true);
    expect(r.gradeByPlayer).toEqual({ 성언: '은배', 다빈: '동배' });
  });

  it('스냅샷이 없으면 명부에서 등급 맵을 만든다', () => {
    const r = resolveGradeSource(base, [{ name: '성언', grade: '은배' }, { name: '다빈', grade: '동배' }]);
    expect(r.fromSnapshot).toBe(false);
    expect(r.gradeByPlayer).toEqual({ 성언: '은배', 다빈: '동배' });
  });

  it('스냅샷 이름이 membersFromState 교정에 쓰인다 — 용병칸에 잘못 넣은 회원을 되살린다', () => {
    const st = { attendees: ['성언', '민환'], guests: ['민환'], gradeSnapshot: { 성언: '은배', 민환: '동배' } };
    expect(resolveGradeSource(st, []).memberSet.has('민환')).toBe(true);
  });

  it('스냅샷도 명부도 없으면 등급은 비고 회원은 attendees\\guests 그대로다', () => {
    const r = resolveGradeSource(base, []);
    expect(r.gradeByPlayer).toEqual({});
    expect([...r.memberSet].sort()).toEqual(['다빈', '성언']);
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run src/utils/tennis/__tests__/tennisRowBuilders.test.js`
Expected: FAIL — `resolveGradeSource is not a function`

- [ ] **Step 3: 구현**

`src/utils/tennis/tennisRowBuilders.js`의 `membersFromState` 함수 바로 아래에 추가:

```js
// 등급·회원 판정의 단일 출처. 앱(handleSubmitRecords)과 자동 러너가 같은 규칙을 쓰게 한다.
// 스냅샷(state.gradeSnapshot)이 있으면 명부를 보지 않는다 — 업로드 시점의 명부 조회 의존 제거.
// 스냅샷은 참석자가 아니라 '명부 전체'를 담으므로 membersFromState의 교정 인자로도 그대로 쓸 수 있다.
export function resolveGradeSource(state, roster) {
  const snap = (state && state.gradeSnapshot) || {};
  const fromSnapshot = Object.keys(snap).length > 0;
  if (fromSnapshot) {
    return {
      fromSnapshot: true,
      gradeByPlayer: snap,
      memberSet: membersFromState(state, Object.keys(snap).map(name => ({ name }))),
    };
  }
  const list = (roster || []).filter(m => m && m.name);
  return {
    fromSnapshot: false,
    gradeByPlayer: Object.fromEntries(list.map(m => [m.name, m.grade || ''])),
    memberSet: membersFromState(state, list),
  };
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/utils/tennis/__tests__/tennisRowBuilders.test.js`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add src/utils/tennis/tennisRowBuilders.js src/utils/tennis/__tests__/tennisRowBuilders.test.js
git commit -m "feat: 등급·회원 판정 단일 헬퍼 resolveGradeSource (스냅샷 우선, 명부 폴백)"
```

---

### Task 3: 앱이 스냅샷을 채우고 업로드에 사용

**Files:**
- Modify: `src/TennisApp.jsx` (import, 새 useEffect, `handleSubmitRecords`)

**Interfaces:**
- Consumes: Task 1의 `SET_GRADE_SNAPSHOT`, Task 2의 `resolveGradeSource`
- Produces: 신규·진행 중 테니스 경기의 RTDB `gradeSnapshot` 노드 (Task 6 러너가 읽는다)

**주의:** 이 저장소에는 `TennisApp.jsx` 자체를 렌더하는 테스트 하네스가 없다(알려진 공백). 그래서 이 태스크의 검증은 ①기존 테스트 전부 통과 ②`npm run build` 성공 ③변경 diff 정독(선언 순서·TDZ) 세 가지다.

- [ ] **Step 1: import 추가**

`src/TennisApp.jsx:9` 의 import를 다음으로 교체:

```jsx
import { buildTennisMatchRows, buildTennisPlayerGameRows, resolveGradeSource } from './utils/tennis/tennisRowBuilders';
```

`membersFromState`는 더 이상 이 파일에서 직접 쓰지 않으므로 import에서 뺀다.

- [ ] **Step 2: 스냅샷 디스패치 useEffect 추가**

`useEffect(() => { TennisSync.getRoster().then(setRoster); }, []);` 바로 아래에 추가:

```jsx
  // 등급 스냅샷 — 명부가 손에 들어오면 그 즉시 state에 고정한다.
  // "빈 맵 무시 / 최초 1회만 / phase==='done' 제외" 판단은 전부 리듀서가 하므로 여기선 조건 없이 던진다.
  useEffect(() => {
    if (!state.gameId || roster.length === 0) return;
    dispatch({
      type: 'SET_GRADE_SNAPSHOT',
      grades: Object.fromEntries(roster.filter(m => m && m.name).map(m => [m.name, m.grade || ''])),
    });
  }, [roster, state.gameId]);
```

- [ ] **Step 3: `handleSubmitRecords`의 등급 출처 교체**

`src/TennisApp.jsx` 의 아래 블록(주석 3줄 + `memberSet`/`gradeByPlayer`/`if (roster.length === 0 ...)` 까지)을 통째로 교체한다.

교체 전:

```jsx
      // 회원/용병 구분은 참석자 선택 시점에 확정된 state(attendees\guests)를 진실 소스로 삼는다.
      // (명부 재조회 roster는 로딩 실패·지연 시 비어 전원 게스트로 오기록되는 사고의 원인이었음.)
      const memberSet = membersFromState(state, roster);
      const gradeByPlayer = Object.fromEntries(roster.map(m => [m.name, m.grade]));
      // 등급 스냅샷(grade_at_date)만 명부에 의존 — 명부가 비면 등급이 빠져 포인트가 어긋날 수 있으니 경고.
      // (회원 구분은 attendees라 명부 없이도 정확. 포인트 자체는 저장 아닌 파생이라 나중 재계산됨.)
      if (roster.length === 0 &&
          !confirm('회원 명부를 불러오지 못했습니다. 등급 정보가 비어 포인트가 어긋날 수 있어요. 그래도 전송할까요?')) {
        return;
      }
```

교체 후:

```jsx
      // 회원/용병 구분은 참석자 선택 시점에 확정된 state(attendees\guests)를 진실 소스로 삼는다.
      // (명부 재조회 roster는 로딩 실패·지연 시 비어 전원 게스트로 오기록되는 사고의 원인이었음.)
      // 등급은 경기 시작 때 박아둔 state.gradeSnapshot이 1순위 — 명부 로딩 실패와 무관해진다.
      const { memberSet, gradeByPlayer, fromSnapshot } = resolveGradeSource(state, roster);
      // 스냅샷도 명부도 없을 때만 경고 — 이때만 grade_at_date가 비어 포인트가 어긋날 수 있다.
      if (!fromSnapshot && roster.length === 0 &&
          !confirm('회원 명부를 불러오지 못했습니다. 등급 정보가 비어 포인트가 어긋날 수 있어요. 그래도 전송할까요?')) {
        return;
      }
```

- [ ] **Step 4: 전체 테스트 + 빌드 + diff 정독**

```bash
npm test
npm run lint
npm run build
git diff src/TennisApp.jsx
```

Expected: 테스트 PASS, 린트 경고 없음, 빌드 성공. diff에서 확인할 것 — `resolveGradeSource`가 선언 전에 쓰이지 않는지, `membersFromState` 잔존 참조가 없는지(`grep -n membersFromState src/TennisApp.jsx` 결과가 비어야 함).

- [ ] **Step 5: 커밋**

```bash
git add src/TennisApp.jsx
git commit -m "feat: 테니스 경기 시작 시 등급 스냅샷 기록 + 업로드가 스냅샷 우선 사용"
```

---

### Task 4: 팀설정 자동업로드 체크박스

**Files:**
- Modify: `src/config/settings.js` (`SPORT_DEFAULTS.테니스`)
- Modify: `src/components/common/SettingsScreen.jsx` (`isTennis` 분기)
- Test: `src/config/__tests__/tennisSettings.test.js`

**Interfaces:**
- Consumes: 없음
- Produces: RTDB `settings/{team}/테니스/overrides/autoUpload === true` — Task 6 러너가 이 값으로 대상 팀을 고른다

- [ ] **Step 1: 실패 테스트 작성**

`src/config/__tests__/tennisSettings.test.js` 상단 import에 `getEffectiveSettings`, `_setCacheForTest`를 추가하고, `describe('테니스 기본값', ...)` 블록 안에 추가:

```js
  it('autoUpload 기본값은 꺼짐 (켠 팀만 자동 처리 대상)', () => {
    expect(SPORT_DEFAULTS['테니스'].autoUpload).toBe(false);
  });
```

파일 맨 끝에 추가:

```js
describe('autoUpload 팀 스코프', () => {
  it('팀 override로 켜면 getEffectiveSettings가 true를 준다', () => {
    _setCacheForTest({ 몽피스: { '테니스': { preset: '표준테니스', overrides: { autoUpload: true } } } });
    expect(getEffectiveSettings('몽피스', '테니스').autoUpload).toBe(true);
    _setCacheForTest({});
  });

  it('켜지 않은 팀은 false로 남는다 (다른 팀에 새지 않는다)', () => {
    _setCacheForTest({
      몽피스: { '테니스': { preset: '표준테니스', overrides: { autoUpload: true } } },
      마스터FC: { '풋살': { preset: '마스터FC풋살', overrides: {} } },
    });
    expect(getEffectiveSettings('마스터FC', '테니스').autoUpload).toBe(false);
    _setCacheForTest({});
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run src/config/__tests__/tennisSettings.test.js`
Expected: FAIL — `autoUpload`가 `undefined`

- [ ] **Step 3: 기본값 추가**

`src/config/settings.js`의 `SPORT_DEFAULTS.테니스` 안, `rosterSheet:` 줄 아래에 추가:

```js
    // 마감된 경기를 매일 오전 10시(KST) 자동으로 시트 업로드 + 아카이브할지.
    // 팀 override로만 켠다 — SHARED_KEYS/TENNIS_KEYS에는 넣지 않는다(종목·팀 스코프 유지).
    autoUpload: false,
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/config/__tests__/tennisSettings.test.js`
Expected: PASS

- [ ] **Step 5: 체크박스 UI 추가**

`src/components/common/SettingsScreen.jsx`의 `isTennis` 분기(에이스·더블폴트 `SegToggle` 바로 아래, `) : (` 앞)에 추가:

```jsx
              <div className="app-row">
                <div style={ss.row}>
                  <label style={ss.label}>
                    <input type="checkbox"
                      checked={!!settings.autoUpload}
                      onChange={e => update('autoUpload', e.target.checked)}
                      style={{ marginRight: 8, accentColor: "var(--app-blue)" }} />
                    마감 경기 자동 업로드·아카이브<SourceBadge k="autoUpload" />
                  </label>
                </div>
              </div>
              <div className="app-row" style={{ padding: "0 16px 8px" }}>
                <span style={ss.hint}>
                  매일 오전 10시경, "경기 마감"까지 누른 경기만 시트 전송 후 아카이브합니다.
                  진행 중·미마감 경기는 건드리지 않습니다.
                </span>
              </div>
```

- [ ] **Step 6: 빌드·린트 확인**

```bash
npm run lint
npm run build
npx vitest run src/config
```
Expected: 전부 성공

- [ ] **Step 7: 커밋**

```bash
git add src/config/settings.js src/components/common/SettingsScreen.jsx src/config/__tests__/tennisSettings.test.js
git commit -m "feat: 테니스 팀설정에 마감 경기 자동 업로드·아카이브 체크박스"
```

---

### Task 5: 자동 처리 대상 선별 (순수 함수)

**Files:**
- Create: `src/utils/tennis/autoUploadTargets.js`
- Test: `src/utils/tennis/__tests__/autoUploadTargets.test.js`

**Interfaces:**
- Consumes: 없음
- Produces:
  - `classifyAutoTarget(state) → 'upload_archive' | 'archive_only' | 'skip'`
  - `selectAutoTargets(games) → Array<{gameId, state, action}>` (`skip`은 제외됨)
  - 상수 `ACTION_UPLOAD_ARCHIVE`, `ACTION_ARCHIVE_ONLY`, `ACTION_SKIP`

- [ ] **Step 1: 실패 테스트 작성**

`src/utils/tennis/__tests__/autoUploadTargets.test.js` 생성:

```js
import { describe, it, expect } from 'vitest';
import {
  classifyAutoTarget, selectAutoTargets,
  ACTION_UPLOAD_ARCHIVE, ACTION_ARCHIVE_ONLY, ACTION_SKIP,
} from '../autoUploadTargets';

const st = (over) => ({ sport: '테니스', phase: 'summary', gameFinalized: false, ...over });

describe('classifyAutoTarget', () => {
  it('마감 눌러 요약에 온 미전송 경기 → 업로드+아카이브', () => {
    expect(classifyAutoTarget(st())).toBe(ACTION_UPLOAD_ARCHIVE);
  });

  it('이미 전송된 경기 → 아카이브만', () => {
    expect(classifyAutoTarget(st({ phase: 'done', gameFinalized: true }))).toBe(ACTION_ARCHIVE_ONLY);
  });

  it('시작만 하고 버린 경기(setup)는 건드리지 않는다', () => {
    expect(classifyAutoTarget(st({ phase: 'setup' }))).toBe(ACTION_SKIP);
  });

  it('진행 중(playing)은 라운드가 다 확정됐어도 건드리지 않는다', () => {
    expect(classifyAutoTarget(st({ phase: 'playing', confirmedRounds: { 1: true } }))).toBe(ACTION_SKIP);
  });

  it('풋살 경기는 phase가 summary여도 배제한다', () => {
    expect(classifyAutoTarget(st({ sport: '풋살' }))).toBe(ACTION_SKIP);
  });

  it('sport가 없는 레거시 state도 배제한다', () => {
    expect(classifyAutoTarget(st({ sport: undefined }))).toBe(ACTION_SKIP);
  });

  it('null state는 배제한다', () => {
    expect(classifyAutoTarget(null)).toBe(ACTION_SKIP);
  });
});

describe('selectAutoTargets', () => {
  it('skip을 걸러내고 action을 붙여 돌려준다', () => {
    const out = selectAutoTargets([
      { gameId: 'g1', state: st() },
      { gameId: 'g2', state: st({ phase: 'setup' }) },
      { gameId: 'g3', state: st({ phase: 'done', gameFinalized: true }) },
    ]);
    expect(out.map(x => [x.gameId, x.action])).toEqual([
      ['g1', ACTION_UPLOAD_ARCHIVE],
      ['g3', ACTION_ARCHIVE_ONLY],
    ]);
  });

  it('빈 입력에도 안전하다', () => {
    expect(selectAutoTargets(undefined)).toEqual([]);
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run src/utils/tennis/__tests__/autoUploadTargets.test.js`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 구현**

`src/utils/tennis/autoUploadTargets.js` 생성:

```js
// 자동 업로드·아카이브 대상 선별. RTDB/시트에 닿지 않는 순수 함수 — 러너의 유일한 판단 지점이다.
// ★ 사람이 "경기 마감"을 눌러 요약 화면(summary)에 도달한 경기만 대상이다.
//   setup/playing(시작만 하고 버린 경기 포함)은 어떤 경우에도 건드리지 않는다.
// ★ sport 검사는 팀 필터와 별개의 이중 방어다 — 풋살/축구 state가 섞여 들어와도 배제된다.

import { TENNIS_SPORT } from './tennisSchema';

export const ACTION_UPLOAD_ARCHIVE = 'upload_archive';
export const ACTION_ARCHIVE_ONLY = 'archive_only';
export const ACTION_SKIP = 'skip';

const FINISHED_PHASES = new Set(['summary', 'done']);

export function classifyAutoTarget(state) {
  if (!state || state.sport !== TENNIS_SPORT) return ACTION_SKIP;
  if (!FINISHED_PHASES.has(state.phase)) return ACTION_SKIP;
  return state.gameFinalized === true ? ACTION_ARCHIVE_ONLY : ACTION_UPLOAD_ARCHIVE;
}

export function selectAutoTargets(games) {
  return (games || [])
    .map(g => ({ ...g, action: classifyAutoTarget(g && g.state) }))
    .filter(g => g.action !== ACTION_SKIP);
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/utils/tennis/__tests__/autoUploadTargets.test.js`
Expected: PASS (9건)

- [ ] **Step 5: 커밋**

```bash
git add src/utils/tennis/autoUploadTargets.js src/utils/tennis/__tests__/autoUploadTargets.test.js
git commit -m "feat: 자동 업로드 대상 선별 순수 함수 classifyAutoTarget/selectAutoTargets"
```

---

### Task 6: 자동 실행 러너 스크립트

**Files:**
- Create: `scripts/tennisAutoUpload.mjs`

**Interfaces:**
- Consumes: Task 2 `resolveGradeSource`, Task 5 `selectAutoTargets`/`ACTION_UPLOAD_ARCHIVE`, 기존 `reconstructState`·`normalizeTennisMatch`·`buildTennisMatchRows`·`buildTennisPlayerGameRows`·`nowKST`·`stripNameDecorations`
  - **검증 완료(2026-08-27):** 이 import 체인은 `npx vite-node`에서 그대로 동작한다. `tennisSync.js`가 `AuthUtil`(localStorage)을 import하지만 모듈 최상위에서 호출하지 않아 headless에서도 안전하다.
- Produces: `npx vite-node scripts/tennisAutoUpload.mjs` 실행 가능한 CLI (환경변수 `FIREBASE_DATABASE_URL`, `APPS_SCRIPT_URL`, `TENNIS_BOT_TOKEN`, `DRY_RUN`)

- [ ] **Step 1: 스크립트 작성**

`scripts/tennisAutoUpload.mjs` 생성:

```js
// 마감된 테니스 경기를 시트 업로드 + 아카이브까지 자동 처리한다. (매일 KST 10시 GitHub Actions)
//
// 실행: npx vite-node scripts/tennisAutoUpload.mjs
// 환경변수: FIREBASE_DATABASE_URL, APPS_SCRIPT_URL, TENNIS_BOT_TOKEN, DRY_RUN
//
// ★ 안전 불변식: 시트 전송 성공 → meta 갱신 성공 → finalized 쓰기 성공,
//   이 셋을 모두 확인한 뒤에만 active 노드를 지운다.
// ★ 격리: autoUpload=true 이고 봇 토큰의 팀과 일치하는 팀의 노드만 URL로 구성한다.
//   다른 팀 노드는 읽지도 않는다.
// ★ 행 생성 로직은 앱(tennisRowBuilders)을 그대로 import한다 — 시트 스키마를 두 벌 두지 않는다.

import { reconstructState } from '../src/services/firebaseSyncDiff.js';
import { normalizeTennisMatch } from '../src/utils/tennis/normalizeTennisMatch.js';
import {
  buildTennisMatchRows, buildTennisPlayerGameRows, resolveGradeSource,
} from '../src/utils/tennis/tennisRowBuilders.js';
import { nowKST } from '../src/utils/tennis/tennisTime.js';
import { stripNameDecorations } from '../src/services/tennisSync.js';
import {
  selectAutoTargets, ACTION_UPLOAD_ARCHIVE,
} from '../src/utils/tennis/autoUploadTargets.js';

const DB = (process.env.FIREBASE_DATABASE_URL || '').replace(/\/$/, '');
const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL || '';
const BOT_TOKEN = process.env.TENNIS_BOT_TOKEN || '';
const DRY_RUN = ['1', 'true', 'yes'].includes(String(process.env.DRY_RUN || '').toLowerCase());
const SPORT_KEY = '테니스';
const INPUT_BY = '자동업로드';

// 사람이 반드시 확인해야 하는 상태가 생기면 켜진다 → 종료 코드 1
let manualCheck = false;

// firebaseSync._safeTeam 의 복사본. 한쪽을 고치면 다른 쪽도 고칠 것.
function safeTeam(team) {
  return (team || '기본팀').replace(/[.#$/[\]]/g, '_');
}

// firebaseSync._kstDateFromGameId 의 복사본 (gameDate가 빈 레거시 경기 폴백).
function kstDateFromGameId(gameId) {
  if (gameId && gameId.indexOf('g_') === 0) {
    const ts = parseInt(gameId.substring(2), 10);
    if (ts > 0) return new Date(ts + 9 * 3600 * 1000).toISOString().substring(0, 10);
  }
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().substring(0, 10);
}

// firebaseSync._buildSummary 의 테니스 분기 복사본. 아카이브 목록 표기가 앱과 같아야 한다.
function buildSummary(gameId, state) {
  const creator = state.gameCreator || state.lastEditor || '?';
  const rounds = state.rounds || [];
  const done = rounds.reduce((s, r) => s + (r.courts || []).filter(c => c.status === 'done').length, 0);
  return `${gameId} | ${creator} | ${state.phase || '?'} | ${rounds.length}라운드 | 완료 ${done}경기`;
}

async function rtdb(method, path, body) {
  const resp = await fetch(`${DB}/${path}.json`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!resp.ok) throw new Error(`RTDB ${method} /${path} 실패: HTTP ${resp.status}`);
  return resp.json();
}

// tennisSync._post 와 같은 계약: Apps Script는 서버측 실패도 HTTP 200 + {success:false}로 답한다.
async function appsScript(action, team, data) {
  const body = stripNameDecorations({ action, data, team, authToken: BOT_TOKEN });
  const resp = await fetch(APPS_SCRIPT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify(body),
  });
  if (!resp.ok) throw new Error(`${action} 실패: HTTP ${resp.status}`);
  const result = await resp.json();
  if (!result || result.success === false) {
    throw new Error(`${action} 실패: ${result?.error || '서버 응답 오류'}`);
  }
  return result;
}

// 앱의 getRoster는 _safeRead라 실패를 []로 삼킨다. 자동 실행에는 사람이 없으므로
// "조회 실패"와 "진짜 빈 명부"를 구분해야 한다 — 여기서는 throw 방식 + 1회 재시도.
async function fetchRoster(team) {
  try {
    return (await appsScript('getTennisRoster', team)).players || [];
  } catch (e) {
    console.log(`  명부 조회 실패, 1회 재시도: ${e.message}`);
    return (await appsScript('getTennisRoster', team)).players || [];
  }
}

async function uploadRows(teamKey, teamName, gameId, state) {
  let { gradeByPlayer, memberSet, fromSnapshot } = resolveGradeSource(state, []);
  if (!fromSnapshot) {
    const roster = await fetchRoster(teamName);   // 실패하면 throw → 호출부가 이 경기만 스킵
    if (roster.length === 0) {
      manualCheck = true;
      console.log(`  [MANUAL_CHECK] ${gameId} — 등급 출처 없음(스냅샷 없음 + 명부 0명). 업로드하지 않음`);
      return false;
    }
    ({ gradeByPlayer, memberSet } = resolveGradeSource(state, roster));
  }

  const inputTime = nowKST();
  const matchRows = buildTennisMatchRows({ team: teamName, state, inputTime, inputBy: INPUT_BY, memberSet });
  const pgRows = buildTennisPlayerGameRows({ team: teamName, state, inputTime, inputBy: INPUT_BY, memberSet, gradeByPlayer });

  // 앱의 Promise.allSettled 병렬과 달리 순차 — 앞이 실패하면 뒤를 보내지 않아 반쪽 업로드를 줄인다.
  await appsScript('writeTennisMatches', teamName, { rows: matchRows });
  await appsScript('writeTennisPlayerGames', teamName, { rows: pgRows });
  console.log(`  시트 전송 완료 — 매치 ${matchRows.length}행 / 선수경기 ${pgRows.length}행`);

  // 시트에 들어간 뒤 meta를 못 찍으면 다음 실행에서 중복 업로드가 된다. 유일한 중복 위험 지점.
  try {
    await rtdb('PATCH', `games/${encodeURIComponent(teamKey)}/active/${gameId}/meta`, {
      gameFinalized: true, phase: 'done', autoUploadedAt: { '.sv': 'timestamp' },
    });
  } catch (e) {
    manualCheck = true;
    throw new Error(`[MANUAL_CHECK] 시트 전송 후 meta 갱신 실패 — 다음 실행 시 중복 업로드 위험: ${e.message}`);
  }
  return true;
}

async function archiveGame(teamKey, gameId, state) {
  const finalState = { ...state, gameFinalized: true, phase: 'done' };
  await rtdb('PATCH', `games/${encodeURIComponent(teamKey)}/finalized`, {
    [`_meta/${gameId}`]: {
      summary: buildSummary(gameId, finalState),
      gameDate: finalState.gameDate || kstDateFromGameId(gameId),
      updatedAt: { '.sv': 'timestamp' },
    },
    [`_states/${gameId}`]: { state: JSON.stringify(finalState) },
  });
  // finalized 쓰기가 성공한 뒤에만 지운다.
  await rtdb('DELETE', `games/${encodeURIComponent(teamKey)}/active/${gameId}`);
  console.log('  아카이브 완료');
}

async function processTeam(teamKey, teamName) {
  const raw = (await rtdb('GET', `games/${encodeURIComponent(teamKey)}/active`)) || {};
  const games = Object.keys(raw).map(gameId => ({
    gameId,
    state: normalizeTennisMatch(reconstructState(gameId, raw[gameId])),
  }));
  const targets = selectAutoTargets(games);
  console.log(`[${teamName}] 활성 ${games.length}건 · 처리 대상 ${targets.length}건`);

  for (const t of targets) {
    const label = `${t.gameId} (${t.state.gameDate || '?'}) ${t.action}`;
    if (DRY_RUN) {
      console.log(`  [DRY_RUN] ${label} — ${buildSummary(t.gameId, t.state)}`);
      continue;
    }
    try {
      console.log(`  처리 시작: ${label}`);
      if (t.action === ACTION_UPLOAD_ARCHIVE) {
        const ok = await uploadRows(teamKey, teamName, t.gameId, t.state);
        if (!ok) continue;   // 등급 출처 없음 — 아카이브도 하지 않는다
      }
      await archiveGame(teamKey, t.gameId, t.state);
    } catch (e) {
      // 한 경기의 실패가 나머지를 막지 않는다. 실패한 경기는 active에 남아 다음날 재시도된다.
      console.error(`  실패: ${t.gameId} — ${e.message}`);
      process.exitCode = 1;
    }
  }
}

async function main() {
  if (!DB || !APPS_SCRIPT_URL || !BOT_TOKEN) {
    throw new Error('환경변수 누락: FIREBASE_DATABASE_URL / APPS_SCRIPT_URL / TENNIS_BOT_TOKEN');
  }
  const botTeam = BOT_TOKEN.split(':')[0];
  if (!botTeam) throw new Error('TENNIS_BOT_TOKEN 형식 오류 — "팀:이름:뒷4자리"여야 한다');
  console.log(`시작 ${nowKST()} · DRY_RUN=${DRY_RUN} · 봇 팀=${botTeam}`);

  const settings = (await rtdb('GET', 'settings')) || {};
  const enabled = Object.keys(settings)
    .filter(k => settings[k]?.[SPORT_KEY]?.overrides?.autoUpload === true);
  console.log(`autoUpload 켠 팀: ${enabled.join(', ') || '(없음)'}`);

  for (const teamKey of enabled) {
    // 봇 토큰의 팀이 아니면 Apps Script의 _checkTeamAccess가 어차피 막는다. 아예 접근하지 않는다.
    if (teamKey !== safeTeam(botTeam)) {
      console.log(`[skip] ${teamKey} — 봇 토큰 팀(${botTeam})과 달라 접근하지 않음`);
      continue;
    }
    await processTeam(teamKey, botTeam);
  }

  if (manualCheck) {
    console.error('MANUAL_CHECK 항목이 있습니다 — 로그를 확인하세요.');
    process.exitCode = 1;
  }
  console.log(`종료 ${nowKST()}`);
}

main().catch(e => {
  console.error(`치명적 실패 — 아무것도 변경하지 않았을 수 있습니다: ${e.message}`);
  process.exit(1);
});
```

- [ ] **Step 2: 환경변수 없이 실행해 가드가 도는지 확인**

Run: `npx vite-node scripts/tennisAutoUpload.mjs`
Expected: `치명적 실패 — ... 환경변수 누락: ...` 출력 후 종료 코드 1

- [ ] **Step 3: 실데이터 DRY_RUN 실행 (아무것도 쓰지 않음)**

```bash
set -a && source .env && set +a
FIREBASE_DATABASE_URL="$VITE_FIREBASE_DATABASE_URL" \
APPS_SCRIPT_URL="$VITE_APPS_SCRIPT_URL" \
TENNIS_BOT_TOKEN="몽피스:<관리자이름>:<뒷4자리>" \
DRY_RUN=1 npx vite-node scripts/tennisAutoUpload.mjs
```

Expected 출력:
- `autoUpload 켠 팀: (없음)` — Task 4 체크박스를 아직 아무도 안 켰으므로 정상
- 종료 코드 0

체크박스를 이미 켠 뒤 실행했다면 `[몽피스] 활성 8건 · 처리 대상 0건`이 나와야 한다(방치된 8건이 전부 `setup`). **대상이 0건이 아니면 멈추고 원인을 확인할 것.**

- [ ] **Step 4: 린트 확인**

Run: `npm run lint`
Expected: 경고·에러 없음 (`scripts/`가 eslint 대상에서 빠져 있으면 그대로 통과)

- [ ] **Step 5: 커밋**

```bash
git add scripts/tennisAutoUpload.mjs
git commit -m "feat: 테니스 마감 경기 자동 업로드·아카이브 러너 스크립트"
```

---

### Task 7: GitHub Actions 워크플로

**Files:**
- Create: `.github/workflows/tennis-auto-upload.yml`

**Interfaces:**
- Consumes: Task 6의 `scripts/tennisAutoUpload.mjs`
- Produces: 매일 KST 10시 자동 실행 + `workflow_dispatch` 수동 실행

- [ ] **Step 1: 워크플로 작성**

`.github/workflows/tennis-auto-upload.yml` 생성:

```yaml
name: Tennis Auto Upload

# 마감된 테니스 경기를 시트 업로드 + 아카이브한다.
# cron은 UTC 기준 — 01:00 UTC = 10:00 KST. GitHub Actions cron은 정시를 보장하지 않아
# 실제로는 10:00~10:40 사이에 실행될 수 있다(설계 문서에서 허용된 오차).
on:
  schedule:
    - cron: "0 1 * * *"
  workflow_dispatch:
    inputs:
      dry_run:
        description: "true면 아무것도 쓰지 않고 처리 대상만 출력한다"
        type: boolean
        default: true

permissions:
  contents: read

concurrency:
  group: tennis-auto-upload
  cancel-in-progress: false

jobs:
  run:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - run: npm ci

      - name: 자동 업로드·아카이브 실행
        env:
          FIREBASE_DATABASE_URL: ${{ secrets.VITE_FIREBASE_DATABASE_URL }}
          APPS_SCRIPT_URL: ${{ secrets.VITE_APPS_SCRIPT_URL }}
          TENNIS_BOT_TOKEN: ${{ secrets.TENNIS_BOT_TOKEN }}
          # 정기 실행은 실제 처리, 수동 실행은 입력값(기본 true=미리보기)을 따른다.
          DRY_RUN: ${{ github.event_name == 'schedule' && 'false' || inputs.dry_run }}
        run: npx vite-node scripts/tennisAutoUpload.mjs
```

- [ ] **Step 2: 워크플로 문법 확인**

Run: `npx --yes yaml-lint .github/workflows/tennis-auto-upload.yml 2>/dev/null || python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/tennis-auto-upload.yml')); print('YAML OK')"`
Expected: `YAML OK`

- [ ] **Step 3: 기존 배포 워크플로가 그대로인지 확인**

Run: `git diff --stat .github/workflows/`
Expected: `deploy.yml`은 변경 없음, 새 파일만 추가

- [ ] **Step 4: 커밋**

```bash
git add .github/workflows/tennis-auto-upload.yml
git commit -m "chore: 테니스 자동 업로드 GitHub Actions 워크플로 (KST 10시)"
```

---

### Task 8: 배포 및 실환경 검증

**Files:** 없음 (운영 절차)

**Interfaces:**
- Consumes: Task 1~7 전부
- Produces: 몽피스에서 동작하는 자동 처리

- [ ] **Step 1: 전체 검증 후 푸시**

```bash
npm test
npm run lint
npm run build
git push origin main
```
Expected: 테스트·린트·빌드 성공. 푸시하면 기존 `deploy.yml`이 앱을 자동 배포한다.

- [ ] **Step 2: 시크릿 등록 (사용자 작업)**

```bash
gh secret set TENNIS_BOT_TOKEN
# 입력값: 몽피스:<관리자 이름>:<전화번호 뒷 4자리>
# 회원인증 시트에 실재하는 몽피스 계정이어야 한다 (Apps Script _parseAuthToken이 소속을 검증).
```

- [ ] **Step 3: 수동 DRY_RUN 실행으로 실환경 확인**

```bash
gh workflow run "Tennis Auto Upload" -f dry_run=true
sleep 30 && gh run list --workflow="Tennis Auto Upload" --limit 1
gh run view --log | tail -40
```
Expected: `autoUpload 켠 팀: (없음)` (아직 체크박스를 안 켰으므로) · 종료 코드 0

- [ ] **Step 4: 몽피스 설정에서 체크박스 ON (사용자 작업)**

앱 → 몽피스 → 설정 → "마감 경기 자동 업로드·아카이브" 체크 후 저장.

확인:
```bash
DB=$(grep VITE_FIREBASE_DATABASE_URL .env | cut -d= -f2- | tr -d '"')
curl -s "${DB%/}/settings/%EB%AA%BD%ED%94%BC%EC%8A%A4/%ED%85%8C%EB%8B%88%EC%8A%A4/overrides.json"
```
Expected: `autoUpload: true` 포함

- [ ] **Step 5: 체크박스 ON 상태로 DRY_RUN 재실행**

```bash
gh workflow run "Tennis Auto Upload" -f dry_run=true
sleep 30 && gh run view --log | tail -40
```
Expected: `[몽피스] 활성 8건 · 처리 대상 0건` — **대상이 0건이 아니면 여기서 멈추고 원인을 확인한다.** 방치된 8건은 전부 `phase:"setup"`이라 대상이 될 수 없다.

- [ ] **Step 6: 첫 실제 경기 마감 후 관찰 (사용자 작업)**

다음 실제 경기를 마감(요약 화면 진입)만 하고 업로드를 누르지 않은 상태로 둔 뒤:
1. `gh workflow run "Tennis Auto Upload" -f dry_run=true` 로 대상 1건이 잡히는지 먼저 확인
2. 이상 없으면 다음 날 정기 실행(10시경)에 맡기거나 `-f dry_run=false`로 즉시 실행
3. 시트 2종에 행이 들어갔는지, 아카이브 목록에 경기가 보이는지, `active`에서 사라졌는지 확인

---

## 완료 기준

- `npm test` 전부 통과 (신규 테스트 15건 이상 포함)
- 몽피스에서 체크박스 ON 상태로 DRY_RUN 실행 시 방치된 8건이 대상에서 제외됨
- 마스터FC·하버FC의 `settings`/`games` 노드에 어떤 쓰기도 발생하지 않음
- 실제 마감 경기 1건이 자동으로 시트 업로드 + 아카이브까지 처리됨
