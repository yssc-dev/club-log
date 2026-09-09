// RecentFormTop3 wrapper(default export) 실렌더 — sport 오버라이드 배선 검증.
// RecentFormTop3View(순수 프레젠테이션)는 RecentFormTop3.test.jsx가 이미 덮는다.
// 여기서 보는 건 default export(자체 fetch를 소유한 wrapper)가 activeSport prop을
// SheetCache.get 에 그대로 넘기는지다 — 이게 비면 캐시가 AuthUtil.mode 로만 종목을
// 판단해 겸직팀(한 팀에 풋살·축구 탭이 함께 뜨는 경우)에서 화면 탭과 캐시 종목이
// 갈린다(Critical — 2026-09-09 수정 라운드 1). 이 테스트가 재발 방지선이다.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import RecentFormTop3 from '../RecentFormTop3';

const getSpy = vi.fn(() => Promise.resolve([]));
vi.mock('../../../../services/sheetCache', () => ({
  default: { get: (...args) => getSpy(...args) },
}));

// RecentFormTop3 는 C/ds 를 props 로 직접 받는다(useTheme 훅을 쓰지 않는다) — ThemeProvider/
// matchMedia 스텁이 필요 없다.
const C = {
  card: '#111', cardLight: '#222', borderColor: '#333',
  white: '#fff', gray: '#888', accent: '#07f', green: '#0c0', orange: '#f90',
};
const ds = { section: {}, sectionTitle: {} };

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
    root.render(createElement(RecentFormTop3, { members: [], C, ds, ...props }));
  });
}

describe('RecentFormTop3 (wrapper) — sport 오버라이드 배선', () => {
  it('activeSport="축구" prop을 SheetCache.get의 두 번째 인자로 그대로 전달한다', async () => {
    await mount({ activeSport: '축구' });
    expect(getSpy).toHaveBeenCalledWith('playerGameLog', { sport: '축구' });
  });

  it('activeSport="풋살" prop이면 풋살로 전달한다(AuthUtil.mode 가 다른 값이어도 무관)', async () => {
    await mount({ activeSport: '풋살' });
    expect(getSpy).toHaveBeenCalledWith('playerGameLog', { sport: '풋살' });
  });

  it('activeSport 가 바뀌면(종목 탭 전환) 새 값으로 다시 호출한다', async () => {
    await mount({ activeSport: '풋살' });
    expect(getSpy).toHaveBeenLastCalledWith('playerGameLog', { sport: '풋살' });

    await act(async () => {
      root.render(createElement(RecentFormTop3, { members: [], C, ds, activeSport: '축구' }));
    });
    expect(getSpy).toHaveBeenLastCalledWith('playerGameLog', { sport: '축구' });
  });
});
