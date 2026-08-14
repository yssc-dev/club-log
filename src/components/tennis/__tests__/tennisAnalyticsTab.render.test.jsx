// 로딩게이트 통과 후 실렌더 검증 (client render + act로 useEffect 플러시).
// SSR 스모크는 useEffect 미실행이라 로딩화면만 그려짐 → 서브탭 분리/차트 배선 등
// 로딩 이후 렌더 경로의 크래시(TDZ·참조오류)를 잡지 못한다. 이 파일이 그 공백을 메운다.
// memory: feedback_component_render_verification_gap.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { createElement } from 'react';
import { ThemeProvider } from '../../../hooks/useTheme';
import TennisAnalyticsTab from '../TennisAnalyticsTab';

// 소규모 픽스처 — 로스터 비어있지 않게, 2026 로우 몇 건(섹션 계산 실행용)
const ROSTER = [{ name: '박준태' }, { name: '문형민' }, { name: '박성언' }];
const GAMES = [
  { match_id: '[T]1_CM', game_id: 'g1', format: '단식', side: 'A', player: '박준태', result: '승', date: '2026-08-01', season: '2026', aces: 3, double_faults: 1 },
  { match_id: '[T]1_CM', game_id: 'g1', format: '단식', side: 'B', player: '문형민', result: '패', date: '2026-08-01', season: '2026', aces: 1, double_faults: 2 },
  { match_id: '[T]2_CM', game_id: 'g2', format: '복식', side: 'A', player: '박준태', partner: '박성언', result: '승', date: '2026-08-02', season: '2026', aces: 2, double_faults: 0 },
  { match_id: '[T]2_CM', game_id: 'g2', format: '복식', side: 'A', player: '박성언', partner: '박준태', result: '승', date: '2026-08-02', season: '2026', aces: 0, double_faults: 1 },
  { match_id: '[T]2_CM', game_id: 'g2', format: '복식', side: 'B', player: '문형민', partner: '', result: '패', date: '2026-08-02', season: '2026', aces: 1, double_faults: 3 },
];

vi.mock('../../../services/tennisSync', () => ({
  default: {
    getPlayerGames: () => Promise.resolve(GAMES),
    getLegacyRecords: () => Promise.resolve([]),
    getRoster: () => Promise.resolve(ROSTER),
  },
}));

Object.defineProperty(window, 'matchMedia', {
  writable: true, value: (q) => ({ matches: false, media: q, addListener(){}, removeListener(){}, addEventListener(){}, removeEventListener(){}, dispatchEvent(){} }),
});

// act(...) 지원 환경 플래그 (React 19)
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let container, root;
beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); });
afterEach(() => { act(() => root?.unmount()); container.remove(); });

async function mount() {
  await act(async () => {
    root = createRoot(container);
    root.render(createElement(ThemeProvider, null, createElement(TennisAnalyticsTab, { C: undefined })));
  });
}
function clickButtonByText(text) {
  const btn = [...container.querySelectorAll('button')].find(b => b.textContent.trim() === text);
  if (!btn) throw new Error(`button "${text}" 없음`);
  return act(() => btn.dispatchEvent(new window.MouseEvent('click', { bubbles: true })));
}

describe('TennisAnalyticsTab 실렌더(로딩 이후)', () => {
  it('로딩게이트 통과 후 서브탭 칩이 뜬다(크래시 없음)', async () => {
    await mount();
    expect(container.textContent).not.toContain('데이터 로딩중');
    expect(container.textContent).toContain('개인지표');
    expect(container.textContent).toContain('전체지표');
    // 개인지표 기본 + 선수 미선택 → 힌트 카드
    expect(container.textContent).toContain('선수를 선택');
  });

  it('전체지표 전환 시 랭킹/케미 섹션 렌더(크래시 없음)', async () => {
    await mount();
    await clickButtonByText('전체지표');
    // 페어 케미(복식 전체지표) 섹션 제목
    expect(container.textContent).toContain('페어 케미');
    expect(container.textContent).toContain('타이브레이크');
    // 선수 select는 전체지표에서 숨김 → 힌트 미표시
    expect(container.textContent).not.toContain('선수를 선택');
  });

  it('개인지표에서 선수 선택 시 개인 섹션 렌더(레이더 등, 크래시 없음)', async () => {
    await mount();
    // 선수 select 찾기(옵션에 로스터 이름 포함된 select)
    const playerSelect = [...container.querySelectorAll('select')].find(s => s.textContent.includes('박준태'));
    expect(playerSelect).toBeTruthy();
    await act(() => {
      playerSelect.value = '박준태';
      playerSelect.dispatchEvent(new window.Event('change', { bubbles: true }));
    });
    // 개인 프로필(레이더) 섹션 렌더 — 힌트는 사라짐
    expect(container.textContent).not.toContain('선수를 선택');
    expect(container.textContent).toContain('개인 프로필');
  });
});
