// PlayerAnalytics 실렌더(act) 스모크 — SheetCache 전환 경로 검증.
// SSR은 useEffect를 실행하지 않아 로딩 화면만 보이므로(memory:
// feedback_component_render_verification_gap), 캐시에서 온 matchLog/eventLog/playerGameLog가
// (더 이상 {rows} 래퍼가 아니라 배열 그대로) 실제로 화면에 꽂히는지 act+createRoot로 확인한다.
// PlayerAnalytics는 직전까지 테스트가 0개였다 — 마운트 크래시(.rows 잔재 등)를 잡는 최초 게이트.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { ThemeProvider } from '../../../hooks/useTheme';
import PlayerAnalytics from '../PlayerAnalytics';

// analyticsTabs.smoke.test.jsx와 같은 합성 풋살 데이터(2세션, A·B vs C·D 로테이션).
const matchLogs = [
  { date: '2026-06-04', match_id: 'R1_C1', our_members_json: '["A","B"]', opponent_members_json: '["C","D"]', our_score: 2, opponent_score: 1, our_gk: 'B', opponent_gk: 'D', round_idx: 1 },
  { date: '2026-06-11', match_id: 'R1_C1', our_members_json: '["A","B"]', opponent_members_json: '["C","D"]', our_score: 3, opponent_score: 0, our_gk: 'B', opponent_gk: 'C', round_idx: 1 },
];
const eventLogs = [
  { event_type: 'goal', player: 'A', related_player: 'B', date: '2026-06-04', match_id: 'R1_C1', input_time: '2026-06-04 20:01:00.000' },
  { event_type: 'goal', player: 'A', related_player: '', date: '2026-06-11', match_id: 'R1_C1', input_time: '2026-06-11 20:01:00.000' },
];
const playerGameLogs = [
  { player: 'A', date: '2026-06-04', goals: 1, assists: 0, keeper_games: 0, conceded: 1, cleansheets: 0, owngoals: 0, rank_score: 3 },
  { player: 'B', date: '2026-06-04', goals: 0, assists: 1, keeper_games: 1, conceded: 1, cleansheets: 0, owngoals: 0, rank_score: 2 },
];
const MEMBERS = [{ name: 'A' }, { name: 'B' }, { name: 'C' }, { name: 'D' }];

vi.mock('../../../services/sheetService', () => ({
  fetchSheetData: () => Promise.resolve({ players: MEMBERS, keepers: [] }),
}));

vi.mock('../../../config/settings', () => ({
  getEffectiveSettings: () => ({ useCrovaGoguma: false }),
}));

// 로그 3종은 캐시에서 {rows} 래퍼가 아니라 배열로 온다 — 호출부(PlayerAnalytics)가
// 그 가정을 그대로 쓰는지 확인하는 게 이 테스트의 핵심.
vi.mock('../../../services/sheetCache', () => ({
  default: {
    get: (dataset) => Promise.resolve(
      dataset === 'matchLog' ? matchLogs
      : dataset === 'eventLog' ? eventLogs
      : dataset === 'playerGameLog' ? playerGameLogs
      : []
    ),
  },
}));

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (q) => ({ matches: false, media: q, onchange: null, addListener(){}, removeListener(){}, addEventListener(){}, removeEventListener(){}, dispatchEvent(){} }),
});
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let container, root;
beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); });
afterEach(() => { act(() => root?.unmount()); container.remove(); });

async function mount(props) {
  await act(async () => {
    root = createRoot(container);
    root.render(createElement(ThemeProvider, null,
      createElement(PlayerAnalytics, { teamName: '테스트팀', teamMode: '풋살', authUserName: 'A', isAdmin: false, ...props })));
  });
}

describe('PlayerAnalytics 실렌더(act) — SheetCache 읽기 경로 (.rows 래퍼 제거)', () => {
  it('풋살 — 크래시 없이 렌더되고 캐시 데이터(개인분석 탭)가 화면에 꽂힌다', async () => {
    await mount();
    expect(container.textContent).not.toContain('NaN');
    expect(container.textContent).toContain('팀 득점 관여율');
    expect(container.textContent).toContain('랭크점수');
  });

  it('축구 모드 — 같은 배선으로 크래시 없이 렌더된다', async () => {
    await mount({ teamMode: '축구' });
    expect(container.textContent).not.toContain('NaN');
    expect(container.textContent).toContain('팀 득점 관여율');
  });
});
