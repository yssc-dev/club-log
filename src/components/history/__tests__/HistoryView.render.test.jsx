// HistoryView 상세 실렌더(act) — '선수별 기록'이 로그_선수경기를 읽는지 검증.
// 이 표는 원래 아카이브 원본 state 에서 재계산했고, 그 재계산기에 황금크로바/탄고구마
// 배율이 없어 2026-11-05 팀필선 크로바가 시트에선 4인데 화면엔 2로 떴다.
// SSR 로는 useEffect 가 안 돌아 목록 로딩 화면만 보이므로 act+createRoot 실렌더로 확인한다.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { ThemeProvider } from '../../../hooks/useTheme';
import HistoryView from '../HistoryView';

const GAME_ID = 'g_1';
const GAME_DATE = '2026-11-05';

// 아카이브 원본 state — 재계산하면 크로바가 crovaPoint(2) 로 나오는 모양.
const STATE = {
  gameDate: GAME_DATE,
  courtCount: 2,
  matchMode: 'schedule',
  teamNames: ['팀필선', '팀동근'],
  teams: [['우창호'], ['정동근']],
  attendees: ['우창호', '정동근'],
  allEvents: [],
  completedMatches: [
    { matchId: 'R1_C0', homeTeam: '팀필선', awayTeam: '팀동근', homeScore: 1, awayScore: 0, homeGk: '', awayGk: '' },
  ],
  settingsSnapshot: { useCrovaGoguma: true, crovaPoint: 2, gogumaPoint: -1, ownGoalPoint: -2, foulPoint: -1 },
};

// 로그_선수경기(진실 소스) — 황금크로바가 반영된 4.
const pg = (player, team, o = {}) => ({
  date: GAME_DATE, player, session_team: team,
  goals: 0, assists: 0, owngoals: 0, fouls: 0, conceded: 0, cleansheets: 0,
  crova: 0, goguma: 0, keeper_games: 0, ...o,
});
const PLAYER_GAME_LOG = [pg('우창호', '팀필선', { crova: 4 }), pg('정동근', '팀동근', { goguma: -1 })];

// 테스트별로 state 를 갈아끼운다(컵 세션 케이스).
const stateRef = { current: STATE };
vi.mock('../../../services/firebaseSync', () => ({
  default: {
    loadFinalizedList: () => Promise.resolve([{ gameId: GAME_ID, gameDate: GAME_DATE }]),
    loadTrashedFinalized: () => Promise.resolve([]),
    loadFinalizedOne: () => Promise.resolve(JSON.stringify(stateRef.current)),
    fixFinalizedGameDate: () => Promise.resolve(),
  },
}));

const getSpy = vi.fn((dataset) => Promise.resolve(dataset === 'playerGameLog' ? PLAYER_GAME_LOG : []));
vi.mock('../../../services/sheetCache', () => ({ default: { get: (...a) => getSpy(...a) } }));

vi.mock('../../../config/settings', () => ({
  getEffectiveSettings: () => ({ useCrovaGoguma: true, crovaPoint: 2, gogumaPoint: -1, ownGoalPoint: -2, foulPoint: -1 }),
}));

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (q) => ({ matches: false, media: q, onchange: null, addListener(){}, removeListener(){}, addEventListener(){}, removeEventListener(){}, dispatchEvent(){} }),
});
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let container, root;
beforeEach(() => { getSpy.mockClear(); stateRef.current = STATE; container = document.createElement('div'); document.body.appendChild(container); });
afterEach(() => { act(() => root?.unmount()); container.remove(); });

async function mountAndOpenDetail() {
  await act(async () => {
    root = createRoot(container);
    root.render(createElement(ThemeProvider, null,
      createElement(HistoryView, { teamContext: { team: '마스터FC', mode: '풋살' }, onBack: () => {} })));
  });
  const card = [...container.querySelectorAll('div')].find(d => d.textContent.includes('2026/11/5') && d.onclick);
  expect(card, '아카이브 목록 카드를 찾지 못함').toBeTruthy();
  await act(async () => { card.click(); });
}

// 선수 행의 셀 텍스트 배열 — 열 순서: 선수 골 어시 역주행 클린 🍀 🍠 실점 GK 총점
function cellsOf(name) {
  const tr = [...container.querySelectorAll('tr')].find(r => r.cells?.[0]?.textContent.startsWith(name));
  expect(tr, `${name} 행 없음`).toBeTruthy();
  return [...tr.cells].map(td => td.textContent);
}

describe('HistoryView 상세 실렌더 — 선수별 기록 소스', () => {
  it('로그_선수경기의 크로바(황금크로바 4)를 그대로 보여준다', async () => {
    await mountAndOpenDetail();
    expect(container.textContent).toContain('선수별 기록');
    expect(getSpy).toHaveBeenCalledWith('playerGameLog', { sport: '풋살' });
    const c = cellsOf('우창호');
    expect(c[5]).toBe('4');      // 🍀 — 재계산이면 2
    expect(c[9]).toBe('4');      // 총점
    expect(cellsOf('정동근')[6]).toBe('-1');  // 🍠
  });

  it('팀명은 로그의 session_team 을 쓴다', async () => {
    await mountAndOpenDetail();
    expect(cellsOf('우창호')[0]).toContain('팀필선');
  });

  it('NaN 이나 크래시 없이 렌더된다', async () => {
    await mountAndOpenDetail();
    expect(container.textContent).not.toContain('NaN');
    expect(container.textContent).not.toContain('undefined');
  });

  // 풋살 로그 캐시는 컵 행을 걸러 반환한다(sheetCache rowFilter) — 같은 날짜에 정규 세션이
  // 있으면 그 행이 컵 아카이브에 잘못 붙는다. tournamentId 가 있으면 재계산을 쓴다.
  it('컵 세션은 시트 행을 쓰지 않고 재계산 결과를 보여준다', async () => {
    stateRef.current = { ...STATE, tournamentId: '마스터스컵 2026' };
    getSpy.mockImplementation((ds) => Promise.resolve(
      ds === 'playerGameLog' ? [pg('우창호', '팀필선', { goals: 9, crova: 4 })] : []));
    await mountAndOpenDetail();
    expect(cellsOf('우창호')[1]).toBe('0');   // 골 — 시트 행을 썼다면 9
  });
});
