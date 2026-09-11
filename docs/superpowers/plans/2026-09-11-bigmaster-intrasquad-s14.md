# 빅마스터FC 증분 3 (§14: 다중 접속자 실시간 전파) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 여러 명이 동시에 접속해 누구나 기록해도 모든 화면이 실시간으로 일치하게 만든다 — 이벤트·점수는 이미 실시간이므로, **원격 배치 변경(교체·위치교대·GK)이 도착하면 레코더를 새 props 로 재마운트**하고(입력 중이면 보류) 전파 지연 창의 경합 두 개를 막는다.

**Architecture:** 순수 모듈 `liveSync.js`(배치 지문 + 재마운트 판정)를 만들고, `IntraSoccerMatchView`가 현재 보고 있는 편의 지문을 추적해 `key`의 리비전을 올린다. 내가 보낸 변경의 왕복 echo 는 지문 Set 으로 1회 소비해 무시한다. "입력 중" 판정은 `FormationRecorder`에 **선택적 prop `onBusyChange` 1개를 추가**해 골 플로우 + 모달 전체를 덮는다(하버FC 는 이 prop 을 넘기지 않아 동작 불변).

**Tech Stack:** React 18 + Vite, vitest(jsdom, `globals:false`), Firebase RTDB. 증분 1·2 는 로컬 `main`(…03aafc3)에 머지돼 있다.

**Spec:** `docs/superpowers/specs/2026-09-10-bigmaster-intrasquad-soccer-design.md` — **§14 전체**(14.2 실측, 14.3 재마운트 설계, 14.4 가드, 14.5 한계, 14.6 접촉 면·테스트). §13 과 §5(sideView)도 맥락으로 읽는다.

## Global Constraints

- 변경 허용 파일은 **정확히 4개 + 신규**: `src/utils/intraSoccer/liveSync.js`(신규), `src/components/game/FormationRecorder.jsx`(**추가만** — 선택적 prop 1개 + `useLayoutEffect` 1개), `src/components/intra/IntraSoccerMatchView.jsx`, 테스트 파일들. `git diff --name-only <base> -- src | grep -v -E '^src/(utils/intraSoccer/|components/intra/|components/game/(FormationRecorder\.jsx|__tests__/))'` 가 **빈 출력**이어야 한다.
- **하버FC 무영향**: `SoccerMatchView.jsx`(하버FC 호출부)는 `onBusyChange` 를 넘기지 않는다 → 새 effect 는 `undefined?.()` no-op. `onFlowActiveChange` 의 조건·의미는 **절대 바꾸지 않는다**(하버FC ◀▶ 잠금). `SoccerApp.jsx`·리듀서·`firebaseSyncDiff`·Apps Script 무수정.
- 기존 테스트(1765개) 무수정 통과. vitest `globals:false` — `import { describe, it, expect, vi } from 'vitest'` 필수.
- 이름·시그니처는 이 문서 그대로: `formationFingerprint(view)`, `decideRemount({ currentFp, seedFp, localFps, busy })` → `{ remount, pending, consume }`, prop 이름 `onBusyChange`.
- `events`·점수는 지문에 넣지 않는다(이벤트는 이미 prop 파생 — 재마운트하면 진행 중 입력이 날아간다).
- 브랜치 `feature/bigmaster-s14`(worktree), 태스크마다 커밋, 메시지 한국어. 트레일러 2줄은 컨트롤러가 디스패치에 지정.

---

## File Structure

| 파일 | 책임 |
|---|---|
| `src/utils/intraSoccer/liveSync.js` (신규) | `formationFingerprint` 안정 직렬화 + `decideRemount` 순수 판정 |
| `src/components/game/FormationRecorder.jsx` (추가만) | 선택적 `onBusyChange` — 골 플로우·교체 모달·포메이션 피커·선수 메뉴 열림 보고 |
| `src/components/intra/IntraSoccerMatchView.jsx` | 지문 추적·재마운트 리비전·보류 안내·종료/동시생성 가드 |
| `src/utils/intraSoccer/__tests__/liveSync.test.js` (신규) | 지문·판정 단위 테스트(진짜 회귀 가드) |
| `src/components/game/__tests__/FormationRecorder.busy.test.jsx` (신규) | `onBusyChange` 가 모달 열림을 보고하고, 미연결 시 기존 동작 불변 |
| `src/components/intra/__tests__/IntraSoccerMatchView.smoke.test.jsx` | 원격 반영·보류·종료 차단 시나리오 추가 |

---

### Task 1: `liveSync.js` — 배치 지문 + 재마운트 판정(순수)

**Files:**
- Create: `src/utils/intraSoccer/liveSync.js`
- Test: `src/utils/intraSoccer/__tests__/liveSync.test.js`

**Interfaces:**
- Produces:
  - `formationFingerprint(view) → string` — `view` 는 `sideView(m, side)` 결과(또는 같은 모양의 객체). `formation`·`gk`·`assignments`(슬롯 키 숫자 오름차순)·`positionMap`(이름 사전순)·`subs`(사전순 복사본)만 읽는다. 누락·`null` 안전. `events` 는 읽지 않는다.
  - `decideRemount({ currentFp, seedFp, localFps, busy }) → { remount: boolean, pending: boolean, consume: string|null }` — 판정 순서: ① `currentFp === seedFp` → `{false, false, null}` ② `localFps.has(currentFp)` → `{false, false, currentFp}` ③ `busy` → `{false, true, null}` ④ else → `{true, false, null}`. `localFps` 는 `Set`(없으면 빈 Set 취급).

- [ ] **Step 1: 실패하는 테스트 작성**

```js
// src/utils/intraSoccer/__tests__/liveSync.test.js
import { describe, it, expect } from 'vitest';
import { formationFingerprint, decideRemount } from '../liveSync';

const base = {
  formation: '4-4-2', gk: 'a1',
  assignments: { 0: 'a1', 1: 'a2', 10: 'a11' },
  positionMap: { a1: 'GK', a2: 'DF', a11: 'FW' },
  subs: ['a12', 'a13'],
  events: [{ id: 'e1', type: 'goal', player: 'a11' }],
};

describe('formationFingerprint', () => {
  it('같은 배치는 키 삽입 순서·subs 순서와 무관하게 같은 지문', () => {
    const shuffled = {
      subs: ['a13', 'a12'],
      positionMap: { a11: 'FW', a1: 'GK', a2: 'DF' },
      assignments: { 10: 'a11', 1: 'a2', 0: 'a1' },
      gk: 'a1', formation: '4-4-2',
      events: [],                                  // events 는 지문에 영향 없음
    };
    expect(formationFingerprint(shuffled)).toBe(formationFingerprint(base));
  });
  it('슬롯 번호는 숫자 순서로 정렬한다(문자열 정렬이면 10 이 2 앞에 온다)', () => {
    const a = formationFingerprint({ ...base, assignments: { 0: 'a1', 1: 'a2', 10: 'a11' } });
    const b = formationFingerprint({ ...base, assignments: { 0: 'a1', 10: 'a11', 1: 'a2' } });
    expect(a).toBe(b);
  });
  it('배치 한 곳만 달라도 지문이 다르다', () => {
    expect(formationFingerprint({ ...base, gk: 'a2' })).not.toBe(formationFingerprint(base));
    expect(formationFingerprint({ ...base, formation: '4-3-3' })).not.toBe(formationFingerprint(base));
    expect(formationFingerprint({ ...base, assignments: { ...base.assignments, 1: 'a9' } })).not.toBe(formationFingerprint(base));
    expect(formationFingerprint({ ...base, positionMap: { ...base.positionMap, a2: 'MF' } })).not.toBe(formationFingerprint(base));
    expect(formationFingerprint({ ...base, subs: ['a12'] })).not.toBe(formationFingerprint(base));
  });
  it('이벤트만 바뀌면 지문은 같다(재마운트 금지 — 진행 중 입력 보호)', () => {
    expect(formationFingerprint({ ...base, events: [{ id: 'x', type: 'goal', player: 'a2' }] }))
      .toBe(formationFingerprint(base));
  });
  it('누락·null·빈 객체도 던지지 않고 안정적인 지문을 만든다', () => {
    expect(typeof formationFingerprint({})).toBe('string');
    expect(formationFingerprint({ assignments: null, positionMap: null, subs: null }))
      .toBe(formationFingerprint({}));
    expect(typeof formationFingerprint(null)).toBe('string');
  });
});

describe('decideRemount', () => {
  const S = (...xs) => new Set(xs);
  it('① 시드와 같으면 아무것도 안 하고 보류도 해제', () => {
    expect(decideRemount({ currentFp: 'fp1', seedFp: 'fp1', localFps: S('fp9'), busy: true }))
      .toEqual({ remount: false, pending: false, consume: null });
  });
  it('② 내 변경 echo 는 재마운트하지 않고 1회 소비한다', () => {
    expect(decideRemount({ currentFp: 'fp2', seedFp: 'fp1', localFps: S('fp2', 'fp3'), busy: false }))
      .toEqual({ remount: false, pending: false, consume: 'fp2' });
  });
  it('③ 입력 중이면 보류', () => {
    expect(decideRemount({ currentFp: 'fpX', seedFp: 'fp1', localFps: S(), busy: true }))
      .toEqual({ remount: false, pending: true, consume: null });
  });
  it('④ 입력 중이 아니면 재마운트', () => {
    expect(decideRemount({ currentFp: 'fpX', seedFp: 'fp1', localFps: S(), busy: false }))
      .toEqual({ remount: true, pending: false, consume: null });
  });
  it('연속 두 변경: 두 지문이 모두 Set 에 있어 어느 echo 가 먼저 와도 오인하지 않는다', () => {
    const set = S('fp2', 'fp3');
    const first = decideRemount({ currentFp: 'fp2', seedFp: 'fp1', localFps: set, busy: false });
    expect(first.remount).toBe(false);
    set.delete(first.consume);
    const second = decideRemount({ currentFp: 'fp3', seedFp: 'fp1', localFps: set, busy: false });
    expect(second).toEqual({ remount: false, pending: false, consume: 'fp3' });
  });
  it('같은 지문으로 두 번 억제되지 않는다(소비 후 남이 되돌리면 원격 변경으로 본다)', () => {
    const set = S('fp2');
    set.delete(decideRemount({ currentFp: 'fp2', seedFp: 'fp1', localFps: set, busy: false }).consume);
    expect(decideRemount({ currentFp: 'fp2', seedFp: 'fp1', localFps: set, busy: false }).remount).toBe(true);
  });
  it('localFps 미전달도 안전', () => {
    expect(decideRemount({ currentFp: 'fpX', seedFp: 'fp1', busy: false }).remount).toBe(true);
  });
});
```

- [ ] **Step 2: 실패 확인** — `npx vitest run src/utils/intraSoccer/__tests__/liveSync.test.js` → FAIL(module not found).

- [ ] **Step 3: 구현**

```js
// src/utils/intraSoccer/liveSync.js
// 빅마스터FC 증분 3(스펙 §14): 여러 명이 동시에 기록할 때 원격 '배치' 변경을 화면에 반영하기 위한 순수 계산.
// FormationRecorder 는 uncontrolled(배치를 마운트 시 1회 시드)라, 원격 배치 변경은 key 를 바꿔 재마운트해야
// 보이고 또 내 다음 저장이 남의 변경을 덮지 않는다. 이벤트·점수는 이미 prop 파생이므로 지문에 넣지 않는다
// (넣으면 골 하나에도 재마운트돼 진행 중 입력이 날아간다).
const str = (v) => (v == null ? '' : String(v));

export function formationFingerprint(view) {
  const v = view || {};
  const asg = v.assignments && typeof v.assignments === 'object' ? v.assignments : {};
  const pm = v.positionMap && typeof v.positionMap === 'object' ? v.positionMap : {};
  const subs = Array.isArray(v.subs) ? [...v.subs].map(str).sort() : [];
  // 슬롯 키는 숫자 오름차순(문자열 정렬이면 '10' < '2' 가 되어 같은 배치가 다른 지문이 될 수 있다)
  const asgPart = Object.keys(asg)
    .sort((a, b) => Number(a) - Number(b))
    .map(k => `${k}=${str(asg[k])}`)
    .join(',');
  const pmPart = Object.keys(pm).sort().map(k => `${k}=${str(pm[k])}`).join(',');
  return `f:${str(v.formation)}|g:${str(v.gk)}|a:${asgPart}|p:${pmPart}|s:${subs.join(',')}`;
}

// 현재 지문이 '내가 만든 것'인지 '남이 만든 것'인지 가려 재마운트 여부를 정한다.
//   localFps: 내가 보냈지만 아직 왕복 echo 가 오지 않은 지문들(Set). consume 으로 1회만 소비한다 —
//   같은 지문을 영구 억제하면, 남이 내 상태를 되돌렸을 때 그것을 내 echo 로 오인한다.
export function decideRemount({ currentFp, seedFp, localFps, busy }) {
  if (currentFp === seedFp) return { remount: false, pending: false, consume: null };
  if (localFps && typeof localFps.has === 'function' && localFps.has(currentFp)) {
    return { remount: false, pending: false, consume: currentFp };
  }
  if (busy) return { remount: false, pending: true, consume: null };
  return { remount: true, pending: false, consume: null };
}
```

- [ ] **Step 4: 통과 확인** — `npx vitest run src/utils/intraSoccer` → PASS(기존 포함).
- [ ] **Step 5: Commit** — `git add src/utils/intraSoccer/liveSync.js src/utils/intraSoccer/__tests__/liveSync.test.js && git commit -m "feat: 실시간 재마운트 판정용 배치 지문·decideRemount(liveSync)"`

---

### Task 2: `FormationRecorder.onBusyChange` — 선택적 prop 추가(공유 파일, 추가만)

**Files:**
- Modify: `src/components/game/FormationRecorder.jsx` — props 구조분해(`:17-21`)에 `onBusyChange` 추가, 기존 `onFlowActiveChange` useLayoutEffect(`:36-39`) **바로 뒤**에 새 useLayoutEffect 1개 추가. 다른 줄 무변경.
- Test: `src/components/game/__tests__/FormationRecorder.busy.test.jsx`

**Interfaces:**
- Produces: `onBusyChange?: (busy: boolean) => void` — `goalFlow != null || showSubModal || showFormationPicker || actionPlayer != null` 이 바뀔 때마다 호출, 언마운트/재실행 시 `false`. Task 3 이 `setBusy` 로 연결한다.
- **`onFlowActiveChange` 는 손대지 않는다**(하버FC ◀▶ 잠금 조건 불변).

- [ ] **Step 1: 실패하는 테스트 작성**

```jsx
// src/components/game/__tests__/FormationRecorder.busy.test.jsx
// onBusyChange(선택적 prop)는 '사용자 입력 중'(골 플로우·교체 모달·포메이션 피커·선수 액션 메뉴)을 상위에 알린다.
// 빅마스터FC 실시간 재마운트가 입력 중 레코더를 날리지 않게 하는 신호다(스펙 §14.3.2).
// 하버FC(SoccerMatchView)는 이 prop 을 넘기지 않으므로 미연결 시 기존 동작이 불변이어야 한다.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { ThemeProvider } from '../../../hooks/useTheme';
import FormationRecorder from '../FormationRecorder';

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (q) => ({ matches: false, media: q, onchange: null, addListener(){}, removeListener(){}, addEventListener(){}, removeEventListener(){}, dispatchEvent(){} }),
});
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const eleven = (p) => Array.from({ length: 11 }, (_, i) => `${p}${i + 1}`);
const NAMES = eleven('a');
const PROPS = {
  formation: '4-4-2',
  assignments: Object.fromEntries(NAMES.map((n, i) => [i, n])),
  positionMap: Object.fromEntries(NAMES.map((n, i) => [n, i === 0 ? 'GK' : i < 5 ? 'DF' : 'FW'])),
  gk: 'a1', attendees: [...NAMES, 'a12'], opponent: '상대', startedAt: 1,
  events: [], onAddEvent: () => {}, onDeleteEvent: () => {}, onFinishMatch: () => {}, onStateChange: () => {},
};

let container, root;
beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); });
afterEach(async () => { await act(async () => root?.unmount()); root = null; container.remove(); });

async function mount(extra = {}) {
  await act(async () => {
    root = createRoot(container);
    root.render(createElement(ThemeProvider, null, createElement(FormationRecorder, { ...PROPS, ...extra })));
  });
}
const byPartial = (sel, t) => [...container.querySelectorAll(sel)].find(el => el.textContent.includes(t));
const click = async (el) => { expect(el).toBeTruthy(); await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); }); };

describe('FormationRecorder onBusyChange', () => {
  it('마운트 시 false, 교체 모달을 열면 true, 닫으면 false', async () => {
    const onBusyChange = vi.fn();
    await mount({ onBusyChange });
    expect(onBusyChange).toHaveBeenCalledWith(false);
    onBusyChange.mockClear();
    await click(byPartial('button', '교체'));
    expect(onBusyChange).toHaveBeenCalledWith(true);
    onBusyChange.mockClear();
    // 모달 닫기(Modal 의 닫기 버튼 — 텍스트가 바뀌면 이 선택자만 고친다)
    const close = byPartial('button', '✕') || byPartial('button', '닫기');
    if (close) { await click(close); expect(onBusyChange).toHaveBeenCalledWith(false); }
  });
  it('포메이션 피커를 열면 true', async () => {
    const onBusyChange = vi.fn();
    await mount({ onBusyChange });
    onBusyChange.mockClear();
    await click(byPartial('button', '포메이션'));
    expect(onBusyChange).toHaveBeenCalledWith(true);
  });
  it('언마운트 시 false 로 정리한다', async () => {
    const onBusyChange = vi.fn();
    await mount({ onBusyChange });
    await click(byPartial('button', '교체'));
    onBusyChange.mockClear();
    await act(async () => root.unmount());
    root = null;
    expect(onBusyChange).toHaveBeenCalledWith(false);
  });
  it('onBusyChange 미연결(하버FC)에서도 렌더·onFlowActiveChange 동작 불변', async () => {
    const onFlowActiveChange = vi.fn();
    await mount({ onFlowActiveChange });                 // onBusyChange 없음
    expect(onFlowActiveChange).toHaveBeenCalledWith(false);
    expect(container.textContent).toContain('교체');     // 크래시 없이 렌더
  });
});
```

- [ ] **Step 2: 실패 확인** — `npx vitest run src/components/game/__tests__/FormationRecorder.busy.test.jsx` → 앞의 3 케이스 FAIL(`onBusyChange` 미호출), 마지막 케이스 PASS.

- [ ] **Step 3: 구현(추가만)**

props 구조분해 끝(`onFlowActiveChange,` 뒤)에 `onBusyChange,` 추가. 기존 effect 바로 뒤에:
```js
  // 상위가 '사용자 입력 중'을 알아야 하는 경우(빅마스터FC 실시간 재마운트 보류)에만 연결한다.
  // 하버FC(SoccerMatchView)는 이 prop 을 넘기지 않으므로 ?. 로 no-op — 기존 동작 완전 불변.
  // onFlowActiveChange(네비 잠금)와 분리한 이유: 잠금 조건을 넓히면 하버FC ◀▶ 동작이 바뀐다.
  useLayoutEffect(() => {
    onBusyChange?.(goalFlow != null || showSubModal || showFormationPicker || actionPlayer != null);
    return () => onBusyChange?.(false);
  }, [goalFlow, showSubModal, showFormationPicker, actionPlayer, onBusyChange]);
```

- [ ] **Step 4: 통과 확인** — `npx vitest run src/components/game src/components/intra` → PASS. `git diff src/components/game/FormationRecorder.jsx` 가 **추가 줄만**(삭제 0, props 한 줄 수정)인지 확인.
- [ ] **Step 5: Commit** — `git add src/components/game/FormationRecorder.jsx src/components/game/__tests__/FormationRecorder.busy.test.jsx && git commit -m "feat: FormationRecorder 선택적 onBusyChange(입력 중 보고) — 하버FC 무영향"`

---

### Task 3: `IntraSoccerMatchView` — 재마운트 배선 + 경합 가드 + 컴포넌트 테스트

**Files:**
- Modify: `src/components/intra/IntraSoccerMatchView.jsx` — import(`:1`, `:15-16`), 최상위 파생(`:90` 아래), 새 state/ref/effect, `handleFormationStateChange`(`:198`), `handleAddEvent`(`:207`), `handleDeleteEvent`(`:219`), `handleIntraConfirm`(`:160` 근처), `handleFormationConfirm`, 레코더 렌더(`:455-465`)
- Modify(테스트 추가): `src/components/intra/__tests__/IntraSoccerMatchView.smoke.test.jsx`

**Interfaces:**
- Consumes: `formationFingerprint`, `decideRemount`(Task 1), `onBusyChange`(Task 2), 기존 `sideView`/`isIntra`/`sidePool`.

- [ ] **Step 1: 컴포넌트 테스트 작성(실패 확인용)**

스모크 파일 상단 헬퍼에 **같은 root 로 다시 렌더하는** 함수를 추가한다(기존 `mount` 는 새 root 를 만든다 — 재마운트 검증에 쓸 수 없다):
```js
async function rerender(props = {}) {
  await act(async () => {
    root.render(createElement(ThemeProvider, null, createElement(Harness, { ...BASE_PROPS, ...props })));
  });
}
```
그리고 `describe('IntraSoccerMatchView 실시간 전파 — 증분 3')` 블록 추가:
```js
  const playingIntra = {
    matchIdx: 0, status: 'playing', opponent: '검은팀', startedAt: 1,
    lineup: WHITE, gk: 'a1', defenders: [], subs: ['a12'],
    formation: '4-4-2',
    assignments: Object.fromEntries(WHITE.map((n, i) => [i, n])),
    positionMap: Object.fromEntries(WHITE.map((n, i) => [n, i === 0 ? 'GK' : 'FW'])),
    events: [],
    sideA: { name: '흰팀' },
    sideB: { name: '검은팀', lineup: BLACK, gk: 'b1', defenders: [], subs: ['b12'],
             formation: '4-4-2',
             assignments: Object.fromEntries(BLACK.map((n, i) => [i, n])),
             positionMap: Object.fromEntries(BLACK.map((n, i) => [n, i === 0 ? 'GK' : 'FW'])) },
  };
  const withAttendees = { attendees: [...WHITE, ...BLACK, 'a12', 'b12'] };

  it('원격 배치 변경(A 편 교체)이 도착하면 피치에 새 선수가 보인다', async () => {
    await mount({ ...withAttendees, soccerMatches: [playingIntra], currentMatchIdx: 0 });
    expect(text()).toContain('a11');
    expect(text()).not.toContain('a12');
    // 다른 기기에서 a11 → a12 교체: assignments·subs 가 바뀐 새 경기 객체가 도착
    const remote = {
      ...playingIntra,
      assignments: { ...playingIntra.assignments, 10: 'a12' },
      positionMap: { ...playingIntra.positionMap, a12: 'FW' },
      subs: ['a11'],
    };
    await rerender({ ...withAttendees, soccerMatches: [remote], currentMatchIdx: 0 });
    expect(text()).toContain('a12');
  });

  it('입력 중(교체 모달 열림)에는 보류하고 안내를 띄우며, 닫으면 반영한다', async () => {
    await mount({ ...withAttendees, soccerMatches: [playingIntra], currentMatchIdx: 0 });
    await click(byPartialText('button', '교체'));              // 모달 열기 → onBusyChange(true)
    const remote = {
      ...playingIntra,
      assignments: { ...playingIntra.assignments, 10: 'a12' },
      positionMap: { ...playingIntra.positionMap, a12: 'FW' },
      subs: ['a11'],
    };
    await rerender({ ...withAttendees, soccerMatches: [remote], currentMatchIdx: 0 });
    expect(text()).toContain('다른 기기에서 배치가 변경');       // 보류 안내
    const close = byPartialText('button', '✕') || byPartialText('button', '닫기');
    if (close) {
      await click(close);                                      // onBusyChange(false) → 보류분 적용
      expect(text()).toContain('a12');
      expect(text()).not.toContain('다른 기기에서 배치가 변경');
    }
  });

  it('종료된 경기에는 이벤트 입력 경로가 없다(레코더 미렌더 + 가드)', async () => {
    const onAddEvent = vi.fn();
    await mount({ ...withAttendees, soccerMatches: [{ ...playingIntra, status: 'finished' }], currentMatchIdx: 0, onAddEvent });
    expect(byPartialText('button', '상대골')).toBeFalsy();      // 레코더 없음
    expect(onAddEvent).not.toHaveBeenCalled();
  });
```

- [ ] **Step 2: 실패 확인** — `npx vitest run src/components/intra` → 첫 두 케이스 FAIL(배치가 그대로/안내 문구 없음), 세 번째는 PASS(증분 2 에서 이미 읽기 전용).

- [ ] **Step 3: 구현 — import·파생·state**

`import { useState, useEffect, useRef } from 'react';` (useRef 추가), `import { formationFingerprint, decideRemount } from '../../utils/intraSoccer/liveSync';` 추가.
`const currentMatch = …`(`:90`) **바로 아래**에:
```js
  // ── [증분 3] 실시간 전파: 원격 배치 변경이 오면 레코더를 새 props 로 재마운트한다 ──
  // FormationRecorder 는 uncontrolled(배치를 마운트 시 1회 시드)라 prop 변경만으로는 화면이 갱신되지 않고,
  // 갱신 없이 내가 다음 교체를 하면 stale 배치를 기준으로 저장해 남의 변경을 되돌린다(스펙 §14.2).
  // 아래 값들은 IIFE 밖(최상위)에서 계산해야 훅 의존성으로 쓸 수 있다.
  const liveSide = currentMatch && isIntra(currentMatch) ? tab : 'A';
  const liveFp = currentMatch ? formationFingerprint(sideView(currentMatch, liveSide)) : '';
  const [recorderRev, setRecorderRev] = useState(0);
  const [pendingRemote, setPendingRemote] = useState(false);
  const [busy, setBusy] = useState(false);          // 레코더가 onBusyChange 로 알려주는 '입력 중'
  const seedFpRef = useRef('');                     // 지금 마운트된 레코더가 시드로 받은 지문
  const localFpsRef = useRef(new Set());            // 내가 보냈지만 아직 echo 가 안 온 지문들

  // (A) 경기·편이 바뀌면 새 시드 — liveFp 를 의존성에 넣지 않는다(넣으면 시드가 따라가 재마운트가 영영 안 된다).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    seedFpRef.current = liveFp;
    localFpsRef.current = new Set();
    setPendingRemote(false);
  }, [currentMatch?.matchIdx, liveSide]);

  // (B) 판정 — 같은 렌더에서 effect 는 선언 순서대로 실행되므로 (A) 초기화가 먼저다.
  useEffect(() => {
    if (!currentMatch) return;                      // 종료 전파로 currentMatchIdx=-1 → 무의미한 rev 증가 방지
    const r = decideRemount({ currentFp: liveFp, seedFp: seedFpRef.current, localFps: localFpsRef.current, busy });
    if (r.consume) localFpsRef.current.delete(r.consume);
    if (r.remount) { seedFpRef.current = liveFp; setRecorderRev(n => n + 1); }
    setPendingRemote(r.pending);
  }, [liveFp, busy, currentMatch]);
```

- [ ] **Step 4: 구현 — 로컬 변경 기록·가드·렌더**

`handleFormationStateChange`(`:198`) 맨 앞에 내 변경 지문 기록:
```js
  const handleFormationStateChange = (updates, side) => {
    // 내가 보낸 변경의 왕복 echo 를 원격 변경으로 오인해 재마운트하지 않도록 예상 지문을 남긴다.
    if (currentMatch) {
      const fps = localFpsRef.current;
      fps.add(formationFingerprint({ ...sideView(currentMatch, side), ...updates }));
      while (fps.size > 8) fps.delete(fps.values().next().value);   // 삽입 순서대로 오래된 것 제거
    }
    …기존 분기 그대로…
  };
```
`handleAddEvent`(`:207`)·`handleDeleteEvent`(`:219`) 첫 줄에 종료 가드:
```js
    if (!currentMatch || currentMatch.status !== 'playing') {
      alert('다른 기기에서 이미 종료된 경기입니다. 잠시 후 화면이 갱신됩니다.');
      return;
    }
```
`handleIntraConfirm`·`handleFormationConfirm` 의 경기 생성 직전(자체전은 `onPatchSide` 가드 뒤)에 동시 생성 가드:
```js
    if (soccerMatches.some(m => m.status === 'playing')) {
      alert('다른 기기에서 이미 경기를 시작했습니다.');
      setPendingA(null); setMatchType(null); setViewState('selectOpponent');
      return;
    }
```
레코더 렌더(`:455`): IIFE 안의 `const side = …`/`const v = …` 를 최상위 값으로 교체(`const side = liveSide; const v = sideView(currentMatch, side);` — 지문과 같은 편을 보장), `key={`${currentMatch.matchIdx}:${side}:${recorderRev}`}`, `onBusyChange={setBusy}` 추가(`onFlowActiveChange={setNavLocked}` 유지). 레코더 위에 보류 안내:
```jsx
            {pendingRemote && (
              <div style={{ textAlign: "center", fontSize: 11, color: C.orange, marginBottom: 6 }}>
                다른 기기에서 배치가 변경됐습니다 · 입력을 마치면 화면에 반영됩니다
              </div>
            )}
```

- [ ] **Step 5: 통과 확인** — `npx vitest run` 전체 PASS, `npm run build` 성공, `npx eslint src/components/intra src/utils/intraSoccer src/components/game/FormationRecorder.jsx` 0 errors. 파일 정독: 훅이 전부 early return 앞(첫 early return 은 `viewState === "formation"` 블록), (A)가 (B)보다 먼저 선언, `liveSide`/`liveFp` 를 IIFE 안에서 재계산하지 않음.
- [ ] **Step 6: Commit** — `git add src/components/intra && git commit -m "feat: 자체전 실시간 전파 — 원격 배치 변경 시 레코더 재마운트(입력 중 보류) + 종료·동시생성 가드"`

---

### Task 4: 격리 검증 + 스펙 상태

- [ ] **Step 1: 화이트리스트** — 브랜치 베이스(`git merge-base main HEAD`)를 BASE 로:
```bash
git diff --name-only BASE -- src | grep -v -E '^src/(utils/intraSoccer/|components/intra/|components/game/(FormationRecorder\.jsx|__tests__/))'
```
Expected: **빈 출력**. 추가로 `git diff BASE --stat -- src/SoccerApp.jsx src/App.jsx src/hooks src/services src/utils/soccerScoring.js src/utils/analyticsV2 src/components/dashboard src/Root.jsx src/config apps-script src/components/game/SoccerMatchView.jsx` 가 비어야 한다.
- [ ] **Step 2: 하버FC 호출부 확인** — `git diff BASE -- src/components/game/FormationRecorder.jsx` 가 삭제 0(props 한 줄 + effect 추가)이고, `grep -n "onBusyChange" src/components/game/SoccerMatchView.jsx` 가 **아무것도 찾지 못함**을 확인(하버FC 미연결 = no-op).
- [ ] **Step 3: 전체** — `npx vitest run && npm run build` PASS.
- [ ] **Step 4: 스펙 상태** — 3행을 `날짜 2026-09-10. 상태: **§1–14 구현 완료(로컬 main), 배포 대기.**` 로 갱신, 커밋 `docs: 스펙 상태 — §14(증분 3) 구현 완료`.

이후 최종 전체 리뷰(격리·동시성 중심) → `finishing-a-development-branch`.
