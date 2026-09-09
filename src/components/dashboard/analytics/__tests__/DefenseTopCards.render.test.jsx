// DefenseTopCards wrapper(default export) 실렌더 — sport 오버라이드 배선 검증.
// DefenseTopCardsView(순수 프레젠테이션)는 DefenseTopCards.test.jsx가 이미 덮는다.
// 여기서 보는 건 default export(자체 fetch를 소유한 wrapper)가 activeSport prop을
// SheetCache.get 에 그대로 넘기는지다 — RecentFormTop3와 완전히 같은 패턴인데 이 wrapper만
// 방지선이 없으면 누가 DefenseTopCards.jsx의 { sport: activeSport }를 지워도 아무 테스트도
// 안 깨진다(Critical — 2026-09-09 수정 라운드 1/2). 이 테스트가 재발 방지선이다.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import DefenseTopCards from '../DefenseTopCards';

const getSpy = vi.fn(() => Promise.resolve([]));
vi.mock('../../../../services/sheetCache', () => ({
  default: { get: (...args) => getSpy(...args) },
}));

// DefenseTopCards 는 C/ds 를 props 로 직접 받는다(useTheme 훅을 쓰지 않는다) — ThemeProvider/
// matchMedia 스텁이 필요 없다.
const C = {
  card: '#111', cardLight: '#222', borderColor: '#333',
  white: '#fff', gray: '#888', accent: '#07f', green: '#0c0', orange: '#f90',
};
const ds = { section: {}, sectionTitle: {}, card: {} };

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let container, root;
beforeEach(() => {
  getSpy.mockClear();
  container = document.createElement('div');
  document.body.appendChild(container);
});
afterEach(() => { act(() => root?.unmount()); container.remove(); });

async function mount(props) {
  await act(async () => {
    root = createRoot(container);
    root.render(createElement(DefenseTopCards, { C, ds, ...props }));
  });
}

describe('DefenseTopCards (wrapper) — sport 오버라이드 배선', () => {
  // 실제 화면에서는 activeSport === "축구" 일 때만 이 컴포넌트가 렌더되지만
  // (TeamDashboard.jsx — activeSport === "축구" && <DefenseTopCards .../>), 여기선
  // wrapper를 직접 렌더하므로 그 게이팅과 무관하게 두 종목 모두 단언할 수 있다.
  it('activeSport="축구" prop을 SheetCache.get의 두 번째 인자로 그대로 전달한다', async () => {
    await mount({ activeSport: '축구' });
    expect(getSpy).toHaveBeenCalledWith('matchLog', { sport: '축구' });
  });

  // 오버라이드가 하드코딩("축구")이 아니라 실제로 prop을 따르는지 증명하는 케이스.
  it('activeSport="풋살" prop이면 풋살로 전달한다(하드코딩이 아니라 prop을 따름)', async () => {
    await mount({ activeSport: '풋살' });
    expect(getSpy).toHaveBeenCalledWith('matchLog', { sport: '풋살' });
  });

  it('activeSport 가 바뀌면(종목 탭 전환) 새 값으로 다시 호출한다', async () => {
    await mount({ activeSport: '풋살' });
    expect(getSpy).toHaveBeenLastCalledWith('matchLog', { sport: '풋살' });

    await act(async () => {
      root.render(createElement(DefenseTopCards, { C, ds, activeSport: '축구' }));
    });
    expect(getSpy).toHaveBeenLastCalledWith('matchLog', { sport: '축구' });
  });
});
