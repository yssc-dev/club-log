# 테니스 경기 입력·로그 개선 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ① 과거 날짜로 경기 생성(중복 경고 포함) ② input_time을 KST로 ③ 전송자(input_by)를 매치·선수경기 로그에 기록.

**Architecture:** 순수 유틸(`nowKST`)과 스키마 확장(input_by 컬럼)을 먼저, 그 위에 리듀서(SET_GAME_DATE)와 UI(날짜 선택+중복 경고)를 얹는다. 새 상태 필드는 없다(gameDate/season은 기존, input_by는 로그 전용).

**Tech Stack:** React(Vite)+vitest. 테니스 파일 + `apps-script/Code.js` 테니스 헤더.

**Spec:** `docs/superpowers/specs/2026-08-12-tennis-input-log-improvements-design.md` — 어긋나면 스펙이 이긴다.

## Global Constraints

- **풋살/축구 무영향.** `apps-script/Code.js`는 테니스 헤더 2개(`TENNIS_MATCH_HEADERS`/`TENNIS_PLAYER_GAME_HEADERS`)와 changelog만. 풋살/축구 시트·액션 무수정.
- **스키마 헤더 1:1**: `tennisSchema.js`의 `TENNIS_MATCH_COLUMNS`/`TENNIS_PLAYER_GAME_COLUMNS`와 `apps-script/Code.js`의 대응 헤더 배열이 **끝에 `input_by`를 같은 위치로** 추가돼 순서가 1:1로 같아야 한다.
- **Apps Script 반영은 유저 수동**(배포 관리→편집→새 버전). Code.js 최상단 changelog에 날짜+내용 한 줄. **배포 순서**: 앱 배포 → 유저 Apps Script 반영(그 사이 마감분은 input_by 유실 가능, 유저 안내).
- **firebaseSyncDiff 무변경**: input_by는 로그 전용(state 아님), gameDate/season은 이미 META 등록.
- input_time 소급 없음(앞으로만 KST). 기존 UTC 로그·마이그레이션 무영향.
- 렌더 검증 공백(메모리 규칙): jsx 변경은 선언 순서 육안 + diff 정독 + 브라우저 스모크.
- 커밋 스타일 `feat(tennis): …`. 테스트 `npx vitest run <파일>`, 전체 `npm test`(현재 796 통과 유지).

---

### Task 1: nowKST 유틸 + input_by 스키마 확장 + rowBuilders

**Files:**
- Create: `src/utils/tennis/tennisTime.js`
- Modify: `src/utils/tennis/tennisSchema.js` (input_by 2곳)
- Modify: `apps-script/Code.js` (헤더 2곳 + changelog)
- Modify: `src/utils/tennis/tennisRowBuilders.js` (inputBy 인자+필드)
- Test: `src/utils/tennis/__tests__/tennisTime.test.js`, `src/utils/tennis/__tests__/tennisSchema.test.js`(단언 갱신), `src/utils/tennis/__tests__/tennisRowBuilders.test.js`(input_by 케이스)

**Interfaces:**
- Produces: `nowKST()` → `'YYYY-MM-DD HH:mm:ss'` KST 문자열(tennisTime.js). `TENNIS_MATCH_COLUMNS`(22칸, `input_by` 끝), `TENNIS_PLAYER_GAME_COLUMNS`(30칸, `input_by` 끝). `buildTennisMatchRows`/`buildTennisPlayerGameRows`가 `inputBy` 인자를 받아 행에 `input_by`.

- [ ] **Step 1: nowKST 실패 테스트** — `src/utils/tennis/__tests__/tennisTime.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { toKSTString, nowKST } from '../tennisTime';

describe('toKSTString', () => {
  it('UTC 시각을 KST(+9h) YYYY-MM-DD HH:mm:ss로 변환', () => {
    // 2026-08-12T12:00:00Z → KST 2026-08-12 21:00:00
    expect(toKSTString(new Date('2026-08-12T12:00:00Z'))).toBe('2026-08-12 21:00:00');
    // 자정 넘김: 2026-08-12T16:00:00Z → KST 2026-08-13 01:00:00
    expect(toKSTString(new Date('2026-08-12T16:00:00Z'))).toBe('2026-08-13 01:00:00');
    // 2자리 패딩
    expect(toKSTString(new Date('2026-01-05T00:05:03Z'))).toBe('2026-01-05 09:05:03');
  });
});

describe('nowKST', () => {
  it('현재 시각 KST 문자열, 포맷 일치', () => {
    expect(nowKST()).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  });
});
```

- [ ] **Step 2: 실패 확인** — `npx vitest run src/utils/tennis/__tests__/tennisTime.test.js` → FAIL (module not found)

- [ ] **Step 3: tennisTime.js 구현** — KST는 DST 없어 고정 +9h 오프셋으로 계산(타임존 라이브러리 불필요):

```js
// 로그 input_time을 한국시간(KST, UTC+9)으로 기록한다.
// KST는 서머타임이 없어 고정 오프셋으로 안전하게 계산한다.
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

const pad = (n) => String(n).padStart(2, '0');

export function toKSTString(date) {
  // UTC 기준 시각에 +9h 한 뒤 그 값을 UTC 필드로 읽으면 KST 벽시계 시각이 된다.
  const k = new Date(date.getTime() + KST_OFFSET_MS);
  return `${k.getUTCFullYear()}-${pad(k.getUTCMonth() + 1)}-${pad(k.getUTCDate())} `
    + `${pad(k.getUTCHours())}:${pad(k.getUTCMinutes())}:${pad(k.getUTCSeconds())}`;
}

export function nowKST() {
  return toKSTString(new Date());
}
```

- [ ] **Step 4: 통과 확인** — 같은 명령 → PASS

- [ ] **Step 5: tennisSchema.js input_by 추가** — 두 배열 끝(`'input_time'` 뒤)에 `'input_by'`:

```js
  'league', 'input_time', 'input_by',
```
(TENNIS_MATCH_COLUMNS), 그리고
```js
  'grade_at_date', 'league', 'input_time', 'input_by',
```
(TENNIS_PLAYER_GAME_COLUMNS).

- [ ] **Step 6: tennisSchema.test.js 단언 갱신** — 기존 `21칸`/`29칸` 단언을 `22`/`30`으로, 순서 배열에 `'input_by'` 추가. (기존 테스트의 `toHaveLength(21)`·`toEqual([...])`을 실제 새 배열에 맞춤. 마지막 원소가 `input_by`인지 확인하는 단언 추가.)

- [ ] **Step 7: Code.js 헤더 + changelog** — ① 최상단 CHANGELOG에 `// 2026-08-12: 로그_테니스매치/선수경기에 input_by(전송자) 컬럼 추가` ② `TENNIS_MATCH_HEADERS` 끝 `"input_time"` 뒤에 `"input_by"`, `TENNIS_PLAYER_GAME_HEADERS` 끝 `"input_time"` 뒤에 `"input_by"`. **tennisSchema.js 배열과 순서 1:1 육안 대조**.

- [ ] **Step 8: rowBuilders input_by 실패 테스트** — `tennisRowBuilders.test.js`에 케이스 추가(기존 테스트 픽스처 패턴 재사용). 요지:

```js
it('inputBy가 매치/선수경기 행에 input_by로 들어간다', () => {
  const state = /* 완료 코트 1개 있는 최소 state — 기존 테스트 픽스처 재사용 */;
  const matchRows = buildTennisMatchRows({ team: 'T', state, inputTime: '2026-08-12 21:00:00', inputBy: '서라현', memberSet: new Set() });
  const pgRows = buildTennisPlayerGameRows({ team: 'T', state, inputTime: '2026-08-12 21:00:00', inputBy: '서라현', memberSet: new Set(), gradeByPlayer: {} });
  expect(matchRows[0].input_by).toBe('서라현');
  expect(pgRows[0].input_by).toBe('서라현');
});
it('inputBy 미전달 시 빈 문자열', () => {
  const state = /* 위와 동일 픽스처 */;
  expect(buildTennisMatchRows({ team: 'T', state, inputTime: '', memberSet: new Set() })[0].input_by).toBe('');
});
```

(기존 `tennisRowBuilders.test.js`의 state 픽스처를 그대로 빌려 쓴다 — 새로 만들지 말고 파일 상단 헬퍼 재사용.)

- [ ] **Step 9: rowBuilders 구현** — `buildTennisMatchRows`/`buildTennisPlayerGameRows`의 인자 구조분해에 `inputBy` 추가, 각 행 객체의 `input_time` 옆에 `input_by: inputBy || ''` 추가. (legacyDoublesTransform은 수정 안 함 — input_by 없이 빈값 적재, 스키마 순서는 _tennisRowToArray가 헤더 순회라 무관.)

- [ ] **Step 10: 전체 테스트 + 커밋**

```bash
npm test && npx eslint src/utils/tennis/tennisTime.js src/utils/tennis/tennisSchema.js src/utils/tennis/tennisRowBuilders.js
git add src/utils/tennis apps-script/Code.js
git commit -m "feat(tennis): nowKST 유틸 + input_by(전송자) 컬럼 — 스키마·헤더·rowBuilders"
```

---

### Task 2: 리듀서 SET_GAME_DATE + TennisApp 배선(날짜·KST·전송자)

**Files:**
- Modify: `src/hooks/useTennisReducer.js` (SET_GAME_DATE)
- Modify: `src/TennisApp.jsx` (nowKST, inputBy, 날짜 prop)
- Test: `src/hooks/__tests__/tennisReducerScoring.test.js`(또는 신규 `tennisReducerGameDate.test.js`)

**Interfaces:**
- Consumes: Task 1 `nowKST`. 기존 `authUser?.name`.
- Produces: `SET_GAME_DATE { date }` 액션(phase 'setup'에서만, `gameDate`+`season` 갱신). `handleSubmitRecords`가 `inputTime = nowKST()`, `inputBy = authUser?.name || ''`를 rowBuilders에 전달.

- [ ] **Step 1: 리듀서 실패 테스트** — 신규 `src/hooks/__tests__/tennisReducerGameDate.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { tennisReducer, tennisInitialState } from '../useTennisReducer';

describe('SET_GAME_DATE', () => {
  it('setup에서 gameDate+season 갱신', () => {
    const s0 = { ...tennisInitialState }; // phase 'setup'
    const s1 = tennisReducer(s0, { type: 'SET_GAME_DATE', date: '2026-03-15' });
    expect(s1.gameDate).toBe('2026-03-15');
    expect(s1.season).toBe(2026);
  });
  it('playing 이후엔 no-op', () => {
    const playing = { ...tennisInitialState, phase: 'playing', gameDate: '2026-08-12' };
    expect(tennisReducer(playing, { type: 'SET_GAME_DATE', date: '2026-03-15' })).toBe(playing);
  });
  it('빈/이상 날짜는 무시', () => {
    const s0 = { ...tennisInitialState, gameDate: '2026-08-12', season: 2026 };
    expect(tennisReducer(s0, { type: 'SET_GAME_DATE', date: '' })).toBe(s0);
  });
});
```

- [ ] **Step 2: 실패 확인** — `npx vitest run src/hooks/__tests__/tennisReducerGameDate.test.js` → FAIL

- [ ] **Step 3: 리듀서 구현** — `useTennisReducer.js`에 `SET_ATTENDEES` 근처:

```js
    case 'SET_GAME_DATE': {
      if (state.phase !== 'setup') return state;         // 경기 시작 후 고정
      if (!/^\d{4}-\d{2}-\d{2}$/.test(action.date || '')) return state;
      return { ...state, gameDate: action.date, season: Number(action.date.slice(0, 4)) };
    }
```

- [ ] **Step 4: 통과 확인** → PASS

- [ ] **Step 5: TennisApp 배선** — ① import에 `import { nowKST } from './utils/tennis/tennisTime';` ② `handleSubmitRecords`의 `inputTime`을 `nowKST()`로, rowBuilders 두 호출에 `inputBy: authUser?.name || ''` 추가:

```js
      const inputTime = nowKST();
      const inputBy = authUser?.name || '';
      const matchRows = buildTennisMatchRows({ team, state, inputTime, inputBy, memberSet });
      const pgRows = buildTennisPlayerGameRows({ team, state, inputTime, inputBy, memberSet, gradeByPlayer });
```

- [ ] **Step 6: 검증 + 커밋** — `npm test`(797+ 유지) + `npm run lint`. TennisApp 선언 순서 육안.

```bash
git add src/hooks/useTennisReducer.js src/TennisApp.jsx
git commit -m "feat(tennis): SET_GAME_DATE 액션 + 마감 시 KST·전송자 기록"
```

---

### Task 3: UI — 날짜 선택 + 중복 경고

**Files:**
- Modify: `src/components/tennis/TennisAttendeeSelector.jsx` (날짜 input + 중복 경고)
- Modify: `src/TennisApp.jsx` (selector에 prop 전달)

**Interfaces:**
- Consumes: Task 2 `SET_GAME_DATE`, 기존 `TennisSync.getPlayerGames(dateFrom, dateTo)`, Task 1 `nowKST`(오늘 KST 날짜 max).
- Produces: 참석자 설정 화면 상단 날짜 선택 + "이 날짜에 이미 N판 기록됨" 경고.

- [ ] **Step 1: TennisAttendeeSelector 날짜 UI** — props에 `gameDate`, `dispatch`(이미 있음) 사용. 상단(참석자 칩 위)에 날짜 카드 추가. `useState`로 그 날짜의 기존 로그 판수 관리:

```jsx
import { useState, useEffect } from 'react';
import TennisSync from '../../services/tennisSync';
import { nowKST } from '../../utils/tennis/tennisTime';

// 컴포넌트 내부:
  const todayKST = nowKST().slice(0, 10);
  const [dupCount, setDupCount] = useState(0);
  useEffect(() => {
    let alive = true;
    if (!gameDate) { setDupCount(0); return; }
    TennisSync.getPlayerGames(gameDate, gameDate).then(rows => {
      if (alive) setDupCount((rows || []).length);
    });
    return () => { alive = false; };
  }, [gameDate]);
```

날짜 입력 UI(참석자 sectionTitle 위):

```jsx
      <div style={{ ...s.card, marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13, color: C.gray }}>경기 날짜</span>
          <input type="date" value={gameDate || todayKST} max={todayKST}
            onChange={(e) => e.target.value && dispatch({ type: 'SET_GAME_DATE', date: e.target.value })}
            style={{ ...s.input, flex: 1, fontFamily: 'inherit' }} />
        </div>
        {dupCount > 0 && (
          <div style={{ fontSize: 12, color: C.orange, marginTop: 6 }}>
            이 날짜에 이미 {dupCount}판 기록됨 — 중복 입력에 주의하세요
          </div>
        )}
      </div>
```

- [ ] **Step 2: TennisApp prop** — setup 분기의 `<TennisAttendeeSelector ... />`는 이미 `gameDate={state.gameDate}`, `dispatch`를 넘긴다(확인). 안 넘기면 추가. C/styles도 확인.

- [ ] **Step 3: 검증** — `npm test` + `npm run lint` + `npm run build`. selector 선언 순서 육안(useEffect·useState 위치).

```bash
git add src/components/tennis/TennisAttendeeSelector.jsx src/TennisApp.jsx
git commit -m "feat(tennis): 경기 생성 시 과거 날짜 선택 + 같은 날짜 중복 경고"
```

---

### Task 4: 통합 검증 (브라우저 스모크)

**Files:** 없음(검증 전용).

- [ ] **Step 1: 전체 스위트/린트/빌드** — `npm test`, `npm run lint`, `npm run build`.
- [ ] **Step 2: 브라우저 스모크** — `npm run dev` + Playwright: 새 테니스 경기 생성 → ① 날짜 선택 렌더, 미래 날짜 차단(max), 과거 날짜 선택 시 subtitle/카드에 그 날짜 반영 ② 이미 기록 있는 날짜(예: 마이그레이션된 2026-02-02) 선택 시 "이미 N판 기록됨" 경고 표시 ③ 과거 날짜로 경기 진행 화면 정상 ④ 풋살 팀 무영향. 시트 전송(input_by/KST 실기록)은 운영 데이터라 스모크 제외 — 코드 경로는 유닛테스트로 커버됨. 테스트 경기는 삭제 정리.
- [ ] **Step 3: 배포·반영 안내 확인** — 이 브랜치는 Code.js(헤더) 변경 포함이므로, 머지·배포 후 **유저가 Apps Script 수동 반영** 필요함을 최종 보고에 명시(반영 전 마감분은 input_by 유실 가능).

---

## Self-Review 결과

- **Spec coverage**: §3 과거날짜(Task2 리듀서+Task3 UI+중복경고), §4 KST(Task1 유틸+Task2 배선), §5 input_by(Task1 스키마·헤더·rowBuilders+Task2 값 전달), §6 동기화 무변경(새 state 필드 없음 — 준수), §7 하위호환(빈값·미반영 안내는 Task4+배포순서), §8 테스트(Task1·2 유닛+Task4 스모크). §9 범위 밖 침범 없음.
- **Placeholder scan**: Task 1 Step 8·Task 2의 "기존 픽스처 재사용"은 실제 테스트 파일의 헬퍼를 가리키는 지시(placeholder 아님). 그 외 TBD 없음.
- **Type consistency**: `input_by` 필드명이 스키마(2곳)·헤더(2곳)·rowBuilders·값 전달 전 구간 동일. `nowKST`/`toKSTString` 시그니처가 Task1 정의와 Task2·3 소비부 일치. `SET_GAME_DATE {date}`가 리듀서·UI 일치. `inputBy` 인자명이 rowBuilders·TennisApp 일치.
