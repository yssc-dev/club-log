// activeTab='games' 경기 목록 배지 검증.
// 풋살 TeamDashboard 패턴 이식 후 렌더 크래시 방어 + 상태 배지 3케이스.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import TennisTabs from '../TennisTabs';

Object.defineProperty(window, 'matchMedia', {
  writable: true, value: (q) => ({ matches: false, media: q, addListener(){}, removeListener(){}, addEventListener(){}, removeEventListener(){}, dispatchEvent(){} }),
});
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// TennisTabs calls makeStyles(C) directly (no useTheme fallback), so we need a real C stub.
const MOCK_C = {
  bg: '#0f172a', card: '#1e293b', cardLight: '#334155',
  accent: '#22d3ee', accentDim: '#0891b2',
  white: '#f8fafc', gray: '#94a3b8', grayLight: '#64748b', grayDark: '#475569', grayDarker: '#334155',
  green: '#10b981', greenDim: '#059669', red: '#ef4444', redDim: '#dc2626',
  orange: '#f97316', yellow: '#eab308', purple: '#a855f7',
  borderColor: '#1e293b',
  headerBg: 'rgba(0,0,0,0.8)', overlay: 'rgba(0,0,0,0.6)', overlayLight: 'rgba(0,0,0,0.4)',
  headerTextDim: '#94a3b8', headerBtnBg: '#334155', headerBtnColor: '#22d3ee', headerBtnDimColor: '#94a3b8',
};

function makeGame(stateOver) {
  return {
    gameId: 'g_' + Math.random(),
    state: { sport: '테니스', gameDate: '2026-08-01', gameCreator: '테스터', rounds: [{}], attendees: ['a'], gameFinalized: false, phase: 'playing', ...stateOver },
  };
}

let container, root;
beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); });
afterEach(() => { act(() => root?.unmount()); container.remove(); });

async function mount(games) {
  await act(async () => {
    root = createRoot(container);
    root.render(createElement(TennisTabs, {
      activeTab: 'games',
      pendingGames: games,
      onStartGame: vi.fn(),
      onContinueGame: vi.fn(),
      onViewHistory: vi.fn(),
      authUserName: '테스터',
      role: '일반',
      C: MOCK_C,
    }));
  });
}

describe('TennisTabs games 탭 — 상태 배지', () => {
  it('phase: playing → "진행중" 배지', async () => {
    await mount([makeGame({ phase: 'playing' })]);
    expect(container.textContent).toContain('진행중');
    expect(container.textContent).not.toContain('마감됨');
    expect(container.textContent).not.toContain('전송완료');
  });

  it('phase: summary, gameFinalized: false → "마감됨" 배지', async () => {
    await mount([makeGame({ phase: 'summary', gameFinalized: false })]);
    expect(container.textContent).toContain('마감됨');
    expect(container.textContent).not.toContain('진행중');
    expect(container.textContent).not.toContain('전송완료');
  });

  it('gameFinalized: true → "전송완료" 배지 (phase=summary여도 전송완료 우선)', async () => {
    await mount([makeGame({ phase: 'summary', gameFinalized: true })]);
    expect(container.textContent).toContain('전송완료');
    expect(container.textContent).not.toContain('마감됨');
    expect(container.textContent).not.toContain('진행중');
  });
});
