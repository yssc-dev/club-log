# 하버FC 축구 상대별·수비 지표 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 축구(하버FC) 분석에 ① 상대팀별 개인성적, ② 수비수 개인 실점억제율, ③ DF 페어 실점 케미를 추가한다.

**Architecture:** soccerAnalytics에 계산 모듈 2개(calcOpponentBreakdown, calcDefenseAnalysis)를 추가하고, UI는 ChemistryTab의 축구 전용 '수비케미' 서브탭(신규 DefenseAnalysisView)과 PersonalAnalysisTab의 '상대팀별 성적' 카드(축구 전용)로 노출한다. 데이터는 이미 로드되는 matchLogs/eventLogs를 그대로 소비 — 시트/Apps Script 변경 없음.

**Tech Stack:** React(jsx, 인라인 스타일), vitest.

**Spec:** 본 대화의 검토 결론(2026-08-13). 데이터 실측 근거는 메모리 `harborfc-defense-data` 참조.

## Global Constraints

- 축구 지표 수정은 `src/utils/soccerAnalytics/`만. `src/utils/analyticsV2/`(풋살 전용)는 절대 수정 금지.
- 신규 계산 모듈은 `src/utils/soccerAnalytics/index.js` barrel에 export 추가. 단, 풋살 barrel(analyticsV2)과 이름 대응이 없는 축구 전용 함수이므로 **탭의 `isSoccer ? soccerCalc : futsalCalc` 셰도잉 destructure를 타면 안 되고** `soccerCalc.calcX` 직접 참조 또는 소비 컴포넌트에서 직접 import.
- goal 이벤트 행은 어떤 키로도 dedupe 금지 (한 행 = 한 골).
- `is_extra` 매치는 모든 집계에서 제외 (기존 규약, isExtraFilter.test.js 참조).
- 명단 신뢰 경기 판별 = `game_id`가 `legacy_`로 시작하지 않는 로그_매치 행 (실측: 하버FC legacy 59행 전부 부분명단, 비legacy는 명단 11~12명 + '휴식' 2행(명단 0명 → 빈 명단 제외로 자연 처리)).
- 상대팀명은 로그_매치 `opponent_team_name`을 신뢰 (이벤트→매치 조인 키 `date|String(match_id)`, API가 날짜를 이미 `yyyy-MM-dd`로 정규화함 — Code.js `_toDateStr`).
- 정렬 tie-break는 기존 규약: 수치 → games → `localeCompare(x, 'ko')`.
- 베이스라인 표본 0이면 `hasBaseline: false`·`delta: null` — pairBaseline 규약대로 소비자는 '–' 표시.
- RTL 하네스 없음: jsx 변경은 build + 선언순서/문법 육안 정독으로 검증.
- 풋살 화면 영향 금지: 신규 UI는 전부 `isSoccer` 가드 뒤에만 렌더.

---

### Task 1: calcOpponentBreakdown (상대팀별 개인성적 계산)

**Files:**
- Create: `src/utils/soccerAnalytics/calcOpponentBreakdown.js`
- Create: `src/utils/soccerAnalytics/__tests__/calcOpponentBreakdown.test.js`
- Modify: `src/utils/soccerAnalytics/index.js` (export 한 줄 추가)

**Interfaces:**
- Consumes: `parseActualPlayers` from `./parseMembers`
- Produces: `calcOpponentBreakdown({ eventLogs, matchLogs })` → `{ players: string[], byPlayer: { [name]: Array<{ opponent, goals, assists, games, wins, draws, losses }> } }`. byPlayer 배열 정렬: games desc → goals desc → 상대명 가나다.

- [ ] **Step 1: Write the failing test**

```js
// src/utils/soccerAnalytics/__tests__/calcOpponentBreakdown.test.js
import { describe, it, expect } from 'vitest';
import { calcOpponentBreakdown } from '../calcOpponentBreakdown';

describe('calcOpponentBreakdown', () => {
  it('returns empty for no logs', () => {
    const r = calcOpponentBreakdown({ eventLogs: [], matchLogs: [] });
    expect(r.players).toEqual([]);
    expect(r.byPlayer).toEqual({});
  });

  it('골·어시는 이벤트에서, 상대명은 로그_매치 조인으로 귀속', () => {
    const matchLogs = [
      { date: '2026-06-10', match_id: 1, opponent_team_name: '터틀파크', game_id: 's_1', our_members_json: '["A","B"]', our_score: 2, opponent_score: 0 },
    ];
    const eventLogs = [
      { date: '2026-06-10', match_id: 1, event_type: 'goal', player: 'A', related_player: 'B', opponent: '터틀' }, // 이벤트쪽 옛 표기 → 매치 조인이 이김
      { date: '2026-06-10', match_id: 1, event_type: 'goal', player: 'A', related_player: '', opponent: '터틀' },
    ];
    const r = calcOpponentBreakdown({ eventLogs, matchLogs });
    const a = r.byPlayer['A'].find(x => x.opponent === '터틀파크');
    expect(a.goals).toBe(2); // 동일 내용 골 2행 dedupe 금지
    expect(r.byPlayer['B'].find(x => x.opponent === '터틀파크').assists).toBe(1);
  });

  it('경기수·승패는 legacy_ 백필 경기 제외, 골은 포함', () => {
    const matchLogs = [
      { date: '2026-01-06', match_id: 1, opponent_team_name: '한울', game_id: 'legacy_2026-01-06_하버FC', our_members_json: '["A"]', our_score: 3, opponent_score: 1 },
      { date: '2026-06-10', match_id: 1, opponent_team_name: '한울', game_id: 's_2', our_members_json: '["A"]', our_score: 0, opponent_score: 1 },
    ];
    const eventLogs = [
      { date: '2026-01-06', match_id: 1, event_type: 'goal', player: 'A', related_player: '', opponent: '한울' },
    ];
    const r = calcOpponentBreakdown({ eventLogs, matchLogs });
    const a = r.byPlayer['A'].find(x => x.opponent === '한울');
    expect(a.goals).toBe(1);     // legacy 경기 골도 집계
    expect(a.games).toBe(1);     // 경기수는 신뢰 명단 경기만
    expect(a.losses).toBe(1);
    expect(a.wins).toBe(0);
  });

  it('is_extra 매치는 경기수·이벤트 모두 제외, 명단 빈 경기(휴식)는 경기수 제외', () => {
    const matchLogs = [
      { date: '2026-06-10', match_id: 1, opponent_team_name: '한울', game_id: 's_1', our_members_json: '["A"]', our_score: 1, opponent_score: 0, is_extra: true },
      { date: '2026-06-10', match_id: 3, opponent_team_name: '휴식', game_id: 's_1', our_members_json: '[]', our_score: 0, opponent_score: 0 },
    ];
    const eventLogs = [
      { date: '2026-06-10', match_id: 1, event_type: 'goal', player: 'A', related_player: '', opponent: '한울' },
    ];
    const r = calcOpponentBreakdown({ eventLogs, matchLogs });
    expect(r.byPlayer['A']).toBeUndefined();
    expect(r.players).toEqual([]);
  });

  it('byPlayer 정렬: games desc → goals desc → 가나다', () => {
    const matchLogs = [
      { date: '2026-06-10', match_id: 1, opponent_team_name: '한울', game_id: 's_1', our_members_json: '["A"]', our_score: 1, opponent_score: 0 },
      { date: '2026-06-10', match_id: 2, opponent_team_name: '한울', game_id: 's_1', our_members_json: '["A"]', our_score: 1, opponent_score: 1 },
      { date: '2026-06-10', match_id: 3, opponent_team_name: '아이콘', game_id: 's_1', our_members_json: '["A"]', our_score: 0, opponent_score: 2 },
    ];
    const r = calcOpponentBreakdown({ eventLogs: [], matchLogs });
    expect(r.byPlayer['A'].map(x => x.opponent)).toEqual(['한울', '아이콘']);
    const 한울 = r.byPlayer['A'][0];
    expect([한울.games, 한울.wins, 한울.draws, 한울.losses]).toEqual([2, 1, 1, 0]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/soccerAnalytics/__tests__/calcOpponentBreakdown.test.js`
Expected: FAIL (모듈 없음)

- [ ] **Step 3: Write implementation**

```js
// src/utils/soccerAnalytics/calcOpponentBreakdown.js
// 상대팀별 개인성적 (축구 전용): 선수별 × 상대팀별 골/어시/경기/승패.
// 골·어시 = 로그_이벤트 전 기간. 경기수·승패 = 명단 신뢰 경기만(legacy_ 백필 부분명단 제외).
// 상대팀명은 로그_매치 (date|match_id) 조인으로 정규화 — 이벤트쪽 표기 흔들림('터틀' 등) 방지.
import { parseActualPlayers } from './parseMembers';

const isTrustedRoster = (m) => !String(m.game_id || '').startsWith('legacy_');

export function calcOpponentBreakdown({ eventLogs, matchLogs }) {
  const oppByKey = {};
  const extraKeys = new Set();
  for (const m of matchLogs || []) {
    const key = `${m.date}|${String(m.match_id ?? '')}`;
    const opp = String(m.opponent_team_name || '').trim();
    if (opp) oppByKey[key] = opp;
    if (m.is_extra) extraKeys.add(key);
  }

  const cells = {};
  const ensure = (name, opp) => {
    if (!cells[name]) cells[name] = {};
    if (!cells[name][opp]) cells[name][opp] = { goals: 0, assists: 0, games: 0, wins: 0, draws: 0, losses: 0 };
    return cells[name][opp];
  };

  for (const e of eventLogs || []) {
    if (e.event_type !== 'goal') continue; // goal 행 dedupe 금지 — 한 행 = 한 골
    const key = `${e.date}|${String(e.match_id ?? '')}`;
    if (extraKeys.has(key)) continue;
    const opp = oppByKey[key] || String(e.opponent || '').trim();
    if (!opp) continue;
    if (e.player) ensure(e.player, opp).goals++;
    if (e.related_player) ensure(e.related_player, opp).assists++;
  }

  for (const m of matchLogs || []) {
    if (m.is_extra) continue;
    if (!isTrustedRoster(m)) continue; // legacy 백필 명단 = 골 관여자 역산 부분명단 → 경기수 오염 방지
    const members = parseActualPlayers(m.our_members_json);
    if (members.length === 0) continue;
    const opp = String(m.opponent_team_name || '').trim();
    if (!opp) continue;
    const our = Number(m.our_score) || 0;
    const their = Number(m.opponent_score) || 0;
    for (const name of members) {
      const c = ensure(name, opp);
      c.games++;
      if (our > their) c.wins++;
      else if (our === their) c.draws++;
      else c.losses++;
    }
  }

  const byPlayer = {};
  for (const name of Object.keys(cells)) {
    byPlayer[name] = Object.entries(cells[name])
      .map(([opponent, c]) => ({ opponent, ...c }))
      .sort((a, b) => b.games - a.games || b.goals - a.goals || a.opponent.localeCompare(b.opponent, 'ko'));
  }
  return {
    players: Object.keys(byPlayer).sort((a, b) => a.localeCompare(b, 'ko')),
    byPlayer,
  };
}
```

barrel(`src/utils/soccerAnalytics/index.js`)의 `export * from './calcMonthlyRanking';` 근처(알파벳 순서 유지)에 추가:

```js
export * from './calcOpponentBreakdown';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/soccerAnalytics/__tests__/calcOpponentBreakdown.test.js`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/utils/soccerAnalytics/calcOpponentBreakdown.js src/utils/soccerAnalytics/__tests__/calcOpponentBreakdown.test.js src/utils/soccerAnalytics/index.js
git commit -m "feat(soccer): 상대팀별 개인성적 계산 calcOpponentBreakdown — 매치조인 상대명·legacy 명단 경기수 제외"
```

---

### Task 2: calcDefenseAnalysis (수비수 억제율 + DF 페어 케미 계산)

**Files:**
- Create: `src/utils/soccerAnalytics/calcDefenseAnalysis.js`
- Create: `src/utils/soccerAnalytics/__tests__/calcDefenseAnalysis.test.js`
- Modify: `src/utils/soccerAnalytics/index.js` (export 한 줄 추가)

**Interfaces:**
- Consumes: `parseActualPlayers` from `./parseMembers`
- Produces: `calcDefenseAnalysis({ matchLogs, individualThreshold = 8, pairThreshold = 5 })` →
  `{ scopeMatches, totalConceded, teamConcededPerGame, individuals: Array<{ name, games, conceded, cleanSheets, concededPerGame, cleanRate, baselineConcededPerGame, delta, hasBaseline }>, pairs: Array<{ a, b, ...동일 필드 }>, worstPairs: pairs와 동일 배열의 역방향 정렬 }`.
  - delta = 부재 시 경기당 실점 − 출전 시 경기당 실점 (양수 = 억제). hasBaseline=false면 delta/baseline은 null.
  - individuals·pairs 정렬: delta desc(null은 맨 뒤) → games desc → 가나다. worstPairs는 delta asc(null 맨 뒤).

- [ ] **Step 1: Write the failing test**

```js
// src/utils/soccerAnalytics/__tests__/calcDefenseAnalysis.test.js
import { describe, it, expect } from 'vitest';
import { calcDefenseAnalysis } from '../calcDefenseAnalysis';

// 헬퍼: 수비수 명단+실점만 다른 최소 매치 행
const m = (dfs, conceded, extra = {}) => ({
  our_defenders_json: JSON.stringify(dfs), opponent_score: conceded, ...extra,
});

describe('calcDefenseAnalysis', () => {
  it('수비수 기록 없는 경기·is_extra 경기는 스코프 제외', () => {
    const r = calcDefenseAnalysis({ matchLogs: [
      m([], 3),
      { opponent_score: 2 },                 // our_defenders_json 없음(레거시)
      m(['A', 'B'], 1, { is_extra: true }),
    ] });
    expect(r.scopeMatches).toBe(0);
    expect(r.individuals).toEqual([]);
    expect(r.pairs).toEqual([]);
  });

  it('개인 억제율: 출전 vs 부재 경기당 실점 차', () => {
    const r = calcDefenseAnalysis({
      matchLogs: [
        m(['A', 'B'], 0), // A 출전: 0실점
        m(['A', 'C'], 1), // A 출전: 1실점
        m(['B', 'C'], 3), // A 부재: 3실점
      ],
      individualThreshold: 2, pairThreshold: 2,
    });
    const a = r.individuals.find(x => x.name === 'A');
    expect(a.games).toBe(2);
    expect(a.concededPerGame).toBeCloseTo(0.5);
    expect(a.baselineConcededPerGame).toBeCloseTo(3);
    expect(a.delta).toBeCloseTo(2.5); // 양수 = 억제
    expect(a.hasBaseline).toBe(true);
    expect(a.cleanSheets).toBe(1);
    expect(a.cleanRate).toBeCloseTo(0.5);
  });

  it('전 경기 출전 수비수는 hasBaseline=false·delta null, 정렬 맨 뒤', () => {
    const r = calcDefenseAnalysis({
      matchLogs: [m(['A', 'B'], 0), m(['A', 'C'], 2)],
      individualThreshold: 1, pairThreshold: 99,
    });
    const a = r.individuals.find(x => x.name === 'A');
    expect(a.hasBaseline).toBe(false);
    expect(a.delta).toBeNull();
    expect(a.baselineConcededPerGame).toBeNull();
    expect(r.individuals[r.individuals.length - 1].name).toBe('A'); // null delta는 best 정렬 맨 뒤
  });

  it('페어: 동반 출전 경기만 집계, threshold 미달 페어 제외', () => {
    const logs = [
      m(['A', 'B'], 0), m(['A', 'B'], 1), // A-B 2경기 (합 1실점)
      m(['A', 'C'], 5),                   // A-C 1경기 → threshold 2 미달
    ];
    const r = calcDefenseAnalysis({ matchLogs: logs, individualThreshold: 99, pairThreshold: 2 });
    expect(r.pairs).toHaveLength(1);
    const ab = r.pairs[0];
    expect([ab.a, ab.b]).toEqual(['A', 'B']);
    expect(ab.games).toBe(2);
    expect(ab.concededPerGame).toBeCloseTo(0.5);
    expect(ab.baselineConcededPerGame).toBeCloseTo(5); // 동반 아닌 경기 = A-C전 1경기 5실점
    expect(ab.delta).toBeCloseTo(4.5);
    expect(ab.cleanSheets).toBe(1);
  });

  it('worstPairs는 delta 오름차순', () => {
    const logs = [
      m(['A', 'B'], 0), m(['A', 'B'], 0),
      m(['C', 'D'], 3), m(['C', 'D'], 3),
    ];
    const r = calcDefenseAnalysis({ matchLogs: logs, individualThreshold: 99, pairThreshold: 2 });
    expect(r.pairs[0].a).toBe('A');      // best: A-B (억제 +3)
    expect(r.worstPairs[0].a).toBe('C'); // worst: C-D (억제 -3)
  });

  it('수비수 명단 중복 이름은 1회만 집계', () => {
    const r = calcDefenseAnalysis({ matchLogs: [m(['A', 'A', 'B'], 1)], individualThreshold: 1, pairThreshold: 1 });
    expect(r.individuals.find(x => x.name === 'A').games).toBe(1);
    expect(r.pairs).toHaveLength(1); // A-B만, A-A 없음
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/soccerAnalytics/__tests__/calcDefenseAnalysis.test.js`
Expected: FAIL (모듈 없음)

- [ ] **Step 3: Write implementation**

```js
// src/utils/soccerAnalytics/calcDefenseAnalysis.js
// 수비 분석 (축구 전용): our_defenders_json 기반 개인 실점억제율 + DF 페어 실점 케미.
// 집계 범위 = is_extra 아님 + 수비수 기록이 있는 경기만(레코더 도입 후 — 레거시엔 defenders 없음).
// delta = (본인/페어 부재 경기의 경기당 실점) − (출전 경기의 경기당 실점). 양수 = 억제.
// 베이스라인 표본 0이면 hasBaseline=false·delta=null — pairBaseline 규약과 동일, 소비자는 '–' 표시.
// 한계(의도): GK·상대 강도 미보정 — UI 캡션에 명시.
import { parseActualPlayers } from './parseMembers';

export function calcDefenseAnalysis({ matchLogs, individualThreshold = 8, pairThreshold = 5 }) {
  const scope = [];
  for (const m of matchLogs || []) {
    if (m.is_extra) continue;
    const dfs = [...new Set(parseActualPlayers(m.our_defenders_json))];
    if (dfs.length === 0) continue;
    dfs.sort((a, b) => a.localeCompare(b, 'ko'));
    scope.push({ dfs, conceded: Number(m.opponent_score) || 0 });
  }
  const totalMatches = scope.length;
  const totalConceded = scope.reduce((s, x) => s + x.conceded, 0);

  const indiv = {};
  const pair = {};
  const bump = (map, key, conceded) => {
    if (!map[key]) map[key] = { games: 0, conceded: 0, cleanSheets: 0 };
    const s = map[key];
    s.games++; s.conceded += conceded;
    if (conceded === 0) s.cleanSheets++;
  };
  for (const { dfs, conceded } of scope) {
    for (const d of dfs) bump(indiv, d, conceded);
    for (let i = 0; i < dfs.length; i++)
      for (let j = i + 1; j < dfs.length; j++) bump(pair, `${dfs[i]}|${dfs[j]}`, conceded);
  }

  const finish = (s) => {
    const baseGames = totalMatches - s.games;
    const hasBaseline = baseGames > 0;
    const concededPerGame = s.games > 0 ? s.conceded / s.games : 0;
    const baselineConcededPerGame = hasBaseline ? (totalConceded - s.conceded) / baseGames : null;
    return {
      ...s,
      concededPerGame,
      cleanRate: s.games > 0 ? s.cleanSheets / s.games : 0,
      baselineConcededPerGame,
      delta: hasBaseline ? baselineConcededPerGame - concededPerGame : null,
      hasBaseline,
    };
  };
  // null delta(베이스라인 없음)는 best/worst 어느 쪽에서도 맨 뒤 — 오염된 비교값을 순위에 올리지 않는다
  const cmp = (dir) => (a, b) => {
    const av = a.delta, bv = b.delta;
    if ((av == null) !== (bv == null)) return av == null ? 1 : -1;
    if (av != null && av !== bv) return dir === 'desc' ? bv - av : av - bv;
    return b.games - a.games
      || (a.name || a.a).localeCompare(b.name || b.a, 'ko')
      || (a.b || '').localeCompare(b.b || '', 'ko');
  };

  const individuals = Object.entries(indiv)
    .map(([name, s]) => ({ name, ...finish(s) }))
    .filter(x => x.games >= individualThreshold)
    .sort(cmp('desc'));

  const allPairs = Object.entries(pair)
    .map(([key, s]) => { const [a, b] = key.split('|'); return { a, b, ...finish(s) }; })
    .filter(x => x.games >= pairThreshold);

  return {
    scopeMatches: totalMatches,
    totalConceded,
    teamConcededPerGame: totalMatches > 0 ? totalConceded / totalMatches : 0,
    individuals,
    pairs: [...allPairs].sort(cmp('desc')),
    worstPairs: [...allPairs].sort(cmp('asc')),
  };
}
```

barrel에 추가 (알파벳 순서):

```js
export * from './calcDefenseAnalysis';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/soccerAnalytics/__tests__/calcDefenseAnalysis.test.js`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add src/utils/soccerAnalytics/calcDefenseAnalysis.js src/utils/soccerAnalytics/__tests__/calcDefenseAnalysis.test.js src/utils/soccerAnalytics/index.js
git commit -m "feat(soccer): 수비수 실점억제율+DF 페어 케미 계산 calcDefenseAnalysis — 부재 베이스라인 delta·hasBaseline 규약"
```

---

### Task 3: DefenseAnalysisView + ChemistryTab '수비케미' 서브탭

**Files:**
- Create: `src/components/dashboard/analytics/DefenseAnalysisView.jsx`
- Modify: `src/components/dashboard/analytics/ChemistryTab.jsx`

**Interfaces:**
- Consumes: `calcDefenseAnalysis` from `'../../../utils/soccerAnalytics'` (직접 import — 풋살 barrel에 대응 함수 없으므로 셰도잉 destructure 금지), ChemistryTab props `{ matchLogs, C, isSoccer }`.
- Produces: `<DefenseAnalysisView matchLogs C />` — 축구 전용 뷰.

- [ ] **Step 1: DefenseAnalysisView 작성**

```jsx
// src/components/dashboard/analytics/DefenseAnalysisView.jsx
// 수비케미(축구 전용): DF 페어 실점 케미 + 개인 실점억제율.
// 집계 범위 = 수비수 기록(our_defenders_json)이 있는 경기만 — 레거시 구간 자동 제외.
import { useMemo } from 'react';
import { calcDefenseAnalysis } from '../../../utils/soccerAnalytics';

const fmt = (v) => (v == null ? '–' : v.toFixed(2));

export default function DefenseAnalysisView({ matchLogs, C }) {
  const d = useMemo(() => calcDefenseAnalysis({ matchLogs: matchLogs || [] }), [matchLogs]);

  if (d.scopeMatches === 0) {
    return (
      <div style={{ textAlign: 'center', padding: 30, color: C.gray, fontSize: 12 }}>
        수비수 기록이 있는 경기가 없습니다
      </div>
    );
  }

  const PairRow = ({ p, sign }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: `1px dashed ${C.grayDarker}`, fontSize: 12 }}>
      <span style={{ color: C.gray }}>{p.a}·{p.b} <span style={{ fontSize: 10 }}>({p.games})</span></span>
      <span style={{ color: sign === 'best' ? C.green : C.red, fontWeight: 600 }}>
        {fmt(p.concededPerGame)}실점 · CS {p.cleanSheets}/{p.games}
      </span>
    </div>
  );

  return (
    <div>
      <div style={{ fontSize: 11, color: C.gray, marginBottom: 10, lineHeight: 1.5 }}>
        수비수 기록이 있는 {d.scopeMatches}경기 기준 · 팀 평균 경기당 {fmt(d.teamConcededPerGame)}실점.
        <br />⚠️ GK·상대 강도 미보정 — 실점은 수비수 단독 지표가 아님.
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 18 }}>
        <div>
          <div style={{ fontSize: 11, color: C.green, fontWeight: 700, marginBottom: 4 }}>BEST 페어 (억제 Δ)</div>
          {d.pairs.length === 0 ? (
            <div style={{ fontSize: 11, color: C.gray }}>표본 부족 (페어당 5경기 이상 필요)</div>
          ) : d.pairs.slice(0, 5).map(p => <PairRow key={`${p.a}|${p.b}`} p={p} sign="best" />)}
        </div>
        <div>
          <div style={{ fontSize: 11, color: C.red, fontWeight: 700, marginBottom: 4 }}>WORST</div>
          {d.worstPairs.length === 0 ? (
            <div style={{ fontSize: 11, color: C.gray }}>표본 부족</div>
          ) : d.worstPairs.slice(0, 5).map(p => <PairRow key={`${p.a}|${p.b}`} p={p} sign="worst" />)}
        </div>
      </div>

      <div style={{ fontSize: 11, color: C.white, fontWeight: 700, marginBottom: 2 }}>개인 실점억제율</div>
      <div style={{ fontSize: 10, color: C.gray, marginBottom: 6 }}>
        Δ = 부재 시 경기당 실점 − 출전 시 경기당 실점 (양수=억제) · 8경기 이상
      </div>
      {d.individuals.length === 0 ? (
        <div style={{ fontSize: 11, color: C.gray }}>표본 부족 (8경기 이상 필요)</div>
      ) : d.individuals.map(x => (
        <div key={x.name} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: `1px dashed ${C.grayDarker}`, fontSize: 12 }}>
          <span style={{ color: C.white }}>
            {x.name} <span style={{ color: C.gray, fontSize: 10 }}>({x.games}경기 · CS {x.cleanSheets})</span>
          </span>
          <span style={{ color: C.gray, fontVariantNumeric: 'tabular-nums' }}>
            출전 {fmt(x.concededPerGame)} / 부재 {fmt(x.baselineConcededPerGame)} ·{' '}
            <span style={{ color: x.delta == null ? C.gray : x.delta >= 0 ? C.green : C.red, fontWeight: 700 }}>
              Δ{x.delta == null ? '–' : (x.delta >= 0 ? '+' : '') + x.delta.toFixed(2)}
            </span>
          </span>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: ChemistryTab 배선**

`src/components/dashboard/analytics/ChemistryTab.jsx` 수정 4곳:

1. import에 `useEffect` 추가: `import { useState, useMemo, useEffect } from 'react';`
2. import 추가: `import DefenseAnalysisView from './DefenseAnalysisView';`
3. `const [sub, setSub] = useState('trio');` 바로 아래에 종목 전환 리셋(기존 rival 좌초 버그도 함께 해소):

```jsx
  // 종목 전환 시 종목 전용 서브탭(defense/rival)에 좌초 방지 — TeamDashboard activeTab 'records' 리셋과 동일 규약
  useEffect(() => { setSub('trio'); }, [isSoccer]);
```

4. subs 배열의 rival 항목 위에 추가 + 렌더 라인 추가:

```jsx
    // 수비케미는 our_defenders_json이 있는 축구 전용
    ...(isSoccer ? [{ key: 'defense', label: '수비케미' }] : []),
```

```jsx
      {sub === 'defense' && isSoccer && <DefenseAnalysisView matchLogs={matchLogs} C={C} />}
```

- [ ] **Step 3: 검증 — 테스트·빌드·jsx 육안**

Run: `npx vitest run src/utils/soccerAnalytics && npm run build`
Expected: 전체 PASS + 빌드 성공. RTL 부재이므로 ChemistryTab/DefenseAnalysisView diff 정독(선언 순서·조건부 렌더 가드).

- [ ] **Step 4: Commit**

```bash
git add src/components/dashboard/analytics/DefenseAnalysisView.jsx src/components/dashboard/analytics/ChemistryTab.jsx
git commit -m "feat(soccer): 케미탭 '수비케미' 서브탭 — DF 페어 실점 케미+개인 억제율, 종목 전환 서브탭 리셋"
```

---

### Task 4: PersonalAnalysisTab '상대팀별 성적' 카드

**Files:**
- Modify: `src/components/dashboard/analytics/PersonalAnalysisTab.jsx`

**Interfaces:**
- Consumes: `soccerCalc.calcOpponentBreakdown` (파일이 이미 `import * as soccerCalc` 보유 — 셰도잉 destructure에 넣지 말 것), 기존 state `selected`, props `eventLogs`/`matchLogs`/`isSoccer`.

- [ ] **Step 1: memo 2개 추가** — `pr` useMemo 아래에:

```jsx
  // ── 상대팀별 성적 (축구 전용 — 풋살은 매주 팀 로테이션이라 상대팀 축이 무의미) ──
  const oppBreakdown = useMemo(
    () => (isSoccer ? soccerCalc.calcOpponentBreakdown({ eventLogs: eventLogs || [], matchLogs: matchLogs || [] }) : null),
    [isSoccer, eventLogs, matchLogs]
  );
  const oppRows = useMemo(
    () => (oppBreakdown && selected ? (oppBreakdown.byPlayer[selected] || []) : []),
    [oppBreakdown, selected]
  );
```

- [ ] **Step 2: 카드 렌더 추가** — hasData 블록 안 '연속 기록' 카드 직후에:

```jsx
          {isSoccer && oppRows.length > 0 && (
            <div style={{ marginTop: 12, padding: "10px 12px", borderRadius: 8, background: C.cardLight, fontSize: 11, textAlign: "left" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.white, marginBottom: 6 }}>상대팀별 성적</div>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                <thead>
                  <tr style={{ color: C.gray, fontSize: 10 }}>
                    <th style={{ textAlign: "left", padding: "2px 4px", fontWeight: 500 }}>상대</th>
                    <th style={{ textAlign: "center", padding: "2px 4px", fontWeight: 500 }}>경기(승-무-패)</th>
                    <th style={{ textAlign: "center", padding: "2px 4px", fontWeight: 500 }}>골</th>
                    <th style={{ textAlign: "center", padding: "2px 4px", fontWeight: 500 }}>어시</th>
                  </tr>
                </thead>
                <tbody>
                  {oppRows.map(r => (
                    <tr key={r.opponent} style={{ borderTop: `1px dashed ${C.grayDarker}` }}>
                      <td style={{ padding: "5px 4px", color: C.white }}>{r.opponent}</td>
                      <td style={{ padding: "5px 4px", color: C.gray, textAlign: "center", fontVariantNumeric: "tabular-nums" }}>
                        {r.games > 0 ? `${r.games} (${r.wins}-${r.draws}-${r.losses})` : "–"}
                      </td>
                      <td style={{ padding: "5px 4px", color: C.white, textAlign: "center", fontVariantNumeric: "tabular-nums" }}>{r.goals}</td>
                      <td style={{ padding: "5px 4px", color: C.white, textAlign: "center", fontVariantNumeric: "tabular-nums" }}>{r.assists}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ marginTop: 6, fontSize: 9.5, color: C.gray, lineHeight: 1.5 }}>
                골·어시는 전 기간 이벤트 기준. 경기수·승패는 명단이 온전한 정식 기록 경기만(레거시 부분명단 제외).
              </div>
            </div>
          )}
```

- [ ] **Step 3: 검증**

Run: `npx vitest run && npm run build`
Expected: 전체 PASS + 빌드 성공. jsx diff 정독(hasData 블록 내 삽입 위치·닫는 태그 짝).

- [ ] **Step 4: Commit**

```bash
git add src/components/dashboard/analytics/PersonalAnalysisTab.jsx
git commit -m "feat(soccer): 개인분석에 상대팀별 성적 카드 — 골·어시 전기간, 경기수·승패는 신뢰 명단 경기만"
```

---

### Task 5: 실데이터 스모크 검증

**Files:**
- Create: (스크래치패드) `smoke_defense.mjs` — 커밋하지 않음

**Interfaces:**
- Consumes: Task 1·2의 calc 함수, 스크래치패드의 events.csv/matches.csv (하버FC 실데이터).

- [ ] **Step 1: 스크래치패드에 스모크 스크립트 작성** — CSV를 API 반환 형태(정규화 날짜, boolean is_extra)로 변환해 두 calc에 통과시키고 요약 출력. 날짜는 `_toDateStr`와 동일 규칙(`(\d{4})\D+(\d{1,2})\D+(\d{1,2})`)으로 정규화.

- [ ] **Step 2: 실행** — `npx vite-node <스크래치패드>/smoke_defense.mjs`

Expected(사전 계산된 실측과 대조):
- calcDefenseAnalysis: scopeMatches=54(58 − is_extra 아님·전부 포함이면 58, 단 '휴식' 2행은 defenders 없음이라 원래 미포함), 신관수 games=30, 페어 신관수-황세원 games=19.
- calcOpponentBreakdown: 주건호 vs 터틀파크 goals=12('터틀' 15행이 조인으로 흡수되는지 확인), 한울·터틀파크·아이콘 순 표본.

- [ ] **Step 3: 결과가 실측과 다르면** superpowers:systematic-debugging으로 원인 규명 후 수정(테스트 추가 → 수정 → 재검증).

---

## Self-Review 체크 결과

- 스펙 커버: ①상대별 개인성적=Task 1+4, ②억제율=Task 2+3, ③DF 페어 케미=Task 2+3. 누락 없음.
- 플레이스홀더 없음 — 전 태스크 실코드 포함.
- 타입 일관성: calcOpponentBreakdown 반환 byPlayer 배열 필드(opponent/goals/assists/games/wins/draws/losses)를 Task 4가 그대로 소비. calcDefenseAnalysis 반환(individuals/pairs/worstPairs, delta/hasBaseline)을 Task 3이 그대로 소비. threshold 기본값(8/5)은 Task 2 시그니처와 Task 3 캡션 문구 일치.
