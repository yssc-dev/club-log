# 축구 경기별 역할 지정 (영상촬영 · 주심 · 부심) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 하버FC 축구 경기 단위로 영상촬영(복수) · 주심(1명) · 부심(2명)을 지정하고, RTDB 로 실시간 공유하고, 로그_매치 `roles_json` 열에 적재해 분석 탭 「역할 기록」 표에서 사람별 횟수를 본다.

**Architecture:** 경기 객체(`soccerMatches[i]`) 안에 `roles` 필드 하나를 추가한다. `soccerMatches` 는 이미 `CHILD_NODE_FIELDS` 라서 실시간 동기화 등록 작업이 없다. RTDB 가 빈 배열을 저장하지 않는 함정은 **읽기 전용 순수 접근자 `readRoles` 단일 소스**로 막는다 — `normalizeSoccerMatch` 는 실시간 경로만 커버하고 아카이브 경로(`loadFinalizedOne`)는 `reconstructState` 를 타지 않기 때문이다. 시트는 열 1개(`roles_json`)만 끝에 추가한다.

**Tech Stack:** React 19, Vite, vitest (jsdom), Firebase RTDB, Google Apps Script

**Spec:** `docs/superpowers/specs/2026-10-07-soccer-match-roles-design.md`

## Global Constraints

- **용어는 「영상촬영」** 이다. "촬영감독" 이라는 문자열을 코드 · UI · 테스트 어디에도 쓰지 않는다.
- **인원 제약**: 영상촬영 제한 없음 / 주심 0~1명 / 부심 0~2명. 모든 역할 공석 가능.
- **겸임 규칙**: 주심 ↔ 부심만 상호 배타. 영상촬영은 주심 · 부심과 겸임 허용.
- **적용 범위는 하버FC 축구 경로(`SoccerApp` → `SoccerMatchView`)만.** `IntraSoccerApp` / `IntraSoccerMatchView`(빅마스터FC 자체전), 풋살, 테니스는 **한 줄도 바꾸지 않는다.**
- **`src/utils/analyticsV2/` (풋살 분석 계산층)은 건드리지 않는다.** 축구 지표는 `src/utils/soccerAnalytics/` 만 수정한다.
- **`RAW_MATCH_COLUMNS` 와 `RAW_MATCHES_HEADERS` 는 열을 반드시 맨 끝에 추가한다.** 기존 열 위치가 밀리면 Apps Script 하드코딩 순서(`_rawMatchToArray` / `_getRawMatches`)와 어긋나 기존 데이터 전체가 오독된다.
- **`roles` 읽기는 전부 `readRoles()` 경유.** 호출부에 `|| []` / `?.` 를 흩뿌리지 않는다.
- **테스트 하네스**: 이 레포에 `@testing-library/react` 가 **없다.** 상호작용 테스트는 `act` + `createRoot`(`IntraSoccerMatchView.smoke.test.jsx` 패턴), 표시 전용은 `renderToStaticMarkup`(`analyticsTabs.smoke.test.jsx` 패턴).
- 전체 테스트: `npx vitest run`. 린트: `npm run lint`. 빌드: `npm run build`.

## File Structure

| 파일 | 책임 | 작업 |
|---|---|---|
| `src/utils/soccerRoles.js` | 역할 순수 함수 3개 (`readRoles` / `serializeRoles` / `parseRoles`) | 신규 |
| `src/utils/__tests__/soccerRoles.test.js` | 위 3함수 테스트 | 신규 |
| `src/hooks/useGameReducer.js` | `SET_SOCCER_MATCH_ROLES` 액션 | 수정 |
| `src/hooks/__tests__/useGameReducer.roles.test.js` | 리듀서 격리 테스트 | 신규 |
| `src/services/firebaseSyncDiff.js` | `normalizeSoccerMatch` 에 `roles` 정규화 | 수정 |
| `src/services/__tests__/firebaseSyncDiff.roles.test.js` | 전파 + 빈배열 복원 테스트 | 신규 |
| `src/components/game/MatchRolesModal.jsx` | 역할 지정 모달 본문 | 신규 |
| `src/components/game/__tests__/MatchRolesModal.test.jsx` | 모달 실렌더 + 클릭 규칙 | 신규 |
| `src/components/game/SoccerMatchView.jsx` | 버튼 · 모달 연결 · 종료 노드 읽기전용 줄 | 수정 |
| `src/SoccerApp.jsx` | `setSoccerMatchRoles` 핸들러 배선 | 수정 |
| `src/utils/matchRowBuilder.js` | `RAW_MATCH_COLUMNS` + `roles_json` 직렬화 | 수정 |
| `src/utils/__tests__/matchRowBuilder.roles.test.js` | 시트 행 빌더 테스트 | 신규 |
| `apps-script/Code.js` | 헤더 · `_rawMatchToArray` · changelog | 수정 |
| `src/utils/soccerAnalytics/calcRoleCounts.js` | 사람별 역할 횟수 집계 | 신규 |
| `src/utils/soccerAnalytics/index.js` | barrel export 1줄 | 수정 |
| `src/utils/soccerAnalytics/__tests__/calcRoleCounts.test.js` | 집계 테스트 | 신규 |
| `src/components/dashboard/analytics/RoleRecordTab.jsx` | 「역할 기록」 정렬 표 | 신규 |
| `src/components/dashboard/analytics/__tests__/RoleRecordTab.test.jsx` | 렌더 스모크 | 신규 |
| `src/components/dashboard/PlayerAnalytics.jsx` | 축구 전용 `역할` 서브탭 | 수정 |

**의존 순서:** Task 1(순수 함수) → Task 2(리듀서) → Task 3(동기화) → Task 4(모달) → Task 5(화면 연결) → Task 6(시트) → Task 7(Apps Script) → Task 8(집계) → Task 9(분석 표·탭)

---

### Task 1: 역할 순수 함수 (`soccerRoles.js`)

**Files:**
- Create: `src/utils/soccerRoles.js`
- Test: `src/utils/__tests__/soccerRoles.test.js`

**Interfaces:**
- Consumes: 없음 (의존 없는 순수 모듈)
- Produces:
  - `readRoles(match) → { camera: string[], referee: string, assistants: string[] }`
  - `serializeRoles(roles) → string` — 전원 공석이면 `''`, 아니면 JSON
  - `parseRoles(rolesJson) → { camera: string[], referee: string, assistants: string[] }`
  - `emptyRoles() → { camera: [], referee: '', assistants: [] }` — 호출마다 **새 객체**(공유 상수를 두면 호출부가 push 해서 서로를 오염시킨다)
  - `MAX_ASSISTANTS = 2` — 부심 상한 상수

- [ ] **Step 1: 실패하는 테스트 작성**

`src/utils/__tests__/soccerRoles.test.js` 전체를 이 내용으로 만든다:

```js
// 역할(영상촬영·주심·부심) 순수 함수 테스트.
// 핵심 계약: RTDB 가 빈 배열을 저장하지 않아 어떤 모양으로 와도(undefined / 키 누락 /
// 객체화 {0:'김A'}) readRoles 는 항상 같은 모양을 돌려준다.
import { describe, it, expect } from 'vitest';
import { readRoles, serializeRoles, parseRoles, emptyRoles } from '../soccerRoles';

describe('emptyRoles', () => {
  it('정규형 빈 값을 돌려주고, 호출마다 새 객체다', () => {
    expect(emptyRoles()).toEqual({ camera: [], referee: '', assistants: [] });
    const a = emptyRoles();
    a.camera.push('X');
    expect(emptyRoles().camera).toEqual([]);
  });
});

describe('readRoles', () => {
  it('roles 없는 경기 → 전원 공석', () => {
    expect(readRoles({ matchIdx: 0 })).toEqual({ camera: [], referee: '', assistants: [] });
  });

  it('match 자체가 null/undefined → 전원 공석 (크래시 금지)', () => {
    expect(readRoles(null)).toEqual({ camera: [], referee: '', assistants: [] });
    expect(readRoles(undefined)).toEqual({ camera: [], referee: '', assistants: [] });
  });

  it('RTDB 빈배열 누락 모양({referee}만 도착) → 배열 복원', () => {
    expect(readRoles({ roles: { referee: '박C' } }))
      .toEqual({ camera: [], referee: '박C', assistants: [] });
  });

  it('RTDB 객체화 모양({0:"김A",1:"이B"}) → 배열 복원 (순서 보존)', () => {
    expect(readRoles({ roles: { camera: { 0: '김A', 1: '이B' }, assistants: { 0: '최D' } } }))
      .toEqual({ camera: ['김A', '이B'], referee: '', assistants: ['최D'] });
  });

  it('정상 모양은 그대로', () => {
    const roles = { camera: ['김A'], referee: '박C', assistants: ['최D', '정E'] };
    expect(readRoles({ roles })).toEqual(roles);
  });

  it('falsy 원소(빈 문자열·null)는 걸러낸다', () => {
    expect(readRoles({ roles: { camera: ['김A', '', null], assistants: [] } }))
      .toEqual({ camera: ['김A'], referee: '', assistants: [] });
  });

  it('referee 가 비문자열이면 공석으로 본다', () => {
    expect(readRoles({ roles: { referee: null } }).referee).toBe('');
    expect(readRoles({ roles: { referee: 0 } }).referee).toBe('');
  });

  it('부심은 2명으로 잘라낸다 (상한 방어)', () => {
    expect(readRoles({ roles: { assistants: ['a', 'b', 'c'] } }).assistants).toEqual(['a', 'b']);
  });

  it('반환 배열을 수정해도 원본 match 가 오염되지 않는다', () => {
    const match = { roles: { camera: ['김A'], referee: '', assistants: [] } };
    readRoles(match).camera.push('침입');
    expect(match.roles.camera).toEqual(['김A']);
  });
});

describe('serializeRoles', () => {
  it('전원 공석 → 빈 문자열 (시트에 JSON 도배 방지)', () => {
    expect(serializeRoles({ camera: [], referee: '', assistants: [] })).toBe('');
    expect(serializeRoles(null)).toBe('');
  });

  it('하나라도 있으면 JSON', () => {
    const out = serializeRoles({ camera: ['김A'], referee: '', assistants: [] });
    expect(JSON.parse(out)).toEqual({ camera: ['김A'], referee: '', assistants: [] });
  });

  it('주심만 있어도 JSON', () => {
    expect(JSON.parse(serializeRoles({ camera: [], referee: '박C', assistants: [] })))
      .toEqual({ camera: [], referee: '박C', assistants: [] });
  });
});

describe('parseRoles', () => {
  it('빈값 → 전원 공석', () => {
    expect(parseRoles('')).toEqual({ camera: [], referee: '', assistants: [] });
    expect(parseRoles(null)).toEqual({ camera: [], referee: '', assistants: [] });
    expect(parseRoles(undefined)).toEqual({ camera: [], referee: '', assistants: [] });
  });

  it('깨진 JSON → 전원 공석 (크래시 금지)', () => {
    expect(parseRoles('{nope')).toEqual({ camera: [], referee: '', assistants: [] });
  });

  it('배열 JSON 같은 엉뚱한 타입 → 전원 공석', () => {
    expect(parseRoles('["김A"]')).toEqual({ camera: [], referee: '', assistants: [] });
  });

  it('정상 JSON → 정규형', () => {
    expect(parseRoles('{"camera":["김A","이B"],"referee":"박C","assistants":["최D"]}'))
      .toEqual({ camera: ['김A', '이B'], referee: '박C', assistants: ['최D'] });
  });

  it('serializeRoles 와 왕복한다', () => {
    const roles = { camera: ['김A'], referee: '박C', assistants: ['최D', '정E'] };
    expect(parseRoles(serializeRoles(roles))).toEqual(roles);
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run src/utils/__tests__/soccerRoles.test.js`
Expected: FAIL — `Failed to resolve import "../soccerRoles"`

- [ ] **Step 3: 최소 구현 작성**

`src/utils/soccerRoles.js` 를 이 내용으로 만든다:

```js
// 경기별 역할(영상촬영 · 주심 · 부심) 순수 함수.
//
// ★ 이 모듈이 존재하는 이유: RTDB 는 빈 배열을 저장하지 않고, 비어있지 않은 배열을
//   객체({0:'김A'})로 바꿔 돌려줄 수 있다. 그래서 같은 roles 가 경로에 따라 네 가지
//   모양으로 도착한다. 더 나쁜 것은 아카이브 경로다 — firebaseSync.loadFinalizedOne 은
//   snap.val().state 를 그대로 반환해 reconstructState(=normalizeSoccerMatch)를 타지
//   않으므로, 동기화 쪽 정규화만으로는 보관소 상세가 안 막힌다.
//   따라서 "읽는 쪽은 전부 readRoles 를 경유한다" 를 계약으로 둔다.
//   호출부에 `|| []` 를 흩뿌리지 않는다 — 접근자 1개가 네 경로를 동시에 막는다.
//
// 설계: docs/superpowers/specs/2026-10-07-soccer-match-roles-design.md

export const MAX_ASSISTANTS = 2;

// 정규형 빈 값. 호출마다 새 객체를 만든다 — 상수 하나를 공유하면 호출부가 push 해서
// 다른 호출부를 오염시킨다.
export function emptyRoles() {
  return { camera: [], referee: '', assistants: [] };
}

// RTDB 가 돌려줄 수 있는 모든 모양 → 문자열 배열.
// (배열 / 객체화({0:..}) / undefined), falsy 원소 제거.
function asNameArray(v) {
  const arr = Array.isArray(v) ? v : (v && typeof v === 'object' ? Object.values(v) : []);
  return arr.filter(n => typeof n === 'string' && n !== '');
}

function normalize(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return emptyRoles();
  return {
    camera: asNameArray(raw.camera),
    referee: typeof raw.referee === 'string' ? raw.referee : '',
    assistants: asNameArray(raw.assistants).slice(0, MAX_ASSISTANTS),
  };
}

// 경기 객체 → 정규형 역할. 읽는 쪽의 유일한 입구.
export function readRoles(match) {
  return normalize(match && typeof match === 'object' ? match.roles : null);
}

// 정규형 → 로그_매치 roles_json 값.
// 전원 공석이면 빈 문자열 — 시트가 '{"camera":[],"referee":"","assistants":[]}' 로
// 도배되지 않고, 역할 기능 이전의 레거시 행(빈칸)과 같은 모양이 된다.
export function serializeRoles(roles) {
  const r = normalize(roles);
  if (r.camera.length === 0 && r.referee === '' && r.assistants.length === 0) return '';
  return JSON.stringify(r);
}

// 로그_매치 roles_json → 정규형. 빈값·깨진 JSON·엉뚱한 타입은 전원 공석.
export function parseRoles(rolesJson) {
  if (typeof rolesJson !== 'string' || rolesJson.trim() === '') return emptyRoles();
  try {
    return normalize(JSON.parse(rolesJson));
  } catch {
    return emptyRoles();
  }
}
```

- [ ] **Step 4: 테스트가 통과하는지 확인**

Run: `npx vitest run src/utils/__tests__/soccerRoles.test.js`
Expected: PASS (21 tests)

- [ ] **Step 5: 커밋**

```bash
git add src/utils/soccerRoles.js src/utils/__tests__/soccerRoles.test.js
git commit -m "feat(soccer): 경기 역할 순수 함수 readRoles/serializeRoles/parseRoles

RTDB 빈배열 누락·객체화를 단일 접근자에서 흡수한다. loadFinalizedOne 이
reconstructState 를 안 타므로 normalizeSoccerMatch 만으로는 아카이브
경로가 안 막힌다 — 읽는 쪽은 전부 readRoles 경유가 계약."
```

---

### Task 2: 리듀서 액션 `SET_SOCCER_MATCH_ROLES`

**Files:**
- Modify: `src/hooks/useGameReducer.js` — `SET_SOCCER_MATCH_OPPONENT` case 바로 아래에 추가
- Test: `src/hooks/__tests__/useGameReducer.roles.test.js`

**Interfaces:**
- Consumes: Task 1 의 `readRoles` (정규화 입구)
- Produces: 액션 `{ type: 'SET_SOCCER_MATCH_ROLES', matchIdx, roles }` — `matchIdx` 는 **논리** `m.matchIdx` 값(배열 index 아님), `roles` 는 `{camera, referee, assistants}`

- [ ] **Step 1: 실패하는 테스트 작성**

`src/hooks/__tests__/useGameReducer.roles.test.js` 전체를 이 내용으로 만든다:

```js
// SET_SOCCER_MATCH_ROLES 격리 계약.
// 논리 matchIdx 매칭(배열 index 불변식에 의존하지 않음) + 타 경기·events·status·점수 무변경.
import { describe, it, expect } from 'vitest';
import { gameReducer, initialState } from '../useGameReducer';

const match = (idx, extra = {}) => ({
  matchIdx: idx, opponent: `상대${idx}`, lineup: ['A', 'B'], gk: 'A', defenders: ['B'],
  subs: [], formation: '4-4-2', assignments: { 0: 'A' }, positionMap: { A: 'GK' },
  events: [{ id: `e${idx}`, type: 'goal', player: 'B', timestamp: 100 }],
  startedAt: 1000 + idx, ourScore: 1, opponentScore: 0, status: 'finished', ...extra,
});

const withMatches = (matches) => ({ ...initialState, soccerMatches: matches });

const ROLES = { camera: ['김A', '이B'], referee: '박C', assistants: ['최D'] };

describe('gameReducer — SET_SOCCER_MATCH_ROLES', () => {
  it('해당 경기의 roles 를 설정한다', () => {
    const next = gameReducer(withMatches([match(0), match(1)]), {
      type: 'SET_SOCCER_MATCH_ROLES', matchIdx: 1, roles: ROLES,
    });
    expect(next.soccerMatches[1].roles).toEqual(ROLES);
  });

  it('다른 경기는 건드리지 않는다', () => {
    const s = withMatches([match(0), match(1)]);
    const next = gameReducer(s, { type: 'SET_SOCCER_MATCH_ROLES', matchIdx: 1, roles: ROLES });
    expect(next.soccerMatches[0]).toEqual(s.soccerMatches[0]);
    expect(next.soccerMatches[0].roles).toBeUndefined();
  });

  it('events·status·점수·배치는 보존된다', () => {
    const s = withMatches([match(0)]);
    const next = gameReducer(s, { type: 'SET_SOCCER_MATCH_ROLES', matchIdx: 0, roles: ROLES });
    const m = next.soccerMatches[0];
    expect(m.events).toEqual(s.soccerMatches[0].events);
    expect(m.status).toBe('finished');
    expect(m.ourScore).toBe(1);
    expect(m.assignments).toEqual({ 0: 'A' });
    expect(m.opponent).toBe('상대0');
  });

  it('배열 순서가 matchIdx 와 달라도 논리 matchIdx 로 찾는다', () => {
    // 배열 index 1 에 논리 matchIdx 0 이 있는 뒤집힌 상태
    const next = gameReducer(withMatches([match(1), match(0)]), {
      type: 'SET_SOCCER_MATCH_ROLES', matchIdx: 0, roles: ROLES,
    });
    expect(next.soccerMatches[1].roles).toEqual(ROLES);
    expect(next.soccerMatches[0].roles).toBeUndefined();
  });

  it('없는 matchIdx 면 아무것도 바뀌지 않는다', () => {
    const s = withMatches([match(0)]);
    const next = gameReducer(s, { type: 'SET_SOCCER_MATCH_ROLES', matchIdx: 9, roles: ROLES });
    expect(next.soccerMatches).toEqual(s.soccerMatches);
  });

  it('roles 를 정규화해 저장한다 — 부심 3명은 2명으로, falsy 원소는 제거', () => {
    const next = gameReducer(withMatches([match(0)]), {
      type: 'SET_SOCCER_MATCH_ROLES', matchIdx: 0,
      roles: { camera: ['김A', ''], referee: '박C', assistants: ['a', 'b', 'c'] },
    });
    expect(next.soccerMatches[0].roles)
      .toEqual({ camera: ['김A'], referee: '박C', assistants: ['a', 'b'] });
  });

  it('roles 누락/null 이면 전원 공석으로 저장한다 (undefined 저장 금지)', () => {
    const next = gameReducer(withMatches([match(0)]), {
      type: 'SET_SOCCER_MATCH_ROLES', matchIdx: 0, roles: null,
    });
    expect(next.soccerMatches[0].roles).toEqual({ camera: [], referee: '', assistants: [] });
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run src/hooks/__tests__/useGameReducer.roles.test.js`
Expected: FAIL — 첫 테스트부터 `next.soccerMatches[1].roles` 가 `undefined` (액션이 없으니 리듀서가 state 를 그대로 반환)

- [ ] **Step 3: 최소 구현 작성**

`src/hooks/useGameReducer.js` 상단 import 블록에 추가 (기존 import 들과 같은 자리):

```js
import { readRoles } from '../utils/soccerRoles';
```

그리고 `case 'SET_SOCCER_MATCH_OPPONENT'` 의 `return` 직후, `case 'PATCH_SOCCER_SIDE'` 주석 **앞에** 이 case 를 넣는다:

```js
    // 경기별 역할(영상촬영 · 주심 · 부심). SET_SOCCER_MATCH_OPPONENT 와 같은 규약 —
    // 논리 matchIdx 매칭이라 배열 index 불변식에 의존하지 않고, events/status/점수는
    // 스프레드로 보존한다. readRoles 로 정규화해 저장하므로 undefined/초과 인원이 state 에
    // 들어가지 않는다(= 받는 기기와 시트 빌더가 같은 모양을 본다).
    case 'SET_SOCCER_MATCH_ROLES': {
      const { matchIdx, roles } = action;
      const normalized = readRoles({ roles });
      const matches = state.soccerMatches.map(m =>
        m.matchIdx === matchIdx ? { ...m, roles: normalized } : m
      );
      return { ...state, soccerMatches: matches };
    }
```

- [ ] **Step 4: 테스트가 통과하는지 확인**

Run: `npx vitest run src/hooks/__tests__/useGameReducer.roles.test.js`
Expected: PASS (7 tests)

- [ ] **Step 5: 기존 리듀서 테스트 회귀 확인**

Run: `npx vitest run src/hooks`
Expected: PASS — 기존 축구/풋살 리듀서 테스트 전부 통과

- [ ] **Step 6: 커밋**

```bash
git add src/hooks/useGameReducer.js src/hooks/__tests__/useGameReducer.roles.test.js
git commit -m "feat(soccer): SET_SOCCER_MATCH_ROLES 리듀서 액션

논리 matchIdx 매칭으로 그 경기 roles 만 교체. readRoles 정규화를 거쳐
저장하므로 state 에 undefined/초과 인원이 들어가지 않는다."
```

---

### Task 3: 실시간 동기화 — `normalizeSoccerMatch` 에 roles 추가

**Files:**
- Modify: `src/services/firebaseSyncDiff.js:323-341` (`normalizeSoccerMatch`)
- Test: `src/services/__tests__/firebaseSyncDiff.roles.test.js`

**Interfaces:**
- Consumes: Task 1 의 `readRoles`
- Produces: `reconstructState` 가 돌려주는 모든 경기 객체가 `roles` 정규형을 갖는다. `diffStateToWrites` 는 roles 변경을 `soccerMatches/{idx}/roles` 경로 하나로 쓴다 (기존 자식 키 diff 루프가 이미 처리 — **코드 변경 없음**).

- [ ] **Step 1: 실패하는 테스트 작성**

`src/services/__tests__/firebaseSyncDiff.roles.test.js` 전체를 이 내용으로 만든다:

```js
// 역할의 실시간 공유 계약.
// ① roles 변경이 soccerMatches/{idx}/roles 경로 하나로만 쓰인다(타 경기·이벤트 무영향)
// ② RTDB 가 빈 배열을 드롭한 모양을 되읽어도 reconstructState 가 배열로 복원한다
//    → 이게 없으면 받는 기기가 roles.camera.map 에서 터진다.
import { describe, it, expect } from 'vitest';
import { diffStateToWrites, reconstructState } from '../firebaseSyncDiff';

const match = (idx, extra = {}) => ({
  matchIdx: idx, opponent: `상대${idx}`, lineup: ['A', 'B'], gk: 'A', defenders: ['B'],
  subs: [], formation: '4-4-2', assignments: { 0: 'A' }, positionMap: { A: 'GK' },
  events: [{ id: `e${idx}`, type: 'goal', player: 'B', timestamp: 100 }],
  startedAt: 1000 + idx, ourScore: 1, opponentScore: 0, status: 'finished', ...extra,
});

const ROLES = { camera: ['김A'], referee: '박C', assistants: ['최D'] };

describe('diffStateToWrites — roles 전파', () => {
  it('roles 만 바뀌면 soccerMatches/{idx}/roles 한 경로만 쓴다', () => {
    const prev = { soccerMatches: [match(0), match(1)] };
    const next = { soccerMatches: [match(0), { ...match(1), roles: ROLES }] };
    const writes = diffStateToWrites(prev, next);
    expect(Object.keys(writes)).toEqual(['soccerMatches/1/roles']);
    expect(writes['soccerMatches/1/roles']).toEqual(ROLES);
  });

  it('roles 를 전원 공석으로 비우는 변경도 그 경로 하나로 쓴다', () => {
    const prev = { soccerMatches: [{ ...match(0), roles: ROLES }] };
    const empty = { camera: [], referee: '', assistants: [] };
    const next = { soccerMatches: [{ ...match(0), roles: empty }] };
    const writes = diffStateToWrites(prev, next);
    expect(Object.keys(writes)).toEqual(['soccerMatches/0/roles']);
    expect(writes['soccerMatches/0/roles']).toEqual(empty);
  });

  it('roles 가 같으면 쓰기가 없다 (에코 루프 방지)', () => {
    const prev = { soccerMatches: [{ ...match(0), roles: ROLES }] };
    const next = { soccerMatches: [{ ...match(0), roles: { ...ROLES } }] };
    expect(diffStateToWrites(prev, next)).toEqual({});
  });
});

describe('reconstructState — RTDB 빈배열 드롭 복원', () => {
  const raw = (roles) => ({
    meta: { gameId: 'g_1' },
    soccerMatches: {
      0: {
        matchIdx: 0, opponent: '상대0', status: 'finished', startedAt: 1000,
        events: { e0: { id: 'e0', type: 'goal', player: 'B', timestamp: 100 } },
        ...(roles === undefined ? {} : { roles }),
      },
    },
  });

  it('camera/assistants 가 드롭돼 {referee} 만 와도 배열로 복원한다', () => {
    const st = reconstructState('g_1', raw({ referee: '박C' }));
    expect(st.soccerMatches[0].roles)
      .toEqual({ camera: [], referee: '박C', assistants: [] });
  });

  it('roles 노드가 아예 없어도 정규형을 채운다', () => {
    const st = reconstructState('g_1', raw(undefined));
    expect(st.soccerMatches[0].roles)
      .toEqual({ camera: [], referee: '', assistants: [] });
  });

  it('배열이 객체화({0:..})돼 와도 배열로 복원한다', () => {
    const st = reconstructState('g_1', raw({ camera: { 0: '김A', 1: '이B' }, referee: '' }));
    expect(st.soccerMatches[0].roles.camera).toEqual(['김A', '이B']);
  });

  it('복원 결과는 재전송을 유발하지 않는다 — 같은 state 를 diff 하면 쓰기 0', () => {
    const st = reconstructState('g_1', raw({ referee: '박C' }));
    expect(diffStateToWrites(st, st)).toEqual({});
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run src/services/__tests__/firebaseSyncDiff.roles.test.js`
Expected: `diffStateToWrites` 3건은 PASS(기존 자식 diff 가 이미 처리), `reconstructState` 3건은 FAIL — `roles` 가 `{referee:'박C'}` / `undefined` 그대로 나옴

- [ ] **Step 3: 최소 구현 작성**

`src/services/firebaseSyncDiff.js` 상단 import 블록에 추가:

```js
import { readRoles } from '../utils/soccerRoles';
```

그리고 `normalizeSoccerMatch` 의 반환 객체에 한 줄 추가 (`formation` 줄 다음):

```js
    formation: m.formation || null,
    // 역할(영상촬영·주심·부심) — camera/assistants 는 빈 배열이면 RTDB 가 드롭하므로
    // 여기서 배열로 되살린다. 단, 이것이 유일한 방어선은 아니다:
    // firebaseSync.loadFinalizedOne(아카이브)은 reconstructState 를 타지 않으므로
    // 읽는 쪽은 전부 readRoles 를 경유해야 한다(utils/soccerRoles.js 주석 참고).
    roles: readRoles(m),
```

- [ ] **Step 4: 테스트가 통과하는지 확인**

Run: `npx vitest run src/services/__tests__/firebaseSyncDiff.roles.test.js`
Expected: PASS (7 tests)

- [ ] **Step 5: 기존 동기화 테스트 회귀 확인**

Run: `npx vitest run src/services`
Expected: PASS — `firebaseSyncDiff.test.js`(syncCoverage 가드 포함) 전부 통과

- [ ] **Step 6: 커밋**

```bash
git add src/services/firebaseSyncDiff.js src/services/__tests__/firebaseSyncDiff.roles.test.js
git commit -m "feat(soccer): normalizeSoccerMatch 에 roles 정규화

soccerMatches 가 이미 CHILD_NODE_FIELDS 라 전파 코드 변경은 없다.
RTDB 가 빈 배열을 드롭하는 함정만 단일 지점에서 흡수한다."
```

---

### Task 4: 역할 지정 모달 (`MatchRolesModal`)

**Files:**
- Create: `src/components/game/MatchRolesModal.jsx`
- Test: `src/components/game/__tests__/MatchRolesModal.test.jsx`

**Interfaces:**
- Consumes: Task 1 의 `readRoles` · `MAX_ASSISTANTS`, 기존 `getNonPlayers(match, attendees)` (`src/utils/soccerScoring.js`), 기존 `Modal`(`src/components/common/Modal.jsx`, props `{ onClose, title, children }`)
- Produces: 기본 export 컴포넌트
  ```
  <MatchRolesModal
    match={object}          // 대상 경기 객체
    attendees={string[]}    // 그날 참석자 전원
    onSave={(roles) => void} // { camera, referee, assistants }
    onClose={() => void}
  />
  ```

- [ ] **Step 1: 실패하는 테스트 작성**

`src/components/game/__tests__/MatchRolesModal.test.jsx` 전체를 이 내용으로 만든다:

```jsx
// MatchRolesModal 실렌더(act) — 인원 제약·겸임 규칙·후보 분류 계약.
// 이 레포에는 @testing-library/react 가 없다. IntraSoccerMatchView.smoke.test.jsx 와
// 같은 act + createRoot 하네스를 쓴다(build/vitest 가 못 잡는 마운트 크래시도 함께 커버).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { ThemeProvider } from '../../../hooks/useTheme';
import MatchRolesModal from '../MatchRolesModal';

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (q) => ({ matches: false, media: q, onchange: null, addListener(){}, removeListener(){}, addEventListener(){}, removeEventListener(){}, dispatchEvent(){} }),
});
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// 출전 = A,B / 미출전 = X,Y,Z,W
const MATCH = {
  matchIdx: 0, opponent: '한울', status: 'finished', startedAt: 1,
  lineup: ['A', 'B'], gk: 'A', defenders: ['B'], subs: [],
  assignments: { 0: 'A', 1: 'B' }, events: [],
};
const ATTENDEES = ['A', 'B', 'X', 'Y', 'Z', 'W'];

let container, root;
beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); });
afterEach(async () => { await act(async () => root?.unmount()); root = null; container.remove(); });

async function mount(props = {}) {
  await act(async () => {
    root = createRoot(container);
    root.render(createElement(ThemeProvider, null,
      createElement(MatchRolesModal, {
        match: MATCH, attendees: ATTENDEES, onSave: () => {}, onClose: () => {}, ...props,
      })));
  });
}

const click = async (el) => {
  expect(el, '클릭 대상 엘리먼트를 찾지 못했다').toBeTruthy();
  await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
};
// 섹션(data-role="camera"|"referee"|"assistants") 안에서 이름 칩 버튼을 찾는다
const chip = (role, name) =>
  [...container.querySelectorAll(`[data-role="${role}"] button[data-name]`)]
    .find(b => b.dataset.name === name);
const chipsOf = (role) =>
  [...container.querySelectorAll(`[data-role="${role}"] button[data-name]`)].map(b => b.dataset.name);
const save = () => [...container.querySelectorAll('button')].find(b => b.textContent.includes('저장'));

describe('MatchRolesModal', () => {
  it('세 섹션이 모두 렌더되고 "촬영감독" 문구는 쓰지 않는다', async () => {
    await mount();
    expect(container.textContent).toContain('영상촬영');
    expect(container.textContent).toContain('주심');
    expect(container.textContent).toContain('부심');
    expect(container.textContent).not.toContain('촬영감독');
  });

  it('후보는 참석자 전원이고, 미출전자가 출전자보다 앞에 온다', async () => {
    await mount();
    const names = chipsOf('camera');
    expect(new Set(names)).toEqual(new Set(ATTENDEES));
    expect(names.indexOf('X')).toBeLessThan(names.indexOf('A'));
    expect(names.indexOf('W')).toBeLessThan(names.indexOf('A'));
  });

  it('출전자 칩에는 「출전」 라벨이 붙고, 미출전자에는 없다', async () => {
    await mount();
    expect(chip('camera', 'A').textContent).toContain('출전');
    expect(chip('camera', 'X').textContent).not.toContain('출전');
  });

  it('출전자도 선택할 수 있다 (후반 교체 투입 대비 — 막지 않는다)', async () => {
    const onSave = vi.fn();
    await mount({ onSave });
    await click(chip('referee', 'A'));
    await click(save());
    expect(onSave).toHaveBeenCalledWith({ camera: [], referee: 'A', assistants: [] });
  });

  it('영상촬영은 여러 명 토글된다', async () => {
    const onSave = vi.fn();
    await mount({ onSave });
    await click(chip('camera', 'X'));
    await click(chip('camera', 'Y'));
    await click(chip('camera', 'Z'));
    await click(save());
    expect(onSave.mock.calls[0][0].camera).toEqual(['X', 'Y', 'Z']);
  });

  it('영상촬영 재탭은 해제다', async () => {
    const onSave = vi.fn();
    await mount({ onSave });
    await click(chip('camera', 'X'));
    await click(chip('camera', 'X'));
    await click(save());
    expect(onSave.mock.calls[0][0].camera).toEqual([]);
  });

  it('주심은 1명 — 다른 사람 탭은 교체', async () => {
    const onSave = vi.fn();
    await mount({ onSave });
    await click(chip('referee', 'X'));
    await click(chip('referee', 'Y'));
    await click(save());
    expect(onSave.mock.calls[0][0].referee).toBe('Y');
  });

  it('주심 본인 재탭은 공석', async () => {
    const onSave = vi.fn();
    await mount({ onSave });
    await click(chip('referee', 'X'));
    await click(chip('referee', 'X'));
    await click(save());
    expect(onSave.mock.calls[0][0].referee).toBe('');
  });

  it('부심은 2명까지 — 세 번째는 차단되고 안내가 보인다', async () => {
    const onSave = vi.fn();
    await mount({ onSave });
    await click(chip('assistants', 'X'));
    await click(chip('assistants', 'Y'));
    await click(chip('assistants', 'Z'));
    expect(container.textContent).toContain('부심은 2명까지');
    await click(save());
    expect(onSave.mock.calls[0][0].assistants).toEqual(['X', 'Y']);
  });

  it('부심 재탭은 해제이고, 해제 후에는 다시 넣을 수 있다', async () => {
    const onSave = vi.fn();
    await mount({ onSave });
    await click(chip('assistants', 'X'));
    await click(chip('assistants', 'Y'));
    await click(chip('assistants', 'X'));
    await click(chip('assistants', 'Z'));
    await click(save());
    expect(onSave.mock.calls[0][0].assistants).toEqual(['Y', 'Z']);
  });

  it('주심을 부심으로 탭하면 주심에서 빠지고 부심으로 이동한다', async () => {
    const onSave = vi.fn();
    await mount({ onSave });
    await click(chip('referee', 'X'));
    await click(chip('assistants', 'X'));
    await click(save());
    const roles = onSave.mock.calls[0][0];
    expect(roles.referee).toBe('');
    expect(roles.assistants).toEqual(['X']);
  });

  it('부심을 주심으로 탭하면 부심에서 빠지고 주심으로 이동한다', async () => {
    const onSave = vi.fn();
    await mount({ onSave });
    await click(chip('assistants', 'X'));
    await click(chip('assistants', 'Y'));
    await click(chip('referee', 'X'));
    await click(save());
    const roles = onSave.mock.calls[0][0];
    expect(roles.referee).toBe('X');
    expect(roles.assistants).toEqual(['Y']);
  });

  it('영상촬영은 주심과 겸임 허용 — 서로 밀어내지 않는다', async () => {
    const onSave = vi.fn();
    await mount({ onSave });
    await click(chip('camera', 'X'));
    await click(chip('referee', 'X'));
    await click(save());
    const roles = onSave.mock.calls[0][0];
    expect(roles.camera).toEqual(['X']);
    expect(roles.referee).toBe('X');
  });

  it('기존 roles 를 초기값으로 띄운다 (RTDB 드롭 모양도 안전)', async () => {
    const onSave = vi.fn();
    await mount({ match: { ...MATCH, roles: { referee: 'Z' } }, onSave });
    await click(save());
    expect(onSave).toHaveBeenCalledWith({ camera: [], referee: 'Z', assistants: [] });
  });

  it('저장하면 onClose 도 호출된다', async () => {
    const onClose = vi.fn();
    await mount({ onClose });
    await click(save());
    expect(onClose).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run src/components/game/__tests__/MatchRolesModal.test.jsx`
Expected: FAIL — `Failed to resolve import "../MatchRolesModal"`

- [ ] **Step 3: 최소 구현 작성**

`src/components/game/MatchRolesModal.jsx` 를 이 내용으로 만든다:

```jsx
import { useState } from 'react';
import { useTheme } from '../../hooks/useTheme';
import Modal from '../common/Modal';
import { readRoles, MAX_ASSISTANTS } from '../../utils/soccerRoles';
import { getNonPlayers } from '../../utils/soccerScoring';

// 경기별 역할 지정 — 영상촬영(복수) · 주심(1) · 부심(2). 전부 공석 가능.
//
// 후보는 참석자 전원이다. getNonPlayers 는 '경기 전체 기준' 미출전자라서, 전반에 심판 보다가
// 후반 교체 투입된 사람이 후보에서 사라진다. 그래서 미출전자를 앞에 두고 출전자는 「출전」
// 라벨만 달아 뒤에 두되, 선택은 막지 않는다(사용자 결정).
//
// 겸임 규칙: 주심 ↔ 부심만 상호 배타(한쪽을 누르면 다른 쪽에서 빠진다).
// 영상촬영은 심판과 겸임 허용 — 한 명이 찍으면서 주심 보는 경우가 실제로 있다.
//
// 설계: docs/superpowers/specs/2026-10-07-soccer-match-roles-design.md
export default function MatchRolesModal({ match, attendees, onSave, onClose }) {
  const { C } = useTheme();
  const initial = readRoles(match);
  const [camera, setCamera] = useState(initial.camera);
  const [referee, setReferee] = useState(initial.referee);
  const [assistants, setAssistants] = useState(initial.assistants);
  const [notice, setNotice] = useState('');

  // 후보 정렬: 미출전자 먼저, 각 그룹은 참석자 순서 유지.
  const nonPlayers = new Set(getNonPlayers(match, attendees || []));
  const candidates = [
    ...(attendees || []).filter(n => nonPlayers.has(n)),
    ...(attendees || []).filter(n => !nonPlayers.has(n)),
  ];

  const toggleCamera = (name) => {
    setNotice('');
    setCamera(prev => prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name]);
  };

  const toggleReferee = (name) => {
    setNotice('');
    setReferee(prev => (prev === name ? '' : name));
    // 주심으로 올리면 부심에서 빼준다(상호 배타)
    setAssistants(prev => (referee === name ? prev : prev.filter(n => n !== name)));
  };

  const toggleAssistant = (name) => {
    setNotice('');
    if (assistants.includes(name)) {
      setAssistants(assistants.filter(n => n !== name));
      return;
    }
    if (assistants.length >= MAX_ASSISTANTS) {
      setNotice(`부심은 ${MAX_ASSISTANTS}명까지입니다. 먼저 한 명을 해제하세요.`);
      return;
    }
    setAssistants([...assistants, name]);
    if (referee === name) setReferee(''); // 부심으로 내리면 주심에서 뺀다(상호 배타)
  };

  const handleSave = () => {
    onSave?.({ camera, referee, assistants });
    onClose?.();
  };

  const isOn = (role, name) =>
    role === 'camera' ? camera.includes(name)
    : role === 'referee' ? referee === name
    : assistants.includes(name);

  const onTap = (role, name) =>
    role === 'camera' ? toggleCamera(name)
    : role === 'referee' ? toggleReferee(name)
    : toggleAssistant(name);

  const section = (role, label, hint) => (
    <div data-role={role} style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: C.white, marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 10, color: C.gray, marginBottom: 6 }}>{hint}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {candidates.map(name => {
          const on = isOn(role, name);
          const played = !nonPlayers.has(name);
          return (
            <button key={name} data-name={name} onClick={() => onTap(role, name)}
              style={{
                padding: '6px 10px', borderRadius: 999, fontSize: 12, cursor: 'pointer',
                background: on ? C.accent : 'transparent',
                color: on ? C.black : (played ? C.gray : C.white),
                border: `1px solid ${on ? C.accent : C.grayDarker}`,
                opacity: played && !on ? 0.55 : 1,
              }}>
              {name}{played ? ' · 출전' : ''}
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <Modal onClose={onClose} title={`제${(match?.matchIdx ?? 0) + 1}경기 역할 지정`}>
      {section('camera', '🎥 영상촬영', '여러 명 지정 가능 · 공석 가능')}
      {section('referee', '🧑‍⚖️ 주심', '1명 · 공석 가능 · 부심과 겸임 불가')}
      {section('assistants', '🚩 부심', `${MAX_ASSISTANTS}명까지 · 공석 가능 · 주심과 겸임 불가`)}

      {notice && (
        <div style={{ fontSize: 11, color: C.orange, marginBottom: 10 }}>{notice}</div>
      )}

      <button onClick={handleSave}
        style={{
          width: '100%', padding: '12px 0', borderRadius: 10, border: 'none',
          background: C.accent, color: C.black, fontSize: 14, fontWeight: 700, cursor: 'pointer',
        }}>
        저장
      </button>
    </Modal>
  );
}
```

- [ ] **Step 4: 테스트가 통과하는지 확인**

Run: `npx vitest run src/components/game/__tests__/MatchRolesModal.test.jsx`
Expected: PASS (15 tests)

**만약 「주심을 부심으로 탭하면 이동」 테스트가 실패하면**: `toggleReferee` 의 `setAssistants` 가 `referee` 상태 변수를 클로저로 읽는다. 위 구현은 `referee === name` 비교로 "해제 중인가"를 먼저 판정하므로 맞지만, 순서를 바꾸면 깨진다 — 그대로 두라.

- [ ] **Step 5: 린트 확인**

Run: `npm run lint`
Expected: 통과 (새 파일에 경고 없음)

- [ ] **Step 6: 커밋**

```bash
git add src/components/game/MatchRolesModal.jsx src/components/game/__tests__/MatchRolesModal.test.jsx
git commit -m "feat(soccer): 역할 지정 모달 — 영상촬영(복수)/주심(1)/부심(2)

후보는 참석자 전원. getNonPlayers 가 경기 전체 기준이라 후반 교체 투입자가
후보에서 사라지므로, 미출전자를 앞에 두고 출전자는 라벨만 달아 막지 않는다.
주심↔부심만 상호 배타, 영상촬영은 겸임 허용."
```

---

### Task 5: 경기화면 연결 (`SoccerMatchView` + `SoccerApp`)

**Files:**
- Modify: `src/components/game/SoccerMatchView.jsx` — import, `rolesModalIdx` state, 버튼, 모달 렌더, 종료 노드 읽기전용 줄, props
- Modify: `src/SoccerApp.jsx` — `setSoccerMatchRoles` 핸들러 + prop 전달
- Test: `src/components/game/__tests__/SoccerMatchView.roles.test.jsx`

**Interfaces:**
- Consumes: Task 2 의 `SET_SOCCER_MATCH_ROLES`, Task 4 의 `MatchRolesModal`, Task 1 의 `readRoles`
- Produces: `SoccerMatchView` 가 새 prop `onSetMatchRoles(matchIdx, roles)` 를 받는다

- [ ] **Step 1: 실패하는 테스트 작성**

`src/components/game/__tests__/SoccerMatchView.roles.test.jsx` 전체를 이 내용으로 만든다:

```jsx
// SoccerMatchView 역할 지정 버튼·모달·읽기전용 표시 계약(act 실렌더).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { ThemeProvider, useTheme } from '../../../hooks/useTheme';
import { makeStyles } from '../../../styles/theme';
import SoccerMatchView from '../SoccerMatchView';

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (q) => ({ matches: false, media: q, onchange: null, addListener(){}, removeListener(){}, addEventListener(){}, removeEventListener(){}, dispatchEvent(){} }),
});
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const ATTENDEES = ['A', 'B', 'X', 'Y', 'Z'];
const finished = (extra = {}) => ({
  matchIdx: 0, opponent: '한울', status: 'finished', startedAt: 1,
  lineup: ['A', 'B'], gk: 'A', defenders: ['B'], subs: [],
  formation: '4-4-2', assignments: { 0: 'A', 1: 'B' }, positionMap: { A: 'GK', B: 'DF' },
  events: [], ourScore: 0, opponentScore: 0, ...extra,
});
const rest = { ...finished(), opponent: '휴식' };

function Harness(props) {
  const { C } = useTheme();
  return createElement(SoccerMatchView, { styles: makeStyles(C), ...props });
}

const noop = () => {};
const BASE = {
  soccerMatches: [finished()], currentMatchIdx: -1, attendees: ATTENDEES, opponents: ['한울'],
  onCreateMatch: noop, onAddEvent: noop, onDeleteEvent: noop, onFinishMatch: noop,
  onUpdateMatchFormation: noop, onReopenMatch: noop, onCreateRestMatch: noop,
  onAddOpponent: noop, onRemoveOpponent: noop, onRenameOpponent: noop, onGoToSummary: noop,
  gameSettings: {}, savedFormation: null, onFormationChange: noop,
  onSetMatchOpponent: noop, onCorrectLineup: noop, onSwapLineupPositions: noop,
  gameFinalized: false, onSetMatchRoles: noop,
};

let container, root;
beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); });
afterEach(async () => { await act(async () => root?.unmount()); root = null; container.remove(); });

async function mount(props = {}) {
  await act(async () => {
    root = createRoot(container);
    root.render(createElement(ThemeProvider, null, createElement(Harness, { ...BASE, ...props })));
  });
}
const click = async (el) => {
  expect(el, '클릭 대상 엘리먼트를 찾지 못했다').toBeTruthy();
  await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
};
const btn = (t) => [...container.querySelectorAll('button')].find(b => b.textContent.includes(t));

describe('SoccerMatchView — 역할 지정', () => {
  it('종료된 경기 노드에 역할 지정 버튼이 있다', async () => {
    await mount();
    expect(btn('역할 지정')).toBeTruthy();
  });

  it('휴식 경기에는 역할 지정 버튼이 없다', async () => {
    await mount({ soccerMatches: [rest] });
    expect(btn('역할 지정')).toBeFalsy();
  });

  it('경기가 없으면(새 경기 노드) 역할 지정 버튼이 없다', async () => {
    await mount({ soccerMatches: [] });
    expect(btn('역할 지정')).toBeFalsy();
  });

  it('버튼을 누르면 모달이 열린다', async () => {
    await mount();
    await click(btn('역할 지정'));
    expect(container.textContent).toContain('제1경기 역할 지정');
    expect(container.textContent).toContain('영상촬영');
  });

  it('모달에서 저장하면 논리 matchIdx 와 함께 onSetMatchRoles 가 호출된다', async () => {
    const onSetMatchRoles = vi.fn();
    await mount({ onSetMatchRoles });
    await click(btn('역할 지정'));
    const refChip = [...container.querySelectorAll('[data-role="referee"] button[data-name]')]
      .find(b => b.dataset.name === 'X');
    await click(refChip);
    await click(btn('저장'));
    expect(onSetMatchRoles).toHaveBeenCalledWith(0, { camera: [], referee: 'X', assistants: [] });
  });

  it('종료 노드에 역할이 읽기전용으로 표시된다', async () => {
    await mount({
      soccerMatches: [finished({ roles: { camera: ['X', 'Y'], referee: 'Z', assistants: ['A'] } })],
    });
    expect(container.textContent).toContain('X, Y');
    expect(container.textContent).toContain('Z');
  });

  it('역할이 전부 공석이면 — 로 표시한다 (RTDB 드롭 모양도 안전)', async () => {
    await mount({ soccerMatches: [finished({ roles: { referee: '' } })] });
    expect(container.textContent).toContain('영상촬영');
    expect(container.textContent).toContain('—');
  });

  it('마감된 경기에서 버튼을 누르면 confirm 을 띄우고, 취소하면 모달이 안 열린다', async () => {
    const spy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    await mount({ gameFinalized: true });
    await click(btn('역할 지정'));
    expect(spy).toHaveBeenCalled();
    expect(spy.mock.calls[0][0]).toContain('재전송');
    expect(container.textContent).not.toContain('제1경기 역할 지정');
    spy.mockRestore();
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run src/components/game/__tests__/SoccerMatchView.roles.test.jsx`
Expected: FAIL — `btn('역할 지정')` 이 `undefined`

- [ ] **Step 3: `SoccerMatchView.jsx` 수정**

(a) import 블록에 2줄 추가:

```jsx
import MatchRolesModal from './MatchRolesModal';
import { readRoles } from '../../utils/soccerRoles';
```

(b) props 구조분해에 `onSetMatchRoles` 추가 — `onSetMatchOpponent, onCorrectLineup, onSwapLineupPositions, gameFinalized,` 줄을 이것으로 교체:

```jsx
  onSetMatchOpponent, onCorrectLineup, onSwapLineupPositions, gameFinalized, onSetMatchRoles,
```

(c) `lineupEditIdx` state 선언 바로 아래에 추가:

```jsx
  const [rolesModalIdx, setRolesModalIdx] = useState(null);      // 역할 지정 모달 대상 matchIdx
```

(d) `openLineupEditor` 함수 정의 바로 아래에 추가:

```jsx
  // 역할 지정 모달. Modal 오버레이라 진행 중 경기의 FormationRecorder 가 언마운트되지 않으므로
  // navLocked(골 입력 중) 차단이 필요 없다 — 「상대팀 변경」과 같은 규칙.
  const openRolesModal = () => {
    if (!node) return;
    if (gameFinalized && !confirm("이미 구글시트로 전송(마감)된 경기입니다.\n로그_매치는 중복 전송을 차단하므로 역할을 바꿔도 '수정 후 재전송'으로는 시트가 갱신되지 않습니다.\n시트까지 고치려면 설정 화면에서 그 날짜의 로그_매치를 삭제한 뒤 재전송해야 합니다.\n계속하시겠습니까?")) return;
    setRolesModalIdx(node.matchIdx);
  };
```

(e) 상단 버튼 줄 — `🔁 출전 수정` 버튼 **앞에** 이 버튼을 넣는다:

```jsx
          <button onClick={openRolesModal}
            style={{ fontSize: 12, padding: "5px 12px", borderRadius: 8, background: C.grayDark, color: C.white, border: "none", cursor: "pointer" }}>
            🎥 역할 지정
          </button>
```

(f) 종료/휴식 노드의 읽기전용 표시 — 스코어 카드(`csPlayers.length > 0 && ...` 줄) **다음**, 닫는 `</div>` 앞에 넣는다:

```jsx
              {!isRest && (() => {
                const r = readRoles(node);
                const or = (v) => (v && v.length ? (Array.isArray(v) ? v.join(", ") : v) : "—");
                return (
                  <div style={{ fontSize: 11, color: C.grayLight, marginTop: 8, lineHeight: 1.7 }}>
                    🎥 영상촬영: {or(r.camera)} · 🧑‍⚖️ 주심: {or(r.referee)} · 🚩 부심: {or(r.assistants)}
                  </div>
                );
              })()}
```

(g) 상대팀 변경 모달 렌더 **다음**, 컴포넌트 닫는 `</div>` 앞에 모달을 추가:

```jsx
      {/* 역할 지정 모달 — 논리 matchIdx 로 저장 */}
      {rolesModalIdx !== null && (() => {
        const m = soccerMatches.find(x => x.matchIdx === rolesModalIdx);
        if (!m) return null;
        return (
          <MatchRolesModal
            match={m} attendees={attendees}
            onSave={(roles) => onSetMatchRoles?.(m.matchIdx, roles)}
            onClose={() => setRolesModalIdx(null)}
          />
        );
      })()}
```

- [ ] **Step 4: `SoccerApp.jsx` 수정**

`setSoccerMatchOpponent` 함수 정의 바로 아래에 추가:

```jsx
  const setSoccerMatchRoles = (matchIdx, roles) => {
    dispatch({ type: 'SET_SOCCER_MATCH_ROLES', matchIdx, roles });
  };
```

그리고 `SoccerMatchView` 의 `onSetMatchOpponent={setSoccerMatchOpponent}` 줄 다음에 추가:

```jsx
            onSetMatchRoles={setSoccerMatchRoles}
```

- [ ] **Step 5: 테스트가 통과하는지 확인**

Run: `npx vitest run src/components/game/__tests__/SoccerMatchView.roles.test.jsx`
Expected: PASS (8 tests)

- [ ] **Step 6: 기존 축구 화면 테스트 회귀 확인**

Run: `npx vitest run src/components/game && npm run build`
Expected: 테스트 PASS, 빌드 성공

- [ ] **Step 7: 커밋**

```bash
git add src/components/game/SoccerMatchView.jsx src/SoccerApp.jsx src/components/game/__tests__/SoccerMatchView.roles.test.jsx
git commit -m "feat(soccer): 경기 노드에 역할 지정 버튼·모달·읽기전용 표시 연결

휴식·새 경기 노드에는 안 보인다(기존 canChangeOpponent 조건 공유).
마감 경고는 사실대로: 로그_매치 중복 차단 때문에 재전송으로는 시트가
갱신되지 않고 날짜별 삭제 후 재전송이 필요하다."
```

---

### Task 6: 시트 행 빌더 — `roles_json` 열

**Files:**
- Modify: `src/utils/matchRowBuilder.js` — `RAW_MATCH_COLUMNS` 끝에 1개, `buildRoundRowsFromSoccer` 에 1줄
- Test: `src/utils/__tests__/matchRowBuilder.roles.test.js`

**Interfaces:**
- Consumes: Task 1 의 `readRoles` · `serializeRoles`
- Produces: `RAW_MATCH_COLUMNS` 의 **23번째(마지막)** 원소가 `'roles_json'`. `buildRoundRowsFromSoccer` 의 각 행에 `roles_json` 키.

- [ ] **Step 1: 실패하는 테스트 작성**

`src/utils/__tests__/matchRowBuilder.roles.test.js` 전체를 이 내용으로 만든다:

```js
// 로그_매치 roles_json 적재 계약.
// ★ 열은 반드시 맨 끝이어야 한다 — Apps Script 가 열 순서를 하드코딩(_rawMatchToArray /
//   _getRawMatches)하므로 중간에 끼우면 기존 데이터 전체가 오독된다.
import { describe, it, expect } from 'vitest';
import { RAW_MATCH_COLUMNS, buildRoundRowsFromSoccer, buildRoundRowsFromFutsal } from '../matchRowBuilder';

const soccerState = (matches) => ({ soccerMatches: matches });
const match = (extra = {}) => ({
  matchIdx: 1, opponent: '한울', status: 'finished', startedAt: 1700000000000,
  lineup: ['A', 'B'], gk: 'A', defenders: ['B'], subs: [], formation: '4-4-2',
  assignments: { 0: 'A', 1: 'B' }, events: [], ...extra,
});
const build = (matches) => buildRoundRowsFromSoccer({
  team: '하버FC', date: '2026-10-07', stateJSON: soccerState(matches), inputTime: 'now',
});

describe('RAW_MATCH_COLUMNS', () => {
  it('roles_json 이 마지막 열이다', () => {
    expect(RAW_MATCH_COLUMNS[RAW_MATCH_COLUMNS.length - 1]).toBe('roles_json');
  });

  it('기존 열 순서가 그대로다 (앞 22개 불변)', () => {
    expect(RAW_MATCH_COLUMNS.slice(0, 22)).toEqual([
      'team', 'sport', 'mode', 'tournament_id',
      'date', 'game_id', 'match_idx',
      'round_idx', 'court_id', 'match_id',
      'our_team_name', 'opponent_team_name',
      'our_members_json', 'opponent_members_json',
      'our_score', 'opponent_score',
      'our_gk', 'opponent_gk',
      'formation', 'our_defenders_json',
      'is_extra', 'input_time',
    ]);
    expect(RAW_MATCH_COLUMNS).toHaveLength(23);
  });
});

describe('buildRoundRowsFromSoccer — roles_json', () => {
  it('역할이 있으면 JSON 으로 적재한다', () => {
    const rows = build([match({ roles: { camera: ['X', 'Y'], referee: 'Z', assistants: ['A'] } })]);
    expect(JSON.parse(rows[0].roles_json))
      .toEqual({ camera: ['X', 'Y'], referee: 'Z', assistants: ['A'] });
  });

  it('전원 공석이면 빈 문자열이다 (시트 JSON 도배 방지)', () => {
    const rows = build([match({ roles: { camera: [], referee: '', assistants: [] } })]);
    expect(rows[0].roles_json).toBe('');
  });

  it('roles 가 없는 레거시 경기도 빈 문자열이다', () => {
    const rows = build([match()]);
    expect(rows[0].roles_json).toBe('');
  });

  it('RTDB 드롭 모양({referee}만)도 정규화해 적재한다', () => {
    const rows = build([match({ roles: { referee: 'Z' } })]);
    expect(JSON.parse(rows[0].roles_json))
      .toEqual({ camera: [], referee: 'Z', assistants: [] });
  });

  it('다른 열은 영향받지 않는다', () => {
    const rows = build([match({ roles: { referee: 'Z' } })]);
    expect(rows[0].sport).toBe('축구');
    expect(rows[0].our_team_name).toBe('하버FC');
    expect(rows[0].match_idx).toBe(1);
  });
});

describe('buildRoundRowsFromFutsal — 무변경', () => {
  it('풋살 행은 roles_json 키를 만들지 않는다 (Apps Script 가 ||"" 로 받는다)', () => {
    const rows = buildRoundRowsFromFutsal({
      team: '마스터FC', date: '2026-10-07', inputTime: 'now',
      stateJSON: {
        gameId: 'g_1', teams: [['A'], ['B']],
        completedMatches: [{
          matchId: 'R1_C1', homeIdx: 0, awayIdx: 1, homeTeam: '1팀', awayTeam: '2팀',
          homeScore: 1, awayScore: 0, homeGk: 'A', awayGk: 'B',
        }],
      },
    });
    expect(rows[0].roles_json).toBeUndefined();
    expect(rows[0].sport).toBe('풋살');
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run src/utils/__tests__/matchRowBuilder.roles.test.js`
Expected: FAIL — `RAW_MATCH_COLUMNS` 마지막이 `'input_time'`, `rows[0].roles_json` 이 `undefined`

- [ ] **Step 3: 최소 구현 작성**

`src/utils/matchRowBuilder.js` 상단 import 에 추가:

```js
import { readRoles, serializeRoles } from './soccerRoles';
```

`RAW_MATCH_COLUMNS` 의 `'is_extra', 'input_time',` 줄을 이것으로 교체:

```js
  'is_extra', 'input_time',
  // ★ 새 열은 반드시 맨 끝. Apps Script 가 열 순서를 하드코딩(_rawMatchToArray /
  //   _getRawMatches)하므로 중간에 끼우면 기존 데이터 전체가 오독된다.
  'roles_json',
```

`buildRoundRowsFromSoccer` 의 반환 객체에서 `input_time: inputTime || '',` 줄 다음에 추가:

```js
      // 경기별 역할(영상촬영·주심·부심). 전원 공석이면 ''(레거시 행과 같은 모양).
      roles_json: serializeRoles(readRoles(m)),
```

- [ ] **Step 4: 테스트가 통과하는지 확인**

Run: `npx vitest run src/utils/__tests__/matchRowBuilder.roles.test.js`
Expected: PASS (8 tests)

- [ ] **Step 5: 기존 빌더·캐시 테스트 회귀 확인**

Run: `npx vitest run src/utils src/services`
Expected: PASS — 특히 `matchRowBuilder.test.js` · `finalizedRows.test.js` · `sheetCache` 관련 테스트

- [ ] **Step 6: 커밋**

```bash
git add src/utils/matchRowBuilder.js src/utils/__tests__/matchRowBuilder.roles.test.js
git commit -m "feat(soccer): 로그_매치 roles_json 열 적재 (맨 끝 추가)

RAW_MATCH_COLUMNS 변경으로 SheetCache L2 가 MISS_SCHEMA 로 자동 무효화된다.
풋살 빌더는 무변경 — Apps Script 가 r.roles_json||\"\" 로 받는다."
```

---

### Task 7: Apps Script — 헤더 · 직렬화 · changelog

**Files:**
- Modify: `apps-script/Code.js` — 최상단 changelog, `RAW_MATCHES_HEADERS`(89-100행), `_rawMatchToArray`(1194-1208행)

**Interfaces:**
- Consumes: Task 6 의 `roles_json` 행 키
- Produces: 로그_매치 시트 23번째 열에 `roles_json` 값이 쓰이고 `_getRawMatches` 가 그 키로 돌려준다

> **주의:** Apps Script 는 vitest 대상이 아니다(`vitest.config.js` include 는 `src/**` · `scripts/**`). 이 Task 는 **수동 검증**으로 끝내고, 자동 검증은 Task 6 의 열 순서 테스트가 대신한다.

- [ ] **Step 1: 최상단 changelog 추가 (팀 규칙)**

`apps-script/Code.js` 의 changelog 는 **최신이 위**인 역순이다. `// CHANGELOG` 줄 **바로 다음**,
현재 맨 위 항목(`// 2026-09-09: 회원인증…`) **앞에** 이 블록을 넣는다:

```js
// 2026-10-07: 로그_매치 roles_json 열 추가 (축구 경기별 영상촬영·주심·부심).
//             RAW_MATCHES_HEADERS 맨 끝 + _rawMatchToArray 맨 끝. 기존 열 위치 불변.
//             ★ 기존 시트는 헤더 행 W1 에 roles_json 을 수동 입력해야 한다
//               (_ensureRawSheets 는 시트가 없을 때만 헤더를 쓴다).
```

- [ ] **Step 2: 헤더 배열 수정**

`RAW_MATCHES_HEADERS` 의 `"is_extra","input_time"` 줄을 이것으로 교체:

```js
  "is_extra","input_time",
  "roles_json"   // ★ 맨 끝 고정 — src/utils/matchRowBuilder.js RAW_MATCH_COLUMNS 와 순서 일치
```

- [ ] **Step 3: 직렬화 함수 수정**

`_rawMatchToArray` 의 마지막 줄 `r.is_extra===true, r.input_time||""` 을 이것으로 교체:

```js
    r.is_extra===true, r.input_time||"",
    r.roles_json||""
```

- [ ] **Step 4: 열 수 일치 수동 확인**

Run:
```bash
node -e '
const fs=require("fs");
const s=fs.readFileSync("apps-script/Code.js","utf8");
const h=s.match(/var RAW_MATCHES_HEADERS = \[([\s\S]*?)\];/)[1];
const names=[...h.matchAll(/"([a-z_]+)"/g)].map(m=>m[1]);
const body=s.match(/function _rawMatchToArray\(r\) \{\s*return \[([\s\S]*?)\];/)[1];
const slots=body.split(",").filter(x=>x.trim()).length;
console.log("headers:",names.length,"last:",names[names.length-1]);
console.log("array slots:",slots);
if(names.length!==slots) throw new Error("열 수 불일치 — 헤더 "+names.length+" vs 배열 "+slots);
if(names[names.length-1]!=="roles_json") throw new Error("roles_json 이 마지막이 아니다");
console.log("OK");
'
```
Expected: `headers: 23 last: roles_json` / `array slots: 23` / `OK`

- [ ] **Step 5: JS 쪽 열 목록과 교차 확인**

Run:
```bash
npx vite-node -e '
import { RAW_MATCH_COLUMNS } from "./src/utils/matchRowBuilder.js";
import fs from "fs";
const s = fs.readFileSync("apps-script/Code.js","utf8");
const h = s.match(/var RAW_MATCHES_HEADERS = \[([\s\S]*?)\];/)[1];
const as = [...h.matchAll(/"([a-z_]+)"/g)].map(m=>m[1]);
console.log("JS :", RAW_MATCH_COLUMNS.join(","));
console.log("AS :", as.join(","));
if (JSON.stringify(RAW_MATCH_COLUMNS) !== JSON.stringify(as)) throw new Error("열 순서 불일치");
console.log("OK — 열 순서 일치");
'
```
Expected: `OK — 열 순서 일치`

- [ ] **Step 6: 커밋**

```bash
git add apps-script/Code.js
git commit -m "feat(sheet): 로그_매치 roles_json 열 (Apps Script)

RAW_MATCHES_HEADERS·_rawMatchToArray 맨 끝에 추가 — 기존 열 위치 불변.
_loadRawMatchKeys 는 6~10열만 읽어 무영향.
배포 후 기존 시트 헤더 W1 에 roles_json 수동 입력 필요."
```

---

### Task 8: 집계 — `calcRoleCounts`

**Files:**
- Create: `src/utils/soccerAnalytics/calcRoleCounts.js`
- Modify: `src/utils/soccerAnalytics/index.js` — barrel export 1줄
- Test: `src/utils/soccerAnalytics/__tests__/calcRoleCounts.test.js`

**Interfaces:**
- Consumes: Task 1 의 `parseRoles`
- Produces: `calcRoleCounts(matchLogs) → { rows, hasAny }`
  - `rows`: `[{ name: string, camera: number, referee: number, assistant: number, total: number }]`, `total` 내림차순 → 동점이면 이름 오름차순
  - `hasAny`: `boolean` — 역할 기록이 하나라도 있는지 (빈 상태 문구 분기용)

- [ ] **Step 1: 실패하는 테스트 작성**

`src/utils/soccerAnalytics/__tests__/calcRoleCounts.test.js` 전체를 이 내용으로 만든다:

```js
// 사람별 역할 횟수 집계. 입력은 로그_매치 행의 roles_json.
import { describe, it, expect } from 'vitest';
import { calcRoleCounts } from '../calcRoleCounts';

const row = (roles) => ({ roles_json: roles === null ? '' : JSON.stringify(roles) });

describe('calcRoleCounts', () => {
  it('빈 입력 → 빈 결과 + hasAny false', () => {
    expect(calcRoleCounts([])).toEqual({ rows: [], hasAny: false });
    expect(calcRoleCounts(null)).toEqual({ rows: [], hasAny: false });
    expect(calcRoleCounts(undefined)).toEqual({ rows: [], hasAny: false });
  });

  it('roles_json 이 전부 비면 hasAny false (레거시 행만 있는 상태)', () => {
    expect(calcRoleCounts([row(null), row(null)])).toEqual({ rows: [], hasAny: false });
  });

  it('역할별 횟수를 센다', () => {
    const { rows, hasAny } = calcRoleCounts([
      row({ camera: ['X'], referee: 'Y', assistants: ['Z', 'W'] }),
      row({ camera: ['X'], referee: 'X', assistants: [] }),
    ]);
    expect(hasAny).toBe(true);
    const byName = Object.fromEntries(rows.map(r => [r.name, r]));
    expect(byName.X).toEqual({ name: 'X', camera: 2, referee: 1, assistant: 0, total: 3 });
    expect(byName.Y).toEqual({ name: 'Y', camera: 0, referee: 1, assistant: 0, total: 1 });
    expect(byName.Z).toEqual({ name: 'Z', camera: 0, referee: 0, assistant: 1, total: 1 });
    expect(byName.W).toEqual({ name: 'W', camera: 0, referee: 0, assistant: 1, total: 1 });
  });

  it('역할 1회 이상인 사람만 담는다 (0회는 행이 없다)', () => {
    const { rows } = calcRoleCounts([row({ camera: ['X'], referee: '', assistants: [] })]);
    expect(rows.map(r => r.name)).toEqual(['X']);
  });

  it('합계 내림차순, 동점은 이름 오름차순으로 정렬한다', () => {
    const { rows } = calcRoleCounts([
      row({ camera: ['b', 'a'], referee: 'c', assistants: [] }),
      row({ camera: ['c'], referee: 'c', assistants: [] }),
    ]);
    // c=3(referee2+camera1), a=1, b=1 → c, a, b
    expect(rows.map(r => r.name)).toEqual(['c', 'a', 'b']);
  });

  it('깨진 JSON 행은 건너뛴다 (크래시 금지)', () => {
    const { rows, hasAny } = calcRoleCounts([
      { roles_json: '{nope' },
      row({ camera: ['X'], referee: '', assistants: [] }),
    ]);
    expect(hasAny).toBe(true);
    expect(rows.map(r => r.name)).toEqual(['X']);
  });

  it('roles_json 키가 아예 없는 행도 건너뛴다', () => {
    expect(calcRoleCounts([{ date: '2026-10-07' }])).toEqual({ rows: [], hasAny: false });
  });

  it('부심 3명이 적힌 이상 행은 2명까지만 센다 (parseRoles 상한)', () => {
    const { rows } = calcRoleCounts([row({ camera: [], referee: '', assistants: ['a', 'b', 'c'] })]);
    expect(rows.map(r => r.name).sort()).toEqual(['a', 'b']);
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run src/utils/soccerAnalytics/__tests__/calcRoleCounts.test.js`
Expected: FAIL — `Failed to resolve import "../calcRoleCounts"`

- [ ] **Step 3: 최소 구현 작성**

`src/utils/soccerAnalytics/calcRoleCounts.js` 를 이 내용으로 만든다:

```js
// 사람별 역할 횟수(영상촬영 · 주심 · 부심) 집계.
// 입력은 로그_매치 행의 roles_json — 역할 기능 이전 행은 전부 빈칸이라 자연히 제외된다.
//
// 축구 전용이다. 풋살 계산층(utils/analyticsV2)에는 대응 함수를 두지 않는다 —
// 분석 탭이 isSoccer 로 분해하는 이름이 아니라 컴포넌트가 직접 import 하는 함수이기 때문.

import { parseRoles } from '../soccerRoles';

export function calcRoleCounts(matchLogs) {
  const acc = new Map(); // name → { camera, referee, assistant }
  let hasAny = false;

  const bump = (name, key) => {
    if (!name) return;
    if (!acc.has(name)) acc.set(name, { camera: 0, referee: 0, assistant: 0 });
    acc.get(name)[key] += 1;
    hasAny = true;
  };

  for (const row of (matchLogs || [])) {
    const r = parseRoles(row?.roles_json);
    r.camera.forEach(n => bump(n, 'camera'));
    bump(r.referee, 'referee');
    r.assistants.forEach(n => bump(n, 'assistant'));
  }

  const rows = [...acc.entries()]
    .map(([name, c]) => ({ name, ...c, total: c.camera + c.referee + c.assistant }))
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));

  return { rows, hasAny };
}
```

- [ ] **Step 4: barrel export 추가**

`src/utils/soccerAnalytics/index.js` 의 `export * from './calcRecentHotStreak';` 줄 **앞에** 추가:

```js
export * from './calcRoleCounts';   // 축구 전용 — analyticsV2 대응 불필요(컴포넌트 직접 소비)
```

- [ ] **Step 5: 테스트가 통과하는지 확인**

Run: `npx vitest run src/utils/soccerAnalytics/__tests__/calcRoleCounts.test.js`
Expected: PASS (8 tests)

- [ ] **Step 6: 셰도잉 가드 회귀 확인**

Run: `npx vitest run src/utils/soccerAnalytics src/utils/analyticsV2`
Expected: PASS — barrel 대응 가드 테스트가 있으면 함께 통과

- [ ] **Step 7: 커밋**

```bash
git add src/utils/soccerAnalytics/calcRoleCounts.js src/utils/soccerAnalytics/index.js src/utils/soccerAnalytics/__tests__/calcRoleCounts.test.js
git commit -m "feat(soccer): calcRoleCounts — 사람별 영상촬영/주심/부심 횟수

깨진 JSON·빈 행은 건너뛴다. 역할 1회 이상인 사람만 행을 만든다
(0회 전원 나열하면 로스터 전체 표가 된다). analyticsV2 는 무변경."
```

---

### Task 9: 분석 「역할 기록」 표 + 서브탭

**Files:**
- Create: `src/components/dashboard/analytics/RoleRecordTab.jsx`
- Modify: `src/components/dashboard/PlayerAnalytics.jsx` — tabs 배열 1줄, import 1줄, 렌더 분기 1블록
- Test: `src/components/dashboard/analytics/__tests__/RoleRecordTab.test.jsx`

**Interfaces:**
- Consumes: Task 8 의 `calcRoleCounts`, 기존 `useSortableRows` · `SortHeader`(`src/components/tennis/Sortable.jsx`)
- Produces: 기본 export `<RoleRecordTab matchLogs={array} C={themeColors} />`

> **`SortHeader` 는 `ds` prop(`{ th: style }`)을 요구한다.** 테니스·컵 탭이 쓰는 것과 같은 모양의 스타일 객체를 이 컴포넌트 안에서 만들어 넘긴다.

- [ ] **Step 1: 실패하는 테스트 작성**

`src/components/dashboard/analytics/__tests__/RoleRecordTab.test.jsx` 전체를 이 내용으로 만든다:

```jsx
// RoleRecordTab 렌더 스모크 — 표시 전용이라 renderToStaticMarkup(analyticsTabs.smoke 패턴).
// build/vitest 가 못 잡는 렌더 크래시(TDZ·undefined 접근) 방어가 목적.
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { ThemeProvider } from '../../../../hooks/useTheme';
import RoleRecordTab from '../RoleRecordTab';

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (q) => ({ matches: false, media: q, onchange: null, addListener(){}, removeListener(){}, addEventListener(){}, removeEventListener(){}, dispatchEvent(){} }),
});

const C = {
  white: '#fff', gray: '#888', grayLight: '#bbb', grayDark: '#444', grayDarker: '#333',
  black: '#000', bg: '#111', card: '#1a1a1a', cardLight: '#222', accent: '#0f0',
  green: '#0f0', red: '#f00', yellow: '#ff0', orange: '#f80',
};

const render = (props) =>
  renderToStaticMarkup(createElement(ThemeProvider, null, createElement(RoleRecordTab, { C, ...props })));

const logs = [
  { roles_json: JSON.stringify({ camera: ['김A', '이B'], referee: '박C', assistants: ['최D'] }) },
  { roles_json: JSON.stringify({ camera: ['김A'], referee: '박C', assistants: [] }) },
  { roles_json: '' },
];

describe('RoleRecordTab', () => {
  it('matchLogs 없이도 크래시하지 않고 빈 상태 문구를 띄운다', () => {
    const html = render({ matchLogs: [] });
    expect(html).toContain('역할 기록이 아직 없습니다');
  });

  it('matchLogs 가 undefined 여도 크래시하지 않는다', () => {
    expect(() => render({})).not.toThrow();
  });

  it('레거시 행(roles_json 빈칸)만 있으면 빈 상태 문구', () => {
    expect(render({ matchLogs: [{ roles_json: '' }, { date: '2026-01-01' }] }))
      .toContain('역할 기록이 아직 없습니다');
  });

  it('집계 결과를 표로 그린다 — 이름과 합계가 보인다', () => {
    const html = render({ matchLogs: logs });
    expect(html).not.toContain('역할 기록이 아직 없습니다');
    expect(html).toContain('김A');
    expect(html).toContain('박C');
    expect(html).toContain('최D');
    expect(html).toContain('영상촬영');
    expect(html).toContain('주심');
    expect(html).toContain('부심');
    expect(html).toContain('합계');
  });

  it('"촬영감독" 문구를 쓰지 않는다', () => {
    expect(render({ matchLogs: logs })).not.toContain('촬영감독');
  });

  it('깨진 roles_json 이 섞여도 렌더된다', () => {
    const html = render({ matchLogs: [{ roles_json: '{nope' }, ...logs] });
    expect(html).toContain('김A');
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run src/components/dashboard/analytics/__tests__/RoleRecordTab.test.jsx`
Expected: FAIL — `Failed to resolve import "../RoleRecordTab"`

- [ ] **Step 3: 최소 구현 작성**

`src/components/dashboard/analytics/RoleRecordTab.jsx` 를 이 내용으로 만든다:

```jsx
import { useMemo } from 'react';
import { calcRoleCounts } from '../../../utils/soccerAnalytics';
import { useSortableRows, SortHeader } from '../../tennis/Sortable';

// 「역할 기록」 — 사람별 영상촬영 · 주심 · 부심 횟수. 축구 전용 탭.
// 정렬은 테니스 Sortable(컵 탭에서도 재사용한 경로)을 그대로 쓴다.
// 역할 기능 이전 경기는 로그_매치 roles_json 이 빈칸이라 집계에 안 잡힌다 — 그래서
// 기록이 0건일 때는 표 대신 안내 문구를 띄운다(빈 표가 "집계 버그"로 보이는 것 방지).
const COLUMNS = {
  name: { accessor: r => r.name, type: 'text' },
  camera: { accessor: r => r.camera, type: 'num' },
  referee: { accessor: r => r.referee, type: 'num' },
  assistant: { accessor: r => r.assistant, type: 'num' },
  total: { accessor: r => r.total, type: 'num' },
};

export default function RoleRecordTab({ matchLogs, C }) {
  const { rows, hasAny } = useMemo(() => calcRoleCounts(matchLogs || []), [matchLogs]);
  const { sorted, sort, onSort } = useSortableRows(rows, COLUMNS, { key: 'total', dir: 'desc' });

  const ds = {
    th: {
      padding: '8px 6px', fontSize: 11, fontWeight: 700, color: C.gray,
      borderBottom: `1px solid ${C.grayDarker}`, background: 'transparent',
    },
  };
  const td = (align = 'center') => ({
    padding: '8px 6px', fontSize: 12, color: C.white, textAlign: align,
    borderBottom: `1px solid ${C.grayDarker}`,
  });

  if (!hasAny) {
    return (
      <div style={{ textAlign: 'center', color: C.gray, padding: 30, fontSize: 12, lineHeight: 1.8 }}>
        역할 기록이 아직 없습니다.<br />
        2026-10-07 이후 경기에서 역할을 지정하면 여기에 집계됩니다.
      </div>
    );
  }

  return (
    <div>
      <div style={{ fontSize: 11, color: C.gray, marginBottom: 8, lineHeight: 1.7 }}>
        경기별로 지정한 영상촬영 · 주심 · 부심 횟수입니다. 열 제목을 누르면 정렬됩니다.
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <SortHeader label="이름" sortKey="name" sort={sort} onSort={onSort} align="left" ds={ds} />
              <SortHeader label="영상촬영" sortKey="camera" sort={sort} onSort={onSort} ds={ds} />
              <SortHeader label="주심" sortKey="referee" sort={sort} onSort={onSort} ds={ds} />
              <SortHeader label="부심" sortKey="assistant" sort={sort} onSort={onSort} ds={ds} />
              <SortHeader label="합계" sortKey="total" sort={sort} onSort={onSort} ds={ds} />
            </tr>
          </thead>
          <tbody>
            {sorted.map(r => (
              <tr key={r.name}>
                <td style={td('left')}>{r.name}</td>
                <td style={td()}>{r.camera || '-'}</td>
                <td style={td()}>{r.referee || '-'}</td>
                <td style={td()}>{r.assistant || '-'}</td>
                <td style={{ ...td(), fontWeight: 800 }}>{r.total}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: 테스트가 통과하는지 확인**

Run: `npx vitest run src/components/dashboard/analytics/__tests__/RoleRecordTab.test.jsx`
Expected: PASS (6 tests)

- [ ] **Step 5: `PlayerAnalytics.jsx` 에 서브탭 연결**

(a) import 블록에 추가 (`import LegacyDataNotice` 줄 다음):

```jsx
import RoleRecordTab from './analytics/RoleRecordTab';
```

(b) `tabs` 배열을 이것으로 교체:

```jsx
  const tabs = [
    { key: "personal", label: "개인분석" },
    { key: "chem", label: "케미" },
    { key: "awards", label: "어워드" },
    // 역할(영상촬영·주심·부심)은 축구 전용 — 풋살 로그_매치에는 roles_json 이 항상 빈칸이다
    isSoccer && { key: "roles", label: "역할" },
    showCrovaGoguma && { key: "crovaguma", label: "🍀/🍠" },
  ].filter(Boolean);
```

(c) `{tab === "crovaguma" && ...}` 블록 **앞에** 추가:

```jsx
      {tab === "roles" && isSoccer && <RoleRecordTab matchLogs={matchLogs} C={C} />}
```

- [ ] **Step 6: 분석탭 회귀 + 빌드 확인**

Run: `npx vitest run src/components/dashboard && npm run lint && npm run build`
Expected: 테스트 PASS, 린트 통과, 빌드 성공

- [ ] **Step 7: 전체 테스트**

Run: `npx vitest run`
Expected: PASS — 전체 스위트 통과

- [ ] **Step 8: 커밋**

```bash
git add src/components/dashboard/analytics/RoleRecordTab.jsx src/components/dashboard/analytics/__tests__/RoleRecordTab.test.jsx src/components/dashboard/PlayerAnalytics.jsx
git commit -m "feat(soccer): 분석 「역할 기록」 표 + 축구 전용 역할 서브탭

테니스 Sortable 재사용. 기록 0건이면 빈 표 대신 안내 문구를 띄운다
(레거시 행은 roles_json 이 빈칸이라 집계에 안 잡힌다)."
```

---

## 배포 (코드 머지 후, 사용자 수행)

1. **앱**: 빌드 + push → GitHub Actions 자동 배포
2. **Apps Script**: 「배포 관리 → 편집 → 새 버전」으로 반영 (URL 고정. 「새 배포」를 쓰면 URL 이 바뀐다)
3. **시트 수동 작업**: 로그_매치 시트 헤더 행 **W1 셀**에 `roles_json` 입력
   - `_ensureRawSheets` 는 시트가 없을 때만 헤더를 쓰므로 기존 시트는 자동으로 안 채워진다
   - 안 해도 값은 들어가지만 열 이름이 비어 사람이 읽을 수 없다
4. **스모크**: 하버FC 축구 경기 하나 만들고 → 역할 지정 → 다른 기기에서 같은 경기 열어 역할이 보이는지 → 마감 → 분석 탭 「역할」에 집계되는지

## 범위 밖 (의도적으로 안 하는 것)

- 빅마스터FC 자체전(`IntraSoccerApp` / `IntraSoccerMatchView`)
- 풋살 · 테니스
- 로그_매치 재전송 멱등화 — 기존 결함이고 사용자 결정으로 보류된 사안
- 「상대팀 변경」 기존 경고 문구 교정
