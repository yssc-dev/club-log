// 스펙 §16.3.4 — 배치 중 노드는 저장된 초안을 FormationSetup 에 시드해서 연다.
// prop 을 안 넘기면 하버FC 와 동일해야 한다(추가만 원칙).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { ThemeProvider } from '../../../hooks/useTheme';
import FormationSetup from '../FormationSetup';

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (q) => ({ matches: false, media: q, onchange: null, addListener(){}, removeListener(){}, addEventListener(){}, removeEventListener(){}, dispatchEvent(){} }),
});
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let container, root;
beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); });
afterEach(() => { act(() => root?.unmount()); container.remove(); });

const PLAYERS = ['a1', 'a2', 'a3'];
async function mount(props = {}) {
  await act(async () => {
    root = createRoot(container);
    root.render(createElement(ThemeProvider, null, createElement(FormationSetup, {
      selectedPlayers: PLAYERS, onConfirm: () => {}, onBack: () => {}, ...props,
    })));
  });
}
const text = () => container.textContent;

describe('FormationSetup 선택적 초기 배치', () => {
  it('prop 이 없으면 빈 배치·"경기 시작" 버튼(기존 동작)', async () => {
    await mount();
    expect(text()).toContain('0/11');
    expect(text()).toContain('경기 시작');
    expect(text()).toContain('후보 (3)');
  });

  it('initialAssignments 를 주면 그 배치로 열리고 후보에서 빠진다', async () => {
    await mount({ initialAssignments: { 0: 'a1', 1: 'a2' }, initialFormation: '4-3-3', confirmLabel: '배치 저장' });
    expect(text()).toContain('2/11');
    expect(text()).toContain('후보 (1)');       // a3 만 남는다
    expect(text()).toContain('배치 저장');
  });

  it('확정 시 초기 배치가 onConfirm 으로 그대로 나간다', async () => {
    const onConfirm = vi.fn();
    const eleven = Object.fromEntries(Array.from({ length: 11 }, (_, i) => [i, `p${i}`]));
    await mount({ selectedPlayers: Array.from({ length: 11 }, (_, i) => `p${i}`), initialAssignments: eleven, onConfirm });
    await act(async () => {
      [...container.querySelectorAll('button')].find(b => b.textContent.trim() === '경기 시작').click();
    });
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm.mock.calls[0][0].assignments).toEqual(eleven);
    expect(onConfirm.mock.calls[0][0].subs).toEqual([]);
  });
});
