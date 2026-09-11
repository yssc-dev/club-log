// 스펙 §15: 로그 시트만 쓰는 축구팀(빅마스터FC)의 대시보드는 대시보드·포인트 로그·선수별집계·순위 증감
// 시트를 읽지 않고 분석 탭으로 열린다. 대조군(prop 기본값 false, 풋살 종목)으로 판별력을 확인한다.
// 하네스는 TeamDashboard.render.test.jsx 와 같은 act+createRoot 실렌더.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { ThemeProvider } from '../../../hooks/useTheme';
import TeamDashboard from '../TeamDashboard';

const fetchSheetDataSpy = vi.fn(() => Promise.resolve({ players: [{ name: '대시보드선수', games: 1 }], keepers: [] }));
vi.mock('../../../services/sheetService', () => ({
  fetchSheetData: (...a) => fetchSheetDataSpy(...a),
  fetchAttendanceData: () => Promise.resolve(null),
}));

vi.mock('../../../config/settings', () => ({
  getSettings: () => ({ playerLogSheet: '', pointLogSheet: '', dashboardSheet: '', attendanceSheet: '', sheetId: '' }),
  getEffectiveSettings: () => ({ useCrovaGoguma: false }),
  loadSettingsFromFirebase: () => Promise.resolve({}),
}));

const getSpy = vi.fn(() => Promise.resolve([]));
vi.mock('../../../services/sheetCache', () => ({
  default: { get: (...args) => getSpy(...args) },
}));

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (q) => ({ matches: false, media: q, onchange: null, addListener(){}, removeListener(){}, addEventListener(){}, removeEventListener(){}, dispatchEvent(){} }),
});
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const noop = () => {};
const BASE_PROPS = {
  authUser: { name: '테스트유저' },
  teamName: '빅마스터FC',
  teamEntries: [{ mode: '축구', role: '관리자' }],
  onStartGame: noop, onContinueGame: noop, onViewHistory: noop,
  onSettings: noop, onSwitchTeam: noop, onLogout: noop,
  pendingGames: [], checkingPending: false,
};
const NON_LOG = ['pointLog', 'playerLog', 'latestDeltas'];

let container, root;
beforeEach(() => {
  getSpy.mockClear(); fetchSheetDataSpy.mockClear();
  container = document.createElement('div'); document.body.appendChild(container);
});
afterEach(() => { act(() => root?.unmount()); container.remove(); });

async function mount(props = {}) {
  await act(async () => {
    root = createRoot(container);
    root.render(createElement(ThemeProvider, null, createElement(TeamDashboard, { ...BASE_PROPS, ...props })));
  });
}
const datasets = () => getSpy.mock.calls.map(c => c[0]);
const hasTab = (label) => [...container.querySelectorAll('button')].some(b => b.textContent.trim() === label);

describe('TeamDashboard — 로그 시트만 쓰는 축구팀(스펙 §15)', () => {
  it('대시보드·포인트 로그·선수별집계·순위 증감을 읽지 않고, 분석 탭으로 열어 로그 3종만 읽는다', async () => {
    await mount({ soccerLogSheetsOnly: true });
    expect(fetchSheetDataSpy).not.toHaveBeenCalled();          // TeamDashboard + PlayerAnalytics 둘 다
    for (const d of NON_LOG) expect(datasets()).not.toContain(d);
    expect(container.textContent).toContain('선수 분석');         // 분석 탭 섹션 제목 = 첫 탭이 분석
    expect(getSpy).toHaveBeenCalledWith('matchLog', { sport: '축구' });
    expect(getSpy).toHaveBeenCalledWith('eventLog', { sport: '축구' });
    expect(getSpy).toHaveBeenCalledWith('playerGameLog', { sport: '축구' });
    expect(container.textContent).not.toContain('NaN');
    expect(hasTab('대회'), '대회 생성은 대회_* 탭을 만든다 — 숨긴다').toBe(false);
    expect(hasTab('분석')).toBe(true);
  });

  it('대조: prop 기본값(하버FC 등)이면 기존대로 대시보드 탭으로 열고 네 시트를 읽는다', async () => {
    await mount({ teamName: '하버FC' });
    expect(fetchSheetDataSpy).toHaveBeenCalled();
    for (const d of NON_LOG) expect(datasets()).toContain(d);
    expect(container.textContent).not.toContain('선수 분석');
    expect(hasTab('대회'), '하버FC 는 대회 탭 그대로').toBe(true);
  });

  it('대조: prop 이 켜져 있어도 종목이 축구가 아니면 적용하지 않는다', async () => {
    await mount({ soccerLogSheetsOnly: true, teamEntries: [{ mode: '풋살', role: '관리자' }] });
    expect(fetchSheetDataSpy).toHaveBeenCalled();
    expect(datasets()).toContain('latestDeltas');
    expect(container.textContent).not.toContain('선수 분석');
  });
});
