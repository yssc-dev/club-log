// TeamDashboard 실렌더(act) 스모크 — SheetCache 전환 경로 검증.
// SSR(renderToStaticMarkup)은 useEffect를 실행하지 않아 로딩 화면만 보인다
// (memory: feedback_component_render_verification_gap, tennisDashboard.render.test.jsx와 같은 공백).
// 이 테스트는 캐시에서 온 값이 실제로 화면에 꽂히는지를 act+createRoot 실렌더로 확인한다.
// TeamDashboard는 직전까지 테스트가 0개였다 — 마운트 크래시(선언순서/TDZ)를 잡는 최초 자동화 게이트.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { ThemeProvider } from '../../../hooks/useTheme';
import TeamDashboard from '../TeamDashboard';

const MEMBERS = [
  { name: '테스트선수', games: 5, goals: 3, assists: 2, point: 50 },
];

vi.mock('../../../services/sheetService', () => ({
  fetchSheetData: () => Promise.resolve({ players: MEMBERS, keepers: [] }),
  fetchAttendanceData: () => Promise.resolve(null),
}));

// config/settings는 실제 모듈을 쓰면 Firebase(firebase/database)까지 걷어내야 해서,
// TeamDashboard가 동기 호출하는 getSettings/getEffectiveSettings + loadSettingsFromFirebase를
// 통째로 스텁한다(이 테스트의 관심사는 SheetCache 배선이지 설정 로딩 자체가 아니다).
vi.mock('../../../config/settings', () => ({
  getSettings: () => ({ playerLogSheet: '', pointLogSheet: '', dashboardSheet: '', attendanceSheet: '', sheetId: '' }),
  getEffectiveSettings: () => ({ useCrovaGoguma: false }),
  loadSettingsFromFirebase: () => Promise.resolve({}),
}));

// RecentFormTop3(대시보드 최상단, 무조건 렌더)가 자체 지연로드하는 playerGameLog.
// RecentFormTop3.test.jsx와 같은 픽스처 규약 — 4세션 윈도우 내 기록이 있어야 TOP3에 든다.
const PG_DATES = ['2026-07-30', '2026-08-06', '2026-08-13', '2026-08-20'];
const pg = (date, player, o = {}) => ({
  date, player, goals: 0, assists: 0, cleansheets: 0, crova: 0, goguma: 0, owngoals: 0, games: 0, ...o,
});
const PLAYER_GAME_LOG = PG_DATES.map(d => pg(d, '테스트선수', { goals: 2, assists: 1 }));

// 스파이로 받는다 — 2번째 인자({ sport })를 버리면 누가 TeamDashboard.jsx 의
// { sport: activeSport } 를 지워도 깨지는 테스트가 없다(DefenseTopCards.render.test.jsx
// 와 같은 방식의 재발 방지선).
const getSpy = vi.fn((dataset) => Promise.resolve(
  dataset === 'latestDeltas' ? { '테스트선수': { goals: 2, assists: 1 } }
  : dataset === 'playerGameLog' ? PLAYER_GAME_LOG
  : dataset === 'cumulativeBonus' ? { crova: {}, goguma: {} }
  : []
));
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
  teamName: '테스트팀',
  teamEntries: [{ mode: '풋살', role: '관리자' }],
  onStartGame: noop, onContinueGame: noop, onViewHistory: noop,
  onSettings: noop, onSwitchTeam: noop, onLogout: noop,
  pendingGames: [], checkingPending: false,
};

let container, root;
beforeEach(() => { getSpy.mockClear(); container = document.createElement('div'); document.body.appendChild(container); });
afterEach(() => { act(() => root?.unmount()); container.remove(); });

async function mount(props = {}) {
  await act(async () => {
    root = createRoot(container);
    root.render(createElement(ThemeProvider, null, createElement(TeamDashboard, { ...BASE_PROPS, ...props })));
  });
}

describe('TeamDashboard 실렌더(act) — SheetCache 읽기 경로', () => {
  it('크래시 없이 렌더되고 캐시 데이터가 화면에 꽂힌다', async () => {
    await mount();
    expect(container.textContent).not.toContain('NaN');
    // fetchSheetData(CSV, 캐시 대상 아님) 목 데이터가 명부에 반영됐는지
    expect(container.textContent).toContain('테스트선수');
    // SheetCache.get('latestDeltas') → 골 TOP5 옆 Δ뱃지("↑"+값, 공백 없음)
    expect(container.textContent).toContain('↑2');
    // RecentFormTop3 내부의 SheetCache.get('playerGameLog') 호출 결과가 반영됐는지
    expect(container.textContent).toContain('최근 한 달 기세 TOP3');
  });

  // 겸직팀(한 팀에 풋살·축구 탭)에서 activeSport 를 넘기지 않으면 캐시가 AuthUtil.mode
  // (팀 선택 시 entries[0].mode 로 한 번만 저장됨)로 판단해 화면 탭과 데이터가 갈린다.
  // 2번째 인자를 단언해야 { sport: activeSport } 제거가 테스트로 잡힌다.
  it('activeSport 를 SheetCache.get 의 2번째 인자로 넘긴다(풋살 팀)', async () => {
    await mount();
    expect(getSpy).toHaveBeenCalledWith('latestDeltas', { sport: '풋살' });
    // RecentFormTop3(무조건 렌더)도 같은 배선이어야 한다.
    expect(getSpy).toHaveBeenCalledWith('playerGameLog', { sport: '풋살' });
    // 풋살 전용 팀에서는 축구 전용 조회(playerLog/pointLog)가 아예 돌지 않는다.
    expect(getSpy.mock.calls.map(c => c[0])).not.toContain('pointLog');
  });

  // 하드코딩("풋살")이 아니라 실제로 teamEntries 의 종목을 따르는지 증명.
  it('축구 팀이면 축구로 넘기고 축구 전용 데이터셋도 같은 종목으로 조회한다', async () => {
    await mount({ teamEntries: [{ mode: '축구', role: '관리자' }] });
    expect(getSpy).toHaveBeenCalledWith('latestDeltas', { sport: '축구' });
    expect(getSpy).toHaveBeenCalledWith('playerLog', { sport: '축구' });
    expect(getSpy).toHaveBeenCalledWith('pointLog', { sport: '축구' });
    expect(getSpy).toHaveBeenCalledWith('playerGameLog', { sport: '축구' });
  });
});
