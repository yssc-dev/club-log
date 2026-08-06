# 테니스 종목 추가 1차 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 풋살/축구가 실사용 중인 앱에 테니스 종목을 추가해, 경기 생성부터 시트 로그 전송까지의 기록 파이프라인과 단식 승률 랭킹을 동작시킨다.

**Architecture:** 테니스 전용 시트 3종(`테니스_회원명부`/`로그_테니스매치`/`로그_테니스선수경기`)과 전용 앱(`TennisApp`)을 신설한다. 기존 풋살/축구 파일은 4개만 건드리며, 그중 `TeamDashboard.jsx`의 fetch guard만 기존 코드를 감싸고 나머지는 새 분기 추가다. 순수 함수(스코어링·파생·행빌더)를 먼저 완성해 유닛 테스트로 잠근 뒤 리듀서와 화면을 얹는다.

**Tech Stack:** React 18 + Vite, Firebase Realtime Database(진행 중 상태), Google Apps Script + Sheets(진실 소스), Vitest(jsdom).

## Global Constraints

이 절의 규칙은 **모든 태스크의 요구사항에 암묵적으로 포함된다.**

- **풋살/축구 회귀 금지.** 기존 파일 수정은 `src/Root.jsx`, `src/components/dashboard/TeamDashboard.jsx`, `src/config/settings.js`, `apps-script/Code.js` 4개로 한정한다. 그 외 기존 파일은 열지 않는다.
- **기존 로그 시트 무수정.** `로그_이벤트`/`로그_선수경기`/`로그_매치`의 스키마·읽기·쓰기 경로를 건드리지 않는다.
- **종목 문자열은 `'테니스'`** (`src/utils/tennis/tennisSchema.js`의 `TENNIS_SPORT` 상수만 사용, 리터럴 산재 금지).
- **등급 4단계**: `초보자` < `동배` < `은배` < `금배`.
- **리그 2종**: `흑기사`(상위) / `흑장미`(하위). 명부에 저장하지 않고 단식 로그에서 파생한다.
- **대회 리그명**: 단식 `길로틴`, 복식 `투몽`, 성립 안 하면 `미반영`.
- **시점 고정**: 등급과 승률 모두 **경기일 직전까지**의 값을 쓴다. 당일 결과는 그날 판정에 반영하지 않는다.
- **A편 = 화면 왼쪽**. 배치 → 진행 → 완료 요약 → 시트 로그까지 불변.
- **테스트 실행**: `npx vitest run <path>` (단일 파일), `npm test` (전체). 테스트 파일은 `src/**/__tests__/*.test.js`.
- **커밋 메시지**는 한국어 요약 한 줄 + 필요 시 본문. 기존 관례(`feat(soccer):`, `fix(sheets):`)를 따른다.
- **RTL 하네스가 없다.** build도 vitest도 렌더 크래시를 잡지 못하므로, jsx를 만든 태스크는 반드시 브라우저 스모크 단계를 포함한다.

---

## File Structure

**신규 — 순수 로직 (테스트 주도)**

| 파일 | 책임 |
|---|---|
| `src/utils/tennis/tennisSchema.js` | 시트 컬럼 순서·종목/등급/리그 상수. 단일 소스 |
| `src/utils/tennis/tennisScoring.js` | 세트/게임/타이브레이크 상태 전이, 판 승자, 판 집계 |
| `src/utils/tennis/normalizeTennisMatch.js` | RTDB에서 사라진 빈 배열/객체 복원 단일 지점 |
| `src/utils/tennis/tennisRowBuilders.js` | 마감 상태 → 시트 2종 행 |
| `src/utils/tennis/leagueDerivation.js` | 단식 로그 → 경기일별 흑기사/흑장미 배치 |
| `src/utils/tennis/rankPoints.js` | 포인트 산식(설정 주입) |
| `src/utils/tennis/tennisStandings.js` | 선수경기 로그 → 단식 순위표 / 개인 전적 요약 |

**신규 — 서비스/상태/화면**

| 파일 | 책임 |
|---|---|
| `src/services/tennisSync.js` | Apps Script 통신. authToken/team, throw 변환, ★ 제거 계약 재현 |
| `src/hooks/useTennisReducer.js` | 경기 상태 리듀서 + 코트별 undo 스택 |
| `src/TennisApp.jsx` | 경기 화면 루트, RTDB 구독/동기화 |
| `src/components/tennis/TennisAttendeeSelector.jsx` | 날짜 + 참석자 선택, 용병 추가 |
| `src/components/tennis/TennisRoundNav.jsx` | 라운드 이동/추가 |
| `src/components/tennis/TennisCourtCard.jsx` | 코트 카드 상태 스위치(ready/playing/done) |
| `src/components/tennis/TennisCourtSetup.jsx` | 단복식 토글·세트수·칩 배치 |
| `src/components/tennis/TennisCourtRecorder.jsx` | 좌우 증분·에이스/DF·되돌리기 |
| `src/components/tennis/TennisConfirmBar.jsx` | 경기 마감 바 |
| `src/components/tennis/TennisTabs.jsx` | 대시보드 탭 본문(경기관리/랭킹/개인기록) |

**수정 — 4개 파일**

| 파일 | 수정 |
|---|---|
| `src/config/settings.js` | 6곳(아래 Task 5) |
| `src/Root.jsx` | 라우팅 + `pendingGames` 종목 필터 |
| `src/components/dashboard/TeamDashboard.jsx` | 탭 구성 분기 + 본문 위임 + fetch guard |
| `apps-script/Code.js` | 시트 상수/헬퍼/액션 분기 + 상단 changelog |

---

## Task 1: 시트 스키마 상수

**Files:**
- Create: `src/utils/tennis/tennisSchema.js`
- Test: `src/utils/tennis/__tests__/tennisSchema.test.js`

**Interfaces:**
- Consumes: 없음 (첫 태스크)
- Produces: `TENNIS_SPORT: string`, `GRADES: string[]`, `GRADE_RANK: Record<string, number>`, `LEAGUE_BK: string`, `LEAGUE_BR: string`, `COMPETITION_SINGLES: string`, `COMPETITION_DOUBLES: string`, `COMPETITION_NONE: string`, `TENNIS_MATCH_COLUMNS: string[]` (21개), `TENNIS_PLAYER_GAME_COLUMNS: string[]` (29개)

- [ ] **Step 1: Write the failing test**

`src/utils/tennis/__tests__/tennisSchema.test.js`:

```js
import { describe, it, expect } from 'vitest';
import {
  TENNIS_SPORT, GRADES, GRADE_RANK,
  LEAGUE_BK, LEAGUE_BR,
  COMPETITION_SINGLES, COMPETITION_DOUBLES, COMPETITION_NONE,
  TENNIS_MATCH_COLUMNS, TENNIS_PLAYER_GAME_COLUMNS,
} from '../tennisSchema';

describe('상수', () => {
  it('종목/리그/대회 문자열', () => {
    expect(TENNIS_SPORT).toBe('테니스');
    expect(LEAGUE_BK).toBe('흑기사');
    expect(LEAGUE_BR).toBe('흑장미');
    expect(COMPETITION_SINGLES).toBe('길로틴');
    expect(COMPETITION_DOUBLES).toBe('투몽');
    expect(COMPETITION_NONE).toBe('미반영');
  });

  it('등급은 약→강 순서, GRADE_RANK로 비교 가능', () => {
    expect(GRADES).toEqual(['초보자', '동배', '은배', '금배']);
    expect(GRADE_RANK['동배']).toBeLessThan(GRADE_RANK['은배']);
    expect(GRADE_RANK['은배']).toBeLessThan(GRADE_RANK['금배']);
    expect(GRADE_RANK['']).toBeUndefined(); // 용병(등급 없음)
  });
});

describe('TENNIS_MATCH_COLUMNS', () => {
  it('21칸, 스펙 5.2 순서 그대로', () => {
    expect(TENNIS_MATCH_COLUMNS).toHaveLength(21);
    expect(TENNIS_MATCH_COLUMNS[0]).toBe('team');
    expect(TENNIS_MATCH_COLUMNS[8]).toBe('match_id');
    expect(TENNIS_MATCH_COLUMNS[13]).toBe('sets_json');
    expect(TENNIS_MATCH_COLUMNS[18]).toBe('winner');
    expect(TENNIS_MATCH_COLUMNS[20]).toBe('input_time');
  });

  it('구기 전용 필드가 섞이지 않는다', () => {
    for (const banned of ['goals', 'assists', 'our_gk', 'formation']) {
      expect(TENNIS_MATCH_COLUMNS).not.toContain(banned);
    }
  });
});

describe('TENNIS_PLAYER_GAME_COLUMNS', () => {
  it('29칸, 스펙 5.3 순서 그대로', () => {
    expect(TENNIS_PLAYER_GAME_COLUMNS).toHaveLength(29);
    expect(TENNIS_PLAYER_GAME_COLUMNS[0]).toBe('team');
    expect(TENNIS_PLAYER_GAME_COLUMNS[8]).toBe('player');
    expect(TENNIS_PLAYER_GAME_COLUMNS[15]).toBe('result');
    expect(TENNIS_PLAYER_GAME_COLUMNS[28]).toBe('input_time');
  });

  it('2차 지표에 필요한 컬럼이 전부 있다 (마이그레이션 방지)', () => {
    for (const col of [
      'tb_played', 'tb_won', 'aces', 'double_faults',
      'bagels_taken', 'bagels_given', 'grade_at_date',
      'partner', 'opponents_json', 'best_of',
    ]) {
      expect(TENNIS_PLAYER_GAME_COLUMNS).toContain(col);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/tennis/__tests__/tennisSchema.test.js`
Expected: FAIL — `Failed to resolve import "../tennisSchema"`

- [ ] **Step 3: Write minimal implementation**

`src/utils/tennis/tennisSchema.js`:

```js
// 테니스 시트 스키마 단일 소스. Apps Script(apps-script/Code.js)의
// TENNIS_MATCH_HEADERS / TENNIS_PLAYER_GAME_HEADERS 와 순서가 1:1로 일치해야 한다.
// 컬럼을 바꾸면 양쪽을 함께 고칠 것.

export const TENNIS_SPORT = '테니스';

// 약한 등급 → 강한 등급 순.
export const GRADES = ['초보자', '동배', '은배', '금배'];
export const GRADE_RANK = GRADES.reduce((acc, g, i) => { acc[g] = i; return acc; }, {});

export const LEAGUE_BK = '흑기사';
export const LEAGUE_BR = '흑장미';

export const COMPETITION_SINGLES = '길로틴';
export const COMPETITION_DOUBLES = '투몽';
export const COMPETITION_NONE = '미반영';

export const TENNIS_MATCH_COLUMNS = [
  'team', 'sport', 'season', 'date', 'game_id',
  'round_idx', 'court_id', 'match_idx', 'match_id',
  'format', 'best_of',
  'side_a_json', 'side_b_json',
  'sets_json', 'sets_a', 'sets_b', 'games_a', 'games_b', 'winner',
  'league', 'input_time',
];

export const TENNIS_PLAYER_GAME_COLUMNS = [
  'team', 'sport', 'season', 'date', 'game_id', 'match_id', 'round_idx', 'court_id',
  'player', 'is_guest', 'side', 'format', 'best_of',
  'partner', 'opponents_json', 'result',
  'sets_won', 'sets_lost', 'games_won', 'games_lost',
  'tb_played', 'tb_won', 'aces', 'double_faults',
  'bagels_taken', 'bagels_given',
  'grade_at_date', 'league', 'input_time',
];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/tennis/__tests__/tennisSchema.test.js`
Expected: PASS (3 suites, 6 tests)

- [ ] **Step 5: Commit**

```bash
git add src/utils/tennis/tennisSchema.js src/utils/tennis/__tests__/tennisSchema.test.js
git commit -m "feat(tennis): 시트 스키마 상수 (매치 21칸 / 선수경기 29칸)"
```

---

## Task 2: 스코어링 상태 전이

세트 모델은 `{ a, b, tbA, tbB, done }`이다. 게임 스코어가 **5:5에 닿는 순간 타이브레이크 모드**가 되고, 그 뒤로는 게임이 아니라 포인트를 센다. 7점 선취(노애드)로 끝나면 승자 쪽 게임이 6으로 확정되어 세트는 `6:5`가 된다. 6:5는 오직 타이브레이크로만 나온다 — 5:4에서 다음 게임은 6:4(세트 종료) 아니면 5:5(타이브레이크)이기 때문이다.

**Files:**
- Create: `src/utils/tennis/tennisScoring.js`
- Test: `src/utils/tennis/__tests__/tennisScoring.test.js`

**Interfaces:**
- Consumes: 없음
- Produces:
  - `emptySet(): {a:0,b:0,tbA:0,tbB:0,done:false}`
  - `isTiebreakActive(set): boolean`
  - `incrementGame(set, side: 'A'|'B'): set` — 타이브레이크 중이면 원본 그대로 반환
  - `incrementTiebreakPoint(set, side): set` — 타이브레이크 아니면 원본 그대로 반환
  - `setWinner(set): 'A'|'B'|null`
  - `isSetComplete(set): boolean`
  - `setsNeeded(bestOf: 1|3): number`
  - `matchWinner(sets, bestOf): 'A'|'B'|null`
  - `summarizeCourt(court): { setsA, setsB, gamesA, gamesB, winner, tbPlayed, tbWonA, tbWonB, bagelsGivenA, bagelsGivenB }`

- [ ] **Step 1: Write the failing test**

`src/utils/tennis/__tests__/tennisScoring.test.js`:

```js
import { describe, it, expect } from 'vitest';
import {
  emptySet, isTiebreakActive, incrementGame, incrementTiebreakPoint,
  setWinner, isSetComplete, setsNeeded, matchWinner, summarizeCourt,
} from '../tennisScoring';

const set = (a, b, tbA = 0, tbB = 0, done = false) => ({ a, b, tbA, tbB, done });

describe('게임 증분', () => {
  it('빈 세트에서 A가 한 게임 따면 1:0', () => {
    expect(incrementGame(emptySet(), 'A')).toEqual(set(1, 0));
  });

  it('6게임 선취로 세트 종료 — 6:4', () => {
    const s = incrementGame(set(5, 4), 'A');
    expect(s.a).toBe(6);
    expect(isSetComplete(s)).toBe(true);
    expect(setWinner(s)).toBe('A');
  });

  it('5:4에서 B가 따면 5:5 — 타이브레이크 진입', () => {
    const s = incrementGame(set(5, 4), 'B');
    expect(s).toMatchObject({ a: 5, b: 5 });
    expect(isTiebreakActive(s)).toBe(true);
    expect(isSetComplete(s)).toBe(false);
  });

  it('타이브레이크 중에는 게임 증분이 먹히지 않는다', () => {
    const tb = set(5, 5);
    expect(incrementGame(tb, 'A')).toEqual(tb);
  });
});

describe('타이브레이크', () => {
  it('타이브레이크가 아니면 포인트 증분이 먹히지 않는다', () => {
    const s = set(3, 2);
    expect(incrementTiebreakPoint(s, 'A')).toEqual(s);
  });

  it('7점 선취 시 승자 게임이 6으로 확정되고 세트가 6:5로 끝난다', () => {
    let s = set(5, 5);
    for (let i = 0; i < 7; i++) s = incrementTiebreakPoint(s, 'A');
    expect(s).toMatchObject({ a: 6, b: 5, tbA: 7, tbB: 0 });
    expect(isSetComplete(s)).toBe(true);
    expect(setWinner(s)).toBe('A');
  });

  it('7:4로 끝나는 실제 케이스', () => {
    let s = set(5, 5);
    for (let i = 0; i < 4; i++) { s = incrementTiebreakPoint(s, 'A'); s = incrementTiebreakPoint(s, 'B'); }
    expect(s).toMatchObject({ tbA: 4, tbB: 4 });
    for (let i = 0; i < 3; i++) s = incrementTiebreakPoint(s, 'A');
    expect(s).toMatchObject({ a: 6, b: 5, tbA: 7, tbB: 4 });
  });

  it('노애드 — 6:6에서 7점째를 딴 쪽이 즉시 이긴다 (2점차 불필요)', () => {
    let s = set(5, 5, 6, 6);
    s = incrementTiebreakPoint(s, 'B');
    expect(s).toMatchObject({ a: 5, b: 6, tbA: 6, tbB: 7 });
    expect(setWinner(s)).toBe('B');
  });

  it('끝난 세트에는 더 이상 포인트가 안 쌓인다', () => {
    const done = set(6, 5, 7, 4, true);
    expect(incrementTiebreakPoint(done, 'B')).toEqual(done);
  });
});

describe('판 승자', () => {
  it('1세트 경기는 한 세트로 끝난다', () => {
    expect(setsNeeded(1)).toBe(1);
    expect(matchWinner([set(6, 3, 0, 0, true)], 1)).toBe('A');
  });

  it('3세트 경기는 2세트를 먼저 따야 한다', () => {
    expect(setsNeeded(3)).toBe(2);
    expect(matchWinner([set(6, 3, 0, 0, true)], 3)).toBeNull();
    expect(matchWinner([set(6, 3, 0, 0, true), set(4, 6, 0, 0, true)], 3)).toBeNull();
    expect(matchWinner([
      set(6, 3, 0, 0, true), set(4, 6, 0, 0, true), set(6, 5, 7, 4, true),
    ], 3)).toBe('A');
  });
});

describe('summarizeCourt', () => {
  it('3세트 판을 집계한다 — 세트/게임/타이브레이크/베이글', () => {
    const court = {
      bestOf: 3,
      sets: [
        set(6, 0, 0, 0, true),   // A가 베이글 먹임
        set(4, 6, 0, 0, true),
        set(6, 5, 7, 4, true),   // 타이브레이크 A 승
      ],
    };
    expect(summarizeCourt(court)).toEqual({
      setsA: 2, setsB: 1,
      gamesA: 16, gamesB: 11,
      winner: 'A',
      tbPlayed: 1, tbWonA: 1, tbWonB: 0,
      bagelsGivenA: 1, bagelsGivenB: 0,
    });
  });

  it('타이브레이크 세트의 게임 수는 6/5로 센다', () => {
    const court = { bestOf: 1, sets: [set(6, 5, 7, 4, true)] };
    const s = summarizeCourt(court);
    expect(s.gamesA).toBe(6);
    expect(s.gamesB).toBe(5);
    expect(s.tbPlayed).toBe(1);
  });

  it('한 판에서 베이글 2개도 가능하다', () => {
    const court = {
      bestOf: 3,
      sets: [set(6, 0, 0, 0, true), set(3, 6, 0, 0, true), set(6, 0, 0, 0, true)],
    };
    const s = summarizeCourt(court);
    expect(s.bagelsGivenA).toBe(2);
    expect(s.winner).toBe('A');
  });

  it('미완료 판은 winner가 null', () => {
    const court = { bestOf: 3, sets: [set(6, 3, 0, 0, true), set(2, 1)] };
    expect(summarizeCourt(court).winner).toBeNull();
  });

  it('sets가 undefined여도 터지지 않는다', () => {
    expect(summarizeCourt({ bestOf: 1 })).toMatchObject({ setsA: 0, setsB: 0, winner: null });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/tennis/__tests__/tennisScoring.test.js`
Expected: FAIL — `Failed to resolve import "../tennisScoring"`

- [ ] **Step 3: Write minimal implementation**

`src/utils/tennis/tennisScoring.js`:

```js
// 테니스 스코어 상태 전이. React/DOM 의존 없음.
//
// 세트 모델: { a, b, tbA, tbB, done }
//   - a/b   : 게임 수
//   - tbA/tbB: 타이브레이크 포인트 (5:5 도달 후에만 쌓인다)
//   - done  : 세트 종료 여부
//
// 규칙(클럽 커스텀): 6게임 선취. 5:5가 되면 노애드 타이브레이크 7점 선취.
// 타이브레이크 승자가 6번째 게임을 가져가므로 최종 세트 스코어는 6:5가 된다.
// 6:5는 타이브레이크로만 나온다 — 5:4에서 다음 게임은 6:4 아니면 5:5이기 때문.

const GAMES_TO_WIN_SET = 6;
const TIEBREAK_POINTS_TO_WIN = 7;

export function emptySet() {
  return { a: 0, b: 0, tbA: 0, tbB: 0, done: false };
}

export function isSetComplete(set) {
  if (!set) return false;
  return set.a >= GAMES_TO_WIN_SET || set.b >= GAMES_TO_WIN_SET;
}

export function isTiebreakActive(set) {
  if (!set || set.done) return false;
  return set.a === 5 && set.b === 5;
}

export function setWinner(set) {
  if (!set) return null;
  if (set.a >= GAMES_TO_WIN_SET) return 'A';
  if (set.b >= GAMES_TO_WIN_SET) return 'B';
  return null;
}

export function incrementGame(set, side) {
  if (!set || set.done || isSetComplete(set)) return set;
  if (isTiebreakActive(set)) return set; // 타이브레이크 중엔 포인트만 센다
  const key = side === 'A' ? 'a' : 'b';
  return { ...set, [key]: (set[key] || 0) + 1 };
}

export function incrementTiebreakPoint(set, side) {
  if (!set || set.done || !isTiebreakActive(set)) return set;
  const key = side === 'A' ? 'tbA' : 'tbB';
  const next = { ...set, [key]: (set[key] || 0) + 1 };
  if (next[key] >= TIEBREAK_POINTS_TO_WIN) {
    // 승자가 6번째 게임을 가져간다 → 6:5
    if (side === 'A') next.a = GAMES_TO_WIN_SET;
    else next.b = GAMES_TO_WIN_SET;
  }
  return next;
}

export function setsNeeded(bestOf) {
  return Math.ceil((Number(bestOf) || 1) / 2);
}

export function matchWinner(sets, bestOf) {
  const need = setsNeeded(bestOf);
  let a = 0, b = 0;
  for (const s of (sets || [])) {
    const w = setWinner(s);
    if (w === 'A') a++;
    else if (w === 'B') b++;
  }
  if (a >= need) return 'A';
  if (b >= need) return 'B';
  return null;
}

export function summarizeCourt(court) {
  const sets = (court && Array.isArray(court.sets)) ? court.sets : [];
  let setsA = 0, setsB = 0, gamesA = 0, gamesB = 0;
  let tbPlayed = 0, tbWonA = 0, tbWonB = 0;
  let bagelsGivenA = 0, bagelsGivenB = 0;

  for (const s of sets) {
    gamesA += s.a || 0;
    gamesB += s.b || 0;
    const w = setWinner(s);
    if (w === 'A') setsA++;
    else if (w === 'B') setsB++;

    // 타이브레이크는 5:5를 거쳐야만 발생하므로 tb 포인트 존재로 판정한다.
    if ((s.tbA || 0) > 0 || (s.tbB || 0) > 0) {
      tbPlayed++;
      if (w === 'A') tbWonA++;
      else if (w === 'B') tbWonB++;
    }

    if (s.a === GAMES_TO_WIN_SET && s.b === 0) bagelsGivenA++;
    if (s.b === GAMES_TO_WIN_SET && s.a === 0) bagelsGivenB++;
  }

  return {
    setsA, setsB, gamesA, gamesB,
    winner: matchWinner(sets, court && court.bestOf),
    tbPlayed, tbWonA, tbWonB,
    bagelsGivenA, bagelsGivenB,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/tennis/__tests__/tennisScoring.test.js`
Expected: PASS (4 suites, 15 tests)

- [ ] **Step 5: Commit**

```bash
git add src/utils/tennis/tennisScoring.js src/utils/tennis/__tests__/tennisScoring.test.js
git commit -m "feat(tennis): 스코어링 상태 전이 (5:5 타이브레이크, 베이글, 판 집계)"
```

---

## Task 3: RTDB 빈 배열 복원

Firebase는 빈 배열/빈 객체를 저장하지 않는다. 동기화 후 `rounds`·`courts`·`sets`·`sideA`가 `undefined`로 돌아오거나, 배열이 `{0:..., 1:...}` 객체로 바뀐다. **호출부에서 땜질하지 말고 이 한 지점에서만 복원한다.**

**Files:**
- Create: `src/utils/tennis/normalizeTennisMatch.js`
- Test: `src/utils/tennis/__tests__/normalizeTennisMatch.test.js`

**Interfaces:**
- Consumes: `emptySet` (Task 2)
- Produces:
  - `normalizeTennisCourt(court): Court` — `sideA`/`sideB`/`sets`/`undoStack` 배열화, `stats` 객체화, `format`/`bestOf`/`status`/`currentSet` 기본값
  - `normalizeTennisMatch(state): State` — `attendees`/`guests`/`rounds` 배열화 + 라운드마다 `courts` 배열화 + 코트마다 `normalizeTennisCourt`. `rounds`는 `roundIdx` 오름차순 정렬

- [ ] **Step 1: Write the failing test**

`src/utils/tennis/__tests__/normalizeTennisMatch.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { normalizeTennisCourt, normalizeTennisMatch } from '../normalizeTennisMatch';

describe('normalizeTennisCourt', () => {
  it('undefined 배열 필드를 빈 배열로 되살린다', () => {
    const c = normalizeTennisCourt({ courtId: 1 });
    expect(c.sideA).toEqual([]);
    expect(c.sideB).toEqual([]);
    expect(c.sets).toEqual([]);
    expect(c.undoStack).toEqual([]);
    expect(c.stats).toEqual({});
  });

  it('객체로 변환된 배열을 배열로 되돌린다', () => {
    const c = normalizeTennisCourt({
      courtId: 1,
      sideA: { 0: '박성언', 1: '기다빈' },
      sets: { 0: { a: 6, b: 3 } },
    });
    expect(c.sideA).toEqual(['박성언', '기다빈']);
    expect(c.sets).toEqual([{ a: 6, b: 3, tbA: 0, tbB: 0, done: false }]);
  });

  it('세트 안의 누락 필드도 채운다', () => {
    const c = normalizeTennisCourt({ courtId: 1, sets: [{ a: 6 }] });
    expect(c.sets[0]).toEqual({ a: 6, b: 0, tbA: 0, tbB: 0, done: false });
  });

  it('기본값 — 단식 · 1세트 · ready', () => {
    const c = normalizeTennisCourt({ courtId: 2 });
    expect(c.format).toBe('단식');
    expect(c.bestOf).toBe(1);
    expect(c.status).toBe('ready');
    expect(c.currentSet).toBe(0);
  });

  it('기존 값은 덮어쓰지 않는다', () => {
    const c = normalizeTennisCourt({ courtId: 2, format: '복식', bestOf: 3, status: 'playing', currentSet: 2 });
    expect(c).toMatchObject({ format: '복식', bestOf: 3, status: 'playing', currentSet: 2 });
  });
});

describe('normalizeTennisMatch', () => {
  it('null이면 null', () => {
    expect(normalizeTennisMatch(null)).toBeNull();
  });

  it('rounds/attendees/guests가 통째로 사라진 경우를 복원한다', () => {
    const s = normalizeTennisMatch({ gameId: 'g_1', team: '몽피스' });
    expect(s.rounds).toEqual([]);
    expect(s.attendees).toEqual([]);
    expect(s.guests).toEqual([]);
  });

  it('rounds가 객체여도 배열로 만들고 roundIdx 순으로 정렬한다', () => {
    const s = normalizeTennisMatch({
      rounds: { 1: { roundIdx: 2, courts: [{ courtId: 1 }] }, 0: { roundIdx: 1, courts: [] } },
    });
    expect(s.rounds.map(r => r.roundIdx)).toEqual([1, 2]);
    expect(s.rounds[1].courts[0].sideA).toEqual([]);
  });

  it('courts가 사라진 라운드도 빈 배열이 된다', () => {
    const s = normalizeTennisMatch({ rounds: [{ roundIdx: 1 }] });
    expect(s.rounds[0].courts).toEqual([]);
  });

  it('중첩 코트까지 정규화한다', () => {
    const s = normalizeTennisMatch({
      rounds: [{ roundIdx: 1, courts: { 0: { courtId: 1, sideB: { 0: '김성환' } } } }],
    });
    expect(s.rounds[0].courts[0].sideB).toEqual(['김성환']);
    expect(s.rounds[0].courts[0].sets).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/tennis/__tests__/normalizeTennisMatch.test.js`
Expected: FAIL — `Failed to resolve import "../normalizeTennisMatch"`

- [ ] **Step 3: Write minimal implementation**

`src/utils/tennis/normalizeTennisMatch.js`:

```js
// Firebase RTDB는 빈 배열/빈 객체를 저장하지 않고, 배열을 {0:..,1:..} 객체로 돌려주기도 한다.
// 동기화 직후 rounds/courts/sets/sideA 등이 undefined가 되는 문제를 여기 한 지점에서만 복원한다.
// ★ 호출부에서 `(x || [])` 로 땜질하지 말 것 — 방어가 흩어지면 다음 필드에서 또 터진다.

import { emptySet } from './tennisScoring';

function asArray(v) {
  if (Array.isArray(v)) return v;
  if (v && typeof v === 'object') return Object.values(v);
  return [];
}

function normalizeSet(s) {
  const base = emptySet();
  if (!s || typeof s !== 'object') return base;
  return {
    a: s.a || 0,
    b: s.b || 0,
    tbA: s.tbA || 0,
    tbB: s.tbB || 0,
    done: s.done === true,
  };
}

export function normalizeTennisCourt(court) {
  if (!court || typeof court !== 'object') return court;
  return {
    ...court,
    format: court.format || '단식',
    bestOf: court.bestOf || 1,
    status: court.status || 'ready',
    currentSet: court.currentSet || 0,
    sideA: asArray(court.sideA),
    sideB: asArray(court.sideB),
    sets: asArray(court.sets).map(normalizeSet),
    stats: (court.stats && typeof court.stats === 'object') ? court.stats : {},
    undoStack: asArray(court.undoStack),
  };
}

export function normalizeTennisMatch(state) {
  if (!state) return null;
  const rounds = asArray(state.rounds)
    .map(r => ({
      ...r,
      roundIdx: r?.roundIdx || 0,
      courts: asArray(r?.courts).map(normalizeTennisCourt),
    }))
    .sort((x, y) => x.roundIdx - y.roundIdx);

  return {
    ...state,
    attendees: asArray(state.attendees),
    guests: asArray(state.guests),
    rounds,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/tennis/__tests__/normalizeTennisMatch.test.js`
Expected: PASS (2 suites, 10 tests)

- [ ] **Step 5: Commit**

```bash
git add src/utils/tennis/normalizeTennisMatch.js src/utils/tennis/__tests__/normalizeTennisMatch.test.js
git commit -m "feat(tennis): RTDB 빈 배열 복원 단일 지점"
```

---

## Task 4: 흑기사/흑장미 파생

리그는 명부에 저장하지 않는다. **경기일 직전까지의 시즌 누적 단식 승률**로 그날 하루치 배치를 한 번 계산한다. 당일 결과는 그날 판정에 반영하지 않으므로, 오전에 이겨서 오후에 승격하는 일이 없다.

**Files:**
- Create: `src/utils/tennis/leagueDerivation.js`
- Test: `src/utils/tennis/__tests__/leagueDerivation.test.js`

**Interfaces:**
- Consumes: `LEAGUE_BK`, `LEAGUE_BR`, `COMPETITION_SINGLES` (Task 1)
- Produces:
  - `singlesWinRatesBefore(playerGameRows, dateISO): Map<string, {wins, losses, rate}>` — `date < dateISO`이고 `format==='단식'`이며 `league==='길로틴'`인 행만 집계
  - `deriveLeagueForDate({ rows, dateISO, roster }): Record<string, '흑기사'|'흑장미'>` — roster는 `[{name, seasonStartRank}]`

정렬 규칙: ① 승률 내림차순 → ② 승수 내림차순 → ③ 이름 가나다순. 기록이 전혀 없으면 `seasonStartRank`(있는 사람 먼저, 값 오름차순) → 나머지는 이름 가나다순. 상위 절반(`Math.ceil(n/2)`... 아래 주의)을 흑기사로 한다.

**16명 규칙과 "상위 절반"의 관계:** 클럽 정원이 16명이고 1~8위가 흑기사이므로 절반이다. 인원이 홀수면 `Math.floor(n/2)`를 흑기사로 해 상위가 더 적어지게 한다 — 하위 리그가 커야 "버스 탄다"는 표현이 유지된다.

**시즌 초 예외:** 승률 기록이 아무도 없고 시드도 아무도 없으면 **전원 흑기사**로 둔다(= 리그 역전 보너스 +3이 발생하지 않음). 시드가 한 명이라도 있으면 시드 순으로 갈린다.

- [ ] **Step 1: Write the failing test**

`src/utils/tennis/__tests__/leagueDerivation.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { singlesWinRatesBefore, deriveLeagueForDate } from '../leagueDerivation';
import { LEAGUE_BK, LEAGUE_BR } from '../tennisSchema';

const row = (player, date, result, format = '단식', league = '길로틴') =>
  ({ player, date, result, format, league });

describe('singlesWinRatesBefore', () => {
  const rows = [
    row('박성언', '2026-03-01', '승'),
    row('박성언', '2026-03-01', '승'),
    row('박성언', '2026-08-06', '패'),          // 당일 — 제외돼야 함
    row('김성환', '2026-03-01', '패'),
    row('김성환', '2026-05-02', '승'),
    row('이승환', '2026-04-01', '승', '복식', '투몽'),   // 복식 — 제외
    row('신대철', '2026-04-01', '승', '단식', '미반영'), // 리그 미성립 — 제외
  ];

  it('경기일 당일 결과는 반영하지 않는다', () => {
    const m = singlesWinRatesBefore(rows, '2026-08-06');
    expect(m.get('박성언')).toEqual({ wins: 2, losses: 0, rate: 1 });
  });

  it('복식과 리그 미성립 판은 승률에 안 들어간다', () => {
    const m = singlesWinRatesBefore(rows, '2026-08-06');
    expect(m.has('이승환')).toBe(false);
    expect(m.has('신대철')).toBe(false);
  });

  it('승패를 섞어 승률을 낸다', () => {
    const m = singlesWinRatesBefore(rows, '2026-08-06');
    expect(m.get('김성환')).toEqual({ wins: 1, losses: 1, rate: 0.5 });
  });
});

describe('deriveLeagueForDate', () => {
  const roster = (names, seeds = {}) =>
    names.map(n => ({ name: n, seasonStartRank: seeds[n] }));

  it('승률 순으로 상위 절반이 흑기사', () => {
    const rows = [
      row('a', '2026-03-01', '승'), row('a', '2026-03-02', '승'),
      row('b', '2026-03-01', '승'), row('b', '2026-03-02', '패'),
      row('c', '2026-03-01', '패'), row('c', '2026-03-02', '패'),
      row('d', '2026-03-01', '패'), row('d', '2026-03-02', '패'),
    ];
    const out = deriveLeagueForDate({ rows, dateISO: '2026-08-06', roster: roster(['a', 'b', 'c', 'd']) });
    expect(out.a).toBe(LEAGUE_BK);
    expect(out.b).toBe(LEAGUE_BK);
    expect(out.c).toBe(LEAGUE_BR);
    expect(out.d).toBe(LEAGUE_BR);
  });

  it('홀수 인원이면 흑기사가 더 적다 (5명 → 2:3)', () => {
    const rows = ['a', 'b', 'c', 'd', 'e'].flatMap((n, i) =>
      Array.from({ length: 5 - i }, () => row(n, '2026-03-01', '승')));
    const out = deriveLeagueForDate({ rows, dateISO: '2026-08-06', roster: roster(['a', 'b', 'c', 'd', 'e']) });
    const bk = Object.values(out).filter(v => v === LEAGUE_BK);
    expect(bk).toHaveLength(2);
  });

  it('기록도 시드도 없으면 전원 흑기사 (리그 역전 보너스 미발생)', () => {
    const out = deriveLeagueForDate({ rows: [], dateISO: '2026-01-10', roster: roster(['a', 'b', 'c', 'd']) });
    expect(Object.values(out).every(v => v === LEAGUE_BK)).toBe(true);
  });

  it('시드가 있으면 시드 순으로 가른다', () => {
    const out = deriveLeagueForDate({
      rows: [], dateISO: '2026-01-10',
      roster: roster(['a', 'b', 'c', 'd'], { a: 3, b: 1, c: 4, d: 2 }),
    });
    expect(out.b).toBe(LEAGUE_BK);
    expect(out.d).toBe(LEAGUE_BK);
    expect(out.a).toBe(LEAGUE_BR);
    expect(out.c).toBe(LEAGUE_BR);
  });

  it('시드가 일부만 있으면 미시드는 뒤로 붙고 가나다순', () => {
    const out = deriveLeagueForDate({
      rows: [], dateISO: '2026-01-10',
      roster: roster(['하늘', '가람', '나무', '다솜'], { 나무: 1, 다솜: 2 }),
    });
    expect(out['나무']).toBe(LEAGUE_BK);
    expect(out['다솜']).toBe(LEAGUE_BK);
    // 미시드 2명은 가나다순으로 3·4위 → 둘 다 흑장미
    expect(out['가람']).toBe(LEAGUE_BR);
    expect(out['하늘']).toBe(LEAGUE_BR);
  });

  it('기록 있는 사람이 기록 없는 사람보다 앞선다', () => {
    const rows = [row('무기록아님', '2026-03-01', '패')];
    const out = deriveLeagueForDate({
      rows, dateISO: '2026-08-06', roster: roster(['무기록아님', '무기록1', '무기록2', '무기록3']),
    });
    expect(out['무기록아님']).toBe(LEAGUE_BK);
  });

  it('로스터가 비면 빈 객체', () => {
    expect(deriveLeagueForDate({ rows: [], dateISO: '2026-08-06', roster: [] })).toEqual({});
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/tennis/__tests__/leagueDerivation.test.js`
Expected: FAIL — `Failed to resolve import "../leagueDerivation"`

- [ ] **Step 3: Write minimal implementation**

`src/utils/tennis/leagueDerivation.js`:

```js
// 흑기사(BK)/흑장미(BR)는 명부에 저장하지 않고 단식 로그에서 파생한다.
// 기준은 "경기일 직전까지의 시즌 누적 단식 승률" — 당일 결과는 그날 판정에 넣지 않는다.
// 덕분에 하루 안에서는 배치가 고정되고, 마감 순서가 꼬여도 포인트가 흔들리지 않는다.

import { LEAGUE_BK, LEAGUE_BR, COMPETITION_SINGLES } from './tennisSchema';

export function singlesWinRatesBefore(playerGameRows, dateISO) {
  const acc = new Map();
  for (const r of (playerGameRows || [])) {
    if (!r || r.format !== '단식') continue;
    if (r.league !== COMPETITION_SINGLES) continue;   // 용병전 등 미성립 판 제외
    if (!r.date || String(r.date) >= String(dateISO)) continue; // 당일 포함 이후 제외
    const cur = acc.get(r.player) || { wins: 0, losses: 0, rate: 0 };
    if (r.result === '승') cur.wins++;
    else if (r.result === '패') cur.losses++;
    else continue;
    const total = cur.wins + cur.losses;
    cur.rate = total > 0 ? cur.wins / total : 0;
    acc.set(r.player, cur);
  }
  return acc;
}

// 정렬: 기록 있는 사람 우선(승률↓ → 승수↓ → 이름) → 시드 있는 사람(시드↑) → 나머지(이름)
function orderPlayers(roster, rates) {
  const byName = (a, b) => String(a.name).localeCompare(String(b.name), 'ko');
  const recorded = [];
  const seeded = [];
  const rest = [];

  for (const m of roster) {
    if (rates.has(m.name)) recorded.push(m);
    else if (m.seasonStartRank !== undefined && m.seasonStartRank !== null && m.seasonStartRank !== '') seeded.push(m);
    else rest.push(m);
  }

  recorded.sort((a, b) => {
    const ra = rates.get(a.name), rb = rates.get(b.name);
    if (rb.rate !== ra.rate) return rb.rate - ra.rate;
    if (rb.wins !== ra.wins) return rb.wins - ra.wins;
    return byName(a, b);
  });
  seeded.sort((a, b) => Number(a.seasonStartRank) - Number(b.seasonStartRank) || byName(a, b));
  rest.sort(byName);

  return [...recorded, ...seeded, ...rest];
}

export function deriveLeagueForDate({ rows, dateISO, roster }) {
  const list = (roster || []).filter(m => m && m.name);
  if (list.length === 0) return {};

  const rates = singlesWinRatesBefore(rows, dateISO);
  const hasAnySignal = list.some(m =>
    rates.has(m.name) ||
    (m.seasonStartRank !== undefined && m.seasonStartRank !== null && m.seasonStartRank !== ''));

  const out = {};
  // 시즌 초 — 순위를 가를 근거가 전혀 없으면 전원 같은 리그로 둔다.
  // (전원 흑기사로 두면 "장미가 기사를 이김" 보너스가 발생하지 않아 중립이다.)
  if (!hasAnySignal) {
    for (const m of list) out[m.name] = LEAGUE_BK;
    return out;
  }

  const ordered = orderPlayers(list, rates);
  // 홀수면 흑기사를 더 적게 — 하위 리그가 커야 "버스 탄다"가 성립한다.
  const bkCount = Math.floor(ordered.length / 2) || ordered.length;
  ordered.forEach((m, i) => { out[m.name] = i < bkCount ? LEAGUE_BK : LEAGUE_BR; });
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/tennis/__tests__/leagueDerivation.test.js`
Expected: PASS (2 suites, 10 tests)

- [ ] **Step 5: Commit**

```bash
git add src/utils/tennis/leagueDerivation.js src/utils/tennis/__tests__/leagueDerivation.test.js
git commit -m "feat(tennis): 흑기사/흑장미 파생 (경기일 경계 고정, 시드 폴백)"
```

---

## Task 5: 랭킹 포인트 산식

포인트는 **단식 전용**이며 조건별로 누적된다. 기본승 1 + (동일리그 승률역전 2 **또는** 리그역전 3) + 등급역전 5. 앞의 둘은 상호 배타적이다 — 같은 리그인 동시에 다른 리그일 수 없기 때문이다. 최대 9점.

**등급 2단계 이상 차이(동배가 금배를 이김)의 점수는 아직 미확정이다.** 산식을 설정 객체로 주입받게 만들어 확정 시 코드 수정 없이 바꿀 수 있게 한다. 기본값은 "차이 무관 고정 5점"으로 둔다.

**Files:**
- Create: `src/utils/tennis/rankPoints.js`
- Test: `src/utils/tennis/__tests__/rankPoints.test.js`

**Interfaces:**
- Consumes: `GRADE_RANK`, `LEAGUE_BK`, `LEAGUE_BR`, `COMPETITION_SINGLES` (Task 1)
- Produces:
  - `DEFAULT_POINT_RULES: { baseWin: 1, sameLeagueUpset: 2, leagueUpset: 3, gradeUpset: 5, gradeUpsetPerStep: false }`
  - `calcMatchPoints(ctx, rules?): number` — `ctx = { format, league, winner: {name, grade, leagueTier, winRate, isGuest}, loser: {...} }`

- [ ] **Step 1: Write the failing test**

`src/utils/tennis/__tests__/rankPoints.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { calcMatchPoints, DEFAULT_POINT_RULES } from '../rankPoints';
import { LEAGUE_BK, LEAGUE_BR } from '../tennisSchema';

const p = (over = {}) => ({
  name: 'x', grade: '동배', leagueTier: LEAGUE_BK, winRate: 0.5, isGuest: false, ...over,
});
const ctx = (over = {}) => ({
  format: '단식', league: '길로틴', winner: p(), loser: p({ name: 'y' }), ...over,
});

describe('기본', () => {
  it('아무 조건도 안 걸리면 기본승 1점', () => {
    expect(calcMatchPoints(ctx({
      winner: p({ winRate: 0.8 }), loser: p({ name: 'y', winRate: 0.3 }),
    }))).toBe(1);
  });

  it('복식은 포인트가 없다', () => {
    expect(calcMatchPoints(ctx({ format: '복식', league: '투몽' }))).toBe(0);
  });

  it('리그 미성립 판은 포인트가 없다', () => {
    expect(calcMatchPoints(ctx({ league: '미반영' }))).toBe(0);
  });
});

describe('승률 역전 (+2)', () => {
  it('같은 리그에서 승률 낮은 쪽이 이기면 1+2', () => {
    expect(calcMatchPoints(ctx({
      winner: p({ winRate: 0.2, leagueTier: LEAGUE_BK }),
      loser: p({ name: 'y', winRate: 0.9, leagueTier: LEAGUE_BK }),
    }))).toBe(3);
  });

  it('승률이 같으면 역전이 아니다', () => {
    expect(calcMatchPoints(ctx({
      winner: p({ winRate: 0.5 }), loser: p({ name: 'y', winRate: 0.5 }),
    }))).toBe(1);
  });

  it('리그가 다르면 +2는 걸리지 않는다 (상호 배타)', () => {
    const got = calcMatchPoints(ctx({
      winner: p({ winRate: 0.2, leagueTier: LEAGUE_BK }),
      loser: p({ name: 'y', winRate: 0.9, leagueTier: LEAGUE_BR }),
    }));
    expect(got).toBe(1); // 기사가 장미를 이긴 것 — 역전 아님
  });
});

describe('리그 역전 (+3)', () => {
  it('장미가 기사를 이기면 1+3', () => {
    expect(calcMatchPoints(ctx({
      winner: p({ leagueTier: LEAGUE_BR, winRate: 0.9 }),
      loser: p({ name: 'y', leagueTier: LEAGUE_BK, winRate: 0.9 }),
    }))).toBe(4);
  });

  it('기사가 장미를 이기면 보너스 없음', () => {
    expect(calcMatchPoints(ctx({
      winner: p({ leagueTier: LEAGUE_BK }),
      loser: p({ name: 'y', leagueTier: LEAGUE_BR }),
    }))).toBe(1);
  });
});

describe('등급 역전 (+5)', () => {
  it('동배가 은배를 이기면 1+5', () => {
    expect(calcMatchPoints(ctx({
      winner: p({ grade: '동배', winRate: 0.9 }),
      loser: p({ name: 'y', grade: '은배', winRate: 0.9 }),
    }))).toBe(6);
  });

  it('기본 규칙에서는 2단계 차이도 5점 (차이 무관)', () => {
    expect(calcMatchPoints(ctx({
      winner: p({ grade: '동배', winRate: 0.9 }),
      loser: p({ name: 'y', grade: '금배', winRate: 0.9 }),
    }))).toBe(6);
  });

  it('gradeUpsetPerStep을 켜면 단계당 가산 — 동배→금배는 1+10', () => {
    expect(calcMatchPoints(ctx({
      winner: p({ grade: '동배', winRate: 0.9 }),
      loser: p({ name: 'y', grade: '금배', winRate: 0.9 }),
    }), { ...DEFAULT_POINT_RULES, gradeUpsetPerStep: true })).toBe(11);
  });

  it('용병이 끼면 등급 가산을 건너뛴다', () => {
    expect(calcMatchPoints(ctx({
      league: '길로틴',
      winner: p({ grade: '', isGuest: true, winRate: 0.9 }),
      loser: p({ name: 'y', grade: '은배', winRate: 0.9 }),
    }))).toBe(1);
  });
});

describe('누적 최대', () => {
  it('장미+동배가 기사+은배를 이기면 1+3+5 = 9점', () => {
    expect(calcMatchPoints(ctx({
      winner: p({ leagueTier: LEAGUE_BR, grade: '동배', winRate: 0.9 }),
      loser: p({ name: 'y', leagueTier: LEAGUE_BK, grade: '은배', winRate: 0.9 }),
    }))).toBe(9);
  });

  it('동일리그 승률역전 + 등급역전은 1+2+5 = 8점', () => {
    expect(calcMatchPoints(ctx({
      winner: p({ leagueTier: LEAGUE_BK, grade: '동배', winRate: 0.1 }),
      loser: p({ name: 'y', leagueTier: LEAGUE_BK, grade: '은배', winRate: 0.9 }),
    }))).toBe(8);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/tennis/__tests__/rankPoints.test.js`
Expected: FAIL — `Failed to resolve import "../rankPoints"`

- [ ] **Step 3: Write minimal implementation**

`src/utils/tennis/rankPoints.js`:

```js
// 랭킹 포인트는 단식(길로틴리그) 전용이며 조건별로 누적된다.
//   기본승 1
//   + 동일 리그에서 승률 낮은 쪽이 이김  2   ┐ 같은 리그 / 다른 리그라
//   + 장미가 기사를 이김                 3   ┘ 둘은 상호 배타적이다
//   + 하위 등급이 상위 등급을 이김       5
// 최대 1+3+5 = 9점.
//
// ★ 등급이 2단계 이상 차이날 때(동배가 금배를 이김)의 점수는 의뢰인 확인 대기 중이다.
//   기본값은 "차이 무관 고정 5점"이고, gradeUpsetPerStep을 켜면 단계당 가산으로 바뀐다.
//   확정되면 이 파일이 아니라 호출부의 rules 객체만 바꾸면 된다.

import { GRADE_RANK, LEAGUE_BR, COMPETITION_SINGLES } from './tennisSchema';

export const DEFAULT_POINT_RULES = {
  baseWin: 1,
  sameLeagueUpset: 2,
  leagueUpset: 3,
  gradeUpset: 5,
  gradeUpsetPerStep: false,
};

export function calcMatchPoints(ctx, rules = DEFAULT_POINT_RULES) {
  if (!ctx || ctx.format !== '단식') return 0;
  if (ctx.league !== COMPETITION_SINGLES) return 0;

  const w = ctx.winner || {};
  const l = ctx.loser || {};
  let points = rules.baseWin;

  const sameLeague = w.leagueTier === l.leagueTier;
  if (sameLeague) {
    if ((w.winRate || 0) < (l.winRate || 0)) points += rules.sameLeagueUpset;
  } else if (w.leagueTier === LEAGUE_BR) {
    points += rules.leagueUpset;
  }

  // 용병은 명부에 없어 등급이 없다. 빈 문자열을 등급 상수와 비교하지 않는다.
  if (!w.isGuest && !l.isGuest) {
    const wr = GRADE_RANK[w.grade];
    const lr = GRADE_RANK[l.grade];
    if (wr !== undefined && lr !== undefined && wr < lr) {
      points += rules.gradeUpsetPerStep
        ? rules.gradeUpset * (lr - wr)
        : rules.gradeUpset;
    }
  }

  return points;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/tennis/__tests__/rankPoints.test.js`
Expected: PASS (5 suites, 13 tests)

- [ ] **Step 5: Commit**

```bash
git add src/utils/tennis/rankPoints.js src/utils/tennis/__tests__/rankPoints.test.js
git commit -m "feat(tennis): 랭킹 포인트 산식 (누적, 단식 전용, 규칙 주입)"
```

---

## Task 6: settings.js 6곳 + 회귀 테스트

**실행으로 확인된 사실이다.** `resolvePreset('아무팀','테니스')`는 현재 `undefined`를 반환하고, `migrateToNested`는 테니스 키를 통째로 버린다. `SPORT_DEFAULTS`/`PRESETS`만 추가하면 동작하지 않는다.

**Files:**
- Modify: `src/config/settings.js` — 6곳
- Test: `src/config/__tests__/tennisSettings.test.js` (신규 파일. 기존 `settings.test.js`는 건드리지 않는다)

**Interfaces:**
- Consumes: 없음
- Produces: `SPORT_DEFAULTS['테니스']`, `PRESETS['테니스']['표준테니스']`, `PRESET_MAP._default['테니스'] === '표준테니스'`. `getEffectiveSettings(team,'테니스')`가 `pointRules`를 포함한 객체를 반환

- [ ] **Step 1: Write the failing test**

`src/config/__tests__/tennisSettings.test.js`:

```js
import { describe, it, expect } from 'vitest';
import {
  SPORT_DEFAULTS, PRESETS, resolvePreset,
  isLegacyFormat, migrateToNested,
} from '../settings';

describe('테니스 기본값', () => {
  it('SPORT_DEFAULTS에 테니스가 있다', () => {
    expect(SPORT_DEFAULTS['테니스']).toBeDefined();
    expect(SPORT_DEFAULTS['테니스'].pointRules).toMatchObject({ baseWin: 1, gradeUpset: 5 });
  });

  it('PRESETS에 표준테니스가 있다', () => {
    expect(PRESETS['테니스']['표준테니스']).toBeDefined();
  });

  it('resolvePreset이 undefined를 반환하지 않는다 (Firebase set()이 undefined를 거부)', () => {
    expect(resolvePreset('아무팀', '테니스')).toBe('표준테니스');
  });
});

describe('isLegacyFormat', () => {
  it('테니스 키만 있는 설정을 레거시로 오판하지 않는다', () => {
    expect(isLegacyFormat({ '테니스': { preset: '표준테니스', overrides: {} } })).toBe(false);
  });

  it('회귀 — 풋살만 있는 설정은 여전히 false', () => {
    expect(isLegacyFormat({ '풋살': { preset: '표준풋살', overrides: {} } })).toBe(false);
  });

  it('회귀 — 진짜 레거시(flat)는 여전히 true', () => {
    expect(isLegacyFormat({ ownGoalPoint: -2, sheetId: 'abc' })).toBe(true);
  });
});

describe('migrateToNested', () => {
  it('테니스 팀의 설정을 버리지 않는다', () => {
    const out = migrateToNested('몽피스', { sheetId: 'abc' }, [{ mode: '테니스' }]);
    expect(out['테니스']).toBeDefined();
    expect(out['테니스'].preset).toBe('표준테니스');
    expect(out.shared.sheetId).toBe('abc');
  });

  it('회귀 — 풋살 팀 마이그레이션 결과가 그대로다', () => {
    const out = migrateToNested('마스터FC', { ownGoalPoint: -2 }, [{ mode: '풋살' }]);
    expect(out['풋살']).toBeDefined();
    expect(out['테니스']).toBeUndefined();
  });

  it('겸직 팀이면 두 종목 다 살아남는다', () => {
    const out = migrateToNested('겸직팀', {}, [{ mode: '풋살' }, { mode: '테니스' }]);
    expect(out['풋살']).toBeDefined();
    expect(out['테니스']).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/config/__tests__/tennisSettings.test.js`
Expected: FAIL — `expected undefined to be defined` (SPORT_DEFAULTS['테니스'])

- [ ] **Step 3: Write minimal implementation**

`src/config/settings.js`에 **6곳**을 고친다. 기존 풋살/축구 항목은 한 글자도 건드리지 않는다.

**(1) `SPORT_DEFAULTS`에 테니스 추가** — `축구:` 블록 뒤, 닫는 `};` 앞:

```js
  테니스: {
    // 랭킹 포인트 산식. rankPoints.js의 DEFAULT_POINT_RULES와 같은 모양.
    // 등급 2단계 이상 차이의 점수가 확정되면 여기(또는 팀 override)만 고치면 된다.
    pointRules: {
      baseWin: 1,
      sameLeagueUpset: 2,
      leagueUpset: 3,
      gradeUpset: 5,
      gradeUpsetPerStep: false,
    },
    rosterSheet: '테니스_회원명부',
  },
```

**(2) `PRESETS`에 테니스 추가** — `축구:` 블록 뒤:

```js
  테니스: {
    "표준테니스": {
      description: "6게임 선취 · 5:5 노애드 타이브레이크 7점",
      values: {},
    },
  },
```

**(3) `PRESET_MAP._default`에 테니스 추가:**

```js
const PRESET_MAP = {
  "마스터FC": { 풋살: "마스터FC풋살" },
  _default: { 풋살: "표준풋살", 축구: "표준축구", 테니스: "표준테니스" },
};
```

**(4) `TENNIS_KEYS` 상수 추가** — `SOCCER_KEYS` 선언 바로 뒤:

```js
const TENNIS_KEYS = [
  "pointRules", "rosterSheet",
];
```

**(5) `isLegacyFormat`에 테니스 조건 추가:**

```js
export function isLegacyFormat(raw) {
  if (!raw || typeof raw !== "object") return false;
  if (Object.keys(raw).length === 0) return false;
  return !raw.shared && !raw["풋살"] && !raw["축구"] && !raw["테니스"];
}
```

**(6a) `migrateToNested`에 테니스 분기 추가** — `if (sports.has("축구")) {...}` 블록 뒤, `return out;` 앞:

```js
  if (sports.has("테니스")) {
    const preset = resolvePreset(team, "테니스");
    const presetValues = PRESETS.테니스[preset]?.values || {};
    out["테니스"] = {
      preset,
      overrides: _sparseOverrides(legacy, TENNIS_KEYS, presetValues),
    };
  }
```

**(6b) `loadSettingsFromFirebase`의 신규팀 블록에도 테니스 분기 추가** — `if (sports.has("축구")) {...}` 블록 뒤:

```js
    if (sports.has("테니스")) {
      fresh["테니스"] = { preset: resolvePreset(team, "테니스"), overrides: {} };
    }
```

- [ ] **Step 4: Run tests to verify they pass — 신규 + 기존 회귀 둘 다**

Run: `npx vitest run src/config`
Expected: PASS. `tennisSettings.test.js` 9개 통과 + **기존 `settings.test.js`가 전부 그대로 통과**해야 한다. 하나라도 깨지면 풋살/축구 회귀이므로 즉시 되돌린다.

- [ ] **Step 5: 전체 테스트로 회귀 재확인**

Run: `npm test`
Expected: PASS — 기존 테스트 전부 그대로.

- [ ] **Step 6: Commit**

```bash
git add src/config/settings.js src/config/__tests__/tennisSettings.test.js
git commit -m "feat(tennis): settings.js 테니스 6곳 추가

SPORT_DEFAULTS/PRESETS/PRESET_MAP._default/TENNIS_KEYS/isLegacyFormat/
migrateToNested+loadSettingsFromFirebase 신규팀 블록.
PRESET_MAP 누락 시 resolvePreset이 undefined를 반환해 Firebase set()이 거부되고,
migrateToNested 누락 시 테니스 설정이 마이그레이션에서 소멸한다."
```

---

## Task 7: 시트 행 빌더

마감된 경기 상태를 시트 2종의 행으로 변환한다. **미완료 판(winner가 null)은 버린다** — 승자 없는 판이 로그에 들어가면 승률이 오염된다.

리그 성립 판정: 단식은 양쪽 다 회원, 복식은 4명 중 회원 3명 이상. 아니면 `미반영`.

**Files:**
- Create: `src/utils/tennis/tennisRowBuilders.js`
- Test: `src/utils/tennis/__tests__/tennisRowBuilders.test.js`

**Interfaces:**
- Consumes: `TENNIS_SPORT`/`COMPETITION_*` (Task 1), `summarizeCourt` (Task 2)
- Produces:
  - `determineCompetition(format, sideA, sideB, memberSet): '길로틴'|'투몽'|'미반영'`
  - `buildTennisMatchRows({ team, state, inputTime, memberSet }): object[]`
  - `buildTennisPlayerGameRows({ team, state, inputTime, memberSet, gradeByPlayer }): object[]`

`state`는 `{ gameId, gameDate, season, rounds }` 형태(Task 3의 정규화를 통과한 것). `memberSet`은 `Set<string>` 회원 이름, `gradeByPlayer`는 `Record<name, grade>`.

- [ ] **Step 1: Write the failing test**

`src/utils/tennis/__tests__/tennisRowBuilders.test.js`:

```js
import { describe, it, expect } from 'vitest';
import {
  determineCompetition, buildTennisMatchRows, buildTennisPlayerGameRows,
} from '../tennisRowBuilders';
import { TENNIS_MATCH_COLUMNS, TENNIS_PLAYER_GAME_COLUMNS } from '../tennisSchema';

const members = new Set(['성언', '다빈', '원희', '철우']);
const grades = { 성언: '은배', 다빈: '동배', 원희: '은배', 철우: '은배' };

const doneSet = (a, b, tbA = 0, tbB = 0) => ({ a, b, tbA, tbB, done: true });

const state = {
  gameId: 'g_1', gameDate: '2026-08-06', season: 2026,
  rounds: [{
    roundIdx: 1,
    courts: [
      { courtId: 1, format: '복식', bestOf: 1, status: 'done',
        sideA: ['성언', '다빈'], sideB: ['원희', '민환'],
        sets: [doneSet(6, 1)],
        stats: { 성언: { aces: 2, df: 1 }, 다빈: { aces: 0, df: 0 }, 원희: { aces: 1, df: 3 } } },
      { courtId: 2, format: '단식', bestOf: 1, status: 'playing',   // 미완료 — 버려야 함
        sideA: ['철우'], sideB: ['원희'], sets: [{ a: 3, b: 2, tbA: 0, tbB: 0, done: false }], stats: {} },
    ],
  }],
};

describe('determineCompetition', () => {
  it('단식은 양쪽 다 회원이어야 길로틴', () => {
    expect(determineCompetition('단식', ['성언'], ['철우'], members)).toBe('길로틴');
    expect(determineCompetition('단식', ['성언'], ['민환'], members)).toBe('미반영');
  });

  it('복식은 4명 중 회원 3명 이상이면 투몽', () => {
    expect(determineCompetition('복식', ['성언', '다빈'], ['원희', '민환'], members)).toBe('투몽');
    expect(determineCompetition('복식', ['성언', '다빈'], ['용병1', '용병2'], members)).toBe('미반영');
  });
});

describe('buildTennisMatchRows', () => {
  const rows = buildTennisMatchRows({ team: '몽피스', state, inputTime: '2026-08-06 20:00:00', memberSet: members });

  it('미완료 판은 버린다 — 1행만 나온다', () => {
    expect(rows).toHaveLength(1);
  });

  it('모든 컬럼 키가 스키마와 정확히 일치한다', () => {
    expect(Object.keys(rows[0]).sort()).toEqual([...TENNIS_MATCH_COLUMNS].sort());
  });

  it('식별자와 집계', () => {
    expect(rows[0]).toMatchObject({
      team: '몽피스', sport: '테니스', season: 2026, date: '2026-08-06',
      game_id: 'g_1', round_idx: 1, court_id: 1, match_idx: 1, match_id: 'R1_C1',
      format: '복식', best_of: 1,
      sets_a: 1, sets_b: 0, games_a: 6, games_b: 1, winner: 'A',
      league: '투몽',
    });
  });

  it('side_a_json은 항상 왼쪽 팀', () => {
    expect(JSON.parse(rows[0].side_a_json)).toEqual(['성언', '다빈']);
    expect(JSON.parse(rows[0].side_b_json)).toEqual(['원희', '민환']);
  });

  it('sets_json에 타이브레이크 점수가 담긴다', () => {
    const tb = buildTennisMatchRows({
      team: '몽피스', memberSet: members, inputTime: 't',
      state: { ...state, rounds: [{ roundIdx: 1, courts: [{
        courtId: 1, format: '단식', bestOf: 1, status: 'done',
        sideA: ['성언'], sideB: ['철우'], sets: [doneSet(6, 5, 7, 4)], stats: {},
      }] }] },
    });
    expect(JSON.parse(tb[0].sets_json)).toEqual([{ a: 6, b: 5, tbA: 7, tbB: 4 }]);
  });
});

describe('buildTennisPlayerGameRows', () => {
  const rows = buildTennisPlayerGameRows({
    team: '몽피스', state, inputTime: '2026-08-06 20:00:00',
    memberSet: members, gradeByPlayer: grades,
  });

  it('완료된 판의 선수 수만큼 나온다 (복식 4명)', () => {
    expect(rows).toHaveLength(4);
  });

  it('모든 컬럼 키가 스키마와 정확히 일치한다', () => {
    expect(Object.keys(rows[0]).sort()).toEqual([...TENNIS_PLAYER_GAME_COLUMNS].sort());
  });

  it('승자 쪽 행 — 파트너·상대·집계', () => {
    const r = rows.find(x => x.player === '성언');
    expect(r).toMatchObject({
      side: 'A', result: '승', partner: '다빈',
      sets_won: 1, sets_lost: 0, games_won: 6, games_lost: 1,
      tb_played: 0, tb_won: 0,
      aces: 2, double_faults: 1,
      bagels_taken: 0, bagels_given: 0,
      grade_at_date: '은배', is_guest: false, league: '투몽',
    });
    expect(JSON.parse(r.opponents_json)).toEqual(['원희', '민환']);
  });

  it('패자 쪽은 득실이 뒤집힌다', () => {
    const r = rows.find(x => x.player === '원희');
    expect(r).toMatchObject({ side: 'B', result: '패', games_won: 1, games_lost: 6, partner: '민환' });
  });

  it('용병은 is_guest=true, grade_at_date는 빈 문자열', () => {
    const r = rows.find(x => x.player === '민환');
    expect(r.is_guest).toBe(true);
    expect(r.grade_at_date).toBe('');
  });

  it('에이스/DF는 선수별로 나뉜다 — 팀 합계가 아니다', () => {
    expect(rows.find(x => x.player === '성언').aces).toBe(2);
    expect(rows.find(x => x.player === '다빈').aces).toBe(0);
    expect(rows.find(x => x.player === '원희').double_faults).toBe(3);
    expect(rows.find(x => x.player === '민환').double_faults).toBe(0); // stats 없는 선수는 0
  });

  it('단식은 partner가 빈 문자열', () => {
    const single = buildTennisPlayerGameRows({
      team: '몽피스', memberSet: members, gradeByPlayer: grades, inputTime: 't',
      state: { ...state, rounds: [{ roundIdx: 1, courts: [{
        courtId: 1, format: '단식', bestOf: 1, status: 'done',
        sideA: ['성언'], sideB: ['철우'], sets: [doneSet(6, 0)], stats: {},
      }] }] },
    });
    expect(single).toHaveLength(2);
    expect(single[0].partner).toBe('');
  });

  it('베이글 — 6:0 진 쪽이 taken, 이긴 쪽이 given', () => {
    const bagel = buildTennisPlayerGameRows({
      team: '몽피스', memberSet: members, gradeByPlayer: grades, inputTime: 't',
      state: { ...state, rounds: [{ roundIdx: 1, courts: [{
        courtId: 1, format: '단식', bestOf: 1, status: 'done',
        sideA: ['성언'], sideB: ['철우'], sets: [doneSet(6, 0)], stats: {},
      }] }] },
    });
    expect(bagel.find(x => x.player === '성언')).toMatchObject({ bagels_given: 1, bagels_taken: 0 });
    expect(bagel.find(x => x.player === '철우')).toMatchObject({ bagels_given: 0, bagels_taken: 1 });
  });

  it('타이브레이크 — 이긴 쪽만 tb_won, 양쪽 다 tb_played', () => {
    const tb = buildTennisPlayerGameRows({
      team: '몽피스', memberSet: members, gradeByPlayer: grades, inputTime: 't',
      state: { ...state, rounds: [{ roundIdx: 1, courts: [{
        courtId: 1, format: '단식', bestOf: 1, status: 'done',
        sideA: ['성언'], sideB: ['철우'], sets: [doneSet(6, 5, 7, 4)], stats: {},
      }] }] },
    });
    expect(tb.find(x => x.player === '성언')).toMatchObject({ tb_played: 1, tb_won: 1 });
    expect(tb.find(x => x.player === '철우')).toMatchObject({ tb_played: 1, tb_won: 0 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/tennis/__tests__/tennisRowBuilders.test.js`
Expected: FAIL — `Failed to resolve import "../tennisRowBuilders"`

- [ ] **Step 3: Write minimal implementation**

`src/utils/tennis/tennisRowBuilders.js`:

```js
// 마감된 테니스 경기 상태 → 시트 2종 행.
// ★ 승자가 정해지지 않은 판(winner === null)은 버린다. 로그에 넣으면 승률이 오염된다.
// match_id 포맷은 R{round}_C{court} — matchRowBuilder.js의 parseMatchIdFutsal과 같은 형식이지만
// 격리를 위해 그 파일을 import하지 않는다.

import { TENNIS_SPORT, COMPETITION_SINGLES, COMPETITION_DOUBLES, COMPETITION_NONE } from './tennisSchema';
import { summarizeCourt } from './tennisScoring';

export function determineCompetition(format, sideA, sideB, memberSet) {
  const all = [...(sideA || []), ...(sideB || [])];
  const memberCount = all.filter(n => memberSet && memberSet.has(n)).length;
  if (format === '단식') {
    return memberCount === all.length && all.length === 2 ? COMPETITION_SINGLES : COMPETITION_NONE;
  }
  if (format === '복식') {
    return all.length === 4 && memberCount >= 3 ? COMPETITION_DOUBLES : COMPETITION_NONE;
  }
  return COMPETITION_NONE;
}

// 완료된 코트만 (roundIdx, court, summary) 형태로 평탄화. match_idx는 그날 일련번호.
function finishedCourts(state) {
  const out = [];
  for (const round of (state.rounds || [])) {
    for (const court of (round.courts || [])) {
      const summary = summarizeCourt(court);
      if (!summary.winner) continue;
      out.push({ roundIdx: round.roundIdx, court, summary });
    }
  }
  return out.map((x, i) => ({ ...x, matchIdx: i + 1 }));
}

function serializeSets(sets) {
  return JSON.stringify((sets || []).map(s => {
    const o = { a: s.a || 0, b: s.b || 0 };
    if ((s.tbA || 0) > 0 || (s.tbB || 0) > 0) { o.tbA = s.tbA || 0; o.tbB = s.tbB || 0; }
    return o;
  }));
}

export function buildTennisMatchRows({ team, state, inputTime, memberSet }) {
  if (!state) return [];
  return finishedCourts(state).map(({ roundIdx, court, summary, matchIdx }) => ({
    team,
    sport: TENNIS_SPORT,
    season: state.season,
    date: state.gameDate || '',
    game_id: state.gameId || '',
    round_idx: roundIdx,
    court_id: court.courtId,
    match_idx: matchIdx,
    match_id: `R${roundIdx}_C${court.courtId}`,
    format: court.format,
    best_of: court.bestOf,
    side_a_json: JSON.stringify(court.sideA || []),
    side_b_json: JSON.stringify(court.sideB || []),
    sets_json: serializeSets(court.sets),
    sets_a: summary.setsA,
    sets_b: summary.setsB,
    games_a: summary.gamesA,
    games_b: summary.gamesB,
    winner: summary.winner,
    league: determineCompetition(court.format, court.sideA, court.sideB, memberSet),
    input_time: inputTime || '',
  }));
}

export function buildTennisPlayerGameRows({ team, state, inputTime, memberSet, gradeByPlayer }) {
  if (!state) return [];
  const rows = [];

  for (const { roundIdx, court, summary, matchIdx } of finishedCourts(state)) {
    const league = determineCompetition(court.format, court.sideA, court.sideB, memberSet);
    const matchId = `R${roundIdx}_C${court.courtId}`;

    for (const side of ['A', 'B']) {
      const mine = side === 'A' ? (court.sideA || []) : (court.sideB || []);
      const theirs = side === 'A' ? (court.sideB || []) : (court.sideA || []);

      for (const player of mine) {
        const isGuest = !(memberSet && memberSet.has(player));
        const st = (court.stats && court.stats[player]) || {};
        rows.push({
          team,
          sport: TENNIS_SPORT,
          season: state.season,
          date: state.gameDate || '',
          game_id: state.gameId || '',
          match_id: matchId,
          round_idx: roundIdx,
          court_id: court.courtId,
          player,
          is_guest: isGuest,
          side,
          format: court.format,
          best_of: court.bestOf,
          partner: mine.filter(n => n !== player)[0] || '',
          opponents_json: JSON.stringify(theirs),
          result: summary.winner === side ? '승' : '패',
          sets_won: side === 'A' ? summary.setsA : summary.setsB,
          sets_lost: side === 'A' ? summary.setsB : summary.setsA,
          games_won: side === 'A' ? summary.gamesA : summary.gamesB,
          games_lost: side === 'A' ? summary.gamesB : summary.gamesA,
          tb_played: summary.tbPlayed,
          tb_won: side === 'A' ? summary.tbWonA : summary.tbWonB,
          aces: st.aces || 0,
          double_faults: st.df || 0,
          bagels_taken: side === 'A' ? summary.bagelsGivenB : summary.bagelsGivenA,
          bagels_given: side === 'A' ? summary.bagelsGivenA : summary.bagelsGivenB,
          // 용병은 명부에 없어 등급이 없다. 빈 문자열로 두고 rankPoints가 건너뛰게 한다.
          grade_at_date: isGuest ? '' : ((gradeByPlayer && gradeByPlayer[player]) || ''),
          league,
          input_time: inputTime || '',
        });
      }
    }
  }
  return rows;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/tennis/__tests__/tennisRowBuilders.test.js`
Expected: PASS (3 suites, 15 tests)

- [ ] **Step 5: Commit**

```bash
git add src/utils/tennis/tennisRowBuilders.js src/utils/tennis/__tests__/tennisRowBuilders.test.js
git commit -m "feat(tennis): 시트 행 빌더 (미완료 판 제외, 리그 성립 판정, 선수별 에이스/DF)"
```

---

## Task 8: tennisSync — Apps Script 통신

**이 태스크의 핵심은 계약 재현이다.** `appSync.js`를 열지 않는 대신, 그 파일이 지키던 세 가지를 반드시 갖춰야 한다. 하나라도 빠지면 조용히 망가진다.

| 계약 | 빠뜨리면 |
|---|---|
| 모든 요청에 `authToken`과 `team` | `Code.js`의 `_checkTeamAccess`가 `if (!requestTeam) return true;`라 **team이 비면 무조건 통과** — 다른 팀이 테니스 시트에 쓸 수 있다 |
| `success === false`를 `throw`로 변환 | Apps Script는 서버측 실패도 `HTTP 200 + {success:false}`로 답한다. throw가 없으면 `Promise.allSettled`가 실패를 성공으로 보고 **Task 12의 "하나라도 실패하면 미확정 유지"가 무너진다** |
| 페이로드에서 이름의 `★` 제거 | 풋살 100포인트 이상 회원의 이름이 `★`째로 시트에 쌓여 이름 매칭이 깨진다 |

`stripNameDecorations`는 `appSync.js:11`에 있다. 추출하면 `appSync.js`를 수정해야 하므로 **복사하되 원본 위치를 주석에 남긴다.**

**Files:**
- Create: `src/services/tennisSync.js`
- Test: `src/services/__tests__/tennisSync.test.js`

**Interfaces:**
- Consumes: `AuthUtil` (`src/services/authUtil.js`, 기존 파일 — 읽기만 하고 수정하지 않는다)
- Produces:
  - `stripNameDecorations(value): any`
  - `TennisSync.getRoster(): Promise<Array<{name, nickname, grade, status, seasonStartRank}>>`
  - `TennisSync.getPlayerGames(dateFrom?, dateTo?): Promise<object[]>`
  - `TennisSync.writeMatches(rows): Promise<object>`
  - `TennisSync.writePlayerGames(rows): Promise<object>`

- [ ] **Step 1: Write the failing test**

`src/services/__tests__/tennisSync.test.js`:

```js
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import TennisSync, { stripNameDecorations } from '../tennisSync';

function mockFetchOnce(payload, ok = true, status = 200) {
  return vi.fn().mockResolvedValue({
    ok, status, json: async () => payload,
  });
}
function lastBody(fetchMock) {
  return JSON.parse(fetchMock.mock.calls[0][1].body);
}

beforeEach(() => {
  localStorage.setItem('masterfc_auth', JSON.stringify({
    name: '서라현', phone4: '1234', team: '몽피스', mode: '테니스', role: '관리자',
  }));
  import.meta.env.VITE_APPS_SCRIPT_URL = 'https://example.test/exec';
});
afterEach(() => { localStorage.clear(); vi.restoreAllMocks(); });

describe('stripNameDecorations', () => {
  it('문자열의 ★류 표식을 지운다', () => {
    expect(stripNameDecorations('박성언★')).toBe('박성언');
  });
  it('배열/중첩 객체까지 재귀 적용', () => {
    expect(stripNameDecorations({ rows: [{ player: '김원희⭐', partner: '기다빈' }] }))
      .toEqual({ rows: [{ player: '김원희', partner: '기다빈' }] });
  });
  it('숫자/불리언은 그대로', () => {
    expect(stripNameDecorations({ a: 6, ok: true })).toEqual({ a: 6, ok: true });
  });
});

describe('요청 계약', () => {
  it('쓰기 요청에 authToken과 team이 실린다', async () => {
    const f = mockFetchOnce({ success: true, count: 1 });
    global.fetch = f;
    await TennisSync.writeMatches([{ player: 'x' }]);
    const body = lastBody(f);
    expect(body.team).toBe('몽피스');
    expect(body.authToken).toBeTruthy();
    expect(body.action).toBe('writeTennisMatches');
  });

  it('읽기 요청에도 authToken과 team이 실린다', async () => {
    const f = mockFetchOnce({ success: true, players: [] });
    global.fetch = f;
    await TennisSync.getRoster();
    const body = lastBody(f);
    expect(body.team).toBe('몽피스');
    expect(body.authToken).toBeTruthy();
  });

  it('페이로드의 ★가 제거된 채 전송된다', async () => {
    const f = mockFetchOnce({ success: true });
    global.fetch = f;
    await TennisSync.writePlayerGames([{ player: '박성언★', partner: '기다빈' }]);
    expect(lastBody(f).data.rows[0].player).toBe('박성언');
  });
});

describe('실패 변환', () => {
  it('HTTP 200 + success:false 를 throw로 바꾼다', async () => {
    global.fetch = mockFetchOnce({ success: false, error: '잠금 획득 실패' });
    await expect(TennisSync.writeMatches([{}])).rejects.toThrow(/잠금 획득 실패/);
  });

  it('비200도 throw', async () => {
    global.fetch = mockFetchOnce({}, false, 500);
    await expect(TennisSync.writeMatches([{}])).rejects.toThrow(/HTTP 500/);
  });

  it('성공이면 결과를 그대로 돌려준다', async () => {
    global.fetch = mockFetchOnce({ success: true, count: 3 });
    await expect(TennisSync.writeMatches([{}])).resolves.toMatchObject({ count: 3 });
  });

  it('읽기 실패는 throw하지 않고 빈 배열 (화면이 죽지 않게)', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('network'));
    await expect(TennisSync.getRoster()).resolves.toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/services/__tests__/tennisSync.test.js`
Expected: FAIL — `Failed to resolve import "../tennisSync"`

- [ ] **Step 3: Write minimal implementation**

`src/services/tennisSync.js`:

```js
// 테니스 전용 Apps Script 통신. appSync.js를 열지 않기 위해 분리했지만,
// 그 파일이 지키던 계약 세 가지는 그대로 재현해야 한다:
//   1) 모든 요청에 authToken + team  — Code.js의 _checkTeamAccess는 team이 비면 무조건 통과한다
//   2) success:false → throw          — Apps Script는 서버측 실패도 HTTP 200으로 답한다
//   3) 이름의 ★ 표식 제거              — 시트 이름 매칭이 깨진다
// stripNameDecorations는 src/services/appSync.js:11 의 복사본이다. 한쪽을 고치면 다른 쪽도 고칠 것.

import AuthUtil from './authUtil';

const APPS_SCRIPT_URL = import.meta.env.VITE_APPS_SCRIPT_URL || "";

const NAME_DECORATION_RE = /[★☆✩✪✫✬✭✮✯✰⭐🌟]/g;
export function stripNameDecorations(value) {
  if (typeof value === 'string') return value.replace(NAME_DECORATION_RE, '');
  if (Array.isArray(value)) return value.map(stripNameDecorations);
  if (value && typeof value === 'object') {
    const out = {};
    for (const k of Object.keys(value)) out[k] = stripNameDecorations(value[k]);
    return out;
  }
  return value;
}

function _auth() {
  const a = AuthUtil.getStored();
  return { team: a?.team || "", authToken: AuthUtil.getToken ? AuthUtil.getToken() : (a?.token || "") };
}

async function _post(payload) {
  const { team, authToken } = _auth();
  const body = stripNameDecorations({ ...payload, team, authToken });
  const resp = await fetch(APPS_SCRIPT_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: JSON.stringify(body),
  });
  if (!resp.ok) throw new Error(`테니스 시트 요청 실패: HTTP ${resp.status}`);
  const result = await resp.json();
  if (!result || result.success === false) {
    throw new Error(`테니스 시트 요청 실패: ${result?.error || "서버 응답 오류"}`);
  }
  return result;
}

// 읽기는 화면을 죽이지 않도록 빈 값으로 폴백한다. 쓰기는 반드시 throw한다.
async function _safeRead(payload, pick, fallback) {
  try {
    const r = await _post(payload);
    return r[pick] ?? fallback;
  } catch (e) {
    console.warn("테니스 조회 실패:", e.message);
    return fallback;
  }
}

const TennisSync = {
  enabled() { return !!APPS_SCRIPT_URL; },

  getRoster() {
    return _safeRead({ action: "getTennisRoster" }, "players", []);
  },

  getPlayerGames(dateFrom = "", dateTo = "") {
    return _safeRead({ action: "getTennisPlayerGames", dateFrom, dateTo }, "rows", []);
  },

  getMatches(dateFrom = "", dateTo = "") {
    return _safeRead({ action: "getTennisMatches", dateFrom, dateTo }, "rows", []);
  },

  writeMatches(rows) {
    return _post({ action: "writeTennisMatches", data: { rows: rows || [] } });
  },

  writePlayerGames(rows) {
    return _post({ action: "writeTennisPlayerGames", data: { rows: rows || [] } });
  },
};

export default TennisSync;
```

- [ ] **Step 4: `AuthUtil`의 실제 토큰 함수명을 확인해 맞춘다**

Run: `grep -n "getToken\|token\|getStored" src/services/authUtil.js`

`_auth()`가 쓰는 함수가 실제 이름과 다르면 **`authUtil.js`를 고치지 말고 `tennisSync.js` 쪽을 맞춘다.** `appSync.js`의 `_getAuthToken()` 구현을 참고하되 그 파일은 읽기만 한다.

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/services/__tests__/tennisSync.test.js`
Expected: PASS (3 suites, 10 tests)

- [ ] **Step 6: Commit**

```bash
git add src/services/tennisSync.js src/services/__tests__/tennisSync.test.js
git commit -m "feat(tennis): tennisSync — authToken/team, success:false throw, ★ 제거 계약 재현"
```

---

## Task 9: Apps Script — 시트 3종과 액션

Apps Script는 이 저장소에 테스트 하네스가 없다. **검증은 Apps Script 에디터에서 직접 실행**하고, 클라이언트 연동은 Task 12의 브라우저 스모크에서 확인한다.

배포는 **"새 배포"가 아니라 "배포 관리 → 편집 → 새 버전"**으로 해야 URL이 고정된다.

**Files:**
- Modify: `apps-script/Code.js`

**Interfaces:**
- Consumes: Task 1의 컬럼 순서 (수동으로 1:1 복제)
- Produces: 액션 `getTennisRoster`, `getTennisMatches`, `getTennisPlayerGames`, `writeTennisMatches`, `writeTennisPlayerGames`

- [ ] **Step 1: 상단 CHANGELOG에 항목 추가**

`apps-script/Code.js` 4행 `// CHANGELOG` 바로 아래에 삽입한다:

```js
// 2026-08-06: 테니스 종목 추가 — 시트 3종(테니스_회원명부/로그_테니스매치/로그_테니스선수경기)과
//             액션 5종(getTennisRoster, getTennisMatches, getTennisPlayerGames,
//             writeTennisMatches, writeTennisPlayerGames) 신설. 기존 풋살/축구 시트·액션 무수정.
//             회원명부 조회는 생년월일을 클라이언트로 내리지 않는다(2차 연령대 분석용으로만 시트에 보관).
```

- [ ] **Step 2: 시트 상수와 헤더 추가**

기존 `RAW_PLAYER_GAMES_HEADERS` 선언부 근처(다른 RAW_* 상수 옆)에 추가한다. **순서는 `src/utils/tennis/tennisSchema.js`와 반드시 1:1이다.**

```js
// ── 테니스 ─────────────────────────────────────────────
// ★ 아래 두 헤더 배열은 src/utils/tennis/tennisSchema.js 의
//   TENNIS_MATCH_COLUMNS / TENNIS_PLAYER_GAME_COLUMNS 와 순서까지 같아야 한다.
var TENNIS_ROSTER_SHEET = "테니스_회원명부";
var TENNIS_MATCHES_SHEET = "로그_테니스매치";
var TENNIS_PLAYER_GAMES_SHEET = "로그_테니스선수경기";

var TENNIS_ROSTER_HEADERS = [
  "팀이름", "이름", "닉네임", "생년월일", "등급", "상태", "시즌시작순위", "가입일", "비고"
];

var TENNIS_MATCH_HEADERS = [
  "team", "sport", "season", "date", "game_id",
  "round_idx", "court_id", "match_idx", "match_id",
  "format", "best_of",
  "side_a_json", "side_b_json",
  "sets_json", "sets_a", "sets_b", "games_a", "games_b", "winner",
  "league", "input_time"
];

var TENNIS_PLAYER_GAME_HEADERS = [
  "team", "sport", "season", "date", "game_id", "match_id", "round_idx", "court_id",
  "player", "is_guest", "side", "format", "best_of",
  "partner", "opponents_json", "result",
  "sets_won", "sets_lost", "games_won", "games_lost",
  "tb_played", "tb_won", "aces", "double_faults",
  "bagels_taken", "bagels_given",
  "grade_at_date", "league", "input_time"
];
```

- [ ] **Step 3: 시트 생성/읽기/쓰기 헬퍼 추가**

파일 끝부분(기존 `_writeRawPlayerGames` 계열 함수들 뒤)에 추가한다:

```js
function _ensureTennisSheets() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var defs = [
    [TENNIS_ROSTER_SHEET, TENNIS_ROSTER_HEADERS],
    [TENNIS_MATCHES_SHEET, TENNIS_MATCH_HEADERS],
    [TENNIS_PLAYER_GAMES_SHEET, TENNIS_PLAYER_GAME_HEADERS]
  ];
  for (var i = 0; i < defs.length; i++) {
    var name = defs[i][0], headers = defs[i][1];
    var sh = ss.getSheetByName(name);
    if (!sh) {
      sh = ss.insertSheet(name);
      sh.getRange(1, 1, 1, headers.length).setValues([headers]);
      sh.getRange(1, 1, 1, headers.length).setFontWeight("bold");
      sh.setFrozenRows(1);
    }
  }
}

function _tennisRowToArray(r, headers) {
  var out = [];
  for (var i = 0; i < headers.length; i++) {
    var v = r[headers[i]];
    out.push(v === undefined || v === null ? "" : v);
  }
  return out;
}

function _writeTennisRows(sheetName, headers, data) {
  if (!data || !data.rows) return { success: false, error: "rows 누락" };
  _ensureTennisSheets();
  var rows = data.rows;
  if (rows.length === 0) return { success: true, count: 0 };

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) return { success: false, error: "잠금 획득 실패" };
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
    var toInsert = [];
    for (var i = 0; i < rows.length; i++) toInsert.push(_tennisRowToArray(rows[i], headers));
    var lastRow = sheet.getLastRow();
    sheet.getRange(lastRow + 1, 1, toInsert.length, headers.length).setValues(toInsert);
    return { success: true, count: toInsert.length };
  } finally {
    lock.releaseLock();
  }
}

function _writeTennisMatches(data) {
  return _writeTennisRows(TENNIS_MATCHES_SHEET, TENNIS_MATCH_HEADERS, data);
}

function _writeTennisPlayerGames(data) {
  return _writeTennisRows(TENNIS_PLAYER_GAMES_SHEET, TENNIS_PLAYER_GAME_HEADERS, data);
}

function _readTennisRows(sheetName, headers, team, dateFrom, dateTo) {
  _ensureTennisSheets();
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return { success: true, rows: [] };
  var values = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
  var dateIdx = headers.indexOf("date");
  var teamIdx = headers.indexOf("team");
  var out = [];
  for (var i = 0; i < values.length; i++) {
    var v = values[i];
    if (team && String(v[teamIdx]).trim() !== String(team).trim()) continue;
    var d = _toDateStr(v[dateIdx]);
    if (dateFrom && d < dateFrom) continue;
    if (dateTo && d > dateTo) continue;
    var obj = {};
    for (var c = 0; c < headers.length; c++) obj[headers[c]] = v[c];
    obj.date = d;
    out.push(obj);
  }
  return { success: true, rows: out };
}

// 생년월일은 클라이언트로 내리지 않는다. 2차 연령대 분석 때 별도 경로를 만든다.
function _getTennisRoster(team) {
  _ensureTennisSheets();
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(TENNIS_ROSTER_SHEET);
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return { success: true, players: [] };
  var values = sheet.getRange(2, 1, lastRow - 1, TENNIS_ROSTER_HEADERS.length).getValues();
  var players = [];
  for (var i = 0; i < values.length; i++) {
    var v = values[i];
    if (team && String(v[0]).trim() !== String(team).trim()) continue;
    var name = String(v[1] || "").trim();
    if (!name) continue;
    var status = String(v[5] || "활동").trim();
    if (status === "탈퇴") continue;
    players.push({
      name: name,
      nickname: String(v[2] || "").trim(),
      grade: String(v[4] || "").trim(),
      status: status,
      seasonStartRank: v[6] === "" || v[6] === null ? null : Number(v[6])
    });
  }
  return { success: true, players: players };
}
```

- [ ] **Step 4: `doPost` 액션 분기 추가**

기존 `else if (action === "getRawPlayerGames") {` 블록 **앞**에 삽입한다. 기존 분기는 한 줄도 고치지 않는다:

```js
    } else if (action === "getTennisRoster") {
      return _jsonResponse(_getTennisRoster(requestTeam));
    } else if (action === "getTennisMatches") {
      return _jsonResponse(_readTennisRows(TENNIS_MATCHES_SHEET, TENNIS_MATCH_HEADERS, requestTeam, body.dateFrom, body.dateTo));
    } else if (action === "getTennisPlayerGames") {
      return _jsonResponse(_readTennisRows(TENNIS_PLAYER_GAMES_SHEET, TENNIS_PLAYER_GAME_HEADERS, requestTeam, body.dateFrom, body.dateTo));
    } else if (action === "writeTennisMatches") {
      return _jsonResponse(_writeTennisMatches(body.data));
    } else if (action === "writeTennisPlayerGames") {
      return _jsonResponse(_writeTennisPlayerGames(body.data));
```

- [ ] **Step 5: Apps Script 에디터에서 시트 생성 검증**

유저에게 다음을 요청한다 (Apps Script 반영은 유저가 수동으로 한다):

1. `apps-script/Code.js` 내용을 Apps Script 에디터에 붙여넣기
2. 에디터에서 `_ensureTennisSheets` 를 직접 실행
3. 스프레드시트에 시트 3종이 생기고 헤더가 각각 9 / 21 / 29칸인지 눈으로 확인
4. **배포 관리 → 편집 → 새 버전**으로 배포 (새 배포 금지 — URL이 바뀐다)
5. `테니스_회원명부`에 회원 16명 + 등급을 채우고, `회원인증` 시트에 `팀이름=아침의 평화 테니스 클럽 / 모드=테니스 / 이름 / 휴대폰뒷자리 / 역할` 행 추가

Expected: 시트 3종 생성, 기존 풋살/축구 시트 무변화

- [ ] **Step 6: Commit**

```bash
git add apps-script/Code.js
git commit -m "feat(tennis): Apps Script 시트 3종 + 액션 5종

기존 액션 분기는 무수정. 회원명부 조회는 생년월일 미전송.
헤더 배열은 tennisSchema.js와 순서까지 1:1."
```

---

## Task 10: 경기 상태 리듀서

리듀서는 이 기능의 심장이다. 스펙에서 발견된 두 함정을 테스트로 먼저 잠근다.

1. **5:5 이후 ▲는 게임이 아니라 타이브레이크 포인트를 올려야 한다.** 안 그러면 `tbA`/`tbB`가 영영 비어 2차 타이브레이크 승률이 `0/0`이 된다.
2. **세트 종료를 되돌릴 때 그 세트가 판을 끝냈다면 `Court.status`도 함께 되돌려야 한다.** 안 그러면 카드가 `done`에 갇히는데, `done` 카드에는 `[설정 수정]`이 없어 빠져나갈 길이 없다.

**Files:**
- Create: `src/hooks/useTennisReducer.js`
- Test: `src/hooks/__tests__/useTennisReducer.test.js`

**Interfaces:**
- Consumes: `emptySet`/`incrementGame`/`incrementTiebreakPoint`/`isTiebreakActive`/`isSetComplete`/`matchWinner` (Task 2), `normalizeTennisMatch` (Task 3)
- Produces:
  - `tennisInitialState`
  - `tennisReducer(state, action): state`
  - `findCourt(state, roundIdx, courtId): Court | null`
  - `useTennisReducer()` — `[state, dispatch]`

**액션 목록** (모든 코트 액션은 `{ roundIdx, courtId }`를 포함한다):

| 액션 | payload |
|---|---|
| `INIT_STATE` | `{ state }` — RTDB 복원 |
| `SET_GAME_META` | `{ gameDate, season, gameId, team }` |
| `SET_ATTENDEES` | `{ attendees }` |
| `ADD_ATTENDEE` | `{ name, isGuest }` |
| `ADD_ROUND` | — (코트 1개 동반 생성) |
| `SET_VIEWING_ROUND` | `{ roundIdx }` |
| `ADD_COURT` | `{ roundIdx }` |
| `DELETE_COURT` | `{ roundIdx, courtId }` — `status==='ready'`일 때만 |
| `SET_COURT_FORMAT` | `{ roundIdx, courtId, format }` |
| `SET_COURT_BEST_OF` | `{ roundIdx, courtId, bestOf }` |
| `ASSIGN_PLAYER` | `{ roundIdx, courtId, name }` — 열린 슬롯을 왼쪽→오른쪽 순으로 채움 |
| `REMOVE_PLAYER` | `{ roundIdx, courtId, name }` |
| `SWAP_SIDES` | `{ roundIdx, courtId }` |
| `START_COURT` | `{ roundIdx, courtId }` |
| `INCREMENT_GAME` | `{ roundIdx, courtId, side }` |
| `INCREMENT_TIEBREAK_POINT` | `{ roundIdx, courtId, side }` |
| `INCREMENT_STAT` | `{ roundIdx, courtId, player, stat: 'aces'\|'df' }` |
| `END_SET` | `{ roundIdx, courtId }` |
| `UNDO` | `{ roundIdx, courtId }` |
| `EDIT_COURT_SETTINGS` | `{ roundIdx, courtId }` — 3→1세트·단복식·선수교체용. 점수 초기화 후 `ready` |
| `EXTEND_TO_THREE_SETS` | `{ roundIdx, courtId }` — 점수 유지 예외 |

- [ ] **Step 1: Write the failing test**

`src/hooks/__tests__/useTennisReducer.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { tennisReducer, tennisInitialState, findCourt } from '../useTennisReducer';

const A = (type, payload = {}) => ({ type, ...payload });
const C = { roundIdx: 1, courtId: 1 };

// 라운드1/코트1이 있고, 참석자가 배정된 진행 중 상태를 만든다.
function playingState({ format = '단식', bestOf = 1, sideA = ['성언'], sideB = ['철우'] } = {}) {
  let s = tennisReducer(tennisInitialState, A('SET_ATTENDEES', { attendees: ['성언', '철우', '다빈', '원희'] }));
  s = tennisReducer(s, A('ADD_ROUND'));
  s = tennisReducer(s, A('SET_COURT_FORMAT', { ...C, format }));
  s = tennisReducer(s, A('SET_COURT_BEST_OF', { ...C, bestOf }));
  for (const n of [...sideA, ...sideB]) s = tennisReducer(s, A('ASSIGN_PLAYER', { ...C, name: n }));
  return tennisReducer(s, A('START_COURT', C));
}
const games = (s) => { const c = findCourt(s, 1, 1); return [c.sets[c.currentSet].a, c.sets[c.currentSet].b]; };

describe('라운드와 코트', () => {
  it('라운드를 추가하면 코트 1개가 함께 생기고 기본값은 단식·1세트', () => {
    const s = tennisReducer(tennisInitialState, A('ADD_ROUND'));
    expect(s.rounds).toHaveLength(1);
    expect(s.rounds[0].courts).toHaveLength(1);
    expect(s.rounds[0].courts[0]).toMatchObject({ format: '단식', bestOf: 1, status: 'ready' });
  });

  it('코트를 상한 없이 추가할 수 있다', () => {
    let s = tennisReducer(tennisInitialState, A('ADD_ROUND'));
    for (let i = 0; i < 4; i++) s = tennisReducer(s, A('ADD_COURT', { roundIdx: 1 }));
    expect(s.rounds[0].courts).toHaveLength(5);
    expect(s.rounds[0].courts.map(c => c.courtId)).toEqual([1, 2, 3, 4, 5]);
  });

  it('코트 삭제는 ready 상태에서만 먹힌다', () => {
    let s = tennisReducer(tennisInitialState, A('ADD_ROUND'));
    s = tennisReducer(s, A('ADD_COURT', { roundIdx: 1 }));
    s = tennisReducer(s, A('DELETE_COURT', { roundIdx: 1, courtId: 2 }));
    expect(s.rounds[0].courts).toHaveLength(1);

    const playing = playingState();
    const after = tennisReducer(playing, A('DELETE_COURT', C));
    expect(findCourt(after, 1, 1)).not.toBeNull();
  });
});

describe('선수 배치', () => {
  it('단식이면 좌우 1칸씩만 열린다 — 세 번째 탭은 무시', () => {
    let s = tennisReducer(tennisInitialState, A('ADD_ROUND'));
    for (const n of ['성언', '철우', '다빈']) s = tennisReducer(s, A('ASSIGN_PLAYER', { ...C, name: n }));
    const c = findCourt(s, 1, 1);
    expect(c.sideA).toEqual(['성언']);
    expect(c.sideB).toEqual(['철우']);
  });

  it('복식이면 왼쪽 2칸을 채우고 오른쪽으로 넘어간다', () => {
    let s = tennisReducer(tennisInitialState, A('ADD_ROUND'));
    s = tennisReducer(s, A('SET_COURT_FORMAT', { ...C, format: '복식' }));
    for (const n of ['성언', '다빈', '원희', '민환']) s = tennisReducer(s, A('ASSIGN_PLAYER', { ...C, name: n }));
    const c = findCourt(s, 1, 1);
    expect(c.sideA).toEqual(['성언', '다빈']);
    expect(c.sideB).toEqual(['원희', '민환']);
  });

  it('복식 → 단식으로 줄이면 넘치는 인원이 빠진다', () => {
    let s = tennisReducer(tennisInitialState, A('ADD_ROUND'));
    s = tennisReducer(s, A('SET_COURT_FORMAT', { ...C, format: '복식' }));
    for (const n of ['성언', '다빈', '원희', '민환']) s = tennisReducer(s, A('ASSIGN_PLAYER', { ...C, name: n }));
    s = tennisReducer(s, A('SET_COURT_FORMAT', { ...C, format: '단식' }));
    const c = findCourt(s, 1, 1);
    expect(c.sideA).toEqual(['성언']);
    expect(c.sideB).toEqual(['원희']);
  });

  it('같은 선수를 두 번 담을 수 없다', () => {
    let s = tennisReducer(tennisInitialState, A('ADD_ROUND'));
    s = tennisReducer(s, A('ASSIGN_PLAYER', { ...C, name: '성언' }));
    s = tennisReducer(s, A('ASSIGN_PLAYER', { ...C, name: '성언' }));
    expect(findCourt(s, 1, 1).sideB).toEqual([]);
  });

  it('좌우 교체', () => {
    let s = playingState();
    s = tennisReducer(s, A('EDIT_COURT_SETTINGS', C));
    s = tennisReducer(s, A('SWAP_SIDES', C));
    const c = findCourt(s, 1, 1);
    expect(c.sideA).toEqual(['철우']);
    expect(c.sideB).toEqual(['성언']);
  });

  it('경기 도중 선수 추가가 가능하다', () => {
    let s = playingState();
    s = tennisReducer(s, A('ADD_ATTENDEE', { name: '지각생', isGuest: false }));
    expect(s.attendees).toContain('지각생');
    s = tennisReducer(s, A('ADD_ATTENDEE', { name: '민환', isGuest: true }));
    expect(s.guests).toContain('민환');
  });
});

describe('게임 증분과 타이브레이크', () => {
  it('▲로 게임이 오른다', () => {
    let s = playingState();
    s = tennisReducer(s, A('INCREMENT_GAME', { ...C, side: 'A' }));
    expect(games(s)).toEqual([1, 0]);
  });

  it('5:5가 되면 게임 증분이 막히고 타이브레이크 포인트로 넘어간다', () => {
    let s = playingState();
    for (let i = 0; i < 5; i++) {
      s = tennisReducer(s, A('INCREMENT_GAME', { ...C, side: 'A' }));
      s = tennisReducer(s, A('INCREMENT_GAME', { ...C, side: 'B' }));
    }
    expect(games(s)).toEqual([5, 5]);

    s = tennisReducer(s, A('INCREMENT_GAME', { ...C, side: 'A' }));
    expect(games(s)).toEqual([5, 5]);   // 게임 증분은 무시

    s = tennisReducer(s, A('INCREMENT_TIEBREAK_POINT', { ...C, side: 'A' }));
    expect(findCourt(s, 1, 1).sets[0].tbA).toBe(1);
  });

  it('타이브레이크 7점이면 6:5로 세트가 확정된다', () => {
    let s = playingState();
    for (let i = 0; i < 5; i++) {
      s = tennisReducer(s, A('INCREMENT_GAME', { ...C, side: 'A' }));
      s = tennisReducer(s, A('INCREMENT_GAME', { ...C, side: 'B' }));
    }
    for (let i = 0; i < 7; i++) s = tennisReducer(s, A('INCREMENT_TIEBREAK_POINT', { ...C, side: 'A' }));
    expect(findCourt(s, 1, 1).sets[0]).toMatchObject({ a: 6, b: 5, tbA: 7 });
  });

  it('타이브레이크가 아닐 때 포인트 증분은 무시된다', () => {
    let s = playingState();
    s = tennisReducer(s, A('INCREMENT_TIEBREAK_POINT', { ...C, side: 'A' }));
    expect(findCourt(s, 1, 1).sets[0].tbA).toBe(0);
  });
});

describe('에이스/더블폴트 — 선수 단위', () => {
  it('복식에서 같은 편 두 선수가 따로 쌓인다', () => {
    let s = playingState({ format: '복식', sideA: ['성언', '다빈'], sideB: ['원희', '민환'] });
    s = tennisReducer(s, A('INCREMENT_STAT', { ...C, player: '성언', stat: 'aces' }));
    s = tennisReducer(s, A('INCREMENT_STAT', { ...C, player: '성언', stat: 'aces' }));
    s = tennisReducer(s, A('INCREMENT_STAT', { ...C, player: '다빈', stat: 'df' }));
    const st = findCourt(s, 1, 1).stats;
    expect(st['성언']).toMatchObject({ aces: 2, df: 0 });
    expect(st['다빈']).toMatchObject({ aces: 0, df: 1 });
  });
});

describe('세트/판 종료와 되돌리기', () => {
  it('세트 종료로 1세트 경기가 끝나면 status가 done', () => {
    let s = playingState({ bestOf: 1 });
    for (let i = 0; i < 6; i++) s = tennisReducer(s, A('INCREMENT_GAME', { ...C, side: 'A' }));
    s = tennisReducer(s, A('END_SET', C));
    expect(findCourt(s, 1, 1).status).toBe('done');
  });

  it('★ 판을 끝낸 세트 종료를 되돌리면 status도 playing으로 함께 풀린다', () => {
    let s = playingState({ bestOf: 1 });
    for (let i = 0; i < 6; i++) s = tennisReducer(s, A('INCREMENT_GAME', { ...C, side: 'A' }));
    s = tennisReducer(s, A('END_SET', C));
    expect(findCourt(s, 1, 1).status).toBe('done');

    s = tennisReducer(s, A('UNDO', C));
    const c = findCourt(s, 1, 1);
    expect(c.status).toBe('playing');       // done에 갇히면 빠져나갈 길이 없다
    expect(c.sets[0].done).toBe(false);
    expect(c.currentSet).toBe(0);
  });

  it('3세트 경기는 세트 종료 후 다음 세트가 열린다', () => {
    let s = playingState({ bestOf: 3 });
    for (let i = 0; i < 6; i++) s = tennisReducer(s, A('INCREMENT_GAME', { ...C, side: 'A' }));
    s = tennisReducer(s, A('END_SET', C));
    const c = findCourt(s, 1, 1);
    expect(c.status).toBe('playing');
    expect(c.sets).toHaveLength(2);
    expect(c.currentSet).toBe(1);
  });

  it('되돌리기는 게임 증분을 하나씩 연속으로 취소한다', () => {
    let s = playingState();
    s = tennisReducer(s, A('INCREMENT_GAME', { ...C, side: 'A' }));
    s = tennisReducer(s, A('INCREMENT_GAME', { ...C, side: 'A' }));
    s = tennisReducer(s, A('INCREMENT_GAME', { ...C, side: 'B' }));
    expect(games(s)).toEqual([2, 1]);
    s = tennisReducer(s, A('UNDO', C));
    expect(games(s)).toEqual([2, 0]);
    s = tennisReducer(s, A('UNDO', C));
    expect(games(s)).toEqual([1, 0]);
  });

  it('되돌리기는 타이브레이크 포인트도 취소한다', () => {
    let s = playingState();
    for (let i = 0; i < 5; i++) {
      s = tennisReducer(s, A('INCREMENT_GAME', { ...C, side: 'A' }));
      s = tennisReducer(s, A('INCREMENT_GAME', { ...C, side: 'B' }));
    }
    s = tennisReducer(s, A('INCREMENT_TIEBREAK_POINT', { ...C, side: 'A' }));
    s = tennisReducer(s, A('UNDO', C));
    expect(findCourt(s, 1, 1).sets[0].tbA).toBe(0);
  });

  it('되돌리기는 에이스/DF도 취소한다', () => {
    let s = playingState();
    s = tennisReducer(s, A('INCREMENT_STAT', { ...C, player: '성언', stat: 'aces' }));
    s = tennisReducer(s, A('UNDO', C));
    expect(findCourt(s, 1, 1).stats['성언']?.aces || 0).toBe(0);
  });

  it('스택이 비면 되돌리기는 아무 일도 하지 않는다', () => {
    const s = playingState();
    expect(tennisReducer(s, A('UNDO', C))).toEqual(s);
  });

  it('되돌리기는 다른 코트를 건드리지 않는다', () => {
    let s = playingState();
    s = tennisReducer(s, A('ADD_COURT', { roundIdx: 1 }));
    s = tennisReducer(s, A('ASSIGN_PLAYER', { roundIdx: 1, courtId: 2, name: '다빈' }));
    s = tennisReducer(s, A('ASSIGN_PLAYER', { roundIdx: 1, courtId: 2, name: '원희' }));
    s = tennisReducer(s, A('START_COURT', { roundIdx: 1, courtId: 2 }));
    s = tennisReducer(s, A('INCREMENT_GAME', { roundIdx: 1, courtId: 2, side: 'A' }));
    s = tennisReducer(s, A('INCREMENT_GAME', { ...C, side: 'A' }));

    s = tennisReducer(s, A('UNDO', C));
    expect(findCourt(s, 1, 2).sets[0].a).toBe(1);   // 코트2는 그대로
    expect(findCourt(s, 1, 1).sets[0].a).toBe(0);
  });
});

describe('설정 잠금과 복구', () => {
  it('시작 후에는 단복식/세트수 변경이 먹히지 않는다', () => {
    let s = playingState({ bestOf: 1 });
    s = tennisReducer(s, A('SET_COURT_FORMAT', { ...C, format: '복식' }));
    s = tennisReducer(s, A('SET_COURT_BEST_OF', { ...C, bestOf: 3 }));
    expect(findCourt(s, 1, 1)).toMatchObject({ format: '단식', bestOf: 1 });
  });

  it('EDIT_COURT_SETTINGS는 점수를 지우고 ready로 되돌린다', () => {
    let s = playingState();
    s = tennisReducer(s, A('INCREMENT_GAME', { ...C, side: 'A' }));
    s = tennisReducer(s, A('EDIT_COURT_SETTINGS', C));
    const c = findCourt(s, 1, 1);
    expect(c.status).toBe('ready');
    expect(c.sets).toEqual([]);
    expect(c.undoStack).toEqual([]);
    expect(c.stats).toEqual({});
    expect(c.sideA).toEqual(['성언']);   // 배치는 유지 — 화면에서 고치게 한다
  });

  it('1→3세트는 점수를 유지한 채 늘린다', () => {
    let s = playingState({ bestOf: 1 });
    for (let i = 0; i < 3; i++) s = tennisReducer(s, A('INCREMENT_GAME', { ...C, side: 'A' }));
    s = tennisReducer(s, A('EXTEND_TO_THREE_SETS', C));
    const c = findCourt(s, 1, 1);
    expect(c.bestOf).toBe(3);
    expect(c.status).toBe('playing');
    expect(c.sets[0].a).toBe(3);
  });
});

describe('INIT_STATE', () => {
  it('RTDB에서 온 반쪽 상태를 정규화해 받는다', () => {
    const s = tennisReducer(tennisInitialState, A('INIT_STATE', {
      state: { gameId: 'g_1', rounds: { 0: { roundIdx: 1, courts: { 0: { courtId: 1 } } } } },
    }));
    expect(s.rounds[0].courts[0].sets).toEqual([]);
    expect(s.attendees).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/hooks/__tests__/useTennisReducer.test.js`
Expected: FAIL — `Failed to resolve import "../useTennisReducer"`

- [ ] **Step 3: Write minimal implementation**

`src/hooks/useTennisReducer.js`:

```js
import { useReducer } from 'react';
import {
  emptySet, incrementGame, incrementTiebreakPoint,
  isTiebreakActive, isSetComplete, matchWinner,
} from '../utils/tennis/tennisScoring';
import { normalizeTennisMatch, normalizeTennisCourt } from '../utils/tennis/normalizeTennisMatch';

export const tennisInitialState = {
  gameId: '',
  team: '',
  sport: '테니스',
  gameDate: '',
  season: null,
  phase: 'setup',
  attendees: [],
  guests: [],
  rounds: [],
  viewingRoundIdx: 1,
  gameCreator: '',
  gameFinalized: false,
};

function newCourt(courtId) {
  return normalizeTennisCourt({ courtId, format: '단식', bestOf: 1, status: 'ready' });
}

export function findCourt(state, roundIdx, courtId) {
  const r = (state.rounds || []).find(x => x.roundIdx === roundIdx);
  if (!r) return null;
  return (r.courts || []).find(c => c.courtId === courtId) || null;
}

// 코트는 배열 index가 아니라 (roundIdx, courtId) 논리 키로 찾는다.
function mapCourt(state, roundIdx, courtId, fn) {
  return {
    ...state,
    rounds: (state.rounds || []).map(r => {
      if (r.roundIdx !== roundIdx) return r;
      return { ...r, courts: (r.courts || []).map(c => (c.courtId === courtId ? fn(c) : c)) };
    }),
  };
}

const slotsPerSide = (format) => (format === '복식' ? 2 : 1);

function pushUndo(court, entry) {
  return { ...court, undoStack: [...(court.undoStack || []), entry] };
}

function currentSetOf(court) {
  const sets = court.sets || [];
  return sets[court.currentSet] || null;
}

function withCurrentSet(court, nextSet) {
  const sets = [...(court.sets || [])];
  sets[court.currentSet] = nextSet;
  return { ...court, sets };
}

export function tennisReducer(state, action) {
  switch (action.type) {
    case 'INIT_STATE':
      return { ...tennisInitialState, ...normalizeTennisMatch(action.state) };

    case 'SET_GAME_META': {
      // action을 통째로 전개하면 type이 state에 섞인다. 필요한 필드만 뽑는다.
      const { gameId, team, gameDate, season, gameCreator } = action;
      return {
        ...state,
        ...(gameId !== undefined && { gameId }),
        ...(team !== undefined && { team }),
        ...(gameDate !== undefined && { gameDate }),
        ...(season !== undefined && { season }),
        ...(gameCreator !== undefined && { gameCreator }),
      };
    }

    case 'SET_ATTENDEES':
      return { ...state, attendees: action.attendees || [] };

    case 'ADD_ATTENDEE': {
      if (!action.name || state.attendees.includes(action.name)) return state;
      return {
        ...state,
        attendees: [...state.attendees, action.name],
        guests: action.isGuest ? [...state.guests, action.name] : state.guests,
      };
    }

    case 'ADD_ROUND': {
      const nextIdx = (state.rounds || []).reduce((m, r) => Math.max(m, r.roundIdx), 0) + 1;
      return {
        ...state,
        phase: 'playing',
        rounds: [...(state.rounds || []), { roundIdx: nextIdx, courts: [newCourt(1)] }],
        viewingRoundIdx: nextIdx,
      };
    }

    case 'SET_VIEWING_ROUND':
      return { ...state, viewingRoundIdx: action.roundIdx };

    case 'ADD_COURT':
      return {
        ...state,
        rounds: (state.rounds || []).map(r => {
          if (r.roundIdx !== action.roundIdx) return r;
          const nextId = (r.courts || []).reduce((m, c) => Math.max(m, c.courtId), 0) + 1;
          return { ...r, courts: [...(r.courts || []), newCourt(nextId)] };
        }),
      };

    case 'DELETE_COURT': {
      // 진행/완료된 코트는 지우지 않는다 — 오터치 한 번으로 기록이 날아가면 안 된다.
      const target = findCourt(state, action.roundIdx, action.courtId);
      if (!target || target.status !== 'ready') return state;
      return {
        ...state,
        rounds: (state.rounds || []).map(r => (r.roundIdx !== action.roundIdx
          ? r
          : { ...r, courts: (r.courts || []).filter(c => c.courtId !== action.courtId) })),
      };
    }

    case 'SET_COURT_FORMAT':
      return mapCourt(state, action.roundIdx, action.courtId, (c) => {
        if (c.status !== 'ready') return c;   // 시작 후 잠금
        const n = slotsPerSide(action.format);
        return { ...c, format: action.format, sideA: c.sideA.slice(0, n), sideB: c.sideB.slice(0, n) };
      });

    case 'SET_COURT_BEST_OF':
      return mapCourt(state, action.roundIdx, action.courtId, (c) => (
        c.status !== 'ready' ? c : { ...c, bestOf: action.bestOf }
      ));

    case 'ASSIGN_PLAYER':
      return mapCourt(state, action.roundIdx, action.courtId, (c) => {
        if (c.status !== 'ready') return c;
        if (c.sideA.includes(action.name) || c.sideB.includes(action.name)) return c;
        const n = slotsPerSide(c.format);
        if (c.sideA.length < n) return { ...c, sideA: [...c.sideA, action.name] };
        if (c.sideB.length < n) return { ...c, sideB: [...c.sideB, action.name] };
        return c;
      });

    case 'REMOVE_PLAYER':
      return mapCourt(state, action.roundIdx, action.courtId, (c) => (
        c.status !== 'ready' ? c : {
          ...c,
          sideA: c.sideA.filter(n => n !== action.name),
          sideB: c.sideB.filter(n => n !== action.name),
        }
      ));

    case 'SWAP_SIDES':
      return mapCourt(state, action.roundIdx, action.courtId, (c) => (
        c.status !== 'ready' ? c : { ...c, sideA: c.sideB, sideB: c.sideA }
      ));

    case 'START_COURT':
      return mapCourt(state, action.roundIdx, action.courtId, (c) => {
        const n = slotsPerSide(c.format);
        if (c.sideA.length !== n || c.sideB.length !== n) return c;
        return { ...c, status: 'playing', sets: [emptySet()], currentSet: 0, undoStack: [] };
      });

    case 'INCREMENT_GAME':
      return mapCourt(state, action.roundIdx, action.courtId, (c) => {
        if (c.status !== 'playing') return c;
        const cur = currentSetOf(c);
        const next = incrementGame(cur, action.side);
        if (next === cur) return c;   // 타이브레이크 중이거나 이미 끝난 세트
        return pushUndo(withCurrentSet(c, next), { kind: 'game', side: action.side, setIdx: c.currentSet });
      });

    case 'INCREMENT_TIEBREAK_POINT':
      return mapCourt(state, action.roundIdx, action.courtId, (c) => {
        if (c.status !== 'playing') return c;
        const cur = currentSetOf(c);
        if (!isTiebreakActive(cur)) return c;
        const next = incrementTiebreakPoint(cur, action.side);
        return pushUndo(withCurrentSet(c, next), { kind: 'tb', side: action.side, setIdx: c.currentSet });
      });

    case 'INCREMENT_STAT':
      return mapCourt(state, action.roundIdx, action.courtId, (c) => {
        if (c.status !== 'playing') return c;
        const prev = c.stats[action.player] || { aces: 0, df: 0 };
        const stats = { ...c.stats, [action.player]: { ...prev, [action.stat]: (prev[action.stat] || 0) + 1 } };
        return pushUndo({ ...c, stats }, { kind: 'stat', player: action.player, stat: action.stat });
      });

    case 'END_SET':
      return mapCourt(state, action.roundIdx, action.courtId, (c) => {
        const cur = currentSetOf(c);
        if (!cur || !isSetComplete(cur)) return c;
        const sets = [...c.sets];
        sets[c.currentSet] = { ...cur, done: true };
        const finished = !!matchWinner(sets, c.bestOf);
        const undoEntry = { kind: 'endSet', setIdx: c.currentSet, endedMatch: finished };
        if (finished) {
          return pushUndo({ ...c, sets, status: 'done' }, undoEntry);
        }
        return pushUndo({ ...c, sets: [...sets, emptySet()], currentSet: c.currentSet + 1 }, undoEntry);
      });

    case 'UNDO':
      return mapCourt(state, action.roundIdx, action.courtId, (c) => {
        const stack = c.undoStack || [];
        if (stack.length === 0) return c;
        const last = stack[stack.length - 1];
        const rest = stack.slice(0, -1);
        const sets = [...c.sets];

        if (last.kind === 'game') {
          const s = sets[last.setIdx];
          const key = last.side === 'A' ? 'a' : 'b';
          sets[last.setIdx] = { ...s, [key]: Math.max(0, (s[key] || 0) - 1) };
          return { ...c, sets, undoStack: rest };
        }
        if (last.kind === 'tb') {
          const s = sets[last.setIdx];
          const key = last.side === 'A' ? 'tbA' : 'tbB';
          const games = last.side === 'A' ? 'a' : 'b';
          const nextPoint = Math.max(0, (s[key] || 0) - 1);
          // 7점 도달로 6게임이 확정됐던 경우 게임도 5로 되돌린다.
          const nextGames = (s[key] || 0) >= 7 ? 5 : s[games];
          sets[last.setIdx] = { ...s, [key]: nextPoint, [games]: nextGames };
          return { ...c, sets, undoStack: rest };
        }
        if (last.kind === 'stat') {
          const prev = c.stats[last.player] || { aces: 0, df: 0 };
          const stats = { ...c.stats, [last.player]: { ...prev, [last.stat]: Math.max(0, (prev[last.stat] || 0) - 1) } };
          return { ...c, stats, undoStack: rest };
        }
        if (last.kind === 'endSet') {
          // ★ 세트 종료가 판을 끝냈다면 status도 함께 되돌린다.
          //   빠뜨리면 점수는 풀렸는데 카드가 done에 갇히고, done 카드엔 [설정 수정]이 없어 빠져나갈 길이 없다.
          const trimmed = last.endedMatch ? sets : sets.slice(0, last.setIdx + 1);
          trimmed[last.setIdx] = { ...trimmed[last.setIdx], done: false };
          return {
            ...c,
            sets: trimmed,
            currentSet: last.setIdx,
            status: 'playing',
            undoStack: rest,
          };
        }
        return { ...c, undoStack: rest };
      });

    case 'EDIT_COURT_SETTINGS':
      return mapCourt(state, action.roundIdx, action.courtId, (c) => ({
        ...c, status: 'ready', sets: [], currentSet: 0, stats: {}, undoStack: [],
      }));

    case 'EXTEND_TO_THREE_SETS':
      // 유일한 예외 — 점수를 유지한 채 세트만 늘린다.
      return mapCourt(state, action.roundIdx, action.courtId, (c) => (
        c.bestOf === 1 ? { ...c, bestOf: 3, status: c.status === 'done' ? 'playing' : c.status } : c
      ));

    case 'FINALIZE':
      return { ...state, gameFinalized: true, phase: 'done' };

    default:
      return state;
  }
}

export function useTennisReducer() {
  return useReducer(tennisReducer, tennisInitialState);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/hooks/__tests__/useTennisReducer.test.js`
Expected: PASS (7 suites, 22 tests)

- [ ] **Step 5: 전체 회귀 확인**

Run: `npm test`
Expected: PASS — 기존 테스트 전부 그대로

- [ ] **Step 6: Commit**

```bash
git add src/hooks/useTennisReducer.js src/hooks/__tests__/useTennisReducer.test.js
git commit -m "feat(tennis): 경기 상태 리듀서 (코트별 undo 스택, 타이브레이크 전환, 판종료 되돌림)"
```

---

## Task 11: 경기 화면 컴포넌트와 TennisApp

**이 태스크부터는 vitest가 안전망이 아니다.** RTL 하네스가 없어 렌더 크래시(TDZ, undefined 구조분해)를 build도 vitest도 잡지 못한다. 브라우저 스모크가 유일한 검증이다.

**Files:**
- Create: `src/components/tennis/TennisAttendeeSelector.jsx`
- Create: `src/components/tennis/TennisRoundNav.jsx`
- Create: `src/components/tennis/TennisCourtSetup.jsx`
- Create: `src/components/tennis/TennisCourtRecorder.jsx`
- Create: `src/components/tennis/TennisCourtCard.jsx`
- Create: `src/components/tennis/TennisConfirmBar.jsx`
- Create: `src/TennisApp.jsx`

**Interfaces:**
- Consumes: `useTennisReducer`/`findCourt` (Task 10), `tennisScoring` (Task 2), `TennisSync` (Task 8), `FirebaseSync`(기존, 읽기만)
- Produces: `TennisApp` default export — props `{ authUser, teamContext, isNewGame, gameMode, gameId, onLogout, onBackToMenu }` (기존 `App`/`SoccerApp`과 동일한 시그니처. `Root.jsx`가 이대로 넘긴다)

**화면 규칙 (스펙 6.3):**

- 코트는 **세로 스택**. 진행 중인 코트만 펼치고 끝난 코트는 한 줄 요약. `[+ 코트]`가 맨 아래.
- **좌우 축 고정** — A편이 항상 왼쪽. 이름·스코어·▲·에이스/DF가 한 세로줄.
- 5:5가 되면 카드 헤더가 `타이브레이크 (7점)`, ▲ 아래 숫자가 포인트로 전환.
- **에이스/DF는 편이 아니라 선수 줄마다** 독립 버튼.
- `[설정 수정]`은 진행 카드에만, `[코트 삭제]`는 `ready` 카드에만.

- [ ] **Step 1: `TennisCourtSetup.jsx` — 배치 화면**

```jsx
// 코트 배치. 토글이 슬롯 수를 결정한다 — 단식 좌우 1칸, 복식 2칸.
// 인원으로 단복식을 역추론하지 않는다.
export default function TennisCourtSetup({ court, roundIdx, attendees, usedNames, dispatch, C, canDelete }) {
  const slots = court.format === '복식' ? 2 : 1;
  const key = { roundIdx, courtId: court.courtId };
  const ready = court.sideA.length === slots && court.sideB.length === slots;

  const Slot = ({ side, idx }) => {
    const name = (side === 'A' ? court.sideA : court.sideB)[idx];
    return (
      <div style={{
        border: name ? '1.5px solid transparent' : '1.5px dashed var(--app-divider)',
        borderRadius: 9, minHeight: 34, display: 'flex', alignItems: 'center',
        justifyContent: 'center', marginBottom: 5,
      }}>
        {name ? (
          <button onClick={() => dispatch({ type: 'REMOVE_PLAYER', ...key, name })}
            style={{ background: C.text, color: C.bg, borderRadius: 13, padding: '4px 9px', border: 0, fontSize: 11 }}>
            {name} ×
          </button>
        ) : <span style={{ color: C.gray, fontSize: 10 }}>칩을 탭</span>}
      </div>
    );
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 9 }}>
        <Segmented value={court.format} options={['단식', '복식']} C={C}
          onChange={(v) => dispatch({ type: 'SET_COURT_FORMAT', ...key, format: v })} />
        <Segmented value={String(court.bestOf)} options={['1', '3']} labels={['1세트', '3세트']} C={C}
          onChange={(v) => dispatch({ type: 'SET_COURT_BEST_OF', ...key, bestOf: Number(v) })} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 26px 1fr' }}>
        <div>
          <div style={{ fontSize: 9.5, color: C.gray, textAlign: 'center', marginBottom: 4 }}>A편</div>
          {Array.from({ length: slots }, (_, i) => <Slot key={i} side="A" idx={i} />)}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.gray, fontSize: 10 }}>vs</div>
        <div>
          <div style={{ fontSize: 9.5, color: C.gray, textAlign: 'center', marginBottom: 4 }}>B편</div>
          {Array.from({ length: slots }, (_, i) => <Slot key={i} side="B" idx={i} />)}
        </div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, margin: '9px 0' }}>
        {attendees.map(n => {
          const used = usedNames.has(n);
          return (
            <button key={n} disabled={used}
              onClick={() => dispatch({ type: 'ASSIGN_PLAYER', ...key, name: n })}
              style={{
                borderRadius: 13, padding: '4px 9px', fontSize: 11,
                border: `1px solid ${C.grayDarker}`,
                background: used ? C.grayDarker : C.bg,
                color: used ? C.gray : C.text,
              }}>{n}</button>
          );
        })}
      </div>

      <div style={{ display: 'flex', gap: 6 }}>
        <button onClick={() => dispatch({ type: 'SWAP_SIDES', ...key })}
          style={{ flex: '0 0 auto', padding: '8px 10px', fontSize: 11 }}>⇄ 좌우</button>
        <button disabled={!ready} onClick={() => dispatch({ type: 'START_COURT', ...key })}
          style={{ flex: 1, padding: 10, borderRadius: 8, fontWeight: 600, border: 0,
            background: ready ? C.text : C.grayDarker, color: ready ? C.bg : C.gray }}>
          {ready ? '시작' : `시작 (${slots * 2 - court.sideA.length - court.sideB.length}명 더)`}
        </button>
        {canDelete && (
          <button onClick={() => dispatch({ type: 'DELETE_COURT', ...key })}
            style={{ flex: '0 0 auto', padding: '8px 10px', fontSize: 11, color: C.red }}>삭제</button>
        )}
      </div>
    </div>
  );
}

function Segmented({ value, options, labels, onChange, C }) {
  return (
    <div style={{ flex: 1, display: 'flex', background: C.grayDarker, borderRadius: 8, padding: 2 }}>
      {options.map((o, i) => (
        <button key={o} onClick={() => onChange(o)}
          style={{
            flex: 1, padding: '5px 0', fontSize: 10.5, borderRadius: 6, border: 0,
            background: value === o ? C.bg : 'transparent',
            color: value === o ? C.text : C.gray,
            fontWeight: value === o ? 600 : 400,
          }}>{labels ? labels[i] : o}</button>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: `TennisCourtRecorder.jsx` — 기록 화면**

```jsx
import { isTiebreakActive, isSetComplete } from '../../utils/tennis/tennisScoring';

// 좌우 축을 그대로 유지한다: 이름·스코어·▲·에이스/DF가 한 세로줄.
// 5:5가 되면 ▲가 게임이 아니라 타이브레이크 포인트를 올린다.
export default function TennisCourtRecorder({ court, roundIdx, dispatch, C }) {
  const key = { roundIdx, courtId: court.courtId };
  const cur = court.sets[court.currentSet] || { a: 0, b: 0, tbA: 0, tbB: 0 };
  const tb = isTiebreakActive(cur);
  const canEndSet = isSetComplete(cur);

  const bump = (side) => dispatch({
    type: tb ? 'INCREMENT_TIEBREAK_POINT' : 'INCREMENT_GAME', ...key, side,
  });

  const Column = ({ side }) => {
    const players = side === 'A' ? court.sideA : court.sideB;
    const games = side === 'A' ? cur.a : cur.b;
    const points = side === 'A' ? cur.tbA : cur.tbB;
    return (
      <div style={{ padding: 4, textAlign: 'center' }}>
        <div style={{ fontWeight: 600, fontSize: 11.5, minHeight: 28 }}>{players.join(' / ')}</div>
        <div style={{ fontSize: 38, fontWeight: 300, fontVariantNumeric: 'tabular-nums' }}>
          {tb ? points : games}
        </div>
        <button onClick={() => bump(side)}
          style={{ width: '100%', background: C.text, color: C.bg, borderRadius: 9, padding: '15px 0', border: 0, fontSize: 15, fontWeight: 700 }}>
          ▲
        </button>
        {/* 에이스/DF는 편이 아니라 선수마다 — 복식에서 잘못 귀속되면 2차에서 복원 불가 */}
        <div style={{ marginTop: 7 }}>
          {players.map(p => {
            const st = court.stats[p] || { aces: 0, df: 0 };
            return (
              <div key={p} style={{ display: 'flex', gap: 4, alignItems: 'center', marginTop: 3, fontSize: 9.5 }}>
                <span style={{ flex: 1, textAlign: 'left', color: C.gray }}>{p}</span>
                <button onClick={() => dispatch({ type: 'INCREMENT_STAT', ...key, player: p, stat: 'aces' })}
                  style={{ padding: '3px 6px', fontSize: 9.5 }}>A {st.aces || 0}</button>
                <button onClick={() => dispatch({ type: 'INCREMENT_STAT', ...key, player: p, stat: 'df' })}
                  style={{ padding: '3px 6px', fontSize: 9.5 }}>DF {st.df || 0}</button>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div>
      <div style={{ textAlign: 'center', fontSize: 10.5, color: C.gray, marginBottom: 6 }}>
        {tb ? '타이브레이크 (7점)' : `세트 ${court.currentSet + 1} / ${court.bestOf}`}
        {court.sets.filter(s => s.done).map((s, i) => (
          <span key={i} style={{ marginLeft: 6 }}>{s.a}:{s.b}{s.tbA || s.tbB ? ` (${s.tbA}-${s.tbB})` : ''}</span>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 26px 1fr' }}>
        <Column side="A" />
        <div />
        <Column side="B" />
      </div>

      <div style={{ display: 'flex', gap: 6, marginTop: 9 }}>
        <button onClick={() => dispatch({ type: 'UNDO', ...key })} style={{ flex: 1, padding: 8, fontSize: 11 }}>↩ 되돌리기</button>
        <button disabled={!canEndSet} onClick={() => dispatch({ type: 'END_SET', ...key })}
          style={{ flex: 1, padding: 8, fontSize: 11, opacity: canEndSet ? 1 : 0.4 }}>세트 종료</button>
        <button onClick={() => {
          const hasScore = court.sets.some(s => s.a > 0 || s.b > 0);
          if (hasScore && !confirm('기록된 점수가 지워집니다. 계속할까요?')) return;
          dispatch({ type: 'EDIT_COURT_SETTINGS', ...key });
        }} style={{ flex: '0 0 auto', padding: '8px 10px', fontSize: 10.5, color: C.gray }}>설정 수정</button>
        {court.bestOf === 1 && (
          <button onClick={() => dispatch({ type: 'EXTEND_TO_THREE_SETS', ...key })}
            style={{ flex: '0 0 auto', padding: '8px 10px', fontSize: 10.5 }}>+3세트</button>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: `TennisCourtCard.jsx` — 상태 스위치**

```jsx
import TennisCourtSetup from './TennisCourtSetup';
import TennisCourtRecorder from './TennisCourtRecorder';
import { summarizeCourt } from '../../utils/tennis/tennisScoring';

export default function TennisCourtCard({ court, roundIdx, attendees, usedNames, dispatch, C, canDelete }) {
  if (court.status === 'done') {
    const s = summarizeCourt(court);
    return (
      <div style={{ background: C.bg, margin: 8, borderRadius: 10, border: `1px solid ${C.grayDarker}`, padding: 9,
        display: 'flex', justifyContent: 'space-between', fontSize: 11, color: C.gray }}>
        <span>✓ 코트 {court.courtId} · {court.format}</span>
        <span>{court.sideA.join('/')} {s.setsA}-{s.setsB} {court.sideB.join('/')}</span>
      </div>
    );
  }

  return (
    <div style={{ background: C.bg, margin: 8, borderRadius: 10, border: `1px solid ${C.grayDarker}`, overflow: 'hidden' }}>
      <div style={{ padding: '6px 9px', borderBottom: `1px solid ${C.grayDarker}`, fontSize: 10.5, color: C.gray }}>
        코트 {court.courtId} · {court.status === 'ready' ? '배치 중' : `${court.format} · ${court.bestOf}세트`}
      </div>
      <div style={{ padding: 9 }}>
        {court.status === 'ready'
          ? <TennisCourtSetup court={court} roundIdx={roundIdx} attendees={attendees}
              usedNames={usedNames} dispatch={dispatch} C={C} canDelete={canDelete} />
          : <TennisCourtRecorder court={court} roundIdx={roundIdx} dispatch={dispatch} C={C} />}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: `TennisRoundNav.jsx`, `TennisAttendeeSelector.jsx`, `TennisConfirmBar.jsx`**

```jsx
// TennisRoundNav.jsx
export default function TennisRoundNav({ rounds, viewingRoundIdx, dispatch, C }) {
  const idxs = rounds.map(r => r.roundIdx);
  const pos = idxs.indexOf(viewingRoundIdx);
  const go = (d) => {
    const n = idxs[pos + d];
    if (n !== undefined) dispatch({ type: 'SET_VIEWING_ROUND', roundIdx: n });
  };
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', color: C.text }}>
      <button onClick={() => go(-1)} disabled={pos <= 0}>◀</button>
      <span style={{ flex: 1, textAlign: 'center', fontSize: 12 }}>라운드 {viewingRoundIdx} / {idxs.length}</span>
      <button onClick={() => go(1)} disabled={pos >= idxs.length - 1}>▶</button>
      <button onClick={() => dispatch({ type: 'ADD_ROUND' })} style={{ fontSize: 11 }}>+ 라운드</button>
    </div>
  );
}
```

```jsx
// TennisAttendeeSelector.jsx
import { useState } from 'react';

export default function TennisAttendeeSelector({ roster, attendees, guests, gameDate, dispatch, onStart, C }) {
  const [guestName, setGuestName] = useState('');
  const toggle = (name) => dispatch({
    type: 'SET_ATTENDEES',
    attendees: attendees.includes(name) ? attendees.filter(n => n !== name) : [...attendees, name],
  });
  return (
    <div style={{ padding: 12 }}>
      <div style={{ fontSize: 13, marginBottom: 8 }}>{gameDate} · 참석자 {attendees.length}명</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {roster.map(m => {
          const on = attendees.includes(m.name);
          return (
            <button key={m.name} onClick={() => toggle(m.name)}
              style={{ borderRadius: 13, padding: '5px 10px', fontSize: 12,
                border: `1px solid ${C.grayDarker}`,
                background: on ? C.text : C.bg, color: on ? C.bg : C.text }}>
              {m.name} <span style={{ fontSize: 9, opacity: 0.65 }}>{m.grade}</span>
            </button>
          );
        })}
        {guests.map(g => (
          <span key={g} style={{ borderRadius: 13, padding: '5px 10px', fontSize: 12, background: C.grayDarker }}>
            {g} <span style={{ fontSize: 9 }}>용병</span>
          </span>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
        <input value={guestName} onChange={e => setGuestName(e.target.value)} placeholder="용병 이름"
          style={{ flex: 1, padding: 8 }} />
        <button onClick={() => {
          if (!guestName.trim()) return;
          dispatch({ type: 'ADD_ATTENDEE', name: guestName.trim(), isGuest: true });
          setGuestName('');
        }}>+ 용병</button>
      </div>
      <button disabled={attendees.length < 2} onClick={onStart}
        style={{ width: '100%', marginTop: 12, padding: 12, borderRadius: 8, border: 0,
          background: attendees.length >= 2 ? C.text : C.grayDarker,
          color: attendees.length >= 2 ? C.bg : C.gray, fontWeight: 600 }}>
        경기 시작
      </button>
    </div>
  );
}
```

```jsx
// TennisConfirmBar.jsx
export default function TennisConfirmBar({ unfinishedCourts, onFinalize, busy, C }) {
  return (
    <div style={{ position: 'sticky', bottom: 0, padding: 10, background: C.bg, borderTop: `1px solid ${C.grayDarker}` }}>
      {unfinishedCourts.length > 0 && (
        <div style={{ fontSize: 11, color: C.orange, marginBottom: 6 }}>
          미완료 {unfinishedCourts.length}개 — 마감 시 전송되지 않고 버려집니다: {unfinishedCourts.join(', ')}
        </div>
      )}
      <button disabled={busy} onClick={onFinalize}
        style={{ width: '100%', padding: 13, borderRadius: 8, border: 0, background: C.text, color: C.bg, fontWeight: 600 }}>
        {busy ? '전송 중...' : '경기 마감'}
      </button>
    </div>
  );
}
```

- [ ] **Step 5: `TennisApp.jsx` — 루트**

`src/SoccerApp.jsx`의 RTDB 구독/동기화 구조를 참고하되 **그 파일은 읽기만 하고 수정하지 않는다.**

```jsx
import { useEffect, useState, useMemo, useRef } from 'react';
import { useTennisReducer } from './hooks/useTennisReducer';
import { useTheme } from './hooks/useTheme';
import FirebaseSync from './services/firebaseSync';
import TennisSync from './services/tennisSync';
import { normalizeTennisMatch } from './utils/tennis/normalizeTennisMatch';
import { summarizeCourt } from './utils/tennis/tennisScoring';
import { buildTennisMatchRows, buildTennisPlayerGameRows } from './utils/tennis/tennisRowBuilders';
import TennisAttendeeSelector from './components/tennis/TennisAttendeeSelector';
import TennisRoundNav from './components/tennis/TennisRoundNav';
import TennisCourtCard from './components/tennis/TennisCourtCard';
import TennisConfirmBar from './components/tennis/TennisConfirmBar';

const todayLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export default function TennisApp({ authUser, teamContext, isNewGame, gameId, onBackToMenu }) {
  const [state, dispatch] = useTennisReducer();
  const { C } = useTheme();
  const [roster, setRoster] = useState([]);
  const [busy, setBusy] = useState(false);
  const team = teamContext?.team || '';

  useEffect(() => { TennisSync.getRoster().then(setRoster); }, []);

  // 신규 경기면 메타를 세팅하고, 아니면 RTDB에서 복원한다.
  useEffect(() => {
    if (isNewGame) {
      const date = todayLocal();
      dispatch({ type: 'SET_GAME_META', gameId, team, gameDate: date, season: Number(date.slice(0, 4)), gameCreator: authUser?.name || '' });
      return;
    }
    FirebaseSync.loadStateReconstructed(team, gameId).then(raw => {
      if (raw) dispatch({ type: 'INIT_STATE', state: normalizeTennisMatch(raw) });
    });
  }, [isNewGame, gameId, team]);

  // 상태가 바뀔 때마다 RTDB에 통째로 저장한다. (테니스는 코트 수가 적어 diff 없이도 충분하다)
  const skipFirst = useRef(true);
  useEffect(() => {
    if (skipFirst.current) { skipFirst.current = false; return; }
    if (!team || !state.gameId) return;
    FirebaseSync.saveState(team, state.gameId, state).catch(() => {});
  }, [state, team]);

  const round = useMemo(
    () => state.rounds.find(r => r.roundIdx === state.viewingRoundIdx) || state.rounds[0],
    [state.rounds, state.viewingRoundIdx]);

  const usedNames = useMemo(() => {
    const s = new Set();
    for (const c of (round?.courts || [])) { c.sideA.forEach(n => s.add(n)); c.sideB.forEach(n => s.add(n)); }
    return s;
  }, [round]);

  const unfinished = useMemo(() => {
    const out = [];
    for (const r of state.rounds) for (const c of (r.courts || [])) {
      if (!summarizeCourt(c).winner) out.push(`R${r.roundIdx}-C${c.courtId}`);
    }
    return out;
  }, [state.rounds]);

  const handleFinalize = async () => {
    if (unfinished.length > 0 &&
        !confirm(`미완료 ${unfinished.length}개가 전송되지 않습니다:\n${unfinished.join(', ')}\n\n마감할까요?`)) return;
    setBusy(true);
    try {
      const memberSet = new Set(roster.map(m => m.name));
      const gradeByPlayer = Object.fromEntries(roster.map(m => [m.name, m.grade]));
      const inputTime = new Date().toISOString().slice(0, 19).replace('T', ' ');
      const matchRows = buildTennisMatchRows({ team, state, inputTime, memberSet });
      const pgRows = buildTennisPlayerGameRows({ team, state, inputTime, memberSet, gradeByPlayer });

      // 병렬 전송. 하나라도 실패하면 미확정을 유지해 재시도할 수 있게 한다.
      // (tennisSync가 success:false를 throw로 바꾸므로 rejected로 잡힌다)
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
      await FirebaseSync.saveFinalized(team, state.gameId, { ...state, gameFinalized: true });
      await FirebaseSync.clearState(team, state.gameId);
      alert('마감 완료');
      onBackToMenu();
    } finally {
      setBusy(false);
    }
  };

  if (state.phase === 'setup') {
    return (
      <div style={{ background: C.bg, minHeight: '100vh', color: C.text }}>
        <TennisAttendeeSelector roster={roster} attendees={state.attendees} guests={state.guests}
          gameDate={state.gameDate} dispatch={dispatch} C={C}
          onStart={() => dispatch({ type: 'ADD_ROUND' })} />
      </div>
    );
  }

  return (
    <div style={{ background: C.bg, minHeight: '100vh', color: C.text, display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '8px 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <button onClick={onBackToMenu} style={{ fontSize: 12 }}>← 대시보드</button>
        <b style={{ fontSize: 12 }}>{state.gameDate} · 테니스</b>
      </div>

      <TennisRoundNav rounds={state.rounds} viewingRoundIdx={state.viewingRoundIdx} dispatch={dispatch} C={C} />

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {(round?.courts || []).map(c => (
          <TennisCourtCard key={c.courtId} court={c} roundIdx={round.roundIdx}
            attendees={state.attendees} usedNames={usedNames} dispatch={dispatch} C={C}
            canDelete={(round.courts || []).length > 1} />
        ))}
        <button onClick={() => dispatch({ type: 'ADD_COURT', roundIdx: round.roundIdx })}
          style={{ display: 'block', width: 'calc(100% - 16px)', margin: 8, padding: 11,
            border: `1.5px dashed ${C.grayDarker}`, borderRadius: 10, background: 'transparent', color: C.gray }}>
          + 코트
        </button>
      </div>

      <TennisConfirmBar unfinishedCourts={unfinished} onFinalize={handleFinalize} busy={busy} C={C} />
    </div>
  );
}
```

- [ ] **Step 6: 빌드와 lint 확인**

Run: `npm run build && npm run lint`
Expected: 둘 다 통과. `useTheme` import 경로와 `C`의 실제 키(`C.bg`/`C.text`/`C.gray`/`C.grayDarker`/`C.red`/`C.orange`)는 `src/hooks/useTheme.jsx`에서 확인해 맞춘다. 없는 키를 쓰면 런타임에 `undefined`가 스타일로 들어가 조용히 깨진다.

- [ ] **Step 7: Commit** (Root.jsx는 아직 건드리지 않는다 — Task 12에서 함께)

```bash
git add src/components/tennis src/TennisApp.jsx
git commit -m "feat(tennis): 경기 기록 화면 (세로 스택 코트, 좌우 축, 타이브레이크 전환, 선수별 에이스/DF)"
```

---

## Task 12: 기존 앱에 배선 + 브라우저 스모크

**`Root.jsx` 라우팅과 `TennisApp.jsx`는 한 커밋으로 묶여야 한다.** Task 11에서 `TennisApp`이 이미 렌더 가능한 상태로 존재하므로 순서 제약은 충족된다.

**Files:**
- Modify: `src/Root.jsx`
- Modify: `src/components/dashboard/TeamDashboard.jsx`
- Create: `src/components/tennis/TennisTabs.jsx`

- [ ] **Step 1: `TennisTabs.jsx` — 대시보드 본문 (1차는 경기관리만)**

```jsx
// 테니스 대시보드 본문. 이 태스크에선 경기관리 탭만 채우고,
// records(랭킹)·roster(개인기록)는 Task 13에서 같은 시그니처 그대로 확장한다.
// ★ props 이름을 Task 13과 맞춰둔다 — authUserName은 지금은 안 쓰지만 미리 받는다.
export default function TennisTabs({ activeTab, pendingGames, onStartGame, onContinueGame, authUserName, C }) {
  if (activeTab === 'games') {
    return (
      <div style={{ padding: 12 }}>
        <button onClick={() => onStartGame('테니스')}
          style={{ width: '100%', padding: 14, borderRadius: 10, border: 0, background: C.text, color: C.bg, fontWeight: 600 }}>
          + 경기 추가
        </button>
        <div style={{ marginTop: 14 }}>
          {pendingGames.length === 0
            ? <div style={{ color: C.gray, fontSize: 12, textAlign: 'center', padding: 20 }}>진행중인 경기가 없습니다</div>
            : pendingGames.map(g => (
              <button key={g.gameId} onClick={() => onContinueGame(g.gameId)}
                style={{ display: 'block', width: '100%', textAlign: 'left', padding: 12, marginBottom: 8,
                  border: `1px solid ${C.grayDarker}`, borderRadius: 10, background: C.bg, color: C.text }}>
                <div style={{ fontSize: 13 }}>{g.state?.gameDate || '-'}</div>
                <div style={{ fontSize: 11, color: C.gray }}>
                  {(g.state?.rounds || []).length}라운드 · 참석 {(g.state?.attendees || []).length}명
                </div>
              </button>
            ))}
        </div>
      </div>
    );
  }
  return <div style={{ padding: 20, textAlign: 'center', color: C.gray, fontSize: 12 }}>준비 중</div>;
}
```

- [ ] **Step 2: `Root.jsx` — 라우팅 + pendingGames 종목 필터**

195행의 라우팅을 고친다:

```jsx
  const GameApp = teamContext?.mode === "축구" ? SoccerApp
    : teamContext?.mode === "테니스" ? TennisApp
    : App;
```

상단에 import 추가:

```jsx
import TennisApp from './TennisApp';
```

`checkPendingGames`에 **종목 필터**를 넣는다. 안 넣으면 진행 중인 테니스 경기가 풋살 탭에 `0매치 완료`로 뜨고, 풋살 사용자가 새 경기를 만들 때 "이미 진행중인 경기가 있습니다" 경고를 받는다:

```jsx
  const checkPendingGames = (teamName, mode) => {
    setCheckingPending(true);
    setPendingGames([]);

    FirebaseSync.loadAllActiveReconstructed(teamName).then(fbGames => {
      const validGames = fbGames.filter(g => {
        if (!g.state || g.state.phase === "setup") return false;
        // 종목이 다른 경기는 이 화면의 목록에 넣지 않는다.
        const gameSport = g.state.sport || (g.state.matchMode === "soccer" ? "축구" : "풋살");
        return !mode || gameSport === mode;
      });
      setPendingGames(validGames);
    }).catch(() => { }).finally(() => setCheckingPending(false));
  };
```

`checkPendingGames` 호출부 4곳에 두 번째 인자를 넘긴다: 마운트 `useEffect`, 화면 복귀 `useEffect`, `selectTeam`, `onBackToMenu` 콜백. 각각 `checkPendingGames(selectedTeamName, teamContext?.mode)` 형태로 바꾼다(`selectTeam` 안에서는 `first.mode`).

- [ ] **Step 3: `TeamDashboard.jsx` — 탭 구성 분기 + 본문 위임 + fetch guard**

**(a) import 추가:**

```jsx
import TennisTabs from '../tennis/TennisTabs';
```

**(b) fetch guard** — 58행의 `useEffect`를 감싼다. 풋살/축구 경로는 그대로 지나가야 한다:

```jsx
  const isTennis = activeSport === "테니스";

  useEffect(() => {
    // 테니스는 대시보드 시트(풋살/축구 명부)를 읽지 않는다. 호출하면 빈 명단으로 위젯이 0으로 채워진다.
    if (isTennis) { setMembersLoading(false); return; }
    fetchSheetData()
      .then(data => { setMembers(data.players || []); setKeepers(data.keepers || []); })
      .catch(() => setMembers([]))
      .finally(() => setMembersLoading(false));
    AppSync.getLatestDeltas(getSettings(teamName).playerLogSheet).then(deltas => {
      setPrevRanks(deltas);
    }).catch(() => {});
    // ... 이하 기존 코드 그대로
```

`useEffect` 의존성 배열에 `isTennis`를 추가한다.

**(c) 메인 탭 구성 분기** — 936행의 탭 배열:

```jsx
        {[
          { key: "records", label: "대시보드" },
          { key: "roster", label: activeSport === "축구" ? "팀/개인 기록" : "개인기록" },
          { key: "analytics", label: "분석" },
          { key: "games", label: "경기관리", badge: pendingGames.length > 0 },
          activeSport === "축구" && { key: "tournament", label: "대회" },
        ].filter(Boolean).map(tab => (
```

**(d) 본문 위임** — 954행의 본문 렌더 블록을 감싼다:

```jsx
      <div style={{ padding: "16px 0" }}>
        {isTennis ? (
          <TennisTabs activeTab={activeTab} pendingGames={pendingGames}
            onStartGame={onStartGame} onContinueGame={onContinueGame}
            authUserName={authUser?.name} C={C} />
        ) : (
          <>
            {activeTab === "records" && renderRecords()}
            {activeTab === "roster" && renderRoster()}
            {/* ... 기존 블록 전부 그대로 ... */}
          </>
        )}
      </div>
```

- [ ] **Step 4: 전체 테스트 + 빌드 + lint**

Run: `npm test && npm run build && npm run lint`
Expected: 전부 통과. **기존 테스트가 하나라도 깨지면 풋살/축구 회귀이므로 즉시 되돌린다.**

- [ ] **Step 5: 브라우저 스모크 — 필수**

`npm run dev` 후 유저에게 확인을 요청한다. **이 저장소엔 RTL 하네스가 없어 여기서만 렌더 크래시를 잡을 수 있다.**

풋살/축구 회귀 확인 (먼저):
1. 기존 풋살 팀으로 로그인 → 대시보드 4탭이 그대로 뜨는지
2. 개인기록·분석·경기관리 탭이 예전처럼 데이터를 보여주는지
3. 진행 중 풋살 경기가 있으면 목록에 그대로 뜨는지

테니스 신규 확인:
4. 테니스 팀으로 로그인 → 종목 칩에 "테니스"가 뜨는지
5. 경기관리 → `+ 경기 추가` → 참석자 선택 화면이 뜨는지
6. 참석자 4명 선택 + 용병 1명 추가 → 경기 시작
7. 코트1이 자동으로 있고 단식·1세트가 기본인지
8. 복식 토글 → 슬롯이 2칸씩 열리는지, 칩 4번 탭으로 배치되는지
9. 시작 → ▲로 게임이 오르는지, 5:5에서 헤더가 `타이브레이크 (7점)`으로 바뀌는지
10. 선수마다 A/DF 버튼이 따로 있고 각각 쌓이는지
11. 되돌리기가 마지막 동작만 취소하는지
12. 세트 종료 → 판 종료 → 되돌리기 시 **카드가 done에 갇히지 않고 다시 열리는지**
13. `+ 코트`로 코트를 3개까지 늘려보기
14. 경기 마감 → 시트 2종에 행이 들어갔는지 스프레드시트에서 확인

- [ ] **Step 6: Commit**

```bash
git add src/Root.jsx src/components/dashboard/TeamDashboard.jsx src/components/tennis/TennisTabs.jsx
git commit -m "feat(tennis): Root 라우팅 + 대시보드 배선

pendingGames에 종목 필터 추가 — 테니스 경기가 풋살 탭에 뜨는 문제 차단.
TeamDashboard의 fetchSheetData/getLatestDeltas는 테니스일 때 건너뛴다."
```

---

## Task 13: 단식 승률 랭킹 + 개인 전적 요약

1차의 마지막 조각이다. 시트에서 읽은 `로그_테니스선수경기` 행으로 랭킹을 만든다.

**Files:**
- Create: `src/utils/tennis/tennisStandings.js`
- Test: `src/utils/tennis/__tests__/tennisStandings.test.js`
- Modify: `src/components/tennis/TennisTabs.jsx`

**Interfaces:**
- Consumes: `deriveLeagueForDate` (Task 4), `calcMatchPoints` (Task 5), `TennisSync.getPlayerGames` (Task 8)
- Produces:
  - `buildSinglesStandings({ rows, roster, asOfDate, pointRules? }): Array<{ name, grade, leagueTier, games, wins, losses, rate, points }>` — `pointRules` 기본값은 `DEFAULT_POINT_RULES`
  - `buildPlayerSummary({ rows, player }): { singles: {...}, doubles: {...}, attendanceDates: number, aces, doubleFaults, tbPlayed, tbWon, bagelsTaken, bagelsGiven }`

- [ ] **Step 1: Write the failing test**

`src/utils/tennis/__tests__/tennisStandings.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { buildSinglesStandings, buildPlayerSummary } from '../tennisStandings';
import { LEAGUE_BK } from '../tennisSchema';

const pg = (o) => ({
  player: 'x', date: '2026-03-01', format: '단식', league: '길로틴', result: '승',
  is_guest: false, side: 'A', match_id: 'R1_C1', grade_at_date: '동배',
  sets_won: 1, sets_lost: 0, games_won: 6, games_lost: 3,
  tb_played: 0, tb_won: 0, aces: 0, double_faults: 0,
  bagels_taken: 0, bagels_given: 0, opponents_json: '["y"]', partner: '', ...o,
});

describe('buildSinglesStandings', () => {
  const roster = [
    { name: 'a', grade: '동배', seasonStartRank: 1 },
    { name: 'b', grade: '은배', seasonStartRank: 2 },
  ];

  it('승률로 줄 세운다', () => {
    const rows = [
      pg({ player: 'a', result: '승' }), pg({ player: 'b', result: '패' }),
      pg({ player: 'a', result: '승', date: '2026-03-02' }), pg({ player: 'b', result: '패', date: '2026-03-02' }),
    ];
    const s = buildSinglesStandings({ rows, roster, asOfDate: '2026-12-31' });
    expect(s[0].name).toBe('a');
    expect(s[0]).toMatchObject({ games: 2, wins: 2, losses: 0, rate: 1 });
    expect(s[1]).toMatchObject({ name: 'b', wins: 0, losses: 2, rate: 0 });
  });

  it('복식과 미반영 판은 제외한다', () => {
    const rows = [
      pg({ player: 'a', format: '복식', league: '투몽' }),
      pg({ player: 'a', league: '미반영' }),
    ];
    const s = buildSinglesStandings({ rows, roster, asOfDate: '2026-12-31' });
    expect(s.find(x => x.name === 'a').games).toBe(0);
  });

  it('용병은 순위표에 없다', () => {
    const rows = [pg({ player: '민환', is_guest: true })];
    const s = buildSinglesStandings({ rows, roster, asOfDate: '2026-12-31' });
    expect(s.find(x => x.name === '민환')).toBeUndefined();
  });

  it('기록이 없어도 로스터 전원이 나온다', () => {
    const s = buildSinglesStandings({ rows: [], roster, asOfDate: '2026-12-31' });
    expect(s).toHaveLength(2);
    expect(s[0].games).toBe(0);
  });

  it('리그 배치가 붙는다', () => {
    const s = buildSinglesStandings({ rows: [], roster, asOfDate: '2026-12-31' });
    expect(s[0].leagueTier).toBe(LEAGUE_BK);
  });

  it('포인트가 누적된다 — 같은 판의 양쪽 행을 짝지어 계산', () => {
    // a(동배)가 b(은배)를 이김 → 기본1 + 등급역전5 = 6
    const rows = [
      pg({ player: 'a', result: '승', grade_at_date: '동배', match_id: 'R1_C1', side: 'A' }),
      pg({ player: 'b', result: '패', grade_at_date: '은배', match_id: 'R1_C1', side: 'B' }),
    ];
    const s = buildSinglesStandings({ rows, roster, asOfDate: '2026-12-31' });
    expect(s.find(x => x.name === 'a').points).toBe(6);
    expect(s.find(x => x.name === 'b').points).toBe(0);
  });
});

describe('buildPlayerSummary', () => {
  const rows = [
    pg({ player: 'a', date: '2026-03-01', result: '승', aces: 2, double_faults: 1, tb_played: 1, tb_won: 1, bagels_given: 1 }),
    pg({ player: 'a', date: '2026-03-01', format: '복식', league: '투몽', result: '패', partner: 'b', aces: 1, bagels_taken: 1 }),
    pg({ player: 'a', date: '2026-04-01', result: '패' }),
  ];

  it('단식/복식을 나눠 집계한다', () => {
    const s = buildPlayerSummary({ rows, player: 'a' });
    expect(s.singles).toMatchObject({ games: 2, wins: 1, losses: 1 });
    expect(s.doubles).toMatchObject({ games: 1, wins: 0, losses: 1 });
  });

  it('출석은 서로 다른 경기일 수 (뛴 날만)', () => {
    expect(buildPlayerSummary({ rows, player: 'a' }).attendanceDates).toBe(2);
  });

  it('에이스/DF/타이브레이크/베이글이 누적된다', () => {
    const s = buildPlayerSummary({ rows, player: 'a' });
    expect(s).toMatchObject({ aces: 3, doubleFaults: 1, tbPlayed: 1, tbWon: 1, bagelsGiven: 1, bagelsTaken: 1 });
  });

  it('기록 없는 선수는 0으로 채워진다', () => {
    const s = buildPlayerSummary({ rows, player: '없는사람' });
    expect(s.singles.games).toBe(0);
    expect(s.attendanceDates).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/tennis/__tests__/tennisStandings.test.js`
Expected: FAIL — `Failed to resolve import "../tennisStandings"`

- [ ] **Step 3: Write minimal implementation**

`src/utils/tennis/tennisStandings.js`:

```js
// 로그_테니스선수경기 행 → 단식 순위표 / 개인 전적 요약.
// 순위는 승률로 매기고 포인트는 별도 컬럼으로 적립한다(스펙 4.5).

import { COMPETITION_SINGLES, COMPETITION_DOUBLES } from './tennisSchema';
import { deriveLeagueForDate, singlesWinRatesBefore } from './leagueDerivation';
import { calcMatchPoints, DEFAULT_POINT_RULES } from './rankPoints';

const isSingles = (r) => r.format === '단식' && r.league === COMPETITION_SINGLES;

export function buildSinglesStandings({ rows, roster, asOfDate, pointRules = DEFAULT_POINT_RULES }) {
  const list = (roster || []).filter(m => m && m.name);
  const acc = new Map(list.map(m => [m.name, {
    name: m.name, grade: m.grade || '', games: 0, wins: 0, losses: 0, rate: 0, points: 0,
  }]));

  const singles = (rows || []).filter(r => isSingles(r) && r.is_guest !== true);

  for (const r of singles) {
    const cur = acc.get(r.player);
    if (!cur) continue;               // 로스터 밖(용병/탈퇴)은 순위표에 넣지 않는다
    cur.games++;
    if (r.result === '승') cur.wins++;
    else if (r.result === '패') cur.losses++;
    cur.rate = cur.games > 0 ? cur.wins / cur.games : 0;
  }

  // 포인트는 같은 판(match_id + date)의 양쪽 행을 짝지어야 계산된다.
  // 리그/승률은 그 경기일 직전 값을 써야 하므로 날짜별로 한 번씩만 파생한다.
  const byDate = new Map();
  for (const r of singles) {
    if (!byDate.has(r.date)) byDate.set(r.date, []);
    byDate.get(r.date).push(r);
  }

  for (const [date, dayRows] of [...byDate.entries()].sort((a, b) => String(a[0]).localeCompare(String(b[0])))) {
    const leagueMap = deriveLeagueForDate({ rows: singles, dateISO: date, roster: list });
    const rates = singlesWinRatesBefore(singles, date);
    const rateOf = (n) => rates.get(n)?.rate ?? 0;

    const pairs = new Map();
    for (const r of dayRows) {
      const k = `${r.game_id || ''}|${r.match_id}`;
      if (!pairs.has(k)) pairs.set(k, []);
      pairs.get(k).push(r);
    }

    for (const rowsOfMatch of pairs.values()) {
      if (rowsOfMatch.length !== 2) continue;
      const winnerRow = rowsOfMatch.find(x => x.result === '승');
      const loserRow = rowsOfMatch.find(x => x.result === '패');
      if (!winnerRow || !loserRow) continue;
      const target = acc.get(winnerRow.player);
      if (!target) continue;
      target.points += calcMatchPoints({
        format: '단식',
        league: COMPETITION_SINGLES,
        winner: {
          name: winnerRow.player, grade: winnerRow.grade_at_date,
          leagueTier: leagueMap[winnerRow.player], winRate: rateOf(winnerRow.player),
          isGuest: winnerRow.is_guest === true,
        },
        loser: {
          name: loserRow.player, grade: loserRow.grade_at_date,
          leagueTier: leagueMap[loserRow.player], winRate: rateOf(loserRow.player),
          isGuest: loserRow.is_guest === true,
        },
      }, pointRules);
    }
  }

  const finalLeague = deriveLeagueForDate({ rows: singles, dateISO: asOfDate, roster: list });
  return [...acc.values()]
    .map(x => ({ ...x, leagueTier: finalLeague[x.name] }))
    .sort((a, b) => b.rate - a.rate || b.wins - a.wins || String(a.name).localeCompare(String(b.name), 'ko'));
}

export function buildPlayerSummary({ rows, player }) {
  const mine = (rows || []).filter(r => r.player === player);
  const blank = () => ({ games: 0, wins: 0, losses: 0, rate: 0 });
  const out = {
    singles: blank(), doubles: blank(),
    attendanceDates: 0,
    aces: 0, doubleFaults: 0, tbPlayed: 0, tbWon: 0, bagelsTaken: 0, bagelsGiven: 0,
  };
  const dates = new Set();

  for (const r of mine) {
    dates.add(r.date);
    out.aces += Number(r.aces) || 0;
    out.doubleFaults += Number(r.double_faults) || 0;
    out.tbPlayed += Number(r.tb_played) || 0;
    out.tbWon += Number(r.tb_won) || 0;
    out.bagelsTaken += Number(r.bagels_taken) || 0;
    out.bagelsGiven += Number(r.bagels_given) || 0;

    const bucket = r.format === '복식' ? out.doubles : out.singles;
    bucket.games++;
    if (r.result === '승') bucket.wins++;
    else if (r.result === '패') bucket.losses++;
  }

  for (const b of [out.singles, out.doubles]) b.rate = b.games > 0 ? b.wins / b.games : 0;
  out.attendanceDates = dates.size;
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/tennis/__tests__/tennisStandings.test.js`
Expected: PASS (2 suites, 10 tests)

- [ ] **Step 5: `TennisTabs.jsx`에 랭킹/개인기록 탭 채우기**

`TennisTabs`에 데이터 로드와 두 탭을 추가한다:

```jsx
import { useEffect, useState, useMemo } from 'react';
import TennisSync from '../../services/tennisSync';
import { buildSinglesStandings, buildPlayerSummary } from '../../utils/tennis/tennisStandings';

// ... 기존 signature에 authUserName 추가
export default function TennisTabs({ activeTab, pendingGames, onStartGame, onContinueGame, authUserName, C }) {
  const [rows, setRows] = useState([]);
  const [roster, setRoster] = useState([]);

  useEffect(() => {
    TennisSync.getPlayerGames().then(setRows);
    TennisSync.getRoster().then(setRoster);
  }, []);

  const today = new Date().toISOString().slice(0, 10);
  const standings = useMemo(
    () => buildSinglesStandings({ rows, roster, asOfDate: today }),
    [rows, roster, today]);

  if (activeTab === 'games') { /* Task 12의 기존 블록 그대로 */ }

  if (activeTab === 'records') {
    return (
      <div style={{ padding: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>길로틴리그 (단식 승률)</div>
        <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ color: C.gray, fontSize: 10.5 }}>
              <th style={{ textAlign: 'left' }}>#</th><th style={{ textAlign: 'left' }}>이름</th>
              <th>리그</th><th>등급</th><th>전적</th><th>승률</th><th>P</th>
            </tr>
          </thead>
          <tbody>
            {standings.map((s, i) => (
              <tr key={s.name} style={{ borderTop: `1px solid ${C.grayDarker}` }}>
                <td>{i + 1}</td>
                <td style={{ fontWeight: 600 }}>{s.name}</td>
                <td style={{ textAlign: 'center', fontSize: 10 }}>{s.leagueTier === '흑기사' ? 'BK' : 'BR'}</td>
                <td style={{ textAlign: 'center', fontSize: 10, color: C.gray }}>{s.grade}</td>
                <td style={{ textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>{s.wins}-{s.losses}</td>
                <td style={{ textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>
                  {s.games > 0 ? `${Math.round(s.rate * 100)}%` : '-'}
                </td>
                <td style={{ textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>{s.points}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (activeTab === 'roster') {
    const me = buildPlayerSummary({ rows, player: authUserName });
    const Stat = ({ label, value }) => (
      <div style={{ flex: 1, textAlign: 'center' }}>
        <div style={{ fontSize: 10, color: C.gray }}>{label}</div>
        <div style={{ fontSize: 18, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      </div>
    );
    return (
      <div style={{ padding: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>{authUserName} 전적</div>
        <div style={{ display: 'flex', marginBottom: 12 }}>
          <Stat label="단식" value={`${me.singles.wins}-${me.singles.losses}`} />
          <Stat label="복식" value={`${me.doubles.wins}-${me.doubles.losses}`} />
          <Stat label="출석" value={`${me.attendanceDates}일`} />
        </div>
        <div style={{ display: 'flex' }}>
          <Stat label="에이스" value={me.aces} />
          <Stat label="더블폴트" value={me.doubleFaults} />
          <Stat label="타이브레이크" value={`${me.tbWon}/${me.tbPlayed}`} />
          <Stat label="베이글" value={`${me.bagelsGiven}/${me.bagelsTaken}`} />
        </div>
      </div>
    );
  }

  return <div style={{ padding: 20, textAlign: 'center', color: C.gray, fontSize: 12 }}>준비 중</div>;
}
```

`TeamDashboard.jsx`의 `<TennisTabs ... />` 호출은 Task 12에서 이미 `authUserName={authUser?.name}`를 넘기고 있으므로 **그대로 두면 된다.** 이 태스크에선 `TennisTabs.jsx`만 수정한다.

- [ ] **Step 6: 전체 검증 + 브라우저 스모크**

Run: `npm test && npm run build && npm run lint`
Expected: 전부 통과

브라우저에서 확인:
1. 테니스 대시보드 탭 → 길로틴리그 순위표가 뜨는지
2. Task 12에서 마감한 경기가 순위에 반영됐는지
3. 개인기록 탭에 본인 전적·출석·에이스/DF/타이브레이크/베이글이 뜨는지
4. **풋살 팀으로 전환했을 때 기존 화면이 그대로인지**

- [ ] **Step 7: Commit**

```bash
git add src/utils/tennis/tennisStandings.js src/utils/tennis/__tests__/tennisStandings.test.js src/components/tennis/TennisTabs.jsx src/components/dashboard/TeamDashboard.jsx
git commit -m "feat(tennis): 단식 승률 랭킹 + 개인 전적 요약

순위는 승률, 포인트는 별도 컬럼. 리그/승률은 경기일 직전 값으로 파생해
같은 판의 양쪽 행을 짝지어 포인트를 적립한다."
```

---

## 완료 기준

1차가 끝났다고 말하려면 아래가 전부 참이어야 한다.

- [ ] `npm test` 통과 — 신규 테스트 + **기존 풋살/축구 테스트 전부**
- [ ] `npm run build`, `npm run lint` 통과
- [ ] 브라우저에서 풋살 팀 대시보드·경기 화면이 예전 그대로
- [ ] 테니스 팀으로 경기 생성 → 라운드/코트 구성 → 점수 기록 → 마감 → 시트 2종에 행 도착
- [ ] 5:5 타이브레이크 전환과 판 종료 되돌리기가 손으로 확인됨
- [ ] 스프레드시트에서 `로그_테니스매치` 21칸, `로그_테니스선수경기` 29칸이 헤더 순서대로 채워짐

## 1차에 넣지 않은 것 (2차)

파트너 케미, 상대전적, 월별 폼 그래프, 타이브레이크/에이스/DF 심층 분석, 베이글 랭킹 카드, 포인트 랭킹 화면, 연령대 분석. **로그 스키마는 이미 이들을 계산할 수 있게 완성돼 있으므로 시트 마이그레이션 없이 화면만 추가하면 된다.**

## 미확정 (구현 중 막히면 유저에게 물을 것)

- **등급 2단계 이상 차이의 포인트** — 기본값은 "차이 무관 5점". `SPORT_DEFAULTS.테니스.pointRules.gradeUpsetPerStep`을 켜면 단계당 가산으로 바뀐다. 의뢰인 확인 후 설정만 바꾸면 된다.
- **2026 기존 기록지** — 있으면 `테니스_회원명부`의 `시즌시작순위`를 채운다. 비어 있으면 전원 동일 리그로 시작한다.
