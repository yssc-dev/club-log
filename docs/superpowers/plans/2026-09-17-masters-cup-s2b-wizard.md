# 마스터스컵 2.5단계 — 컵 경기일을 정규 설정 마법사로 (구현 계획)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 🏆 컵 경기 시작이 경기 화면으로 직행하지 않고 정규 설정 마법사(참석자 → 팀편성 → 경기)를 타게 해서, 경기일마다 참석/불참 체크·당일 용병 추가·구장 수·회전 수를 고를 수 있게 한다. 경기일 대진 = 참석 팀 풀리그 × 회전.

**Architecture:** App 의 컵 로드 분기가 `phase:'match'` 대신 `phase:'setup'` 을 넣고(대진 생성 제거), `startMatches` 의 컵 분기가 참석 팀을 재구성해 `buildCupDaySchedule` 로 대진을 만든 뒤 기존 `START_MATCHES` 를 부른다. 마법사 화면의 컵 전용 차이는 전부 `isCup`(= `isCupSession(state)`) 게이트로 덧붙이며 정규 경로의 조건식은 한 글자도 바꾸지 않는다. 참석자 단계의 컵 UI 는 새 컴포넌트 `CupAttendeePicker` 가 맡는다.

**Tech Stack:** React 18 + Vite, vitest(jsdom, createRoot+act 실렌더 하네스), 정적 가드 테스트(`fs.readFileSync` + 정규식).

**Spec:** `docs/superpowers/specs/2026-09-16-masters-cup-design.md` v2.1 — §1.1·§1.2·§3·§6.2·§6.3·§7.4·§8·§11(2.5단계)·§14. 근거 조사 보고: 세션 스크래치패드 `cup-setup-probe.md`(잠금 지점 13곳·공백 5개).

## Global Constraints

- 컵 판별은 `isCupSession(state)` 만. `draftMode` 로 컵을 판별하지 않는다(원격 복원 기기에서 `'snake'`/`'free'` 로 드리프트). `draftMode === 'cup'` 같은 새 값을 만들지 않는다(`goToTeamBuild` 의 else 분기가 팀을 비운다).
- `src/App.jsx` 의 정규 경로 조건식·핸들러는 텍스트를 바꾸지 않는다. 컵 차이는 `!isCup && (…)`, `isCup ? A : (기존)`, `(isCup || (기존))` 형태로만 덧붙인다. 정규 마감 `try` 블록(약 845~913행)은 바이트 동일. `sheetSync` 자동설정 경로(`_loadAllData` 의 `sheetSync` 분기)는 손대지 않는다.
- `isCup` 은 `App.jsx` 에서 `useTheme()` 아래에 선언돼 있다(약 918행). 그보다 위에 정의되는 함수(`startMatches` 등) 안에서는 `isCupSession(state)` 를 직접 호출한다(TDZ·lint 회피).
- 하버FC·빅마스터FC(축구)·몽피스(테니스)는 동작 변화 0. `apps-script/`, `src/utils/analyticsV2/`, `soccerAnalytics/`, `intraSoccer/`, `src/components/tournament/`, `src/services/cupSync.js`, `src/utils/cup/cupEntity.js` 수정 금지.
- RTDB 는 빈 배열을 저장하지 않는다 — `teams[i]`·`attendees` 는 `|| []` 로 방어.
- 사용자 노출 문구의 시트명은 실제 이름(로그_이벤트/로그_매치/로그_선수경기)만.
- 커밋 접두 한국어 `feat(cup):`/`fix(cup):`/`test(cup):`/`docs:`, 트레일러 2줄 필수:
  ```
  Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01AqpBTxNBiezjumZN5AzJ6D
  ```
- lint 기존 에러 2건(`src/services/appSync.js:13`, `src/services/tennisSync.js:16`)은 범위 밖. 테스트 기준선 223파일 / 1998개(main b97527b).
- 워크트리 안에서만 작업. `git` 명령은 단일 명령으로(`&&` 체인 금지 — 가드가 거부).

---

### Task 1: `buildCupDaySchedule` + N=2 지원

**Files:**
- Modify: `src/utils/cup/cupSchedule.js`
- Test: `src/utils/__tests__/cupSchedule.test.js`

**Interfaces:**
- Produces: `buildCupDaySchedule(M, courtCount, rotations = 1) → [{ matches:[[h,a],…] }]`, `generateCupRounds(2, 1) → [{ matches:[[0,1]] }]`, `courtCountFor(2) → 1`.
- Consumes: 기존 `generateCupRounds`, `courtCountFor`.

- [ ] **Step 1: 실패 테스트 추가**

`src/utils/__tests__/cupSchedule.test.js` 끝에:

```js
describe('buildCupDaySchedule (스펙 §6.3 v2.1)', () => {
  it('rotations=1 은 generateCupRounds 와 같은 라운드(새 객체)', () => {
    const base = generateCupRounds(4, 2);
    const day = buildCupDaySchedule(4, 2, 1);
    expect(day).toEqual(base);
    expect(day).not.toBe(base);
    expect(day[0]).not.toBe(base[0]);
    expect(day[0].matches[0]).not.toBe(base[0].matches[0]);
  });
  it('rotations=3 은 canonical 을 3번 이어붙인다(순서·홈/원정 그대로)', () => {
    const base = generateCupRounds(3, 1);
    const day = buildCupDaySchedule(3, 1, 3);
    expect(day).toHaveLength(base.length * 3);
    expect(day.slice(0, 3)).toEqual(base);
    expect(day.slice(3, 6)).toEqual(base);
    expect(day.slice(6, 9)).toEqual(base);
  });
  it('rotations 는 1~3 으로 클램프, 비숫자는 1', () => {
    expect(buildCupDaySchedule(3, 1, 0)).toHaveLength(3);
    expect(buildCupDaySchedule(3, 1, 9)).toHaveLength(9);
    expect(buildCupDaySchedule(3, 1, 'x')).toHaveLength(3);
    expect(buildCupDaySchedule(3, 1, undefined)).toHaveLength(3);
  });
  it('M=2 는 1구장 1경기 라운드 하나', () => {
    expect(courtCountFor(2)).toBe(1);
    expect(generateCupRounds(2, 1)).toEqual([{ matches: [[0, 1]] }]);
    expect(buildCupDaySchedule(2, 1, 2)).toEqual([{ matches: [[0, 1]] }, { matches: [[0, 1]] }]);
  });
  it('M=5·2구장·2회전 = 10라운드, 각 쌍 정확히 2회', () => {
    const day = buildCupDaySchedule(5, 2, 2);
    expect(day).toHaveLength(10);
    const count = {};
    for (const r of day) for (const [h, a] of r.matches) { const k = [h, a].sort().join('-'); count[k] = (count[k] || 0) + 1; }
    expect(Object.keys(count)).toHaveLength(10);
    expect(Object.values(count).every(v => v === 2)).toBe(true);
  });
});
```

`import` 줄에 `buildCupDaySchedule` 을 추가한다(파일 상단 기존 import 를 확장).

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/utils/__tests__/cupSchedule.test.js`
Expected: FAIL — `buildCupDaySchedule is not a function`, N=2 가 throw.

- [ ] **Step 3: 구현**

`src/utils/cup/cupSchedule.js` 를 읽고: `courtCountFor(N)` 이 `N <= 3 ? 1 : 2` 형태인지 확인(2 도 1 이 되도록). `generateCupRounds` 의 N 범위 검사가 `MIN_TEAMS`(3) 를 쓰면 **이 함수에서만** 하한을 2 로 낮춘다(`cupEntity.MIN_TEAMS` 는 엔티티 규칙이라 그대로). N=2 는 generic 경로로 `[{ matches:[[0,1]] }]` 가 나오는지 확인하고, 아니면 명시 분기 추가. 그리고:

```js
// 경기일 대진(스펙 §6.3 v2.1): 참석 팀 M 의 canonical 을 회전 수만큼 이어붙인다. 각 회전은 순서·홈/원정 그대로.
// 반환은 매 호출 새 객체(표 오염 금지). rotations 는 1~3 으로 클램프.
export function buildCupDaySchedule(M, courtCount, rotations = 1) {
  const n = Number(rotations);
  const rot = Number.isFinite(n) && n >= 1 ? Math.min(3, Math.floor(n)) : 1;
  const base = generateCupRounds(M, courtCount);
  const out = [];
  for (let r = 0; r < rot; r++) {
    for (const round of base) out.push({ matches: round.matches.map(m => [...m]) });
  }
  return out;
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run src/utils/__tests__/cupSchedule.test.js`
Expected: PASS(기존 12 + 새 5).

- [ ] **Step 5: 커밋**

```bash
git add src/utils/cup/cupSchedule.js src/utils/__tests__/cupSchedule.test.js
git commit -m "feat(cup): 경기일 대진 buildCupDaySchedule(참석 팀 풀리그 × 회전) + 2팀 지원 (스펙 §6.3 v2.1)"
```
(트레일러 2줄 포함)

---

### Task 2: `CupAttendeePicker` 컴포넌트

**Files:**
- Create: `src/components/cup/CupAttendeePicker.jsx`
- Test: `src/components/cup/__tests__/CupAttendeePicker.render.test.jsx`

**Interfaces:**
- Produces: `CupAttendeePicker({ teams, teamNames, attendees, onToggle(name), onAddToTeam(teamIdx, name) })`. data-role: `cup-attendee-picker`, `cup-team`(+`data-team`), `cup-attendee`(+`data-name`, `aria-pressed`), `cup-guest-input`(+`data-team`), `cup-guest-add`(+`data-team`).
- Consumes: `useTheme`.

- [ ] **Step 1: 실패 렌더 테스트**

```jsx
// src/components/cup/__tests__/CupAttendeePicker.render.test.jsx
// 스펙 §6.2 v2.1 5항 — 컵 참석자 단계: 팀별 칩(기본 전원 참석)·토글·당일 추가.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { ThemeProvider } from '../../../hooks/useTheme';
import CupAttendeePicker from '../CupAttendeePicker';

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (q) => ({ matches: false, media: q, onchange: null, addListener(){}, removeListener(){}, addEventListener(){}, removeEventListener(){}, dispatchEvent(){} }),
});
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let container, root;
beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); });
afterEach(() => { act(() => root?.unmount()); container.remove(); });

async function mount(props) {
  await act(async () => {
    root = createRoot(container);
    root.render(createElement(ThemeProvider, null, createElement(CupAttendeePicker, props)));
  });
}
const click = async (el) => { await act(async () => { el.click(); }); };
const type = async (input, value) => {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true }));
  });
};
const q = (sel) => [...container.querySelectorAll(sel)];

const TEAMS = [['a1', 'a2'], ['b1'], ['c1', 'c2', 'c3']];
const NAMES = ['팀A', '팀B', '팀C'];

describe('CupAttendeePicker 실렌더', () => {
  it('팀별 헤더·칩을 그리고 참석 인원을 센다', async () => {
    await mount({ teams: TEAMS, teamNames: NAMES, attendees: ['a1', 'a2', 'b1', 'c1', 'c2', 'c3'], onToggle: vi.fn(), onAddToTeam: vi.fn() });
    expect(q('[data-role="cup-team"]')).toHaveLength(3);
    expect(container.textContent).toContain('팀A');
    expect(container.textContent).toContain('2/2명 참석');
    expect(q('button[data-role="cup-attendee"]')).toHaveLength(6);
    expect(q('button[data-role="cup-attendee"]').every(b => b.getAttribute('aria-pressed') === 'true')).toBe(true);
  });

  it('칩 클릭은 onToggle(name); 불참자는 aria-pressed=false, 전원 불참 팀은 "오늘 불참"', async () => {
    const onToggle = vi.fn();
    await mount({ teams: TEAMS, teamNames: NAMES, attendees: ['a1', 'a2', 'c1'], onToggle, onAddToTeam: vi.fn() });
    const b1 = q('button[data-role="cup-attendee"]').find(b => b.dataset.name === 'b1');
    expect(b1.getAttribute('aria-pressed')).toBe('false');
    await click(b1);
    expect(onToggle).toHaveBeenCalledWith('b1');
    const teamB = q('[data-role="cup-team"]').find(d => d.dataset.team === '1');
    expect(teamB.textContent).toContain('오늘 불참');
    expect(teamB.textContent).toContain('0/1명 참석');
  });

  it('당일 추가: 입력 후 버튼 → onAddToTeam(teamIdx, name), 입력은 비워진다; 빈 값은 무시', async () => {
    const onAddToTeam = vi.fn();
    await mount({ teams: TEAMS, teamNames: NAMES, attendees: ['a1'], onToggle: vi.fn(), onAddToTeam });
    const input = q('input[data-role="cup-guest-input"]').find(i => i.dataset.team === '2');
    const btn = q('button[data-role="cup-guest-add"]').find(b => b.dataset.team === '2');
    await click(btn);
    expect(onAddToTeam).not.toHaveBeenCalled();
    await type(input, '  게스트 ');
    await click(btn);
    expect(onAddToTeam).toHaveBeenCalledWith(2, '게스트');
    expect(input.value).toBe('');
  });

  it('당일 추가: Enter 키로도 추가된다', async () => {
    const onAddToTeam = vi.fn();
    await mount({ teams: TEAMS, teamNames: NAMES, attendees: [], onToggle: vi.fn(), onAddToTeam });
    const input = q('input[data-role="cup-guest-input"]').find(i => i.dataset.team === '0');
    await type(input, 'g1');
    await act(async () => { input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });
    expect(onAddToTeam).toHaveBeenCalledWith(0, 'g1');
  });

  it('teams[i] 가 undefined(RTDB 빈배열 누락)여도 크래시 없이 0명으로 그린다', async () => {
    await mount({ teams: [undefined, ['b1']], teamNames: ['팀A', '팀B'], attendees: ['b1'], onToggle: vi.fn(), onAddToTeam: vi.fn() });
    expect(q('[data-role="cup-team"]')).toHaveLength(2);
    expect(container.textContent).toContain('0/0명 참석');
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/components/cup/__tests__/CupAttendeePicker.render.test.jsx`
Expected: FAIL — 모듈 없음.

- [ ] **Step 3: 구현**

```jsx
// src/components/cup/CupAttendeePicker.jsx
// 컵 경기일 참석자 단계(스펙 §6.2 v2.1 5항): 대회 팀별 칩(기본 전원 참석)·토글·당일 추가.
// 상태는 부모(App)의 attendees/teams 가 진실 소스 — 여기서는 입력 초안만 들고 있다.
import { useState } from 'react';
import { useTheme } from '../../hooks/useTheme';

export default function CupAttendeePicker({ teams = [], teamNames = [], attendees = [], onToggle, onAddToTeam }) {
  const { C } = useTheme();
  const [drafts, setDrafts] = useState({}); // teamIdx → 입력 값

  const submit = (i) => {
    const name = (drafts[i] || '').trim();
    if (!name) return;
    onAddToTeam?.(i, name);
    setDrafts(d => ({ ...d, [i]: '' }));
  };

  const chip = (active) => ({
    display: "inline-flex", alignItems: "center", gap: 4, padding: "6px 10px", borderRadius: 999,
    background: active ? "var(--app-blue)" : "var(--app-bg-row-hover)", color: active ? "#fff" : "var(--app-text-primary)",
    border: "none", fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit",
  });

  return (
    <div data-role="cup-attendee-picker">
      {teams.map((raw, i) => {
        const players = raw || [];
        const present = players.filter(p => attendees.includes(p)).length;
        return (
          <div key={i} data-role="cup-team" data-team={i} className="app-row" style={{ flexDirection: "column", alignItems: "stretch", gap: 8, padding: "10px 12px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 14, fontWeight: 600 }}>{teamNames[i] || `팀 ${i + 1}`}</span>
              <span style={{ fontSize: 12, color: present === 0 ? "var(--app-orange)" : "var(--app-text-tertiary)" }}>
                {present}/{players.length}명 참석{present === 0 ? ' · 오늘 불참' : ''}
              </span>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {players.map(p => {
                const active = attendees.includes(p);
                return (
                  <button key={p} type="button" data-role="cup-attendee" data-name={p} aria-pressed={active}
                    onClick={() => onToggle?.(p)} style={chip(active)}>{p}</button>
                );
              })}
              {players.length === 0 && <span style={{ fontSize: 12, color: C.gray }}>팀원 없음</span>}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <input className="app-input" data-role="cup-guest-input" data-team={i} style={{ flex: 1 }} placeholder="당일 추가 (이름)"
                value={drafts[i] || ''} onChange={e => setDrafts(d => ({ ...d, [i]: e.target.value }))}
                onKeyDown={e => { if (e.key === 'Enter') submit(i); }} />
              <button type="button" data-role="cup-guest-add" data-team={i} onClick={() => submit(i)} style={{
                padding: "0 14px", borderRadius: 10, background: "var(--app-blue)", color: "#fff", border: "none",
                fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
              }}>추가</button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run src/components/cup/__tests__/CupAttendeePicker.render.test.jsx`
Expected: PASS (5).

- [ ] **Step 5: 커밋**

```bash
git add src/components/cup/CupAttendeePicker.jsx src/components/cup/__tests__/CupAttendeePicker.render.test.jsx
git commit -m "feat(cup): 컵 경기일 참석자 단계 컴포넌트 CupAttendeePicker — 팀별 칩·토글·당일 추가 (스펙 §6.2 v2.1)"
```

---

### Task 3: `App.jsx` — 컵 세션의 마법사 경유 (원자 커밋)

**Files:**
- Modify: `src/App.jsx` (컵 로드 분기 / `startMatches` / setup 화면 / teamBuild 화면)

**Interfaces:**
- Consumes: `buildCupDaySchedule`(Task 1), `CupAttendeePicker`(Task 2), 기존 `isCupSession`, `courtCountFor`, `TOGGLE_ATTENDEE`, `SET_FIELDS`, `START_MATCHES`.
- Produces: 컵 세션이 `setup` → `teamBuild` → `match` 로 흐른다. 정적 가드(Task 4)가 잡을 문자열: 컵 분기 안 `phase: "setup"`, `buildCupDaySchedule(`, `!isCup && (` 앞의 시트 연동 버튼, `isCup ? (` 앞의 팀 편성 방식 세그먼트, `segBtn(teamCount === n, isCup)`, `draftMode === "snake" && !isCup`, 팀명 `isCup ? (\n <span`.

이 태스크는 렌더 테스트가 없다(App 하네스 없음). 정적 가드는 Task 4. 구현자는 **선언 순서**(`isCup` 은 `useTheme()` 아래) 와 JSX 괄호를 육안으로 두 번 확인하고 `npm run build` 로 문법을 확인한다.

- [ ] **Step 1: 컵 로드 분기 → setup**

`_loadAllData` 의 `if (gameMode === "cup") { … }` 블록(약 233~270행)에서:
- `const cc = courtCountFor(N); let sched; try { sched = generateCupRounds(N, cc); } catch (e) { fail(e.message); return; }` 중 **`sched` 관련 세 줄을 삭제**한다(`cc` 는 유지).
- `SET_FIELDS` 의 `fields` 에서 `schedule: sched`, `currentRoundIdx: 0`, `completedMatches: []`, `allEvents: []`, `isExtraRound: false`, `viewingRoundIdx: 0`, `confirmedRounds: {}`, `matchModal: null` 을 삭제하고(START_MATCHES 가 초기화한다), `rotations: 1` 을 추가하고, `phase: "match"` 를 `phase: "setup"` 으로 바꾼다.
- `generateCupRounds` import 가 다른 곳에서 안 쓰이면 import 에서 제거하고 `buildCupDaySchedule` 을 import 한다(`import { courtCountFor, buildCupDaySchedule } from './utils/cup/cupSchedule';` 형태 — 기존 import 경로를 따른다). `CupAttendeePicker` import 를 추가한다.

결과 블록:

```js
      if (gameMode === "cup") {
        const fail = (reason) => setCupLoadError(reason);
        if (!cupRes || !cupRes.ok) { fail(cupRes?.reason || '대회 로드 실패'); return; }
        const cup = cupRes.cup;
        if (cup.meta.status !== 'active') { fail('종료된 대회입니다. 대회 탭에서 "다시 열기" 후 시작하세요.'); return; }
        const v = validateTeams(cup.teams);
        if (!v.ok) { fail(`팀 구성이 완전하지 않습니다 — 대회 탭의 팀 관리에서 확인하세요.\n${v.errors.join('\n')}`); return; }
        const cupTeams = v.teams;
        const N = cupTeams.length;
        const cc = courtCountFor(N);
        // v2.1: 경기 화면 직행이 아니라 정규 설정 마법사(참석자→팀편성→경기)로 들어간다. 대진은 경기 시작 시 startMatches 의 컵 분기가 만든다.
        dispatch({
          type: 'SET_FIELDS',
          fields: {
            tournamentId: cup.meta.id,
            attendees: [...new Set(cupTeams.flatMap(t => t.players))],
            teamCount: N,
            courtCount: cc,
            matchMode: "schedule",
            draftMode: "sheet",
            rotations: 1,
            teams: cupTeams.map(t => [...t.players]),
            teamNames: cupTeams.map(t => t.name),
            teamColorIndices: cupTeams.map((_, i) => i % TEAM_COLORS.length),
            gks: {},
            settingsSnapshot: getCupSettings(teamContext.team),
            phase: "setup",
          },
        });
      }
```

- [ ] **Step 2: `startMatches` 컵 분기**

`const startMatches = () => {` 바로 아래 첫 줄에(기존 `if (teams.some(t => t.length < 1))` 보다 앞) 추가:

```js
    if (isCupSession(state)) {
      // 컵 경기일(스펙 §6.2 v2.1 7항): 참석자로 팀을 거르고, 참석자 0명 팀은 오늘 제외. 참석 팀 풀리그 × 회전.
      const present = teams.map(t => (t || []).filter(p => attendees.includes(p)));
      const keep = present.map((_, i) => i).filter(i => present[i].length > 0);
      if (keep.length < 2) { alert("참석자가 있는 팀이 2개 이상이어야 합니다"); return; }
      const M = keep.length;
      const cc = M <= 3 ? 1 : courtCount;
      dispatch({ type: 'SET_FIELDS', fields: {
        teams: keep.map(i => present[i]),
        teamNames: keep.map(i => teamNames[i]),
        teamColorIndices: keep.map(i => teamColorIndices[i] ?? (i % TEAM_COLORS.length)),
        teamCount: M,
        courtCount: cc,
        gks: {},
      } });
      dispatch({ type: 'START_MATCHES', schedule: buildCupDaySchedule(M, cc, rotations), pushState: null, splitPhase: null });
      return;
    }
```

`state` 가 이 스코프에서 접근 가능한 이름인지(리듀서 훅이 `state` 를 반환하는지) 확인하고, 아니면 App 이 쓰는 이름을 따른다. `rotations` 가 구조분해된 필드인지 확인(회전 수 세그먼트가 `set('rotations', n)` 을 쓰므로 있음).

- [ ] **Step 3: setup 화면 컵 게이트**

setup 렌더 안(약 1005행 이후, `isCup` 사용 가능):

(a) 컵 참석 팀 수와 안내 문구를 `scheduleHint` 정의 근처에 추가(`scheduleHint` 정의 **바로 아래**):

```js
    const cupPresentTeams = isCup ? teams.filter(t => (t || []).some(p => attendees.includes(p))).length : 0;
    const cupHint = isCup
      ? (cupPresentTeams >= 2
          ? `풀리그 × ${rotations}회전 · 참석 ${cupPresentTeams}팀 · ${buildCupDaySchedule(cupPresentTeams, cupPresentTeams <= 3 ? 1 : courtCount, rotations).length}라운드`
          : '참석자가 있는 팀이 2개 이상이어야 합니다')
      : "";
```

(b) 팀 수: `style={segBtn(teamCount === n)}` → `style={segBtn(teamCount === n, isCup)}` 그리고 `onClick={() => dispatch(…)}` → `onClick={() => { if (isCup) return; dispatch({ type: 'SET_FIELDS', fields: { teamCount: n, ...(n === 3 ? { courtCount: 1 } : {}) } }); }}` 에 `disabled={isCup}` 추가. (정규 동작 동일: `isCup` 이 false 면 같은 dispatch.)

(c) 경기 모드 세그먼트: 기존 세 버튼을 감싼 `<div style={segBar}>…</div>` 를 다음으로 바꾼다 — 기존 세 버튼의 텍스트는 그대로 유지:

```jsx
              {isCup ? (
                <div style={segBar}><button disabled style={segBtn(true)}>대진표 (풀리그)</button></div>
              ) : (
                <div style={segBar}>
                  {/* 기존 세 버튼 그대로 */}
                </div>
              )}
```

(d) 팀 편성 방식 세그먼트: 같은 방식으로 `isCup ? (<div style={segBar}><button disabled style={segBtn(true)}>대회 팀</button></div>) : (기존)`.

(e) 회전 수 행: 조건 `{courtCount === 1 && matchMode === "schedule" && (` → `{(isCup || (courtCount === 1 && matchMode === "schedule")) && (` 로, 옵션 배열 `[1, 2, 3, 4, 5]` → `(isCup ? [1, 2, 3] : [1, 2, 3, 4, 5])`.

(f) 안내 문구: `{scheduleHint && (…{scheduleHint}…)}` → `{(isCup ? cupHint : scheduleHint) && (… {isCup ? cupHint : scheduleHint} …)}`.

(g) 참석자 섹션: `<div className="app-grouped">` 부터 그 닫는 태그까지(버튼 행·칩 행·새 선수 행 전체)를 `isCup ? (<div className="app-grouped"><CupAttendeePicker teams={teams} teamNames={teamNames} attendees={attendees} onToggle={(name) => dispatch({ type: 'TOGGLE_ATTENDEE', name })} onAddToTeam={addCupGuest} /></div>) : (기존 그대로)` 로 감싼다. 헤더의 `{attendees.length}명 선택됨` 은 유지.

`addCupGuest` 는 `syncAttendance` 근처(컴포넌트 함수 본문, `isCup` 선언보다 위여도 됨 — `isCup` 을 쓰지 않으므로)에 정의:

```js
  // 컵 경기일 당일 추가(스펙 §6.2 v2.1 5항): attendees 와 그 팀에 함께 넣는다. 이미 어느 팀에든 있으면 무시. 세션 한정.
  const addCupGuest = (teamIdx, name) => {
    const n = (name || '').trim();
    if (!n || teams.some(t => (t || []).includes(n)) || attendees.includes(n)) return;
    dispatch({ type: 'SET_FIELDS', fields: {
      attendees: [...attendees, n],
      teams: teams.map((t, j) => (j === teamIdx ? [...(t || []), n] : t)),
    } });
  };
```

(h) 하단 CTA: `const sheetReady = …` 블록 안에서 `ctaDisabled`·`ctaLabel` 계산 뒤에 컵 덮어쓰기를 추가한다(기존 식은 그대로 두고 그 아래에):

```js
            const cupDisabled = isCup && cupPresentTeams < 2;
            const finalDisabled = isCup ? cupDisabled : ctaDisabled;
            const finalLabel = isCup ? `대회 팀 확인 (${cupPresentTeams}팀)` : ctaLabel;
```
그리고 `<button onClick={goToTeamBuild} disabled={ctaDisabled} … opacity: ctaDisabled ? 0.5 : 1 …>{ctaLabel}</button>` 의 세 곳을 `finalDisabled`/`finalLabel` 로 바꾼다. (`goToTeamBuild` 의 `sheet` 분기는 컵 팀이 비어 있지 않으므로 그대로 통과한다.)

- [ ] **Step 4: teamBuild 화면 컵 게이트**

(a) 부제: `` `${draftMode === "snake" ? "스네이크 드래프트" : draftMode === "sheet" ? "시트 편성" : "자유 편성"} · ${teamCount}팀 · ${attendees.length}명` `` → `` `${isCup ? "대회 팀" : (draftMode === "snake" ? "스네이크 드래프트" : draftMode === "sheet" ? "시트 편성" : "자유 편성")} · ${teamCount}팀 · ${attendees.length}명` ``.

(b) 재배치: `{!teamEditMode && draftMode === "snake" && <button onClick={reshuffleTeams}` → `{!teamEditMode && draftMode === "snake" && !isCup && <button onClick={reshuffleTeams}`.

(c) 초기화(자유편성): `{!teamEditMode && draftMode === "free" && <button onClick={() => dispatch(…초기화…)}` → 조건에 `&& !isCup` 추가.

(d) 팀명: 
```jsx
                    {editingTeamName === tIdx ? ( <input …/> ) : ( <span … onClick={…}>{teamNames[tIdx]}</span> )}
```
을
```jsx
                    {isCup ? (
                      <span style={{ fontWeight: 700, fontSize: 14 }}>{teamNames[tIdx]}</span>
                    ) : editingTeamName === tIdx ? ( <input …기존…/> ) : ( <span …기존…>{teamNames[tIdx]}</span> )}
```
로(기존 두 분기의 텍스트는 그대로).

(e) 불참 표시·흐리기: 팀 카드 헤더의 `<span style={{ fontSize: 11, color: C.gray }}>전력 {teamPower(team, seasonPlayers)}</span>` 바로 뒤에 `{isCup && !(team || []).some(p => attendees.includes(p)) && <span style={{ fontSize: 11, color: C.orange, fontWeight: 700 }}>오늘 불참</span>}` 추가. 선수 칩 `<div key={player} style={{ ...s.playerInTeam(color), color: C.white }}>` → `style={{ ...s.playerInTeam(color), color: C.white, opacity: isCup && !attendees.includes(player) ? 0.4 : 1 }}`.

(f) 회전 수 카드: `{courtCount === 1 && matchMode === "schedule" && (` → `{(isCup || (courtCount === 1 && matchMode === "schedule")) && (`; 옵션 `[1, 2, 3, 4, 5]` → `(isCup ? [1, 2, 3] : [1, 2, 3, 4, 5])`; 경기 수 표시 `{teamCount * (teamCount - 1) / 2 * rotations}경기` → `{(isCup ? cupPresentTeamsTB : teamCount) * ((isCup ? cupPresentTeamsTB : teamCount) - 1) / 2 * rotations}경기` 인데, teamBuild 렌더 스코프에는 `cupPresentTeams` 가 없으므로 teamBuild 렌더 함수 시작부(return 앞)에 `const cupPresentTeamsTB = isCup ? teams.filter(t => (t || []).some(p => attendees.includes(p))).length : teamCount;` 를 두고 그 값을 쓴다.

- [ ] **Step 5: 확인**

Run: `npm run build` (문법·import), `npx eslint src/App.jsx`(신규 에러 0; 기존 경고만), `npx vitest run`(기존 223파일 green — App 은 렌더 테스트가 없으므로 회귀는 정적 가드·스모크로). `git diff b97527b HEAD -- src/App.jsx` 로 정규 마감 try 블록에 헌크가 없음을 확인.

- [ ] **Step 6: 커밋**

```bash
git add src/App.jsx
git commit -m "feat(cup): 컵 경기일이 정규 설정 마법사(참석자→팀편성→경기)를 타게 — 참석 체크·당일 추가·구장/회전 선택, 참석 팀 풀리그×회전 대진 (스펙 §6.2 v2.1)"
```

---

### Task 4: 정적 가드 + 리듀서 보존 테스트

**Files:**
- Modify: `src/components/__tests__/cupWiring.guard.test.js`
- Create: `src/hooks/__tests__/gameReducer.cupStart.test.js`

- [ ] **Step 1: 정적 가드 케이스 추가**

`cupWiring.guard.test.js` 파일 끝에(기존 `read()` 헬퍼 재사용, 없으면 파일의 기존 방식대로 `fs.readFileSync` 로 App.jsx 를 읽는다):

```js
describe('App.jsx — 컵 경기일 마법사 경유 게이트 (스펙 §6.2 v2.1)', () => {
  const src = read('src/App.jsx');
  it('컵 로드 분기는 setup 으로 들어가고 로드 시점에 대진을 만들지 않는다', () => {
    const start = src.indexOf('gameMode === "cup"', src.indexOf('Promise.all'));
    const cupBranch = src.slice(start, src.indexOf('phase: "setup"', start) + 20);
    expect(cupBranch).toMatch(/phase: "setup"/);
    expect(cupBranch).not.toMatch(/generateCupRounds\(/);
    expect(cupBranch).not.toMatch(/schedule:/);
  });
  it('startMatches 의 컵 분기가 참석 팀 풀리그×회전 대진을 만든다', () => {
    expect(src).toMatch(/const startMatches = \(\) => \{\s*\n\s*if \(isCupSession\(state\)\)[\s\S]{0,900}buildCupDaySchedule\(/);
  });
  it('시트 연동 두 버튼·활동선수 전체는 컵에서 렌더되지 않는다', () => {
    expect(src).toMatch(/isCup \? \([\s\S]{0,400}CupAttendeePicker/);
    expect(src).toMatch(/isCup \? \([\s\S]{0,200}대회 팀<\/button>/);
  });
  it('팀 수 세그먼트는 컵에서 비활성', () => {
    expect(src).toMatch(/segBtn\(teamCount === n, isCup\)/);
  });
  it('팀명 편집·재배치는 컵에서 막힌다', () => {
    expect(src).toMatch(/draftMode === "snake" && !isCup[\s\S]{0,120}재배치/);
    expect(src).toMatch(/isCup \? \(\s*<span[^>]*>\{teamNames\[tIdx\]\}<\/span>/);
  });
  it('컵 판별에 draftMode 를 쓰지 않는다', () => {
    expect(src).not.toMatch(/draftMode === ['"]cup['"]/);
  });
});
```

정규식이 실제 코드와 어긋나면 **코드를 정규식에 맞추지 말고** 정규식을 실제 코드(Task 3 결과)에 맞춘다 — 단, 각 케이스가 해당 게이트를 지웠을 때 실패해야 한다는 목적은 유지한다(지워서 실패하는지 한 번 확인하고 되돌린다).

- [ ] **Step 2: 리듀서 보존 테스트**

```js
// src/hooks/__tests__/gameReducer.cupStart.test.js
// 스펙 §6.2 v2.1 — 마법사 통과 후 START_MATCHES 가 컵 식별 필드를 보존한다.
import { describe, it, expect } from 'vitest';
import { gameReducer, initialState } from '../useGameReducer';

describe('START_MATCHES 는 컵 세션 필드를 보존한다', () => {
  it('tournamentId/teams/teamNames/attendees/settingsSnapshot 유지, split/push 초기화', () => {
    const before = {
      ...initialState,
      phase: 'teamBuild', tournamentId: '컵2026', teams: [['a'], ['b']], teamNames: ['팀A', '팀B'],
      attendees: ['a', 'b'], settingsSnapshot: { cup: true }, splitPhase: 'first', pushState: { x: 1 },
    };
    const after = gameReducer(before, { type: 'START_MATCHES', schedule: [{ matches: [[0, 1]] }], pushState: null, splitPhase: null });
    expect(after.phase).toBe('match');
    expect(after.tournamentId).toBe('컵2026');
    expect(after.teams).toEqual([['a'], ['b']]);
    expect(after.teamNames).toEqual(['팀A', '팀B']);
    expect(after.attendees).toEqual(['a', 'b']);
    expect(after.settingsSnapshot).toEqual({ cup: true });
    expect(after.schedule).toEqual([{ matches: [[0, 1]] }]);
    expect(after.splitPhase).toBeNull();
    expect(after.pushState).toBeNull();
  });
});
```

`useGameReducer.js` 가 리듀서 함수와 `initialState` 를 어떤 이름으로 export 하는지 확인해 import 를 맞춘다(export 가 없으면 이 태스크에서 named export 를 추가한다 — 동작 변화 없음).

- [ ] **Step 3: 확인·커밋**

Run: `npx vitest run src/components/__tests__/cupWiring.guard.test.js src/hooks/__tests__/gameReducer.cupStart.test.js` → PASS. 전체 `npx vitest run` green.

```bash
git add src/components/__tests__/cupWiring.guard.test.js src/hooks/__tests__/gameReducer.cupStart.test.js src/hooks/useGameReducer.js
git commit -m "test(cup): 컵 마법사 경유 정적 가드 6건 + START_MATCHES 컵 필드 보존 테스트"
```
(`useGameReducer.js` 는 export 를 추가한 경우에만 add.)

---

### Task 5: 전체 검증·스펙 상태 갱신

**Files:**
- Modify: `docs/superpowers/specs/2026-09-16-masters-cup-design.md` (상태 줄)

- [ ] **Step 1:** `npx vitest run`(전체 green, 기준선 223파일/1998개 + 신규), `npm run lint`(기존 2건 외 0), `npm run build`.
- [ ] **Step 2:** `git diff --stat b97527b...HEAD` — `apps-script/`, `analyticsV2/`, `soccerAnalytics/`, `intraSoccer/`, `components/tournament/`, `cupSync.js`, `cupEntity.js` 무변경. `git diff b97527b HEAD -- src/App.jsx` 의 헌크가 컵 로드 분기·`addCupGuest`·`startMatches` 컵 분기·setup/teamBuild 게이트뿐이고 정규 마감 try 블록은 무변경.
- [ ] **Step 3:** 리포트에 스모크 체크리스트(스펙 §11 2.5단계) 그대로 기재.
- [ ] **Step 4:** 스펙 상태 줄 `**2.5단계(컵 경기일 설정 마법사 경유) 계획 대기.**` → `2.5단계(컵 경기일 설정 마법사 경유) 구현 완료 — 2026-09-17.`
- [ ] **Step 5:** 커밋 `docs: 마스터스컵 스펙 상태 — 2.5단계(컵 경기일 마법사 경유) 구현 완료`.

---

## 완료 기준

- 🏆 시작 → 참석자 단계(팀별 칩·당일 추가) → 대회 팀 확인 → 팀편성(팀명 고정) → 경기 시작 → 라운드 수 = 참석 팀 풀리그 × 회전. 결석자는 세션 명단·기록에 없다.
- 정규 자동설정/커스텀 플로우·축구·테니스 무변경(정적 가드 + 기존 테스트 + 스모크).
- 전체 테스트 green, lint 신규 0, 빌드 성공.
