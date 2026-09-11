// onBusyChange(선택적 prop)는 '사용자 입력 중'(골 플로우·교체 모달·포메이션 피커·선수 액션 메뉴)을 상위에 알린다.
// 빅마스터FC 실시간 재마운트가 입력 중 레코더를 날리지 않게 하는 신호다(스펙 §14.3.2).
// 하버FC(SoccerMatchView)는 이 prop 을 넘기지 않으므로 미연결 시 기존 동작이 불변이어야 한다.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { ThemeProvider } from '../../../hooks/useTheme';
import FormationRecorder from '../FormationRecorder';

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (q) => ({ matches: false, media: q, onchange: null, addListener(){}, removeListener(){}, addEventListener(){}, removeEventListener(){}, dispatchEvent(){} }),
});
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const eleven = (p) => Array.from({ length: 11 }, (_, i) => `${p}${i + 1}`);
const NAMES = eleven('a');
const PROPS = {
  formation: '4-4-2',
  assignments: Object.fromEntries(NAMES.map((n, i) => [i, n])),
  positionMap: Object.fromEntries(NAMES.map((n, i) => [n, i === 0 ? 'GK' : i < 5 ? 'DF' : 'FW'])),
  gk: 'a1', attendees: [...NAMES, 'a12'], opponent: '상대', startedAt: 1,
  events: [], onAddEvent: () => {}, onDeleteEvent: () => {}, onFinishMatch: () => {}, onStateChange: () => {},
};

let container, root;
beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); });
afterEach(async () => { await act(async () => root?.unmount()); root = null; container.remove(); });

async function mount(extra = {}) {
  await act(async () => {
    root = createRoot(container);
    root.render(createElement(ThemeProvider, null, createElement(FormationRecorder, { ...PROPS, ...extra })));
  });
}
const byPartial = (sel, t) => [...container.querySelectorAll(sel)].find(el => el.textContent.includes(t));
const click = async (el) => { expect(el).toBeTruthy(); await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); }); };

describe('FormationRecorder onBusyChange', () => {
  it('마운트 시 false, 교체 모달을 열면 true, 닫으면 false', async () => {
    const onBusyChange = vi.fn();
    await mount({ onBusyChange });
    expect(onBusyChange).toHaveBeenCalledWith(false);
    onBusyChange.mockClear();
    await click(byPartial('button', '교체'));
    expect(onBusyChange).toHaveBeenCalledWith(true);
    onBusyChange.mockClear();
    // Modal.jsx의 닫기 버튼은 텍스트 없이 아이콘만(aria-label="닫기") — textContent 기반 선택자로는 못 찾는다.
    const close = container.querySelector('button[aria-label="닫기"]');
    await click(close);
    expect(onBusyChange).toHaveBeenCalledWith(false);
  });
  it('포메이션 피커를 열면 true', async () => {
    const onBusyChange = vi.fn();
    await mount({ onBusyChange });
    onBusyChange.mockClear();
    await click(byPartial('button', '포메이션'));
    expect(onBusyChange).toHaveBeenCalledWith(true);
  });
  it('언마운트 시 false 로 정리한다', async () => {
    const onBusyChange = vi.fn();
    await mount({ onBusyChange });
    await click(byPartial('button', '교체'));
    onBusyChange.mockClear();
    await act(async () => root.unmount());
    root = null;
    expect(onBusyChange).toHaveBeenCalledWith(false);
  });
  it('onBusyChange 미연결(하버FC)에서도 렌더·onFlowActiveChange 동작 불변', async () => {
    const onFlowActiveChange = vi.fn();
    await mount({ onFlowActiveChange });                 // onBusyChange 없음
    expect(onFlowActiveChange).toHaveBeenCalledWith(false);
    expect(container.textContent).toContain('교체');     // 크래시 없이 렌더
  });
});
