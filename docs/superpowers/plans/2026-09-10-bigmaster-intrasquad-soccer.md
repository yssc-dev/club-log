# 빅마스터FC 자체 축구전 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 빅마스터FC(신규 축구 팀)가 A팀 vs B팀 11v11 자체전을 한 기기에서 기록·마감할 수 있게 `IntraSoccerApp`을 만든다 — 하버FC·마스터FC 코드 경로·데이터 영향 0.

**Architecture:** 경기 1개 = RTDB 레코드 1개(A팀 = 기존 '우리' 필드, B팀 = `sideB`). 모든 읽기(레코더·편집기·완료 패널·결과표·빌더·아카이브)는 순수함수 `sideView(m, side)`로 하버FC 모양 경기를 얻어 기존 잎 컴포넌트·빌더를 무수정 재사용한다. 오케스트레이션(`SoccerApp`·`SoccerMatchView`·`SoccerMatchResults`·`SoccerArchiveDetail`)만 `Intra*`로 복사해 고친다. 공유 파일 변경은 Root 분기·settings 프리셋·리듀서 새 case 1개·soccerAnalytics 4함수의 `mode==='자체전'` 분기·HistoryView 분기뿐이다.

**Tech Stack:** React 18 + Vite, vitest(jsdom, `globals:false` — `import { describe, it, expect } from 'vitest'` 필수), Firebase RTDB, Google Apps Script(변경 없음).

**Spec:** `docs/superpowers/specs/2026-09-10-bigmaster-intrasquad-soccer-design.md` — 구현자는 §4(모델)·§5(sideView)·§6(화면)·§7(마감)·§8(분석)·§9(접촉 면)을 읽고 작업한다.

## Global Constraints

- **하버FC·마스터FC 무영향.** 아래 "변경 허용 기존 파일" 외의 기존 파일은 **한 줄도 바꾸지 않는다**: `src/Root.jsx`, `src/config/settings.js`, `src/hooks/useGameReducer.js`, `src/components/history/HistoryView.jsx`, `src/utils/soccerAnalytics/calcDefenseAnalysis.js`, `calcOpponentBreakdown.js`, `calcOpponentLeaders.js`, `calcOpponentDefense.js`. 신규 파일은 자유. `SoccerApp.jsx`·`SoccerMatchView.jsx`·`SoccerMatchResults.jsx`·`SoccerArchiveDetail.jsx`·`FormationRecorder.jsx`·`FormationSetup.jsx`·`LineupEditView.jsx`·`soccerScoring.js`·`matchRowBuilder.js`·`rawLogBuilders.js`·`formations.js`·`firebaseSyncDiff.js`·`App.jsx`·`analyticsV2/**`·`TeamDashboard.jsx`·Apps Script는 **무수정**.
- 공유 파일 변경은 "기존 팀이 진입하지 않는 분기"만: 하버FC 행은 `mode`가 `'기본'` 또는 `''`, 경기 객체에 `sideB` 없음, 설정에 `intraSquad` 없음.
- 기존 테스트(1666개) **무수정** 전부 통과. 새 테스트는 `src/**/__tests__/*.test.js`.
- 자체전 저장 이벤트에 `opponentGoal`/`opponentOwnGoal`은 존재하지 않는다(오케스트레이터가 가로챈다). 이벤트 `side` 누락은 `'A'`로 간주.
- `IntraSoccerApp.jsx`·`src/components/intra/*.jsx`는 `m.ourScore`/`m.opponentScore`를 **읽지 않는다**(Task 11 정적 테스트).
- 모든 헬퍼 이름·시그니처는 이 문서에 적힌 그대로: `isIntra(m)`, `fieldsOfA(m)`, `fieldsOfB(m)`, `sideView(m, side)`, `subPool(m, side, attendees)`, `planAddEvent(m, side, ev)`, `planDeleteEvent(m, matchIdx, eventId)`, `sideBSwapPatch(m, aIdx, bIdx)`, `sideBCorrectPatch(m, out, inn)`, `pickSidePatch(updates)`, `buildIntraRows({ team, dateStr, inputTime, finished })`, `parseSideExtras(json)`, `expandIntraMatchRows(matchLogs)`, 리듀서 액션 `PATCH_SOCCER_SIDE`.
- 브랜치 `feature/bigmaster-intrasquad` (worktree 격리), 태스크마다 커밋. 커밋 메시지 한국어 `feat:`/`test:`/`docs:` 접두.

---

## File Structure

| 파일 | 책임 |
|---|---|
| `src/utils/intraSoccer/sideView.js` (신규) | `isIntra`·`fieldsOfA`·`fieldsOfB`·`sideView` — 저장 경기 → 편 기준 하버FC 모양 뷰. 빈 배열 복구 단일 지점 |
| `src/utils/intraSoccer/subPool.js` (신규) | 편별 교체 후보 풀 |
| `src/utils/intraSoccer/handlers.js` (신규) | 오케스트레이터 순수 로직: `planAddEvent`·`planDeleteEvent`·`sideBSwapPatch`·`sideBCorrectPatch`·`pickSidePatch` |
| `src/utils/intraSoccer/buildIntraRows.js` (신규) | 마감 5시트 행 빌더(외부전 = 하버FC 경로 그대로, 자체전 = 시점 뷰 + 후처리) |
| `src/utils/soccerAnalytics/parseSideExtras.js` (신규) | `opponent_members_json` 객체형의 `formation`/`defenders` 접근자 |
| `src/utils/soccerAnalytics/expandIntraMatchRows.js` (신규) | 자체전 로그_매치 1행 → 하버FC 모양 2행(수비 분석 전처리) |
| `src/hooks/useGameReducer.js` (수정: case 1개 추가) | `PATCH_SOCCER_SIDE` |
| `src/config/settings.js` (수정: 추가만) | 프리셋 `자체전축구`, `PRESET_MAP['빅마스터FC']` |
| `src/utils/soccerAnalytics/calcDefenseAnalysis.js` 외 3 (수정: 분기 추가) | `mode==='자체전'` 처리 |
| `src/components/intra/IntraSoccerMatchView.jsx` (신규, SoccerMatchView 복사) | 경기 유형 선택·A/B 배치·A/B 탭 기록·완료 패널 |
| `src/components/intra/IntraSoccerMatchResults.jsx` (신규, SoccerMatchResults 복사) | 자체전 양팀 득점자 표 |
| `src/components/intra/IntraSoccerArchiveDetail.jsx` (신규, SoccerArchiveDetail 복사) | 아카이브 상세(양팀 선수 기록) |
| `src/IntraSoccerApp.jsx` (신규, SoccerApp 복사) | 오케스트레이션·마감 |
| `src/Root.jsx`, `src/components/history/HistoryView.jsx` (수정: 분기 추가) | 진입·아카이브 분기 |

---

### Task 1: 설정 프리셋 — `자체전축구` + `PRESET_MAP['빅마스터FC']`

**Files:**
- Modify: `src/config/settings.js:62-66` (PRESETS.축구), `:75-78` (PRESET_MAP)
- Test: `src/config/__tests__/settings.intra.test.js`

**Interfaces:**
- Produces: `getEffectiveSettings('빅마스터FC','축구').intraSquad === true`(RTDB 노드가 프리셋 `자체전축구`로 생성된 뒤), `resolvePreset('빅마스터FC','축구') === '자체전축구'`, `getPresetValue('축구','자체전축구','intraSquad') === true`. Task 10(IntraSoccerApp)·Task 12(Root)가 `intraSquad`를 읽는다.

- [ ] **Step 1: 실패하는 테스트 작성**

```js
// src/config/__tests__/settings.intra.test.js
import { describe, it, expect } from 'vitest';
import { resolvePreset, getPresetValue, PRESETS } from '../settings';

describe('빅마스터FC 자체전 프리셋', () => {
  it('빅마스터FC 축구는 자체전축구 프리셋으로 해석된다', () => {
    expect(resolvePreset('빅마스터FC', '축구')).toBe('자체전축구');
  });
  it('자체전축구 프리셋은 intraSquad=true 를 갖는다', () => {
    expect(getPresetValue('축구', '자체전축구', 'intraSquad')).toBe(true);
    expect(PRESETS.축구['자체전축구'].values).toEqual({ intraSquad: true });
  });
  it('하버FC·마스터FC 해석은 바뀌지 않는다', () => {
    expect(resolvePreset('하버FC', '축구')).toBe('표준축구');
    expect(resolvePreset('마스터FC', '풋살')).toBe('마스터FC풋살');
    expect(getPresetValue('축구', '표준축구', 'intraSquad')).toBeUndefined();
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/config/__tests__/settings.intra.test.js`
Expected: FAIL — `resolvePreset` returns `'표준축구'`, `PRESETS.축구['자체전축구']` undefined.

- [ ] **Step 3: 구현(추가만)**

`src/config/settings.js` `PRESETS.축구` 안, `"표준축구"` 항목 뒤에:
```js
    "자체전축구": {
      description: "자체전(A/B 모두 우리 회원) + 외부전 — 빅마스터FC",
      // intraSquad: Root 가 IntraSoccerApp 을 고르는 게이트. 다른 프리셋에는 이 키가 없다.
      values: { intraSquad: true },
    },
```
`PRESET_MAP`에 항목 추가:
```js
const PRESET_MAP = {
  "마스터FC": { 풋살: "마스터FC풋살" },
  "빅마스터FC": { 축구: "자체전축구" },
  _default: { 풋살: "표준풋살", 축구: "표준축구", 테니스: "표준테니스" },
};
```

- [ ] **Step 4: 통과 확인 + 기존 settings 테스트**

Run: `npx vitest run src/config`
Expected: PASS (신규 3 + 기존 전부).

- [ ] **Step 5: Commit**

```bash
git add src/config/settings.js src/config/__tests__/settings.intra.test.js
git commit -m "feat: 빅마스터FC 자체전축구 프리셋(intraSquad) 추가"
```

---

### Task 2: `sideView` — 편 기준 시점 뷰(핵심 순수함수)

**Files:**
- Create: `src/utils/intraSoccer/sideView.js`
- Test: `src/utils/intraSoccer/__tests__/sideView.test.js`

**Interfaces:**
- Produces:
  - `isIntra(m) → boolean` (= `!!(m && m.sideB)`)
  - `fieldsOfA(m) → { name, lineup, gk, defenders, formation, assignments, positionMap, subs }` (배열은 항상 배열, name 기본 `'A팀'`)
  - `fieldsOfB(m) → 같은 모양` (name 기본 `'B팀'`)
  - `sideView(m, 'A'|'B') → 하버FC 모양 경기 객체`. 외부전(`!isIntra`)은 **입력 참조 그대로** 반환. 자체전은 `{ ...m(sideA/sideB 제거), ...fieldsOf(side), opponent: 상대 편 name, events: 변환 }`.
  - events 변환 규칙: `(e.side||'A') === side` → 그대로. 상대 편 `goal` → `{ type:'opponentGoal', currentGk: e.concedeGk||'', id: e.id, timestamp: e.timestamp, mirrorOf: e.id }`. 상대 편 `owngoal` → `{ type:'opponentOwnGoal', id, timestamp, mirrorOf }`. 상대 편 그 외(sub/gkChange/카드/opponentGoal) → 제거.

- [ ] **Step 1: 실패하는 테스트 작성**

```js
// src/utils/intraSoccer/__tests__/sideView.test.js
import { describe, it, expect } from 'vitest';
import { isIntra, fieldsOfA, fieldsOfB, sideView } from '../sideView';

const intra = {
  matchIdx: 0, status: 'playing', startedAt: 1000, opponent: '파랑',
  lineup: ['a1', 'a2'], gk: 'a1', defenders: ['a2'], formation: '4-4-2',
  assignments: { 0: 'a1', 1: 'a2' }, positionMap: { a1: 'GK', a2: 'DF' }, subs: ['a3'],
  sideA: { name: '주황' },
  sideB: { name: '파랑', lineup: ['b1', 'b2'], gk: 'b1', defenders: ['b2'], formation: '4-3-3',
           assignments: { 0: 'b1', 1: 'b2' }, positionMap: { b1: 'GK', b2: 'DF' } /* subs 누락(RTDB 빈배열 소실) */ },
  events: [
    { id: 'e1', type: 'goal', side: 'A', player: 'a2', assist: 'a1', concedeGk: 'b1', timestamp: 10 },
    { id: 'e2', type: 'goal', side: 'B', player: 'b2', assist: null, concedeGk: 'a1', timestamp: 20 },
    { id: 'e3', type: 'owngoal', side: 'B', player: 'b2', timestamp: 30 },
    { id: 'e4', type: 'sub', side: 'B', playerOut: 'b2', playerIn: 'b3', position: 'DF', posIdx: 1, timestamp: 40 },
    { id: 'e5', type: 'redCard', side: 'A', player: 'a2', timestamp: 50 },
    { id: 'e6', type: 'goal', player: 'a1', concedeGk: 'b1', timestamp: 60 }, // side 누락 = A
  ],
};
const external = { matchIdx: 0, status: 'playing', opponent: '터틀파크', lineup: ['a1'], gk: 'a1', defenders: [],
  events: [{ id: 'x', type: 'opponentGoal', side: 'A', currentGk: 'a1', timestamp: 1 }] };

describe('isIntra / fieldsOf*', () => {
  it('sideB 존재 여부로 자체전을 판정한다', () => {
    expect(isIntra(intra)).toBe(true);
    expect(isIntra(external)).toBe(false);
    expect(isIntra(null)).toBe(false);
  });
  it('fieldsOfA/B 는 배열을 항상 배열로, 이름 기본값을 채운다', () => {
    expect(fieldsOfB(intra).subs).toEqual([]);          // 누락 → []
    expect(fieldsOfB(intra).name).toBe('파랑');
    expect(fieldsOfA({ ...intra, sideA: undefined }).name).toBe('A팀');
    expect(fieldsOfB({ ...intra, sideB: {} }).name).toBe('B팀');
    expect(fieldsOfA(intra).lineup).toEqual(['a1', 'a2']);
  });
});

describe('sideView — 자체전', () => {
  it('A 뷰: A 필드 + opponent=B 이름 + 상대 골은 opponentGoal(concedeGk) 로', () => {
    const v = sideView(intra, 'A');
    expect(v.lineup).toEqual(['a1', 'a2']);
    expect(v.gk).toBe('a1');
    expect(v.opponent).toBe('파랑');
    expect(v.sideA).toBeUndefined();
    expect(v.sideB).toBeUndefined();
    expect(v.events.map(e => [e.id, e.type])).toEqual([
      ['e1', 'goal'], ['e2', 'opponentGoal'], ['e3', 'opponentOwnGoal'], ['e5', 'redCard'], ['e6', 'goal'],
    ]);
    const og = v.events.find(e => e.id === 'e2');
    expect(og).toEqual({ type: 'opponentGoal', currentGk: 'a1', id: 'e2', timestamp: 20, mirrorOf: 'e2' });
  });
  it('B 뷰: B 필드 + opponent=A 이름 + A 골은 opponentGoal(B GK) 로, A 카드·side누락 골은 상대 골로', () => {
    const v = sideView(intra, 'B');
    expect(v.lineup).toEqual(['b1', 'b2']);
    expect(v.subs).toEqual([]);
    expect(v.opponent).toBe('주황');
    expect(v.events.map(e => [e.id, e.type])).toEqual([
      ['e1', 'opponentGoal'], ['e2', 'goal'], ['e3', 'owngoal'], ['e4', 'sub'], ['e6', 'opponentGoal'],
    ]);
    expect(v.events[0].currentGk).toBe('b1');
  });
  it('입력을 변경하지 않는다', () => {
    const snapshot = JSON.stringify(intra);
    sideView(intra, 'A'); sideView(intra, 'B');
    expect(JSON.stringify(intra)).toBe(snapshot);
  });
});

describe('sideView — 외부전', () => {
  it('sideB 가 없으면 입력 참조를 그대로 반환한다', () => {
    expect(sideView(external, 'A')).toBe(external);
    expect(sideView(external, 'B')).toBe(external);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/utils/intraSoccer/__tests__/sideView.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: 구현**

```js
// src/utils/intraSoccer/sideView.js
// 빅마스터FC 자체전: 저장은 경기 1개(A팀 = 기존 '우리' 필드, B팀 = sideB) 한 번,
// 읽기는 이 함수로 '편 기준 하버FC 모양' 뷰를 만들어 하버FC 잎 컴포넌트·빌더를 무수정 재사용한다.
// RTDB 빈 배열 소실(undefined) 복구도 여기서만 한다 — IntraSoccerApp 계열은 경기 객체를 이 함수를 거쳐서만 읽는다.
const ARR = (v) => (Array.isArray(v) ? v : []);

export function isIntra(m) {
  return !!(m && m.sideB);
}

export function fieldsOfA(m) {
  return {
    name: (m.sideA && m.sideA.name) || 'A팀',
    lineup: ARR(m.lineup), gk: m.gk || '', defenders: ARR(m.defenders),
    formation: m.formation || null, assignments: m.assignments || null, positionMap: m.positionMap || null,
    subs: ARR(m.subs),
  };
}

export function fieldsOfB(m) {
  const b = m.sideB || {};
  return {
    name: b.name || 'B팀',
    lineup: ARR(b.lineup), gk: b.gk || '', defenders: ARR(b.defenders),
    formation: b.formation || null, assignments: b.assignments || null, positionMap: b.positionMap || null,
    subs: ARR(b.subs),
  };
}

// side 편의 하버FC 모양 경기. 외부전(sideB 없음)은 입력을 그대로(참조 동일) 돌려준다.
export function sideView(m, side) {
  if (!isIntra(m)) return m;
  const me = side === 'A' ? fieldsOfA(m) : fieldsOfB(m);
  const other = side === 'A' ? fieldsOfB(m) : fieldsOfA(m);
  const events = ARR(m.events).flatMap(e => {
    const s = e.side || 'A';
    if (s === side) return [e];
    // 상대 편 득점 → 내 시점 실점. concedeGk 는 입력 시점의 '실점한(=내) 편' GK 스냅샷이다.
    if (e.type === 'goal') return [{ type: 'opponentGoal', currentGk: e.concedeGk || '', id: e.id, timestamp: e.timestamp, mirrorOf: e.id }];
    if (e.type === 'owngoal') return [{ type: 'opponentOwnGoal', id: e.id, timestamp: e.timestamp, mirrorOf: e.id }];
    return []; // 상대 편 교체·GK변경·카드는 내 시점에 없다
  });
  const { sideA, sideB, ...rest } = m; // eslint-disable-line no-unused-vars
  return { ...rest, ...me, opponent: other.name, events };
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run src/utils/intraSoccer`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/utils/intraSoccer/sideView.js src/utils/intraSoccer/__tests__/sideView.test.js
git commit -m "feat: 자체전 편 기준 시점 뷰 sideView 추가"
```

---

### Task 3: `subPool` — 편별 교체 후보 풀

**Files:**
- Create: `src/utils/intraSoccer/subPool.js`
- Test: `src/utils/intraSoccer/__tests__/subPool.test.js`

**Interfaces:**
- Consumes: `isIntra`, `fieldsOfA`, `fieldsOfB` (Task 2).
- Produces: `subPool(m, side, attendees) → string[]` = `attendees` − 상대 편 현재 피치(`Object.values(other.assignments)`) − 상대 편 `redCard` 선수. 외부전은 `attendees` 그대로. 내 편 피치·내 편 퇴장자 제외는 레코더 내부 `getSubCandidates`가 한다(제외하지 않는다).

- [ ] **Step 1: 실패하는 테스트 작성**

```js
// src/utils/intraSoccer/__tests__/subPool.test.js
import { describe, it, expect } from 'vitest';
import { subPool } from '../subPool';

const m = {
  assignments: { 0: 'a1', 1: 'a2' }, gk: 'a1',
  sideB: { name: 'B팀', assignments: { 0: 'b1', 1: 'b2' }, gk: 'b1' },
  events: [
    { id: '1', type: 'redCard', side: 'B', player: 'b2' },
    { id: '2', type: 'redCard', side: 'A', player: 'a2' },
  ],
};
const attendees = ['a1', 'a2', 'a3', 'b1', 'b2', 'b3', 'c1'];

describe('subPool', () => {
  it('A 탭: B 피치·B 퇴장자만 제외(내 편은 레코더가 제외)', () => {
    expect(subPool(m, 'A', attendees)).toEqual(['a1', 'a2', 'a3', 'b3', 'c1']);
  });
  it('B 탭: A 피치·A 퇴장자만 제외', () => {
    expect(subPool(m, 'B', attendees)).toEqual(['a3', 'b1', 'b2', 'b3', 'c1']);
  });
  it('외부전은 참석자를 그대로 돌려준다', () => {
    const ext = { assignments: { 0: 'a1' }, events: [] };
    expect(subPool(ext, 'A', attendees)).toBe(attendees);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/utils/intraSoccer/__tests__/subPool.test.js` — Expected: FAIL(module not found).

- [ ] **Step 3: 구현**

```js
// src/utils/intraSoccer/subPool.js
import { isIntra, fieldsOfA, fieldsOfB } from './sideView';

// 탭 side 의 FormationRecorder 에 넘길 attendees. 상대 편 피치 위 선수와 상대 편 퇴장자를 뺀다.
// 내 편 피치·내 편 퇴장자는 레코더 내부 getSubCandidates(attendees, assignments, events)가 내 시점 events 로 뺀다.
export function subPool(m, side, attendees) {
  if (!isIntra(m)) return attendees;
  const otherSide = side === 'A' ? 'B' : 'A';
  const other = side === 'A' ? fieldsOfB(m) : fieldsOfA(m);
  const onPitch = new Set(Object.values(other.assignments || {}).filter(Boolean));
  const expelled = new Set((m.events || [])
    .filter(e => (e.side || 'A') === otherSide && e.type === 'redCard')
    .map(e => e.player));
  return (attendees || []).filter(n => !onPitch.has(n) && !expelled.has(n));
}
```

- [ ] **Step 4: 통과 확인** — `npx vitest run src/utils/intraSoccer` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/utils/intraSoccer/subPool.js src/utils/intraSoccer/__tests__/subPool.test.js
git commit -m "feat: 자체전 편별 교체 후보 풀 subPool 추가"
```

---

### Task 4: 리듀서 — `PATCH_SOCCER_SIDE` (공유 파일, 새 case 1개)

**Files:**
- Modify: `src/hooks/useGameReducer.js` — `case 'SET_SOCCER_MATCH_OPPONENT'`(940-947) 바로 뒤에 새 case 삽입. 다른 줄 무변경.
- Test: `src/hooks/__tests__/useGameReducer.intraSide.test.js`

**Interfaces:**
- Produces: 액션 `{ type:'PATCH_SOCCER_SIDE', matchIdx, side:'A'|'B', patch, remapEvents? }`. side `'A'`는 `m.sideA`에 `name`만, `'B'`는 `m.sideB`에 `name, lineup, gk, defenders, formation, assignments, positionMap, subs`. 논리 `m.matchIdx === matchIdx` 매칭. `remapEvents: [from, to]`면 **그 편 이벤트만** `remapPlayerInSoccerEvents`로 치환. 기존 case 무변경. Task 7·9·10이 dispatch.

- [ ] **Step 1: 실패하는 테스트 작성**

```js
// src/hooks/__tests__/useGameReducer.intraSide.test.js
import { describe, it, expect } from 'vitest';
import { gameReducer, initialState } from '../useGameReducer';

const base = () => gameReducer({ ...initialState, soccerMatches: [] }, {
  type: 'CREATE_SOCCER_MATCH', opponent: '파랑', lineup: ['a1', 'a2'], gk: 'a1', defenders: ['a2'],
  subs: ['a3'], formation: '4-4-2', assignments: { 0: 'a1', 1: 'a2' }, positionMap: { a1: 'GK', a2: 'DF' },
});

describe('gameReducer — PATCH_SOCCER_SIDE', () => {
  it('B: 화이트리스트 필드를 sideB 에 생성·병합한다(없는 키 무시)', () => {
    let s = base();
    s = gameReducer(s, { type: 'PATCH_SOCCER_SIDE', matchIdx: 0, side: 'B',
      patch: { name: '파랑', lineup: ['b1', 'b2'], gk: 'b1', defenders: ['b2'], formation: '4-3-3',
               assignments: { 0: 'b1', 1: 'b2' }, positionMap: { b1: 'GK', b2: 'DF' }, subs: ['b3'], status: 'HACK', events: [] } });
    const m = s.soccerMatches[0];
    expect(m.sideB).toEqual({ name: '파랑', lineup: ['b1', 'b2'], gk: 'b1', defenders: ['b2'], formation: '4-3-3',
      assignments: { 0: 'b1', 1: 'b2' }, positionMap: { b1: 'GK', b2: 'DF' }, subs: ['b3'] });
    expect(m.status).toBe('playing');                 // A 필드·status 무변경
    expect(m.lineup).toEqual(['a1', 'a2']);
    s = gameReducer(s, { type: 'PATCH_SOCCER_SIDE', matchIdx: 0, side: 'B', patch: { gk: 'b2' } });
    expect(s.soccerMatches[0].sideB.gk).toBe('b2');
    expect(s.soccerMatches[0].sideB.lineup).toEqual(['b1', 'b2']); // 병합
  });
  it('A: name 만 sideA 에 기록한다', () => {
    const s = gameReducer(base(), { type: 'PATCH_SOCCER_SIDE', matchIdx: 0, side: 'A', patch: { name: '주황', lineup: ['zzz'] } });
    expect(s.soccerMatches[0].sideA).toEqual({ name: '주황' });
    expect(s.soccerMatches[0].lineup).toEqual(['a1', 'a2']);
  });
  it('논리 matchIdx 로 매칭하고 다른 경기는 건드리지 않는다', () => {
    let s = base();
    s = gameReducer(s, { type: 'CREATE_SOCCER_MATCH', opponent: 'X', lineup: ['q'], gk: 'q', defenders: [], subs: [] });
    s = gameReducer(s, { type: 'PATCH_SOCCER_SIDE', matchIdx: 1, side: 'B', patch: { name: 'B2' } });
    expect(s.soccerMatches[0].sideB).toBeUndefined();
    expect(s.soccerMatches[1].sideB).toEqual({ name: 'B2' });
  });
  it('remapEvents 는 그 편 이벤트만 치환한다', () => {
    let s = base();
    s = gameReducer(s, { type: 'PATCH_SOCCER_SIDE', matchIdx: 0, side: 'B', patch: { name: '파랑', lineup: ['b1', 'b2'] } });
    s = gameReducer(s, { type: 'ADD_SOCCER_EVENT', matchIdx: 0, event: { id: 'g1', type: 'goal', side: 'A', player: 'x', assist: 'a1' } });
    s = gameReducer(s, { type: 'ADD_SOCCER_EVENT', matchIdx: 0, event: { id: 'g2', type: 'goal', side: 'B', player: 'x', concedeGk: 'a1' } });
    s = gameReducer(s, { type: 'PATCH_SOCCER_SIDE', matchIdx: 0, side: 'B', patch: { lineup: ['b1', 'y'] }, remapEvents: ['x', 'y'] });
    const ev = s.soccerMatches[0].events;
    expect(ev.find(e => e.id === 'g1').player).toBe('x');  // A 편 이벤트 무변경
    expect(ev.find(e => e.id === 'g2').player).toBe('y');  // B 편만 치환
  });
  it('DELETE_SOCCER_EVENT 로 B 편 교체를 지워도 A 배치는 변하지 않는다(no-op)', () => {
    let s = base();
    s = gameReducer(s, { type: 'PATCH_SOCCER_SIDE', matchIdx: 0, side: 'B',
      patch: { name: '파랑', lineup: ['b1', 'b2'], assignments: { 0: 'b1', 1: 'b3' }, positionMap: { b1: 'GK', b3: 'DF' }, subs: ['b2'] } });
    s = gameReducer(s, { type: 'ADD_SOCCER_EVENT', matchIdx: 0,
      event: { id: 'sb', type: 'sub', side: 'B', playerOut: 'b2', playerIn: 'b3', position: 'DF', posIdx: 1 } });
    const before = s.soccerMatches[0];
    s = gameReducer(s, { type: 'DELETE_SOCCER_EVENT', matchIdx: 0, eventId: 'sb' });
    const after = s.soccerMatches[0];
    expect(after.events.find(e => e.id === 'sb')).toBeUndefined();
    expect(after.assignments).toEqual(before.assignments);   // A 무변경
    expect(after.positionMap).toEqual(before.positionMap);
    expect(after.subs).toEqual(before.subs);
    expect(after.sideB).toEqual(before.sideB);               // 리듀서는 B 를 되돌리지 않는다(오케스트레이터 책임)
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/hooks/__tests__/useGameReducer.intraSide.test.js`
Expected: FAIL — 첫 4개(알 수 없는 액션이라 state 그대로 → `sideB` undefined). 마지막 테스트는 통과할 수 있음(기존 동작 확인용).

- [ ] **Step 3: 구현 — case 추가만**

`src/hooks/useGameReducer.js`의 `case 'SET_SOCCER_MATCH_OPPONENT': { ... }` 블록 바로 뒤(`// 선발 오기입 정정` 주석 앞)에 삽입:
```js
    // [빅마스터FC 자체전] 편 상태 생성/갱신. side 'A'는 표시 이름만(sideA.name), 'B'는 전 필드(sideB).
    // 논리 matchIdx 매칭(SET_SOCCER_MATCH_OPPONENT 규약). remapEvents=[from,to]면 그 편 이벤트의 선수명만 치환.
    // 하버FC 경로는 이 액션을 dispatch 하지 않는다 — 기존 case 무변경.
    case 'PATCH_SOCCER_SIDE': {
      const { matchIdx, side, patch, remapEvents } = action;
      const keys = side === 'A'
        ? ["name"]
        : ["name", "lineup", "gk", "defenders", "formation", "assignments", "positionMap", "subs"];
      const allowed = {};
      for (const k of keys) if (patch && patch[k] !== undefined) allowed[k] = patch[k];
      const key = side === 'A' ? 'sideA' : 'sideB';
      const matches = state.soccerMatches.map(m => {
        if (m.matchIdx !== matchIdx) return m;
        let events = m.events || [];
        if (Array.isArray(remapEvents) && remapEvents.length === 2) {
          const [from, to] = remapEvents;
          events = events.map(e => ((e.side || 'A') === side ? remapPlayerInSoccerEvents([e], from, to)[0] : e));
        }
        return { ...m, [key]: { ...(m[key] || {}), ...allowed }, events };
      });
      return { ...state, soccerMatches: matches };
    }
```
(`remapPlayerInSoccerEvents`는 파일 4행에 이미 import돼 있다.)

- [ ] **Step 4: 통과 확인 + 기존 리듀서 테스트 전부**

Run: `npx vitest run src/hooks`
Expected: PASS (신규 5 + 기존 전부).

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useGameReducer.js src/hooks/__tests__/useGameReducer.intraSide.test.js
git commit -m "feat: 리듀서 PATCH_SOCCER_SIDE 추가(자체전 B팀 상태)"
```

---

### Task 5: `handlers` — 오케스트레이터 순수 로직

**Files:**
- Create: `src/utils/intraSoccer/handlers.js`
- Test: `src/utils/intraSoccer/__tests__/handlers.test.js`

**Interfaces:**
- Consumes: Task 2 (`isIntra`, `fieldsOfA`, `fieldsOfB`), `formations.js`의 `FORMATIONS`, `swapFormationSlots`, `defendersFromPositionMap`, `revertSubInFormation`.
- Produces:
  - `planAddEvent(m, side, ev) → { kind:'dispatch', event } | { kind:'redirect', toSide }` — 자체전에서 `opponentGoal`/`opponentOwnGoal`은 redirect. 그 외 `{...ev, side}`; `goal`이면 `concedeGk = 상대 편 현재 gk`. 외부전은 `{...ev, side:'A'}`.
  - `planDeleteEvent(m, matchIdx, eventId) → Action[]` — 항상 `DELETE_SOCCER_EVENT`; 자체전 B 편 `sub`면 `revertSubInFormation(fieldsOfB(m), deleted)`가 non-null일 때 `PATCH_SOCCER_SIDE(B, reverted)` 추가.
  - `sideBSwapPatch(m, aIdx, bIdx) → { assignments, positionMap, gk, defenders }`
  - `sideBCorrectPatch(m, out, inn) → { patch:{ lineup, assignments, positionMap, gk, subs, defenders }, remapEvents:[out, inn] }`
  - `pickSidePatch(updates) → updates 중 formation/assignments/positionMap/gk/subs/defenders 만`

- [ ] **Step 1: 실패하는 테스트 작성**

```js
// src/utils/intraSoccer/__tests__/handlers.test.js
import { describe, it, expect } from 'vitest';
import { planAddEvent, planDeleteEvent, sideBSwapPatch, sideBCorrectPatch, pickSidePatch } from '../handlers';
import { FORMATIONS } from '../../formations';

const m = {
  matchIdx: 0, status: 'playing', opponent: '파랑',
  lineup: ['a1', 'a2'], gk: 'a1', defenders: ['a2'], formation: '4-4-2',
  assignments: { 0: 'a1', 1: 'a2' }, positionMap: { a1: 'GK', a2: 'DF' }, subs: ['a3'],
  sideB: { name: '파랑', lineup: ['b1', 'b2'], gk: 'b1', defenders: ['b2'], formation: '4-4-2',
           assignments: { 0: 'b1', 1: 'b3' }, positionMap: { b1: 'GK', b3: 'DF' }, subs: ['b2'] },
  events: [{ id: 'sb', type: 'sub', side: 'B', playerOut: 'b2', playerIn: 'b3', position: 'DF', posIdx: 1 }],
};
const ext = { matchIdx: 0, status: 'playing', opponent: '터틀', lineup: ['a1'], gk: 'a1', events: [] };

describe('planAddEvent', () => {
  it('자체전 A 골: side=A, concedeGk=B GK', () => {
    const r = planAddEvent(m, 'A', { id: 'g', type: 'goal', player: 'a2', assist: null, timestamp: 1 });
    expect(r).toEqual({ kind: 'dispatch', event: { id: 'g', type: 'goal', player: 'a2', assist: null, timestamp: 1, side: 'A', concedeGk: 'b1' } });
  });
  it('자체전 B 골: side=B, concedeGk=A GK', () => {
    expect(planAddEvent(m, 'B', { id: 'g', type: 'goal', player: 'b2', timestamp: 1 }).event.concedeGk).toBe('a1');
  });
  it('자체전에서 상대골 버튼은 저장하지 않고 상대 탭으로 보낸다', () => {
    expect(planAddEvent(m, 'A', { type: 'opponentGoal', currentGk: 'a1' })).toEqual({ kind: 'redirect', toSide: 'B' });
    expect(planAddEvent(m, 'B', { type: 'opponentOwnGoal' })).toEqual({ kind: 'redirect', toSide: 'A' });
  });
  it('교체·카드는 side 만 붙인다(concedeGk 없음)', () => {
    const r = planAddEvent(m, 'B', { id: 's', type: 'sub', playerOut: 'b1', playerIn: 'b9', position: 'GK', posIdx: 0 });
    expect(r.event).toEqual({ id: 's', type: 'sub', playerOut: 'b1', playerIn: 'b9', position: 'GK', posIdx: 0, side: 'B' });
    expect('concedeGk' in r.event).toBe(false);
  });
  it('외부전은 하버FC 그대로 + side A (opponentGoal 도 저장)', () => {
    expect(planAddEvent(ext, 'A', { id: 'o', type: 'opponentGoal', currentGk: 'a1' }))
      .toEqual({ kind: 'dispatch', event: { id: 'o', type: 'opponentGoal', currentGk: 'a1', side: 'A' } });
  });
});

describe('planDeleteEvent', () => {
  it('B 편 교체 삭제: DELETE + B 되돌리기 PATCH', () => {
    const acts = planDeleteEvent(m, 0, 'sb');
    expect(acts[0]).toEqual({ type: 'DELETE_SOCCER_EVENT', matchIdx: 0, eventId: 'sb' });
    expect(acts[1]).toEqual({ type: 'PATCH_SOCCER_SIDE', matchIdx: 0, side: 'B',
      patch: { assignments: { 0: 'b1', 1: 'b2' }, positionMap: { b1: 'GK', b2: 'DF' }, subs: ['b3'], gk: 'b1' } });
  });
  it('A 편 이벤트나 비교체는 DELETE 만', () => {
    const mm = { ...m, events: [...m.events, { id: 'g', type: 'goal', side: 'A', player: 'a2' }] };
    expect(planDeleteEvent(mm, 0, 'g')).toEqual([{ type: 'DELETE_SOCCER_EVENT', matchIdx: 0, eventId: 'g' }]);
    expect(planDeleteEvent(ext, 0, 'nope')).toEqual([{ type: 'DELETE_SOCCER_EVENT', matchIdx: 0, eventId: 'nope' }]);
  });
});

describe('sideBSwapPatch / sideBCorrectPatch / pickSidePatch', () => {
  it('위치교대: 슬롯 0(GK)↔1(DF) 교대 시 gk·positionMap·defenders 갱신', () => {
    const p = sideBSwapPatch(m, 0, 1);
    expect(p.assignments).toEqual({ 0: 'b3', 1: 'b1' });
    expect(p.gk).toBe('b3');
    expect(p.positionMap.b3).toBe('GK');                 // 슬롯 0 역할(GK)을 b3 가 받는다
    expect(p.positionMap.b1).toBe(FORMATIONS['4-4-2'].positions[1].role);
    expect(p.defenders).toEqual(Object.entries(p.positionMap).filter(([, r]) => r === 'DF').map(([n]) => n));
  });
  it('라인업 정정 out→inn: 필드 치환 + out 은 벤치로 + remapEvents', () => {
    const r = sideBCorrectPatch(m, 'b3', 'b7');
    expect(r.remapEvents).toEqual(['b3', 'b7']);
    expect(r.patch.assignments).toEqual({ 0: 'b1', 1: 'b7' });
    expect(r.patch.positionMap).toEqual({ b1: 'GK', b7: 'DF' });
    expect(r.patch.lineup).toEqual(['b1', 'b2']);            // b3 는 lineup 에 없었음 → 그대로
    expect(r.patch.subs).toEqual(['b2', 'b3']);              // out 은 벤치로, inn 은 벤치에서 제외
    expect(r.patch.defenders).toEqual(['b7']);
    expect(r.patch.gk).toBe('b1');
    expect(sideBCorrectPatch(m, 'b1', 'b8').patch.gk).toBe('b8');
  });
  it('pickSidePatch 는 포메이션 필드만 남긴다', () => {
    expect(pickSidePatch({ formation: '4-3-3', gk: 'x', events: [], status: 'y', subs: ['s'] }))
      .toEqual({ formation: '4-3-3', gk: 'x', subs: ['s'] });
  });
});
```

- [ ] **Step 2: 실패 확인** — `npx vitest run src/utils/intraSoccer/__tests__/handlers.test.js` → FAIL(module not found).

- [ ] **Step 3: 구현**

```js
// src/utils/intraSoccer/handlers.js
// IntraSoccerMatchView 오케스트레이터의 결정 로직. 전부 순수 — 컴포넌트는 결과를 dispatch/setTab 할 뿐이다.
import { isIntra, fieldsOfA, fieldsOfB } from './sideView';
import { FORMATIONS, swapFormationSlots, defendersFromPositionMap, revertSubInFormation } from '../formations';

const otherOf = (side) => (side === 'A' ? 'B' : 'A');
const fieldsOf = (m, side) => (side === 'A' ? fieldsOfA(m) : fieldsOfB(m));
const SIDE_PATCH_KEYS = ["formation", "assignments", "positionMap", "gk", "subs", "defenders"];

// 탭 side 의 레코더가 내보낸 이벤트 → 저장할 이벤트 또는 탭 전환 지시.
// 자체전에서 상대 편 골은 상대 편 탭에서 득점자를 골라 입력한다(저장 이벤트에 opponentGoal 은 없다).
export function planAddEvent(m, side, ev) {
  if (!isIntra(m)) return { kind: 'dispatch', event: { ...ev, side: 'A' } };
  if (ev.type === 'opponentGoal' || ev.type === 'opponentOwnGoal') return { kind: 'redirect', toSide: otherOf(side) };
  const event = { ...ev, side };
  if (ev.type === 'goal') event.concedeGk = fieldsOf(m, otherOf(side)).gk; // 실점한(=상대) 편 GK 스냅샷
  return { kind: 'dispatch', event };
}

// 삭제: 리듀서 DELETE 는 A 편 교체만 되돌린다(B 선수는 A 배치에 없어 no-op). B 편 교체는 여기서 되돌림 patch 를 만든다.
export function planDeleteEvent(m, matchIdx, eventId) {
  const actions = [{ type: 'DELETE_SOCCER_EVENT', matchIdx, eventId }];
  if (!isIntra(m)) return actions;
  const deleted = (m.events || []).find(e => e.id === eventId);
  if (deleted && deleted.type === 'sub' && deleted.side === 'B') {
    const reverted = revertSubInFormation(fieldsOfB(m), deleted);
    if (reverted) actions.push({ type: 'PATCH_SOCCER_SIDE', matchIdx, side: 'B', patch: reverted });
  }
  return actions;
}

// B 편 위치교대 — SWAP_SOCCER_LINEUP_POSITIONS 의 B 대응. positions 는 FORMATIONS 슬롯에서 주입한다.
export function sideBSwapPatch(m, aIdx, bIdx) {
  const b = fieldsOfB(m);
  const positions = (FORMATIONS[b.formation] || FORMATIONS["4-4-2"]).positions;
  const r = swapFormationSlots({ assignments: b.assignments || {}, positionMap: b.positionMap || {}, gk: b.gk, positions }, aIdx, bIdx);
  return { ...r, defenders: defendersFromPositionMap(r.positionMap) };
}

// B 편 라인업 정정 out→inn — CORRECT_SOCCER_LINEUP 의 B 대응. 이벤트 치환은 PATCH_SOCCER_SIDE.remapEvents 가 한다.
export function sideBCorrectPatch(m, out, inn) {
  const b = fieldsOfB(m);
  const rep = (v) => (v === out ? inn : v);
  const assignments = Object.fromEntries(Object.entries(b.assignments || {}).map(([k, v]) => [k, rep(v)]));
  const positionMap = {};
  for (const [name, role] of Object.entries(b.positionMap || {})) positionMap[rep(name)] = role;
  const lineup = b.lineup.map(rep);
  const subs = [...b.subs.filter(n => n !== inn && n !== out), out];
  return {
    patch: { lineup, assignments, positionMap, gk: rep(b.gk), subs, defenders: defendersFromPositionMap(positionMap) },
    remapEvents: [out, inn],
  };
}

// 레코더 onStateChange(updates) 중 편 상태로 저장할 키만.
export function pickSidePatch(updates) {
  const out = {};
  for (const k of SIDE_PATCH_KEYS) if (updates && updates[k] !== undefined) out[k] = updates[k];
  return out;
}
```

- [ ] **Step 4: 통과 확인** — `npx vitest run src/utils/intraSoccer` → PASS. (`sideBSwapPatch` 테스트의 positionMap 기대값은 FORMATIONS['4-4-2'] 슬롯 역할을 따른다 — 실패하면 기대값을 실제 슬롯 역할에 맞춰 고치되, `gk==='b3'`과 `assignments` 교대는 유지.)

- [ ] **Step 5: Commit**

```bash
git add src/utils/intraSoccer/handlers.js src/utils/intraSoccer/__tests__/handlers.test.js
git commit -m "feat: 자체전 오케스트레이터 순수 로직(handlers) 추가"
```

---

### Task 6: `buildIntraRows` — 마감 5시트 행 빌더

**Files:**
- Create: `src/utils/intraSoccer/buildIntraRows.js`
- Test: `src/utils/intraSoccer/__tests__/buildIntraRows.test.js`

**Interfaces:**
- Consumes: Task 2 `sideView`/`isIntra`; 기존 `buildEventLogRows`, `buildPointLogRows`, `buildPlayerLogRows`(soccerScoring.js), `buildRawEventsFromSoccer`, `buildRawPlayerGamesFromSoccer`(rawLogBuilders.js), `buildRoundRowsFromSoccer`(matchRowBuilder.js).
- Produces: `buildIntraRows({ team, dateStr, inputTime, finished }) → { sessionGameId, pointLogRows, playerLogRows, rawEvents, rawPlayerGames, matchRows }`. Task 10 `handleFinalize`가 소비. **외부전만 있는 입력 → 하버FC `handleFinalize`(SoccerApp.jsx:248-271)와 deep-equal.**

- [ ] **Step 1: 실패하는 테스트 작성**

```js
// src/utils/intraSoccer/__tests__/buildIntraRows.test.js
import { describe, it, expect } from 'vitest';
import { buildIntraRows } from '../buildIntraRows';
import { buildEventLogRows, buildPointLogRows, buildPlayerLogRows } from '../../soccerScoring';
import { buildRawEventsFromSoccer, buildRawPlayerGamesFromSoccer } from '../../rawLogBuilders';
import { buildRoundRowsFromSoccer } from '../../matchRowBuilder';

const T = '빅마스터FC', D = '2026-09-18', IT = '2026. 9. 18. 오후 9:00:00';
const eleven = (p) => Array.from({ length: 11 }, (_, i) => `${p}${i + 1}`);
const asg = (names) => Object.fromEntries(names.map((n, i) => [i, n]));
const pm = (names) => Object.fromEntries(names.map((n, i) => [n, i === 0 ? 'GK' : i < 5 ? 'DF' : 'FW']));

const intra = {
  matchIdx: 0, status: 'finished', startedAt: 1758200000000, opponent: '파랑',
  lineup: eleven('a'), gk: 'a1', defenders: ['a2', 'a3', 'a4', 'a5'], formation: '4-4-2',
  assignments: asg(eleven('a')), positionMap: pm(eleven('a')), subs: ['a12'],
  sideA: { name: '주황' },
  sideB: { name: '파랑', lineup: eleven('b'), gk: 'b1', defenders: ['b2', 'b3', 'b4', 'b5'], formation: '4-3-3',
           assignments: asg(eleven('b')), positionMap: pm(eleven('b')), subs: ['b12'] },
  events: [
    { id: 'g1', type: 'goal', side: 'A', player: 'a9', assist: 'a8', concedeGk: 'b1', timestamp: 1758200100000 },
    { id: 'g2', type: 'goal', side: 'A', player: 'a10', assist: null, concedeGk: 'b1', timestamp: 1758200200000 },
    { id: 'g3', type: 'goal', side: 'B', player: 'b9', assist: 'b8', concedeGk: 'a1', timestamp: 1758200300000 },
    { id: 's1', type: 'sub', side: 'B', playerOut: 'b6', playerIn: 'b12', position: 'FW', posIdx: 5, timestamp: 1758200400000 },
  ],
};
const external = {
  matchIdx: 1, status: 'finished', startedAt: 1758203600000, opponent: '터틀파크',
  lineup: eleven('a'), gk: 'a1', defenders: ['a2', 'a3'], formation: '4-4-2',
  assignments: asg(eleven('a')), positionMap: pm(eleven('a')), subs: [],
  events: [
    { id: 'x1', type: 'goal', side: 'A', player: 'a9', assist: null, timestamp: 1758203700000 },
    { id: 'x2', type: 'opponentGoal', side: 'A', currentGk: 'a1', timestamp: 1758203800000 },
  ],
};

// 하버FC SoccerApp.handleFinalize(248-271) 를 그대로 옮긴 기준 구현
function harborRows(finished) {
  const eventLogRows = buildEventLogRows(finished, D);
  const pointLogRows = buildPointLogRows(finished, D, IT);
  const playerLogRows = buildPlayerLogRows(finished, D, IT);
  const sessionGameId = finished[0].startedAt ? `s_${finished[0].startedAt}` : `s_${D}_${finished[0].matchIdx + 1}`;
  const matchRows = buildRoundRowsFromSoccer({ team: T, mode: '기본', tournamentId: '', date: D,
    stateJSON: { soccerMatches: finished.map(m => ({ ...m, matchIdx: m.matchIdx + 1 })) }, inputTime: IT });
  matchRows.forEach(r => { r.game_id = sessionGameId; });
  return {
    sessionGameId, pointLogRows, playerLogRows,
    rawEvents: buildRawEventsFromSoccer({ team: T, gameId: sessionGameId, events: eventLogRows }),
    rawPlayerGames: buildRawPlayerGamesFromSoccer({ team: T, inputTime: IT, players: playerLogRows }),
    matchRows,
  };
}

describe('buildIntraRows — 외부전 = 하버FC 출력과 동일', () => {
  it('외부전만 있으면 하버FC 빌더 출력과 deep-equal', () => {
    expect(buildIntraRows({ team: T, dateStr: D, inputTime: IT, finished: [external] })).toEqual(harborRows([external]));
  });
});

describe('buildIntraRows — 자체전', () => {
  const out = buildIntraRows({ team: T, dateStr: D, inputTime: IT, finished: [intra] });
  it('로그_매치 1행: 양팀 명단·GK·점수 방향·객체형 B 명단·mode', () => {
    expect(out.matchRows).toHaveLength(1);
    const r = out.matchRows[0];
    expect(r.mode).toBe('자체전');
    expect(r.game_id).toBe(`s_${intra.startedAt}`);
    expect(r.match_id).toBe('1');                       // matchIdx+1 (이벤트 행과 동일)
    expect(r.our_team_name).toBe('주황');
    expect(r.opponent_team_name).toBe('파랑');
    expect(r.our_score).toBe(2);
    expect(r.opponent_score).toBe(1);
    expect(r.our_gk).toBe('a1');
    expect(r.opponent_gk).toBe('b1');
    expect(JSON.parse(r.our_members_json)).toEqual(expect.arrayContaining(eleven('a')));
    const ob = JSON.parse(r.opponent_members_json);
    expect(ob.players).toEqual(expect.arrayContaining([...eleven('b'), 'b12']));
    expect(ob.formation).toBe('4-3-3');
    expect(ob.defenders).toEqual(['b2', 'b3', 'b4', 'b5']);
    expect(r.formation).toBe('4-4-2');
    expect(JSON.parse(r.our_defenders_json)).toEqual(['a2', 'a3', 'a4', 'a5']);
    expect(r.is_extra).toBe(false);
  });
  it('로그_이벤트: 출전 22 + 골 3 + 실점 3 + 교체 1, our_team 은 편 이름, match_id 일치', () => {
    const byType = (t) => out.rawEvents.filter(e => e.event_type === t);
    expect(out.rawEvents.every(e => e.mode === '자체전' && e.game_id === `s_${intra.startedAt}` && e.match_id === out.matchRows[0].match_id)).toBe(true);
    expect(byType('goal').map(e => [e.our_team, e.player, e.related_player, e.opponent]))
      .toEqual([['주황', 'a9', 'a8', '파랑'], ['주황', 'a10', '', '파랑'], ['파랑', 'b9', 'b8', '주황']]);
    expect(byType('concede').map(e => [e.our_team, e.concede_gk])).toEqual([['파랑', 'b1'], ['파랑', 'b1'], ['주황', 'a1']]);
    expect(byType('sub')).toHaveLength(1);
    expect(byType('sub')[0].our_team).toBe('파랑');
    expect(out.rawEvents.filter(e => e.our_team === '주황').length).toBe(11 + 2 + 1);   // 출전11 + 골2 + 실점1
    expect(out.rawEvents.filter(e => e.our_team === '파랑').length).toBe(11 + 1 + 2 + 1); // 출전11 + 골1 + 실점2 + 교체1
  });
  it('로그_선수경기: 선수당 1행, session_team 편 이름, 클린시트/실점 편별', () => {
    const pg = out.rawPlayerGames;
    expect(pg).toHaveLength(23); // a1..a11 + b1..b11 + b12(교체 투입)
    expect(new Set(pg.map(p => p.player)).size).toBe(23);
    expect(pg.every(p => p.mode === '자체전')).toBe(true);
    expect(pg.find(p => p.player === 'a1')).toMatchObject({ session_team: '주황', keeper_games: 1, conceded: 1, cleansheets: 0 });
    expect(pg.find(p => p.player === 'b1')).toMatchObject({ session_team: '파랑', keeper_games: 1, conceded: 2, cleansheets: 0 });
    expect(pg.find(p => p.player === 'a9')).toMatchObject({ goals: 1, assists: 0 });
    expect(pg.find(p => p.player === 'b8')).toMatchObject({ goals: 0, assists: 1 });
    expect(pg.find(p => p.player === 'b12')).toMatchObject({ session_team: '파랑', games: 1 });
  });
  it('선수별집계는 양팀 합, 포인트 로그는 0행', () => {
    expect(out.playerLogRows).toHaveLength(23);
    expect(out.pointLogRows).toEqual([]);
  });
  it('자체전+외부전 혼합: 외부전 행은 mode 기본, 포인트 로그는 외부전만', () => {
    const mixed = buildIntraRows({ team: T, dateStr: D, inputTime: IT, finished: [intra, external] });
    expect(mixed.matchRows.map(r => r.mode)).toEqual(['자체전', '기본']);
    expect(mixed.pointLogRows).toEqual(buildPointLogRows([external], D, IT));
    expect(mixed.sessionGameId).toBe(`s_${intra.startedAt}`);
    expect(mixed.matchRows.every(r => r.game_id === mixed.sessionGameId)).toBe(true);
  });
});
```

- [ ] **Step 2: 실패 확인** — `npx vitest run src/utils/intraSoccer/__tests__/buildIntraRows.test.js` → FAIL(module not found).

- [ ] **Step 3: 구현**

```js
// src/utils/intraSoccer/buildIntraRows.js
// 빅마스터FC 마감 행 빌더. 외부전 경기는 하버FC SoccerApp.handleFinalize 와 **같은 인자·같은 빌더**로 만든다(출력 동일).
// 자체전 경기는 편 기준 시점 뷰(vA, vB)를 같은 빌더에 넣고 편 이름만 후처리한다 — 스펙 §7.
import { buildEventLogRows, buildPointLogRows, buildPlayerLogRows } from '../soccerScoring';
import { buildRawEventsFromSoccer, buildRawPlayerGamesFromSoccer } from '../rawLogBuilders';
import { buildRoundRowsFromSoccer } from '../matchRowBuilder';
import { isIntra, sideView, fieldsOfA, fieldsOfB } from './sideView';

const plusOne = (m) => ({ ...m, matchIdx: m.matchIdx + 1 }); // 로그_매치용: buildEventLogRows 는 내부에서 +1, buildRoundRowsFromSoccer 는 그대로 쓴다

export function buildIntraRows({ team, dateStr, inputTime, finished }) {
  const list = finished || [];
  if (list.length === 0) {
    return { sessionGameId: '', pointLogRows: [], playerLogRows: [], rawEvents: [], rawPlayerGames: [], matchRows: [] };
  }
  const sessionGameId = list[0].startedAt ? `s_${list[0].startedAt}` : `s_${dateStr}_${list[0].matchIdx + 1}`;

  // ── 외부전: 하버FC 경로 그대로(mode '기본', 후처리 없음) ──
  const external = list.filter(m => !isIntra(m));
  const extEvents = buildEventLogRows(external, dateStr);
  const pointLogRows = buildPointLogRows(external, dateStr, inputTime);   // 자체전은 포인트 로그에 쓰지 않는다(스펙 §7)
  const extPlayers = buildPlayerLogRows(external, dateStr, inputTime);
  const extMatchRows = buildRoundRowsFromSoccer({
    team, mode: '기본', tournamentId: '', date: dateStr,
    stateJSON: { soccerMatches: external.map(plusOne) }, inputTime,
  });
  const extRaw = buildRawEventsFromSoccer({ team, gameId: sessionGameId, events: extEvents });
  const extPG = buildRawPlayerGamesFromSoccer({ team, inputTime, players: extPlayers });

  // ── 자체전: 편마다 시점 뷰로 같은 빌더를 돌리고 편 이름·mode 후처리 ──
  const playerLogRows = [...extPlayers];
  const rawEvents = [...extRaw];
  const rawPlayerGames = [...extPG];
  const intraMatchRows = [];
  for (const m of list.filter(isIntra)) {
    const nameA = fieldsOfA(m).name, nameB = fieldsOfB(m).name;
    const vA = sideView(m, 'A'), vB = sideView(m, 'B');
    for (const [v, myName] of [[vA, nameA], [vB, nameB]]) {
      const ev = buildEventLogRows([v], dateStr);
      const pl = buildPlayerLogRows([v], dateStr, inputTime);
      playerLogRows.push(...pl);
      rawEvents.push(...buildRawEventsFromSoccer({ team, mode: '자체전', gameId: sessionGameId, events: ev })
        .map(r => ({ ...r, our_team: myName })));                       // 풋살처럼 our_team/opponent 에 편 이름
      rawPlayerGames.push(...buildRawPlayerGamesFromSoccer({ team, inputTime, players: pl })
        .map(r => ({ ...r, mode: '자체전', session_team: myName })));
    }
    // 로그_매치 1행 = A 시점 행 + B 정보(명단·포메이션·수비수는 객체형 opponent_members_json 안에).
    const rowA = buildRoundRowsFromSoccer({ team, mode: '자체전', tournamentId: '', date: dateStr, stateJSON: { soccerMatches: [plusOne(vA)] }, inputTime })[0];
    const rowB = buildRoundRowsFromSoccer({ team, mode: '자체전', tournamentId: '', date: dateStr, stateJSON: { soccerMatches: [plusOne(vB)] }, inputTime })[0];
    intraMatchRows.push({
      ...rowA,
      our_team_name: nameA,
      opponent_team_name: nameB,
      opponent_members_json: JSON.stringify({ players: JSON.parse(rowB.our_members_json), formation: vB.formation || '', defenders: vB.defenders || [] }),
      opponent_gk: vB.gk || '',
    });
  }

  // 입력 순서대로 정렬(match_idx 기준) — 하버FC 처럼 한 배열로 쓴다
  const matchRows = [...extMatchRows, ...intraMatchRows].sort((a, b) => a.match_idx - b.match_idx);
  matchRows.forEach(r => { r.game_id = sessionGameId; });
  return { sessionGameId, pointLogRows, playerLogRows, rawEvents, rawPlayerGames, matchRows };
}
```
주의: `buildRoundRowsFromSoccer`가 `our_members_json`을 배열 JSON으로 쓰므로 `JSON.parse(rowB.our_members_json)`은 배열이다. 출전(`'출전'`) 행의 `event_type`은 `rawLogBuilders.js`의 `SOCCER_EVENT_MAP`을 따른다 — 테스트는 편별 총량으로 검증한다.

- [ ] **Step 4: 통과 확인** — `npx vitest run src/utils/intraSoccer src/utils/__tests__/matchRowBuilder.test.js src/utils/__tests__/rawLogBuilders.test.js` → PASS. 첫 테스트(외부전 deep-equal)가 실패하면 **빌더 호출 인자를 하버FC와 같게 고친다**(기준 구현을 바꾸지 않는다).

- [ ] **Step 5: Commit**

```bash
git add src/utils/intraSoccer/buildIntraRows.js src/utils/intraSoccer/__tests__/buildIntraRows.test.js
git commit -m "feat: 자체전 마감 행 빌더 buildIntraRows(외부전은 하버FC 출력 동일)"
```

---

### Task 7: 분석 분기 — `parseSideExtras`·`expandIntraMatchRows` + 4함수 `mode==='자체전'` 처리

**Files:**
- Create: `src/utils/soccerAnalytics/parseSideExtras.js`, `src/utils/soccerAnalytics/expandIntraMatchRows.js`
- Modify: `src/utils/soccerAnalytics/calcDefenseAnalysis.js:49-51`(루프 입력 교체), `calcOpponentBreakdown.js:40-41`, `calcOpponentLeaders.js:23`, `calcOpponentDefense.js:14-15`
- Test: `src/utils/soccerAnalytics/__tests__/intraMode.test.js`

**Interfaces:**
- Produces: `parseSideExtras(json) → { formation: string, defenders: string[] }`(배열형/파싱 실패 → `{ formation:'', defenders:[] }`), `expandIntraMatchRows(matchLogs) → rows[]`(비자체전 행 그대로, 자체전 행 → A행+B행, 둘 다 `opponent_team_name:'자체전'`).
- 기존 테스트(`calcDefenseAnalysis.test.js` 등) **무수정 통과**가 "하버FC 행 무영향"의 증거.

- [ ] **Step 1: 실패하는 테스트 작성**

```js
// src/utils/soccerAnalytics/__tests__/intraMode.test.js
import { describe, it, expect } from 'vitest';
import { parseSideExtras } from '../parseSideExtras';
import { expandIntraMatchRows } from '../expandIntraMatchRows';
import { calcDefenseAnalysis } from '../calcDefenseAnalysis';
import { calcOpponentBreakdown } from '../calcOpponentBreakdown';
import { calcOpponentLeaders } from '../calcOpponentLeaders';
import { calcOpponentDefense } from '../calcOpponentDefense';

const intraRow = {
  date: '2026-09-18', match_id: '1', game_id: 's_1', mode: '자체전', is_extra: false,
  our_team_name: '주황', opponent_team_name: '파랑',
  our_members_json: JSON.stringify(['a1', 'a2', 'a9']),
  opponent_members_json: JSON.stringify({ players: ['b1', 'b2', 'b9'], formation: '4-3-3', defenders: ['b2'] }),
  our_score: 2, opponent_score: 1, our_gk: 'a1', opponent_gk: 'b1', formation: '4-4-2',
  our_defenders_json: JSON.stringify(['a2']),
};
const harborRow = {
  date: '2026-09-11', match_id: '1', game_id: 's_0', mode: '기본', is_extra: false,
  our_team_name: '하버FC', opponent_team_name: '터틀파크',
  our_members_json: JSON.stringify(['h1', 'h2']), opponent_members_json: '[]',
  our_score: 1, opponent_score: 0, our_gk: 'h1', opponent_gk: '', formation: '4-4-2', our_defenders_json: JSON.stringify(['h2']),
};
const legacyRow = { ...harborRow, mode: '', date: '2026-05-01', game_id: 'legacy_1' };

describe('parseSideExtras', () => {
  it('객체형에서 formation/defenders 를 읽고, 배열형·깨진 값은 빈 값', () => {
    expect(parseSideExtras(intraRow.opponent_members_json)).toEqual({ formation: '4-3-3', defenders: ['b2'] });
    expect(parseSideExtras('["x"]')).toEqual({ formation: '', defenders: [] });
    expect(parseSideExtras('not json')).toEqual({ formation: '', defenders: [] });
    expect(parseSideExtras(undefined)).toEqual({ formation: '', defenders: [] });
  });
});

describe('expandIntraMatchRows', () => {
  it('자체전 1행 → A행+B행(상대 버킷 상수), 비자체전은 그대로', () => {
    const out = expandIntraMatchRows([harborRow, intraRow, legacyRow]);
    expect(out).toHaveLength(4);
    expect(out[0]).toBe(harborRow);
    expect(out[3]).toBe(legacyRow);
    const [a, b] = [out[1], out[2]];
    expect(a).toMatchObject({ our_team_name: '주황', opponent_team_name: '자체전', our_score: 2, opponent_score: 1, our_gk: 'a1', our_defenders_json: JSON.stringify(['a2']) });
    expect(b).toMatchObject({ our_team_name: '파랑', opponent_team_name: '자체전', our_score: 1, opponent_score: 2, our_gk: 'b1', opponent_gk: 'a1', formation: '4-3-3' });
    expect(JSON.parse(b.our_members_json)).toEqual(['b1', 'b2', 'b9']);
    expect(JSON.parse(b.our_defenders_json)).toEqual(['b2']);
  });
});

describe('분석 함수의 자체전 처리', () => {
  it('calcDefenseAnalysis: 양팀 수비수가 집계되고 하버FC 행 결과는 자체전 유무와 무관', () => {
    const withIntra = calcDefenseAnalysis({ matchLogs: [harborRow, intraRow], individualThreshold: 1 });
    const only = calcDefenseAnalysis({ matchLogs: [harborRow], individualThreshold: 1 });
    expect(JSON.stringify(withIntra).includes('b2')).toBe(true);  // B 수비수 등장
    expect(JSON.stringify(withIntra).includes('a2')).toBe(true);
    // 하버FC 수비수 h2 의 생값은 동일(자체전 행은 버킷 '자체전'이라 h2 기준선에 섞이지 않음)
    const pick = (r) => JSON.stringify(r).match(/"h2"[^}]*}/)?.[0];
    expect(pick(withIntra)).toBe(pick(only));
  });
  it('calcOpponentBreakdown: 자체전 골은 어느 상대 버킷에도 안 쌓인다(이벤트 폴백 포함)', () => {
    const eventLogs = [
      { date: '2026-09-18', match_id: '1', event_type: 'goal', player: 'a9', related_player: '', opponent: '파랑' },
      { date: '2026-09-11', match_id: '1', event_type: 'goal', player: 'h1', related_player: '', opponent: '터틀파크' },
    ];
    const r = calcOpponentBreakdown({ eventLogs, matchLogs: [harborRow, intraRow] });
    expect(r.byPlayer.a9).toBeUndefined();
    expect(r.byOpponent['파랑']).toBeUndefined();
    expect(r.byPlayer.h1[0]).toMatchObject({ opponent: '터틀파크', goals: 1 });
  });
  it('calcOpponentLeaders / calcOpponentDefense: 자체전 행 skip', () => {
    const L = calcOpponentLeaders({ eventLogs: [], matchLogs: [intraRow, harborRow], minOpponentMatches: 1, minGames: 1 });
    expect(JSON.stringify(L).includes('파랑')).toBe(false);
    const D = calcOpponentDefense({ matchLogs: [intraRow, harborRow] });
    expect(JSON.stringify(D).includes('파랑')).toBe(false);
    expect(JSON.stringify(D).includes('터틀파크')).toBe(true);
  });
});
```

- [ ] **Step 2: 실패 확인** — `npx vitest run src/utils/soccerAnalytics/__tests__/intraMode.test.js` → FAIL(module not found).

- [ ] **Step 3: 구현**

```js
// src/utils/soccerAnalytics/parseSideExtras.js
// 자체전 로그_매치의 opponent_members_json 객체형 { players, formation, defenders } 에서 추가 키를 읽는다.
// players/absent 는 parseMembers.js 가 읽는다(그 파서는 나머지 키를 무시한다 — 기존 소비자 무영향).
export function parseSideExtras(s) {
  try {
    const p = JSON.parse(s || '[]');
    if (p && typeof p === 'object' && !Array.isArray(p)) {
      return {
        formation: typeof p.formation === 'string' ? p.formation : '',
        defenders: Array.isArray(p.defenders) ? p.defenders.filter(x => typeof x === 'string' && x) : [],
      };
    }
  } catch { /* fallthrough */ }
  return { formation: '', defenders: [] };
}
```
```js
// src/utils/soccerAnalytics/expandIntraMatchRows.js
// 자체전(mode==='자체전') 로그_매치 1행을 하버FC 모양 2행(A 시점·B 시점)으로 펼친다 — 수비 분석 전처리.
// 상대 버킷은 상수 '자체전'(회전 라벨 'A팀/B팀' 노이즈 차단; 단일 버킷 = 옛 전체-부재 수식). 비자체전 행은 참조 그대로.
import { parseActualPlayers } from './parseMembers';
import { parseSideExtras } from './parseSideExtras';

export function expandIntraMatchRows(matchLogs) {
  const out = [];
  for (const m of matchLogs || []) {
    if (m.mode !== '자체전') { out.push(m); continue; }
    const extras = parseSideExtras(m.opponent_members_json);
    out.push({ ...m, opponent_team_name: '자체전' });
    out.push({
      ...m,
      our_team_name: m.opponent_team_name, opponent_team_name: '자체전',
      our_members_json: JSON.stringify(parseActualPlayers(m.opponent_members_json)),
      opponent_members_json: m.our_members_json,
      our_score: m.opponent_score, opponent_score: m.our_score,
      our_gk: m.opponent_gk, opponent_gk: m.our_gk,
      formation: extras.formation,
      our_defenders_json: JSON.stringify(extras.defenders),
    });
  }
  return out;
}
```
`calcDefenseAnalysis.js` — import 추가 + 루프 입력만 교체(루프 본문 무변경):
```js
import { expandIntraMatchRows } from './expandIntraMatchRows';
// ...
export function calcDefenseAnalysis({ matchLogs, individualThreshold = 8, pairThreshold = 5, trioThreshold = 3 }) {
  const scope = [];
  // 자체전 행은 A·B 두 시점 행으로 펼친다(상대 버킷 '자체전'). 비자체전 행은 그대로 — 하버FC 무영향.
  for (const m of expandIntraMatchRows(matchLogs || [])) {
    if (m.is_extra) continue;
```
`calcOpponentBreakdown.js` 첫 루프(16-21행):
```js
  for (const m of matchLogs || []) {
    const key = `${m.date}|${String(m.match_id ?? '')}`;
    const opp = String(m.opponent_team_name || '').trim();
    if (opp) oppByKey[key] = opp;
    if (m.is_extra) extraKeys.add(key);
    if (m.mode === '자체전') { extraKeys.add(key); delete oppByKey[key]; } // 자체전: 상대 축 지표에서 제외(이벤트 폴백까지 차단)
  }
```
두 번째 루프(40-41행) `if (m.is_extra) continue;` 뒤에 `if (m.mode === '자체전') continue;` 추가.
`calcOpponentLeaders.js:23`: `const scoped = (matchLogs || []).filter(m => !m.is_extra && m.mode !== '자체전' && oppName(m));`
`calcOpponentDefense.js:15`: `if (m.is_extra || m.mode === '자체전') continue;`

- [ ] **Step 4: 통과 확인 — 신규 + 기존 분석 테스트 전부**

Run: `npx vitest run src/utils/soccerAnalytics`
Expected: PASS, 기존 파일 무수정. `calcDefenseAnalysis` 테스트에서 결과 객체 키 모양이 다르면 `intraMode.test.js`의 `pick`/`names` 보조식만 실제 반환 구조(`individual`/`pair`/`trio` 맵)에 맞춰 고친다 — 단 "B 수비수 등장"·"h2 생값 동일" 두 주장은 유지.

- [ ] **Step 5: Commit**

```bash
git add src/utils/soccerAnalytics
git commit -m "feat: soccerAnalytics 자체전(mode) 처리 — 수비 분석 양팀 펼침, 상대 축 지표 skip"
```

---

### Task 8: `IntraSoccerMatchView` — SoccerMatchView 복사 + 자체전 흐름

**Files:**
- Create: `src/components/intra/IntraSoccerMatchView.jsx` (`cp src/components/game/SoccerMatchView.jsx` 후 수정)
- Test: 빌드(`npm run build`) + Task 11 정적 테스트. (렌더 테스트 하네스 없음 — 메모리 "컴포넌트 렌더 검증 공백": 선언 순서 육안·diff 정독.)

**Interfaces:**
- Consumes: Task 2 `isIntra`/`sideView`/`fieldsOfA`/`fieldsOfB`, Task 3 `subPool`, Task 5 `planAddEvent`/`planDeleteEvent`/`sideBSwapPatch`/`sideBCorrectPatch`/`pickSidePatch`.
- Produces: 컴포넌트 props = SoccerMatchView 23개 **+ `onPatchSide(matchIdx, side, patch, remapEvents?)`** + `onSetMatchOpponent`(기존). `onAddEvent(matchIdx, event)`·`onDeleteEvent(matchIdx, eventId)`·`onFinishMatch(matchIdx)`·`onUpdateMatchFormation(matchIdx, patch)`·`onCreateMatch(obj)` 시그니처는 SoccerMatchView와 동일. Task 10이 렌더.

- [ ] **Step 1: 복사 + import 경로 수정**

```bash
mkdir -p src/components/intra
cp src/components/game/SoccerMatchView.jsx src/components/intra/IntraSoccerMatchView.jsx
```
파일 상단 import를 다음으로 교체(`../game/` 경로 + 신규 헬퍼):
```js
import { useState, useEffect } from 'react';
import { goalLabel } from '../../utils/soccerGoalEvent';
import { useTheme } from '../../hooks/useTheme';
import { calcSoccerScore, getCleanSheetPlayers, getSoccerPlayedPlayers, getNonPlayers, soccerResultLabel } from '../../utils/soccerScoring';
import { generateEventId } from '../../utils/idGenerator';
import { FORMATIONS, defendersFromPositionMap } from '../../utils/formations';
import Modal from '../common/Modal';
import OpponentSelector from '../game/OpponentSelector';
import FormationSetup from '../game/FormationSetup';
import FormationRecorder from '../game/FormationRecorder';
import FormationPitch from '../game/FormationPitch';
import LineupEditView from '../game/LineupEditView';
import RoundNav from '../game/RoundNav';
import ConfirmBar from '../game/ConfirmBar';
import { isIntra, sideView, fieldsOfA, fieldsOfB } from '../../utils/intraSoccer/sideView';
import { subPool } from '../../utils/intraSoccer/subPool';
import { planAddEvent, planDeleteEvent, sideBSwapPatch, sideBCorrectPatch, pickSidePatch } from '../../utils/intraSoccer/handlers';
```
컴포넌트 이름을 `IntraSoccerMatchView`로, props에 `onPatchSide`를 추가한다. `generateEventId`가 원본에서 미사용이면 import 줄을 지운다(빌드 경고 회피).

- [ ] **Step 2: 로컬 state 추가·viewState 확장**

기존 6개 state 아래에 추가:
```js
  // [자체전] 경기 유형·편 이름·A 배치 임시 저장·기록 탭(로컬 — RTDB 미동기, 한 기기 운영 전제)
  const [matchType, setMatchType] = useState(null);            // '자체전' | '외부전' | null(선택 전)
  const [sideNames, setSideNames] = useState({ A: 'A팀', B: 'B팀' });
  const [pendingA, setPendingA] = useState(null);              // 자체전 A 배치 결과(FormationSetup onConfirm)
  const [tab, setTab] = useState('A');                         // 기록 탭 'A' | 'B'
```
`viewState` 값: 기존 `'selectOpponent' | 'formation'` + `'selectType' | 'formationA' | 'formationB'`. 초기값은 기존 식 그대로(복원 시 `savedFormation.viewState==='formation'`이면 외부전 배치 복원).

- [ ] **Step 3: 새 경기 노드(atNewNode) — 경기 유형 선택 화면**

원본의 `viewState === "selectOpponent"` 렌더(OpponentSelector 블록) **앞**에 유형 선택을 둔다. `matchType === null`이면:
```jsx
  const canIntra = (attendees || []).length >= 22;
  // 유형 선택
  if (atNewNode && matchType === null) {
    return (
      <div style={s.card}>
        <div style={{ fontSize: 14, fontWeight: 800, color: C.white, marginBottom: 10 }}>경기 유형</div>
        <button onClick={() => { if (canIntra) { setMatchType('자체전'); setViewState('formationA'); } }} disabled={!canIntra}
          style={{ ...s.btnFull(C.accent, C.bg), marginBottom: 8, opacity: canIntra ? 1 : 0.4 }}>
          {canIntra ? `자체전 (A팀 vs B팀 · 참석 ${attendees.length}명)` : `자체전 — 참석자 22명 이상 필요 (현재 ${attendees.length}명)`}
        </button>
        <button onClick={() => { setMatchType('외부전'); setViewState('selectOpponent'); }} style={s.btnFull(C.cardLight, C.white)}>외부전 (상대팀 선택)</button>
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <input style={s.input} value={sideNames.A} onChange={e => setSideNames(n => ({ ...n, A: e.target.value }))} placeholder="A팀 이름" />
          <input style={s.input} value={sideNames.B} onChange={e => setSideNames(n => ({ ...n, B: e.target.value }))} placeholder="B팀 이름" />
        </div>
      </div>
    );
  }
```
팀 이름은 **경기 생성 전**에 정한다(생성 후 이름 변경은 비범위 — 스펙 §4의 `SET_SOCCER_MATCH_OPPONENT` 동기화는 이 경로에서 발생하지 않는다). `s.btnFull`/`s.input`/`s.card`는 SoccerApp의 `makeStyles` 결과(원본 SoccerMatchView도 `styles: s`를 받는다). 없는 스타일 키는 쓰지 않는다 — 원본 파일에서 이미 쓰는 키(`s.card`, `s.btn`, `s.input`)만 사용하고 `btnFull`이 없으면 `s.btn(C.accent)`로 대체한다.

- [ ] **Step 4: 자체전 배치 2단계**

```jsx
  if (viewState === 'formationA') {
    return <FormationSetup selectedPlayers={attendees} title={`${sideNames.A} 선발 11명`}
      onConfirm={(res) => { setPendingA(res); setViewState('formationB'); }}
      onBack={() => { setMatchType(null); setViewState('selectType'); }} />;
  }
  if (viewState === 'formationB' && pendingA) {
    const aNames = new Set(Object.values(pendingA.assignments));
    const poolB = attendees.filter(n => !aNames.has(n));
    return <FormationSetup selectedPlayers={poolB} title={`${sideNames.B} 선발 11명`}
      onConfirm={(resB) => handleIntraConfirm(pendingA, resB)}
      onBack={() => setViewState('formationA')} />;
  }
```
```js
  const handleIntraConfirm = (resA, resB) => {
    const lineupA = Object.values(resA.assignments), lineupB = Object.values(resB.assignments);
    const newIdx = soccerMatches.length; // CREATE 가 부여하는 matchIdx(append-only 불변식)
    onCreateMatch({ opponent: sideNames.B, lineup: lineupA, gk: resA.gk, defenders: defendersFromPositionMap(resA.positionMap),
      subs: resA.subs, formation: resA.formation, assignments: resA.assignments, positionMap: resA.positionMap });
    onPatchSide(newIdx, 'A', { name: sideNames.A });
    onPatchSide(newIdx, 'B', { name: sideNames.B, lineup: lineupB, gk: resB.gk, defenders: defendersFromPositionMap(resB.positionMap),
      subs: resB.subs, formation: resB.formation, assignments: resB.assignments, positionMap: resB.positionMap });
    setPendingA(null); setMatchType(null); setTab('A');
    setViewState('selectOpponent');
    saveFormationState({ viewState: 'selectOpponent', selectedOpponent: null, selectedPlayers: [] });
  };
```
외부전(`matchType==='외부전'`)은 원본 흐름(OpponentSelector → `handleOpponentSelect` → `formation` → `handleFormationConfirm`) 그대로. `handleFormationConfirm` 끝에 `setMatchType(null)` 추가.

- [ ] **Step 5: 기록 화면 — A/B 탭 + 시점 뷰 + 핸들러 교체**

원본의 `isPlayingNode && currentMatch` 블록을 다음으로 교체:
```jsx
      {isPlayingNode && currentMatch && (() => {
        const intra = isIntra(currentMatch);
        const side = intra ? tab : 'A';
        const v = sideView(currentMatch, side);
        const live = reconstructFormation(v);
        const scoreA = calcSoccerScore(sideView(currentMatch, 'A').events);
        return (
          <>
            {intra && (
              <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                {['A', 'B'].map(sd => {
                  const name = sd === 'A' ? fieldsOfA(currentMatch).name : fieldsOfB(currentMatch).name;
                  return (
                    <button key={sd} disabled={navLocked} onClick={() => { if (!navLocked) setTab(sd); }}
                      style={{ flex: 1, padding: '10px 0', borderRadius: 8, border: 'none', fontWeight: 800, cursor: navLocked ? 'not-allowed' : 'pointer',
                        background: tab === sd ? C.accent : C.cardLight, color: tab === sd ? C.bg : C.grayLight, opacity: navLocked && tab !== sd ? 0.4 : 1 }}>
                      {name} 기록{tab === sd ? '' : ' →'}
                    </button>
                  );
                })}
              </div>
            )}
            {intra && (
              <div style={{ textAlign: 'center', fontSize: 18, fontWeight: 900, color: C.white, marginBottom: 8 }}>
                {fieldsOfA(currentMatch).name} {scoreA.ourScore} : {scoreA.opponentScore} {fieldsOfB(currentMatch).name}
              </div>
            )}
            <FormationRecorder
              key={`${currentMatch.matchIdx}:${side}`}
              formation={live.formation} assignments={live.assignments} positionMap={live.positionMap}
              gk={live.gk} attendees={subPool(currentMatch, side, attendees)} opponent={v.opponent}
              startedAt={currentMatch.startedAt || Date.now()} events={v.events}
              onAddEvent={(ev) => handleAddEvent(ev, side)} onDeleteEvent={(id) => handleDeleteEvent(id)}
              onFinishMatch={(snap) => handleFinishMatch(snap, side)}
              onStateChange={(updates) => handleFormationStateChange(updates, side)} onFlowActiveChange={setNavLocked}
            />
          </>
        );
      })()}
```
핸들러(원본 `handleAddEvent`/`handleDeleteEvent`/`handleFormationStateChange`/`handleFinishMatch`를 교체):
```js
  const handleAddEvent = (ev, side) => {
    const plan = planAddEvent(currentMatch, side, ev);
    if (plan.kind === 'redirect') {
      setTab(plan.toSide);
      const nm = plan.toSide === 'A' ? fieldsOfA(currentMatch).name : fieldsOfB(currentMatch).name;
      alert(`${nm} 골은 ${nm} 탭에서 득점자를 선택해 입력하세요.`);
      return;
    }
    onAddEvent(currentMatchIdx, plan.event);
  };
  const handleDeleteEvent = (eventId) => {
    for (const a of planDeleteEvent(currentMatch, currentMatchIdx, eventId)) {
      if (a.type === 'DELETE_SOCCER_EVENT') onDeleteEvent(a.matchIdx, a.eventId);
      else if (a.type === 'PATCH_SOCCER_SIDE') onPatchSide(a.matchIdx, a.side, a.patch);
    }
  };
  const handleFormationStateChange = (updates, side) => {
    if (side === 'B') onPatchSide(currentMatchIdx, 'B', pickSidePatch(updates));
    else onUpdateMatchFormation(currentMatchIdx, updates);
  };
  const handleFinishMatch = (finalSnapshot, side) => {
    // 원본과 동일하게 최종 배치를 반영하되, 종료 버튼을 누른 탭의 편으로 라우팅한다(B 탭 종료 시 A 배치 오염 방지)
    if (finalSnapshot) handleFormationStateChange(finalSnapshot, side);
    onFinishMatch(currentMatchIdx);
    setSelectedOpponent(null); setSelectedPlayers([]); setViewState('selectOpponent'); setMatchType(null); setTab('A');
    saveFormationState({ viewState: 'selectOpponent', selectedOpponent: null, selectedPlayers: [] });
  };
```
(원본 `handleFinishMatch`가 하던 정리(`saveFormationState` 등)를 그대로 유지한 채 `side` 라우팅만 추가한다 — 원본 코드를 읽고 빠진 정리가 있으면 보존.)
`alert`는 원본 파일이 이미 `confirm`을 쓰는 관례에 맞춘 것이다.

- [ ] **Step 6: 라인업 편집기 — 편별**

`lineupEditIdx` state를 `const [lineupEdit, setLineupEdit] = useState(null)`(`{ matchIdx, side }` 객체)로 바꾸고, 원본의 `openLineupEditor(matchIdx)` 호출부(완료 패널·진행 노드의 "라인업 변경" 버튼)를 자체전이면 A/B 버튼 두 개로 나눠 `setLineupEdit({ matchIdx, side })`를 부르게 한다(외부전은 `side:'A'` 하나). 렌더를:
```jsx
  if (lineupEdit !== null) {
    const m = soccerMatches.find(x => x.matchIdx === lineupEdit.matchIdx);
    if (!m) { setLineupEdit(null); return null; }
    const side = isIntra(m) ? lineupEdit.side : 'A';
    const v = sideView(m, side);
    const fm = reconstructFormation(v);
    const bench = getNonPlayers(v, subPool(m, side, attendees));
    return (
      <LineupEditView formation={fm.formation} assignments={fm.assignments} bench={bench}
        title={`제${m.matchIdx + 1}경기 ${isIntra(m) ? (side === 'A' ? fieldsOfA(m).name : fieldsOfB(m).name) : `vs ${m.opponent}`} — 라인업 편집`}
        onSwapPositions={(aIdx, bIdx) => side === 'B'
          ? onPatchSide(m.matchIdx, 'B', sideBSwapPatch(m, aIdx, bIdx))
          : onSwapLineupPositions?.(m.matchIdx, aIdx, bIdx)}
        onCorrect={(out, inn) => {
          const outHasRecords = (v.events || []).some(e => e.player === out || e.assist === out || e.currentGk === out || e.playerIn === out || e.playerOut === out);
          if (!confirm(outHasRecords ? `${out}의 기록이 ${inn}로 이관됩니다. 계속?` : `${out}를 미출전 처리하고 ${inn}를 출전으로 바꿉니다. 계속?`)) return false;
          if (side === 'B') { const r = sideBCorrectPatch(m, out, inn); onPatchSide(m.matchIdx, 'B', r.patch, r.remapEvents); }
          else onCorrectLineup?.(m.matchIdx, out, inn);
          return true;
        }}
        onBack={() => setLineupEdit(null)} />
    );
  }
```

- [ ] **Step 7: 완료 경기 패널 — 시점 뷰로**

원본 `node && !atNewNode && !isPlayingNode` 블록 첫 줄들을:
```js
        const vA = sideView(node, 'A');
        const { ourScore, opponentScore } = calcSoccerScore(vA.events);
        const csPlayers = getCleanSheetPlayers(vA);
        const fm = isRest ? null : reconstructFormation(vA);
        const played = fm ? getSoccerPlayedPlayers(vA) : [];
        const benchNeverPlayed = fm ? getNonPlayers(vA, attendees) : [];
```
로 바꾸고(`node` → `vA`), 이벤트 목록도 `vA.events`로. 자체전이면 점수 아래에 `{isIntra(node) && <div ...>{fieldsOfA(node).name} vs {fieldsOfB(node).name}</div>}`와, B 시점 득점 목록을 추가:
```jsx
            {isIntra(node) && (() => {
              const vB = sideView(node, 'B');
              const goals = vB.events.filter(e => e.type === 'goal').sort((a, b) => a.timestamp - b.timestamp);
              return goals.length > 0 && (
                <div style={{ ...s.card, marginBottom: 12, fontSize: 11, color: C.grayLight }}>
                  <b style={{ color: C.white }}>{fieldsOfB(node).name} 득점:</b> {goals.map(e => goalLabel(e.player, e.assist)).join(', ')}
                </div>
              );
            })()}
```
`handleReopenMatch`의 confirm 문구는 `m.opponent` 대신 `sideView(m,'A').opponent`를 쓴다(외부전은 같은 값).

- [ ] **Step 8: 빌드 + 정독**

Run: `npm run build`
Expected: 성공. 이어서 파일을 처음부터 끝까지 읽어 (a) `currentMatch.ourScore`/`.opponentScore` 직접 읽기 없음, (b) 모든 `node.`/`currentMatch.` 필드 접근이 `sideView`를 거치는지(`matchIdx`/`status`/`startedAt`/`opponent`(외부전 동일) 제외), (c) `useState` 선언이 사용보다 앞인지(TDZ) 확인.

- [ ] **Step 9: Commit**

```bash
git add src/components/intra/IntraSoccerMatchView.jsx
git commit -m "feat: IntraSoccerMatchView — 자체전 유형 선택·A/B 배치·탭 기록(시점 뷰)"
```

---

### Task 9: `IntraSoccerMatchResults` + `IntraSoccerArchiveDetail`

**Files:**
- Create: `src/components/intra/IntraSoccerMatchResults.jsx`(SoccerMatchResults 복사), `src/components/intra/IntraSoccerArchiveDetail.jsx`(SoccerArchiveDetail 복사)
- Test: 빌드 + Task 11 정적 테스트.

**Interfaces:**
- Consumes: Task 2 `isIntra`/`sideView`/`fieldsOfA`/`fieldsOfB`.
- Produces: `IntraSoccerMatchResults({ matches, styles })`, `IntraSoccerArchiveDetail({ soccerMatches, es, styles })` — 원본과 같은 props. Task 10·12가 렌더.

- [ ] **Step 1: 결과표 복사·수정**

```bash
cp src/components/game/SoccerMatchResults.jsx src/components/intra/IntraSoccerMatchResults.jsx
```
import 경로를 `'../../hooks/useTheme'`, `'../../utils/soccerScoring'`로 유지하고 `import { isIntra, sideView, fieldsOfA, fieldsOfB } from '../../utils/intraSoccer/sideView';` 추가. 컴포넌트 이름 `IntraSoccerMatchResults`. 행 렌더를:
```jsx
        {finished.map(m => {
          const isRest = m.opponent === "휴식";
          if (isIntra(m)) {
            const vA = sideView(m, 'A'), vB = sideView(m, 'B');
            const sc = calcSoccerScore(vA.events);
            return (
              <tr key={m.matchIdx}>
                <td style={s.td()}>{m.matchIdx + 1}</td>
                <td style={{ ...s.td(true), textAlign: "left", paddingLeft: 4 }}>{fieldsOfA(m).name} vs {fieldsOfB(m).name}</td>
                <td style={{ ...s.td(true), whiteSpace: "nowrap", color: C.white }}>{sc.ourScore}:{sc.opponentScore}</td>
                <td style={{ ...s.td(), textAlign: "left", paddingLeft: 4, fontSize: 11, color: C.grayLight, lineHeight: 1.5 }}>
                  <div>{fieldsOfA(m).name}: {scorers(vA).join(", ") || "-"}</div>
                  <div>{fieldsOfB(m).name}: {scorers(vB).join(", ") || "-"}</div>
                </td>
              </tr>
            );
          }
          const sc = calcSoccerScore(m.events);
          // ... 이하 원본 외부전 행 그대로
```

- [ ] **Step 2: 아카이브 상세 복사·수정**

```bash
cp src/components/history/SoccerArchiveDetail.jsx src/components/intra/IntraSoccerArchiveDetail.jsx
```
import: `SoccerStandingsTable`는 `'../game/SoccerStandingsTable'`, 결과표는 `'./IntraSoccerMatchResults'`, 헬퍼 `import { isIntra, sideView } from '../../utils/intraSoccer/sideView';`. 계산부를:
```js
  const matches = soccerMatches || [];
  const finished = matches.filter(m => m.status === "finished");
  const externalOnly = matches.filter(m => !isIntra(m));          // 팀 전적·상대별 전적은 외부전만(자체전은 무의미)
  const rec = calcSoccerTeamRecord(externalOnly);
  const oppRecords = calcSoccerOpponentRecords(externalOnly);
  const perSide = finished.flatMap(m => (isIntra(m) ? [sideView(m, 'A'), sideView(m, 'B')] : [m]));
  const playerRows = Object.entries(calcSoccerPlayerStats(perSide)).map(/* 원본 그대로 */);
```
`<SoccerMatchResults matches={matches} .../>` → `<IntraSoccerMatchResults matches={matches} styles={hs} />`. 팀 순위 섹션은 `externalOnly.length > 0`일 때만 렌더.

- [ ] **Step 3: 빌드** — `npm run build` → 성공.

- [ ] **Step 4: Commit**

```bash
git add src/components/intra/IntraSoccerMatchResults.jsx src/components/intra/IntraSoccerArchiveDetail.jsx
git commit -m "feat: 자체전 결과표·아카이브 상세(양팀 득점자·선수 기록)"
```

---

### Task 10: `IntraSoccerApp` — SoccerApp 복사 + 마감·시작 게이트·결과표

**Files:**
- Create: `src/IntraSoccerApp.jsx` (`cp src/SoccerApp.jsx`)
- Test: 빌드 + Task 11 정적 테스트.

**Interfaces:**
- Consumes: Task 6 `buildIntraRows`, Task 8 `IntraSoccerMatchView`, Task 9 `IntraSoccerMatchResults`, Task 4 액션 `PATCH_SOCCER_SIDE`.
- Produces: `IntraSoccerApp({ authUser, teamContext, isNewGame, gameMode, gameId, onLogout, onBackToMenu })` — SoccerApp과 동일 props. Task 12 Root가 선택.

- [ ] **Step 1: 복사 + import 수정**

```bash
cp src/SoccerApp.jsx src/IntraSoccerApp.jsx
```
- `import SoccerMatchView from './components/game/SoccerMatchView';` → `import IntraSoccerMatchView from './components/intra/IntraSoccerMatchView';`
- `import SoccerMatchResults from './components/game/SoccerMatchResults';` → `import IntraSoccerMatchResults from './components/intra/IntraSoccerMatchResults';`
- 추가: `import { buildIntraRows } from './utils/intraSoccer/buildIntraRows';`
- 제거(마감에서 더 안 쓰면): `buildEventLogRows, buildPointLogRows, buildPlayerLogRows`, `buildRawEventsFromSoccer, buildRawPlayerGamesFromSoccer`, `buildRoundRowsFromSoccer` import.
- 함수 이름 `export default function IntraSoccerApp(...)`. 헤더 타이틀 문구 `⚽ {team} 경기기록` 유지.

- [ ] **Step 2: dispatch 래퍼 추가 + 뷰 props**

`swapSoccerLineupPositions` 뒤에:
```js
  const patchSoccerSide = (matchIdx, side, patch, remapEvents) => {
    if (matchIdx < 0) return;
    dispatch({ type: 'PATCH_SOCCER_SIDE', matchIdx, side, patch, ...(remapEvents ? { remapEvents } : {}) });
  };
```
렌더의 `<SoccerMatchView ...>` → `<IntraSoccerMatchView ... onPatchSide={patchSoccerSide} />`(나머지 props 동일). `<SoccerMatchResults matches={state.soccerMatches} styles={s} />` → `<IntraSoccerMatchResults ... />`.

- [ ] **Step 3: setup 시작 게이트**

`const canStart = (state.opponents || []).length > 0;` → 
```js
            const canStart = (state.opponents || []).length > 0 || attendees.length >= 22; // 외부전(상대팀) 또는 자체전(22명)
```
버튼 문구: `canStart ? \`축구 경기 시작 (${attendees.length}명)\` : "상대팀을 선택하거나 참석자 22명 이상(자체전)이어야 합니다"`. 참석팀 섹션 설명에 `(자체전만 하는 날은 비워도 됩니다)` 추가.

- [ ] **Step 4: handleFinalize 교체**

`cancelPendingSave();` 다음부터 `try {` 앞까지(행 빌드 블록)를:
```js
    const team = teamContext?.team || '';
    const { pointLogRows, playerLogRows, rawEvents, rawPlayerGames, matchRows } =
      buildIntraRows({ team, dateStr, inputTime, finished });
```
로 교체. `Promise.allSettled([...])`의 5개 호출은 변수명이 같아 그대로 둔다. confirm 문구의 `3종 로그` → `자체전/외부전 로그`. 나머지(legacyOk→rawFailed→saveFinalized→syncDiff→set→refreshAfterFinalize→alert) 무변경.

- [ ] **Step 5: 빌드 + 정독** — `npm run build` 성공. 파일에서 `ourScore`/`opponentScore` 문자열을 검색해 **읽기 0건** 확인(원본 SoccerApp에 있으면 해당 표시 코드를 `sideView(m,'A')` 기반으로 바꾸거나 제거).

- [ ] **Step 6: Commit**

```bash
git add src/IntraSoccerApp.jsx
git commit -m "feat: IntraSoccerApp — 빅마스터FC 오케스트레이션(자체전 마감·시작 게이트)"
```

---

### Task 11: 정적 불변식 테스트 — Intra 계열은 저장 점수를 읽지 않는다

**Files:**
- Test: `src/utils/intraSoccer/__tests__/intraNoScoreRead.test.js`

- [ ] **Step 1: 테스트 작성(곧 통과해야 함)**

```js
// src/utils/intraSoccer/__tests__/intraNoScoreRead.test.js
// 스펙 §4: 자체전에서 m.ourScore/m.opponentScore 는 A 시점 점수가 아니다. Intra 계열은 읽지 않는다.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../../../..');
const FILES = [
  'src/IntraSoccerApp.jsx',
  'src/components/intra/IntraSoccerMatchView.jsx',
  'src/components/intra/IntraSoccerMatchResults.jsx',
  'src/components/intra/IntraSoccerArchiveDetail.jsx',
  'src/utils/intraSoccer/buildIntraRows.js',
];

describe('Intra 계열 정적 불변식', () => {
  for (const f of FILES) {
    it(`${f} 는 .ourScore/.opponentScore 저장 필드를 읽지 않는다`, () => {
      const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
      // calcSoccerScore(...) 결과 구조분해 `{ ourScore, opponentScore }` 와 `sc.ourScore` 는 허용 — 저장 필드 접근(m./node./currentMatch./match.)만 금지
      const bad = src.match(/\b(m|node|currentMatch|match|mm)\.(ourScore|opponentScore)\b/g) || [];
      expect(bad).toEqual([]);
    });
  }
  it('Intra 계열은 하버FC 원본 컴포넌트를 수정하지 않고 import 만 한다', () => {
    const view = fs.readFileSync(path.join(ROOT, 'src/components/intra/IntraSoccerMatchView.jsx'), 'utf8');
    for (const leaf of ['FormationSetup', 'FormationRecorder', 'FormationPitch', 'LineupEditView', 'RoundNav', 'ConfirmBar']) {
      expect(view).toMatch(new RegExp(`import ${leaf} from '../game/${leaf}'`));
    }
  });
});
```

- [ ] **Step 2: 실행** — `npx vitest run src/utils/intraSoccer/__tests__/intraNoScoreRead.test.js` → PASS. 실패하면 해당 파일의 저장 필드 읽기를 `sideView` 기반으로 고친다(테스트를 고치지 않는다).

- [ ] **Step 3: Commit**

```bash
git add src/utils/intraSoccer/__tests__/intraNoScoreRead.test.js
git commit -m "test: Intra 계열 저장 점수 미읽기·잎 컴포넌트 import 불변식"
```

---

### Task 12: 진입 분기 — Root + HistoryView (공유 파일, 추가만)

**Files:**
- Modify: `src/Root.jsx:10`(import), `:12` 뒤(import IntraSoccerApp), `:209-211`(GameApp 분기); `src/components/history/HistoryView.jsx:8`(import), `:194-195`(분기)

**Interfaces:**
- Consumes: Task 1 `intraSquad`, Task 10 `IntraSoccerApp`, Task 9 `IntraSoccerArchiveDetail`, Task 2 `isIntra`.

- [ ] **Step 1: Root.jsx**

```js
import { loadSettingsFromFirebase, getEffectiveSettings } from './config/settings';
// ...
import SoccerApp from './SoccerApp';
import IntraSoccerApp from './IntraSoccerApp';
```
분기:
```js
  // 빅마스터FC: 축구 프리셋 intraSquad(자체전축구)일 때만 IntraSoccerApp. 하버FC 는 플래그가 없어 기존 식 그대로.
  const isIntra = teamContext?.mode === "축구" && getEffectiveSettings(teamContext.team, "축구").intraSquad === true;
  const GameApp = isIntra ? IntraSoccerApp
    : teamContext?.mode === "축구" ? SoccerApp
    : teamContext?.mode === "테니스" ? TennisApp
    : App;
```

- [ ] **Step 2: HistoryView.jsx**

```js
import SoccerArchiveDetail from './SoccerArchiveDetail';
import IntraSoccerArchiveDetail from '../intra/IntraSoccerArchiveDetail';
import { isIntra } from '../../utils/intraSoccer/sideView';
```
`const isSoccer = matchMode === "soccer";` 뒤에 `const hasIntra = isSoccer && soccerMatches.some(isIntra);` (단 `soccerMatches` 선언(169행) **뒤**에 두어 TDZ를 피한다). 렌더:
```jsx
          ) : isSoccer ? (
            hasIntra
              ? <IntraSoccerArchiveDetail soccerMatches={soccerMatches} es={es} styles={hs} />
              : <SoccerArchiveDetail soccerMatches={soccerMatches} es={es} styles={hs} />
          ) : (
```

- [ ] **Step 3: 빌드 + 전체 테스트**

Run: `npm run build && npx vitest run`
Expected: 빌드 성공, 전체 PASS(기존 1666 + 신규).

- [ ] **Step 4: Commit**

```bash
git add src/Root.jsx src/components/history/HistoryView.jsx
git commit -m "feat: 빅마스터FC(intraSquad) 진입·아카이브 분기"
```

---

### Task 13: 격리 검증 + 문서

**Files:**
- Modify: `docs/superpowers/specs/2026-09-10-bigmaster-intrasquad-soccer-design.md`(상태 줄만 "구현 완료, 배포 대기"로)
- 검증 스크립트(커밋 안 함, 리뷰 단계 실행)

- [ ] **Step 1: 접촉 면 화이트리스트 검사**

```bash
git diff --name-only origin/main -- src | grep -v -E '^src/(IntraSoccerApp\.jsx|components/intra/|utils/intraSoccer/|utils/soccerAnalytics/(parseSideExtras|expandIntraMatchRows)\.js|utils/soccerAnalytics/__tests__/intraMode\.test\.js|config/__tests__/settings\.intra\.test\.js|hooks/__tests__/useGameReducer\.intraSide\.test\.js)' | sort
```
Expected(정확히 아래 8개만):
```
src/Root.jsx
src/components/history/HistoryView.jsx
src/config/settings.js
src/hooks/useGameReducer.js
src/utils/soccerAnalytics/calcDefenseAnalysis.js
src/utils/soccerAnalytics/calcOpponentBreakdown.js
src/utils/soccerAnalytics/calcOpponentDefense.js
src/utils/soccerAnalytics/calcOpponentLeaders.js
```
그 외 기존 파일이 나오면 되돌린다. 또 `git diff origin/main --stat -- apps-script src/SoccerApp.jsx src/components/game src/utils/soccerScoring.js src/utils/matchRowBuilder.js src/utils/rawLogBuilders.js src/utils/formations.js src/services src/App.jsx src/utils/analyticsV2 src/components/dashboard/TeamDashboard.jsx` 출력이 **비어야** 한다.

- [ ] **Step 2: 공유 파일 diff 정독**

`git diff origin/main -- src/Root.jsx src/config/settings.js src/hooks/useGameReducer.js src/components/history/HistoryView.jsx src/utils/soccerAnalytics/calc*.js` — 모든 hunk가 추가(+) 또는 "조건 추가"만인지, 삭제(−)된 기존 동작 줄이 없는지 확인.

- [ ] **Step 3: 전체 테스트·빌드** — `npx vitest run && npm run build` → PASS/성공.

- [ ] **Step 4: 스펙 상태 갱신 + Commit**

```bash
git add docs/superpowers/specs/2026-09-10-bigmaster-intrasquad-soccer-design.md
git commit -m "docs: 빅마스터FC 자체전 스펙 상태 — 구현 완료"
```

이후는 `superpowers:finishing-a-development-branch` — 머지 전 **적대적 리뷰 5렌즈(회귀 렌즈 필수)**, 배포 후 빅마스터FC 자체전 테스트 경기 1회 마감 → 로그_매치 1행·선수경기 22~23행·이벤트 편 이름·포인트 로그 미기록 확인 → 테스트 행 삭제(유저), 하버FC 대시보드·개인분석 무변화 확인.
