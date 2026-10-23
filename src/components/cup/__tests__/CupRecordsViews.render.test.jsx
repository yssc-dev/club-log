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
  it('열 순서(득·실·득실, 참석 열, 다득점·무실점 열 없음)·행 순서·1위 강조 문구', async () => {
    await mount(createElement(CupStandingsTable, { standings: [S(), S({ name: '팀B', registered: false, total: 1, points: 1, bonus: 0, bonusAttend: 0, gd: -3 })], finished: false }));
    const ths = [...container.querySelectorAll('thead th')].map(t => t.textContent);
    expect(ths).toEqual(['순위', '팀', '경기', '승', '무', '패', '득', '실', '득실', '승점', '참석', '합계']);
    const rows = [...container.querySelectorAll('tr[data-role="cup-standing-row"]')];
    expect(rows.map(r => r.dataset.team)).toEqual(['팀A', '팀B']);
    const cells = [...rows[0].querySelectorAll('td')].map(td => td.textContent.trim());
    expect(cells).toEqual(['1', '팀A', '2', '1', '1', '0', '4', '1', '+3', '4', '1', '5']);
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
  it('점수 규칙 ⓘ: 기본 닫힘 → 탭하면 규칙 4줄(10명 이상 +3 포함) → 다시 탭하면 닫힘', async () => {
    await mount(createElement(CupStandingsTable, { standings: [S()], finished: false }));
    const toggle = container.querySelector('[data-role="cup-rules-toggle"]');
    expect(toggle).not.toBeNull();
    expect(toggle.textContent).toContain('점수 규칙');
    expect(container.querySelector('[data-role="cup-rules-panel"]')).toBeNull();
    expect(container.textContent).not.toContain('10명 이상');
    await click(toggle);
    const panel = container.querySelector('[data-role="cup-rules-panel"]');
    expect(panel).not.toBeNull();
    expect(panel.querySelectorAll('li').length).toBe(4);
    expect(panel.textContent).toContain('승 3 · 무 1 · 패 0');
    expect(panel.textContent).toContain('7~9명 +1');
    expect(panel.textContent).toContain('10명 이상 +3');
    expect(panel.textContent).toContain('합계 = 승점 + 참석 가점');
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    await click(toggle);
    expect(container.querySelector('[data-role="cup-rules-panel"]')).toBeNull();
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
  });
});

describe('CupPlayerRecordsTable', () => {
  const baseRec = (over = {}) => ({
    name: 'a2', team: '팀A', guest: false, goals: 3, assists: 1, cleanSheets: 1,
    ownGoals: 0, days: 2, gkGames: 2, gkConceded: 1, gkRate: 0.5,
    ...over,
  });

  it('열 머리글 11개 순서 (2026-10-23 공격P 추가)', async () => {
    await mount(createElement(CupPlayerRecordsTable, { records: [baseRec()] }));
    const ths = [...container.querySelectorAll('thead th')].map(t => t.textContent);
    expect(ths).toEqual(['선수', '팀', '골', '어시', '공격P', '자책(점)', '참석', 'GK', '실점', '실점률', '클린시트']);
  });

  // 2026-10-23: 등록 팀원은 기록이 없어도 행이 있다. 팀으로 정렬했을 때 누가 안 나왔는지
  // 보이게 "미출전"을 달고 행을 흐리게 한다.
  describe('미출전 표시', () => {
    const rowOf = (name) => container.querySelector(`[data-role="cup-player-row"][data-player="${name}"]`);

    it('참석 0 인 등록 팀원은 미출전으로 표시되고 흐려진다', async () => {
      await mount(createElement(CupPlayerRecordsTable, { records: [
        baseRec({ name: '뛴사람', days: 2 }),
        baseRec({ name: '안온사람', days: 0, goals: 0, assists: 0, cleanSheets: 0, gkGames: 0, gkConceded: 0, gkRate: null }),
      ] }));
      const absent = rowOf('안온사람');
      expect(absent.dataset.absent).toBe('true');
      expect(absent.textContent).toContain('미출전');
      expect(Number(absent.style.opacity)).toBeLessThan(1);
    });

    it('한 경기라도 명단에 있었으면 표시하지 않는다', async () => {
      await mount(createElement(CupPlayerRecordsTable, { records: [baseRec({ name: '뛴사람', days: 1 })] }));
      const row = rowOf('뛴사람');
      expect(row.dataset.absent).toBe('false');
      expect(row.textContent).not.toContain('미출전');
      expect(Number(row.style.opacity)).toBe(1);
    });

    it('용병은 참석 0 이어도 미출전이 아니다 (등록 팀원이 아니라 로그에만 있는 사람)', async () => {
      await mount(createElement(CupPlayerRecordsTable, { records: [baseRec({ name: '용병', guest: true, days: 0 })] }));
      const row = rowOf('용병');
      expect(row.dataset.absent).toBe('false');
      expect(row.textContent).not.toContain('미출전');
    });

    it('설명줄이 미출전의 뜻을 밝힌다', async () => {
      await mount(createElement(CupPlayerRecordsTable, { records: [baseRec()] }));
      expect(container.textContent).toContain('미출전 = 어느 경기 명단에도 없던 등록 팀원');
    });
  });

  it('공격P = 골 + 어시 (시상 카드 「팀 득점 기여」의 on/off 값과 다른 지표)', async () => {
    await mount(createElement(CupPlayerRecordsTable, { records: [baseRec({ goals: 3, assists: 1 })] }));
    const tds = container.querySelector('[data-role="cup-player-row"]').querySelectorAll('td');
    expect(tds[2].textContent).toBe('3');   // 골
    expect(tds[3].textContent).toBe('1');   // 어시
    expect(tds[4].textContent).toBe('4');   // 공격P
  });

  it('자책 "-2" 표기 (ownGoalPoint=-2, ownGoals=1)', async () => {
    await mount(createElement(CupPlayerRecordsTable, { records: [baseRec({ ownGoals: 1 })], ownGoalPoint: -2 }));
    const row = container.querySelector('[data-role="cup-player-row"]');
    const tds = row.querySelectorAll('td');
    expect(tds[5].textContent).toBe('-2');
  });

  it('기본값 ownGoalPoint=-1 이면 ownGoals=1 → "-1"', async () => {
    await mount(createElement(CupPlayerRecordsTable, { records: [baseRec({ ownGoals: 1 })] }));
    const row = container.querySelector('[data-role="cup-player-row"]');
    const tds = row.querySelectorAll('td');
    expect(tds[5].textContent).toBe('-1');
  });

  it('gkRate null → "—"', async () => {
    await mount(createElement(CupPlayerRecordsTable, { records: [baseRec({ gkRate: null })] }));
    const row = container.querySelector('[data-role="cup-player-row"]');
    const tds = row.querySelectorAll('td');
    expect(tds[9].textContent).toBe('—');
  });

  it('GK 머리글 클릭으로 정렬 가능', async () => {
    const records = [
      baseRec({ name: '김a', gkGames: 3 }),
      baseRec({ name: '나b', gkGames: 1 }),
      baseRec({ name: '다c', gkGames: 5 }),
    ];
    await mount(createElement(CupPlayerRecordsTable, { records }));
    const ths = [...container.querySelectorAll('thead th')];
    const gkTh = ths.find(t => t.textContent.trim() === 'GK');
    expect(gkTh).not.toBeNull();
    await act(async () => { gkTh.click(); });
    const rows = [...container.querySelectorAll('[data-role="cup-player-row"]')];
    const gkVals = rows.map(r => Number(r.querySelectorAll('td')[6].textContent));
    expect(gkVals[0]).toBeGreaterThanOrEqual(gkVals[1]);
    expect(gkVals[1]).toBeGreaterThanOrEqual(gkVals[2]);
  });

  it('정렬 기준 ⓘ: 기본 닫힘 → 탭하면 4줄(참석 동률 규칙 포함) → 다시 탭하면 닫힘 (2026-10-09)', async () => {
    await mount(createElement(CupPlayerRecordsTable, { records: [baseRec()] }));
    const toggle = container.querySelector('[data-role="cup-player-rules-toggle"]');
    expect(toggle).not.toBeNull();
    expect(toggle.textContent).toContain('정렬 기준');
    expect(container.querySelector('[data-role="cup-player-rules-panel"]')).toBeNull();
    expect(container.textContent).not.toContain('기본 순서');
    await click(toggle);
    const panel = container.querySelector('[data-role="cup-player-rules-panel"]');
    expect(panel).not.toBeNull();
    expect(panel.querySelectorAll('li').length).toBe(4);
    expect(panel.textContent).toContain('골 → 어시 → 클린시트 → 참석 → 이름');
    expect(panel.textContent).toContain('참석(출전) 날짜가 많은 선수가 위');
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    await click(toggle);
    expect(container.querySelector('[data-role="cup-player-rules-panel"]')).toBeNull();
    // 순위표 토글과 data-role 이 다르다(같은 화면에 둘 다 있어도 섞이지 않음)
    expect(container.querySelector('[data-role="cup-rules-toggle"]')).toBeNull();
  });

  it('행·용병 표시', async () => {
    await mount(createElement(CupPlayerRecordsTable, { records: [
      baseRec(),
      baseRec({ name: 'z1', team: '', guest: true, goals: 0, assists: 0, cleanSheets: 0, ownGoals: 1, days: 1, gkGames: 0, gkConceded: 0, gkRate: null }),
    ] }));
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
  it('기본 모두 접힘; 클릭 → 열림; 다시 클릭 → 닫힘', async () => {
    await mount(createElement(CupDayResults, { days }));
    const cards = [...container.querySelectorAll('div[data-role="cup-day"]')];
    expect(cards.map(c => c.dataset.date)).toEqual(['2026-10-08', '2026-10-01']);
    // 기본 모두 접힘
    expect(cards[0].querySelector('div[data-role="cup-day-match"]')).toBeNull();
    expect(cards[1].querySelector('div[data-role="cup-day-match"]')).toBeNull();
    // 클릭 → 열림
    await click(cards[0].querySelector('button[data-role="cup-day-toggle"]'));
    expect(container.querySelector('div[data-role="cup-day"][data-date="2026-10-08"] div[data-role="cup-day-match"]')).not.toBeNull();
    // 다시 클릭 → 닫힘
    await click(cards[0].querySelector('button[data-role="cup-day-toggle"]'));
    expect(container.querySelector('div[data-role="cup-day"][data-date="2026-10-08"] div[data-role="cup-day-match"]')).toBeNull();
  });
  it('경기 줄에 스코어만(배지 없음), 팀 줄에 등록 참석·용병·✓/✗', async () => {
    await mount(createElement(CupDayResults, { days: [days[0]] }));
    await click(container.querySelector('button[data-role="cup-day-toggle"]'));
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
    await click(container.querySelector('button[data-role="cup-day-toggle"]'));
    expect(container.querySelector('div[data-role="cup-day-team"][data-team="팀A"]').textContent).toContain('등록 10명 참석');
    expect(container.querySelector('div[data-role="cup-day-team"][data-team="팀A"]').textContent).toContain('✓ +3');
  });
  it('days 가 비면 아무것도 그리지 않는다', async () => {
    await mount(createElement(CupDayResults, { days: [] }));
    expect(container.querySelectorAll('div[data-role="cup-day"]')).toHaveLength(0);
  });
});
