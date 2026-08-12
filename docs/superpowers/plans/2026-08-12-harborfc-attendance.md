# 하버FC 출석률 날짜 기반 신뢰성 확보 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 하버FC(축구) 대시보드 "출석률 TOP 10"이 경기수가 아닌 경기일자 기준으로 항상 표시되게 한다.

**Architecture:** 3개 지점 수정 — (1) `settings.js`의 `getSettings`가 나머지 함수들과 같은 `_cache[team]` 캐시를 보도록 통일, (2) `TeamDashboard` effect가 RTDB 설정 로드를 await한 뒤 시트 조회, (3) 출석 집계·위젯 분기를 순수 함수(`src/utils/dashboardAttendance.js`)로 추출하고 축구의 경기수 폴백("N일" 둔갑 표기)을 empty 상태로 대체.

**Tech Stack:** React(JSX, RTL 없음 — SSR/순수함수 테스트), vitest, Firebase RTDB, Google Apps Script(이번엔 무수정).

**Spec:** `docs/superpowers/specs/2026-08-12-harborfc-attendance-design.md`

## Global Constraints

- 풋살(마스터FC) 경로 동작 무변경 — 위젯 `games` 모드(경기수 기반 목록)와 표기는 오늘과 동일해야 한다.
- Apps Script(`apps-script/Code.js`) 수정 금지 — push만으로 배포 가능해야 한다.
- 구글 시트 수치·수식 수정 금지.
- 이 워크트리 브랜치(`worktree-soccer-dev`)에서만 커밋한다. main 직접 커밋 금지.
- 기존 effect deps `[teamName, hasSoccerEntry, isTennis]` 유지.
- 테스트 실행: `npx vitest run <파일>` (개별) / `npx vitest run` (전체).

---

### Task 1: settings.js — getSettings 캐시 통일

**Files:**
- Modify: `src/config/settings.js` (`getSettings`, 현재 103~116행 부근)
- Test: `src/config/__tests__/settingsCache.test.js` (신규)

**Interfaces:**
- Consumes: 기존 `_cache`(모듈 내부), `_hydrateCacheFromStorage(team)`(같은 파일에 이미 존재, 함수 선언이라 호이스팅됨), `DEFAULTS`, `_setCacheForTest`.
- Produces: `getSettings(team)` — 시그니처·리턴 형태 불변(`{ ...DEFAULTS, ...(stored.shared || {}), ...stored }`). 이후 태스크는 "RTDB 로드 완료 후 getSettings를 부르면 최신 시트명이 나온다"에 의존한다.

- [ ] **Step 1: 실패하는 테스트 작성**

`src/config/__tests__/settingsCache.test.js` 생성 (모킹 패턴은 기존 `settings.test.js`와 동일):

```js
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('firebase/database', () => ({
  ref: vi.fn(() => ({})),
  set: vi.fn(() => Promise.resolve()),
  get: vi.fn(() => Promise.resolve({ exists: () => false })),
}));
vi.mock('../firebase', () => ({ firebaseDb: {} }));

import { getSettings, _setCacheForTest } from '../settings.js';

// 하버FC 출석률 경기수 폴백 회귀 테스트 — getSettings가 loadSettingsFromFirebase와
// 다른 캐시 키를 읽으면 RTDB 설정이 같은 세션에 반영되지 않는다.
describe('getSettings 캐시 정합성', () => {
  let _store = {};
  const mockLocalStorage = {
    getItem: (k) => _store[k] ?? null,
    setItem: (k, v) => { _store[k] = String(v); },
    removeItem: (k) => { delete _store[k]; },
    clear: () => { _store = {}; },
  };
  beforeEach(() => {
    _store = {};
    vi.stubGlobal('localStorage', mockLocalStorage);
    _setCacheForTest({});
  });

  it('RTDB 로드가 쓰는 _cache[team]을 같은 세션의 getSettings가 즉시 본다', () => {
    _setCacheForTest({ '하버FC': { shared: { playerLogSheet: '하버FC 선수기록보관소' } } });
    expect(getSettings('하버FC').playerLogSheet).toBe('하버FC 선수기록보관소');
  });

  it('localStorage가 비어 있어도 빈 객체를 부정 캐시하지 않는다', () => {
    expect(getSettings('하버FC').playerLogSheet).toBe('선수별집계기록로그'); // DEFAULTS
    _setCacheForTest({ '하버FC': { shared: { playerLogSheet: '하버FC 선수기록보관소' } } });
    expect(getSettings('하버FC').playerLogSheet).toBe('하버FC 선수기록보관소');
  });

  it('localStorage의 중첩 설정을 하이드레이션해 읽는다', () => {
    localStorage.setItem('masterfc_settings_하버FC',
      JSON.stringify({ shared: { playerLogSheet: '하버FC 선수기록보관소' } }));
    expect(getSettings('하버FC').playerLogSheet).toBe('하버FC 선수기록보관소');
  });

  it('shared 평탄화 + DEFAULTS 병합 형태 유지', () => {
    _setCacheForTest({ '팀X': { shared: { dashboardSheet: '팀X 대시보드' } } });
    const s = getSettings('팀X');
    expect(s.dashboardSheet).toBe('팀X 대시보드');
    expect(s.pointLogSheet).toBe('포인트로그'); // DEFAULTS 유지
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/config/__tests__/settingsCache.test.js`
Expected: FAIL — 1·2번 테스트가 실패(현재 getSettings는 `_cache[_key(team)]`를 읽어 `_setCacheForTest({ '하버FC': ... })`가 안 보임). 3·4번은 현재 구현에서도 통과할 수 있음(정상).

- [ ] **Step 3: getSettings 재작성**

`src/config/settings.js`에서 기존 getSettings:

```js
export function getSettings(team) {
  const key = _key(team);
  let stored = _cache[key];
  if (!stored) {
    try {
      stored = JSON.parse(localStorage.getItem(key) || "{}");
      _cache[key] = stored;
    } catch {
      stored = {};
    }
  }
  // 중첩 포맷의 shared.* 는 top-level로 평탄화. 레거시 flat 포맷은 stored 전개로 처리.
  return { ...DEFAULTS, ...(stored.shared || {}), ...stored };
}
```

를 다음으로 교체:

```js
export function getSettings(team) {
  // loadSettingsFromFirebase/getEffectiveSettings와 같은 _cache[team] 캐시를 공유해야
  // RTDB 로드 결과가 같은 세션의 getSettings에도 즉시 반영된다.
  // 빈 결과는 캐시에 쓰지 않는다 — {}를 고정하면 이후 로드가 무시된다.
  // 레거시 flat localStorage는 하이드레이션에서 제외 — loadSettingsFromFirebase가 마이그레이션한다.
  _hydrateCacheFromStorage(team);
  const stored = _cache[team] || {};
  // 중첩 포맷의 shared.* 는 top-level로 평탄화.
  return { ...DEFAULTS, ...(stored.shared || {}), ...stored };
}
```

`_key`는 saveSettings/loadSettingsFromFirebase/_hydrateCacheFromStorage가 계속 쓰므로 남긴다.

- [ ] **Step 4: 통과 확인 + 기존 설정 테스트 회귀 확인**

Run: `npx vitest run src/config/__tests__/`
Expected: settingsCache.test.js 4건 포함 전부 PASS (settings.test.js, tennisSettings.test.js 회귀 없음)

- [ ] **Step 5: 커밋**

```bash
git add src/config/settings.js src/config/__tests__/settingsCache.test.js
git commit -m "fix(settings): getSettings 캐시 키를 _cache[team]으로 통일 — RTDB 로드 미반영 버그

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: dashboardAttendance — 출석 집계·위젯 분기 순수 함수

**Files:**
- Create: `src/utils/dashboardAttendance.js`
- Test: `src/utils/__tests__/dashboardAttendance.test.js` (신규)

**Interfaces:**
- Consumes: 없음 (순수 함수).
- Produces:
  - `buildAttendanceData(plog)` — 입력: `[{ date: 'YYYY-MM-DD', name: string, ... }]`(AppSync.getPlayerLog 결과). 리턴: `{ totalDates: number, playerDates: { [name]: number } }` 또는 `null`(로그 없음/무효).
  - `buildAttendanceView(activeSport, attendanceData, members, maxGames)` — 리턴: `{ mode: 'dates' | 'games' | 'empty', totalDates: number, list: [{ name, att }] }`. `members`는 `[{ name, games, ... }]`(fetchSheetData 결과), Task 3의 위젯이 소비.

- [ ] **Step 1: 실패하는 테스트 작성**

`src/utils/__tests__/dashboardAttendance.test.js` 생성:

```js
import { describe, it, expect } from 'vitest';
import { buildAttendanceData, buildAttendanceView } from '../dashboardAttendance';

describe('buildAttendanceData', () => {
  it('같은 날짜 여러 행(하루 다경기)을 유니크 날짜로 센다', () => {
    const plog = [
      { date: '2026-01-06', name: '주건호' },
      { date: '2026-01-06', name: '주건호' },
      { date: '2026-01-13', name: '주건호' },
      { date: '2026-01-06', name: '김형욱' },
    ];
    expect(buildAttendanceData(plog)).toEqual({
      totalDates: 2,
      playerDates: { '주건호': 2, '김형욱': 1 },
    });
  });

  it('빈/무효 입력은 null', () => {
    expect(buildAttendanceData([])).toBeNull();
    expect(buildAttendanceData(null)).toBeNull();
    expect(buildAttendanceData(undefined)).toBeNull();
    expect(buildAttendanceData([{ date: '', name: '' }])).toBeNull();
  });
});

describe('buildAttendanceView', () => {
  const members = [
    { name: '주건호', games: 99 },
    { name: '김형욱', games: 93 },
    { name: '무출전', games: 0 },
  ];

  it('축구 + 데이터 없음 → empty (경기수를 일로 표기하는 폴백 금지)', () => {
    const av = buildAttendanceView('축구', null, members, 99);
    expect(av.mode).toBe('empty');
    expect(av.list).toEqual([]);
  });

  it('축구 + 데이터 → 날짜 기반 내림차순', () => {
    const av = buildAttendanceView('축구',
      { totalDates: 40, playerDates: { '김형욱': 35, '주건호': 38 } }, members, 99);
    expect(av.mode).toBe('dates');
    expect(av.totalDates).toBe(40);
    expect(av.list).toEqual([{ name: '주건호', att: 38 }, { name: '김형욱', att: 35 }]);
  });

  it('풋살 → 기존 경기수 기반 유지, games=0 제외', () => {
    const av = buildAttendanceView('풋살', null, members, 99);
    expect(av.mode).toBe('games');
    expect(av.totalDates).toBe(99);
    expect(av.list).toEqual([{ name: '주건호', att: 99 }, { name: '김형욱', att: 93 }]);
  });

  it('TOP 10으로 자른다 (양쪽 모드)', () => {
    const manyDates = Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`p${i}`, 12 - i]));
    expect(buildAttendanceView('축구', { totalDates: 20, playerDates: manyDates }, [], 1).list).toHaveLength(10);
    const manyMembers = Array.from({ length: 12 }, (_, i) => ({ name: `m${i}`, games: 12 - i }));
    expect(buildAttendanceView('풋살', null, manyMembers, 12).list).toHaveLength(10);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/utils/__tests__/dashboardAttendance.test.js`
Expected: FAIL — "Failed to resolve import ../dashboardAttendance" (모듈 미존재)

- [ ] **Step 3: 구현**

`src/utils/dashboardAttendance.js` 생성:

```js
// 대시보드 "출석률 TOP 10" 위젯의 데이터 가공 — TeamDashboard에서 분리한 순수 함수.
// 축구 출석은 경기 수가 아니라 경기일자(하루 2~3경기 = 1일) 기준으로 센다.

// 선수별집계 로그 행({date: 'YYYY-MM-DD', name, ...})을 날짜 기반 출석으로 집계.
// 로그가 없으면 null — 호출부는 null이면 목록을 만들지 않는다.
export function buildAttendanceData(plog) {
  if (!plog || plog.length === 0) return null;
  const allDates = new Set();
  const perPlayer = {};
  for (const p of plog) {
    if (!p.date || !p.name) continue;
    allDates.add(p.date);
    if (!perPlayer[p.name]) perPlayer[p.name] = new Set();
    perPlayer[p.name].add(p.date);
  }
  if (allDates.size === 0) return null;
  const playerDates = {};
  for (const [name, dates] of Object.entries(perPlayer)) playerDates[name] = dates.size;
  return { totalDates: allDates.size, playerDates };
}

// 위젯 분기. 축구는 날짜 기반(attendanceData 필수), 풋살은 대시보드 시트의 경기수 기반.
// 축구인데 attendanceData가 없으면 empty — 경기수를 "N일"로 표기하던 폴백은
// 경기수(하루 2~3경기 누적)를 출석일로 오독하게 만들어 제거했다.
export function buildAttendanceView(activeSport, attendanceData, members, maxGames) {
  if (activeSport === "축구") {
    if (!attendanceData) return { mode: "empty", totalDates: 0, list: [] };
    const list = Object.entries(attendanceData.playerDates)
      .map(([name, count]) => ({ name, att: count }))
      .sort((a, b) => b.att - a.att)
      .slice(0, 10);
    return { mode: "dates", totalDates: attendanceData.totalDates, list };
  }
  const list = [...members].filter(p => p.games > 0)
    .sort((a, b) => b.games - a.games)
    .slice(0, 10)
    .map(p => ({ name: p.name, att: p.games }));
  return { mode: "games", totalDates: maxGames, list };
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run src/utils/__tests__/dashboardAttendance.test.js`
Expected: PASS (6건)

- [ ] **Step 5: 커밋**

```bash
git add src/utils/dashboardAttendance.js src/utils/__tests__/dashboardAttendance.test.js
git commit -m "feat(soccer): 출석 집계·위젯 분기 순수 함수 — 날짜 기반, 경기수 폴백 empty화

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: TeamDashboard — 설정 로드 순서 + 위젯 교체

**Files:**
- Modify: `src/components/dashboard/TeamDashboard.jsx` (임포트 ~5행, effect 59~137행, 위젯 484~508행 — 행 번호는 현재 HEAD 기준)

**Interfaces:**
- Consumes: Task 1의 `getSettings`(로드 후 최신값 보장), Task 2의 `buildAttendanceData`/`buildAttendanceView`, 기존 `loadSettingsFromFirebase(team, teamEntries)`(settings.js, 실패 시 throw 가능 — catch 필요).
- Produces: 없음 (말단 UI).

- [ ] **Step 1: 임포트 수정**

```js
import { getSettings, getEffectiveSettings } from '../../config/settings';
```
→
```js
import { getSettings, getEffectiveSettings, loadSettingsFromFirebase } from '../../config/settings';
import { buildAttendanceData, buildAttendanceView } from '../../utils/dashboardAttendance';
```

- [ ] **Step 2: effect 재작성 (59~137행)**

기존 `useEffect(() => { ... }, [teamName, hasSoccerEntry, isTennis]);` 블록 전체를 다음으로 교체. 팀 전적/상대전적 계산 로직은 그대로 두되 `load` async 함수로 감싸고, 설정 로드 await + cancelled 가드 + 죽은 코드(oppMap/oppStats — `matchOpponents`로 대체된 미사용 블록) 제거:

```js
  useEffect(() => {
    // 테니스는 대시보드 시트(풋살/축구 명부)를 읽지 않는다. 호출하면 빈 명단으로 위젯이 0으로 채워진다.
    if (isTennis) { setMembersLoading(false); return; }
    let cancelled = false;
    const load = async () => {
      // 시트명 설정(RTDB)이 도착하기 전에 기본 시트명으로 조회하던 레이스 방지 —
      // 로드 실패(오프라인 등) 시엔 localStorage 캐시 값으로 진행한다.
      try { await loadSettingsFromFirebase(teamName, teamEntries); } catch { /* 캐시로 진행 */ }
      if (cancelled) return;
      const s = getSettings(teamName);
      fetchSheetData()
        .then(data => { if (cancelled) return; setMembers(data.players || []); setKeepers(data.keepers || []); })
        .catch(() => { if (!cancelled) setMembers([]); })
        .finally(() => { if (!cancelled) setMembersLoading(false); });
      AppSync.getLatestDeltas(s.playerLogSheet).then(deltas => {
        if (!cancelled) setPrevRanks(deltas);
      }).catch(() => {});
      // 축구팀: 포인트로그에서 팀 전적 + 선수별집계에서 출석률
      if (hasSoccerEntry) {
        AppSync.getPlayerLog(s.playerLogSheet).then(plog => {
          if (!cancelled) setAttendanceData(buildAttendanceData(plog));
        }).catch(() => {});
        AppSync.getPointLog(s.pointLogSheet).then(events => {
          if (cancelled) return;
          if (!events || events.length === 0) return;
          const matches = {};
          for (const e of events) {
            if (!e.date || !e.matchId) continue;
            const key = `${e.date}_${e.matchId}`;
            if (!matches[key]) matches[key] = { ourGoals: 0, opponentGoals: 0, date: e.date, matchId: e.matchId };
            if (e.scorer && e.scorer !== "OG") matches[key].ourGoals++;
            if (e.ownGoal) matches[key].opponentGoals++;
            if (e.concedingGk && !e.scorer) matches[key].opponentGoals++;
          }
          const sorted = Object.values(matches).sort((a, b) => `${a.date}_${a.matchId}`.localeCompare(`${b.date}_${b.matchId}`));
          let wins = 0, draws = 0, losses = 0, gf = 0, ga = 0;
          const form = [];
          for (const m of sorted) {
            gf += m.ourGoals; ga += m.opponentGoals;
            if (m.ourGoals > m.opponentGoals) { wins++; form.push("W"); }
            else if (m.ourGoals < m.opponentGoals) { losses++; form.push("L"); }
            else { draws++; form.push("D"); }
          }
          setTeamRecord({ wins, draws, losses, gf, ga, games: sorted.length, form: form.slice(-5) });
          // 상대팀별 전적 — events에서 매치별 상대 추출
          const matchOpponents = {};
          for (const e of events) {
            if (!e.date || !e.matchId) continue;
            const key = `${e.date}_${e.matchId}`;
            if (e.opponent && !matchOpponents[key]) matchOpponents[key] = e.opponent;
          }
          const oppRec = {};
          for (const m of sorted) {
            const key = `${m.date}_${m.matchId}`;
            const opp = matchOpponents[key];
            if (!opp) continue;
            if (!oppRec[opp]) oppRec[opp] = { opponent: opp, games: 0, wins: 0, draws: 0, losses: 0, gf: 0, ga: 0 };
            oppRec[opp].games++; oppRec[opp].gf += m.ourGoals; oppRec[opp].ga += m.opponentGoals;
            if (m.ourGoals > m.opponentGoals) oppRec[opp].wins++;
            else if (m.ourGoals < m.opponentGoals) oppRec[opp].losses++;
            else oppRec[opp].draws++;
          }
          setOpponentRecords(Object.values(oppRec).sort((a, b) => b.games - a.games));
        }).catch(() => {});
      }
    };
    load();
    // teamName/hasSoccerEntry/isTennis 변경 시 재조회 — 이전엔 []라 팀 전환에도 최초 데이터가 유지됐음
    return () => { cancelled = true; };
  }, [teamName, hasSoccerEntry, isTennis]);
```

주의: 기존 84~93행의 setTeamRecord용 매치 집계와 104~114행의 죽은 블록(`oppMap`/`oppStats`/`const info = ...find(o => true)`)을 혼동하지 말 것 — 전자는 유지, 후자만 삭제된 상태가 위 코드다.

- [ ] **Step 3: 위젯 교체 (484~508행)**

기존 `{/* 출석률 */}` 블록 전체를 다음으로 교체:

```jsx
          {/* 출석률 */}
          {activePlayers.length > 0 && (() => {
            const av = buildAttendanceView(activeSport, attendanceData, members, maxGames);
            return (
              <div style={ds.section}>
                <div style={ds.sectionTitle}>출석률 TOP 10 {av.mode !== "empty" && <span style={{ fontSize: 11, fontWeight: 400, color: C.gray }}>(전체 {av.totalDates}일 기준)</span>}</div>
                <div style={{ ...ds.card, display: "flex", flexWrap: "wrap", gap: 0 }}>
                  {av.mode === "empty" ? (
                    <div style={{ padding: "6px", fontSize: 12, color: C.gray }}>출석 데이터 없음</div>
                  ) : (
                    av.list.map((p, i) => {
                      const ratio = p.att / (av.totalDates || 1);
                      const opacity = 0.3 + ratio * 0.7;
                      return (
                        <div key={i} style={{ width: "50%", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 6px", fontSize: 12 }}>
                          <span style={{ fontWeight: 600, opacity }}>{p.name}</span>
                          <span style={{ fontWeight: 700, color: ratio >= 1 ? "#22c55e" : C.accent, opacity }}>{Math.round(ratio * 100)}%({p.att}일)</span>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })()}
```

- [ ] **Step 4: 전체 테스트 + 빌드**

Run: `npx vitest run && npm run build`
Expected: 전체 PASS(기존 803건 + 신규 10건), 빌드 성공

- [ ] **Step 5: diff 정독 (RTL 부재 보완 — 메모리 규칙)**

Run: `git diff src/components/dashboard/TeamDashboard.jsx`
확인 목록: (1) 선언 순서 — `cancelled`가 `load` 정의보다 앞, `s`는 await 뒤에서만 사용, (2) JSX 괄호 짝, (3) 팀 전적/상대전적 로직이 원본과 동일한지(위 코드와 대조), (4) 풋살 경로: `buildAttendanceView('풋살', ...)`이 기존 렌더와 동일 목록·동일 표기인지.

- [ ] **Step 6: 커밋**

```bash
git add src/components/dashboard/TeamDashboard.jsx
git commit -m "fix(soccer): 대시보드 출석률 — 설정 로드 후 조회 + 경기수 폴백 제거

- RTDB 설정 await 후 시트 조회 (기본 시트명 레이스 제거)
- 축구 attendanceData 없으면 '출석 데이터 없음' (경기수 'N일' 둔갑 표기 제거)
- 팀 전환 시 낡은 응답 무시 (cancelled 가드)
- 죽은 코드 제거 (oppMap/oppStats 미사용 블록)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: 최종 검증

**Files:** 없음 (검증만)

- [ ] **Step 1: 전체 스위트 재실행**

Run: `npx vitest run`
Expected: 전부 PASS

- [ ] **Step 2: 프로덕션 빌드**

Run: `npm run build`
Expected: 성공, 경고 없음(기존 수준)

- [ ] **Step 3: 완료 보고**

superpowers:verification-before-completion 후 superpowers:finishing-a-development-branch로 진행 — 머지 전 최신 main 리베이스(테니스 세션 커밋 반영) + 전체 테스트 재실행. 배포 후 유저가 하버FC 대시보드에서 확인: "N일"이 실제 출석일수 수준(예: 수십 일)으로 표시되는지. "출석 데이터 없음"이 뜨면 브라우저 콘솔 `[sheet] GET action=getPlayerLog sheet="..."` 로그로 후속 진단.
