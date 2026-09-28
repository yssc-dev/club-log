// src/components/common/__tests__/Modal.backNav.render.test.jsx
// 공용 Modal 은 열려 있는 동안 브라우저 뒤로가기로 닫힌다(2단계). 모든 Modal 사용처(대시보드·경기 화면)가 한 번에 적용된다.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { ThemeProvider } from '../../../hooks/useTheme';
import { _resetBackNavigationForTest } from '../../../hooks/useBackNavigation';
import Modal from '../Modal';

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (q) => ({ matches: false, media: q, onchange: null, addListener(){}, removeListener(){}, addEventListener(){}, removeEventListener(){}, dispatchEvent(){} }),
});
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let container, root, pushSpy, backSpy;
beforeEach(() => {
  _resetBackNavigationForTest();
  container = document.createElement('div'); document.body.appendChild(container);
  pushSpy = vi.spyOn(window.history, 'pushState').mockImplementation(() => {});
  backSpy = vi.spyOn(window.history, 'back').mockImplementation(() => {});
});
afterEach(() => { act(() => root?.unmount()); root = null; container.remove(); vi.restoreAllMocks(); });

const popstate = async () => { await act(async () => { window.dispatchEvent(new PopStateEvent('popstate', { state: null })); }); };
async function mount(onClose) {
  await act(async () => {
    root = createRoot(container);
    root.render(createElement(ThemeProvider, null, createElement(Modal, { onClose, title: '테스트' }, createElement('div', null, '본문'))));
  });
}

describe('Modal — 브라우저 뒤로가기', () => {
  it('열리면 history 항목을 하나 쌓고, 뒤로가기(popstate)면 onClose 를 부른다', async () => {
    const onClose = vi.fn();
    await mount(onClose);
    expect(pushSpy).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain('본문');
    await popstate();
    expect(onClose).toHaveBeenCalledTimes(1);
  });
  it('X 버튼 등으로 닫혀 언마운트되면 쌓아둔 항목을 back() 으로 걷어내고, 그 메아리는 onClose 를 다시 부르지 않는다', async () => {
    const onClose = vi.fn();
    await mount(onClose);
    await act(async () => { root.unmount(); });
    root = null;
    expect(backSpy).toHaveBeenCalledTimes(1);
    await popstate();
    expect(onClose).not.toHaveBeenCalled();
  });
  it('onClose 가 없어도 뒤로가기에 크래시하지 않는다', async () => {
    await mount(undefined);
    await popstate();
    expect(container.textContent).toContain('본문');
  });
});
