# 테니스 대시보드 2단계 구현 플랜

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 테니스 `tdash`(대시보드) 탭 placeholder를 클럽 개요 대시보드(이번달 요약·복식/단식 순위 TOP5·페어 케미 TOP5·하이라이트)로 채우고, 대시보드 탭 beta 배지를 제거한다.

**Architecture:** 신규 순수 계산기 `buildMonthSummary` 하나 + 정적 대시보드 컴포넌트(기존 계산기 재사용, 정렬 없음). 공유 `mainTabs.js`는 tdash beta만 제거.

**Tech Stack:** React 18, Vite, Vitest(jsdom), `renderToStaticMarkup`.

## Global Constraints

- **풋살·축구 무영향**: `mainTabs.js`는 테니스 tdash 항목의 `beta`만 제거. 비테니스 배열·`members` beta 무변경.
- **계산 유틸 로직 무변경**: `tennisAnalytics.js`/`tennisStandings.js` 수정 금지(재사용만). 신규 계산기는 새 파일.
- **비인터랙티브**: 대시보드 표는 정적 — `useSortableRows`/`SortHeader` 미사용, 카드 클릭 네비게이션 없음.
- **분석·경기관리·회원관리 탭 무변경**. 회원관리 beta 유지.
- Test runner Vitest, 전체 스위트(현재 1041) green 유지 + 신규.
- 대시보드 TOP N = 5. 핫플레이어 최소 3경기.

---

### Task 1: buildMonthSummary 순수 계산기

**Files:**
- Create: `src/utils/tennis/tennisDashboard.js`
- Create: `src/utils/tennis/__tests__/tennisDashboard.test.js`

**Interfaces:**
- Produces: `buildMonthSummary({ rows, month }) → { month, matches, topAttender, hotPlayer, playerCount }`
  - `matches`: 이달 distinct `match_id` 수.
  - `topAttender`: `{ name, games, wins } | null` — 이달 최다 참여 회원(게스트 제외), 동수 이름 오름.
  - `hotPlayer`: `{ name, games, wins, rate } | null` — 이달 승률 최고(최소 3경기), 없으면 null.
  - `playerCount`: 이달 참여 회원 수.

- [ ] **Step 1: 실패 테스트 작성** — `src/utils/tennis/__tests__/tennisDashboard.test.js`

```js
import { describe, it, expect } from 'vitest';
import { buildMonthSummary } from '../tennisDashboard';

const rows = [
  // 2026-08: match m1 (박·김 복식), m2 (박·이 복식)
  { date: '2026-08-01', match_id: 'm1', player: '박성언', result: '승' },
  { date: '2026-08-01', match_id: 'm1', player: '김원희', result: '승' },
  { date: '2026-08-02', match_id: 'm2', player: '박성언', result: '패' },
  { date: '2026-08-02', match_id: 'm2', player: '이승환', result: '패' },
  { date: '2026-08-03', match_id: 'm3', player: '박성언', result: '승' },
  { date: '2026-08-03', match_id: 'm3', player: '용병A', result: '승', is_guest: true },
  // 2026-07: 다른 달 (제외돼야)
  { date: '2026-07-10', match_id: 'm0', player: '박성언', result: '승' },
];

describe('buildMonthSummary', () => {
  it('이달 distinct match_id로 경기수 집계', () => {
    expect(buildMonthSummary({ rows, month: '2026-08' }).matches).toBe(3);
  });
  it('최다 출전(회원, 게스트 제외)', () => {
    const s = buildMonthSummary({ rows, month: '2026-08' });
    expect(s.topAttender.name).toBe('박성언');
    expect(s.topAttender.games).toBe(3);
  });
  it('게스트는 회원 집계에서 제외', () => {
    const s = buildMonthSummary({ rows, month: '2026-08' });
    expect(s.playerCount).toBe(3); // 박성언·김원희·이승환 (용병A 제외)
  });
  it('핫플레이어는 최소 3경기 — 미달이면 null', () => {
    // 박성언만 3경기(2승1패), 나머지 1경기 → 3경기 이상은 박성언뿐
    const s = buildMonthSummary({ rows, month: '2026-08' });
    expect(s.hotPlayer.name).toBe('박성언');
    expect(s.hotPlayer.rate).toBeCloseTo(2 / 3);
  });
  it('해당 월 데이터 없으면 matches 0, null들', () => {
    const s = buildMonthSummary({ rows, month: '2026-01' });
    expect(s).toEqual({ month: '2026-01', matches: 0, topAttender: null, hotPlayer: null, playerCount: 0 });
  });
  it('빈 rows 안전', () => {
    expect(buildMonthSummary({ rows: [], month: '2026-08' }).matches).toBe(0);
  });
});
```

- [ ] **Step 2: 실패 확인** — Run: `npx vitest run src/utils/tennis/__tests__/tennisDashboard.test.js` → FAIL(모듈 없음)

- [ ] **Step 3: 구현** — `src/utils/tennis/tennisDashboard.js`

```js
// 대시보드 전용 계산기. 분석 유틸(tennisAnalytics/tennisStandings)과 무관, 재사용만.
// 클럽 이번달 요약: 경기수(distinct match_id)·최다출전·핫플레이어(회원=비게스트).
export function buildMonthSummary({ rows, month }) {
  const inMonth = (rows || []).filter(r => (r.date || '').slice(0, 7) === month);
  const matches = new Set(inMonth.map(r => r.match_id).filter(Boolean)).size;

  const perPlayer = new Map();
  for (const r of inMonth) {
    if (r.is_guest === true || !r.player) continue;
    const c = perPlayer.get(r.player) || { name: r.player, games: 0, wins: 0 };
    c.games++;
    if (r.result === '승') c.wins++;
    perPlayer.set(r.player, c);
  }
  const players = [...perPlayer.values()];
  const topAttender = players.slice()
    .sort((a, b) => b.games - a.games || a.name.localeCompare(b.name, 'ko'))[0] || null;
  const hotPlayer = players
    .filter(p => p.games >= 3)
    .map(p => ({ ...p, rate: p.games ? p.wins / p.games : 0 }))
    .sort((a, b) => b.rate - a.rate || b.games - a.games)[0] || null;

  return { month, matches, topAttender, hotPlayer, playerCount: players.length };
}
```

- [ ] **Step 4: 통과 확인** — Run: `npx vitest run src/utils/tennis/__tests__/tennisDashboard.test.js` → PASS

- [ ] **Step 5: 전체 스위트** — Run: `npx vitest run` → 전부 PASS

- [ ] **Step 6: 커밋**

```bash
git add src/utils/tennis/tennisDashboard.js src/utils/tennis/__tests__/tennisDashboard.test.js
git commit -m "feat(tennis): 대시보드 클럽 월요약 계산기 buildMonthSummary"
```

---

### Task 2: TennisDashboard 대시보드 컴포넌트

**Files:**
- Create: `src/components/tennis/TennisDashboard.jsx`
- Create: `src/components/tennis/__tests__/tennisDashboard.smoke.test.jsx`

**Interfaces:**
- Consumes: `buildMonthSummary`(Task 1), `buildDoublesStandings`/`buildPairChemistry`/`buildTbRanking`/`buildBagelRanking`/`buildAceDfRanking`(`tennisAnalytics`), `buildSinglesStandings`(`tennisStandings`), `TennisSync`(`services/tennisSync`), `makeStyles`(`styles/theme`), `useTheme`(`hooks/useTheme`).
- Produces: `<TennisDashboard C />` default export.

계산기 반환 형태(재사용 — 1단계 확인됨):
- `buildDoublesStandings` → `[{ name, grade, wins, losses, rate }]`
- `buildSinglesStandings` → `[{ name, leagueTier, grade, wins, losses, rate, points }]`
- `buildPairChemistry` → `[{ players:[a,b], wins, losses, rate, hasGuest }]`
- `buildTbRanking` → `[{ name, tbWon, tbPlayed, rate }]`
- `buildBagelRanking` → `[{ name, given, taken }]`
- `buildAceDfRanking` → `[{ name, aces, doubleFaults, recordedGames }]`

- [ ] **Step 1: 컴포넌트 구현** — `src/components/tennis/TennisDashboard.jsx`

```jsx
// 테니스 클럽 개요 대시보드(2단계). 정적·비인터랙티브. 분석 계산기 재사용.
import { useEffect, useMemo, useState } from 'react';
import TennisSync from '../../services/tennisSync';
import { buildMonthSummary } from '../../utils/tennis/tennisDashboard';
import { buildDoublesStandings, buildPairChemistry, buildTbRanking, buildBagelRanking, buildAceDfRanking } from '../../utils/tennis/tennisAnalytics';
import { buildSinglesStandings } from '../../utils/tennis/tennisStandings';
import { useTheme } from '../../hooks/useTheme';
import { makeStyles } from '../../styles/theme';

const pct = (r) => r > 0 ? `${Math.round(r * 100)}%` : '-';

function StatCell({ label, value, C }) {
  return (
    <div style={{ flex: 1, textAlign: 'center' }}>
      <div style={{ fontSize: 10, color: C.gray }}>{label}</div>
      <div style={{ fontSize: 18, fontVariantNumeric: 'tabular-nums', color: C.white }}>{value}</div>
    </div>
  );
}

// 정적 순위 미니테이블 (정렬 없음)
function MiniRankTable({ title, rows, cols, ds }) {
  if (!rows.length) return (
    <>
      <div style={ds.sectionTitle}>{title}</div>
      <div style={{ ...ds.card, color: '#888', fontSize: 12, textAlign: 'center' }}>데이터 없음</div>
    </>
  );
  return (
    <>
      <div style={ds.sectionTitle}>{title}</div>
      <div style={ds.card}>
        <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ ...ds.th, textAlign: 'left' }}>#</th>
              {cols.map(c => <th key={c.key} style={{ ...ds.th, textAlign: c.align || 'center' }}>{c.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r._key || i}>
                <td style={{ ...ds.td(), textAlign: 'left' }}>{i + 1}</td>
                {cols.map(c => <td key={c.key} style={{ ...ds.td(), textAlign: c.align || 'center' }}>{c.render(r)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

export default function TennisDashboard({ C: propC }) {
  const { C: themeC } = useTheme();
  const C = propC ?? themeC;
  const ds = makeStyles(C);
  const [rows, setRows] = useState([]);
  const [roster, setRoster] = useState([]);

  useEffect(() => {
    TennisSync.getPlayerGames().then(setRows);
    TennisSync.getRoster().then(setRoster);
  }, []);

  const today = new Date().toISOString().slice(0, 10);
  const months = useMemo(
    () => [...new Set((rows || []).map(r => (r.date || '').slice(0, 7)).filter(Boolean))].sort(),
    [rows]);
  const now = new Date();
  const curMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const targetMonth = months.includes(curMonth) ? curMonth : (months[months.length - 1] || curMonth);

  const summary = useMemo(() => buildMonthSummary({ rows, month: targetMonth }), [rows, targetMonth]);
  const doubles = useMemo(() => buildDoublesStandings({ rows, roster }).slice(0, 5), [rows, roster]);
  const singles = useMemo(() => buildSinglesStandings({ rows, roster, asOfDate: today }).slice(0, 5), [rows, roster, today]);
  const chem = useMemo(() => buildPairChemistry({ rows }).slice(0, 5), [rows]);
  const tb = useMemo(() => buildTbRanking({ rows, roster }), [rows, roster]);
  const bagel = useMemo(() => buildBagelRanking({ rows, roster }), [rows, roster]);
  const acedf = useMemo(() => buildAceDfRanking({ rows, roster }), [rows, roster]);

  const highlight = (label, top, fmt) =>
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 13, color: C.white }}>
      <span style={{ color: C.gray }}>{label}</span>
      <span>{top ? fmt(top) : '-'}</span>
    </div>;

  return (
    <div style={ds.section}>
      {/* 1. 이번달 요약 */}
      <div style={ds.sectionTitle}>{targetMonth} 요약</div>
      <div style={ds.card}>
        <div style={{ display: 'flex' }}>
          <StatCell C={C} label="경기수" value={summary.matches} />
          <StatCell C={C} label="최다 출전" value={summary.topAttender ? `${summary.topAttender.name} (${summary.topAttender.games})` : '-'} />
          <StatCell C={C} label="핫플레이어" value={summary.hotPlayer ? `${summary.hotPlayer.name} ${pct(summary.hotPlayer.rate)}` : '-'} />
        </div>
      </div>

      {/* 2. 순위 TOP 5 */}
      <MiniRankTable title="복식 순위 TOP 5" rows={doubles.map(s => ({ ...s, _key: s.name }))} ds={ds}
        cols={[
          { key: 'name', label: '이름', align: 'left', render: r => r.name },
          { key: 'rec', label: '전적', render: r => `${r.wins}-${r.losses}` },
          { key: 'rate', label: '승률', render: r => pct(r.rate) },
        ]} />
      <MiniRankTable title="단식 순위 TOP 5" rows={singles.map(s => ({ ...s, _key: s.name }))} ds={ds}
        cols={[
          { key: 'name', label: '이름', align: 'left', render: r => r.name },
          { key: 'rec', label: '전적', render: r => `${r.wins}-${r.losses}` },
          { key: 'rate', label: '승률', render: r => pct(r.rate) },
          { key: 'p', label: 'P', render: r => r.points },
        ]} />

      {/* 3. 페어 케미 TOP 5 */}
      <MiniRankTable title="페어 케미 TOP 5" rows={chem.map(p => ({ ...p, _key: p.players.join('|') }))} ds={ds}
        cols={[
          { key: 'pair', label: '페어', align: 'left', render: r => `${r.players.join(' · ')}${r.hasGuest ? ' *' : ''}` },
          { key: 'rec', label: '전적', render: r => `${r.wins}-${r.losses}` },
          { key: 'rate', label: '승률', render: r => pct(r.rate) },
        ]} />

      {/* 4. 하이라이트 */}
      <div style={ds.sectionTitle}>하이라이트</div>
      <div style={ds.card}>
        {highlight('타이브레이크', tb[0], t => `${t.name} ${t.tbWon}/${t.tbPlayed}`)}
        {highlight('베이글', bagel[0], b => `${b.name} ${b.given}개`)}
        {highlight('에이스', acedf.slice().sort((a, b) => b.aces - a.aces)[0], a => `${a.name} ${a.aces}개`)}
      </div>
    </div>
  );
}
```

> 주: `buildTbRanking`/`buildBagelRanking`은 이미 정렬돼 반환(1단계 확인). 에이스는 `buildAceDfRanking`이 에이스 기준 정렬이 아닐 수 있어 `[0]` 대신 에이스 desc 정렬 후 첫 요소 사용(위 코드).

- [ ] **Step 2: 렌더 스모크 테스트** — `src/components/tennis/__tests__/tennisDashboard.smoke.test.jsx`

```jsx
import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { ThemeProvider, useTheme } from '../../../hooks/useTheme';
import TennisDashboard from '../TennisDashboard';

vi.mock('../../../services/tennisSync', () => ({
  default: { getPlayerGames: () => Promise.resolve([]), getRoster: () => Promise.resolve([]) },
}));
Object.defineProperty(window, 'matchMedia', {
  writable: true, value: (q) => ({ matches: false, media: q, addListener(){}, removeListener(){}, addEventListener(){}, removeEventListener(){}, dispatchEvent(){} }),
});

function Harness() { const { C } = useTheme(); return createElement(TennisDashboard, { C }); }

describe('TennisDashboard 스모크', () => {
  it('빈 데이터에서 크래시 없이 렌더, 섹션 타이틀 존재', () => {
    const html = renderToStaticMarkup(createElement(ThemeProvider, null, createElement(Harness)));
    expect(html).toContain('복식 순위 TOP 5');
    expect(html).toContain('단식 순위 TOP 5');
    expect(html).toContain('하이라이트');
  });
});
```

- [ ] **Step 3: 포커스 테스트** — Run: `npx vitest run src/components/tennis/__tests__/tennisDashboard.smoke.test.jsx` → PASS
- [ ] **Step 4: 전체 스위트** — Run: `npx vitest run` → PASS
- [ ] **Step 5: 커밋**

```bash
git add src/components/tennis/TennisDashboard.jsx src/components/tennis/__tests__/tennisDashboard.smoke.test.jsx
git commit -m "feat(tennis): 대시보드 컴포넌트 — 월요약·순위 TOP5·케미·하이라이트(정적)"
```

---

### Task 3: tdash 배선 + 대시보드 beta 제거

**Files:**
- Modify: `src/components/tennis/TennisTabs.jsx`
- Modify: `src/components/dashboard/mainTabs.js`
- Modify: `src/components/dashboard/__tests__/mainTabs.test.js`

- [ ] **Step 1: mainTabs.test 갱신(실패 예상 방향)** — `src/components/dashboard/__tests__/mainTabs.test.js`

기존 테니스 테스트에서 tdash beta 단언을 "beta 없음"으로 바꾸고 members beta 유지 단언 추가:

```js
it('관리자 = 대시보드·분석·경기관리·회원관리, 대시보드 beta 없음·회원관리 beta', () => {
  const t = buildMainTabs({ activeSport: '테니스', role: '관리자', pendingCount: 0 });
  expect(keys(t)).toEqual(['tdash', 'records', 'games', 'members']);
  expect(t.find(x => x.key === 'tdash').beta).toBeFalsy();     // 대시보드 beta 제거됨
  expect(t.find(x => x.key === 'members').beta).toBe(true);    // 회원관리는 유지
});
```
(기존 `tdash.beta === true` 단언 라인은 삭제/교체. 비테니스 회귀 단언은 그대로 유지.)

- [ ] **Step 2: 실패 확인** — Run: `npx vitest run src/components/dashboard/__tests__/mainTabs.test.js` → FAIL(현재 tdash beta:true)

- [ ] **Step 3: mainTabs beta 제거** — `src/components/dashboard/mainTabs.js`

테니스 배열의 `{ key: 'tdash', label: '대시보드', beta: true }` → `{ key: 'tdash', label: '대시보드' }`. `members`의 `beta: true` 유지, 비테니스 무변경.

- [ ] **Step 4: mainTabs 테스트 통과** — Run: `npx vitest run src/components/dashboard/__tests__/mainTabs.test.js` → PASS

- [ ] **Step 5: TennisTabs tdash 배선** — `src/components/tennis/TennisTabs.jsx`

상단 import 추가: `import TennisDashboard from './TennisDashboard';`
tdash 분기 교체:
```jsx
if (activeTab === 'tdash') {
  return <TennisDashboard C={C} />;
}
```
`members`·`records`·`games`·fallback 무변경.

- [ ] **Step 6: 전체 스위트** — Run: `npx vitest run` → 전부 PASS(신규 + 갱신 포함)

- [ ] **Step 7: 커밋**

```bash
git add src/components/tennis/TennisTabs.jsx src/components/dashboard/mainTabs.js src/components/dashboard/__tests__/mainTabs.test.js
git commit -m "feat(tennis): tdash 탭에 대시보드 배선 + 대시보드 beta 배지 제거"
```

---

## 최종 검증 (전 태스크 후)

- [ ] `npx vitest run` — 전체 통과(1041 + 신규).
- [ ] `npm run build` — 성공.
- [ ] 브라우저 스모크: 테니스 대시보드 탭 = 월요약·복식/단식 TOP5·케미 TOP5·하이라이트 렌더, 대시보드 탭에 beta 배지 없음, 회원관리는 beta 유지. 분석/경기관리/축구/풋살 무변경.

## Self-Review 체크

- 스펙 §4 커버: buildMonthSummary(Task1)·TennisDashboard(Task2)·배선(Task3)·beta 제거(Task3).
- 타입 일관성: buildMonthSummary 반환 형태가 Task1 정의와 Task2 사용 일치. 계산기 반환 필드가 1단계와 동일.
- 비인터랙티브: 대시보드 표는 MiniRankTable(정적) — SortHeader 미사용.
- 무손상: mainTabs 비테니스·members beta 유지, 계산 유틸 무변경.
