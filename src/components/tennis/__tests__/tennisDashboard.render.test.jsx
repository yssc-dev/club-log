// 로딩게이트 통과 후 실렌더 검증 (client render + act로 useEffect 플러시).
// SSR 스모크는 useEffect 미실행이라 loading 화면만 → '마지막 경기' 카드 등 데이터 경로를 못 잡는다.
// 이 파일이 그 공백을 메운다(LastMatchCard의 new Date()/요일/경과일 렌더 크래시 방어).
// memory: feedback_component_render_verification_gap.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { ThemeProvider } from '../../../hooks/useTheme';
import TennisDashboard from '../TennisDashboard';

const GAMES = [
  { date: '2026-08-01', game_id: 'g1', match_id: 'R1_C1', player: '박성언', partner: '김원희', side: 'A', format: '복식', league: '투몽', result: '승', is_guest: false },
  { date: '2026-08-01', game_id: 'g1', match_id: 'R1_C1', player: '김원희', partner: '박성언', side: 'A', format: '복식', league: '투몽', result: '승', is_guest: false },
  { date: '2026-08-17', game_id: 'g9', match_id: 'R1_C1', player: '박성언', partner: '기다빈', side: 'A', format: '복식', league: '투몽', result: '승', is_guest: false },
  { date: '2026-08-17', game_id: 'g9', match_id: 'R1_C1', player: '기다빈', partner: '박성언', side: 'A', format: '복식', league: '투몽', result: '패', is_guest: false },
  { date: '2026-08-17', game_id: 'g9', match_id: 'R2_C1', player: '박성언', partner: '두리', side: 'A', format: '복식', league: '미반영', result: '승', is_guest: false },
  { date: '2026-08-17', game_id: 'g9', match_id: 'R2_C1', player: '두리', partner: '박성언', side: 'A', format: '복식', league: '미반영', result: '승', is_guest: true },
];
const ROSTER = [{ name: '박성언' }, { name: '김원희' }, { name: '기다빈' }];

vi.mock('../../../services/tennisSync', () => ({
  default: {
    getPlayerGames: () => Promise.resolve(GAMES),
    getRoster: () => Promise.resolve(ROSTER),
    getLegacyRecords: () => Promise.resolve([]),
  },
}));

Object.defineProperty(window, 'matchMedia', {
  writable: true, value: (q) => ({ matches: false, media: q, addListener(){}, removeListener(){}, addEventListener(){}, removeEventListener(){}, dispatchEvent(){} }),
});
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let container, root;
beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); });
afterEach(() => { act(() => root?.unmount()); container.remove(); });

async function mount() {
  await act(async () => {
    root = createRoot(container);
    root.render(createElement(ThemeProvider, null, createElement(TennisDashboard, { C: undefined })));
  });
}

describe('TennisDashboard 실렌더(로딩 이후)', () => {
  it('마지막 경기 카드 렌더 — 최신일자·경기수·참석·다승(크래시 없음)', async () => {
    await mount();
    expect(container.textContent).not.toContain('데이터 로딩중');
    expect(container.textContent).toContain('마지막 경기');
    // 최신 경기일 2026-08-17 → "8월 17일"
    expect(container.textContent).toContain('8월 17일');
    // 그 날 회원 2명(박성언·기다빈), 용병 1(두리)
    expect(container.textContent).toContain('+용병');
    // 다승 1위 = 박성언 2승 (8/17 R1·R2 모두 승). '2승'은 마지막경기 카드 고유(이달=3승)
    expect(container.textContent).toContain('박성언 2승');
  });
});
