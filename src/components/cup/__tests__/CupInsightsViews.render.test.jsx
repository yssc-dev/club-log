// src/components/cup/__tests__/CupInsightsViews.render.test.jsx
// 컵 인사이트 컴포넌트 실렌더 (계산 결과를 props 로 직접 준다).
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { ThemeProvider } from '../../../hooks/useTheme';
import CupAwardsCards from '../CupAwardsCards';
import CupHeadToHead from '../CupHeadToHead';
import CupFieldImpactTable from '../CupFieldImpactTable';
import CupPlayerRecordsTable from '../CupPlayerRecordsTable';

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (q) => ({ matches: false, media: q, onchange: null, addListener(){}, removeListener(){}, addEventListener(){}, removeEventListener(){}, dispatchEvent(){} }),
});
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let container, root;
beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); });
afterEach(() => { act(() => root?.unmount()); container.remove(); });
async function mount(el) {
  await act(async () => { root = createRoot(container); root.render(createElement(ThemeProvider, null, el)); });
}

// ─── CupAwardsCards ────────────────────────────────────────────────────────────
describe('CupAwardsCards', () => {
  it('awards 가 비면 null (DOM 없음)', async () => {
    await mount(createElement(CupAwardsCards, { awards: [] }));
    expect(container.querySelector('[data-role="cup-awards"]')).toBeNull();
  });

  it('key·title·names(joined)·value 렌더', async () => {
    const awards = [
      { key: 'top-scorer', title: '득점왕', names: ['김철수', '이영희'], value: '3골', note: '공동' },
    ];
    await mount(createElement(CupAwardsCards, { awards }));
    const cont = container.querySelector('[data-role="cup-awards"]');
    expect(cont).not.toBeNull();
    const card = container.querySelector('[data-role="cup-award-card"][data-key="top-scorer"]');
    expect(card).not.toBeNull();
    expect(card.textContent).toContain('득점왕');
    expect(card.textContent).toContain('김철수 · 이영희');
    expect(card.textContent).toContain('3골');
    expect(card.textContent).toContain('공동');
  });

  it('names 빈 배열이면 —, note 없으면 note 없음', async () => {
    const awards = [{ key: 'k1', title: '도움왕', names: [], value: '2개' }];
    await mount(createElement(CupAwardsCards, { awards }));
    const card = container.querySelector('[data-role="cup-award-card"][data-key="k1"]');
    expect(card.textContent).toContain('—');
    expect(card.textContent).toContain('2개');
    // note 없으면 note 텍스트 없어야 함 (note 가 undefined)
    // card 텍스트에는 title+names+value 만 있음
    expect(card.textContent).not.toContain('undefined');
  });

  it('여러 카드가 모두 렌더됨', async () => {
    const awards = [
      { key: 'a', title: 'A', names: ['홍길동'], value: '5' },
      { key: 'b', title: 'B', names: ['이순신'], value: '3' },
      { key: 'c', title: 'C', names: ['강감찬'], value: '1' },
    ];
    await mount(createElement(CupAwardsCards, { awards }));
    expect(container.querySelectorAll('[data-role="cup-award-card"]')).toHaveLength(3);
  });
});

// ─── CupHeadToHead ─────────────────────────────────────────────────────────────
describe('CupHeadToHead', () => {
  const teams = ['광땡', '리즈', '나와'];
  const cells = {
    광땡: {
      리즈: { games: 2, wins: 1, draws: 1, losses: 0, gf: 3, ga: 1 },
      나와: { games: 1, wins: 0, draws: 0, losses: 1, gf: 0, ga: 2 },
    },
    리즈: {
      광땡: { games: 2, wins: 0, draws: 1, losses: 1, gf: 1, ga: 3 },
    },
  };

  it('헤더 행 = 빈칸 + 팀명', async () => {
    await mount(createElement(CupHeadToHead, { teams, cells }));
    const ths = [...container.querySelectorAll('thead th')].map((t) => t.textContent);
    expect(ths[0]).toBe('');
    expect(ths.slice(1)).toEqual(teams);
  });

  it('대각선 셀은 ·', async () => {
    await mount(createElement(CupHeadToHead, { teams, cells }));
    for (const t of teams) {
      const cell = container.querySelector(`[data-role="cup-h2h-cell"][data-row="${t}"][data-col="${t}"]`);
      expect(cell).not.toBeNull();
      expect(cell.textContent.trim()).toBe('·');
    }
  });

  it('존재하는 pair 는 W-D-L 과 gf:ga', async () => {
    await mount(createElement(CupHeadToHead, { teams, cells }));
    const cell = container.querySelector('[data-role="cup-h2h-cell"][data-row="광땡"][data-col="리즈"]');
    expect(cell.textContent).toContain('1승1무0패');
    expect(cell.textContent).toContain('3:1');
  });

  it('없는 pair 는 -', async () => {
    await mount(createElement(CupHeadToHead, { teams, cells }));
    const cell = container.querySelector('[data-role="cup-h2h-cell"][data-row="나와"][data-col="광땡"]');
    expect(cell.textContent.trim()).toBe('-');
  });

  it('캡션 텍스트 포함', async () => {
    await mount(createElement(CupHeadToHead, { teams, cells }));
    expect(container.textContent).toContain('행 팀 기준 승무패 · 득:실');
  });
});


// ─── CupPlayerRecordsTable ─────────────────────────────────────────────────────
describe('CupPlayerRecordsTable 정렬', () => {
  const records = [
    { name: '김철수', team: '광땡', guest: false, goals: 3, assists: 1, cleanSheets: 0, ownGoals: 0, days: 2 },
    { name: '이영희', team: '리즈',  guest: false, goals: 1, assists: 3, cleanSheets: 1, ownGoals: 0, days: 3 },
    { name: '용병A',  team: '광땡', guest: true,  goals: 2, assists: 2, cleanSheets: 0, ownGoals: 1, days: 1 },
  ];

  it('초기 상태는 입력 순서 유지', async () => {
    await mount(createElement(CupPlayerRecordsTable, { records }));
    const rows = [...container.querySelectorAll('[data-role="cup-player-row"]')];
    expect(rows.map(r => r.dataset.player)).toEqual(['김철수', '이영희', '용병A']);
  });

  it('어시 클릭 → 어시 내림차순', async () => {
    await mount(createElement(CupPlayerRecordsTable, { records }));
    const ths = [...container.querySelectorAll('thead th')];
    const assistTh = ths.find(th => th.textContent.includes('어시'));
    await act(async () => { assistTh.click(); });
    const rows = [...container.querySelectorAll('[data-role="cup-player-row"]')];
    const assists = rows.map(r => {
      const tds = r.querySelectorAll('td');
      return Number(tds[3].textContent);
    });
    expect(assists[0]).toBeGreaterThanOrEqual(assists[1]);
    expect(assists[1]).toBeGreaterThanOrEqual(assists[2]);
  });

  it('어시 재클릭 → 오름차순', async () => {
    await mount(createElement(CupPlayerRecordsTable, { records }));
    const ths = [...container.querySelectorAll('thead th')];
    const assistTh = ths.find(th => th.textContent.includes('어시'));
    await act(async () => { assistTh.click(); });
    await act(async () => { assistTh.click(); });
    const rows = [...container.querySelectorAll('[data-role="cup-player-row"]')];
    const assists = rows.map(r => {
      const tds = r.querySelectorAll('td');
      return Number(tds[3].textContent);
    });
    expect(assists[0]).toBeLessThanOrEqual(assists[1]);
    expect(assists[1]).toBeLessThanOrEqual(assists[2]);
  });

  it('선수 클릭 → 가나다 오름차순', async () => {
    await mount(createElement(CupPlayerRecordsTable, { records }));
    const ths = [...container.querySelectorAll('thead th')];
    const nameTh = ths.find(th => th.textContent.replace(/[▲▼]/g, '').trim() === '선수');
    await act(async () => { nameTh.click(); });
    const rows = [...container.querySelectorAll('[data-role="cup-player-row"]')];
    const names = rows.map(r => r.dataset.player);
    const sorted = [...names].sort((a, b) => a.localeCompare(b, 'ko'));
    expect(names).toEqual(sorted);
  });

  it('ownGoalPoint 기본값 -1 — 자책 1골이면 -1', async () => {
    const recs = [{ name: '박선수', team: '광땡', guest: false, goals: 0, assists: 0, cleanSheets: 0, ownGoals: 1, days: 1, gkGames: 0, gkConceded: 0, gkRate: null }];
    await mount(createElement(CupPlayerRecordsTable, { records: recs }));
    const row = container.querySelector('[data-role="cup-player-row"][data-player="박선수"]');
    expect(row).not.toBeNull();
    expect(row.textContent).toContain('-1');
  });
});


// ─── CupFieldImpactTable ───────────────────────────────────────────────────────
describe('CupFieldImpactTable', () => {
  const rated = [
    { name: '김공격', team: '팀A', onGames: 5, offGames: 3, onGfPg: 2.00, onGaPg: 0.50, onCleanSheets: 3, cleanRate: 0.60, goalImpact: 1.50, defImpact: 0.40 },
    { name: '이미드',  team: '팀B', onGames: 4, offGames: 2, onGfPg: 1.25, onGaPg: 1.00, onCleanSheets: 0, cleanRate: 0.00, goalImpact: -0.95, defImpact: null },
  ];
  const unrated = [
    { name: '박루키', team: '팀A', onGames: 1, offGames: 0, onGfPg: 1.00, onGaPg: 0.00, onCleanSheets: 1, cleanRate: 1.00, goalImpact: null, defImpact: null },
  ];

  it('머리글 8개 순서', async () => {
    await mount(createElement(CupFieldImpactTable, { minOn: 3, rated, unrated }));
    const ths = [...container.querySelectorAll('thead th')].map((t) => t.textContent.replace(/[▲▼]/g, '').trim());
    expect(ths).toEqual(['선수', '팀', '출전', '경기당 득점', '경기당 실점', '무실점률', '득점관여', '수비관여']);
  });

  it('무실점률은 % 표기 (Math.round)', async () => {
    await mount(createElement(CupFieldImpactTable, { minOn: 3, rated, unrated }));
    const row = container.querySelector('[data-role="cup-field-impact-row"][data-player="김공격"]');
    expect(row).not.toBeNull();
    expect(row.textContent).toContain('60%'); // Math.round(0.60*100)
    const row2 = container.querySelector('[data-role="cup-field-impact-row"][data-player="이미드"]');
    expect(row2.textContent).toContain('0%');
  });

  it('관여 null 이면 —', async () => {
    await mount(createElement(CupFieldImpactTable, { minOn: 3, rated, unrated }));
    const row = container.querySelector('[data-role="cup-field-impact-row"][data-player="이미드"]');
    expect(row.textContent).toContain('—'); // defImpact=null
    const row2 = container.querySelector('[data-role="cup-field-impact-row"][data-player="박루키"]');
    expect(row2.textContent).toContain('—'); // goalImpact=null and defImpact=null
  });

  it('정렬 시 rated 가 unrated 앞', async () => {
    await mount(createElement(CupFieldImpactTable, { minOn: 3, rated, unrated }));
    const ths = [...container.querySelectorAll('thead th')];
    const goalTh = ths.find(th => th.textContent.includes('득점관여'));
    await act(async () => { goalTh.click(); });
    const allRows = [...container.querySelectorAll('[data-role="cup-field-impact-row"]')];
    const ratedIdx   = allRows.map((r, i) => r.dataset.rated === 'true'  ? i : null).filter(i => i !== null);
    const unratedIdx = allRows.map((r, i) => r.dataset.rated === 'false' ? i : null).filter(i => i !== null);
    expect(Math.max(...ratedIdx)).toBeLessThan(Math.min(...unratedIdx));
  });

  it('help 블록 존재·문구', async () => {
    await mount(createElement(CupFieldImpactTable, { minOn: 3, rated, unrated }));
    const help = container.querySelector('[data-role="cup-field-impact-help"]');
    expect(help).not.toBeNull();
    expect(help.textContent).toContain('내가 필드로 뛴 우리 팀 경기를 기준으로 봅니다');
    expect(help.textContent).toContain('경기당 득점·실점·무실점률');
    expect(help.textContent).toContain('득점관여 +1.00');
    expect(help.textContent).toContain('경기일이 쌓일수록');
  });

  it('캡션에 필드 3경기 이상 출전 포함', async () => {
    await mount(createElement(CupFieldImpactTable, { minOn: 3, rated, unrated }));
    expect(container.textContent).toContain('필드 3경기 이상 출전');
  });

  it('빈 입력이면 기록 없음', async () => {
    await mount(createElement(CupFieldImpactTable, { minOn: 3, rated: [], unrated: [] }));
    expect(container.querySelector('table[data-role="cup-field-impact"]')).not.toBeNull();
    expect(container.textContent).toContain('기록 없음');
    expect(container.querySelectorAll('[data-role="cup-field-impact-row"]')).toHaveLength(0);
  });
});

// ─── CupFieldImpactTable 정렬 ──────────────────────────────────────────────────
describe('CupFieldImpactTable 정렬', () => {
  const rated = [
    { name: '김공격', team: '팀A', onGames: 5, offGames: 3, onGfPg: 2.00, onGaPg: 0.50, onCleanSheets: 3, cleanRate: 0.60, goalImpact: 1.50, defImpact: 0.40 },
    { name: '이미드',  team: '팀B', onGames: 4, offGames: 2, onGfPg: 1.25, onGaPg: 1.00, onCleanSheets: 0, cleanRate: 0.00, goalImpact: -0.95, defImpact: 0.10 },
    { name: '박디펜', team: '팀A', onGames: 6, offGames: 1, onGfPg: 1.50, onGaPg: 0.33, onCleanSheets: 4, cleanRate: 0.67, goalImpact: 0.50, defImpact: 1.20 },
  ];
  const unrated = [
    { name: '최미니', team: '팀B', onGames: 1, offGames: 1, onGfPg: 0.00, onGaPg: 2.00, onCleanSheets: 0, cleanRate: 0.00, goalImpact: -1.00, defImpact: -1.00 },
    { name: '강신인', team: '팀A', onGames: 2, offGames: 0, onGfPg: 2.00, onGaPg: 0.00, onCleanSheets: 2, cleanRate: 1.00, goalImpact: null,  defImpact: null },
  ];

  it('어떤 정렬에서도 rated 행이 unrated 행보다 앞', async () => {
    await mount(createElement(CupFieldImpactTable, { minOn: 3, rated, unrated }));
    const ths = [...container.querySelectorAll('thead th')];
    const cleanRateTh = ths.find(th => th.textContent.includes('무실점률'));
    await act(async () => { cleanRateTh.click(); });
    const allRows = [...container.querySelectorAll('[data-role="cup-field-impact-row"]')];
    const ratedIndices   = allRows.map((r, i) => r.dataset.rated === 'true'  ? i : null).filter(i => i !== null);
    const unratedIndices = allRows.map((r, i) => r.dataset.rated === 'false' ? i : null).filter(i => i !== null);
    expect(Math.max(...ratedIndices)).toBeLessThan(Math.min(...unratedIndices));
  });

  it('무실점률 클릭 → rated 안에서 내림차순', async () => {
    await mount(createElement(CupFieldImpactTable, { minOn: 3, rated, unrated }));
    const ths = [...container.querySelectorAll('thead th')];
    const cleanRateTh = ths.find(th => th.textContent.includes('무실점률'));
    await act(async () => { cleanRateTh.click(); });
    const ratedRows = [...container.querySelectorAll('[data-role="cup-field-impact-row"][data-rated="true"]')];
    const pcts = ratedRows.map(r => {
      const tds = r.querySelectorAll('td');
      return parseInt(tds[5].textContent, 10); // e.g. "67%" → 67
    });
    expect(pcts[0]).toBeGreaterThanOrEqual(pcts[1]);
    expect(pcts[1]).toBeGreaterThanOrEqual(pcts[2]);
  });
});
