// src/hooks/__tests__/useBackNavigation.test.jsx
// 브라우저 뒤로가기 ↔ 앱 "← 뒤로" 연결 훅. jsdom 의 history 순회에 기대지 않고 pushState/back 을 스파이하고
// popstate 는 직접 발생시켜 결정적으로 검증한다.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement, useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { useBackNavigation, _resetBackNavigationForTest } from '../useBackNavigation';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let container, root, pushSpy, backSpy;
beforeEach(() => {
  _resetBackNavigationForTest();
  container = document.createElement('div'); document.body.appendChild(container);
  pushSpy = vi.spyOn(window.history, 'pushState').mockImplementation(() => {});
  backSpy = vi.spyOn(window.history, 'back').mockImplementation(() => {});
});
afterEach(() => { act(() => root?.unmount()); container.remove(); vi.restoreAllMocks(); });

// active 를 밖에서 조작할 수 있는 화면 흉내. onBack 은 active 를 false 로 만든다(앱의 실제 패턴).
// 조작 핸들은 register 콜백으로 넘긴다(react-hooks/immutability 가 prop 객체 변경을 막는다).
function Screen({ id, initial = false, onBackSpy, register }) {
  const [active, setActive] = useState(initial);
  useEffect(() => { register(id, { open: () => setActive(true), close: () => setActive(false) }); }, [register, id]);
  useBackNavigation(active, () => { onBackSpy(id); setActive(false); });
  return createElement('div', { 'data-id': id, 'data-active': String(active) });
}

const popstate = async () => { await act(async () => { window.dispatchEvent(new PopStateEvent('popstate', { state: null })); }); };

const registry = () => { const api = {}; api.register = (id, h) => { api[id] = h; }; return api; };

async function mount(children) {
  await act(async () => { root = createRoot(container); root.render(children); });
}

describe('useBackNavigation', () => {
  it('비활성이면 아무것도 쌓지 않고 popstate 에도 반응하지 않는다', async () => {
    const api = registry(), onBack = vi.fn();
    await mount(createElement(Screen, { id: 'a', register: api.register, onBackSpy: onBack }));
    expect(pushSpy).not.toHaveBeenCalled();
    await popstate();
    expect(onBack).not.toHaveBeenCalled();
  });

  it('활성화되면 history 항목을 하나 쌓고, 뒤로가기(popstate)면 onBack 을 부른다 — 이후 back() 은 부르지 않는다', async () => {
    const api = registry(), onBack = vi.fn();
    await mount(createElement(Screen, { id: 'a', register: api.register, onBackSpy: onBack }));
    await act(async () => { api.a.open(); });
    expect(pushSpy).toHaveBeenCalledTimes(1);
    await popstate();
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(container.querySelector('[data-id="a"]').dataset.active).toBe('false');
    expect(backSpy).not.toHaveBeenCalled();   // 브라우저가 이미 걷어낸 항목을 또 걷어내지 않는다
  });

  it('앱 버튼으로 닫으면 쌓아둔 항목을 back() 으로 걷어내고, 그로 인한 popstate 는 무시한다', async () => {
    const api = registry(), onBack = vi.fn();
    await mount(createElement(Screen, { id: 'a', register: api.register, onBackSpy: onBack }));
    await act(async () => { api.a.open(); });
    await act(async () => { api.a.close(); });
    expect(backSpy).toHaveBeenCalledTimes(1);
    await popstate();                          // 우리가 부른 back() 의 메아리
    expect(onBack).not.toHaveBeenCalled();
    await popstate();                          // 진짜 뒤로가기 — 활성 화면이 없으니 무시
    expect(onBack).not.toHaveBeenCalled();
  });

  it('중첩: 나중에 열린 화면이 먼저 닫히고, 그 다음 popstate 가 바깥 화면을 닫는다', async () => {
    const api = registry(), onBack = vi.fn();
    await mount(createElement('div', null,
      createElement(Screen, { id: 'outer', register: api.register, onBackSpy: onBack }),
      createElement(Screen, { id: 'inner', register: api.register, onBackSpy: onBack }),
    ));
    await act(async () => { api.outer.open(); });
    await act(async () => { api.inner.open(); });
    expect(pushSpy).toHaveBeenCalledTimes(2);
    await popstate();
    expect(onBack.mock.calls).toEqual([['inner']]);
    expect(container.querySelector('[data-id="outer"]').dataset.active).toBe('true');
    await popstate();
    expect(onBack.mock.calls).toEqual([['inner'], ['outer']]);
    expect(backSpy).not.toHaveBeenCalled();
  });

  it('바깥 화면이 앱 버튼으로 닫힐 때 안쪽도 같이 사라지면 항목 둘 다 걷어낸다', async () => {
    const api = registry(), onBack = vi.fn();
    function Outer() {
      const [active, setActive] = useState(false);
      useEffect(() => { api.register('outer', { open: () => setActive(true), close: () => setActive(false) }); }, []);
      useBackNavigation(active, () => { onBack('outer'); setActive(false); });
      return active ? createElement(Screen, { id: 'inner', initial: true, register: api.register, onBackSpy: onBack }) : null;
    }
    await mount(createElement(Outer));
    await act(async () => { api.outer.open(); });
    expect(pushSpy).toHaveBeenCalledTimes(2);
    await act(async () => { api.outer.close(); });
    expect(backSpy).toHaveBeenCalledTimes(2);
    await popstate(); await popstate();       // 두 번의 메아리 모두 무시
    expect(onBack).not.toHaveBeenCalled();
  });

  it('언마운트되면 항목을 걷어낸다', async () => {
    const api = registry(), onBack = vi.fn();
    await mount(createElement(Screen, { id: 'a', register: api.register, onBackSpy: onBack }));
    await act(async () => { api.a.open(); });
    await act(async () => { root.unmount(); });
    expect(backSpy).toHaveBeenCalledTimes(1);
    root = null;
  });
});
