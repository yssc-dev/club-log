// MatchHeader 렌더 테스트 — onHome 버튼, title/subtitle 표시 검증
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import MatchHeader from '../MatchHeader';

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (q) => ({ matches: false, media: q, addListener(){}, removeListener(){}, addEventListener(){}, removeEventListener(){}, dispatchEvent(){} }),
});
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let container, root;
beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); });
afterEach(() => { act(() => root?.unmount()); container.remove(); });

async function mount(props) {
  await act(async () => {
    root = createRoot(container);
    root.render(createElement(MatchHeader, props));
  });
}

describe('MatchHeader', () => {
  it('onHome을 주면 aria-label="홈으로" 버튼이 렌더된다', async () => {
    await mount({ title: '테스트', onHome: vi.fn() });
    const btn = container.querySelector('[aria-label="홈으로"]');
    expect(btn).not.toBeNull();
  });

  it('홈 버튼 클릭 시 onHome이 호출된다', async () => {
    const onHome = vi.fn();
    await mount({ title: '테스트', onHome });
    const btn = container.querySelector('[aria-label="홈으로"]');
    await act(async () => { btn.click(); });
    expect(onHome).toHaveBeenCalledTimes(1);
  });

  it('title이 표시된다', async () => {
    await mount({ title: '🎾 테니스', onHome: vi.fn() });
    expect(container.textContent).toContain('🎾 테니스');
  });

  it('subtitle이 표시된다', async () => {
    await mount({ title: '🎾 테니스', subtitle: '2026-08-28 · 참석자 설정', onHome: vi.fn() });
    expect(container.textContent).toContain('2026-08-28 · 참석자 설정');
  });
});
