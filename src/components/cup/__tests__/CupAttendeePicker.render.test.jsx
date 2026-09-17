// src/components/cup/__tests__/CupAttendeePicker.render.test.jsx
// 스펙 §6.2 v2.1 5항 — 컵 참석자 단계: 팀별 칩(기본 전원 참석)·토글·당일 추가.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { ThemeProvider } from '../../../hooks/useTheme';
import CupAttendeePicker from '../CupAttendeePicker';

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (q) => ({ matches: false, media: q, onchange: null, addListener(){}, removeListener(){}, addEventListener(){}, removeEventListener(){}, dispatchEvent(){} }),
});
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let container, root;
beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); });
afterEach(() => { act(() => root?.unmount()); container.remove(); });

async function mount(props) {
  await act(async () => {
    root = createRoot(container);
    root.render(createElement(ThemeProvider, null, createElement(CupAttendeePicker, props)));
  });
}
const click = async (el) => { await act(async () => { el.click(); }); };
const type = async (input, value) => {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true }));
  });
};
const q = (sel) => [...container.querySelectorAll(sel)];

const TEAMS = [['a1', 'a2'], ['b1'], ['c1', 'c2', 'c3']];
const NAMES = ['팀A', '팀B', '팀C'];

describe('CupAttendeePicker 실렌더', () => {
  it('팀별 헤더·칩을 그리고 참석 인원을 센다', async () => {
    await mount({ teams: TEAMS, teamNames: NAMES, attendees: ['a1', 'a2', 'b1', 'c1', 'c2', 'c3'], onToggle: vi.fn(), onAddToTeam: vi.fn() });
    expect(q('[data-role="cup-team"]')).toHaveLength(3);
    expect(container.textContent).toContain('팀A');
    expect(container.textContent).toContain('2/2명 참석');
    expect(q('button[data-role="cup-attendee"]')).toHaveLength(6);
    expect(q('button[data-role="cup-attendee"]').every(b => b.getAttribute('aria-pressed') === 'true')).toBe(true);
  });

  it('칩 클릭은 onToggle(name); 불참자는 aria-pressed=false, 전원 불참 팀은 "오늘 불참"', async () => {
    const onToggle = vi.fn();
    await mount({ teams: TEAMS, teamNames: NAMES, attendees: ['a1', 'a2', 'c1'], onToggle, onAddToTeam: vi.fn() });
    const b1 = q('button[data-role="cup-attendee"]').find(b => b.dataset.name === 'b1');
    expect(b1.getAttribute('aria-pressed')).toBe('false');
    await click(b1);
    expect(onToggle).toHaveBeenCalledWith('b1');
    const teamB = q('[data-role="cup-team"]').find(d => d.dataset.team === '1');
    expect(teamB.textContent).toContain('오늘 불참');
    expect(teamB.textContent).toContain('0/1명 참석');
  });

  it('당일 추가: 입력 후 버튼 → onAddToTeam(teamIdx, name), 입력은 비워진다; 빈 값은 무시', async () => {
    const onAddToTeam = vi.fn();
    await mount({ teams: TEAMS, teamNames: NAMES, attendees: ['a1'], onToggle: vi.fn(), onAddToTeam });
    const input = q('input[data-role="cup-guest-input"]').find(i => i.dataset.team === '2');
    const btn = q('button[data-role="cup-guest-add"]').find(b => b.dataset.team === '2');
    await click(btn);
    expect(onAddToTeam).not.toHaveBeenCalled();
    await type(input, '  게스트 ');
    await click(btn);
    expect(onAddToTeam).toHaveBeenCalledWith(2, '게스트');
    expect(input.value).toBe('');
  });

  it('당일 추가: Enter 키로도 추가된다', async () => {
    const onAddToTeam = vi.fn();
    await mount({ teams: TEAMS, teamNames: NAMES, attendees: [], onToggle: vi.fn(), onAddToTeam });
    const input = q('input[data-role="cup-guest-input"]').find(i => i.dataset.team === '0');
    await type(input, 'g1');
    await act(async () => { input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });
    expect(onAddToTeam).toHaveBeenCalledWith(0, 'g1');
  });

  it('teams[i] 가 undefined(RTDB 빈배열 누락)여도 크래시 없이 0명으로 그린다', async () => {
    await mount({ teams: [undefined, ['b1']], teamNames: ['팀A', '팀B'], attendees: ['b1'], onToggle: vi.fn(), onAddToTeam: vi.fn() });
    expect(q('[data-role="cup-team"]')).toHaveLength(2);
    expect(container.textContent).toContain('0/0명 참석');
  });
});
