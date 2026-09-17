# 마스터스컵 2단계 — 대회·팀 관리 + 컵 경기일 진입 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 풋살 팀이 앱 안에서 컵대회를 만들고 팀(팀명·팀장·팀원)을 관리한 뒤, 경기관리 탭이나 대회 상세에서 "컵 경기 시작"을 누르면 그 대회의 팀으로 짜인 풋살 세션이 열려 1일차를 치를 수 있게 한다. 첫 마감 후 팀명·팀 수·삭제는 잠긴다.

**Architecture:** 대회 엔티티는 RTDB `tournaments/{safeTeam}/{cupId}`(`meta` + `teams`)에 저장하고 `cupSync.js`가 CRUD한다. 순수 로직(`normalizeCup`·`validateTeams`·`nextTeamId`·`isLocked`·`cupIdOf`·`generateCupRounds`)은 `src/utils/cup/`에 두고 유닛 테스트한다. 화면은 대시보드 "대회" 탭(풋살 분기)의 `CupListTab` → `CupDetail` → `CupTeamEditor`, 경기관리 탭의 `🏆 컵대회 경기` 버튼(`CupPickerModal`). 세션 진입은 Root가 `gameParams={ cupId }`를 App에 넘기고 App의 `_loadAllData` 컵 분기가 대회를 읽어 `phase:'match'`로 들어간다. 1단계 격리 게이트(태그·필터·마감 컵 분기)는 그대로이며, 컵 마감 성공 시 `CupSync.markLocked`만 추가로 부른다. 치른 대진 제외·순위표·통산은 3단계.

**Tech Stack:** React 18 + Vite, vitest(jsdom; 컴포넌트는 `act`+`createRoot` 실렌더), Firebase RTDB(`firebase/database` SDK 직접 사용, 테스트에서는 in-memory mock), Google Apps Script(변경 없음).

**Spec:** `docs/superpowers/specs/2026-09-16-masters-cup-design.md` v2 — §3(용어), §4.2(엔티티), §4.3(컵 규칙), §4.5(팀 관리·잠금), §6.1(대회 탭·진입점), §6.2(세션 시작), §6.3(대진, 2단계는 canonical 전체), §6.5(markLocked), §8·§9, §10 불변식 5·7·11·13, §11 2단계, §12·§13.

## Global Constraints

- 하버FC·빅마스터FC(축구)·몽피스(테니스) 동작 변화 0. `mainTabs`의 테니스 분기·축구 조건은 그대로, 축구 `tournament` 탭은 기존 `TournamentListTab` 그대로.
- **원자 커밋 두 묶음:** (a) `src/components/dashboard/mainTabs.js` + `TeamDashboard.jsx`의 `tournament` 탭 분기(+ `mainTabs.test.js` 갱신)는 한 커밋(Task 8). (b) `src/Root.jsx`(시그니처·state·`<GameApp gameParams>`) + `src/App.jsx`(prop 수신·컵 분기)는 한 커밋(Task 5).
- 정규 세션 마감 경로(`handleFinalize`의 정규 `try` 블록)는 바이트 단위로 손대지 않는다. 컵 분기 안에만 `markLocked` 호출을 추가한다.
- 컵 판별은 `isCupSession(state)`, 로그 태그는 `logTagsOf(state)`만(1단계). `state.tournamentId`는 `cup.meta.id`(= cupId).
- 대회 식별자 `cupId = cupIdOf(name)` = `rtdbPath.safeKey(name.trim())`; `|` 포함·빈 문자열·중복은 throw. 대회명은 생성 후 불변(`meta.name === meta.id`).
- 팀 id는 `t1`,`t2`,…(`nextTeamId` = 기존 최대 번호+1, 재사용 없음). 팀명 정규화 `/^팀 /`→`팀`, 이름은 `stripNameDecorations`+trim. `captain`은 `''` 또는 그 팀 `players`에 포함.
- 잠금 = `!!cup.meta.lockedAt`(2단계). 잠기면 팀명 입력·팀 추가/삭제·대회 삭제 비활성, 팀원·팀장은 편집 가능.
- 컵 세션 규칙 스냅샷 `getCupSettings(team) = { ...getEffectiveSettings(team,'풋살'), ...SPORT_DEFAULTS.풋살, _meta:{ preset:null, sport:'풋살', team, cup:true } }`. 설정 키 추가 없음.
- RTDB는 빈 배열을 저장하지 않는다 → `normalizeCup`이 `players ?? []`를 보장. 자식 컴포넌트에서 `useState(prop)`로 원격 값을 초기화하지 않는다(편집기는 열릴 때 `loadCup`으로 읽어 로컬 사본을 만든다 — 편집 중 원격 갱신 반영은 비목표).
- 대진: N=5·2구장은 `generate5Team2Court().slice(0,5)`, N=7·2구장은 `generate7Team2Court()`, 그 외 `generateRoundRobin` 기반 generic 패킹. N∈[3,8], N≤3이면 1구장.
- Apps Script·`analyticsV2`·`soccerAnalytics`·`intraSoccer`·`components/tournament/*` 수정 금지.
- 시트 이름은 실제 이름으로: 마스터FC 포인트 로그 / 마스터FC 선수별집계기록 로그 / 로그_이벤트 / 로그_선수경기 / 로그_매치.
- 커밋 메시지는 한국어 `feat:`/`test:`/`docs:` 접두 + 트레일러 두 줄:
  ```
  Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01AqpBTxNBiezjumZN5AzJ6D
  ```
- 테스트: `npx vitest run <파일>`, 전체 `npm test`. 빌드 `npm run build`, 린트 `npm run lint`(기존 에러 2건 `src/services/appSync.js:13`·`tennisSync.js:16`은 손대지 않는다; 신규 에러 0).
- **배포 전제(코드 밖):** Firebase 콘솔 RTDB 규칙에 `tournaments` 최상위 읽기/쓰기 허용(`tournaments/{팀}` 수준 `.read` 포함). Task 9 검증 목록에 포함.

---

## File Structure

| 파일 | 책임 |
|---|---|
| `src/utils/cup/cupEntity.js` (신규) | `normalizeCup`, `validateTeams`, `nextTeamId`, `isLocked`, `cupIdOf` — 순수 |
| `src/utils/cup/cupSchedule.js` (신규) | `generateCupRounds(N, courtCount)` — 순수(3단계에서 `collectPlayedPairs`·`calcRemainingRounds` 추가) |
| `src/services/cupSync.js` (신규) | RTDB CRUD: `listCups`·`loadCup`·`createCup`·`saveTeams`·`setStatus`·`markLocked`·`deleteCup` |
| `src/config/settings.js` | `getCupSettings(team)` |
| `src/utils/pendingGameLabel.js` | 컵 세션 `🏆 ` 접두 |
| `src/Root.jsx` | `gameParams` state·`handleStartNew(mode, params)`·`<GameApp gameParams>`·초기화 2곳 |
| `src/App.jsx` | `gameParams` prop, `_loadAllData` 컵 분기, 로드 실패 화면, 🏆 배너, 컵 마감 `markLocked` |
| `src/components/cup/CupTeamEditor.jsx` (신규) | 팀 편집(팀 추가/삭제·팀명·팀장·팀원 회원선택/자유입력·저장·잠금) |
| `src/components/cup/CupDetail.jsx` (신규) | 대회 상세(시작·이어서·팀 관리·상태 토글·삭제) |
| `src/components/cup/CupListTab.jsx` (신규) | 대회 목록·생성·완료 접기 → `CupDetail` |
| `src/components/cup/CupPickerModal.jsx` (신규) | 경기관리 버튼에서 활성 대회 선택 |
| `src/components/dashboard/mainTabs.js` | 풋살 `tournament` 탭 |
| `src/components/dashboard/TeamDashboard.jsx` | `tournament` 탭 종목 분기, `🏆 컵대회 경기` 버튼, cups 로드 |
| 테스트(신규) | `src/utils/__tests__/cupEntity.test.js`, `cupSchedule.test.js`, `src/services/__tests__/cupSync.test.js`, `src/components/cup/__tests__/CupTeamEditor.render.test.jsx`, `CupListTab.render.test.jsx`, `src/components/__tests__/cupWiring.guard.test.js` |
| 테스트(수정) | `src/config/__tests__/settings.test.js`, `src/utils/__tests__/pendingGameLabel.test.js`, `src/components/dashboard/__tests__/mainTabs.test.js` |

---

### Task 1: 대회 엔티티 순수 로직 `cupEntity.js`

**Files:**
- Create: `src/utils/cup/cupEntity.js`
- Test: `src/utils/__tests__/cupEntity.test.js`

**Interfaces:**
- Consumes: `safeKey` (`src/services/rtdbPath.js`), `stripNameDecorations` (`src/services/appSync.js`).
- Produces:
  - `normalizeCup(cupId, raw) → Cup|null` — `Cup = { meta: { id, name, sport, format, status, createdAt, createdBy, updatedAt, lockedAt }, teams: Team[] }`, `Team = { id, name, captain, players: string[], order }`. `raw`가 없거나 `raw.meta.sport !== '풋살'`이면 `null`.
  - `validateTeams(teams) → { ok, errors: string[], teams: Team[] }` (`teams`는 정규화된 사본).
  - `nextTeamId(teams) → string`.
  - `isLocked(cup, playedPairs = new Set()) → boolean`.
  - `cupIdOf(name) → string` (throw on 빈 값·`|`).
  - `normalizeTeamName(name)`, `cleanPlayerName(name)`.

- [ ] **Step 1: Write the failing tests**

```js
// src/utils/__tests__/cupEntity.test.js
// 스펙 §3·§4.2·§4.5 — 대회 엔티티 정규화·검증·잠금·식별자(순수 로직).
import { describe, it, expect } from 'vitest';
import { normalizeCup, validateTeams, nextTeamId, isLocked, cupIdOf, normalizeTeamName, cleanPlayerName } from '../cup/cupEntity';

const META = { id: '마스터스컵 2026', name: '마스터스컵 2026', sport: '풋살', format: 'league1', status: 'active', createdAt: 100, createdBy: '홍길동', updatedAt: 100 };

describe('normalizeCup', () => {
  it('teams 객체를 order 순 배열로, players 누락은 [], captain 누락은 "", lockedAt 누락은 null', () => {
    const cup = normalizeCup('마스터스컵 2026', {
      meta: META,
      teams: {
        t2: { id: 't2', name: '팀B', order: 1, players: ['b1'] },
        t1: { id: 't1', name: '팀A', order: 0 },               // players·captain 없음(RTDB 빈배열 누락)
      },
    });
    expect(cup.teams.map(t => t.id)).toEqual(['t1', 't2']);
    expect(cup.teams[0].players).toEqual([]);
    expect(cup.teams[0].captain).toBe('');
    expect(cup.meta.lockedAt).toBeNull();
    expect(cup.meta.status).toBe('active');
  });
  it('players 가 RTDB 객체({0:"a",1:"b"})로 와도 배열로', () => {
    const cup = normalizeCup('c', { meta: META, teams: { t1: { name: '팀A', order: 0, players: { 0: 'a', 1: 'b' } } } });
    expect(cup.teams[0].players).toEqual(['a', 'b']);
    expect(cup.teams[0].id).toBe('t1'); // 키로 보강
  });
  it('raw 없음·meta 없음·풋살 아님은 null (축구 대회 모드의 cache/activeGame 노드 제외)', () => {
    expect(normalizeCup('x', null)).toBeNull();
    expect(normalizeCup('x', { cache: {}, activeGame: {} })).toBeNull();
    expect(normalizeCup('x', { meta: { ...META, sport: '축구' } })).toBeNull();
  });
});

describe('validateTeams', () => {
  const T = (id, name, players, extra = {}) => ({ id, name, players, captain: '', order: 0, ...extra });
  const three = () => [T('t1', '팀A', ['a1']), T('t2', '팀B', ['b1']), T('t3', '팀C', ['c1'])];
  it('정상 3팀 → ok, 이름 정규화(앞 "팀 " 공백·★ 장식) 반영', () => {
    const r = validateTeams([T('t1', '팀 A', ['a1 ★']), T('t2', '팀B', ['b1']), T('t3', '팀C', ['c1'])]);
    expect(r.ok).toBe(true);
    expect(r.teams[0].name).toBe('팀A');
    expect(r.teams[0].players).toEqual(['a1']);
  });
  it('팀 수 3~8', () => {
    expect(validateTeams(three().slice(0, 2)).errors).toContain('팀은 3~8개여야 합니다');
    expect(validateTeams(Array.from({ length: 9 }, (_, i) => T(`t${i + 1}`, `팀${i + 1}`, [`p${i}`]))).errors).toContain('팀은 3~8개여야 합니다');
  });
  it('팀명 빈 값·중복·| 금지', () => {
    expect(validateTeams([T('t1', '', ['a']), T('t2', '팀B', ['b']), T('t3', '팀C', ['c'])]).errors).toContain('팀명이 비어 있습니다');
    expect(validateTeams([T('t1', '팀A', ['a']), T('t2', '팀A', ['b']), T('t3', '팀C', ['c'])]).errors).toContain('팀명 중복: 팀A');
    expect(validateTeams([T('t1', '팀|A', ['a']), T('t2', '팀B', ['b']), T('t3', '팀C', ['c'])]).errors).toContain('팀명에 | 는 쓸 수 없습니다: 팀|A');
  });
  it('각 팀 최소 1명, 한 선수는 한 팀에만', () => {
    expect(validateTeams([T('t1', '팀A', []), T('t2', '팀B', ['b']), T('t3', '팀C', ['c'])]).errors).toContain('팀A: 팀원이 없습니다');
    expect(validateTeams([T('t1', '팀A', ['x']), T('t2', '팀B', ['x']), T('t3', '팀C', ['c'])]).errors).toContain('x: 두 팀에 있습니다(팀A, 팀B)');
  });
  it('captain 은 "" 이거나 그 팀 players 에 포함', () => {
    expect(validateTeams([T('t1', '팀A', ['a'], { captain: 'zz' }), T('t2', '팀B', ['b']), T('t3', '팀C', ['c'])]).errors).toContain('팀A: 팀장 zz 이(가) 팀원에 없습니다');
    expect(validateTeams([T('t1', '팀A', ['a'], { captain: 'a' }), T('t2', '팀B', ['b']), T('t3', '팀C', ['c'])]).ok).toBe(true);
  });
  it('id 없는 팀은 에러', () => {
    expect(validateTeams([T(undefined, '팀A', ['a']), T('t2', '팀B', ['b']), T('t3', '팀C', ['c'])]).errors).toContain('팀 id 가 없습니다: 팀A');
  });
});

describe('nextTeamId', () => {
  it('최대 번호+1, 삭제된 번호는 재사용하지 않는다', () => {
    expect(nextTeamId([])).toBe('t1');
    expect(nextTeamId([{ id: 't1' }, { id: 't3' }])).toBe('t4'); // t2 삭제됐어도 t4
    expect(nextTeamId([{ id: 'x' }])).toBe('t1');               // 규칙 밖 id 는 무시
  });
});

describe('isLocked', () => {
  it('lockedAt 만으로도, 로그(playedPairs)만으로도 잠김', () => {
    expect(isLocked({ meta: { lockedAt: 123 } })).toBe(true);
    expect(isLocked({ meta: { lockedAt: null } }, new Set(['팀A|팀B']))).toBe(true);
    expect(isLocked({ meta: { lockedAt: null } }, new Set())).toBe(false);
    expect(isLocked(null)).toBe(false);
  });
});

describe('cupIdOf / normalizeTeamName / cleanPlayerName', () => {
  it('safeKey 위임: RTDB 금지문자 → _, trim', () => {
    expect(cupIdOf('  마스터스컵 2026 ')).toBe('마스터스컵 2026');
    expect(cupIdOf('a.b#c$d/e[f]')).toBe('a_b_c_d_e_f_');
  });
  it('빈 값·| 는 throw', () => {
    expect(() => cupIdOf('   ')).toThrow('대회명을 입력하세요');
    expect(() => cupIdOf('a|b')).toThrow('대회명에 | 는 쓸 수 없습니다');
  });
  it('팀명·선수명 정규화', () => {
    expect(normalizeTeamName(' 팀 승훈 ')).toBe('팀승훈');
    expect(cleanPlayerName(' 홍길동 ★ ')).toBe('홍길동');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/__tests__/cupEntity.test.js`
Expected: FAIL — `Failed to resolve import "../cup/cupEntity"`.

- [ ] **Step 3: Write the implementation**

```js
// src/utils/cup/cupEntity.js
// 대회(컵) 엔티티의 순수 로직 — 스펙 §3·§4.2·§4.5. firebase 를 import 하지 않는다(테스트·vite-node 양쪽에서 쓰인다).
import { safeKey } from '../../services/rtdbPath';
import { stripNameDecorations } from '../../services/appSync';

export const MIN_TEAMS = 3;
export const MAX_TEAMS = 8;

// RESTORE_STATE 와 같은 규칙: 구버전 "팀 X"(공백 포함) → "팀X". 로그_매치 행의 팀 이름과 엔티티가 어긋나지 않게 한다.
export function normalizeTeamName(name) {
  return String(name ?? '').trim().replace(/^팀 /, '팀');
}

export function cleanPlayerName(name) {
  return stripNameDecorations(String(name ?? '').trim()).trim();
}

// 대회 식별자 = tournament_id = 화면 이름. 생성 후 불변. safeKey 에 위임해 이중 구현을 막는다.
export function cupIdOf(name) {
  const trimmed = String(name ?? '').trim();
  if (!trimmed) throw new Error('대회명을 입력하세요');
  if (trimmed.includes('|')) throw new Error('대회명에 | 는 쓸 수 없습니다'); // 아카이브 summary 구분자
  const id = safeKey(trimmed, '');
  if (!id) throw new Error('대회명을 입력하세요');
  return id;
}

function toArray(v) {
  if (Array.isArray(v)) return v;
  if (v && typeof v === 'object') return Object.values(v);
  return [];
}

// RTDB 원본 → Cup. meta 가 없거나 풋살이 아니면 null(축구 대회 모드의 cache/activeGame 노드는 여기서 걸러진다).
export function normalizeCup(cupId, raw) {
  if (!raw || typeof raw !== 'object' || !raw.meta || raw.meta.sport !== '풋살') return null;
  const m = raw.meta;
  const meta = {
    id: cupId,
    name: m.name || cupId,
    sport: '풋살',
    format: m.format || 'league1',
    status: m.status === 'finished' ? 'finished' : 'active',
    createdAt: m.createdAt ?? 0,
    createdBy: m.createdBy || '',
    updatedAt: m.updatedAt ?? 0,
    lockedAt: m.lockedAt ?? null,
  };
  const teams = Object.entries(raw.teams || {})
    .map(([key, t]) => ({
      id: (t && t.id) || key,
      name: t?.name || '',
      captain: t?.captain || '',
      players: toArray(t?.players).filter(p => typeof p === 'string' && p),
      order: Number.isFinite(t?.order) ? t.order : 0,
    }))
    .sort((a, b) => a.order - b.order);
  return { meta, teams };
}

// 팀 배열 검증 + 정규화 사본. 저장은 ok 일 때만(스펙 §4.5).
export function validateTeams(teams) {
  const errors = [];
  const list = Array.isArray(teams) ? teams : [];
  const normalized = list.map((t, i) => ({
    id: t?.id,
    name: normalizeTeamName(t?.name),
    captain: cleanPlayerName(t?.captain),
    players: toArray(t?.players).map(cleanPlayerName).filter(Boolean),
    order: Number.isFinite(t?.order) ? t.order : i,
  }));
  if (normalized.length < MIN_TEAMS || normalized.length > MAX_TEAMS) errors.push('팀은 3~8개여야 합니다');
  const seenNames = new Set();
  const owner = new Map();
  for (const t of normalized) {
    if (!t.id) errors.push(`팀 id 가 없습니다: ${t.name || '(이름 없음)'}`);
    if (!t.name) errors.push('팀명이 비어 있습니다');
    else {
      if (t.name.includes('|')) errors.push(`팀명에 | 는 쓸 수 없습니다: ${t.name}`);
      if (seenNames.has(t.name)) errors.push(`팀명 중복: ${t.name}`);
      seenNames.add(t.name);
    }
    if (t.players.length === 0) errors.push(`${t.name || '(이름 없음)'}: 팀원이 없습니다`);
    for (const p of t.players) {
      if (owner.has(p) && owner.get(p) !== t.name) errors.push(`${p}: 두 팀에 있습니다(${owner.get(p)}, ${t.name})`);
      else owner.set(p, t.name);
    }
    if (t.captain && !t.players.includes(t.captain)) errors.push(`${t.name}: 팀장 ${t.captain} 이(가) 팀원에 없습니다`);
  }
  return { ok: errors.length === 0, errors, teams: normalized };
}

// 팀 id: 기존 최대 번호+1. 삭제된 번호는 재사용하지 않는다(로그·화면의 혼동 방지).
export function nextTeamId(teams) {
  let max = 0;
  for (const t of teams || []) {
    const m = /^t(\d+)$/.exec(t?.id || '');
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `t${max + 1}`;
}

// 잠금: 첫 컵 마감이 기록한 lockedAt(2단계) 또는 로그에서 파생한 치른 대진(3단계) 중 하나라도 있으면.
export function isLocked(cup, playedPairs = new Set()) {
  return !!(cup?.meta?.lockedAt) || (playedPairs?.size ?? 0) > 0;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/utils/__tests__/cupEntity.test.js`
Expected: PASS (13 tests).

- [ ] **Step 5: Commit**

```bash
git add src/utils/cup/cupEntity.js src/utils/__tests__/cupEntity.test.js
git commit -m "feat(cup): 대회 엔티티 순수 로직 — normalizeCup·validateTeams·nextTeamId·isLocked·cupIdOf (스펙 §3·§4.2·§4.5)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01AqpBTxNBiezjumZN5AzJ6D"
```

---

### Task 2: 컵 대진 `generateCupRounds`

**Files:**
- Create: `src/utils/cup/cupSchedule.js`
- Test: `src/utils/__tests__/cupSchedule.test.js`

**Interfaces:**
- Consumes: `generateRoundRobin`, `generate5Team2Court`, `generate7Team2Court` (`src/utils/brackets.js`).
- Produces: `generateCupRounds(teamCount, courtCount) → Array<{ matches: Array<[home, away]> }>` (팀 인덱스 0..N-1), `courtCountFor(teamCount) → 1|2`.

- [ ] **Step 1: Write the failing test**

```js
// src/utils/__tests__/cupSchedule.test.js
// 스펙 §6.3 불변식 5 — 풀리그 1회전: 모든 팀 수에서 각 쌍 정확히 1회, 라운드 안 팀 중복 없음, 라운드당 경기 ≤ 구장 수.
import { describe, it, expect } from 'vitest';
import { generateCupRounds, courtCountFor } from '../cup/cupSchedule';

function audit(rounds, N, c) {
  const pairs = new Map();
  for (const r of rounds) {
    expect(r.matches.length).toBeGreaterThan(0);
    expect(r.matches.length).toBeLessThanOrEqual(c);
    const seen = new Set();
    for (const [h, a] of r.matches) {
      expect(h).not.toBe(a);
      expect(seen.has(h) || seen.has(a)).toBe(false);
      seen.add(h); seen.add(a);
      const k = [h, a].sort((x, y) => x - y).join('|');
      pairs.set(k, (pairs.get(k) || 0) + 1);
    }
  }
  expect(pairs.size).toBe(N * (N - 1) / 2);
  for (const v of pairs.values()) expect(v).toBe(1);
}

describe('courtCountFor', () => {
  it('3팀 이하 1구장, 4팀 이상 2구장', () => {
    expect(courtCountFor(3)).toBe(1);
    expect(courtCountFor(4)).toBe(2);
    expect(courtCountFor(8)).toBe(2);
  });
});

describe('generateCupRounds', () => {
  for (const N of [3, 4, 5, 6, 7, 8]) {
    it(`N=${N}: 각 쌍 1회·라운드 내 중복 없음·구장 수 이하`, () => {
      const c = courtCountFor(N);
      audit(generateCupRounds(N, c), N, c);
    });
  }
  it('N=5 는 손수 짠 5라운드 표(각 라운드 2경기)', () => {
    const r = generateCupRounds(5, 2);
    expect(r).toHaveLength(5);
    expect(r.every(x => x.matches.length === 2)).toBe(true);
  });
  it('N=7 은 손수 짠 11라운드 표(연속 휴식 최소)', () => {
    expect(generateCupRounds(7, 2)).toHaveLength(11);
  });
  it('N=4 는 3라운드 × 2경기, N=3(1구장)은 3라운드 × 1경기', () => {
    expect(generateCupRounds(4, 2).map(r => r.matches.length)).toEqual([2, 2, 2]);
    expect(generateCupRounds(3, 1).map(r => r.matches.length)).toEqual([1, 1, 1]);
  });
  it('범위 밖 팀 수는 throw', () => {
    expect(() => generateCupRounds(2, 1)).toThrow('팀은 3~8개여야 합니다');
    expect(() => generateCupRounds(9, 2)).toThrow('팀은 3~8개여야 합니다');
  });
  it('반환 배열은 호출마다 새 객체(호출부가 변형해도 표가 안 바뀜)', () => {
    const a = generateCupRounds(5, 2); a[0].matches.push([9, 9]);
    expect(generateCupRounds(5, 2)[0].matches).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/__tests__/cupSchedule.test.js`
Expected: FAIL — 모듈 없음.

- [ ] **Step 3: Write the implementation**

```js
// src/utils/cup/cupSchedule.js
// 컵 대진(풀리그 1회전) — 스펙 §6.3. 3단계에서 collectPlayedPairs / calcRemainingRounds 가 이 파일에 추가된다.
import { generateRoundRobin, generate5Team2Court, generate7Team2Court } from '../brackets';
import { MIN_TEAMS, MAX_TEAMS } from './cupEntity';

export function courtCountFor(teamCount) {
  return teamCount <= 3 ? 1 : 2;
}

// 반환 형식은 기존 schedule 과 같다: [{ matches: [[homeIdx, awayIdx], ...] }, ...]
// N=5·7 은 손수 짠 표가 더 좋다(5: 앞 5라운드가 정확히 10쌍, 7: 11라운드·연속 휴식 최소). 나머지는 circle method 를 구장 수로 잘라 쓴다.
export function generateCupRounds(teamCount, courtCount = courtCountFor(teamCount)) {
  const N = Number(teamCount);
  if (!Number.isInteger(N) || N < MIN_TEAMS || N > MAX_TEAMS) throw new Error('팀은 3~8개여야 합니다');
  const c = Math.max(1, Number(courtCount) || 1);
  if (N === 5 && c === 2) return clone(generate5Team2Court().slice(0, 5));
  if (N === 7 && c === 2) return clone(generate7Team2Court());
  const rr = generateRoundRobin(Array.from({ length: N }, (_, i) => i));
  const out = [];
  for (const round of rr) {
    for (let i = 0; i < round.length; i += c) out.push({ matches: round.slice(i, i + c).map(([h, a]) => [h, a]) });
  }
  return out;
}

function clone(rounds) {
  return rounds.map(r => ({ matches: r.matches.map(([h, a]) => [h, a]) }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/__tests__/cupSchedule.test.js src/utils/__tests__/brackets.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/utils/cup/cupSchedule.js src/utils/__tests__/cupSchedule.test.js
git commit -m "feat(cup): 풀리그 1회전 대진 generateCupRounds — 5·7팀은 기존 표, 그 외 라운드로빈 패킹 (스펙 §6.3)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01AqpBTxNBiezjumZN5AzJ6D"
```

---

### Task 3: RTDB 서비스 `cupSync.js`

**Files:**
- Create: `src/services/cupSync.js`
- Test: `src/services/__tests__/cupSync.test.js`

**Interfaces:**
- Consumes: `normalizeCup`, `cupIdOf` (Task 1), `safeTeam` (`rtdbPath`), `firebase/database` `ref/get/set/update/remove`, `firebaseDb`.
- Produces (모두 async, 실패는 throw):
  - `listCups(team) → Cup[]` (풋살 대회만, `createdAt` 내림차순)
  - `loadCup(team, cupId) → Cup|null`
  - `createCup(team, { name, createdBy }) → Cup` (중복 throw)
  - `saveTeams(team, cupId, teams) → void` (teams 노드 통째 교체, `meta/updatedAt`)
  - `setStatus(team, cupId, status)`, `markLocked(team, cupId)`, `deleteCup(team, cupId)` (`lockedAt` 있으면 throw)
  - `cupPath(team, cupId)`(테스트·디버깅용 export)

- [ ] **Step 1: Write the failing test**

```js
// src/services/__tests__/cupSync.test.js
// 스펙 §4.2 — RTDB tournaments/{team}/{cupId} CRUD. firebase/database 를 경로 트리 in-memory 로 대체한다.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({ db: {}, denyWrite: false }));

function segs(path) { return path.split('/').filter(Boolean); }
function getAt(obj, path) { let cur = obj; for (const s of segs(path)) { if (cur == null || typeof cur !== 'object') return undefined; cur = cur[s]; } return cur; }
function setAt(obj, path, value) {
  const p = segs(path); let cur = obj;
  for (let i = 0; i < p.length - 1; i++) { if (cur[p[i]] == null || typeof cur[p[i]] !== 'object') cur[p[i]] = {}; cur = cur[p[i]]; }
  if (value === null || value === undefined) delete cur[p[p.length - 1]]; else cur[p[p.length - 1]] = JSON.parse(JSON.stringify(value));
}

vi.mock('../../config/firebase', () => ({ firebaseDb: {} }));
vi.mock('firebase/database', () => ({
  ref: (_db, path) => ({ path }),
  get: async (r) => { const v = getAt(h.db, r.path); return { exists: () => v !== undefined, val: () => (v === undefined ? null : v) }; },
  set: async (r, value) => { if (h.denyWrite) throw new Error('PERMISSION_DENIED'); setAt(h.db, r.path, value); },
  update: async (r, patch) => { if (h.denyWrite) throw new Error('PERMISSION_DENIED'); for (const [k, v] of Object.entries(patch)) setAt(h.db, `${r.path}/${k}`, v); },
  remove: async (r) => { if (h.denyWrite) throw new Error('PERMISSION_DENIED'); setAt(h.db, r.path, null); },
  serverTimestamp: () => ({ __sv: true }),
}));

import CupSync, { cupPath } from '../cupSync';

beforeEach(() => { h.db = {}; h.denyWrite = false; });

const TEAM = '마스터FC';

describe('cupPath', () => {
  it('tournaments/{safeTeam}/{cupId}', () => {
    expect(cupPath('마스터.FC', 'c1')).toBe('tournaments/마스터_FC/c1');
  });
});

describe('createCup / loadCup / listCups', () => {
  it('생성 → meta 가 저장되고 다시 읽힌다(teams 없음 → [])', async () => {
    const cup = await CupSync.createCup(TEAM, { name: ' 마스터스컵 2026 ', createdBy: '홍길동' });
    expect(cup.meta.id).toBe('마스터스컵 2026');
    expect(cup.meta.status).toBe('active');
    const loaded = await CupSync.loadCup(TEAM, '마스터스컵 2026');
    expect(loaded.meta.createdBy).toBe('홍길동');
    expect(loaded.teams).toEqual([]);
  });
  it('같은 이름은 throw, | 는 throw', async () => {
    await CupSync.createCup(TEAM, { name: '컵A', createdBy: '' });
    await expect(CupSync.createCup(TEAM, { name: '컵A', createdBy: '' })).rejects.toThrow('이미 있습니다');
    await expect(CupSync.createCup(TEAM, { name: 'a|b', createdBy: '' })).rejects.toThrow('| 는 쓸 수 없습니다');
  });
  it('listCups 는 풋살 대회만 createdAt 내림차순, 축구 대회 모드 노드는 제외', async () => {
    h.db = { tournaments: { 마스터FC: {
      old: { meta: { id: 'old', name: 'old', sport: '풋살', status: 'finished', createdAt: 1 } },
      neu: { meta: { id: 'neu', name: 'neu', sport: '풋살', status: 'active', createdAt: 2 } },
      soccer_t: { cache: { schedule: '[]' }, activeGame: null },
    } } };
    const list = await CupSync.listCups(TEAM);
    expect(list.map(c => c.meta.id)).toEqual(['neu', 'old']);
  });
  it('없는 대회는 null, 팀 노드 자체가 없으면 빈 목록', async () => {
    expect(await CupSync.loadCup(TEAM, '없음')).toBeNull();
    expect(await CupSync.listCups(TEAM)).toEqual([]);
  });
});

describe('saveTeams / setStatus / markLocked / deleteCup', () => {
  beforeEach(async () => { await CupSync.createCup(TEAM, { name: '컵', createdBy: '' }); });
  it('saveTeams 는 id 키로 통째 교체(삭제된 팀은 사라짐), updatedAt 갱신', async () => {
    await CupSync.saveTeams(TEAM, '컵', [
      { id: 't1', name: '팀A', captain: 'a', players: ['a', 'b'], order: 0 },
      { id: 't2', name: '팀B', captain: '', players: ['c'], order: 1 },
    ]);
    let cup = await CupSync.loadCup(TEAM, '컵');
    expect(cup.teams.map(t => t.name)).toEqual(['팀A', '팀B']);
    await CupSync.saveTeams(TEAM, '컵', [{ id: 't2', name: '팀B', captain: '', players: ['c'], order: 0 }]);
    cup = await CupSync.loadCup(TEAM, '컵');
    expect(cup.teams.map(t => t.id)).toEqual(['t2']);
    expect(cup.meta.updatedAt).toBeGreaterThan(0);
  });
  it('id 없는 팀은 throw(저장 전에 막는다)', async () => {
    await expect(CupSync.saveTeams(TEAM, '컵', [{ name: '팀A', players: ['a'] }])).rejects.toThrow('팀 id');
  });
  it('setStatus / markLocked(멱등) / deleteCup(잠기면 throw)', async () => {
    await CupSync.setStatus(TEAM, '컵', 'finished');
    expect((await CupSync.loadCup(TEAM, '컵')).meta.status).toBe('finished');
    await CupSync.markLocked(TEAM, '컵');
    const first = (await CupSync.loadCup(TEAM, '컵')).meta.lockedAt;
    expect(first).toBeGreaterThan(0);
    await CupSync.markLocked(TEAM, '컵');
    expect((await CupSync.loadCup(TEAM, '컵')).meta.lockedAt).toBe(first); // 유지
    await expect(CupSync.deleteCup(TEAM, '컵')).rejects.toThrow('잠긴 대회');
  });
  it('잠기지 않은 대회는 삭제되어 노드가 사라진다', async () => {
    await CupSync.deleteCup(TEAM, '컵');
    expect(await CupSync.loadCup(TEAM, '컵')).toBeNull();
  });
  it('권한 거부는 그대로 throw(조용히 삼키지 않는다)', async () => {
    h.denyWrite = true;
    await expect(CupSync.saveTeams(TEAM, '컵', [{ id: 't1', name: '팀A', players: ['a'], order: 0 }])).rejects.toThrow('PERMISSION_DENIED');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/services/__tests__/cupSync.test.js`
Expected: FAIL — 모듈 없음.

- [ ] **Step 3: Write the implementation**

```js
// src/services/cupSync.js
// 컵 대회 엔티티 RTDB CRUD — 스펙 §4.2. 경로 tournaments/{safeTeam}/{cupId}/{meta,teams}.
// 축구 대회 모드가 같은 최상위 경로 아래 {id}/cache·activeGame 을 쓰지만 자식 이름이 다르고,
// listCups 는 meta.sport==='풋살' 인 자식만 대회로 본다. 모든 쓰기 실패는 throw — 화면이 alert 로 보여준다.
// 배포 전제: RTDB 규칙에 tournaments 최상위 읽기/쓰기 허용(스펙 §4.2·§12).
import { ref, get, set, update, remove } from 'firebase/database';
import { firebaseDb } from '../config/firebase';
import { safeTeam } from './rtdbPath';
import { normalizeCup, cupIdOf } from '../utils/cup/cupEntity';

export function cupPath(team, cupId) {
  return `tournaments/${safeTeam(team)}/${cupId}`;
}
function teamBase(team) {
  return `tournaments/${safeTeam(team)}`;
}

const CupSync = {
  async listCups(team) {
    const snap = await get(ref(firebaseDb, teamBase(team)));
    const val = snap.val() || {};
    return Object.entries(val)
      .map(([id, raw]) => normalizeCup(id, raw))
      .filter(Boolean)
      .sort((a, b) => (b.meta.createdAt || 0) - (a.meta.createdAt || 0));
  },

  async loadCup(team, cupId) {
    if (!cupId) return null;
    const snap = await get(ref(firebaseDb, cupPath(team, cupId)));
    return normalizeCup(cupId, snap.val());
  },

  async createCup(team, { name, createdBy }) {
    const id = cupIdOf(name);
    const existing = await get(ref(firebaseDb, cupPath(team, id)));
    if (existing.exists()) throw new Error(`같은 이름의 대회가 이미 있습니다: ${id}`);
    const now = Date.now();
    const meta = { id, name: id, sport: '풋살', format: 'league1', status: 'active', createdAt: now, createdBy: createdBy || '', updatedAt: now };
    await set(ref(firebaseDb, cupPath(team, id)), { meta });
    return normalizeCup(id, { meta });
  },

  // teams 노드 통째 교체 — 삭제된 팀은 사라진다. 검증은 호출 전 validateTeams(스펙 §4.5).
  async saveTeams(team, cupId, teams) {
    const obj = {};
    for (const t of teams || []) {
      if (!t || !t.id) throw new Error(`팀 id 가 없습니다: ${t?.name || '(이름 없음)'}`);
      obj[t.id] = { id: t.id, name: t.name, captain: t.captain || '', players: Array.isArray(t.players) ? t.players : [], order: Number.isFinite(t.order) ? t.order : 0 };
    }
    await update(ref(firebaseDb, cupPath(team, cupId)), { teams: obj, 'meta/updatedAt': Date.now() });
  },

  async setStatus(team, cupId, status) {
    const s = status === 'finished' ? 'finished' : 'active';
    await update(ref(firebaseDb, cupPath(team, cupId)), { 'meta/status': s, 'meta/updatedAt': Date.now() });
  },

  // 첫 컵 마감 성공 시 App 이 호출. 이미 잠겨 있으면 유지(멱등).
  async markLocked(team, cupId) {
    const snap = await get(ref(firebaseDb, `${cupPath(team, cupId)}/meta/lockedAt`));
    if (snap.exists() && snap.val()) return;
    await update(ref(firebaseDb, cupPath(team, cupId)), { 'meta/lockedAt': Date.now(), 'meta/updatedAt': Date.now() });
  },

  async deleteCup(team, cupId) {
    const cup = await this.loadCup(team, cupId);
    if (cup?.meta?.lockedAt) throw new Error('잠긴 대회는 삭제할 수 없습니다(경기 기록이 있습니다)');
    await remove(ref(firebaseDb, cupPath(team, cupId)));
  },
};

export default CupSync;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/services/__tests__/cupSync.test.js`
Expected: PASS (10 tests).

- [ ] **Step 5: Commit**

```bash
git add src/services/cupSync.js src/services/__tests__/cupSync.test.js
git commit -m "feat(cup): RTDB 대회 엔티티 서비스 cupSync — list/load/create/saveTeams/setStatus/markLocked/delete (스펙 §4.2)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01AqpBTxNBiezjumZN5AzJ6D"
```

---

### Task 4: `getCupSettings` + 진행중 라벨 🏆

**Files:**
- Modify: `src/config/settings.js` (`getEffectiveSettings` 함수 바로 아래에 추가), `src/utils/pendingGameLabel.js`
- Test: `src/config/__tests__/settings.test.js` (케이스 추가), `src/utils/__tests__/pendingGameLabel.test.js` (케이스 추가)

**Interfaces:**
- Produces: `getCupSettings(team) → effective settings`(표준 규칙 + 팀 shared + `_meta.cup === true`); `pendingGameProgressLabel(gs)`가 컵 세션이면 `🏆 ` 접두.

- [ ] **Step 1: Write the failing tests**

`src/config/__tests__/settings.test.js` 파일 끝에 추가(이 파일의 기존 import 줄에 `getCupSettings`를 추가한다; 기존 테스트가 `_setCacheForTest`를 쓰면 그대로 활용):

```js
import { getCupSettings, _setCacheForTest, SPORT_DEFAULTS } from '../settings';

describe('getCupSettings (스펙 §4.3)', () => {
  it('팀 프리셋·오버라이드(자책 -2, 크로바/고구마)는 무시하고 표준 규칙 + shared 시트 설정만 남긴다', () => {
    _setCacheForTest({ '마스터FC': {
      shared: { sheetId: 'SID', attendanceSheet: '참석명단', dashboardSheet: '대시보드', pointLogSheet: '마스터FC 포인트 로그', playerLogSheet: '마스터FC 선수별집계기록 로그' },
      풋살: { preset: '마스터FC풋살', overrides: { ownGoalPoint: -2, useCrovaGoguma: true, bonusMultiplier: 2 } },
    } });
    const s = getCupSettings('마스터FC');
    expect(s.sheetId).toBe('SID');
    expect(s.pointLogSheet).toBe('마스터FC 포인트 로그');
    expect(s.ownGoalPoint).toBe(SPORT_DEFAULTS.풋살.ownGoalPoint);
    expect(s.useCrovaGoguma).toBe(false);
    expect(s.bonusMultiplier).toBe(1);
    expect(s._meta).toEqual({ preset: null, sport: '풋살', team: '마스터FC', cup: true });
  });
});
```
(`_setCacheForTest`가 팀 데이터 객체를 통째로 받는 형태인지 `settings.js:218` 근처에서 확인하고, 기존 테스트가 쓰는 호출 형식을 그대로 따른다.)

`src/utils/__tests__/pendingGameLabel.test.js` 파일 끝에 추가:

```js
describe('컵 세션 라벨 (스펙 §6.1)', () => {
  it('tournamentId 가 있으면 🏆 접두, 나머지 동일', () => {
    const gs = { matchMode: 'schedule', schedule: [{}, {}, {}], currentRoundIdx: 1, tournamentId: '마스터스컵 2026' };
    expect(pendingGameProgressLabel(gs)).toBe('🏆 2/3 라운드');
    expect(pendingGameProgressLabel({ ...gs, tournamentId: '' })).toBe('2/3 라운드');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/config/__tests__/settings.test.js src/utils/__tests__/pendingGameLabel.test.js`
Expected: `getCupSettings` import 실패 / 라벨에 🏆 없음.

- [ ] **Step 3: Implement**

`src/config/settings.js` — `getEffectiveSettings` 함수 바로 아래에 추가:

```js
// 컵 세션 규칙 스냅샷(스펙 §4.3): getEffectiveSettings 를 거쳐 캐시 하이드레이션·shared(sheetId·시트명)를 받고,
// 규칙 키는 SPORT_DEFAULTS.풋살 로 되돌린다(팀 프리셋·오버라이드 미적용: 자책 -1, 크로바/고구마 꺼짐, 보너스 1배).
// 새 프리셋·설정 키를 만들지 않는다.
export function getCupSettings(team) {
  const eff = getEffectiveSettings(team, "풋살");
  return { ...eff, ...SPORT_DEFAULTS.풋살, _meta: { preset: null, sport: "풋살", team, cup: true } };
}
```

`src/utils/pendingGameLabel.js` — 함수 본문 첫 줄 `const g = gs || {};` 다음에 컵 접두를 계산하고 모든 return 앞에 붙인다. 가장 단순한 형태로 기존 함수를 감싼다:

```js
import { countFinishedSoccerMatches } from './soccerScoring';
import { isCupSession } from './cup/cupSession';

// 대시보드 "진행중인 경기" 목록에서 각 경기의 진행도 요약 라벨을 만든다.
// 모드별로 완료 매치/경기를 세는 소스 필드가 다르므로 단일 지점에서 분기한다:
//   - 축구(soccer): soccerMatches 중 status === "finished" (휴식 경기 포함 — 인앱 헤더 finishedCount와 동일).
//                    축구 state엔 completedMatches가 없어(빈 배열) 이 필드로 세면 항상 0이 되는 버그가 있었다.
//   - 풋살 대진표(schedule): 라운드 진행도(현재/전체).
//   - 풋살 자유대진/밀어내기(free/push) 및 폴백: completedMatches 길이.
// 컵 세션(스펙 §6.1)은 🏆 접두를 붙여 정규 세션과 구분한다.
function baseLabel(g) {
  if (g.matchMode === "soccer") {
    return `${countFinishedSoccerMatches(g.soccerMatches)}경기 완료`;
  }
  const totalRounds = (g.schedule || []).length;
  if (g.matchMode === "schedule" && totalRounds > 0) {
    const curRound = (g.currentRoundIdx || 0) + 1;
    return `${curRound}/${totalRounds} 라운드`;
  }
  const completedCount = (g.completedMatches || []).length;
  return `${completedCount}매치 완료`;
}

export function pendingGameProgressLabel(gs) {
  const g = gs || {}; // undefined/null 모두 방어 (호출부 game.state가 비어있을 수 있음)
  const label = baseLabel(g);
  return isCupSession(g) ? `🏆 ${label}` : label;
}
```
(기존 파일의 본문·주석을 위 형태로 재구성한다. `countFinishedSoccerMatches` import 는 그대로.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/config/__tests__ src/utils/__tests__/pendingGameLabel.test.js`
Expected: PASS(기존 케이스 포함).

- [ ] **Step 5: Commit**

```bash
git add src/config/settings.js src/config/__tests__/settings.test.js src/utils/pendingGameLabel.js src/utils/__tests__/pendingGameLabel.test.js
git commit -m "feat(cup): 컵 규칙 스냅샷 getCupSettings(표준 규칙+shared) + 진행중 경기 🏆 라벨 (스펙 §4.3·§6.1)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01AqpBTxNBiezjumZN5AzJ6D"
```

---

### Task 5: Root `gameParams` + App 컵 로드 분기·배너·markLocked (원자 커밋)

**Files:**
- Modify: `src/Root.jsx` (`gameMode` state 근처, `handleStartNew`, `handleContinue`, `<GameApp …>` render의 `onBackToMenu`)
- Modify: `src/App.jsx` (props 시그니처 `:35`, import, `_loadAllData`, `dataLoading` 화면 뒤 에러 화면, 4개 phase 배너, `handleFinalize` 컵 분기)
- Test: `src/components/__tests__/cupWiring.guard.test.js` (신규, 정적 가드) — 렌더 하네스 없음(스펙 불변식 13)

**Interfaces:**
- Consumes: `CupSync.loadCup`·`markLocked` (Task 3), `validateTeams` (Task 1), `generateCupRounds`·`courtCountFor` (Task 2), `getCupSettings` (Task 4), `isCupSession` (1단계), `TEAM_COLORS` (`config/constants`, App에 이미 import됨).
- Produces: `onStartGame('cup', { cupId })` → App이 그 대회 팀으로 `phase:'match'` 진입; 실패 시 에러 화면; 모든 phase 상단 🏆 배너; 컵 마감 성공 시 `markLocked`.

- [ ] **Step 1: Write the failing static guard**

```js
// src/components/__tests__/cupWiring.guard.test.js
// 스펙 §10 불변식 13 — 렌더 하네스가 없는 Root/App/TeamDashboard 배선을 정적으로 고정한다.
// (a) Root 가 gameParams 를 들고 GameApp 에 넘기며 두 곳에서 초기화한다. (b) App 컵 분기가 gameParams.cupId 를 쓴다.
// (c) TeamDashboard 는 tournament 탭을 종목으로 분기한다(Task 8 에서 통과).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel) => fs.readFileSync(path.join(SRC, rel), 'utf8');

describe('Root.jsx — gameParams 배선', () => {
  const src = read('Root.jsx');
  it('state·시그니처·GameApp 전달', () => {
    expect(src).toMatch(/const \[gameParams, setGameParams\] = useState\(null\)/);
    expect(src).toMatch(/const handleStartNew = async \(mode, params = null\)/);
    expect(src).toMatch(/setGameParams\(params\)/);
    expect(src).toMatch(/gameParams=\{gameParams\}/);
  });
  it('이어서 기록·뒤로가기에서 초기화(2곳 이상)', () => {
    expect((src.match(/setGameParams\(null\)/g) || []).length).toBeGreaterThanOrEqual(2);
  });
});

describe('App.jsx — 컵 로드 분기·배너·markLocked', () => {
  const src = read('App.jsx');
  it('gameParams prop 을 받고 컵 분기에서 cupId 를 쓴다', () => {
    expect(src).toMatch(/export default function App\(\{[^}]*gameParams[^}]*\}\)/);
    expect(src).toMatch(/gameMode === "cup"/);
    expect(src).toMatch(/gameParams\?\.cupId/);
  });
  it('컵 세션 배너와 마감 후 markLocked', () => {
    expect(src).toMatch(/CupSync\.markLocked\(/);
    expect((src.match(/\{cupBanner\}/g) || []).length).toBeGreaterThanOrEqual(4);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/components/__tests__/cupWiring.guard.test.js`
Expected: FAIL (Root·App 케이스 모두).

- [ ] **Step 3: Root.jsx**

1. `const [gameMode, setGameMode] = useState(null);` 바로 아래에 추가:
```js
  // 세션 진입 파라미터(컵: { cupId }). 신규 세션 진입 시점에만 의미 있고 저장되지 않는다(스펙 §6.2).
  const [gameParams, setGameParams] = useState(null);
```
2. `const handleStartNew = async (mode) => {` → `const handleStartNew = async (mode, params = null) => {`, 그 안 `setGameMode(mode);` 다음 줄에 `setGameParams(params);`.
3. `handleContinue` 안 `setGameMode(null);` 다음 줄에 `setGameParams(null);`.
4. `<GameApp … gameMode={gameMode} gameId={activeGameId}` → `gameMode={gameMode} gameParams={gameParams} gameId={activeGameId}`; 같은 줄의 `onBackToMenu={() => { setIsNewGame(false); setGameMode(null); setActiveGameId(null);` → `onBackToMenu={() => { setIsNewGame(false); setGameMode(null); setGameParams(null); setActiveGameId(null);`.

- [ ] **Step 4: App.jsx — import·prop·로드 분기·에러 화면**

imports(`import { isCupSession, logTagsOf } from './utils/cup/cupSession';` 아래):
```js
import CupSync from './services/cupSync';
import { validateTeams } from './utils/cup/cupEntity';
import { generateCupRounds, courtCountFor } from './utils/cup/cupSchedule';
```
`getSettings, getEffectiveSettings` import 줄에 `getCupSettings` 추가.

시그니처: `export default function App({ authUser, teamContext, isNewGame, gameMode, gameId, onLogout, onBackToMenu }) {` → `export default function App({ authUser, teamContext, isNewGame, gameMode, gameParams, gameId, onLogout, onBackToMenu }) {`

`const [state, dispatch] = useGameReducer();` 다음 줄에:
```js
  // 컵 세션 로드 실패 사유(스펙 §6.2 3·6항). phase 는 setup 에 머물러 자동저장되지 않는다.
  const [cupLoadError, setCupLoadError] = useState(null);
```

`_loadAllData` 안, 기존
```js
    if (gameMode === "sheetSync") {
      loadPromises.push(
        fetchAttendanceData().catch(err => { console.warn("참석명단 로딩 실패:", err.message); return null; })
      );
    }
```
바로 아래에 추가:
```js
    if (gameMode === "cup") {
      // 3번째 자리는 참석명단(sheetSync 전용) — 컵은 비워 두고 4번째에 대회를 싣는다.
      loadPromises.push(Promise.resolve(null));
      loadPromises.push(
        CupSync.loadCup(teamContext.team, gameParams?.cupId)
          .then(cup => (cup ? { ok: true, cup } : { ok: false, reason: '대회를 찾을 수 없습니다' }))
          .catch(err => ({ ok: false, reason: err?.message || '대회 로드 실패' }))
      );
    }
```
`Promise.all(loadPromises).then(([sheetData, cumBonus, attendanceData]) => {` → `Promise.all(loadPromises).then(([sheetData, cumBonus, attendanceData, cupRes]) => {`

같은 `.then` 안, 기존 `if (gameMode === "sheetSync" && attendanceData && attendanceData.attendees.length > 0) { … }` 블록이 끝난 뒤(그 블록의 닫는 `}` 다음, `.then` 콜백이 닫히기 전)에 추가:
```js
      // ── 컵 세션(스펙 §6.2): 대회 엔티티의 팀으로 바로 match 진입. 실패는 에러 화면(세션 미생성).
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
        let sched;
        try { sched = generateCupRounds(N, cc); } catch (e) { fail(e.message); return; }
        dispatch({
          type: 'SET_FIELDS',
          fields: {
            tournamentId: cup.meta.id,
            attendees: [...new Set(cupTeams.flatMap(t => t.players))],
            teamCount: N,
            courtCount: cc,
            matchMode: "schedule",
            draftMode: "sheet",
            teams: cupTeams.map(t => [...t.players]),
            teamNames: cupTeams.map(t => t.name),
            teamColorIndices: cupTeams.map((_, i) => i % TEAM_COLORS.length),
            gks: {},
            schedule: sched,
            currentRoundIdx: 0,
            completedMatches: [],
            allEvents: [],
            isExtraRound: false,
            viewingRoundIdx: 0,
            confirmedRounds: {},
            matchModal: null,
            settingsSnapshot: getCupSettings(teamContext.team),
            phase: "match",
          },
        });
      }
```

에러 화면 — `// LOADING` 의 `if (dataLoading) { … }` 블록 바로 뒤에 추가:
```js
  // 컵 세션 로드 실패(스펙 §6.2) — 세션을 만들지 않고 대시보드로 돌려보낸다.
  if (cupLoadError) {
    return (
      <div style={{ ...s.app, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", padding: 24, textAlign: "center" }}>
        <div style={{ fontSize: 32, marginBottom: 16 }}>🏆</div>
        <div style={{ color: C.white, fontSize: 16, fontWeight: 600, marginBottom: 8 }}>컵 경기를 시작할 수 없습니다</div>
        <div style={{ color: C.gray, fontSize: 13, whiteSpace: "pre-wrap", marginBottom: 20 }}>{cupLoadError}</div>
        <button onClick={onBackToMenu} style={s.btn(C.accent, C.bg)}>대시보드로</button>
      </div>
    );
  }
```
(`s`·`C`는 이 위치에서 이미 정의돼 있다 — `const s = makeStyles(C);`가 `dataLoading` 블록보다 앞에 있다.)

배너 — `const s = makeStyles(C);` 바로 아래에 추가:
```js
  // 컵 세션 배너(스펙 §6.4): 모든 phase 상단. 판별은 isCupSession 만.
  const cupBanner = isCupSession(state) ? (
    <div style={{ margin: "0 20px 10px", padding: "8px 12px", borderRadius: 10, background: "rgba(255,149,0,0.14)", color: "var(--app-orange)", fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}>
      🏆 {state.tournamentId} <span style={{ fontWeight: 400, color: C.gray }}>· 컵대회 세션</span>
    </div>
  ) : null;
```
배너 삽입 4곳: (1) `<PhaseIndicator activeIndex={0} />` 바로 다음 줄에 `{cupBanner}`; (2) `{!teamEditMode && <PhaseIndicator activeIndex={1} />}` 바로 다음 줄; (3) `if (phase === "match") {` 블록의 `return (` 다음 `<div style={s.app}>` 바로 다음 줄; (4) `<PhaseIndicator activeIndex={3} />` 바로 다음 줄.

- [ ] **Step 5: App.jsx — 컵 마감 markLocked**

`handleFinalize`의 컵 분기(`if (isCup) { try { … } }`) 안, `set('gameFinalized', allOk);` 바로 다음 줄에 추가(정규 분기는 손대지 않는다):
```js
        // 첫 마감 성공 → 대회 잠금(스펙 §6.5). 실패해도 마감 결과는 유지하고 알림에만 덧붙인다(3단계 로그 파생 잠금이 보완).
        let lockWarn = '';
        if (allOk) {
          try { await CupSync.markLocked(team, state.tournamentId); }
          catch (e) { console.warn('[cup] markLocked 실패:', e?.message); lockWarn = `\n\n⚠️ 대회 잠금 기록 실패(${e?.message || '알 수 없음'}). 대회 탭에서 팀명·팀 수를 바꾸지 마세요.`; }
        }
```
그리고 그 분기의 성공 alert `alert(\`🏆 컵대회 기록 확정 완료!\n\n${detail}\n\n수정이 필요하면 "경기로" 버튼으로 돌아갈 수 있습니다.\`)` 끝에 `${lockWarn}`을 덧붙인다(문자열 템플릿 안, 마지막 줄 뒤).

- [ ] **Step 6: Verify**

Run: `npx vitest run src/components/__tests__/cupWiring.guard.test.js src/services/__tests__/logReaders.guard.test.js` → PASS (Root·App 케이스; TeamDashboard 케이스는 Task 8에서 추가).
Run: `npm run lint && npm run build && npm test` → 신규 에러 0, 빌드 성공, 전체 green.
Diff 정독(`git diff HEAD -- src/App.jsx`): 정규 `try` 블록 무변경, `_loadAllData`의 sheetSync 분기 무변경(추가만), 배너 4곳, 에러 화면 1곳, 컵 분기 `markLocked` 1곳.

- [ ] **Step 7: Commit (Root+App 한 커밋)**

```bash
git add src/Root.jsx src/App.jsx src/components/__tests__/cupWiring.guard.test.js
git commit -m "feat(cup): 컵 경기일 진입 — Root gameParams, App 컵 로드 분기(대회 팀으로 match 진입)·실패 화면·🏆 배너·마감 후 markLocked (스펙 §6.2·§6.4·§6.5)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01AqpBTxNBiezjumZN5AzJ6D"
```

---

### Task 6: `CupTeamEditor` (팀 관리 편집기)

**Files:**
- Create: `src/components/cup/CupTeamEditor.jsx`
- Test: `src/components/cup/__tests__/CupTeamEditor.render.test.jsx` (`act`+`createRoot` 실렌더, `TeamDashboard.render.test.jsx`와 같은 하네스)

**Interfaces:**
- Props: `{ teams: Team[], members: string[], locked: boolean, disabled: boolean, saving: boolean, onSave(teams: Team[]) }`. 내부 로컬 사본을 편집하고 저장 시 `validateTeams`를 통과한 정규화 팀 배열을 `onSave`에 넘긴다. 검증 실패는 화면에 에러 목록.
- Consumes: `validateTeams`, `nextTeamId`, `cleanPlayerName` (Task 1), `useTheme`, `XIcon`/`PlusIcon`.

- [ ] **Step 1: Write the failing render test**

```jsx
// src/components/cup/__tests__/CupTeamEditor.render.test.jsx
// 스펙 §4.5 — 팀 편집기 실렌더: 팀 추가/삭제·팀원 추가(회원·자유입력)·검증 에러·잠금 비활성·저장 payload.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { ThemeProvider } from '../../../hooks/useTheme';
import CupTeamEditor from '../CupTeamEditor';

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
    root.render(createElement(ThemeProvider, null, createElement(CupTeamEditor, props)));
  });
}
const click = async (el) => { await act(async () => { el.click(); }); };
const type = async (input, value) => {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
};
const byText = (txt) => [...container.querySelectorAll('button')].find(b => b.textContent.trim() === txt);

const TEAMS = [
  { id: 't1', name: '팀A', captain: 'a1', players: ['a1', 'a2'], order: 0 },
  { id: 't2', name: '팀B', captain: '', players: ['b1'], order: 1 },
  { id: 't3', name: '팀C', captain: '', players: ['c1'], order: 2 },
];

describe('CupTeamEditor 실렌더', () => {
  it('팀·팀원·팀장이 그려지고 저장은 정규화된 팀 배열을 넘긴다', async () => {
    const onSave = vi.fn();
    await mount({ teams: TEAMS, members: ['a1', 'a2', 'b1', 'c1', 'd1'], locked: false, disabled: false, saving: false, onSave });
    expect(container.textContent).toContain('팀A');
    expect(container.textContent).toContain('a1');
    await click(byText('저장'));
    expect(onSave).toHaveBeenCalledTimes(1);
    const saved = onSave.mock.calls[0][0];
    expect(saved.map(t => t.id)).toEqual(['t1', 't2', 't3']);
    expect(saved[0].captain).toBe('a1');
  });

  it('팀 추가 → 새 id 는 t4, 팀 삭제 후 추가해도 번호 재사용 없음', async () => {
    const onSave = vi.fn();
    await mount({ teams: TEAMS, members: [], locked: false, disabled: false, saving: false, onSave });
    await click(byText('+ 팀 추가'));
    const nameInputs = [...container.querySelectorAll('input[data-role="team-name"]')];
    expect(nameInputs).toHaveLength(4);
    await type(nameInputs[3], '팀D');
    // 새 팀에 자유 입력으로 팀원 추가
    const freeInputs = [...container.querySelectorAll('input[data-role="free-add"]')];
    await type(freeInputs[3], 'd1');
    await click([...container.querySelectorAll('button[data-role="free-add-btn"]')][3]);
    await click(byText('저장'));
    const saved = onSave.mock.calls[0][0];
    expect(saved[3].id).toBe('t4');
    expect(saved[3].players).toEqual(['d1']);
  });

  it('검증 실패(같은 선수 두 팀)는 저장하지 않고 에러를 보여준다', async () => {
    const onSave = vi.fn();
    await mount({ teams: TEAMS, members: ['a1', 'z1'], locked: false, disabled: false, saving: false, onSave });
    // 회원 후보에는 이미 배정된 a1 이 나오지 않는다(z1 만) — 자유 입력으로 팀B 에 a1 을 넣어 중복을 만든다
    expect([...container.querySelectorAll('button[data-role="member-add"]')].map(b => b.textContent.trim())).toEqual(['+ z1', '+ z1', '+ z1']);
    const freeInputs = [...container.querySelectorAll('input[data-role="free-add"]')];
    await type(freeInputs[1], 'a1');
    await click([...container.querySelectorAll('button[data-role="free-add-btn"]')][1]);
    await click(byText('저장'));
    expect(onSave).not.toHaveBeenCalled();
    expect(container.textContent).toContain('a1: 두 팀에 있습니다(팀A, 팀B)');
  });

  it('잠기면 팀명 입력·팀 추가/삭제는 비활성, 팀원 편집은 가능', async () => {
    await mount({ teams: TEAMS, members: ['z1'], locked: true, disabled: false, saving: false, onSave: vi.fn() });
    expect(container.textContent).toContain('첫 경기 마감 후 팀명·팀 수는 바꿀 수 없습니다');
    expect([...container.querySelectorAll('input[data-role="team-name"]')].every(i => i.disabled)).toBe(true);
    expect(byText('+ 팀 추가').disabled).toBe(true);
    expect([...container.querySelectorAll('button[data-role="team-remove"]')].every(b => b.disabled)).toBe(true);
    expect([...container.querySelectorAll('button[data-role="member-add"]')].some(b => !b.disabled)).toBe(true);
  });

  it('disabled(비관리자)면 저장 버튼이 없다', async () => {
    await mount({ teams: TEAMS, members: [], locked: false, disabled: true, saving: false, onSave: vi.fn() });
    expect(byText('저장')).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/components/cup/__tests__/CupTeamEditor.render.test.jsx`
Expected: FAIL — 모듈 없음.

- [ ] **Step 3: Write the component**

```jsx
// src/components/cup/CupTeamEditor.jsx
// 컵 팀 관리 편집기 — 스펙 §4.5. 로컬 사본을 편집하고 저장 시 validateTeams 를 통과한 팀 배열만 onSave 에 넘긴다.
// 잠기면(locked) 팀명·팀 추가/삭제는 비활성, 팀원·팀장은 계속 편집 가능. disabled(비관리자)면 읽기 전용.
import { useState, useMemo } from 'react';
import { useTheme } from '../../hooks/useTheme';
import { validateTeams, nextTeamId, cleanPlayerName } from '../../utils/cup/cupEntity';

export default function CupTeamEditor({ teams, members = [], locked = false, disabled = false, saving = false, onSave }) {
  const { C } = useTheme();
  // 원격 값을 useState 초기값으로 직접 쓰지 않는다 — 편집기는 열릴 때의 스냅샷을 로컬 사본으로 만든다(스펙 §4.5).
  const [draft, setDraft] = useState(() => (teams || []).map(t => ({ ...t, players: [...(t.players || [])] })));
  const [errors, setErrors] = useState([]);
  const [freeText, setFreeText] = useState({});   // teamId → 자유 입력 값
  const [search, setSearch] = useState('');

  const assigned = useMemo(() => new Set(draft.flatMap(t => t.players)), [draft]);
  const candidates = useMemo(() => {
    const q = search.trim();
    return (members || []).map(cleanPlayerName).filter(Boolean).filter(m => !assigned.has(m)).filter(m => !q || m.includes(q));
  }, [members, assigned, search]);

  const canEditStructure = !disabled && !locked;
  const canEditMembers = !disabled;

  const patchTeam = (id, patch) => setDraft(d => d.map(t => (t.id === id ? { ...t, ...patch } : t)));
  const addTeam = () => setDraft(d => [...d, { id: nextTeamId(d), name: '', captain: '', players: [], order: d.length }]);
  const removeTeam = (id) => setDraft(d => d.filter(t => t.id !== id).map((t, i) => ({ ...t, order: i })));
  const addPlayer = (id, name) => {
    const n = cleanPlayerName(name);
    if (!n) return;
    setDraft(d => d.map(t => (t.id === id && !t.players.includes(n) ? { ...t, players: [...t.players, n] } : t)));
  };
  const removePlayer = (id, name) => setDraft(d => d.map(t => (t.id === id
    ? { ...t, players: t.players.filter(p => p !== name), captain: t.captain === name ? '' : t.captain }
    : t)));

  const handleSave = () => {
    const v = validateTeams(draft);
    setErrors(v.errors);
    if (!v.ok) return;
    onSave?.(v.teams);
  };

  const card = { background: C.card, borderRadius: 14, padding: 12, border: `1px solid ${C.borderColor}`, marginBottom: 10 };
  const input = { flex: 1, minWidth: 0, padding: "8px 10px", borderRadius: 8, border: `1px solid ${C.borderColor}`, background: "var(--app-bg-elevated)", color: C.white, fontSize: 14, fontFamily: "inherit" };
  const chip = (active) => ({ display: "inline-flex", alignItems: "center", gap: 4, padding: "4px 8px", borderRadius: 999, fontSize: 12, margin: 2, background: active ? "rgba(255,149,0,0.16)" : "var(--app-bg-row)", color: active ? "var(--app-orange)" : C.white, border: "none", cursor: "pointer", fontFamily: "inherit" });
  const smallBtn = (bg, fg = "#fff") => ({ background: bg, color: fg, border: "none", borderRadius: 8, padding: "6px 10px", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" });

  return (
    <div>
      {locked && (
        <div style={{ ...card, background: "rgba(255,149,0,0.10)", color: "var(--app-orange)", fontSize: 12 }}>
          🔒 첫 경기 마감 후 팀명·팀 수는 바꿀 수 없습니다. 팀원·팀장은 수정할 수 있습니다.
        </div>
      )}
      {draft.map(t => (
        <div key={t.id} style={card}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
            <input data-role="team-name" value={t.name} disabled={!canEditStructure} placeholder="팀명"
              onChange={e => patchTeam(t.id, { name: e.target.value })} style={input} />
            <button data-role="team-remove" disabled={!canEditStructure} onClick={() => removeTeam(t.id)}
              style={{ ...smallBtn("rgba(255,59,48,0.12)", "var(--app-red)"), opacity: canEditStructure ? 1 : 0.4 }}>삭제</button>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", marginBottom: 6 }}>
            {t.players.map(p => (
              <button key={p} data-role="member-chip" disabled={!canEditMembers} title="탭: 팀장 지정 / ✕: 제외"
                onClick={() => patchTeam(t.id, { captain: t.captain === p ? '' : p })} style={chip(t.captain === p)}>
                {t.captain === p ? 'Ⓒ ' : ''}{p}
                {canEditMembers && <span data-role="member-remove" onClick={(e) => { e.stopPropagation(); removePlayer(t.id, p); }} style={{ marginLeft: 4, color: C.gray }}>✕</span>}
              </button>
            ))}
            {t.players.length === 0 && <span style={{ fontSize: 12, color: C.gray, padding: 4 }}>팀원 없음</span>}
          </div>
          {canEditMembers && (
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <input data-role="free-add" value={freeText[t.id] || ''} placeholder="이름 직접 입력"
                onChange={e => setFreeText(f => ({ ...f, [t.id]: e.target.value }))} style={input} />
              <button data-role="free-add-btn" onClick={() => { addPlayer(t.id, freeText[t.id]); setFreeText(f => ({ ...f, [t.id]: '' })); }}
                style={smallBtn(C.accent, C.bg)}>추가</button>
            </div>
          )}
          {canEditMembers && candidates.length > 0 && (
            <div style={{ marginTop: 6 }}>
              <div style={{ fontSize: 11, color: C.gray, marginBottom: 2 }}>회원에서 추가</div>
              <div style={{ display: "flex", flexWrap: "wrap" }}>
                {candidates.slice(0, 30).map(m => (
                  <button key={m} data-role="member-add" data-team={t.id} onClick={() => addPlayer(t.id, m)} style={chip(false)}>+ {m}</button>
                ))}
              </div>
            </div>
          )}
        </div>
      ))}
      {canEditMembers && (
        <input value={search} placeholder="회원 검색" onChange={e => setSearch(e.target.value)} style={{ ...input, width: "100%", marginBottom: 8 }} />
      )}
      {errors.length > 0 && (
        <div style={{ ...card, background: "rgba(255,59,48,0.10)", color: "var(--app-red)", fontSize: 12 }}>
          {errors.map((e, i) => <div key={i}>• {e}</div>)}
        </div>
      )}
      {!disabled && (
        <div style={{ display: "flex", gap: 8 }}>
          <button disabled={!canEditStructure} onClick={addTeam} style={{ ...smallBtn("var(--app-bg-row)", C.white), flex: 1, padding: 10, opacity: canEditStructure ? 1 : 0.4 }}>+ 팀 추가</button>
          <button disabled={saving} onClick={handleSave} style={{ ...smallBtn(C.green), flex: 1, padding: 10 }}>{saving ? '저장 중…' : '저장'}</button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/components/cup/__tests__/CupTeamEditor.render.test.jsx`
Expected: PASS (5 tests). 테스트가 셀렉터(`data-role`)를 못 찾으면 컴포넌트가 아니라 테스트의 셀렉터를 컴포넌트에 맞춰 고치지 말고, 컴포넌트의 `data-role`이 위 코드와 같은지 확인한다.

- [ ] **Step 5: Commit**

```bash
git add src/components/cup/CupTeamEditor.jsx src/components/cup/__tests__/CupTeamEditor.render.test.jsx
git commit -m "feat(cup): 팀 관리 편집기 CupTeamEditor — 팀 추가/삭제·팀명·팀장·회원선택/자유입력·검증·잠금 (스펙 §4.5)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01AqpBTxNBiezjumZN5AzJ6D"
```

---

### Task 7: `CupDetail` + `CupListTab` + `CupPickerModal`

**Files:**
- Create: `src/components/cup/CupDetail.jsx`, `src/components/cup/CupListTab.jsx`, `src/components/cup/CupPickerModal.jsx`
- Test: `src/components/cup/__tests__/CupListTab.render.test.jsx` (`cupSync` mock)

**Interfaces:**
- `CupListTab({ teamName, members: string[], pendingGames, isAdmin, authUserName, onStartGame, onContinueGame })` — 목록 로드(`CupSync.listCups`), 생성(`createCup`), 선택 시 `CupDetail`.
- `CupDetail({ teamName, cup, members, pendingGames, isAdmin, onStartGame, onContinueGame, onBack, onChanged })` — `onChanged()`는 저장/상태/삭제 후 목록 재로드 요청.
- `CupPickerModal({ cups, onPick(cupId), onClose })`.
- Consumes: `CupSync` (Task 3), `validateTeams`·`isLocked` (Task 1), `CupTeamEditor` (Task 6), `Modal`, `useTheme`, `isCupSession`.

- [ ] **Step 1: Write the failing render test**

```jsx
// src/components/cup/__tests__/CupListTab.render.test.jsx
// 스펙 §6.1 — 대회 목록·생성·상세(시작 버튼·이어서·잠금·삭제) 실렌더. cupSync 는 목.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { ThemeProvider } from '../../../hooks/useTheme';

const h = vi.hoisted(() => ({ cups: [], created: [], saved: [], deleted: [], status: [] }));
vi.mock('../../../services/cupSync', () => ({
  default: {
    listCups: () => Promise.resolve(h.cups),
    loadCup: (_t, id) => Promise.resolve(h.cups.find(c => c.meta.id === id) || null),
    createCup: (_t, { name }) => { const cup = { meta: { id: name, name, sport: '풋살', status: 'active', createdAt: 9, createdBy: '', updatedAt: 9, lockedAt: null }, teams: [] }; h.created.push(name); h.cups = [cup, ...h.cups]; return Promise.resolve(cup); },
    saveTeams: (_t, id, teams) => { h.saved.push({ id, teams }); const c = h.cups.find(x => x.meta.id === id); if (c) c.teams = teams; return Promise.resolve(); },
    setStatus: (_t, id, s) => { h.status.push([id, s]); const c = h.cups.find(x => x.meta.id === id); if (c) c.meta.status = s; return Promise.resolve(); },
    deleteCup: (_t, id) => { h.deleted.push(id); h.cups = h.cups.filter(c => c.meta.id !== id); return Promise.resolve(); },
    markLocked: () => Promise.resolve(),
  },
}));

import CupListTab from '../CupListTab';

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (q) => ({ matches: false, media: q, onchange: null, addListener(){}, removeListener(){}, addEventListener(){}, removeEventListener(){}, dispatchEvent(){} }),
});
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let container, root;
beforeEach(() => {
  h.cups = []; h.created = []; h.saved = []; h.deleted = []; h.status = [];
  container = document.createElement('div'); document.body.appendChild(container);
  window.confirm = () => true;
});
afterEach(() => { act(() => root?.unmount()); container.remove(); });

const T3 = [
  { id: 't1', name: '팀A', captain: '', players: ['a1'], order: 0 },
  { id: 't2', name: '팀B', captain: '', players: ['b1'], order: 1 },
  { id: 't3', name: '팀C', captain: '', players: ['c1'], order: 2 },
];
const cup = (id, extra = {}, teams = T3) => ({ meta: { id, name: id, sport: '풋살', status: 'active', createdAt: 1, createdBy: '', updatedAt: 1, lockedAt: null, ...extra }, teams });

const BASE = { teamName: '마스터FC', members: ['a1', 'b1', 'c1', 'd1'], pendingGames: [], isAdmin: true, authUserName: '홍길동', onStartGame: vi.fn(), onContinueGame: vi.fn() };
async function mount(props = {}) {
  await act(async () => {
    root = createRoot(container);
    root.render(createElement(ThemeProvider, null, createElement(CupListTab, { ...BASE, ...props })));
  });
}
const click = async (el) => { await act(async () => { el.click(); }); };
const btn = (txt) => [...container.querySelectorAll('button')].find(b => b.textContent.trim().includes(txt));
const type = async (input, value) => {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true }));
  });
};

describe('CupListTab 실렌더', () => {
  it('대회가 없으면 안내 문구', async () => {
    await mount();
    expect(container.textContent).toContain('아직 대회가 없습니다');
  });

  it('목록: 진행중 대회는 펼쳐지고 완료 대회는 접힘 섹션에', async () => {
    h.cups = [cup('컵2026'), cup('컵2025', { status: 'finished' })];
    await mount();
    expect(container.textContent).toContain('컵2026');
    expect(container.textContent).toContain('완료된 대회');
    expect(container.textContent).not.toContain('🏆 컵2025'); // 접힘 상태
  });

  it('새 대회 생성 → createCup 호출 후 상세로 진입(팀 관리가 보인다)', async () => {
    await mount();
    await click(btn('+ 새 대회'));
    await type(container.querySelector('input[data-role="new-cup-name"]'), '마스터스컵 2026');
    await click(btn('만들기'));
    expect(h.created).toEqual(['마스터스컵 2026']);
    expect(container.textContent).toContain('팀 관리');
  });

  it('상세: 팀 검증 통과 + active 면 시작 버튼이 onStartGame("cup", { cupId }) 호출', async () => {
    const onStartGame = vi.fn();
    h.cups = [cup('컵2026')];
    await mount({ onStartGame });
    await click(btn('컵2026'));
    await click(btn('오늘 컵 경기 시작'));
    expect(onStartGame).toHaveBeenCalledWith('cup', { cupId: '컵2026' });
  });

  it('상세: 팀이 부족하면 시작 버튼 비활성 + 이유, 진행 중 컵 세션은 이어서 기록 카드', async () => {
    const onContinueGame = vi.fn();
    h.cups = [cup('컵2026', {}, T3.slice(0, 2))];
    await mount({ onContinueGame, pendingGames: [{ gameId: 'g_1', state: { tournamentId: '컵2026', phase: 'match', schedule: [{}], currentRoundIdx: 0, attendees: ['a1'] } }] });
    await click(btn('컵2026'));
    expect(btn('오늘 컵 경기 시작').disabled).toBe(true);
    expect(container.textContent).toContain('팀은 3~8개여야 합니다');
    await click(btn('이어서 기록'));
    expect(onContinueGame).toHaveBeenCalledWith('g_1');
  });

  it('상세: 잠긴 대회는 삭제 버튼 비활성, 잠기지 않으면 삭제 → deleteCup 후 목록으로', async () => {
    h.cups = [cup('잠김', { lockedAt: 5 }), cup('열림')];
    await mount();
    await click(btn('잠김'));
    expect(btn('대회 삭제').disabled).toBe(true);
    await click(btn('← 대회 목록'));
    await click(btn('열림'));
    await click(btn('대회 삭제'));
    expect(h.deleted).toEqual(['열림']);
    expect(container.textContent).not.toContain('팀 관리');
  });

  it('비관리자: 새 대회·시작·삭제 없음, 팀 관리는 읽기 전용', async () => {
    h.cups = [cup('컵2026')];
    await mount({ isAdmin: false });
    expect(btn('+ 새 대회')).toBeUndefined();
    await click(btn('컵2026'));
    expect(btn('오늘 컵 경기 시작')).toBeUndefined();
    expect(btn('대회 삭제')).toBeUndefined();
    expect(btn('저장')).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/components/cup/__tests__/CupListTab.render.test.jsx`
Expected: FAIL — 모듈 없음.

- [ ] **Step 3: Write `CupPickerModal.jsx`**

```jsx
// src/components/cup/CupPickerModal.jsx
// 경기관리 탭 "🏆 컵대회 경기" 에서 진행중 대회가 여러 개일 때 고른다(스펙 §6.1).
import Modal from '../common/Modal';
import { useTheme } from '../../hooks/useTheme';

export default function CupPickerModal({ cups, onPick, onClose }) {
  const { C } = useTheme();
  return (
    <Modal title="어느 대회의 경기인가요?" onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {cups.map(c => (
          <button key={c.meta.id} onClick={() => onPick(c.meta.id)}
            style={{ textAlign: "left", background: C.card, color: C.white, border: `1px solid ${C.borderColor}`, borderRadius: 12, padding: "12px 14px", fontSize: 15, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
            🏆 {c.meta.name} <span style={{ fontSize: 12, color: C.gray, fontWeight: 400 }}>· {c.teams.length}팀</span>
          </button>
        ))}
      </div>
    </Modal>
  );
}
```

- [ ] **Step 4: Write `CupDetail.jsx`**

```jsx
// src/components/cup/CupDetail.jsx
// 대회 상세 — 스펙 §6.1: 시작·이어서·팀 관리·상태·삭제. 순위·TOP·대진·결과·잠금 로그 파생은 3단계.
import { useState } from 'react';
import { useTheme } from '../../hooks/useTheme';
import CupSync from '../../services/cupSync';
import { validateTeams, isLocked } from '../../utils/cup/cupEntity';
import { isCupSession } from '../../utils/cup/cupSession';
import CupTeamEditor from './CupTeamEditor';

export default function CupDetail({ teamName, cup, members, pendingGames = [], isAdmin, onStartGame, onContinueGame, onBack, onChanged }) {
  const { C } = useTheme();
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const locked = isLocked(cup);
  const active = cup.meta.status === 'active';
  const validation = validateTeams(cup.teams);
  const canStart = isAdmin && active && validation.ok;
  const pendingCup = pendingGames.find(g => isCupSession(g.state) && g.state.tournamentId === cup.meta.id);

  const run = async (fn) => {
    setBusy(true);
    try { await fn(); await onChanged?.(); }
    catch (e) { alert(`저장 실패: ${e?.message || e}`); }
    finally { setBusy(false); }
  };
  const handleSave = (teams) => run(async () => { setSaving(true); try { await CupSync.saveTeams(teamName, cup.meta.id, teams); } finally { setSaving(false); } });
  const toggleStatus = () => run(() => CupSync.setStatus(teamName, cup.meta.id, active ? 'finished' : 'active'));
  const handleDelete = () => {
    if (!confirm(`"${cup.meta.name}" 대회를 삭제할까요? 팀 구성이 사라집니다.`)) return;
    run(async () => { await CupSync.deleteCup(teamName, cup.meta.id); onBack?.(); });
  };

  const section = { padding: "0 20px", marginBottom: 18 };
  const title = { fontSize: 13, color: C.gray, marginBottom: 8, paddingLeft: 4 };
  const card = { background: C.card, borderRadius: 14, padding: 14, border: `1px solid ${C.borderColor}` };
  const btn = (bg, fg = "#fff", extra = {}) => ({ background: bg, color: fg, border: "none", borderRadius: 12, padding: "12px 16px", fontSize: 15, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", width: "100%", ...extra });

  return (
    <div>
      <div style={section}>
        <button onClick={onBack} style={{ background: "transparent", border: "none", color: C.accent, fontSize: 14, cursor: "pointer", padding: "4px 0", fontFamily: "inherit" }}>← 대회 목록</button>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: C.white }}>🏆 {cup.meta.name}</div>
          <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 999, background: active ? "rgba(52,199,89,0.15)" : "var(--app-bg-row)", color: active ? "var(--app-green)" : C.gray }}>{active ? '진행중' : '완료'}</span>
          {locked && <span style={{ fontSize: 11, color: "var(--app-orange)" }}>🔒 잠김</span>}
        </div>
        <div style={{ fontSize: 12, color: C.gray, marginTop: 4 }}>{cup.teams.length}팀 · 풀리그 1회전</div>
      </div>

      {pendingCup && (
        <div style={section}>
          <div style={{ ...card, background: "rgba(0,122,255,0.08)", border: "0.5px solid rgba(0,122,255,0.25)", cursor: "pointer" }} onClick={() => onContinueGame?.(pendingCup.gameId)}>
            <div style={{ fontSize: 14, fontWeight: 600, color: "var(--app-blue)" }}>진행 중인 컵 세션이 있습니다</div>
            <button style={{ ...btn("var(--app-blue)"), marginTop: 8 }}>이어서 기록</button>
          </div>
        </div>
      )}

      {isAdmin && (
        <div style={section}>
          <button disabled={!canStart || busy} onClick={() => onStartGame?.('cup', { cupId: cup.meta.id })}
            style={btn("var(--app-orange)", "#fff", { opacity: canStart && !busy ? 1 : 0.45 })}>오늘 컵 경기 시작</button>
          {!active && <div style={{ fontSize: 12, color: C.gray, marginTop: 6 }}>완료된 대회입니다. "다시 열기" 후 시작할 수 있습니다.</div>}
          {active && !validation.ok && <div style={{ fontSize: 12, color: "var(--app-red)", marginTop: 6 }}>{validation.errors.join(' · ')}</div>}
        </div>
      )}

      <div style={section}>
        <div style={title}>팀 관리</div>
        <CupTeamEditor key={`${cup.meta.id}:${cup.meta.updatedAt}`} teams={cup.teams} members={members} locked={locked} disabled={!isAdmin} saving={saving} onSave={handleSave} />
      </div>

      {isAdmin && (
        <div style={{ ...section, display: "flex", gap: 8 }}>
          <button disabled={busy} onClick={toggleStatus} style={btn("var(--app-bg-row)", C.white)}>{active ? '대회 종료' : '다시 열기'}</button>
          <button disabled={busy || locked} onClick={handleDelete} title={locked ? '경기 기록이 있는 대회는 삭제할 수 없습니다' : ''}
            style={btn("rgba(255,59,48,0.12)", "var(--app-red)", { opacity: locked ? 0.45 : 1 })}>대회 삭제</button>
        </div>
      )}
    </div>
  );
}
```
(`CupTeamEditor`의 `key`에 `updatedAt`을 넣어 저장 후 재로드된 값으로 편집기를 다시 마운트한다 — 자식 `useState(prop)` 재초기화 문제를 키 재마운트로 푼다.)

- [ ] **Step 5: Write `CupListTab.jsx`**

```jsx
// src/components/cup/CupListTab.jsx
// 대시보드 "대회" 탭(풋살) — 스펙 §6.1: 대회 목록·생성·완료 접기 → CupDetail. 통산(개인 누적)은 3단계.
// tournamentActive/onTournamentView 계열은 쓰지 않는다(탭 바·헤더 유지, 목록↔상세는 내부 state).
import { useState, useEffect, useCallback } from 'react';
import { useTheme } from '../../hooks/useTheme';
import CupSync from '../../services/cupSync';
import CupDetail from './CupDetail';

export default function CupListTab({ teamName, members = [], pendingGames = [], isAdmin, authUserName, onStartGame, onContinueGame }) {
  const { C } = useTheme();
  const [cups, setCups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [showFinished, setShowFinished] = useState(false);

  const reload = useCallback(async () => {
    try { setError(null); setCups(await CupSync.listCups(teamName)); }
    catch (e) { setError(e?.message || '대회 목록을 불러오지 못했습니다'); }
    finally { setLoading(false); }
  }, [teamName]);
  useEffect(() => { let alive = true; setLoading(true); (async () => { if (alive) await reload(); })(); return () => { alive = false; }; }, [reload]);

  const handleCreate = async () => {
    try {
      const cup = await CupSync.createCup(teamName, { name: newName, createdBy: authUserName || '' });
      setCreating(false); setNewName('');
      await reload();
      setSelectedId(cup.meta.id);
    } catch (e) { alert(`대회 생성 실패: ${e?.message || e}`); }
  };

  const section = { padding: "0 20px", marginBottom: 18 };
  const title = { fontSize: 13, color: C.gray, marginBottom: 8, paddingLeft: 4 };
  const card = { background: C.card, borderRadius: 14, padding: 14, border: `1px solid ${C.borderColor}`, marginBottom: 8, width: "100%", textAlign: "left", cursor: "pointer", color: C.white, fontFamily: "inherit" };
  const input = { flex: 1, minWidth: 0, padding: "10px 12px", borderRadius: 10, border: `1px solid ${C.borderColor}`, background: "var(--app-bg-elevated)", color: C.white, fontSize: 15, fontFamily: "inherit" };
  const btn = (bg, fg = "#fff") => ({ background: bg, color: fg, border: "none", borderRadius: 10, padding: "10px 14px", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" });

  const selected = cups.find(c => c.meta.id === selectedId);
  if (selected) {
    return (
      <CupDetail teamName={teamName} cup={selected} members={members} pendingGames={pendingGames} isAdmin={isAdmin}
        onStartGame={onStartGame} onContinueGame={onContinueGame}
        onBack={() => setSelectedId(null)} onChanged={reload} />
    );
  }

  const activeCups = cups.filter(c => c.meta.status === 'active');
  const finishedCups = cups.filter(c => c.meta.status !== 'active');
  const cupCard = (c) => (
    <button key={c.meta.id} onClick={() => setSelectedId(c.meta.id)} style={card}>
      <div style={{ fontSize: 16, fontWeight: 700 }}>🏆 {c.meta.name}</div>
      <div style={{ fontSize: 12, color: C.gray, marginTop: 4 }}>{c.teams.length}팀 · {c.meta.status === 'active' ? '진행중' : '완료'}{c.meta.lockedAt ? ' · 🔒' : ''}</div>
    </button>
  );

  return (
    <div>
      {error && <div style={{ ...section, color: "var(--app-red)", fontSize: 13 }}>{error}</div>}
      <div style={section}>
        <div style={title}>진행중 대회</div>
        {loading ? <div style={{ color: C.gray, fontSize: 13, padding: 8 }}>불러오는 중…</div>
          : activeCups.length === 0 ? <div style={{ color: C.gray, fontSize: 13, padding: 8 }}>아직 대회가 없습니다</div>
          : activeCups.map(cupCard)}
        {isAdmin && !creating && <button onClick={() => setCreating(true)} style={{ ...btn("var(--app-orange)"), width: "100%", marginTop: 4 }}>+ 새 대회</button>}
        {isAdmin && creating && (
          <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
            <input data-role="new-cup-name" value={newName} placeholder="대회명 (예: 마스터스컵 2026)" onChange={e => setNewName(e.target.value)} style={input} />
            <button onClick={handleCreate} style={btn(C.green)}>만들기</button>
            <button onClick={() => { setCreating(false); setNewName(''); }} style={btn("var(--app-bg-row)", C.white)}>취소</button>
          </div>
        )}
      </div>
      {finishedCups.length > 0 && (
        <div style={section}>
          <button onClick={() => setShowFinished(v => !v)} style={{ ...title, background: "transparent", border: "none", cursor: "pointer", fontFamily: "inherit" }}>
            완료된 대회 ({finishedCups.length}) {showFinished ? '▾' : '▸'}
          </button>
          {showFinished && finishedCups.map(cupCard)}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 6: Run tests**

Run: `npx vitest run src/components/cup/__tests__/CupListTab.render.test.jsx src/components/cup/__tests__/CupTeamEditor.render.test.jsx`
Expected: PASS (7 + 5).

- [ ] **Step 7: Commit**

```bash
git add src/components/cup/CupDetail.jsx src/components/cup/CupListTab.jsx src/components/cup/CupPickerModal.jsx src/components/cup/__tests__/CupListTab.render.test.jsx
git commit -m "feat(cup): 대회 목록·생성·상세(시작·이어서·팀 관리·상태·삭제) 화면 + 대회 선택 모달 (스펙 §6.1)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01AqpBTxNBiezjumZN5AzJ6D"
```

---

### Task 8: 대시보드 배선 — 풋살 "대회" 탭 + `🏆 컵대회 경기` 버튼 (원자 커밋)

**Files:**
- Modify: `src/components/dashboard/mainTabs.js`, `src/components/dashboard/__tests__/mainTabs.test.js`, `src/components/dashboard/TeamDashboard.jsx`
- Test: `src/components/__tests__/cupWiring.guard.test.js` (케이스 추가)

**Interfaces:**
- Consumes: `CupListTab`, `CupPickerModal` (Task 7), `CupSync.listCups` (Task 3).
- Produces: 풋살 `tournament` 탭 → `CupListTab`; 경기관리 새 경기 영역에 `🏆 컵대회 경기`(활성 대회 0개 → 미표시, 1개 → 즉시 시작, n개 → 모달).

- [ ] **Step 1: Update the failing tests**

`mainTabs.test.js`의 `it('풋살 = records·roster·analytics·games (대회 없음)', …)`를 다음으로 교체:
```js
  it('풋살 = records·roster·analytics·games·tournament (스펙 §6.1: 풋살도 대회 탭)', () => {
    const t = buildMainTabs({ activeSport: '풋살', role: '관리자', pendingCount: 0 });
    expect(keys(t)).toEqual(['records', 'roster', 'analytics', 'games', 'tournament']);
    expect(t.find(x => x.key === 'records').label).toBe('대시보드');
    expect(t.find(x => x.key === 'roster').label).toBe('개인기록');
    expect(t.find(x => x.key === 'tournament').label).toBe('대회');
    expect(t.every(x => !x.beta)).toBe(true);
    expect(t.find(x => x.key === 'games').badge).toBeFalsy();
  });
  it('풋살 + hideTournament 는 무시(축구 전용 플래그) — 대회 탭 유지', () => {
    expect(keys(buildMainTabs({ activeSport: '풋살', role: '관리자', pendingCount: 0, hideTournament: true }))).toContain('tournament');
  });
```
`cupWiring.guard.test.js` 파일 끝에 추가:
```js
describe('TeamDashboard.jsx — tournament 탭 종목 분기·컵 버튼', () => {
  const src = read('components/dashboard/TeamDashboard.jsx');
  it('풋살은 CupListTab, 축구는 기존 TournamentListTab', () => {
    expect(src).toMatch(/import CupListTab from '\.\.\/cup\/CupListTab'/);
    expect(src).toMatch(/activeTab === "tournament" && \(\s*isSoccer \?/);
    expect(src).toMatch(/<CupListTab/);
  });
  it('경기관리 새 경기 영역에 컵대회 버튼과 선택 모달', () => {
    expect(src).toMatch(/🏆 컵대회 경기/);
    expect(src).toMatch(/onStartGame\("cup", \{ cupId/);
    expect(src).toMatch(/<CupPickerModal/);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/components/dashboard/__tests__/mainTabs.test.js src/components/__tests__/cupWiring.guard.test.js`
Expected: 새 케이스 FAIL.

- [ ] **Step 3: `mainTabs.js`**

```js
    ...(activeSport === '축구' && !hideTournament ? [{ key: 'tournament', label: '대회' }] : []),
```
→
```js
    // 축구: 기존 대회 모드(hideTournament 로 숨김 가능). 풋살: 컵대회(스펙 §6.1) — hideTournament 는 축구 전용 플래그라 무관.
    ...(activeSport === '축구' && !hideTournament ? [{ key: 'tournament', label: '대회' }] : []),
    ...(activeSport === '풋살' ? [{ key: 'tournament', label: '대회' }] : []),
```
(`buildMainTabs`의 비테니스 분기는 `activeSport`가 `'풋살'`이 아닌 다른 값(예: 미정)일 때 아무 탭도 추가하지 않는다 — 기존 동작과 같다.)

- [ ] **Step 4: `TeamDashboard.jsx`**

1. import 추가(`import TournamentListTab …` 아래):
```js
import CupListTab from '../cup/CupListTab';
import CupPickerModal from '../cup/CupPickerModal';
import CupSync from '../../services/cupSync';
```
2. state 추가(`const [menuOpen, setMenuOpen] = useState(false);` 근처):
```js
  // 풋살 컵대회(스펙 §6.1): 경기관리 "🏆 컵대회 경기" 버튼용 진행중 대회 목록. 대회 탭(CupListTab)은 자체 로드한다.
  const [activeCups, setActiveCups] = useState([]);
  const [cupPickerOpen, setCupPickerOpen] = useState(false);
```
3. 로드 effect(`activeSport`·`teamName` 의존; 풋살에서만):
```js
  useEffect(() => {
    if (activeSport !== "풋살" || !teamName) { setActiveCups([]); return; }
    let cancelled = false;
    CupSync.listCups(teamName)
      .then(list => { if (!cancelled) setActiveCups(list.filter(c => c.meta.status === 'active')); })
      .catch(err => { console.warn('[cup] 대회 목록 로드 실패:', err?.message); if (!cancelled) setActiveCups([]); });
    return () => { cancelled = true; };
  }, [activeSport, teamName, activeTab]);
```
(`activeTab` 의존은 대회 탭에서 만들고 경기관리로 돌아왔을 때 목록이 갱신되게 하기 위함.)
4. `renderGames`의 풋살 분기 — `커스텀 경기` 버튼의 `</button>` 바로 뒤(같은 `<div style={{ display: "flex", flexDirection: "column", gap: 10 }}>` 안)에 추가:
```jsx
                {activeCups.length > 0 && (
                  <button onClick={() => {
                    if (activeCups.length === 1) onStartGame("cup", { cupId: activeCups[0].meta.id });
                    else setCupPickerOpen(true);
                  }} style={{
                    width: "100%", background: "rgba(255,149,0,0.12)", color: "var(--app-orange)",
                    border: "none", borderRadius: 14, padding: "14px 16px", cursor: "pointer",
                    display: "flex", alignItems: "center", gap: 12, textAlign: "left",
                    fontFamily: "inherit",
                  }}>
                    <TrophyIcon color="var(--app-orange)" width={22} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 16, fontWeight: 600 }}>🏆 컵대회 경기</div>
                      <div style={{ fontSize: 13, color: "var(--app-text-secondary)", marginTop: 2 }}>대회 팀으로 자동 편성 · 남은 대진{activeCups.length > 1 ? ` · 진행중 ${activeCups.length}개` : ` · ${activeCups[0].meta.name}`}</div>
                    </div>
                    <ChevronRight color="var(--app-orange)" width={16} />
                  </button>
                )}
```
5. 모달 렌더 — 컴포넌트 최상위 return의 루트 `<div style={ds.container}>` 안, 맨 앞(헤더 위)에:
```jsx
      {cupPickerOpen && (
        <CupPickerModal cups={activeCups} onClose={() => setCupPickerOpen(false)}
          onPick={(cupId) => { setCupPickerOpen(false); onStartGame("cup", { cupId }); }} />
      )}
```
6. `tournament` 탭 분기 — 기존
```jsx
            {activeTab === "tournament" && (
              <TournamentListTab
                …
              />
            )}
```
을
```jsx
            {activeTab === "tournament" && (
              isSoccer ? (
                <TournamentListTab
                  …기존 props 그대로…
                />
              ) : (
                <CupListTab teamName={teamName} members={members.map(m => m.name)} pendingGames={pendingGames}
                  isAdmin={activeEntry?.role === "관리자"} authUserName={authUser?.name}
                  onStartGame={onStartGame} onContinueGame={onContinueGame} />
              )
            )}
```
으로 바꾼다(`TournamentListTab`의 props 텍스트는 한 글자도 바꾸지 않는다).

- [ ] **Step 5: Verify**

Run: `npx vitest run src/components/dashboard/__tests__ src/components/__tests__/cupWiring.guard.test.js` → PASS(기존 `TeamDashboard.render.test.jsx` 포함 — 그 테스트의 `sheetCache` 목은 `CupSync`를 목하지 않으므로 `listCups`가 실제 firebase를 부르려 한다: 그 테스트 파일 상단에 `vi.mock('../../../services/cupSync', () => ({ default: { listCups: () => Promise.resolve([]) } }));`를 추가한다. `TeamDashboard.logSheetsOnly.render.test.jsx`도 같은 목을 추가한다).
Run: `npm run lint && npm run build && npm test` → green.

- [ ] **Step 6: Commit (mainTabs + TeamDashboard 한 커밋)**

```bash
git add src/components/dashboard/mainTabs.js src/components/dashboard/__tests__/mainTabs.test.js src/components/dashboard/TeamDashboard.jsx src/components/dashboard/__tests__/TeamDashboard.render.test.jsx src/components/dashboard/__tests__/TeamDashboard.logSheetsOnly.render.test.jsx src/components/__tests__/cupWiring.guard.test.js
git commit -m "feat(cup): 풋살 대회 탭(CupListTab) + 경기관리 🏆 컵대회 경기 버튼(활성 대회 선택) — mainTabs·TeamDashboard 동시 변경 (스펙 §6.1)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01AqpBTxNBiezjumZN5AzJ6D"
```

---

### Task 9: 전체 검증·스펙 상태 갱신

**Files:**
- Modify: `docs/superpowers/specs/2026-09-16-masters-cup-design.md` (상태 줄)

- [ ] **Step 1: 전체 테스트·린트·빌드**

Run: `npm test && npm run lint && npm run build` — 전체 green, 신규 lint 에러 0(기존 2건만), 빌드 성공.

- [ ] **Step 2: 변경 범위 스팟 체크**

Run: `git diff --stat 0e015ef...HEAD` — `apps-script/`, `src/utils/analyticsV2/`, `src/utils/soccerAnalytics/`, `src/utils/intraSoccer/`, `src/components/tournament/` 에 변경이 없어야 한다.

- [ ] **Step 3: 브라우저 스모크 체크리스트 작성(실행은 배포 후 사용자)**

리포트에 다음 목록을 그대로 남긴다(스펙 §10 불변식 13): (0) Firebase 콘솔 `tournaments` 규칙 확인 → (1) 대회 탭 `+ 새 대회` → (2) 팀 3개·팀원 구성·저장 → (3) 경기관리 `🏆 컵대회 경기` 또는 상세의 시작 → 🏆 배너 확인 → (4) 골 1개 → 라운드 확정 → 조기 종료 → 기록확정 → (5) 탭 새로고침 후 진행중 목록에 🏆 라벨·복원 → (6) 대회 상세에서 🔒 잠김·팀명 입력 비활성·삭제 비활성 → (7) 정규 분석탭 불변 → (8) 하버FC 계정 대회 탭 = 기존 축구 목록.

- [ ] **Step 4: 스펙 상태 줄 갱신**

`- 상태: 1단계(격리 게이트) 구현·배포 완료(main 0e015ef). **v2: 2단계 이후를 "앱 내 대회·팀 관리(RTDB)"로 방향 전환** — 사용자 검토 대기` → `- 상태: 1단계 완료(main 0e015ef). 2단계(대회·팀 관리 + 컵 경기일 진입) 구현 완료 — 2026-09-17. 배포 전제: RTDB tournaments 규칙. 3단계 계획 대기`

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/specs/2026-09-16-masters-cup-design.md
git commit -m "docs: 마스터스컵 스펙 상태 — 2단계(대회·팀 관리 + 컵 경기일 진입) 구현 완료

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01AqpBTxNBiezjumZN5AzJ6D"
```

---

## 완료 기준

- `npm test` 전체 green(신규 6개 테스트 파일 + 수정 3개), lint 신규 에러 0, 빌드 성공.
- 대회 탭에서 대회 생성·팀 관리·삭제가 되고, 경기관리/상세의 컵 시작이 그 대회의 팀으로 세션을 열어 🏆 배너가 보이며, 마감 후 대회가 잠긴다.
- 정규 세션·축구 대회 탭·테니스 탭은 변경 없음(테스트·정적 가드·스모크로 확인).
- Firebase `tournaments` 규칙은 배포 전제(코드 밖).

## 3단계(별도 계획)

cup 뷰(alias) 3종, `collectPlayedPairs`·`calcRemainingRounds`(세션 시작 시 치른 대진 제외), `calcCupStandings`·`CupStandingsTable`·`dropExtraEvents`·`calcCupCareer`, 상세의 순위·TOP·대진·결과·우승·진행도, 목록의 통산·우승팀, `isLocked` 로그 파생 OR, `CupPickerModal` 완주 대회 회색 처리.
