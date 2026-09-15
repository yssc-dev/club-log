# 빅마스터FC 증분 4 — A/B 독립 배치·준비완료 + 외부전 우리 팀 선택 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 자체전 배치를 A·B 각각 따로(다른 사람·다른 기기에서) 입력하고 양 팀이 준비완료하면 경기가 시작되게 하며, 외부전에서는 우리 팀을 골라 그 팀 소속 참석자만 선발 후보로 쓴다.

**Architecture:** 배치 단계를 화면 로컬 state 가 아니라 **`status:'setup'` 경기 노드**로 만든다. A 배치는 경기 최상위 필드, B 배치는 `sideB`, 준비 플래그는 `sideA.ready`/`sideB.ready`. `diffStateToWrites` 가 경기의 키마다 `soccerMatches/{idx}/{key}` 로 따로 쓰므로 두 사람이 동시에 편집해도 서로 덮지 않는다. 공유 파일은 선택적 prop·선택적 인자·새 reducer case **추가만** 한다.

**Tech Stack:** React 19 + Vite, vitest(jsdom, act/createRoot 수동 하네스), Firebase RTDB, Google Apps Script(이번 증분 무접촉)

**Spec:** `docs/superpowers/specs/2026-09-10-bigmaster-intrasquad-soccer-design.md` §16 (§13·§14·§15 가 전제)

## Global Constraints

- 하버FC(축구)·마스터FC(풋살)·테니스 동작 **무변경**. 공유 파일은 **추가만** — 기존 시그니처·기본 동작을 바꾸지 않는다.
- 기존 테스트는 **고치지 않고** 통과해야 한다. 갱신 가능한 것은 빅마스터FC 전용 테스트뿐이다.
- 무접촉 파일: `src/SoccerApp.jsx`, `src/App.jsx`, `src/TennisApp.jsx`, `src/components/game/SoccerMatchView.jsx`, `src/components/tournament/TournamentMatchManager.jsx`, `src/services/firebaseSyncDiff.js`, `src/hooks/useFirebaseSync.js`, `apps-script/`, 시트 스키마, RTDB 규칙.
- 변경 허용(화이트리스트): `src/utils/intraSoccer/`, `src/components/intra/`, `src/IntraSoccerApp.jsx`, `src/hooks/useGameReducer.js`, `src/hooks/__tests__/`, `src/components/game/FormationSetup.jsx`, `src/components/game/FormationRecorder.jsx`, `src/components/game/__tests__/`, `docs/`.
- 새 status 문자열은 정확히 `'setup'`. 새 액션 이름은 정확히 `PATCH_SOCCER_SETUP`, `START_SOCCER_MATCH`, `DELETE_SOCCER_SETUP_MATCH`.
- §15 유지: 빅마스터FC 는 로그_이벤트·로그_선수경기·로그_매치·빅마스터FC 참석명단 4개 시트만 쓴다. 새 코드가 다른 시트를 읽거나 쓰지 않는다.
- 외부전 후보는 **그 팀 소속 참석자만**(유동 인원 제외). 자체전 후보는 기존대로 팀 명단 ∪ 유동 인원.
- 배치를 저장하면 그 편의 `ready` 가 `false` 로 풀린다.
- 태스크마다 커밋한다. 테스트는 `npx vitest run <파일>` 로 **먼저 실패를 확인**하고 구현한다.

## File Structure

| 파일 | 역할 |
|---|---|
| `src/utils/intraSoccer/setup.js` (신규) | 배치 단계 순수 로직 — 편 메타/선발/중복/풀/준비 판정 |
| `src/utils/intraSoccer/__tests__/setup.test.js` (신규) | 위 단위 테스트 |
| `src/hooks/useGameReducer.js` (수정, 추가만) | `CREATE_SOCCER_MATCH` 선택 인자 2개 + 새 case 3개 |
| `src/hooks/__tests__/useGameReducer.setup.test.js` (신규) | 새 case + 기존 생성 동작 회귀 |
| `src/components/game/FormationSetup.jsx` (수정, 추가만) | 선택 prop `initialFormation`·`initialAssignments`·`confirmLabel` |
| `src/components/game/FormationRecorder.jsx` (수정, 추가만) | 선택 prop `ourTeamLabel` |
| `src/components/game/__tests__/FormationSetup.initial.test.jsx` (신규) | 초기 배치 시드·기본 동작 불변 |
| `src/IntraSoccerApp.jsx` (수정) | 새 핸들러 3개 배선 + `createSoccerMatch` 인자 통과 + `authUserName` 전달 |
| `src/components/intra/IntraSoccerMatchView.jsx` (수정) | 배치 중 노드 흐름 전체(생성·카드·배치 편집·준비·시작·취소) + 외부전 우리 팀 선택 |
| `src/components/intra/__tests__/IntraSoccerMatchView.smoke.test.jsx` (수정) | 새 흐름 스모크 케이스 추가 |
| `src/utils/intraSoccer/buildIntraRows.js` (수정) | 외부전 `our_team`/`our_team_name` 을 고른 팀 이름으로 |
| `src/utils/intraSoccer/__tests__/buildIntraRows.test.js` (수정) | 위 케이스 추가(기존 deep-equal 케이스 유지) |

---

### Task 1: 배치 단계 순수 로직 `setup.js`

**Files:**
- Create: `src/utils/intraSoccer/setup.js`
- Test: `src/utils/intraSoccer/__tests__/setup.test.js`

**Interfaces:**
- Consumes: `rosterOf`, `floatingOf` (`src/utils/intraSoccer/pools.js`, 이미 존재)
- Produces (Task 4·5·6 이 그대로 쓴다):
  - `sideMeta(m, side) -> object`
  - `sideReady(m, side) -> boolean`
  - `sideStarters(m, side) -> string[]`
  - `bothReady(m) -> boolean`
  - `overlapStarters(m) -> string[]`
  - `setupPool({ teams, teamName, attendees, excludeNames }) -> string[]`
  - `externalPool({ teams, teamName, attendees }) -> string[]`
  - `canReady(m, side) -> { ok: boolean, reason: string }`
  - `canStartSetup(m) -> { ok: boolean, reason: string }`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`src/utils/intraSoccer/__tests__/setup.test.js`:

```js
// 스펙 §16.3.3 — 배치 중(setup) 단계 순수 로직.
import { describe, it, expect } from 'vitest';
import {
  sideMeta, sideReady, sideStarters, bothReady, overlapStarters,
  setupPool, externalPool, canReady, canStartSetup,
} from '../setup';

const TEAMS = [
  { name: '흰팀', players: ['a1', 'a2', 'a3', 'a9'] },   // a9 = 결석(참석자에 없음)
  { name: '검은팀', players: ['b1', 'b2', 'b3'] },
];
const ATTENDEES = ['a1', 'a2', 'a3', 'b1', 'b2', 'b3', 'f1'];  // f1 = 유동 인원(팀 열에 없음)

// 11명 배치 헬퍼 — assignments 는 { 슬롯번호: 이름 }
const eleven = (prefix) => Object.fromEntries(Array.from({ length: 11 }, (_, i) => [i, `${prefix}${i}`]));

const setupMatch = (over = {}) => ({
  matchIdx: 0, status: 'setup', startedAt: null,
  sideA: { name: '흰팀' }, sideB: { name: '검은팀' },
  assignments: null, events: [], ...over,
});

describe('sideMeta / sideReady / sideStarters', () => {
  it('sideMeta 는 편 객체를, 없으면 빈 객체를 준다', () => {
    const m = setupMatch();
    expect(sideMeta(m, 'A')).toEqual({ name: '흰팀' });
    expect(sideMeta(m, 'B')).toEqual({ name: '검은팀' });
    expect(sideMeta({}, 'A')).toEqual({});
  });
  it('sideReady 는 ready === true 일 때만 참이다', () => {
    expect(sideReady(setupMatch({ sideA: { name: '흰팀', ready: true } }), 'A')).toBe(true);
    expect(sideReady(setupMatch({ sideA: { name: '흰팀', ready: 'yes' } }), 'A')).toBe(false);
    expect(sideReady(setupMatch(), 'A')).toBe(false);
  });
  it('sideStarters 는 A=최상위 assignments, B=sideB.assignments 를 읽고 없으면 빈 배열이다', () => {
    const m = setupMatch({ assignments: { 0: 'a1', 1: 'a2' }, sideB: { name: '검은팀', assignments: { 0: 'b1' } } });
    expect(sideStarters(m, 'A')).toEqual(['a1', 'a2']);
    expect(sideStarters(m, 'B')).toEqual(['b1']);
    expect(sideStarters(setupMatch(), 'A')).toEqual([]);
    expect(sideStarters(setupMatch(), 'B')).toEqual([]);
  });
});

describe('overlapStarters / bothReady', () => {
  it('양 팀에 동시에 들어간 이름을 정렬해 돌려준다', () => {
    const m = setupMatch({
      assignments: { 0: 'f1', 1: 'a1', 2: 'f2' },
      sideB: { name: '검은팀', assignments: { 0: 'f2', 1: 'b1', 2: 'f1' } },
    });
    expect(overlapStarters(m)).toEqual(['f1', 'f2']);
    expect(overlapStarters(setupMatch())).toEqual([]);
  });
  it('bothReady 는 양쪽 ready 가 참일 때만 참이다', () => {
    expect(bothReady(setupMatch({ sideA: { ready: true }, sideB: { ready: true } }))).toBe(true);
    expect(bothReady(setupMatch({ sideA: { ready: true }, sideB: { ready: false } }))).toBe(false);
  });
});

describe('setupPool / externalPool', () => {
  it('자체전 풀 = (팀 명단 ∪ 유동 인원) ∩ 참석자 − 제외 목록', () => {
    expect(setupPool({ teams: TEAMS, teamName: '흰팀', attendees: ATTENDEES, excludeNames: [] }))
      .toEqual(['a1', 'a2', 'a3', 'f1']);                       // a9 는 결석이라 빠진다
    expect(setupPool({ teams: TEAMS, teamName: '흰팀', attendees: ATTENDEES, excludeNames: ['f1'] }))
      .toEqual(['a1', 'a2', 'a3']);                             // 상대가 이미 쓴 유동 인원 제외
  });
  it('외부전 풀 = 팀 명단 ∩ 참석자 (유동 인원 제외 — 유저 결정)', () => {
    expect(externalPool({ teams: TEAMS, teamName: '흰팀', attendees: ATTENDEES })).toEqual(['a1', 'a2', 'a3']);
    expect(externalPool({ teams: TEAMS, teamName: '없는팀', attendees: ATTENDEES })).toEqual([]);
  });
});

describe('canReady / canStartSetup', () => {
  const full = () => setupMatch({
    assignments: eleven('a'), sideB: { name: '검은팀', assignments: eleven('b') },
  });
  it('선발이 11명이 아니면 사유와 함께 막는다', () => {
    const r = canReady(setupMatch({ assignments: { 0: 'a1' } }), 'A');
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('11명');
    expect(r.reason).toContain('1명');
  });
  it('11명이어도 양 팀에 같은 선수가 있으면 막고 이름을 알려준다', () => {
    const m = setupMatch({ assignments: { ...eleven('a'), 0: 'b0' }, sideB: { name: '검은팀', assignments: eleven('b') } });
    const r = canReady(m, 'A');
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('b0');
  });
  it('11명·중복 없음이면 준비 가능', () => {
    expect(canReady(full(), 'A')).toEqual({ ok: true, reason: '' });
  });
  it('canStartSetup 은 양쪽 11명·양쪽 ready·중복 0 일 때만 ok', () => {
    expect(canStartSetup(full()).ok).toBe(false);                        // ready 없음
    expect(canStartSetup(full()).reason).toContain('준비');
    const ready = setupMatch({
      assignments: eleven('a'), sideA: { name: '흰팀', ready: true },
      sideB: { name: '검은팀', ready: true, assignments: eleven('b') },
    });
    expect(canStartSetup(ready)).toEqual({ ok: true, reason: '' });
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run src/utils/intraSoccer/__tests__/setup.test.js`
Expected: FAIL — `Failed to resolve import "../setup"`

- [ ] **Step 3: 구현한다**

`src/utils/intraSoccer/setup.js`:

```js
// 빅마스터FC 증분 4(스펙 §16.3.3): 배치 중(status 'setup') 단계의 순수 로직. React/DOM 의존 없음.
// A 배치는 경기 최상위 필드, B 배치는 sideB — 저장 경로가 달라 두 사람이 동시에 편집해도 덮이지 않는다.
import { rosterOf, floatingOf } from './pools';

const uniq = (arr) => Array.from(new Set(arr));
const inter = (list, attendees) => { const a = new Set(attendees || []); return list.filter((n) => a.has(n)); };
// assignments 는 { 슬롯: 이름 } 객체다(RTDB 왕복에도 객체 그대로) — values 로 충분하다.
const namesOf = (assignments) => (assignments && typeof assignments === 'object' ? Object.values(assignments).filter(Boolean) : []);

export function sideMeta(m, side) {
  return (side === 'A' ? m && m.sideA : m && m.sideB) || {};
}

export function sideReady(m, side) {
  return sideMeta(m, side).ready === true;
}

export function sideStarters(m, side) {
  return namesOf(side === 'A' ? m && m.assignments : m && m.sideB && m.sideB.assignments);
}

export function bothReady(m) {
  return sideReady(m, 'A') && sideReady(m, 'B');
}

export function overlapStarters(m) {
  const b = new Set(sideStarters(m, 'B'));
  return uniq(sideStarters(m, 'A').filter((n) => b.has(n))).sort((x, y) => x.localeCompare(y, 'ko'));
}

// 자체전 배치 후보: (팀 명단 ∪ 유동 인원) ∩ 참석자 − 상대 편이 이미 쓴 이름.
export function setupPool({ teams, teamName, attendees, excludeNames }) {
  const roster = rosterOf(teams, teamName) || [];
  const ex = new Set(excludeNames || []);
  return inter(uniq([...roster, ...floatingOf(attendees, teams)]), attendees).filter((n) => !ex.has(n));
}

// 외부전 배치 후보: 그 팀 소속 참석자만(유동 인원 제외 — 유저 결정, 스펙 §16.1).
export function externalPool({ teams, teamName, attendees }) {
  const roster = rosterOf(teams, teamName);
  return roster ? inter(roster, attendees) : [];
}

export function canReady(m, side) {
  const n = sideStarters(m, side).length;
  if (n !== 11) return { ok: false, reason: `선발 11명을 채워야 합니다(현재 ${n}명)` };
  const dup = overlapStarters(m);
  if (dup.length) return { ok: false, reason: `양 팀에 같은 선수가 있습니다: ${dup.join(', ')}` };
  return { ok: true, reason: '' };
}

export function canStartSetup(m) {
  for (const side of ['A', 'B']) {
    const label = sideMeta(m, side).name || side;
    const r = canReady(m, side);
    if (!r.ok) return { ok: false, reason: `${label}: ${r.reason}` };
    if (!sideReady(m, side)) return { ok: false, reason: `${label} 준비 대기` };
  }
  return { ok: true, reason: '' };
}
```

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run src/utils/intraSoccer/__tests__/setup.test.js`
Expected: PASS

- [ ] **Step 5: 커밋**

`git add src/utils/intraSoccer/setup.js src/utils/intraSoccer/__tests__/setup.test.js`
그리고 커밋 메시지: `feat: 자체전 배치 단계 순수 로직(setup) — 편 선발·중복·풀·준비 판정`

---

### Task 2: 리듀서 — 선택 인자 2개 + 새 case 3개

**Files:**
- Modify: `src/hooks/useGameReducer.js` (`CREATE_SOCCER_MATCH` case, 그리고 `PATCH_SOCCER_SIDE` case 바로 뒤에 새 case 3개)
- Test: `src/hooks/__tests__/useGameReducer.setup.test.js`

**Interfaces:**
- Consumes: 없음(리듀서 자체)
- Produces (Task 4·5 가 dispatch 한다):
  - `{ type: 'CREATE_SOCCER_MATCH', ..., status?: string, startedAt?: number|null }`
  - `{ type: 'PATCH_SOCCER_SETUP', matchIdx, side: 'A'|'B', patch }`
  - `{ type: 'START_SOCCER_MATCH', matchIdx, startedAt }`
  - `{ type: 'DELETE_SOCCER_SETUP_MATCH', matchIdx }`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`src/hooks/__tests__/useGameReducer.setup.test.js`:

```js
// 스펙 §16.3.2 — 배치 중(setup) 경기용 리듀서. 하버FC 가 쓰는 기존 동작은 그대로여야 한다.
import { describe, it, expect } from 'vitest';
import { gameReducer, initialState } from '../useGameReducer';

const create = (state, extra = {}) => gameReducer(state, {
  type: 'CREATE_SOCCER_MATCH', opponent: '검은팀', lineup: [], gk: '', defenders: [],
  subs: [], formation: null, assignments: null, positionMap: null, ...extra,
});
const fresh = () => ({ ...initialState, soccerMatches: [] });

describe('CREATE_SOCCER_MATCH — 선택 인자', () => {
  it('인자를 안 넘기면 기존과 동일(playing · startedAt 기록)', () => {
    const m = create(fresh()).soccerMatches[0];
    expect(m.status).toBe('playing');
    expect(typeof m.startedAt).toBe('number');
  });
  it('status/startedAt 을 넘기면 그대로 저장한다', () => {
    const m = create(fresh(), { status: 'setup', startedAt: null }).soccerMatches[0];
    expect(m.status).toBe('setup');
    expect(m.startedAt).toBe(null);
    expect(m.matchIdx).toBe(0);
  });
});

describe('PATCH_SOCCER_SETUP', () => {
  const setup = () => create(fresh(), { status: 'setup', startedAt: null });
  it('A: 배치 키는 최상위에, 이름·준비는 sideA 에 넣는다', () => {
    const s = gameReducer(setup(), { type: 'PATCH_SOCCER_SETUP', matchIdx: 0, side: 'A', patch: {
      name: '흰팀', ready: true, readyBy: '홍길동',
      lineup: ['a1'], gk: 'a1', defenders: [], formation: '4-4-2',
      assignments: { 0: 'a1' }, positionMap: { a1: 'GK' }, subs: ['a2'],
      status: 'HACK', events: ['nope'],
    } });
    const m = s.soccerMatches[0];
    expect(m.sideA).toEqual({ name: '흰팀', ready: true, readyBy: '홍길동' });
    expect(m.lineup).toEqual(['a1']);
    expect(m.assignments).toEqual({ 0: 'a1' });
    expect(m.status).toBe('setup');          // 화이트리스트 밖 키는 무시
    expect(m.events).toEqual([]);
  });
  it('B: 배치 키·이름·준비를 모두 sideB 에 병합한다', () => {
    let s = gameReducer(setup(), { type: 'PATCH_SOCCER_SETUP', matchIdx: 0, side: 'B', patch: { name: '검은팀', lineup: ['b1'] } });
    s = gameReducer(s, { type: 'PATCH_SOCCER_SETUP', matchIdx: 0, side: 'B', patch: { ready: true } });
    expect(s.soccerMatches[0].sideB).toEqual({ name: '검은팀', lineup: ['b1'], ready: true });
    expect(s.soccerMatches[0].lineup).toEqual([]);   // A 최상위는 건드리지 않는다
  });
  it('setup 이 아닌 경기에는 아무 일도 하지 않는다', () => {
    const playing = create(fresh());
    const s = gameReducer(playing, { type: 'PATCH_SOCCER_SETUP', matchIdx: 0, side: 'A', patch: { ready: true } });
    expect(s.soccerMatches[0].sideA).toBeUndefined();
  });
  it('ready:false / readyBy:null 도 반영한다(배치 저장 시 준비 해제)', () => {
    let s = gameReducer(setup(), { type: 'PATCH_SOCCER_SETUP', matchIdx: 0, side: 'A', patch: { ready: true, readyBy: '홍길동' } });
    s = gameReducer(s, { type: 'PATCH_SOCCER_SETUP', matchIdx: 0, side: 'A', patch: { ready: false, readyBy: null } });
    expect(s.soccerMatches[0].sideA.ready).toBe(false);
    expect(s.soccerMatches[0].sideA.readyBy).toBe(null);
  });
});

describe('START_SOCCER_MATCH', () => {
  it('setup → playing 으로 바꾸고 startedAt·currentMatchIdx 를 세운다', () => {
    const s = gameReducer(create(fresh(), { status: 'setup', startedAt: null }), { type: 'START_SOCCER_MATCH', matchIdx: 0, startedAt: 1234 });
    expect(s.soccerMatches[0].status).toBe('playing');
    expect(s.soccerMatches[0].startedAt).toBe(1234);
    expect(s.currentMatchIdx).toBe(0);
  });
  it('이미 playing 이면 state 를 그대로 돌려준다(멱등 — 두 기기가 동시에 보내도 안전)', () => {
    const playing = create(fresh());
    const s = gameReducer(playing, { type: 'START_SOCCER_MATCH', matchIdx: 0, startedAt: 9999 });
    expect(s).toBe(playing);
  });
});

describe('DELETE_SOCCER_SETUP_MATCH', () => {
  it('마지막 setup 경기를 지우고 currentMatchIdx 를 보정한다', () => {
    let s = create(fresh());                                   // 0: playing
    s = create(s, { status: 'setup', startedAt: null });        // 1: setup
    const out = gameReducer(s, { type: 'DELETE_SOCCER_SETUP_MATCH', matchIdx: 1 });
    expect(out.soccerMatches).toHaveLength(1);
    expect(out.currentMatchIdx).toBe(0);
  });
  it('마지막이 아니거나 setup 이 아니면 아무 일도 하지 않는다', () => {
    let s = create(fresh(), { status: 'setup', startedAt: null });  // 0: setup
    s = create(s);                                                  // 1: playing
    expect(gameReducer(s, { type: 'DELETE_SOCCER_SETUP_MATCH', matchIdx: 0 })).toBe(s);  // 중간 경기
    expect(gameReducer(s, { type: 'DELETE_SOCCER_SETUP_MATCH', matchIdx: 1 })).toBe(s);  // playing
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run src/hooks/__tests__/useGameReducer.setup.test.js`
Expected: FAIL — `status:'setup'` 을 넘겨도 `playing` 이 나오고, 새 액션들은 state 를 그대로 돌려준다.

- [ ] **Step 3: 구현한다**

`src/hooks/useGameReducer.js` — `CREATE_SOCCER_MATCH` case 안의 두 줄만 바꾼다(다른 줄 유지):

```js
        startedAt: action.startedAt === undefined ? Date.now() : action.startedAt,
        ourScore: 0, opponentScore: 0,
        // status 기본값 'playing' — 빅마스터FC 자체전만 'setup'(배치 중)으로 만든다(스펙 §16.3.1).
        status: action.status || "playing",
```

`PATCH_SOCCER_SIDE` case **바로 뒤**에 새 case 3개를 넣는다:

```js
    // [증분 4] 배치 중(setup) 경기의 편 배치·준비 플래그. A 는 최상위 배치 필드 + sideA 메타,
    // B 는 sideB 한 덩어리 — RTDB 경로가 달라 두 기기가 동시에 편집해도 서로 덮지 않는다(스펙 §16.3.2).
    case 'PATCH_SOCCER_SETUP': {
      const { matchIdx, side, patch } = action;
      const PLACE = ["lineup", "gk", "defenders", "formation", "assignments", "positionMap", "subs"];
      const META = ["name", "ready", "readyBy"];
      const pick = (keys) => {
        const o = {};
        for (const k of keys) if (patch && patch[k] !== undefined) o[k] = patch[k];
        return o;
      };
      const matches = state.soccerMatches.map(m => {
        if (m.matchIdx !== matchIdx || m.status !== "setup") return m;
        if (side === 'A') return { ...m, ...pick(PLACE), sideA: { ...(m.sideA || {}), ...pick(META) } };
        return { ...m, sideB: { ...(m.sideB || {}), ...pick(PLACE), ...pick(META) } };
      });
      return { ...state, soccerMatches: matches };
    }
    // 양 팀 준비완료 → 경기 시작. 멱등 — 두 기기가 같이 보내도 두 번째는 state 를 그대로 돌려준다.
    case 'START_SOCCER_MATCH': {
      const { matchIdx, startedAt } = action;
      let changed = false;
      const matches = state.soccerMatches.map(m => {
        if (m.matchIdx !== matchIdx || m.status !== "setup") return m;
        changed = true;
        return { ...m, status: "playing", startedAt: startedAt || Date.now() };
      });
      if (!changed) return state;
      return { ...state, soccerMatches: matches, currentMatchIdx: matchIdx };
    }
    // 배치 취소. 마지막 경기이고 setup 일 때만 — 중간을 지우면 matchIdx === index 불변식이 깨진다.
    case 'DELETE_SOCCER_SETUP_MATCH': {
      const { matchIdx } = action;
      const last = state.soccerMatches[state.soccerMatches.length - 1];
      if (!last || last.matchIdx !== matchIdx || last.status !== "setup") return state;
      const matches = state.soccerMatches.slice(0, -1);
      return { ...state, soccerMatches: matches, currentMatchIdx: Math.min(state.currentMatchIdx, matches.length - 1) };
    }
```

- [ ] **Step 4: 통과와 회귀를 확인한다**

Run: `npx vitest run src/hooks/__tests__/`
Expected: 새 파일 PASS + 기존 `useGameReducer.*.test.js` 전부 PASS(수정 없이)

- [ ] **Step 5: 커밋**

`git add src/hooks/useGameReducer.js src/hooks/__tests__/useGameReducer.setup.test.js`
커밋 메시지: `feat: 배치 중 경기 리듀서 — PATCH_SOCCER_SETUP·START_SOCCER_MATCH·DELETE_SOCCER_SETUP_MATCH`

---

### Task 3: 공유 잎 컴포넌트에 선택적 prop 추가

**Files:**
- Modify: `src/components/game/FormationSetup.jsx` (props 3개 추가)
- Modify: `src/components/game/FormationRecorder.jsx` (prop 1개 추가)
- Test: `src/components/game/__tests__/FormationSetup.initial.test.jsx`

**Interfaces:**
- Produces: `FormationSetup` 이 `initialFormation?: string`, `initialAssignments?: object`, `confirmLabel?: string` 를 받는다. `FormationRecorder` 가 `ourTeamLabel?: string` 을 받는다. **넷 다 없으면 기존 동작과 동일**해야 한다(하버FC 무영향).

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`src/components/game/__tests__/FormationSetup.initial.test.jsx`:

```jsx
// 스펙 §16.3.4 — 배치 중 노드는 저장된 초안을 FormationSetup 에 시드해서 연다.
// prop 을 안 넘기면 하버FC 와 동일해야 한다(추가만 원칙).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { ThemeProvider } from '../../../hooks/useTheme';
import FormationSetup from '../FormationSetup';

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (q) => ({ matches: false, media: q, onchange: null, addListener(){}, removeListener(){}, addEventListener(){}, removeEventListener(){}, dispatchEvent(){} }),
});
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let container, root;
beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); });
afterEach(() => { act(() => root?.unmount()); container.remove(); });

const PLAYERS = ['a1', 'a2', 'a3'];
async function mount(props = {}) {
  await act(async () => {
    root = createRoot(container);
    root.render(createElement(ThemeProvider, null, createElement(FormationSetup, {
      selectedPlayers: PLAYERS, onConfirm: () => {}, onBack: () => {}, ...props,
    })));
  });
}
const text = () => container.textContent;

describe('FormationSetup 선택적 초기 배치', () => {
  it('prop 이 없으면 빈 배치·"경기 시작" 버튼(기존 동작)', async () => {
    await mount();
    expect(text()).toContain('0/11');
    expect(text()).toContain('경기 시작');
    expect(text()).toContain('후보 (3)');
  });

  it('initialAssignments 를 주면 그 배치로 열리고 후보에서 빠진다', async () => {
    await mount({ initialAssignments: { 0: 'a1', 1: 'a2' }, initialFormation: '4-3-3', confirmLabel: '배치 저장' });
    expect(text()).toContain('2/11');
    expect(text()).toContain('후보 (1)');       // a3 만 남는다
    expect(text()).toContain('배치 저장');
  });

  it('확정 시 초기 배치가 onConfirm 으로 그대로 나간다', async () => {
    const onConfirm = vi.fn();
    const eleven = Object.fromEntries(Array.from({ length: 11 }, (_, i) => [i, `p${i}`]));
    await mount({ selectedPlayers: Array.from({ length: 11 }, (_, i) => `p${i}`), initialAssignments: eleven, onConfirm });
    await act(async () => {
      [...container.querySelectorAll('button')].find(b => b.textContent.trim() === '경기 시작').click();
    });
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm.mock.calls[0][0].assignments).toEqual(eleven);
    expect(onConfirm.mock.calls[0][0].subs).toEqual([]);
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run src/components/game/__tests__/FormationSetup.initial.test.jsx`
Expected: FAIL — 두 번째 케이스가 `0/11` 로 나온다(초기 배치 무시).

- [ ] **Step 3: 구현한다**

`src/components/game/FormationSetup.jsx` — 시그니처와 두 useState 만 바꾼다:

```jsx
// initialFormation/initialAssignments/confirmLabel: 빅마스터FC 배치 중 노드가 저장된 초안을 이어서 편집하려고
// 넘긴다(스펙 §16.3.4). 하버FC 호출부는 넘기지 않으므로 기존과 동일하게 빈 배치로 연다.
export default function FormationSetup({ selectedPlayers, onConfirm, onBack, title, initialFormation, initialAssignments, confirmLabel }) {
  const { C } = useTheme();
  const [formation, setFormation] = useState(initialFormation || "4-4-2");
  const [assignments, setAssignments] = useState(() => ({ ...(initialAssignments || {}) }));
```

그리고 확정 버튼의 라벨만:

```jsx
        {confirmLabel || "경기 시작"}
```

`src/components/game/FormationRecorder.jsx` — 시그니처에 `ourTeamLabel` 을 추가하고, `우리팀` 점수 라벨 한 곳만 바꾼다:

```jsx
          <div style={{ fontSize: 10, color: C.gray }}>{ourTeamLabel || "우리팀"}</div>
```

- [ ] **Step 4: 통과와 무영향을 확인한다**

Run: `npx vitest run src/components/game/__tests__/`
Expected: 전부 PASS

Run: `git diff --numstat src/components/game/FormationRecorder.jsx src/components/game/FormationSetup.jsx`
Expected: 삭제 줄은 시그니처·useState·라벨 치환분뿐. `SoccerMatchView.jsx`·`TournamentMatchManager.jsx` 는 diff 0.

- [ ] **Step 5: 커밋**

`git add src/components/game/FormationSetup.jsx src/components/game/FormationRecorder.jsx src/components/game/__tests__/FormationSetup.initial.test.jsx`
커밋 메시지: `feat: FormationSetup 초기 배치·확정 라벨, FormationRecorder 우리팀 라벨 — 전부 선택적 prop`

---

### Task 4: 배치 중 노드 — 생성·카드·편별 배치 저장

**Files:**
- Modify: `src/IntraSoccerApp.jsx` (핸들러 3개 + `createSoccerMatch` 인자 통과 + `authUserName` prop)
- Modify: `src/components/intra/IntraSoccerMatchView.jsx`
- Test: `src/components/intra/__tests__/IntraSoccerMatchView.smoke.test.jsx` (케이스 추가)

**Interfaces:**
- Consumes: Task 1 의 `setup.js` 전부, Task 2 의 액션 3개, Task 3 의 `FormationSetup` 초기 배치 prop.
- Produces (Task 5·6 이 이어서 쓴다): `IntraSoccerMatchView` 의 새 props `onPatchSetup(matchIdx, side, patch)`, `onStartMatch(matchIdx, startedAt)`, `onDeleteSetupMatch(matchIdx)`, `authUserName`; 내부 파생 `editablePos`/`hasEditable`/`isSetupNode`, 상태 `setupEdit`, 핸들러 `handleSetupConfirm`·`toggleReady`.

- [ ] **Step 1: IntraSoccerApp 에 핸들러를 배선한다**

`src/IntraSoccerApp.jsx` — `createSoccerMatch` 가 선택 인자까지 넘기게 고치고(기존 호출은 인자를 안 주므로 동작 동일), 핸들러 3개를 `patchSoccerSide` 옆에 추가한다:

```js
  const createSoccerMatch = ({ opponent, lineup, gk, defenders, subs, formation, assignments, positionMap, status, startedAt }) => {
    dispatch({ type: 'CREATE_SOCCER_MATCH', opponent, lineup, gk, defenders, subs, formation, assignments, positionMap, status, startedAt });
  };
  // [증분 4] 배치 중(setup) 경기 — 편별 배치·준비 플래그 저장, 시작, 취소(스펙 §16.3.2).
  const patchSoccerSetup = (matchIdx, side, patch) => {
    if (matchIdx < 0) return;
    dispatch({ type: 'PATCH_SOCCER_SETUP', matchIdx, side, patch });
  };
  const startSoccerMatch = (matchIdx, startedAt) => {
    if (matchIdx < 0) return;
    dispatch({ type: 'START_SOCCER_MATCH', matchIdx, startedAt });
  };
  const deleteSetupMatch = (matchIdx) => {
    if (matchIdx < 0) return;
    dispatch({ type: 'DELETE_SOCCER_SETUP_MATCH', matchIdx });
  };
```

`<IntraSoccerMatchView ... />` 에 props 를 추가한다(기존 줄은 유지):

```jsx
            onPatchSetup={patchSoccerSetup} onStartMatch={startSoccerMatch} onDeleteSetupMatch={deleteSetupMatch}
            authUserName={authUser?.name || ''}
```

- [ ] **Step 2: 실패하는 스모크 테스트를 쓴다**

`src/components/intra/__tests__/IntraSoccerMatchView.smoke.test.jsx` 끝에 추가한다. 기존 헬퍼(`mount`, `rerender`, `text`, `byText`, `byPartialText`, `click`, `container`, 팀 픽스처 `team`/`WHITE`/`BLACK`)를 그대로 쓴다.

```jsx
// 증분 4(스펙 §16): 자체전은 A·B 를 따로 배치하고 양 팀 준비완료로 시작한다.
describe('IntraSoccerMatchView 배치 중 노드 — 증분 4', () => {
  const T = [team('흰팀', WHITE), team('검은팀', BLACK)];
  const props = { attendees: [...WHITE, ...BLACK], savedFormation: { intra: { teams: T } } };
  const setupMatch = (over = {}) => ({
    matchIdx: 0, status: 'setup', startedAt: null, opponent: '검은팀',
    sideA: { name: '흰팀' }, sideB: { name: '검은팀' }, events: [], ...over,
  });

  it('자체전 시작이 배치 중 경기를 만들고 양 팀 이름을 저장한다', async () => {
    const onCreateMatch = vi.fn();
    const onPatchSetup = vi.fn();
    await mount({ ...props, onCreateMatch, onPatchSetup });
    await click(byPartialText('button', '자체전'));
    expect(onCreateMatch).toHaveBeenCalledTimes(1);
    expect(onCreateMatch.mock.calls[0][0]).toMatchObject({ status: 'setup', startedAt: null, opponent: '검은팀' });
    expect(onPatchSetup).toHaveBeenCalledWith(0, 'A', { name: '흰팀' });
    expect(onPatchSetup).toHaveBeenCalledWith(0, 'B', { name: '검은팀' });
  });

  it('배치 중 노드는 두 팀 카드와 진행 상태를 보여준다', async () => {
    await mount({ ...props, currentMatchIdx: 0,
      soccerMatches: [setupMatch({ assignments: Object.fromEntries(WHITE.map((n, i) => [i, n])) })] });
    expect(text()).toContain('배치 중');
    expect(text()).toContain('흰팀');
    expect(text()).toContain('검은팀');
    expect(text()).toContain('11/11');      // A 는 다 찼고
    expect(text()).toContain('0/11');       // B 는 비었다
  });

  it('편 배치 저장은 그 편만 패치하고 준비완료를 푼다', async () => {
    const onPatchSetup = vi.fn();
    await mount({ ...props, currentMatchIdx: 0, onPatchSetup,
      soccerMatches: [setupMatch({ sideA: { name: '흰팀', ready: true } })] });
    await click(byPartialText('button', '흰팀 배치'));
    // FormationSetup 전체화면 — 후보 칩 11개를 눌러 채운다(배치되면 목록에서 사라지므로 매번 다시 쿼리).
    const names = new Set(WHITE);
    for (let i = 0; i < 11; i++) {
      await click([...container.querySelectorAll('button')].find(b => names.has(b.textContent.trim())));
    }
    await click(byPartialText('button', '배치 저장'));
    expect(onPatchSetup).toHaveBeenCalledTimes(1);
    const [idx, side, patch] = onPatchSetup.mock.calls[0];
    expect(idx).toBe(0);
    expect(side).toBe('A');
    expect(patch.lineup).toHaveLength(11);
    expect(patch.ready).toBe(false);          // 배치를 고치면 준비완료가 풀린다
    expect(patch.readyBy).toBe(null);
  });

  it('B 배치 화면 후보에서 A 가 이미 쓴 유동 인원이 빠진다', async () => {
    await mount({ ...props, attendees: [...WHITE, ...BLACK, 'f1'], currentMatchIdx: 0,
      soccerMatches: [setupMatch({ assignments: { 0: 'f1' } })] });
    await click(byPartialText('button', '검은팀 배치'));
    expect(text()).not.toContain('f1');
  });
});
```

- [ ] **Step 3: 실패를 확인한다**

Run: `npx vitest run src/components/intra/__tests__/IntraSoccerMatchView.smoke.test.jsx`
Expected: FAIL — 자체전 버튼이 `formationA` 전체화면으로 가고 `onCreateMatch` 가 호출되지 않는다.

- [ ] **Step 4: 구현한다**

`src/components/intra/IntraSoccerMatchView.jsx`:

1) import 에 setup 로직을 추가한다.

```js
import { sideMeta, sideReady, sideStarters, bothReady, overlapStarters, setupPool, externalPool, canReady, canStartSetup } from '../../utils/intraSoccer/setup';
```

2) props 에 새 4개를 받는다(기존 목록 뒤에 추가).

```js
  onPatchSetup, onStartMatch, onDeleteSetupMatch, authUserName,
```

3) `pendingA` state 를 지우고 `setupEdit` 를 넣는다.

```js
  const [setupEdit, setSetupEdit] = useState(null);   // { side } — 배치 중 노드의 편 배치 편집(전체화면)
```

4) 연속체 파생에서 **편집 노드 판정만** 확장한다. `hasPlaying` 은 navLocked·레코더용으로 그대로 둔다(스펙 §16.3.4 경고).

```js
  const orderedMatches = [...soccerMatches].sort((a, b) => a.matchIdx - b.matchIdx);
  const playingPos = orderedMatches.findIndex(m => m.status === "playing");
  const hasPlaying = playingPos >= 0;                       // navLocked 해제·레코더 판정 전용(의미 유지)
  // [증분 4] 배치 중 노드도 편집 노드다 — 그동안 트레일링 '새 경기' 노드를 만들지 않는다.
  const editablePos = orderedMatches.findIndex(m => m.status === "playing" || m.status === "setup");
  const hasEditable = editablePos >= 0;
  const totalNodes = orderedMatches.length + (hasEditable ? 0 : 1);
  const editableIdx = hasEditable ? editablePos : orderedMatches.length;
```

그리고 구조 변경 감지 시그니처도 편집 노드 기준으로 바꾼다.

```js
  const sig = `${orderedMatches.length}:${editablePos}`;
```

5) 자체전 시작을 배치 중 경기 생성으로 바꾼다(기존 `startIntra` 교체).

```js
  // [증분 4] 자체전 시작 = 배치 중(setup) 경기 생성. 배치는 A·B 가 각자 채운다(스펙 §16.3.4).
  const startIntra = () => {
    if (!gate.ok || !teamA || !teamB) return;
    if (typeof onPatchSetup !== "function") throw new Error("IntraSoccerMatchView: onPatchSetup prop이 필요합니다(배치 중 경기 저장 불가)");
    if (blockIfRemoteStarted()) return;
    const newIdx = soccerMatches.length;
    onCreateMatch({
      status: 'setup', startedAt: null, opponent: teamB.name,
      lineup: [], gk: '', defenders: [], subs: [], formation: null, assignments: null, positionMap: null,
    });
    onPatchSetup(newIdx, 'A', { name: teamA.name });
    onPatchSetup(newIdx, 'B', { name: teamB.name });
    setMatchType(null);
  };
```

6) `viewState === "formationA" / "formationB"` 전체화면 분기 2개를 지우고 **배치 편집 분기 1개**로 바꾼다.

```jsx
  // [증분 4] 편 배치 편집 — 저장된 초안을 시드해서 연다(다른 사람이 짠 배치를 이어서 고칠 수 있다).
  if (setupEdit && node && node.status === "setup") {
    const side = setupEdit.side;
    const meta = sideMeta(node, side);
    const pool = setupPool({ teams, teamName: meta.name, attendees, excludeNames: sideStarters(node, side === 'A' ? 'B' : 'A') });
    const draft = side === 'A'
      ? { formation: node.formation, assignments: node.assignments }
      : { formation: node.sideB?.formation, assignments: node.sideB?.assignments };
    // 풀에서 사라진 이름(결석 처리·상대가 선점)은 시드에서 뺀다 — 후보에 없는 선수가 피치에 남는 것을 막는다.
    const inPool = new Set(pool);
    const seeded = Object.fromEntries(Object.entries(draft.assignments || {}).filter(([, n]) => inPool.has(n)));
    return (
      <div>
        <div style={{ fontSize: 11, color: C.gray, marginBottom: 8 }}>
          이 화면을 열어둔 동안 다른 기기의 같은 팀 배치 변경은 반영되지 않습니다 · 저장하면 내 배치로 덮어씁니다
        </div>
        <FormationSetup key={`setup-${node.matchIdx}-${side}`}
          selectedPlayers={pool}
          initialFormation={draft.formation || undefined}
          initialAssignments={seeded}
          confirmLabel="배치 저장"
          title={`${meta.name || side} 선발 11명`}
          onConfirm={(res) => handleSetupConfirm(side, res)}
          onBack={() => setSetupEdit(null)} />
      </div>
    );
  }
```

7) 배치 저장 핸들러를 넣는다(기존 `handleIntraConfirm` 은 지운다 — 더 이상 쓰지 않는다).

```js
  // [증분 4] 편 배치 저장. 배치를 고치면 그 편 준비완료를 푼다(스펙 §16.3.4).
  const handleSetupConfirm = (side, { formation, assignments, gk, positionMap, subs }) => {
    if (!node || node.status !== "setup") { setSetupEdit(null); return; }
    onPatchSetup(node.matchIdx, side, {
      formation, assignments, gk, positionMap, subs,
      lineup: Object.values(assignments),
      defenders: defendersFromPositionMap(positionMap),
      ready: false, readyBy: null,
    });
    setSetupEdit(null);
  };
```

8) 준비 토글.

```js
  // [증분 4] 준비완료 토글. 11명·중복 검사를 통과해야 켜진다(스펙 §16.3.4).
  const toggleReady = (side) => {
    if (!node || node.status !== "setup") return;
    if (sideReady(node, side)) { onPatchSetup(node.matchIdx, side, { ready: false, readyBy: null }); return; }
    const r = canReady(node, side);
    if (!r.ok) { alert(r.reason); return; }
    onPatchSetup(node.matchIdx, side, { ready: true, readyBy: authUserName || '' });
  };
```

9) 배치 중 노드 본문을 그린다. `atNewNode` 블록 **앞**에 넣는다.

```jsx
      {/* [증분 4] 배치 중 노드 — A·B 카드. 누구나 어느 편이든 고칠 수 있고, 양쪽 준비완료면 시작된다. */}
      {isSetupNode && node && (
        <div style={{ ...s.card }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.white, marginBottom: 4 }}>제{node.matchIdx + 1}경기 배치</div>
          <div style={{ fontSize: 11, color: C.gray, marginBottom: 10 }}>양 팀이 준비완료하면 경기가 시작됩니다</div>
          {['A', 'B'].map(sd => {
            const meta = sideMeta(node, sd);
            const n = sideStarters(node, sd).length;
            const ready = sideReady(node, sd);
            return (
              <div key={sd} style={{ background: C.cardLight, borderRadius: 10, padding: 12, marginBottom: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: C.white }}>{meta.name || sd}</div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: n === 11 ? C.green : C.gray }}>{n}/11</div>
                  <div style={{ marginLeft: "auto", fontSize: 11, color: ready ? C.green : C.gray }}>
                    {ready ? `✅ 준비완료${meta.readyBy ? ` · ${meta.readyBy}` : ''}` : '배치 중'}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button onClick={() => setSetupEdit({ side: sd })}
                    style={{ flex: 1, padding: "10px 0", borderRadius: 8, border: "none", background: C.grayDark, color: C.white, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                    {n > 0 ? `${meta.name || sd} 배치 수정` : `${meta.name || sd} 배치하기`}
                  </button>
                  <button onClick={() => toggleReady(sd)}
                    style={{ flex: 1, padding: "10px 0", borderRadius: 8, border: "none", background: ready ? C.grayDark : C.accent, color: ready ? C.white : C.bg, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                    {ready ? '준비취소' : '준비완료'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
```

`isSetupNode` 파생은 `isPlayingNode` 옆에 넣고, 네비 문구도 배치 중을 넣는다.

```js
  const isSetupNode = !!node && node.status === "setup";
  const navStatusText = atNewNode ? "새 경기" : isRest ? "휴식" : isSetupNode ? "배치 중" : isPlayingNode ? "진행중" : "종료됨";
  const navStatusTone = isSetupNode ? "gray" : isPlayingNode ? "orange" : atNewNode ? "gray" : "green";
```

10) `canEditNode` 는 배치 중 노드에서 "출전 수정" 줄을 띄우지 않게 한다(배치 화면이 따로 있다).

```js
  const canEditNode = !!node && !atNewNode && !isRest && node.status === "playing";
```

- [ ] **Step 5: 통과를 확인한다**

Run: `npx vitest run src/components/intra/__tests__/IntraSoccerMatchView.smoke.test.jsx`
Expected: 새 4케이스 PASS + **기존 케이스 전부 무수정 PASS**.
기존 스모크는 옛 A→B 전체화면 흐름을 클릭으로 단정하지 않는다 — 유형 카드 상태(`자체전 (흰팀 vs 검은팀 · 참석 22명)` 버튼의 라벨·disabled, :76-111), 저장 시 `savedFormation.intra` 보존(:123), 종료·진행중 노드 렌더(:139,:161)만 본다. 이번 변경은 그 단정을 건드리지 않아야 하므로, **기존 케이스가 깨지면 테스트를 고치지 말고 구현을 고친다**(회귀 신호다).

- [ ] **Step 6: 커밋**

`git add src/IntraSoccerApp.jsx src/components/intra/IntraSoccerMatchView.jsx src/components/intra/__tests__/IntraSoccerMatchView.smoke.test.jsx`
커밋 메시지: `feat: 자체전 배치 중 노드 — A/B 카드·편별 배치 저장(준비완료 자동 해제)`

---

### Task 5: 자동 시작·중복 가드·배치 취소·생성 가드 확장

**Files:**
- Modify: `src/components/intra/IntraSoccerMatchView.jsx`
- Test: `src/components/intra/__tests__/IntraSoccerMatchView.smoke.test.jsx`

**Interfaces:**
- Consumes: Task 4 의 `setupEdit`·카드·`toggleReady`, Task 1 의 `bothReady`·`canStartSetup`·`overlapStarters`, Task 2 의 `START_SOCCER_MATCH`·`DELETE_SOCCER_SETUP_MATCH`.

- [ ] **Step 1: 실패하는 테스트를 쓴다** (같은 스모크 파일에 추가)

```jsx
describe('IntraSoccerMatchView 배치 중 — 시작과 취소', () => {
  const T = [team('흰팀', WHITE), team('검은팀', BLACK)];
  const base = { attendees: [...WHITE, ...BLACK], savedFormation: { intra: { teams: T } } };
  const elevenOf = (arr) => Object.fromEntries(arr.map((n, i) => [i, n]));
  const setupMatch = (over = {}) => ({
    matchIdx: 0, status: 'setup', startedAt: null, opponent: '검은팀',
    sideA: { name: '흰팀' }, sideB: { name: '검은팀' }, events: [], ...over,
  });
  const filled = (over = {}) => setupMatch({
    assignments: elevenOf(WHITE),
    sideB: { name: '검은팀', assignments: elevenOf(BLACK) },
    ...over,
  });

  it('한 팀만 준비완료면 경기를 시작하지 않는다', async () => {
    const onStartMatch = vi.fn();
    await mount({ ...base, currentMatchIdx: 0, onStartMatch,
      soccerMatches: [filled({ sideA: { name: '흰팀', ready: true } })] });
    expect(onStartMatch).not.toHaveBeenCalled();
  });

  it('양 팀 준비완료가 되면 경기를 시작한다', async () => {
    const onStartMatch = vi.fn();
    await mount({ ...base, currentMatchIdx: 0, onStartMatch,
      soccerMatches: [filled({
        sideA: { name: '흰팀', ready: true },
        sideB: { name: '검은팀', ready: true, assignments: elevenOf(BLACK) },
      })] });
    expect(onStartMatch).toHaveBeenCalledTimes(1);
    expect(onStartMatch.mock.calls[0][0]).toBe(0);
  });

  it('11명 미만이면 준비완료를 막는다', async () => {
    const onPatchSetup = vi.fn();
    const alertSpy = vi.fn(); const realAlert = window.alert; window.alert = alertSpy;
    try {
      await mount({ ...base, currentMatchIdx: 0, onPatchSetup,
        soccerMatches: [setupMatch({ assignments: { 0: WHITE[0] } })] });
      await click([...container.querySelectorAll('button')].find(b => b.textContent.trim() === '준비완료'));
      expect(onPatchSetup).not.toHaveBeenCalled();
      expect(alertSpy).toHaveBeenCalledWith(expect.stringContaining('11명'));
    } finally { window.alert = realAlert; }
  });

  it('양 팀에 같은 선수가 있으면 시작하지 않고 양쪽 준비를 푼다', async () => {
    const onStartMatch = vi.fn(); const onPatchSetup = vi.fn();
    const alertSpy = vi.fn(); const realAlert = window.alert; window.alert = alertSpy;
    try {
      const dup = [...BLACK.slice(0, 10), WHITE[0]];          // 흰팀 선발 1명이 검은팀에도 있다
      await mount({ ...base, currentMatchIdx: 0, onStartMatch, onPatchSetup,
        soccerMatches: [filled({
          sideA: { name: '흰팀', ready: true },
          sideB: { name: '검은팀', ready: true, assignments: elevenOf(dup) },
        })] });
      expect(onStartMatch).not.toHaveBeenCalled();
      expect(onPatchSetup).toHaveBeenCalledWith(0, 'A', { ready: false, readyBy: null });
      expect(onPatchSetup).toHaveBeenCalledWith(0, 'B', { ready: false, readyBy: null });
      expect(alertSpy).toHaveBeenCalledWith(expect.stringContaining(WHITE[0]));
    } finally { window.alert = realAlert; }
  });

  it('배치 취소는 마지막 배치 중 경기를 지운다', async () => {
    const onDeleteSetupMatch = vi.fn();
    const realConfirm = window.confirm; window.confirm = () => true;
    try {
      await mount({ ...base, currentMatchIdx: 0, onDeleteSetupMatch, soccerMatches: [setupMatch()] });
      await click(byPartialText('button', '배치 취소'));
      expect(onDeleteSetupMatch).toHaveBeenCalledWith(0);
    } finally { window.confirm = realConfirm; }
  });

  it('배치 중 경기가 있으면 새 경기 유형 카드를 띄우지 않는다(중복 생성 차단)', async () => {
    const onCreateMatch = vi.fn();
    await mount({ ...base, currentMatchIdx: 0, onCreateMatch, soccerMatches: [setupMatch()] });
    expect(byPartialText('button', '자체전')).toBeFalsy();
    expect(onCreateMatch).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run src/components/intra/__tests__/IntraSoccerMatchView.smoke.test.jsx -t '시작과 취소'`
Expected: FAIL — `onStartMatch` 가 호출되지 않고 `배치 취소` 버튼이 없다.

- [ ] **Step 3: 구현한다**

1) 준비 상태 지문과 자동 시작 effect. **최상위**(early return 보다 위, 다른 훅들과 같은 자리)에 둔다.

```js
  // [증분 4] 양 팀 준비완료 감지용 지문 — effect 의존성으로 쓴다(객체 비교 회피).
  const setupNode = orderedMatches.find(m => m.status === "setup") || null;
  const readyFp = setupNode
    ? `${setupNode.matchIdx}:${sideReady(setupNode, 'A')}:${sideReady(setupNode, 'B')}:${overlapStarters(setupNode).join(',')}:${sideStarters(setupNode, 'A').length}:${sideStarters(setupNode, 'B').length}`
    : '';

  // 양 팀 준비완료 → 경기 시작. 렌더 중 dispatch 금지라 effect 에서 한 번만 보낸다.
  // 멱등이라 두 기기가 동시에 보내도 리듀서가 두 번째를 무시한다(스펙 §16.3.2).
  useEffect(() => {
    if (!setupNode || !bothReady(setupNode)) return;
    const r = canStartSetup(setupNode);
    if (!r.ok) {
      // 동시 선택 경합으로 같은 선수가 양 팀에 들어간 경우 — 시작하지 않고 양쪽 준비를 푼다.
      onPatchSetup(setupNode.matchIdx, 'A', { ready: false, readyBy: null });
      onPatchSetup(setupNode.matchIdx, 'B', { ready: false, readyBy: null });
      alert(`경기를 시작할 수 없습니다 — ${r.reason}`);
      return;
    }
    onStartMatch(setupNode.matchIdx, Date.now());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readyFp]);
```

2) 배치 취소 핸들러와 버튼(배치 중 카드 블록 끝, 카드 목록 뒤).

```js
  // [증분 4] 배치 취소 = 배치 중 경기 삭제. 마지막 경기만 — 중간을 지우면 matchIdx 불변식이 깨진다.
  const cancelSetup = () => {
    if (!node || node.status !== "setup") return;
    if (node.matchIdx !== soccerMatches.length - 1) { alert('마지막 경기만 취소할 수 있습니다.'); return; }
    if (!confirm('배치 중인 경기를 취소하시겠습니까?')) return;
    onDeleteSetupMatch(node.matchIdx);
  };
```

```jsx
          <button onClick={cancelSetup}
            style={{ width: "100%", padding: "10px 0", borderRadius: 10, border: `1px dashed ${C.grayDark}`, background: "transparent", fontSize: 12, color: C.gray, cursor: "pointer" }}>
            배치 취소
          </button>
```

3) 생성 가드를 배치 중까지 넓힌다(`pendingA` 정리 줄은 Task 4 에서 이미 없어졌다).

```js
  const blockIfRemoteStarted = () => {
    if (!soccerMatches.some(m => m.status === 'playing' || m.status === 'setup')) return false;
    alert('이미 진행 중이거나 배치 중인 경기가 있습니다(다른 기기에서 시작했거나 방금 생성됨).');
    setMatchType(null);
    setSetupEdit(null);
    setViewState('selectOpponent');
    return true;
  };
```

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run src/components/intra/__tests__/IntraSoccerMatchView.smoke.test.jsx`
Expected: 전부 PASS

- [ ] **Step 5: 커밋**

`git add src/components/intra/IntraSoccerMatchView.jsx src/components/intra/__tests__/IntraSoccerMatchView.smoke.test.jsx`
커밋 메시지: `feat: 양 팀 준비완료 시 경기 시작·중복 선수 차단·배치 취소·생성 가드 확장`

---

### Task 6: 외부전 — 우리 팀 선택과 로그 팀 이름

**Files:**
- Modify: `src/components/intra/IntraSoccerMatchView.jsx`
- Modify: `src/utils/intraSoccer/buildIntraRows.js`
- Test: `src/components/intra/__tests__/IntraSoccerMatchView.smoke.test.jsx`, `src/utils/intraSoccer/__tests__/buildIntraRows.test.js`

**Interfaces:**
- Consumes: Task 1 의 `externalPool`, Task 3 의 `ourTeamLabel`, 기존 액션 `PATCH_SOCCER_SIDE`(A 는 `name` 만 허용하므로 그대로 쓴다).
- Produces: 경기 객체의 `sideA.name`(외부전에도 존재), 동기 필드 `savedFormation.intra.selectedOurTeam`.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

스모크 파일에 추가:

```jsx
describe('IntraSoccerMatchView 외부전 우리 팀 선택 — 증분 4', () => {
  const T = [team('흰팀', WHITE), team('검은팀', BLACK)];
  const base = { attendees: [...WHITE, ...BLACK, 'f1'], savedFormation: { intra: { teams: T } } };

  it('외부전을 고르면 우리 팀을 먼저 고르게 한다', async () => {
    await mount(base);
    await click(byPartialText('button', '외부전'));
    expect(text()).toContain('우리 팀');
    expect(text()).toContain('흰팀');
    expect(text()).toContain('검은팀');
  });

  it('우리 팀을 고르면 후보가 그 팀 소속만 나온다(유동 인원·다른 팀 제외)', async () => {
    await mount({ ...base,
      savedFormation: { viewState: 'formation', selectedOpponent: 'aaa', intra: { teams: T, selectedOurTeam: '흰팀' } } });
    expect(text()).toContain('흰팀 선발 11명');
    expect(text()).not.toContain('f1');
    expect(text()).not.toContain(BLACK[0]);
  });

  it('외부전 경기를 만들 때 우리 팀 이름을 sideA 에 저장한다', async () => {
    const onCreateMatch = vi.fn(); const onPatchSide = vi.fn();
    await mount({ ...base, onCreateMatch, onPatchSide,
      savedFormation: { viewState: 'formation', selectedOpponent: 'aaa', intra: { teams: T, selectedOurTeam: '흰팀' } } });
    const names = new Set(WHITE);
    for (let i = 0; i < 11; i++) {
      await click([...container.querySelectorAll('button')].find(b => names.has(b.textContent.trim())));
    }
    await click(byPartialText('button', '경기 시작'));
    expect(onCreateMatch).toHaveBeenCalledTimes(1);
    expect(onPatchSide).toHaveBeenCalledWith(0, 'A', { name: '흰팀' });
  });
});
```

`src/utils/intraSoccer/__tests__/buildIntraRows.test.js` 에 추가한다. 이 파일에는 이미 외부전 픽스처 `external`(파일 :26)과 상수 `T`(팀 이름)·`D`(날짜)·`IT`(입력시각)가 있고, 첫 describe 가 "외부전 = 하버FC 출력과 deep-equal"(:68-70)을 지킨다. **그 케이스는 손대지 않는다** — `external` 에는 `sideA` 가 없으므로 이번 변경 뒤에도 그대로 통과해야 한다(그게 회귀 가드다).

```js
  it('외부전에 우리 팀 이름이 있으면 로그_이벤트 our_team·로그_매치 our_team_name 이 그 이름이 된다', () => {
    const named = { ...external, sideA: { name: '흰팀' } };
    const out = buildIntraRows({ team: T, dateStr: D, inputTime: IT, finished: [named] });
    expect(out.rawEvents.length).toBeGreaterThan(0);
    for (const r of out.rawEvents) expect(r.our_team).toBe('흰팀');
    expect(out.matchRows[0].our_team_name).toBe('흰팀');
    expect(out.matchRows[0].team).toBe(T);                          // 팀 열은 그대로
  });
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run src/components/intra/__tests__/IntraSoccerMatchView.smoke.test.jsx src/utils/intraSoccer/__tests__/buildIntraRows.test.js`
Expected: FAIL — 외부전이 전체 참석자를 후보로 주고 `our_team` 이 `빅마스터FC` 다.

- [ ] **Step 3: 화면을 구현한다**

`IntraSoccerMatchView.jsx`:

1) 우리 팀 선택 상태(동기 필드).

```js
  // [증분 4] 외부전에서 뛰는 우리 팀. 팀이 하나뿐이면 자동 선택. 인덱스가 아니라 이름으로 저장한다
  // (시트를 다시 읽으면 순서가 바뀔 수 있다).
  const selectedOurTeam = intra.selectedOurTeam || (teams.length === 1 ? teams[0].name : null);
  const setOurTeam = (name) => saveFormationState({ intra: { ...intra, teams, selectedOurTeam: name } });
```

2) 외부전 분기에서 팀을 먼저 고르게 한다(기존 `matchType === "외부전"` 블록의 `OpponentSelector` 를 감싼다).

```jsx
              {!selectedOurTeam ? (
                <>
                  <div style={{ fontSize: 13, fontWeight: 800, color: C.white, marginBottom: 8 }}>우리 팀 선택</div>
                  {teams.map(t => {
                    const n = t.players.filter(p => attendees.includes(p)).length;
                    return (
                      <button key={t.name} onClick={() => setOurTeam(t.name)}
                        style={{ ...s.btnFull(C.cardLight, C.white), marginBottom: 6, opacity: n >= 11 ? 1 : 0.6 }}>
                        {t.name} (참석 {n}명)
                      </button>
                    );
                  })}
                </>
              ) : (
                <>
                  <button onClick={() => setOurTeam(null)}
                    style={{ marginBottom: 8, fontSize: 12, padding: "4px 10px", borderRadius: 8, background: C.grayDark, color: C.white, border: "none", cursor: "pointer" }}>
                    ← 우리 팀 변경 (현재: {selectedOurTeam})
                  </button>
                  <OpponentSelector opponents={opponents} onSelect={handleOpponentSelect} onAddOpponent={onAddOpponent}
                    onRemoveOpponent={onRemoveOpponent} onRenameOpponent={onRenameOpponent} styles={s} />
                </>
              )}
```

3) 외부전 배치 화면의 후보를 그 팀으로 좁힌다(기존 `viewState === "formation" && selectedOpponent` 분기).

```jsx
      <FormationSetup key={`setup-ext-${selectedOurTeam || ''}`}
        selectedPlayers={selectedOurTeam ? externalPool({ teams, teamName: selectedOurTeam, attendees }) : attendees}
        onConfirm={handleFormationConfirm} onBack={() => setViewState("selectOpponent")}
        title={`${selectedOurTeam ? `${selectedOurTeam} 선발 11명 · ` : ''}vs ${selectedOpponent}`} />
```

4) 생성 시 팀 이름을 저장한다(`handleFormationConfirm` 안).

```js
    const newIdx = soccerMatches.length;
    onCreateMatch({ opponent: selectedOpponent, lineup, gk, defenders, subs, formation, assignments, positionMap });
    // 외부전에도 우리 팀 이름을 남긴다 — 화면 라벨과 로그(our_team)의 소스(스펙 §16.3.5).
    if (selectedOurTeam) onPatchSide(newIdx, 'A', { name: selectedOurTeam });
```

5) 레코더 라벨을 넘긴다(진행 중 노드의 `<FormationRecorder ... />`).

```jsx
              ourTeamLabel={isIntraMatch ? (side === 'A' ? fieldsOfA(currentMatch).name : fieldsOfB(currentMatch).name) : (currentMatch.sideA?.name || undefined)}
```

- [ ] **Step 4: 로그 빌더를 구현한다**

`src/utils/intraSoccer/buildIntraRows.js`:

```js
import { normalizeMatchId } from '../matchIdNormalizer';
```

외부전 블록에서 이름 맵을 만들고(`extEvents` 선언 뒤), `extMatchRows`·`extRaw` 끝에 `.map(...)` 을 붙인다. **행을 인덱스로 짝짓지 않는다** — `buildRawEventsFromSoccer` 는 모르는 이벤트를 건너뛰어 입력과 1:1 이 아니다.

```js
  // [증분 4] 외부전 우리 팀 이름(스펙 §16.3.5). sideA.name 이 있는 경기만 덮는다 — 없으면 하버FC 출력과 deep-equal 유지.
  const extNamed = external.filter((m) => m.sideA && m.sideA.name);
  const nameByRawId = new Map(extNamed.map((m) => [normalizeMatchId(String(m.matchIdx + 1), '축구'), m.sideA.name]));
  const nameByMatchIdx = new Map(extNamed.map((m) => [m.matchIdx + 1, m.sideA.name]));
```

```js
  }).map((r) => (nameByMatchIdx.has(r.match_idx) ? { ...r, our_team_name: nameByMatchIdx.get(r.match_idx) } : r));
```

```js
  const extRaw = buildRawEventsFromSoccer({ team, gameId: sessionGameId, events: extEvents })
    .map((r) => (nameByRawId.has(r.match_id) ? { ...r, our_team: nameByRawId.get(r.match_id) } : r));
```

- [ ] **Step 5: 통과를 확인한다**

Run: `npx vitest run src/components/intra/__tests__/ src/utils/intraSoccer/__tests__/`
Expected: 전부 PASS(기존 "외부전 = 하버FC deep-equal" 케이스 포함 — 픽스처에 `sideA` 가 없으므로 그대로 통과해야 한다)

- [ ] **Step 6: 커밋**

`git add src/components/intra/IntraSoccerMatchView.jsx src/utils/intraSoccer/buildIntraRows.js src/components/intra/__tests__/IntraSoccerMatchView.smoke.test.jsx src/utils/intraSoccer/__tests__/buildIntraRows.test.js`
커밋 메시지: `feat: 외부전 우리 팀 선택 — 그 팀 소속만 후보·sideA 이름 저장·로그 our_team 반영`

---

### Task 7: 격리 검증과 스펙 상태 갱신

**Files:**
- Modify: `docs/superpowers/specs/2026-09-10-bigmaster-intrasquad-soccer-design.md` (상태 줄)

- [ ] **Step 1: 전체 스위트·빌드·lint**

Run: `npx vitest run`
Run: `npm run build`
Run: `npx eslint src/utils/intraSoccer src/components/intra src/IntraSoccerApp.jsx src/hooks/useGameReducer.js src/components/game/FormationSetup.jsx src/components/game/FormationRecorder.jsx`
Expected: 테스트 실패 0, 빌드 성공, eslint error 0(경고 수는 기존과 같아야 한다).

- [ ] **Step 2: 화이트리스트 위반 0 확인**

Run: `git diff --name-only cafc594 -- src | grep -v -E '^src/(utils/intraSoccer/|components/intra/|IntraSoccerApp\.jsx|hooks/(useGameReducer\.js|__tests__/)|components/game/(FormationSetup\.jsx|FormationRecorder\.jsx|__tests__/))'`
Expected: 빈 출력

- [ ] **Step 3: 하버FC 무접촉 증명**

Run: `git diff --stat cafc594 -- src/SoccerApp.jsx src/App.jsx src/TennisApp.jsx src/components/game/SoccerMatchView.jsx src/components/tournament/TournamentMatchManager.jsx src/services/firebaseSyncDiff.js src/hooks/useFirebaseSync.js apps-script/`
Expected: 빈 출력

Run: `grep -rn "ourTeamLabel\|initialAssignments\|confirmLabel\|onBusyChange" src/components/game/SoccerMatchView.jsx src/components/tournament/TournamentMatchManager.jsx`
Expected: 빈 출력(하버FC 호출부는 새 prop 을 하나도 넘기지 않는다 = 기본 동작)

- [ ] **Step 4: 스펙 상태를 갱신하고 커밋**

상태 줄의 `**§16 설계 승인 — 구현 대기**` 를 `**§16 구현 완료**(브랜치 feature/bigmaster-s16, 테스트 <N> 통과)` 로 바꾼다.

`git add docs/superpowers/specs/2026-09-10-bigmaster-intrasquad-soccer-design.md`
커밋 메시지: `docs: 스펙 상태 — §16(증분 4) 구현 완료`
