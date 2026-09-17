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
const pickerToggles = () => [...container.querySelectorAll('button[data-role="member-picker-toggle"]')];
const openPicker = async (i) => click(pickerToggles()[i]);

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

  it('팀 추가 → 새 id 는 기존 최대+1; 중간 팀을 삭제한 뒤 추가해도 빈 번호는 재사용하지 않는다', async () => {
    const onSave = vi.fn();
    await mount({ teams: TEAMS, members: [], locked: false, disabled: false, saving: false, onSave });
    await click(byText('+ 팀 추가'));
    const nameInputs = [...container.querySelectorAll('input[data-role="team-name"]')];
    expect(nameInputs).toHaveLength(4);
    await type(nameInputs[3], '팀D');
    // 새 팀(index 3)의 picker 를 열고 자유 입력으로 팀원 추가
    await openPicker(3);
    const freeInputs = [...container.querySelectorAll('input[data-role="free-add"]')];
    await type(freeInputs[0], 'd1');
    await click([...container.querySelectorAll('button[data-role="free-add-btn"]')][0]);
    await click(byText('저장'));
    const saved = onSave.mock.calls[0][0];
    expect(saved[3].id).toBe('t4');
    expect(saved[3].players).toEqual(['d1']);

    // 중간 팀(t2, index 1)을 삭제한 뒤 다시 추가하면 t2 번호는 재사용되지 않고 기존 최대(t4)+1 = t5 를 받는다
    const removeButtons = [...container.querySelectorAll('button[data-role="team-remove"]')];
    await click(removeButtons[1]);
    // t4 picker 닫기(t4는 현재 index 2 — t1,t3,t4)
    await openPicker(2);
    await click(byText('+ 팀 추가'));
    const nameInputs2 = [...container.querySelectorAll('input[data-role="team-name"]')];
    expect(nameInputs2).toHaveLength(4);
    await type(nameInputs2[3], '팀E');
    // 새 팀(index 3) picker 열기
    await openPicker(3);
    const freeInputs2 = [...container.querySelectorAll('input[data-role="free-add"]')];
    await type(freeInputs2[0], 'e1');
    await click([...container.querySelectorAll('button[data-role="free-add-btn"]')][0]);
    await click(byText('저장'));
    const saved2 = onSave.mock.calls[1][0];
    expect(saved2.map(t => t.id)).toEqual(['t1', 't3', 't4', 't5']);
    expect(saved2.some(t => t.id === 't2')).toBe(false);
    expect(saved2[3].players).toEqual(['e1']);
  });

  it('검증 실패(같은 선수 두 팀)는 저장하지 않고 에러를 보여준다', async () => {
    const onSave = vi.fn();
    await mount({ teams: TEAMS, members: ['a1', 'z1'], locked: false, disabled: false, saving: false, onSave });
    // 세 팀 picker 를 모두 열어야 member-add / free-add 가 나타난다
    await openPicker(0); await openPicker(1); await openPicker(2);
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
    // picker 하나를 열어야 member-add 가 나타난다
    await openPicker(0);
    expect([...container.querySelectorAll('button[data-role="member-add"]')].some(b => !b.disabled)).toBe(true);
  });

  it('disabled(비관리자)면 저장 버튼이 없다', async () => {
    await mount({ teams: TEAMS, members: [], locked: false, disabled: true, saving: false, onSave: vi.fn() });
    expect(byText('저장')).toBeUndefined();
  });

  it('팀원 제외 버튼의 keydown 이 상위 칩으로 새지 않아 팀장 토글이 실행되지 않는다', async () => {
    const onSave = vi.fn();
    await mount({ teams: TEAMS, members: [], locked: false, disabled: false, saving: false, onSave });
    const chips = [...container.querySelectorAll('div[data-role="member-chip"]')];
    const chipA1 = chips.find(d => d.textContent.includes('a1')); // 팀장(t1.captain)
    const chipA2 = chips.find(d => d.textContent.includes('a2')); // 비팀장
    const removeBtnA2 = chipA2.querySelector('button[data-role="member-remove"]');
    // a2 의 "제외" 버튼에서 Enter 를 누르면(포커스가 버튼에 있는 상황) 이벤트가 상위 칩 div 로
    // 버블링되어 팀장 토글이 실행되면 안 된다 — a1 이 계속 팀장이어야 한다.
    await act(async () => { removeBtnA2.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });
    expect(chipA1.getAttribute('aria-pressed')).toBe('true');
    expect(chipA2.getAttribute('aria-pressed')).toBe('false');
    // 대조: 같은 keydown 을 칩(div) 자체에 쏘면 그 칩의 팀장 토글은 정상 동작해야 한다.
    await act(async () => { chipA2.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });
    expect(chipA2.getAttribute('aria-pressed')).toBe('true');
  });

  it('기본 접힘: 마운트 후 팀원 추가 영역이 숨겨져 있고, 토글하면 열리고, 다시 누르면 닫힌다', async () => {
    await mount({ teams: TEAMS, members: ['d1'], locked: false, disabled: false, saving: false, onSave: vi.fn() });
    // 기본 접힘 — free-add / member-add / 회원 검색 없음
    expect(container.querySelectorAll('input[data-role="free-add"]')).toHaveLength(0);
    expect(container.querySelectorAll('button[data-role="member-add"]')).toHaveLength(0);
    expect(container.querySelector('input[placeholder="회원 검색"]')).toBeNull();
    // t1 toggle(index 0) 클릭 → t1 섹션만 열림
    await openPicker(0);
    expect([...container.querySelectorAll('button[data-role="member-add"]')].every(b => b.dataset.team === 't1')).toBe(true);
    expect(container.querySelectorAll('input[data-role="free-add"]')).toHaveLength(1);
    expect(container.querySelector('input[placeholder="회원 검색"]')).not.toBeNull();
    // 다시 클릭 → 닫힘
    await openPicker(0);
    expect(container.querySelectorAll('input[data-role="free-add"]')).toHaveLength(0);
    expect(container.querySelectorAll('button[data-role="member-add"]')).toHaveLength(0);
  });

  it('onCancel 을 주면 취소 버튼이 렌더되고 호출, 주지 않으면 취소 버튼 없음', async () => {
    const onCancel = vi.fn();
    await mount({ teams: TEAMS, members: [], locked: false, disabled: false, saving: false, onSave: vi.fn(), onCancel });
    const cancelBtn = byText('취소');
    expect(cancelBtn).toBeDefined();
    await click(cancelBtn);
    expect(onCancel).toHaveBeenCalledTimes(1);

    // onCancel 없으면 취소 버튼 없음
    await act(async () => {
      root.unmount();
      root = createRoot(container);
      root.render(createElement(ThemeProvider, null, createElement(CupTeamEditor, { teams: TEAMS, members: [], locked: false, disabled: false, saving: false, onSave: vi.fn() })));
    });
    expect(byText('취소')).toBeUndefined();
  });
});
