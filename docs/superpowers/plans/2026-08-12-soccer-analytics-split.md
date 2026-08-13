# 축구 분석지표 계산층 분리 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 축구 분석 계산층을 `src/utils/soccerAnalytics/`로 분리하고 리뷰 15건을 축구 쪽에만 적용, 풋살은 크래시 방어 2건 외 완전 무수정.

**Architecture:** analyticsV2 전체 복사 → soccerAnalytics(+barrel index.js) → 공유 탭 6곳에서 `isSoccer`로 네임스페이스 선택(호출부 무변경 셰도잉) → 축구 복사본에 15건 TDD 수정, 풋살 원본엔 정렬 크래시 방어 2건만.

**Tech Stack:** React(JSX), vitest, 순수 JS 계산 모듈.

**Spec:** `docs/superpowers/specs/2026-08-12-soccer-analytics-split-design.md`

## Global Constraints

- 풋살 무영향 게이트 5종(스펙 참조)을 페이즈 1·2 커밋 전 각각 실행 — 특히 `git diff --stat -- src/utils/analyticsV2/`가 페이즈 1에서 **빈 출력**, 페이즈 2에서 `calcTrends.js`·`calcStreaks.js`(+신규 테스트 파일)만.
- 워크트리 브랜치(`worktree-soccer-dev`)에서만 커밋.
- 탭 본문 호출부 무변경 원칙: 변경은 임포트 블록 + `futsalCalc` 객체 + 컴포넌트 상단 셰도잉 디스트럭처 1줄만.
- 테스트: `npx vitest run <경로>` / 전체 `npx vitest run`.

---

### Task 1: soccerAnalytics 복사 + percentile 인라인 + barrel

**Files:**
- Create: `src/utils/soccerAnalytics/` (analyticsV2 22개 모듈 + `__tests__` 복사)
- Create: `src/utils/soccerAnalytics/index.js`
- Modify(복사본만): `src/utils/soccerAnalytics/rankUtils.js`, `src/utils/soccerAnalytics/calcRadarData.js`

**Interfaces:**
- Produces: `src/utils/soccerAnalytics` barrel — analyticsV2와 동일한 공개 함수 이름 전부 재수출. Task 2가 `import * as soccerCalc from '../../../utils/soccerAnalytics'`로 소비.

- [ ] **Step 1: 디렉토리 복사**

```bash
cp -R src/utils/analyticsV2 src/utils/soccerAnalytics
```

- [ ] **Step 2: percentile 인라인**

`src/utils/gameStateAnalyzer.js:210-217`의 `percentile` 함수를 `src/utils/soccerAnalytics/rankUtils.js` 하단에 추가:

```js
// gameStateAnalyzer(orphan)에서 인라인 — soccerAnalytics는 orphan 모듈에 의존하지 않는다
export function percentile(values, value, lowerIsBetter = false) {
  if (values.length === 0) return 50;
  const sorted = [...values].sort((a, b) => a - b);
  let rank = sorted.findIndex(v => v >= value);
  if (rank === -1) rank = sorted.length;
  const pct = (rank / sorted.length) * 100;
  return lowerIsBetter ? 100 - pct : pct;
}
```

`src/utils/soccerAnalytics/calcRadarData.js`의 `import { percentile } from '../gameStateAnalyzer';` → `import { percentile } from './rankUtils';`

- [ ] **Step 3: barrel 작성**

`src/utils/soccerAnalytics/index.js` — 각 모듈의 공개 export를 재수출(모듈별 `export *`):

```js
// 축구 전용 분석 계산층 barrel. 탭에서 `import * as soccerCalc from '.../soccerAnalytics'`로 소비.
export * from './calcAssistLinkMatrix';
export * from './calcAssistPairs';
export * from './calcAwards';
export * from './calcDailyMvp';
export * from './calcGkChemistry';
export * from './calcGoldenTrio';
export * from './calcMetricLeaders';
export * from './calcMonthlyRanking';
export * from './calcPersonalRecords';
export * from './calcPersonalSynergy';
export * from './calcPlayerSummary';
export * from './calcRadarData';
export * from './calcRivalry';
export * from './calcRoundSlope';
export * from './calcSoloGoalRatio';
export * from './calcStreaks';
export * from './calcSynergyMatrix';
export * from './calcTrends';
export * from './calcVolatility';
export * from './pairBaseline';
export * from './parseMembers';
export * from './rankUtils';
```

(중복 export 이름 충돌 시 vitest/빌드가 즉시 알려준다 — 충돌 나는 이름만 명시적 재수출로 전환.)

- [ ] **Step 4: 복사본 테스트 그린 확인**

Run: `npx vitest run src/utils/soccerAnalytics/`
Expected: 전건 PASS. 실패 시 원인은 복사본 내 임포트 경로(예: `../../gameStateAnalyzer` 참조 테스트)뿐 — **soccerAnalytics 쪽만** 수정해 해결.

- [ ] **Step 5: 원본 무수정 게이트 + 커밋**

Run: `git diff --stat -- src/utils/analyticsV2/` → 빈 출력 확인.

```bash
git add src/utils/soccerAnalytics
git commit -m "feat(soccer): soccerAnalytics — analyticsV2 복사본 생성 (동작 동일, percentile 인라인)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: 공유 탭 6곳 배선 (호출부 무변경)

**Files:**
- Modify: `src/components/dashboard/analytics/PersonalAnalysisTab.jsx`
- Modify: `src/components/dashboard/analytics/SynergyMatrixTab.jsx` (+`isSoccer` prop 신설, 기본 false)
- Modify: `src/components/dashboard/analytics/ChemistryTab.jsx` (GoldenTrioView/RivalryView에 isSoccer 전달)
- Modify: `src/components/dashboard/analytics/AwardsTab.jsx`
- Modify: `src/components/dashboard/analytics/GoldenTrioView.jsx` (+prop)
- ~~Modify: `src/components/dashboard/analytics/RivalryView.jsx` (+prop)~~ ← 미실행이 맞음:
  스펙대로 RivalryView는 기존 `!isSoccer` 가드로 풋살 전용이라 배선 제외 (플랜 작성 오류)
- Modify: `src/components/dashboard/PlayerAnalytics.jsx` (SynergyMatrixTab에 isSoccer 전달)

**Interfaces:**
- Consumes: Task 1의 barrel.
- 패턴(모든 탭 동일 — PersonalAnalysisTab 예시):

```js
// 기존 named import는 그대로 두고, 아래 2줄 + 컴포넌트 상단 1줄만 추가
import * as soccerCalc from '../../../utils/soccerAnalytics';
const futsalCalc = { buildRadarPopulations, calcRadarValues, getPlayerType, calcTrends, calcStreaks, calcPersonalRecords, calcRoundSlope, calcSoloGoalRatio, calcPersonalSynergy, calcSynergyMatrix, calcAssistLinkMatrix, personalLink, calcPlayerSummary };

export default function PersonalAnalysisTab({ ..., isSoccer }) {
  const { buildRadarPopulations, calcRadarValues, getPlayerType, calcTrends, calcStreaks, calcPersonalRecords, calcRoundSlope, calcSoloGoalRatio, calcPersonalSynergy, calcSynergyMatrix, calcAssistLinkMatrix, personalLink, calcPlayerSummary } = isSoccer ? soccerCalc : futsalCalc;
  // 본문 호출부 무변경 (함수 스코프 const가 모듈 임포트를 셰도잉)
```

- 각 파일의 `futsalCalc` 구성원 = 그 파일의 기존 analyticsV2 named import 전부:
  - SynergyMatrixTab: `{ calcSynergyMatrix }` — 시그니처를 `({ matchLogs, C, isSoccer = false })`로 확장
  - ChemistryTab: `{ calcAssistPairs, calcGkChemistry, calcSynergyMatrix }` — 중첩 `<GoldenTrioView ... isSoccer={isSoccer} />`, `<RivalryView ... isSoccer={isSoccer} />` 전달 추가
  - AwardsTab: `{ calcAwards, calcDailyMvp, calcRoundSlope, calcSoloGoalRatio, calcMonthlyRanking, calcVolatility, calcPlayerSummary, calcMetricLeaders }`
  - GoldenTrioView: `{ calcGoldenTrio }` — `isSoccer = false` prop 신설
  - RivalryView: `{ calcRivalry, calcPersonalRivalry }` — `isSoccer = false` prop 신설
  - PlayerAnalytics: `<SynergyMatrixTab matchLogs={matchLogs} C={C} isSoccer={isSoccer} />`

- [ ] **Step 1: 6개 탭 + PlayerAnalytics 수정** (위 패턴 그대로)

- [ ] **Step 2: 컴포넌트 밖 헬퍼 확인**

각 수정 파일에서 컴포넌트 함수 **바깥**(모듈 레벨 헬퍼)에서 calc 함수를 직접 호출하는 곳이 있는지 grep:
`grep -n "calc[A-Z]" <file>` — 있으면 그 헬퍼는 셰도잉이 안 닿으므로 함수 인자로 calc를 받게 조정.

- [ ] **Step 3: 페이즈 1 전체 게이트**

```bash
npx vitest run                                   # 전체 그린(풋살 계산 불변 증명)
npm run build                                    # 빌드 성공
git diff --stat -- src/utils/analyticsV2/        # 빈 출력
grep -rln "soccerAnalytics" src | sort           # 배선 6+1개 컴포넌트 + soccerAnalytics 내부만
```

스모크(`analyticsTabs.smoke.test.jsx`)는 isSoccer 미전달 렌더 = 풋살 기본 경로 검증.

- [ ] **Step 4: diff 정독 후 커밋**

`git diff` 정독: 탭 본문 호출부 무변경, 셰도잉 이름 목록 = futsalCalc 구성원과 일치 확인.

```bash
git add -u src/components src/utils/soccerAnalytics
git commit -m "feat(soccer): 분석 탭 6곳 계산층 네임스페이스 배선 — isSoccer로 soccerAnalytics 선택

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: 풋살 크래시 방어 2건 (analyticsV2 유일 수정)

**Files:**
- Modify: `src/utils/analyticsV2/calcTrends.js`, `src/utils/analyticsV2/calcStreaks.js`
- Test: `src/utils/analyticsV2/__tests__/nullDateGuard.test.js` (신규)

- [ ] **Step 1: 실패 테스트**

```js
import { describe, it, expect } from 'vitest';
import { calcTrends } from '../calcTrends';
import { calcStreaks } from '../calcStreaks';

// date 없는 행 1개가 트렌드/스트릭 전체를 크래시시키지 않아야 한다 (숫자 불변 방어)
describe('date null 정렬 크래시 방어', () => {
  const good = [
    { player: 'A', date: '2026-01-01', goals: 1, keeper_games: 0, conceded: 0 },
    { player: 'A', date: '2026-01-08', goals: 0, keeper_games: 1, conceded: 0 },
  ];
  it('calcStreaks: date undefined 행이 섞여도 던지지 않는다', () => {
    const rows = [...good, { player: 'A', goals: 2 }]; // date 없음
    expect(() => calcStreaks({ playerName: 'A', playerLogs: rows })).not.toThrow();
  });
  it('calcStreaks: 정상 데이터 결과는 수정 전과 동일', () => {
    const r = calcStreaks({ playerName: 'A', playerLogs: good });
    expect(r.scoringStreak).toEqual({ current: 0, best: 1 });
    expect(r.cleanSheetStreak).toEqual({ current: 1, best: 1 });
  });
  it('calcTrends: date undefined 행이 섞여도 던지지 않는다', () => {
    const rows = [...good, { player: 'A', goals: 2 }];
    expect(() => calcTrends({ playerName: 'A', playerLogs: rows, matchLogs: [] })).not.toThrow();
  });
});
```

- [ ] **Step 2: 실패 확인** — `npx vitest run src/utils/analyticsV2/__tests__/nullDateGuard.test.js` → 크래시 케이스 2건 FAIL(TypeError)

- [ ] **Step 3: 수정** — 두 파일의 정렬 비교자만:

```js
.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
```

- [ ] **Step 4: 통과 + 게이트** — 신규 테스트 PASS, `npx vitest run src/utils/analyticsV2/` 전건 PASS(기존 테스트 무수정), `git diff --stat -- src/utils/analyticsV2/`에 두 모듈+신규 테스트만.

- [ ] **Step 5: 커밋** — `fix(analytics): calcTrends/calcStreaks date null 정렬 크래시 방어 — 결과 불변`

---

### Task 4: soccerAnalytics 수정 A — calcStreaks·calcTrends·calcPlayerSummary

**Files:**
- Modify: `src/utils/soccerAnalytics/calcStreaks.js`, `calcTrends.js`, `calcPlayerSummary.js`
- Test: `src/utils/soccerAnalytics/__tests__/reviewFixes.streaksSummary.test.js` (신규)

- [ ] **Step 1: 실패 테스트** (항목별 — 리뷰 #1·#3·#4·#5·#6·#11)

```js
import { describe, it, expect } from 'vitest';
import { calcStreaks } from '../calcStreaks';
import { calcTrends } from '../calcTrends';
import { calcPlayerSummary } from '../calcPlayerSummary';

describe('리뷰픽스: calcStreaks', () => {
  it('#3/#4 date 없는 행에서 던지지 않는다', () => {
    expect(() => calcStreaks({ playerName: 'A', playerLogs: [{ player: 'A', goals: 1 }] })).not.toThrow();
    expect(() => calcTrends({ playerName: 'A', playerLogs: [{ player: 'A' }], matchLogs: [] })).not.toThrow();
  });
  it('#6 CSV 문자열 conceded "0"도 클린시트로 인정', () => {
    const rows = [
      { player: 'G', date: '2026-01-01', keeper_games: 2, conceded: '0' },
      { player: 'G', date: '2026-01-08', keeper_games: '3', conceded: 0 },
    ];
    expect(calcStreaks({ playerName: 'G', playerLogs: rows }).cleanSheetStreak).toEqual({ current: 2, best: 2 });
  });
  it('#11 문자열 keeper_games "0"은 필드 세션으로 스킵', () => {
    const rows = [
      { player: 'G', date: '2026-01-01', keeper_games: 2, conceded: 0 },
      { player: 'G', date: '2026-01-08', keeper_games: '0', conceded: '0' }, // 필드 세션
      { player: 'G', date: '2026-01-15', keeper_games: 1, conceded: 0 },
    ];
    expect(calcStreaks({ playerName: 'G', playerLogs: rows }).cleanSheetStreak).toEqual({ current: 2, best: 2 });
  });
});

describe('리뷰픽스: calcPlayerSummary', () => {
  it('#1 date null 매치가 totalSessions를 부풀리지 않는다', () => {
    const r = calcPlayerSummary({ matchLogs: [
      { date: '2026-01-01', our_members_json: '["A"]', opponent_members_json: '[]', our_score: 1, opponent_score: 0 },
      { date: null, our_members_json: '["A"]', opponent_members_json: '[]', our_score: 0, opponent_score: 0 },
    ] });
    expect(r.totalSessions).toBe(1);
  });
  it('#5 is_extra 매치의 골 이벤트는 집계에서 제외', () => {
    const r = calcPlayerSummary({
      matchLogs: [
        { date: '2026-01-01', match_id: 'R1_C1', our_members_json: '["A"]', opponent_members_json: '[]', our_score: 1, opponent_score: 0 },
        { date: '2026-01-01', match_id: 'R2_C1', is_extra: true, our_members_json: '["A"]', opponent_members_json: '[]', our_score: 3, opponent_score: 0 },
      ],
      eventLogs: [
        { event_type: 'goal', player: 'A', date: '2026-01-01', match_id: 'R1_C1' },
        { event_type: 'goal', player: 'A', date: '2026-01-01', match_id: 'R2_C1' }, // 번외 골
      ],
    });
    expect(r.perPlayer['A'].goals).toBe(1);
  });
});
```

(calcPlayerSummary 리턴 형태는 소스에서 확인해 `perPlayer`/`totalSessions` 접근자를 실제 구조에 맞춰 조정 — 149~151행 참조.)

- [ ] **Step 2: 실패 확인** → 해당 케이스 FAIL

- [ ] **Step 3: 수정**

- calcStreaks/calcTrends: Task 3과 동일한 안전 비교자 + calcStreaks의 두 가드 숫자 강제:

```js
if ((Number(s.keeper_games) || 0) === 0) continue; // 참석했지만 필드만 → 유지
if ((Number(s.conceded) || 0) === 0) { curCs++; if (curCs > bestCs) bestCs = curCs; }
```

- calcPlayerSummary 47행: `sessionDates.add(m.date || '');` → `if (m.date) sessionDates.add(m.date);`
- calcPlayerSummary 이벤트 패스 앞에 번외 매치 키 셋 구축 후 스킵:

```js
// is_extra 매치의 이벤트는 제외 — 매치 패스(46행)와 동일 기준. 이벤트 행엔 is_extra가 없어
// (date, match_id)로 조인한다. match_id 없는 레거시 행은 보수적으로 유지.
const extraKeys = new Set();
for (const m of matchLogs) {
  if (m.is_extra && m.date && m.match_id) extraKeys.add(`${m.date}|${m.match_id}`);
}
for (const e of eventLogs) {
  if (e.date && e.match_id && extraKeys.has(`${e.date}|${e.match_id}`)) continue;
  ...기존 분기 그대로...
}
```

- [ ] **Step 4: 통과 확인** — 신규 + `npx vitest run src/utils/soccerAnalytics/` 전건 PASS
- [ ] **Step 5: 커밋** — `fix(soccer-analytics): 스트릭 타입 강제·트렌드 크래시·참석 분모·번외 골 제외`

---

### Task 5: soccerAnalytics 수정 B — calcAwards·calcDailyMvp·calcVolatility

**Files:**
- Modify: `src/utils/soccerAnalytics/calcAwards.js`, `calcDailyMvp.js`, `calcVolatility.js`
- Test: `src/utils/soccerAnalytics/__tests__/reviewFixes.awards.test.js` (신규)

- [ ] **Step 1: 실패 테스트** (#2·#8·#9·#12·#13·#15)

```js
import { describe, it, expect } from 'vitest';
import { calcAwards } from '../calcAwards';
import { calcDailyMvp } from '../calcDailyMvp';
import { calcVolatility } from '../calcVolatility';

describe('리뷰픽스: calcAwards', () => {
  it('#8 날짜·매치ID 둘 다 없는 골은 해트트릭 집계 제외', () => {
    const eventLogs = [1, 2, 3].map(() => ({ event_type: 'goal', player: 'A' })); // 무날짜·무매치ID 3골
    const r = calcAwards({ playerLogs: [], eventLogs });
    expect(r.hatTricks ?? r.hattricks ?? []).toEqual([]); // 실제 반환 키는 소스 확인 후 조정
  });
  it('#13 공백 포함 이름 해트트릭 귀속', () => {
    const eventLogs = [1, 2, 3].map(() => ({ event_type: 'goal', player: '박 준태', date: '2026-01-01', match_id: 'R1_C1' }));
    const r = calcAwards({ playerLogs: [], eventLogs });
    const hat = (r.hatTricks ?? r.hattricks ?? []);
    expect(hat[0]?.player).toBe('박 준태');
  });
  it('#15 이벤트 미커버 날짜의 playerLogs 자책도 합산', () => {
    const r = calcAwards({
      playerLogs: [{ player: 'B', date: '2026-01-01', owngoals: 2 }], // 이벤트 로그 밖 날짜
      eventLogs: [{ event_type: 'owngoal', player: 'B', date: '2026-03-01', match_id: 'R1_C1' }],
    });
    const own = (r.owngoalKings ?? []).find(x => x.player === 'B');
    expect(own?.owngoals ?? own?.value).toBe(3);
  });
});

describe('리뷰픽스: calcDailyMvp (축구 게이트)', () => {
  it('#2 크로바·고구마·랭크점수 없이 골만 있어도 MVP가 나온다', () => {
    const r = calcDailyMvp({ playerGameLogs: [
      { player: 'A', date: '2026-01-01', goals: 2, assists: 0, cleansheets: 0, crova: 0, goguma: 0, rank_score: 0 },
      { player: 'B', date: '2026-01-01', goals: 0, assists: 1, cleansheets: 0, crova: 0, goguma: 0, rank_score: 0 },
    ] });
    expect(r.recent[0]?.mvps).toEqual(['A']);
  });
  it('#9 전원 0포인트인 날은 스킵(전원 공동 MVP 금지)', () => {
    const r = calcDailyMvp({ playerGameLogs: [
      { player: 'A', date: '2026-01-01', goals: 0, rank_score: 3 },
      { player: 'B', date: '2026-01-01', goals: 0, rank_score: 1 },
    ] });
    expect(r.recent).toEqual([]);
  });
});

describe('리뷰픽스: calcVolatility', () => {
  it('#12 같은 선수가 몰빵형·꾸준형에 동시 선정되지 않는다', () => {
    const playerLogs = [];
    for (const p of ['A', 'B', 'C']) {
      for (let i = 1; i <= 5; i++) playerLogs.push({ player: p, date: `2026-01-0${i}`, goals: i % 2, assists: 0 });
    }
    const r = calcVolatility({ playerLogs, minGames: 3, topN: 3 });
    const overlap = r.streaky.map(s => s.player).filter(p => r.consistent.some(c => c.player === p));
    expect(overlap).toEqual([]);
  });
});
```

(각 함수의 실제 파라미터·반환 키는 소스 상단을 확인해 테스트를 실제 시그니처에 맞춘 뒤 실패를 확인한다 — 시그니처 추정 금지.)

- [ ] **Step 2: 실패 확인**

- [ ] **Step 3: 수정**

- calcAwards 해트트릭: 구조화 집계로 교체(#8·#13 동시 해결):

```js
const goalsPerMatch = {}; // key → { player, cnt }
for (const e of eventLogs || []) {
  if (e.event_type !== 'goal') continue;
  if (!e.player) continue;
  if (!e.date && !e.match_id) continue; // 매치 식별 불가 골은 해트트릭 판정 불가(#8)
  const key = `${e.player} ${e.date || ''} ${e.match_id || ''}`;
  if (!goalsPerMatch[key]) goalsPerMatch[key] = { player: e.player, cnt: 0 };
  goalsPerMatch[key].cnt++;
}
const hat = {};
for (const { player, cnt } of Object.values(goalsPerMatch)) {
  if (cnt < 3) continue;
  hat[player] = (hat[player] || 0) + 1; // 이름을 키에서 재파싱하지 않는다(#13)
}
```

- calcAwards 자책 병합(#15): 이진 스위치 → 날짜 커버리지 병합:

```js
// 이벤트 로그가 커버하는 날짜는 이벤트가 권위(그날 자책 0건도 사실), 그 외 날짜는 playerLogs 보충
const eventDates = new Set((eventLogs || []).map(e => e.date).filter(Boolean));
for (const e of eventLogs || []) {
  if (e.event_type !== 'owngoal' || !e.player) continue;
  own[e.player] = (own[e.player] || 0) + 1;
}
for (const p of playerLogs || []) {
  if (p.date && eventDates.has(p.date)) continue;
  const og = Number(p.owngoals) || 0;
  if (og > 0) own[p.player] = (own[p.player] || 0) + og;
}
```

- calcDailyMvp(#2·#9): hasPointData 게이트 삭제, 양수 포인트 게이트로 교체 — 축구엔 크로바·고구마·랭크점수 제도가 없다:

```js
// (rows 구성에서 hasPointData 필드 제거)
for (const date of dates) {
  const rows = byDate[date];
  const maxPoints = Math.max(...rows.map(r => r.points));
  if (maxPoints <= 0) continue; // 양수 기여가 없는 날은 MVP 없음(전원 0점 공동 MVP 방지)
  ...
}
```

- calcVolatility(#12): 상호 배제 — streaky 선정자를 consistent 후보에서 제외:

```js
const streakySet = new Set(streaky.map(s => s.player));
const consistent = stats
  .filter(s => s.mean >= median && !streakySet.has(s.player))
  .sort((a, b) => a.std - b.std || a.player.localeCompare(b.player, 'ko'))
  .slice(0, topN);
```

- [ ] **Step 4: 통과 확인** — `npx vitest run src/utils/soccerAnalytics/` 전건 PASS. 복사해 온 기존 테스트 중 futsal 게이트 전제(예: calcDailyMvp hasPointData) 테스트는 **soccerAnalytics 쪽만** 새 정책에 맞게 갱신(analyticsV2 원본 테스트는 무수정).
- [ ] **Step 5: 커밋** — `fix(soccer-analytics): 해트트릭 키·자책 병합·데일리MVP 게이트·변동성 중복 선정`

---

### Task 6: soccerScoring.js 3건 (#7·#10·#14)

**Files:**
- Modify: `src/utils/soccerScoring.js`
- Test: `src/utils/__tests__/soccerScoring.reviewFixes.test.js` (신규)

- [ ] **Step 1: 실패 테스트**

```js
import { describe, it, expect } from 'vitest';
import { calcSoccerPlayerStats, buildEventLogRows } from '../soccerScoring';

describe('리뷰픽스: soccerScoring', () => {
  it('#14 soccerMatches undefined에 빈 결과', () => {
    expect(calcSoccerPlayerStats(undefined)).toEqual({});
  });
  it('#10 startedAt 없으면 inputTime 빈 문자열(Invalid Date 금지)', () => {
    const rows = buildEventLogRows([{ status: 'finished', matchIdx: 0, opponent: '한울', lineup: ['A'], gk: 'A', defenders: [], events: [] }], '2026-01-01');
    expect(rows[0].inputTime).toBe('');
  });
  it('#7 timestamp 없는 이벤트도 결정적 순서(먼저)로 정렬', () => {
    const rows = buildEventLogRows([{ status: 'finished', matchIdx: 0, opponent: '한울', lineup: [], gk: '', defenders: [], startedAt: 1e12,
      events: [ { type: 'goal', player: 'B', timestamp: 1e12 + 5000 }, { type: 'goal', player: 'A' } ] }], '2026-01-01');
    const goals = rows.filter(r => r.event === '골').map(r => r.player);
    expect(goals).toEqual(['A', 'B']); // 무timestamp → 0으로 취급, 항상 앞
  });
});
```

- [ ] **Step 2: 실패 확인**

- [ ] **Step 3: 수정**

```js
export function calcSoccerPlayerStats(soccerMatches) {
  ...
  for (const match of (soccerMatches || [])) {
```

buildEventLogRows에 로컬 헬퍼 추가 후 `new Date(...).toLocaleString("ko-KR")` 4개 호출부 전부 교체:

```js
// timestamp 부재 시 'Invalid Date' 문자열이 시트에 영구 기록되는 것을 방지
const fmtTime = (ts) => (ts ? new Date(ts).toLocaleString("ko-KR") : "");
```

정렬: `.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));`

- [ ] **Step 4: 통과 + 기존 soccerScoring 테스트 회귀 확인** — `npx vitest run src/utils/__tests__/`
- [ ] **Step 5: 커밋** — `fix(soccer): 이벤트로그 시간 포맷·정렬 결정성·null 가드`

---

### Task 7: AwardsTab 축구 데일리 MVP 노출 확인 + 최종 검증

**Files:**
- Modify(필요시): `src/components/dashboard/analytics/AwardsTab.jsx`

- [ ] **Step 1: AwardsTab의 데일리 MVP 섹션 확인** — 14행 주석("crova:0/goguma:0…") 주변을 읽고, 축구 모드에서 섹션이 숨겨지거나 풋살 전제 문구가 남아 있으면 `isSoccer` 분기로 정정. calcDailyMvp(축구 게이트 수정판) 결과가 그대로 렌더되면 무수정.

- [ ] **Step 2: 풋살 무영향 게이트 5종 전체 재실행** (스펙 목록 그대로)

```bash
npx vitest run && npm run build
git diff main --stat -- src/utils/analyticsV2/    # calcTrends/calcStreaks/nullDateGuard.test만
grep -rln "soccerAnalytics" src | sort
```

- [ ] **Step 3: jsx 변경분 diff 정독** (메모리 규칙 — RTL 부재 보완)

- [ ] **Step 4: 커밋 후 superpowers:finishing-a-development-branch로 진행** (push+PR 권장 — 테니스 세션 무간섭)
