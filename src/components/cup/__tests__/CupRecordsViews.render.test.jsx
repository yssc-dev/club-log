// src/components/cup/__tests__/CupRecordsViews.render.test.jsx
// 3단계 스펙 §5 — 순위표·개인기록·경기일별 결과 표시 컴포넌트 실렌더(계산 결과를 props 로 직접 준다).
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { ThemeProvider } from '../../../hooks/useTheme';
import CupStandingsTable from '../CupStandingsTable';
import CupPlayerRecordsTable from '../CupPlayerRecordsTable';
import CupDayResults from '../CupDayResults';

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
const click = async (el) => { await act(async () => { el.click(); }); };

const S = (over = {}) => ({ name: '팀A', registered: true, games: 2, wins: 1, draws: 1, losses: 0, gf: 4, ga: 1, gd: 3, points: 4, bonusAttend: 1, bonus: 1, total: 5, ...over });

describe('CupStandingsTable', () => {
  it('열 순서(참석 열, 다득점·무실점 열 없음)·행 순서·1위 강조 문구', async () => {
    await mount(createElement(CupStandingsTable, { standings: [S(), S({ name: '팀B', registered: false, total: 1, points: 1, bonus: 0, bonusAttend: 0, gd: -3 })], finished: false }));
    const ths = [...container.querySelectorAll('thead th')].map(t => t.textContent);
    expect(ths).toEqual(['순위', '팀', '경기', '승', '무', '패', '득실', '승점', '참석', '합계']);
    const rows = [...container.querySelectorAll('tr[data-role="cup-standing-row"]')];
    expect(rows.map(r => r.dataset.team)).toEqual(['팀A', '팀B']);
    const cells = [...rows[0].querySelectorAll('td')].map(td => td.textContent.trim());
    expect(cells).toEqual(['1', '팀A', '2', '1', '1', '0', '+3', '4', '1', '5']);
    expect(rows[0].textContent).not.toContain('가점');
    expect(container.textContent).not.toContain('다득점');
    expect(rows[0].textContent).not.toContain('무실점');
    expect(rows[1].textContent).toContain('(미등록)');
    expect(container.textContent).not.toContain('우승');
  });
  it('팀장이 있으면 팀 칸에 성을 뺀 두 글자로 "국뽕(강국)" 처럼 붙는다', async () => {
    await mount(createElement(CupStandingsTable, { standings: [
      S({ name: '국뽕', captain: '이강국' }), S({ name: '나와', captain: '강국', total: 5 }), S({ name: '리즈', captain: '', total: 4 }),
    ], finished: false }));
    const cells = [...container.querySelectorAll('tr[data-role="cup-standing-row"]')].map(r => r.querySelectorAll('td')[1].textContent.replace(/\s+/g, ''));
    expect(cells).toEqual(['국뽕(강국)', '나와(강국)', '리즈']);
  });
  it('finished 면 1위에 🏆 우승', async () => {
    await mount(createElement(CupStandingsTable, { standings: [S()], finished: true }));
    expect(container.querySelector('tr[data-role="cup-standing-row"]').textContent).toContain('🏆 우승');
  });
});

describe('CupPlayerRecordsTable', () => {
  it('열·행·용병 표시', async () => {
    await mount(createElement(CupPlayerRecordsTable, { records: [
      { name: 'a2', team: '팀A', guest: false, goals: 3, assists: 1, cleanSheets: 0, ownGoals: 0, days: 2 },
      { name: 'z1', team: '', guest: true, goals: 0, assists: 0, cleanSheets: 1, ownGoals: 1, days: 1 },
    ] }));
    const ths = [...container.querySelectorAll('thead th')].map(t => t.textContent);
    expect(ths).toEqual(['선수', '팀', '골', '어시', '클린시트', '자책', '참석']);
    const rows = [...container.querySelectorAll('tr[data-role="cup-player-row"]')];
    expect(rows.map(r => r.dataset.player)).toEqual(['a2', 'z1']);
    expect(rows[0].textContent).toContain('팀A');
    expect(rows[1].textContent).toContain('용병');
  });
});

describe('CupDayResults', () => {
  const days = [
    { date: '2026-10-01', matches: [{ key: 'k1', matchId: 'R1_C0', home: '팀A', away: '팀B', homeScore: 3, awayScore: 0 }],
      teams: { '팀A': { registered: true, present: 7, guests: [], bonusAttend: 1, points: 3 }, '팀B': { registered: true, present: 6, guests: ['a7'], bonusAttend: 0, points: 0 } } },
    { date: '2026-10-08', matches: [{ key: 'k2', matchId: 'R1_C0', home: '팀B', away: '팀A', homeScore: 0, awayScore: 0 }],
      teams: { '팀A': { registered: true, present: 5, guests: [], bonusAttend: 0, points: 1 }, '팀B': { registered: true, present: 5, guests: [], bonusAttend: 0, points: 1 } } },
  ];
  it('최신 날짜가 위에 펼쳐지고 나머지는 접힘; 토글로 열린다', async () => {
    await mount(createElement(CupDayResults, { days }));
    const cards = [...container.querySelectorAll('div[data-role="cup-day"]')];
    expect(cards.map(c => c.dataset.date)).toEqual(['2026-10-08', '2026-10-01']);
    expect(cards[0].querySelector('div[data-role="cup-day-match"]')).not.toBeNull();
    expect(cards[1].querySelector('div[data-role="cup-day-match"]')).toBeNull();
    await click(cards[1].querySelector('button[data-role="cup-day-toggle"]'));
    expect(container.querySelector('div[data-role="cup-day"][data-date="2026-10-01"] div[data-role="cup-day-match"]')).not.toBeNull();
    await click(cards[0].querySelector('button[data-role="cup-day-toggle"]'));
    expect(container.querySelector('div[data-role="cup-day"][data-date="2026-10-08"] div[data-role="cup-day-match"]')).toBeNull();
  });
  it('경기 줄에 스코어만(배지 없음), 팀 줄에 등록 참석·용병·✓/✗', async () => {
    await mount(createElement(CupDayResults, { days: [days[0]] }));
    const match = container.querySelector('div[data-role="cup-day-match"]');
    expect(match.textContent).toContain('팀A');
    expect(match.textContent).toContain('3 : 0');
    expect(match.textContent).not.toContain('다득점');
    expect(match.textContent).not.toContain('무실점');
    expect(match.textContent).not.toContain('+1');
    const teamA = container.querySelector('div[data-role="cup-day-team"][data-team="팀A"]');
    const teamB = container.querySelector('div[data-role="cup-day-team"][data-team="팀B"]');
    expect(teamA.textContent).toContain('등록 7명 참석');
    expect(teamA.textContent).toContain('✓ +1');
    expect(teamB.textContent).toContain('등록 6명 참석');
    expect(teamB.textContent).toContain('용병 1명(a7)');
    expect(teamB.textContent).toContain('✗');
  });
  it('참석 가점이 3이면 팀 줄에 ✓ +3', async () => {
    const d = { ...days[0], teams: { '팀A': { ...days[0].teams['팀A'], present: 10, bonusAttend: 3 } } };
    await mount(createElement(CupDayResults, { days: [d] }));
    expect(container.querySelector('div[data-role="cup-day-team"][data-team="팀A"]').textContent).toContain('등록 10명 참석');
    expect(container.querySelector('div[data-role="cup-day-team"][data-team="팀A"]').textContent).toContain('✓ +3');
  });
  it('days 가 비면 아무것도 그리지 않는다', async () => {
    await mount(createElement(CupDayResults, { days: [] }));
    expect(container.querySelectorAll('div[data-role="cup-day"]')).toHaveLength(0);
  });
});
