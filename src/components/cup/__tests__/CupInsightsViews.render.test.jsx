// src/components/cup/__tests__/CupInsightsViews.render.test.jsx
// 컵 인사이트 컴포넌트 실렌더 (계산 결과를 props 로 직접 준다).
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { ThemeProvider } from '../../../hooks/useTheme';
import CupAwardsCards from '../CupAwardsCards';
import CupHeadToHead from '../CupHeadToHead';
import CupKeeperTable from '../CupKeeperTable';
import CupDefenseTable from '../CupDefenseTable';

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
    expect(cell.textContent).toContain('1-1-0');
    expect(cell.textContent).toContain('3:1');
  });

  it('없는 pair 는 -', async () => {
    await mount(createElement(CupHeadToHead, { teams, cells }));
    const cell = container.querySelector('[data-role="cup-h2h-cell"][data-row="나와"][data-col="광땡"]');
    expect(cell.textContent.trim()).toBe('-');
  });

  it('캡션 텍스트 포함', async () => {
    await mount(createElement(CupHeadToHead, { teams, cells }));
    expect(container.textContent).toContain('행 팀 기준 승-무-패 · 득:실');
  });
});

// ─── CupKeeperTable ────────────────────────────────────────────────────────────
describe('CupKeeperTable', () => {
  it('열 헤더 확인', async () => {
    await mount(createElement(CupKeeperTable, { keepers: [] }));
    const ths = [...container.querySelectorAll('thead th')].map((t) => t.textContent);
    expect(ths).toEqual(['선수', '경기', '실점', '실점률', '클린시트']);
  });

  it('빈 keepers 면 "기록 없음"', async () => {
    await mount(createElement(CupKeeperTable, { keepers: [] }));
    expect(container.textContent).toContain('기록 없음');
    expect(container.querySelectorAll('[data-role="cup-keeper-row"]')).toHaveLength(0);
  });

  it('keeper 행·toFixed(2) 렌더', async () => {
    const keepers = [
      { name: '노필선', games: 6, conceded: 5, cleanSheets: 2, concededRate: 0.8333 },
      { name: '박GK', games: 2, conceded: 4, cleanSheets: 0, concededRate: 2 },
    ];
    await mount(createElement(CupKeeperTable, { keepers }));
    const rows = [...container.querySelectorAll('[data-role="cup-keeper-row"]')];
    expect(rows).toHaveLength(2);
    expect(rows[0].dataset.player).toBe('노필선');
    expect(rows[0].textContent).toContain('노필선');
    expect(rows[0].textContent).toContain('6');
    expect(rows[0].textContent).toContain('5');
    expect(rows[0].textContent).toContain('0.83'); // toFixed(2) of 0.8333
    expect(rows[0].textContent).toContain('2');
    expect(rows[1].dataset.player).toBe('박GK');
    expect(rows[1].textContent).toContain('2.00'); // toFixed(2) of 2
  });
});

// ─── CupDefenseTable ───────────────────────────────────────────────────────────
describe('CupDefenseTable', () => {
  const rated = [
    { name: '김수비', games: 5, conceded: 3, cleanSheets: 2, cleanRate: 0.4, concededPerGame: 0.6 },
    { name: '이태클', games: 4, conceded: 6, cleanSheets: 1, cleanRate: 0.25, concededPerGame: 1.5 },
  ];
  const unrated = [
    { name: '박미니', games: 1, conceded: 1, cleanSheets: 0, cleanRate: 0, concededPerGame: 1 },
  ];

  it('열 헤더 확인', async () => {
    await mount(createElement(CupDefenseTable, { minGames: 3, rated, unrated }));
    const ths = [...container.querySelectorAll('thead th')].map((t) => t.textContent);
    expect(ths).toEqual(['선수', '경기', '실점', '경기당 실점', '무실점률']);
  });

  it('rated 행은 data-rated="true", unrated 는 "false"', async () => {
    await mount(createElement(CupDefenseTable, { minGames: 3, rated, unrated }));
    const ratedRows = [...container.querySelectorAll('[data-role="cup-defense-row"][data-rated="true"]')];
    const unratedRows = [...container.querySelectorAll('[data-role="cup-defense-row"][data-rated="false"]')];
    expect(ratedRows).toHaveLength(2);
    expect(unratedRows).toHaveLength(1);
    expect(ratedRows.map((r) => r.dataset.player)).toEqual(['김수비', '이태클']);
    expect(unratedRows[0].dataset.player).toBe('박미니');
  });

  it('무실점률 % 텍스트 (Math.round)', async () => {
    await mount(createElement(CupDefenseTable, { minGames: 3, rated, unrated }));
    const row = container.querySelector('[data-role="cup-defense-row"][data-player="김수비"]');
    expect(row.textContent).toContain('40%'); // Math.round(0.4*100)
    const row2 = container.querySelector('[data-role="cup-defense-row"][data-player="이태클"]');
    expect(row2.textContent).toContain('25%');
  });

  it('캡션에 minGames 포함', async () => {
    await mount(createElement(CupDefenseTable, { minGames: 3, rated, unrated }));
    expect(container.textContent).toContain('기준: 필드 3경기 이상 (GK로 뛴 경기 제외)');
  });

  it('minGames 다른 값도 캡션 반영', async () => {
    await mount(createElement(CupDefenseTable, { minGames: 5, rated: [], unrated: [] }));
    expect(container.textContent).toContain('기준: 필드 5경기 이상 (GK로 뛴 경기 제외)');
  });

  it('unrated 행은 opacity 0.5', async () => {
    await mount(createElement(CupDefenseTable, { minGames: 2, rated, unrated }));
    const unratedRow = container.querySelector('[data-role="cup-defense-row"][data-rated="false"]');
    expect(unratedRow.style.opacity).toBe('0.5');
    const ratedRow = container.querySelector('[data-role="cup-defense-row"][data-rated="true"]');
    expect(ratedRow.style.opacity).toBe('');
  });
});
