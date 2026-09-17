// src/components/cup/__tests__/CupTeamEditor.render.test.jsx
// 스펙 §4.5 — 팀 편집기 실렌더: 팀 추가/삭제·팀원 추가(회원·자유입력)·검증 에러·잠금 비활성·저장 payload.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { ThemeProvider } from '../../../hooks/useTheme';
import CupTeamEditor from '../CupTeamEditor';

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
    root.render(createElement(ThemeProvider, null, createElement(CupTeamEditor, props)));
  });
}
const click = async (el) => { await act(async () => { el.click(); }); };
const type = async (input, value) => {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
};
const byText = (txt) => [...container.querySelectorAll('button')].find(b => b.textContent.trim() === txt);

const TEAMS = [
  { id: 't1', name: '팀A', captain: 'a1', players: ['a1', 'a2'], order: 0 },
  { id: 't2', name: '팀B', captain: '', players: ['b1'], order: 1 },
  { id: 't3', name: '팀C', captain: '', players: ['c1'], order: 2 },
];

describe('CupTeamEditor 실렌더', () => {
  it('팀·팀원·팀장이 그려지고 저장은 정규화된 팀 배열을 넘긴다', async () => {
    const onSave = vi.fn();
    await mount({ teams: TEAMS, members: ['a1', 'a2', 'b1', 'c1', 'd1'], locked: false, disabled: false, saving: false, onSave });
    expect(container.textContent).toContain('팀A');
    expect(container.textContent).toContain('a1');
    await click(byText('저장'));
    expect(onSave).toHaveBeenCalledTimes(1);
    const saved = onSave.mock.calls[0][0];
    expect(saved.map(t => t.id)).toEqual(['t1', 't2', 't3']);
    expect(saved[0].captain).toBe('a1');
  });

  it('팀 추가 → 새 id 는 t4, 팀 삭제 후 추가해도 번호 재사용 없음', async () => {
    const onSave = vi.fn();
    await mount({ teams: TEAMS, members: [], locked: false, disabled: false, saving: false, onSave });
    await click(byText('+ 팀 추가'));
    const nameInputs = [...container.querySelectorAll('input[data-role="team-name"]')];
    expect(nameInputs).toHaveLength(4);
    await type(nameInputs[3], '팀D');
    // 새 팀에 자유 입력으로 팀원 추가
    const freeInputs = [...container.querySelectorAll('input[data-role="free-add"]')];
    await type(freeInputs[3], 'd1');
    await click([...container.querySelectorAll('button[data-role="free-add-btn"]')][3]);
    await click(byText('저장'));
    const saved = onSave.mock.calls[0][0];
    expect(saved[3].id).toBe('t4');
    expect(saved[3].players).toEqual(['d1']);
  });

  it('검증 실패(같은 선수 두 팀)는 저장하지 않고 에러를 보여준다', async () => {
    const onSave = vi.fn();
    await mount({ teams: TEAMS, members: ['a1', 'z1'], locked: false, disabled: false, saving: false, onSave });
    // 회원 후보에는 이미 배정된 a1 이 나오지 않는다(z1 만) — 자유 입력으로 팀B 에 a1 을 넣어 중복을 만든다
    expect([...container.querySelectorAll('button[data-role="member-add"]')].map(b => b.textContent.trim())).toEqual(['+ z1', '+ z1', '+ z1']);
    const freeInputs = [...container.querySelectorAll('input[data-role="free-add"]')];
    await type(freeInputs[1], 'a1');
    await click([...container.querySelectorAll('button[data-role="free-add-btn"]')][1]);
    await click(byText('저장'));
    expect(onSave).not.toHaveBeenCalled();
    expect(container.textContent).toContain('a1: 두 팀에 있습니다(팀A, 팀B)');
  });

  it('잠기면 팀명 입력·팀 추가/삭제는 비활성, 팀원 편집은 가능', async () => {
    await mount({ teams: TEAMS, members: ['z1'], locked: true, disabled: false, saving: false, onSave: vi.fn() });
    expect(container.textContent).toContain('첫 경기 마감 후 팀명·팀 수는 바꿀 수 없습니다');
    expect([...container.querySelectorAll('input[data-role="team-name"]')].every(i => i.disabled)).toBe(true);
    expect(byText('+ 팀 추가').disabled).toBe(true);
    expect([...container.querySelectorAll('button[data-role="team-remove"]')].every(b => b.disabled)).toBe(true);
    expect([...container.querySelectorAll('button[data-role="member-add"]')].some(b => !b.disabled)).toBe(true);
  });

  it('disabled(비관리자)면 저장 버튼이 없다', async () => {
    await mount({ teams: TEAMS, members: [], locked: false, disabled: true, saving: false, onSave: vi.fn() });
    expect(byText('저장')).toBeUndefined();
  });
});
