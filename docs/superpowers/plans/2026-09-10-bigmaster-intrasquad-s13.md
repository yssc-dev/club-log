# 빅마스터FC 증분 2 (§13: 시트 기반 팀 명단·유동 인원·종료 확정) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 빅마스터FC 자체전에서 팀 소속을 시트(`빅마스터FC 참석명단`, 팀별 열)에서 읽어 A/B 배치 풀을 자동으로 만들고, 지각 참석자(수동 추가 = 유동 인원)를 양 편 후보로 허용하며, 종료된 경기를 읽기 전용으로 잠근다.

**Architecture:** 새 순수 모듈 두 개(`rosterSheet.js` 파서/읽기, `pools.js` 풀 계산·상태 병합)를 만들고, 빅마스터FC 복사본 두 파일(`IntraSoccerApp.jsx`, `IntraSoccerMatchView.jsx`)만 수정한다. 팀 명단·선택 쌍은 기존 whole-replace 동기 필드 `soccerFormation.intra`에 저장해 새 동기 필드 등록이 없다. `sideView.ARR`을 RTDB 객체화 배열까지 복구하도록 강화한다. **공유 파일 0 변경.**

**Tech Stack:** React 18 + Vite, vitest(jsdom, `globals:false`), Firebase RTDB. 1차 구현(§1–12)은 로컬 `main`(2216f24…688d79a)에 머지돼 있다.

**Spec:** `docs/superpowers/specs/2026-09-10-bigmaster-intrasquad-soccer-design.md` — **§13 전체**(13.1 요구, 13.2 파서, 13.3 상태, 13.4 풀, 13.5 흐름, 13.6 접촉 면) + §5(sideView)·§6.3(subPool).

## Global Constraints

- **공유 파일 0 변경.** 이 플랜이 건드리는 기존 파일은 `src/IntraSoccerApp.jsx`, `src/components/intra/IntraSoccerMatchView.jsx`, `src/utils/intraSoccer/sideView.js`(+ 그 테스트)뿐. `git diff --name-only 688d79a -- src`에 이 외의 **기존** 파일이 나오면 실패(신규 파일은 자유). 특히 `src/services/sheetService.js`·`src/services/firebaseSyncDiff.js`·`src/hooks/useGameReducer.js`·하버FC 컴포넌트는 무수정.
- vitest `globals:false` — `import { describe, it, expect, vi } from 'vitest'` 필수. 기존 테스트(1726개) 무수정 통과.
- 이름·시그니처는 이 문서 그대로: `parseIntraRosterCsv(text)`, `fetchIntraRoster()`, `resolvePair(teams, selectedPair)`, `rosterOf(teams, name)`, `floatingOf(attendees, teams)`, `setupPoolA({ teams, a, attendees })`, `setupPoolB({ teams, b, attendees, aAssigned })`, `sidePool(m, side, attendees, teams)`, `canIntra({ teams, attendees, pair }) → { ok, reason }`, `mergeFormationState(saved, current, updates)`.
- `soccerFormation.intra = { teams: [{ name, players }], syncedAt, selectedPair? }`. `saveFormationState`는 반드시 `mergeFormationState(savedFormation, …)`로 저장(intra 보존).
- 종료된 경기(`status === 'finished'`)는 빅마스터FC 화면에서 읽기 전용: 확정취소·출전 수정·상대팀 변경 버튼을 렌더하지 않는다.
- Intra 계열은 저장 점수 필드(`m.ourScore/opponentScore`)를 읽지 않는다(정적 테스트 `intraNoScoreRead.test.js` 유지).
- 브랜치 `feature/bigmaster-s13`(worktree), 태스크마다 커밋, 커밋 메시지 한국어. 트레일러 2줄(`Co-Authored-By`, `Claude-Session`)은 컨트롤러가 디스패치에 지정.

---

## File Structure

| 파일 | 책임 |
|---|---|
| `src/utils/intraSoccer/rosterSheet.js` (신규) | 팀별 열 CSV 파서 `parseIntraRosterCsv` + 시트 읽기 `fetchIntraRoster` |
| `src/utils/intraSoccer/pools.js` (신규) | 풀 계산(`floatingOf`·`setupPoolA/B`·`sidePool`·`canIntra`·`resolvePair`·`rosterOf`) + `mergeFormationState` |
| `src/utils/intraSoccer/sideView.js` (수정 1줄) | `ARR`이 객체화 배열도 복구 |
| `src/IntraSoccerApp.jsx` (수정) | 시트 적재·재연동·시작 게이트 |
| `src/components/intra/IntraSoccerMatchView.jsx` (수정) | 유형 카드(팀 표시·3팀 이상 선택)·배치 풀·`saveFormationState` 병합·종료 읽기 전용 |

---

### Task 1: `rosterSheet.js` — 팀별 열 CSV 파서 + 시트 읽기

**Files:**
- Create: `src/utils/intraSoccer/rosterSheet.js`
- Test: `src/utils/intraSoccer/__tests__/rosterSheet.test.js`

**Interfaces:**
- Consumes: `stripNameDecorations` (`src/services/appSync.js`, named export), `AuthUtil` (default export, `src/services/authUtil.js`, `getStored()`), `getSettings` (`src/config/settings.js`), `SHEET_CONFIG` (`src/config/constants.js`, `csvUrlBySheet(sheetId, sheetName)`).
- Produces: `parseIntraRosterCsv(text) → { teams: [{ name: string, players: string[] }], attendees: string[], warnings: string[] }` (throws `Error('팀 열 없음')`, `Error('팀 이름 중복: X')`, `Error('팀 이름으로 "휴식"은 쓸 수 없습니다')`); `fetchIntraRoster() → Promise<same>`.

- [ ] **Step 1: 실패하는 테스트**

```js
// src/utils/intraSoccer/__tests__/rosterSheet.test.js
import { describe, it, expect, vi, afterEach } from 'vitest';
import { parseIntraRosterCsv, fetchIntraRoster } from '../rosterSheet';

describe('parseIntraRosterCsv', () => {
  it('1행 팀 이름, 아래 참석자 — 열 순서대로 팀·참석자를 만든다', () => {
    const csv = '주황,파랑\n홍길동,김철수\n이영희,박민수\n,최지훈\n';
    const r = parseIntraRosterCsv(csv);
    expect(r.teams).toEqual([
      { name: '주황', players: ['홍길동', '이영희'] },
      { name: '파랑', players: ['김철수', '박민수', '최지훈'] },
    ]);
    expect(r.attendees).toEqual(['홍길동', '이영희', '김철수', '박민수', '최지훈']);
    expect(r.warnings).toEqual([]);
  });
  it('빈 행을 건너뛰고 첫 비어있지 않은 행을 헤더로 잡으며, 헤더가 빈 열(A열)은 무시한다', () => {
    const csv = '\n,,\n,주황,파랑\n,홍길동,김철수\n\n,이영희,\n';
    const r = parseIntraRosterCsv(csv);
    expect(r.teams.map(t => t.name)).toEqual(['주황', '파랑']);
    expect(r.teams[0].players).toEqual(['홍길동', '이영희']);
    expect(r.teams[1].players).toEqual(['김철수']);
  });
  it('따옴표·쉼표가 든 셀과 ★ 장식을 처리한다', () => {
    const csv = '"주황","파랑"\n"홍길동 ★","김, 철수"\n';
    const r = parseIntraRosterCsv(csv);
    expect(r.teams[0].players).toEqual(['홍길동']);
    expect(r.teams[1].players).toEqual(['김, 철수']);
  });
  it('같은 열 중복은 1회만, 두 열에 같은 이름은 먼저 나온 열 소속 — 둘 다 warning', () => {
    const csv = '주황,파랑\n홍길동,홍길동\n홍길동,김철수\n';
    const r = parseIntraRosterCsv(csv);
    expect(r.teams[0].players).toEqual(['홍길동']);
    expect(r.teams[1].players).toEqual(['김철수']);
    expect(r.warnings.length).toBe(2);
    expect(r.attendees).toEqual(['홍길동', '김철수']);
  });
  it('팀 열 1개도 허용(외부전 전용 날), 0개·중복 팀 이름·"휴식"은 throw', () => {
    expect(parseIntraRosterCsv('주황\n홍길동\n').teams).toHaveLength(1);
    expect(() => parseIntraRosterCsv('')).toThrow('팀 열 없음');
    expect(() => parseIntraRosterCsv('\n,,\n')).toThrow('팀 열 없음');
    expect(() => parseIntraRosterCsv('주황,주황\n')).toThrow('팀 이름 중복');
    expect(() => parseIntraRosterCsv('주황,휴식\n')).toThrow('휴식');
  });
  it('팀 3개도 열 순서대로 만든다', () => {
    const r = parseIntraRosterCsv('주황,파랑,검정\na1,b1,c1\n');
    expect(r.teams.map(t => t.name)).toEqual(['주황', '파랑', '검정']);
  });
});

describe('fetchIntraRoster', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
  it('설정의 attendanceSheet 로 CSV 를 받아 파싱한다', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, text: async () => '주황,파랑\n홍길동,김철수\n' })));
    const AuthUtil = (await import('../../../services/authUtil')).default;
    vi.spyOn(AuthUtil, 'getStored').mockReturnValue({ team: '빅마스터FC', mode: '축구' });
    const settings = await import('../../../config/settings');
    vi.spyOn(settings, 'getSettings').mockReturnValue({ sheetId: 'SHEET', attendanceSheet: '빅마스터FC 참석명단' });
    const r = await fetchIntraRoster();
    expect(r.teams.map(t => t.name)).toEqual(['주황', '파랑']);
    const url = fetch.mock.calls[0][0];
    expect(url).toContain('SHEET');
    expect(url).toContain(encodeURIComponent('빅마스터FC 참석명단'));
  });
  it('attendanceSheet 미설정이면 throw', async () => {
    const AuthUtil = (await import('../../../services/authUtil')).default;
    vi.spyOn(AuthUtil, 'getStored').mockReturnValue({ team: '빅마스터FC', mode: '축구' });
    const settings = await import('../../../config/settings');
    vi.spyOn(settings, 'getSettings').mockReturnValue({ sheetId: 'SHEET' });
    await expect(fetchIntraRoster()).rejects.toThrow('참석명단 시트 미설정');
  });
});
```
(ESM named exports are not always spy-able via `vi.spyOn` — if `vi.spyOn(settings, 'getSettings')` throws "cannot redefine", switch the two fetch tests to `vi.mock('../../../config/settings', () => ({ getSettings: vi.fn() }))` + `vi.mock('../../../services/authUtil', () => ({ default: { getStored: vi.fn() } }))` at the top of the file and set return values per test. Do not weaken the assertions.)

- [ ] **Step 2: 실패 확인** — `npx vitest run src/utils/intraSoccer/__tests__/rosterSheet.test.js` → FAIL(module not found).

- [ ] **Step 3: 구현**

```js
// src/utils/intraSoccer/rosterSheet.js
// 빅마스터FC 참석명단 시트(팀별 열: 1행 팀 이름, 아래 참석자) 읽기. 스펙 §13.2.
// sheetService 의 비공개 헬퍼를 export 하지 않기 위해 CSV 한 줄 파서를 여기서 최소 구현(따옴표·쉼표).
import { stripNameDecorations } from '../../services/appSync';
import AuthUtil from '../../services/authUtil';
import { getSettings } from '../../config/settings';
import { SHEET_CONFIG } from '../../config/constants';

function parseCsvLine(line) {
  const fields = [];
  let inQuote = false, field = '';
  for (const ch of line) {
    if (ch === '"') { inQuote = !inQuote; }
    else if (ch === ',' && !inQuote) { fields.push(field.trim()); field = ''; }
    else { field += ch; }
  }
  fields.push(field.trim());
  return fields;
}

const cleanName = (s) => stripNameDecorations((s || '').trim()).trim();

export function parseIntraRosterCsv(text) {
  const rows = String(text || '').split(/\r?\n/).map(parseCsvLine);
  const nonEmpty = (cells) => cells.some(c => c !== '');
  const hIdx = rows.findIndex(nonEmpty);
  if (hIdx < 0) throw new Error('팀 열 없음');
  // 헤더 행에서 값이 있는 셀 = 팀. 열 인덱스를 기억해 아래 행에서 같은 열을 읽는다.
  const cols = [];
  rows[hIdx].forEach((c, i) => { const name = cleanName(c); if (name) cols.push({ i, name }); });
  if (cols.length === 0) throw new Error('팀 열 없음');
  const names = cols.map(c => c.name);
  const dup = names.find((n, i) => names.indexOf(n) !== i);
  if (dup) throw new Error(`팀 이름 중복: ${dup}`);
  if (names.includes('휴식')) throw new Error('팀 이름으로 "휴식"은 쓸 수 없습니다(휴식 라운드와 구분 불가)');

  const teams = cols.map(c => ({ name: c.name, players: [] }));
  const warnings = [];
  const owner = new Map(); // 이름 → 먼저 나온 팀
  for (let r = hIdx + 1; r < rows.length; r++) {
    const cells = rows[r];
    cols.forEach((c, ti) => {
      const name = cleanName(cells[c.i]);
      if (!name) return;
      if (teams[ti].players.includes(name)) { warnings.push(`${c.name} 열에 ${name} 중복`); return; }
      if (owner.has(name)) { warnings.push(`${name}이(가) ${owner.get(name)}·${c.name} 두 열에 있음 — ${owner.get(name)} 소속으로 처리`); return; }
      owner.set(name, c.name);
      teams[ti].players.push(name);
    });
  }
  return { teams, attendees: teams.flatMap(t => t.players), warnings };
}

// 팀 설정의 attendanceSheet 를 읽는다 — 하버FC fetchAttendanceData 와 같은 URL 메커니즘(gviz CSV, 40행 이하라 절단 무관).
export async function fetchIntraRoster() {
  const team = AuthUtil.getStored()?.team;
  const s = getSettings(team);
  if (!s.attendanceSheet) throw new Error('참석명단 시트 미설정');
  const resp = await fetch(SHEET_CONFIG.csvUrlBySheet(s.sheetId, s.attendanceSheet));
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return parseIntraRosterCsv(await resp.text());
}
```

- [ ] **Step 4: 통과 확인** — `npx vitest run src/utils/intraSoccer` → PASS.
- [ ] **Step 5: Commit** — `git add src/utils/intraSoccer/rosterSheet.js src/utils/intraSoccer/__tests__/rosterSheet.test.js && git commit -m "feat: 빅마스터FC 참석명단(팀별 열) 파서·읽기 rosterSheet"`

---

### Task 2: `pools.js` 풀 계산·상태 병합 + `sideView.ARR` 객체화 복구

**Files:**
- Create: `src/utils/intraSoccer/pools.js`
- Modify: `src/utils/intraSoccer/sideView.js:4` (`ARR` 한 줄)
- Test: `src/utils/intraSoccer/__tests__/pools.test.js`, `src/utils/intraSoccer/__tests__/sideView.test.js`(테스트 1개 추가)

**Interfaces:**
- Consumes: `isIntra`, `fieldsOfA`, `fieldsOfB` (`./sideView`), `subPool(m, side, attendees)` (`./subPool`).
- Produces (Task 3·4가 사용):
  - `resolvePair(teams, selectedPair) → [i, j]` — 유효하지 않으면 `[0, 1]`
  - `rosterOf(teams, name) → string[] | null`
  - `floatingOf(attendees, teams) → string[]` (팀 없는 참석자)
  - `setupPoolA({ teams, a, attendees }) → string[]` = `(teams[a].players ∪ floating) ∩ attendees`(중복 제거, 순서: 명단 → 유동)
  - `setupPoolB({ teams, b, attendees, aAssigned }) → string[]` = `setupPoolA(b) − aAssigned`
  - `sidePool(m, side, attendees, teams) → string[]` — 외부전은 `subPool(m, side, attendees)`(= attendees 참조), 자체전은 편 이름으로 팀을 찾아 `(roster ∪ floating) ∩ attendees`를 `subPool`에 넘김; 팀을 못 찾으면 `attendees`로 폴백
  - `canIntra({ teams, attendees, pair }) → { ok: boolean, reason: string }`
  - `mergeFormationState(saved, current, updates) → { ...(saved||{}), ...current, ...updates }`

- [ ] **Step 1: 실패하는 테스트**

```js
// src/utils/intraSoccer/__tests__/pools.test.js
import { describe, it, expect } from 'vitest';
import { resolvePair, rosterOf, floatingOf, setupPoolA, setupPoolB, sidePool, canIntra, mergeFormationState } from '../pools';

const eleven = (p) => Array.from({ length: 11 }, (_, i) => `${p}${i + 1}`);
const teams = [
  { name: '주황', players: [...eleven('a'), 'a12'] },
  { name: '파랑', players: eleven('b') },
];
const attendees = [...eleven('a'), 'a12', ...eleven('b'), 'x1', 'x2'];   // x1,x2 = 유동 인원

describe('resolvePair / rosterOf / floatingOf', () => {
  it('유효하지 않은 selectedPair 는 [0,1]', () => {
    expect(resolvePair(teams, undefined)).toEqual([0, 1]);
    expect(resolvePair(teams, [1, 0])).toEqual([1, 0]);
    expect(resolvePair(teams, [0, 5])).toEqual([0, 1]);
    expect(resolvePair(teams, [1, 1])).toEqual([0, 1]);
  });
  it('rosterOf 는 이름으로, 없으면 null', () => {
    expect(rosterOf(teams, '파랑')).toEqual(eleven('b'));
    expect(rosterOf(teams, '없음')).toBeNull();
  });
  it('floatingOf 는 어느 팀에도 없는 참석자', () => {
    expect(floatingOf(attendees, teams)).toEqual(['x1', 'x2']);
    expect(floatingOf(attendees, [])).toEqual(attendees);
  });
});

describe('setupPoolA / setupPoolB', () => {
  it('A 풀 = A 명단 ∪ 유동, 참석자에 없는 명단은 제외', () => {
    const att = attendees.filter(n => n !== 'a12');           // a12 불참 처리
    expect(setupPoolA({ teams, a: 0, attendees: att })).toEqual([...eleven('a'), 'x1', 'x2']);
  });
  it('B 풀 = B 명단 ∪ 유동 − A 가 고른 선수', () => {
    const aAssigned = [...eleven('a').slice(0, 10), 'x1'];   // A 가 유동 x1 을 선발로 썼다
    expect(setupPoolB({ teams, b: 1, attendees, aAssigned })).toEqual([...eleven('b'), 'x2']);
  });
});

describe('sidePool', () => {
  const m = {
    lineup: eleven('a'), gk: 'a1', assignments: Object.fromEntries(eleven('a').map((n, i) => [i, n])),
    sideA: { name: '주황' },
    sideB: { name: '파랑', lineup: eleven('b'), gk: 'b1', assignments: Object.fromEntries(eleven('b').map((n, i) => [i, n])) },
    events: [{ id: 's', type: 'sub', side: 'B', playerOut: 'b11', playerIn: 'x2', position: 'FW', posIdx: 10 }],
  };
  it('A 탭 = A 명단∪유동 − B 출전 이력(x2 는 B 로 뛰었으니 제외)', () => {
    expect(sidePool(m, 'A', attendees, teams)).toEqual([...eleven('a'), 'a12', 'x1']);
  });
  it('B 탭 = B 명단∪유동 − A 출전 이력', () => {
    expect(sidePool(m, 'B', attendees, teams)).toEqual([...eleven('b'), 'x1', 'x2']);
  });
  it('편 이름이 팀 목록에 없으면 attendees 로 폴백, 외부전은 attendees 참조 그대로', () => {
    const mm = { ...m, sideA: { name: '누구' } };
    expect(sidePool(mm, 'A', attendees, teams)).toEqual(attendees.filter(n => !eleven('b').includes(n) && n !== 'x2'));
    const ext = { lineup: ['a1'], gk: 'a1', events: [] };
    expect(sidePool(ext, 'A', attendees, teams)).toBe(attendees);
  });
});

describe('canIntra', () => {
  it('두 팀 각 11명 이상 + 참석 22명 이상이면 ok', () => {
    expect(canIntra({ teams, attendees, pair: undefined })).toEqual({ ok: true, reason: '' });
  });
  it('팀 열 1개면 불가', () => {
    expect(canIntra({ teams: [teams[0]], attendees }).ok).toBe(false);
  });
  it('한 팀이 유동 포함 11명 미만이면 불가, 이유에 인원 표시', () => {
    const r = canIntra({ teams, attendees: attendees.filter(n => !['b9', 'b10', 'b11', 'x1', 'x2'].includes(n)) });
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('파랑 8명');
  });
  it('참석 22명 미만이면 불가', () => {
    const small = [...eleven('a'), ...eleven('b').slice(0, 10)];
    const t = [{ name: '주황', players: eleven('a') }, { name: '파랑', players: eleven('b') }];
    expect(canIntra({ teams: t, attendees: small }).ok).toBe(false);
  });
  it('팀 3개면 pair 기준으로 평가하고 기본은 [0,1]', () => {
    const t3 = [...teams, { name: '검정', players: ['c1'] }];
    expect(canIntra({ teams: t3, attendees }).ok).toBe(true);
    expect(canIntra({ teams: t3, attendees, pair: [0, 2] }).ok).toBe(false);
  });
});

describe('mergeFormationState', () => {
  it('saved 의 intra 를 보존하고 current·updates 를 덮는다', () => {
    const saved = { viewState: 'formation', selectedOpponent: 'X', selectedPlayers: ['p'], intra: { teams, syncedAt: 1, selectedPair: [1, 0] } };
    const out = mergeFormationState(saved, { viewState: 'selectOpponent', selectedOpponent: null, selectedPlayers: [] }, { viewState: 'formation' });
    expect(out).toEqual({ viewState: 'formation', selectedOpponent: null, selectedPlayers: [], intra: saved.intra });
    expect(mergeFormationState(null, { viewState: 'a' }, {})).toEqual({ viewState: 'a' });
  });
});
```
`sideView.test.js`에 추가:
```js
  it('RTDB 가 객체화한 배열({0:..,1:..})도 배열로 복구한다', () => {
    const m = { ...intra, sideB: { ...intra.sideB, lineup: { 0: 'b1', 1: 'b2' }, subs: undefined } };
    expect(fieldsOfB(m).lineup).toEqual(['b1', 'b2']);
    expect(fieldsOfB(m).subs).toEqual([]);
  });
```

- [ ] **Step 2: 실패 확인** — `npx vitest run src/utils/intraSoccer/__tests__/pools.test.js src/utils/intraSoccer/__tests__/sideView.test.js` → pools: module not found; sideView 신규 테스트 FAIL(`[]` 반환).

- [ ] **Step 3: 구현**

`src/utils/intraSoccer/sideView.js:4`:
```js
// RTDB 는 빈 배열을 저장하지 않고(→ undefined) 비어있지 않은 배열을 객체화({0:..})할 수 있다 — 공유 normalizeSoccerMatch 의 asArr 와 같은 규칙.
const ARR = (v) => (Array.isArray(v) ? v : (v && typeof v === 'object' ? Object.values(v) : []));
```
```js
// src/utils/intraSoccer/pools.js
// 빅마스터FC 증분 2(스펙 §13.4): 시트 팀 명단 + 유동 인원(팀 없는 참석자)으로 배치·교체 풀을 만든다. 전부 순수.
import { isIntra, fieldsOfA, fieldsOfB } from './sideView';
import { subPool } from './subPool';

export const DEFAULT_PAIR = [0, 1];
const uniq = (arr) => Array.from(new Set(arr));
const inter = (list, attendees) => { const a = new Set(attendees || []); return list.filter(n => a.has(n)); };

export function resolvePair(teams, selectedPair) {
  const n = (teams || []).length;
  const ok = (i) => Number.isInteger(i) && i >= 0 && i < n;
  const p = Array.isArray(selectedPair) && selectedPair.length === 2 ? selectedPair : DEFAULT_PAIR;
  return ok(p[0]) && ok(p[1]) && p[0] !== p[1] ? [p[0], p[1]] : [...DEFAULT_PAIR];
}

export function rosterOf(teams, name) {
  const t = (teams || []).find(t => t.name === name);
  return t ? t.players : null;
}

export function floatingOf(attendees, teams) {
  const inTeam = new Set((teams || []).flatMap(t => t.players || []));
  return (attendees || []).filter(n => !inTeam.has(n));
}

export function setupPoolA({ teams, a, attendees }) {
  const roster = (teams || [])[a]?.players || [];
  return inter(uniq([...roster, ...floatingOf(attendees, teams)]), attendees);
}

export function setupPoolB({ teams, b, attendees, aAssigned }) {
  const taken = new Set(aAssigned || []);
  return setupPoolA({ teams, a: b, attendees }).filter(n => !taken.has(n));
}

// 탭 side 레코더의 attendees. 자체전: 자기 팀 명단 ∪ 유동 인원(∩ 참석자) 에서 상대 편 출전 이력·퇴장자를 subPool 이 뺀다.
export function sidePool(m, side, attendees, teams) {
  if (!isIntra(m)) return subPool(m, side, attendees);
  const name = side === 'A' ? fieldsOfA(m).name : fieldsOfB(m).name;
  const roster = rosterOf(teams, name);
  const base = roster ? inter(uniq([...roster, ...floatingOf(attendees, teams)]), attendees) : (attendees || []);
  return subPool(m, side, base);
}

export function canIntra({ teams, attendees, pair }) {
  const t = teams || [];
  if (t.length < 2) return { ok: false, reason: '시트에 팀 열이 2개 이상 필요' };
  const [a, b] = resolvePair(t, pair);
  const pa = setupPoolA({ teams: t, a, attendees }).length;
  const pb = setupPoolA({ teams: t, a: b, attendees }).length;
  const total = (attendees || []).length;
  if (pa < 11 || pb < 11 || total < 22) {
    return { ok: false, reason: `${t[a].name} ${pa}명 · ${t[b].name} ${pb}명 · 참석 ${total}명 (각 11명·총 22명 필요)` };
  }
  return { ok: true, reason: '' };
}

// saveFormationState 용 병합 — soccerFormation 은 whole-replace 동기 필드라 saved(특히 intra)를 펼치지 않으면 호출마다 삭제된다.
export function mergeFormationState(saved, current, updates) {
  return { ...(saved || {}), ...(current || {}), ...(updates || {}) };
}
```

- [ ] **Step 4: 통과 확인** — `npx vitest run src/utils/intraSoccer` → PASS(기존 테스트 포함).
- [ ] **Step 5: Commit** — `git add src/utils/intraSoccer/pools.js src/utils/intraSoccer/sideView.js src/utils/intraSoccer/__tests__/pools.test.js src/utils/intraSoccer/__tests__/sideView.test.js && git commit -m "feat: 자체전 풀 계산 pools + sideView ARR 객체화 배열 복구"`

---

### Task 3: `IntraSoccerApp.jsx` — 시트 적재·재연동·시작 게이트

**Files:**
- Modify: `src/IntraSoccerApp.jsx` — import(:3), `_loadAllData`(:90-121), `syncAttendance`(:125-131), 참석자 섹션 아래 팀 요약(설정 화면 ~:370-400 사이), `canStart`(:409-414)

**Interfaces:**
- Consumes: `fetchIntraRoster` (Task 1), `canIntra`, `floatingOf` (Task 2).
- Produces: `state.soccerFormation.intra` 를 채움(`{ teams, syncedAt, selectedPair }`); `attendees`.

- [ ] **Step 1: import 교체**
`import { fetchSheetData, fetchAttendanceData } from './services/sheetService';` → `import { fetchSheetData } from './services/sheetService';` 추가: `import { fetchIntraRoster } from './utils/intraSoccer/rosterSheet';` `import { canIntra, floatingOf } from './utils/intraSoccer/pools';`

- [ ] **Step 2: `_loadAllData`** — `fetchAttendanceData()` 호출을 `fetchIntraRoster()`로 바꾸고(변수명 `roster`), 결과 처리 블록을 다음으로 교체:
```js
      // 시트 연동 시 참석자·팀 명단을 미리 채우되 setup 화면에 머문다 (자동 경기진입 없음).
      if (gameMode === "sheetSync" && roster && roster.attendees.length > 0) {
        if (roster.warnings.length) console.warn("[빅마스터FC 참석명단]", roster.warnings.join(" / "));
        dispatch({ type: 'SET_FIELDS', fields: { attendees: roster.attendees, matchMode: "soccer", courtCount: 1 } });
        // 팀 명단은 whole-replace 동기 필드 soccerFormation.intra 에(새 게임이라 기존 soccerFormation 은 null).
        dispatch({ type: 'SET_SOCCER_FORMATION', formation: {
          viewState: "selectOpponent", selectedOpponent: null, selectedPlayers: [],
          intra: { teams: roster.teams, syncedAt: Date.now() },
        } });
      }
```
(`Promise.all` 의 구조분해 이름을 `[sheetData, cumBonus, roster]`로.)

- [ ] **Step 3: `syncAttendance` 교체** — 선언 위치를 `locked` useMemo(:187-192) **아래**로 옮기고(클로저가 `locked`를 참조):
```js
  // ── 참석명단(팀별 열) 재연동 — 팀 명단은 시트 기준으로 갱신, 출전 기록 있는 선수(locked)는 참석자에 남긴다(D3).
  const syncAttendance = () => {
    set('attendanceLoading', true);
    fetchIntraRoster()
      .then(r => {
        if (r.warnings.length) console.warn("[빅마스터FC 참석명단]", r.warnings.join(" / "));
        const merged = Array.from(new Set([...r.attendees, ...Array.from(locked)]));
        dispatch({ type: 'SET_FIELDS', fields: { attendees: merged } });
        const prev = state.soccerFormation || { viewState: "selectOpponent", selectedOpponent: null, selectedPlayers: [] };
        dispatch({ type: 'SET_SOCCER_FORMATION', formation: {
          ...prev, intra: { teams: r.teams, syncedAt: Date.now(), selectedPair: prev.intra?.selectedPair },
        } });
      })
      .catch(err => alert("참석명단 연동 실패: " + err.message))
      .finally(() => set('attendanceLoading', false));
  };
```

- [ ] **Step 4: setup 화면 팀 요약 + 시작 게이트** — 참석자 섹션(`AttendeeSelector` 카드) 바로 아래에:
```jsx
        {(() => {
          const teams = state.soccerFormation?.intra?.teams || [];
          if (teams.length === 0) return null;
          const floating = floatingOf(attendees, teams);
          return (
            <div style={s.section}>
              <div style={s.sectionTitle}>🟧🟦 자체전 팀 (시트)</div>
              <div style={{ ...s.card, fontSize: 12, color: C.grayLight, lineHeight: 1.7 }}>
                {teams.map(t => <div key={t.name}><b style={{ color: C.white }}>{t.name}</b> {t.players.filter(n => attendees.includes(n)).length}명</div>)}
                {floating.length > 0 && <div><b style={{ color: C.white }}>팀 없음(유동)</b> {floating.join(", ")}</div>}
              </div>
            </div>
          );
        })()}
```
`canStart` 블록을:
```js
            const intraGate = canIntra({ teams: state.soccerFormation?.intra?.teams || [], attendees, pair: state.soccerFormation?.intra?.selectedPair });
            const canStart = (state.opponents || []).length > 0 || intraGate.ok;
            // … button label:
            {canStart ? `축구 경기 시작 (${attendees.length}명)` : `외부전: 상대팀 선택 · 자체전: ${intraGate.reason}`}
```

- [ ] **Step 5: 빌드·테스트·eslint** — `npm run build && npx vitest run && npx eslint src/IntraSoccerApp.jsx` (0 errors; `fetchAttendanceData` 미사용 import 없음).
- [ ] **Step 6: Commit** — `git add src/IntraSoccerApp.jsx && git commit -m "feat: IntraSoccerApp — 참석명단(팀별 열) 적재·재연동·자체전 시작 게이트"`

---

### Task 4: `IntraSoccerMatchView.jsx` — 유형 카드·배치 풀·intra 보존·종료 읽기 전용

**Files:**
- Modify: `src/components/intra/IntraSoccerMatchView.jsx` — import(:1-20), state(:45-48), `saveFormationState`(:57-59), `startIntra`(:147-157), `handleIntraConfirm`(:160-190), 배치 단계(:255-270), 편집기 bench(:281), `canIntra`(:320), `canChangeOpponent`(:329), 편집 버튼 블록(:357-373), 유형 카드(:376-410), 레코더 `attendees`(:449), `ConfirmBar`(:537-543)

**Interfaces:**
- Consumes: `resolvePair`, `setupPoolA`, `setupPoolB`, `sidePool`, `canIntra`, `mergeFormationState` (Task 2). `savedFormation.intra` (Task 3가 채움).

- [ ] **Step 1: import·파생값**
`import { resolvePair, setupPoolA, setupPoolB, sidePool, canIntra, mergeFormationState } from '../../utils/intraSoccer/pools';` 추가. `subPool` import는 더 이상 직접 쓰지 않으면 제거.
state에서 `sideNames` 제거. `saveFormationState` 아래에:
```js
  // [증분 2] 팀 명단·선택 쌍은 시트 → soccerFormation.intra (Task 3). 편 이름은 팀 이름 그대로.
  const intra = savedFormation?.intra || { teams: [] };
  const teams = intra.teams || [];
  const pair = resolvePair(teams, intra.selectedPair);
  const teamA = teams[pair[0]] || null, teamB = teams[pair[1]] || null;
  const gate = canIntra({ teams, attendees, pair });
  const setPair = (p) => saveFormationState({ intra: { ...intra, selectedPair: p } });
```
`saveFormationState`:
```js
  const saveFormationState = (updates) => {
    onFormationChange?.(mergeFormationState(savedFormation, { viewState, selectedOpponent, selectedPlayers }, updates));
  };
```
(선언 순서: `saveFormationState` → `intra/teams/pair/...`는 `saveFormationState`보다 아래에 두되, 둘 다 첫 early return 이전.)

- [ ] **Step 2: `startIntra`·`handleIntraConfirm`**
```js
  const startIntra = () => {
    if (!gate.ok || !teamA || !teamB) return;
    setMatchType("자체전");
    setViewState("formationA");
  };
```
`handleIntraConfirm`에서 `sideNames.A`/`sideNames.B` → `teamA.name`/`teamB.name`(3곳: `opponent:`, `onPatchSide(newIdx,'A',{ name })`, B patch `name`). 나머지(가드·A 벤치 필터·정리) 그대로.

- [ ] **Step 3: 배치 단계 풀**
```jsx
  if (viewState === "formationA" && teamA) {
    return (
      <FormationSetup key="setup-intra-A" selectedPlayers={setupPoolA({ teams, a: pair[0], attendees })} title={`${teamA.name} 선발 11명`}
        onConfirm={(resA) => { setPendingA(resA); setViewState("formationB"); }}
        onBack={() => { setPendingA(null); setMatchType(null); setViewState("selectOpponent"); }} />
    );
  }
  if (viewState === "formationB" && pendingA && teamB) {
    const poolB = setupPoolB({ teams, b: pair[1], attendees, aAssigned: Object.values(pendingA.assignments) });
    return (
      <FormationSetup key="setup-intra-B" selectedPlayers={poolB} title={`${teamB.name} 선발 11명`}
        onConfirm={(resB) => handleIntraConfirm(pendingA, resB)}
        onBack={() => { setPendingA(null); setViewState("formationA"); }} />
    );
  }
```
편집기 bench(:281): `getNonPlayers(v, sidePool(m, side, attendees, teams))`. 레코더(:449): `attendees={sidePool(currentMatch, side, attendees, teams)}`. 기존 `const canIntra = (attendees||[]).length >= 22;`(:320) 삭제.

- [ ] **Step 4: 유형 카드** — 이름 입력 두 개를 제거하고:
```jsx
              <div style={{ fontSize: 13, fontWeight: 800, color: C.white, marginBottom: 8 }}>경기 유형</div>
              {teams.length >= 3 && (
                <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                  {[0, 1].map(k => (
                    <select key={k} value={pair[k]} onChange={e => { const v = Number(e.target.value); const other = pair[1 - k]; if (v !== other) setPair(k === 0 ? [v, other] : [other, v]); }}
                      style={{ ...s.input, flex: 1 }}>
                      {teams.map((t, i) => <option key={t.name} value={i}>{t.name} ({t.players.filter(n => attendees.includes(n)).length}명)</option>)}
                    </select>
                  ))}
                </div>
              )}
              <button onClick={startIntra} disabled={!gate.ok}
                style={{ ...s.btnFull(C.accent, C.bg), marginBottom: 8, opacity: gate.ok ? 1 : 0.4, cursor: gate.ok ? "pointer" : "not-allowed" }}>
                {gate.ok ? `자체전 (${teamA.name} vs ${teamB.name} · 참석 ${attendees.length}명)` : `자체전 — ${gate.reason}`}
              </button>
```
(`s.input`이 select에 어색하면 `style={{ flex: 1, padding: 8, borderRadius: 8 }}` 정도로.)

- [ ] **Step 5: 종료 = 확정(읽기 전용)**
`const canChangeOpponent = !!node && !atNewNode && !isRest;` → `const canEditNode = !!node && !atNewNode && !isRest && node.status !== "finished";` 그리고 편집 버튼 블록의 `{canChangeOpponent && (` → `{canEditNode && (`. `ConfirmBar` 안의 확정취소 버튼 제거:
```jsx
            <ConfirmBar>
              <span style={{ color: C.green, fontWeight: 700, fontSize: 13 }}>제{node.matchIdx + 1}경기 {isRest ? "휴식" : "종료됨 · 확정(수정 불가)"}</span>
            </ConfirmBar>
```
`handleReopenMatch` 함수 삭제, props 구조분해에서 `onReopenMatch` 제거(부모는 여전히 넘겨도 무해).

- [ ] **Step 6: 빌드·테스트·정독** — `npm run build && npx vitest run && npx eslint src/components/intra/IntraSoccerMatchView.jsx`(0 errors, `sideNames`·`subPool`·`handleReopenMatch` 잔존 없음). 파일 정독: hooks가 early return 앞에 있는지, `teamA/teamB` null 가드, `sidePool` 두 호출부 모두 `teams` 전달.
- [ ] **Step 7: Commit** — `git add src/components/intra/IntraSoccerMatchView.jsx && git commit -m "feat: IntraSoccerMatchView — 시트 팀 명단 기반 배치 풀·3팀 선택·intra 보존·종료 확정(읽기 전용)"`

---

### Task 5: 격리 검증·스펙 상태

- [ ] **Step 1: 화이트리스트**
```bash
git diff --name-only 688d79a -- src | grep -v -E '^src/(IntraSoccerApp\.jsx|components/intra/IntraSoccerMatchView\.jsx|utils/intraSoccer/)' 
```
Expected: **출력 없음**(그 외 기존 파일 변경 0). 추가로 `git diff 688d79a --stat -- src/services src/hooks src/components/game src/SoccerApp.jsx src/utils/soccerScoring.js apps-script`가 비어야 함.
- [ ] **Step 2: 전체** — `npx vitest run && npm run build` PASS.
- [ ] **Step 3: 스펙 상태 줄** — 3행을 `날짜 2026-09-10. 상태: **§1–13 구현 완료(로컬 main), 배포 대기.**`로 갱신, 커밋 `docs: 스펙 상태 — §13 구현 완료`.

이후 최종 전체 리뷰(적대적 5렌즈 중 회귀·데이터 흐름 중심) → `finishing-a-development-branch`.
