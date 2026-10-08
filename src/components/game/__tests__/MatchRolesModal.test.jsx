// MatchRolesModal 실렌더(act) — 인원 제약·겸임 규칙·후보 분류 계약.
// 이 레포에는 @testing-library/react 가 없다. IntraSoccerMatchView.smoke.test.jsx 와
// 같은 act + createRoot 하네스를 쓴다(build/vitest 가 못 잡는 마운트 크래시도 함께 커버).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { ThemeProvider } from '../../../hooks/useTheme';
import MatchRolesModal from '../MatchRolesModal';

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (q) => ({ matches: false, media: q, onchange: null, addListener(){}, removeListener(){}, addEventListener(){}, removeEventListener(){}, dispatchEvent(){} }),
});
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// 출전 = A,B / 미출전 = X,Y,Z,W
const MATCH = {
  matchIdx: 0, opponent: '한울', status: 'finished', startedAt: 1,
  lineup: ['A', 'B'], gk: 'A', defenders: ['B'], subs: [],
  assignments: { 0: 'A', 1: 'B' }, events: [],
};
const ATTENDEES = ['A', 'B', 'X', 'Y', 'Z', 'W'];

let container, root;
beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); });
afterEach(async () => { await act(async () => root?.unmount()); root = null; container.remove(); });

async function mount(props = {}) {
  await act(async () => {
    root = createRoot(container);
    root.render(createElement(ThemeProvider, null,
      createElement(MatchRolesModal, {
        match: MATCH, attendees: ATTENDEES, onSave: () => {}, onClose: () => {}, ...props,
      })));
  });
}

// 같은 root 에 새 props 로 다시 렌더 — 다른 기기의 roles 변경이 구독으로 도착한 상황.
// mount 는 새 root 를 만들어 무조건 재마운트되므로 '열어둔 채 원격이 바뀜' 을 재현할 수 없다.
async function rerender(props = {}) {
  await act(async () => {
    root.render(createElement(ThemeProvider, null,
      createElement(MatchRolesModal, {
        match: MATCH, attendees: ATTENDEES, onSave: () => {}, onClose: () => {}, ...props,
      })));
  });
}

const click = async (el) => {
  expect(el, '클릭 대상 엘리먼트를 찾지 못했다').toBeTruthy();
  await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
};
// 섹션(data-role="camera"|"referee"|"assistants") 안에서 이름 칩 버튼을 찾는다
const chip = (role, name) =>
  [...container.querySelectorAll(`[data-role="${role}"] button[data-name]`)]
    .find(b => b.dataset.name === name);
const chipsOf = (role) =>
  [...container.querySelectorAll(`[data-role="${role}"] button[data-name]`)].map(b => b.dataset.name);
const save = () => [...container.querySelectorAll('button')].find(b => b.textContent.includes('저장'));

describe('MatchRolesModal', () => {
  it('세 섹션이 모두 렌더되고 "촬영감독" 문구는 쓰지 않는다', async () => {
    await mount();
    expect(container.textContent).toContain('영상촬영');
    expect(container.textContent).toContain('주심');
    expect(container.textContent).toContain('부심');
    expect(container.textContent).not.toContain('촬영감독');
  });

  it('후보는 참석자 전원이고, 미출전자가 출전자보다 앞에 온다', async () => {
    await mount();
    const names = chipsOf('camera');
    expect(new Set(names)).toEqual(new Set(ATTENDEES));
    expect(names.indexOf('X')).toBeLessThan(names.indexOf('A'));
    expect(names.indexOf('W')).toBeLessThan(names.indexOf('A'));
  });

  it('출전자 칩에는 「출전」 라벨이 붙고, 미출전자에는 없다', async () => {
    await mount();
    expect(chip('camera', 'A').textContent).toContain('출전');
    expect(chip('camera', 'X').textContent).not.toContain('출전');
  });

  it('출전자도 선택할 수 있다 (후반 교체 투입 대비 — 막지 않는다)', async () => {
    const onSave = vi.fn();
    await mount({ onSave });
    await click(chip('referee', 'A'));
    await click(save());
    expect(onSave).toHaveBeenCalledWith({ camera: [], referee: 'A', assistants: [] });
  });

  it('영상촬영은 여러 명 토글된다', async () => {
    const onSave = vi.fn();
    await mount({ onSave });
    await click(chip('camera', 'X'));
    await click(chip('camera', 'Y'));
    await click(chip('camera', 'Z'));
    await click(save());
    expect(onSave.mock.calls[0][0].camera).toEqual(['X', 'Y', 'Z']);
  });

  it('영상촬영 재탭은 해제다', async () => {
    const onSave = vi.fn();
    await mount({ onSave });
    await click(chip('camera', 'X'));
    await click(chip('camera', 'X'));
    // 카메라만 토글오프하면 초기값과 완전히 같아져 no-op 저장 가드(F-4)에 걸린다 —
    // 무관한 역할(주심)도 같이 바꿔 실제 저장이 일어나게 한 뒤 camera 값을 관찰한다.
    await click(chip('referee', 'Y'));
    await click(save());
    expect(onSave.mock.calls[0][0].camera).toEqual([]);
  });

  it('주심은 1명 — 다른 사람 탭은 교체', async () => {
    const onSave = vi.fn();
    await mount({ onSave });
    await click(chip('referee', 'X'));
    await click(chip('referee', 'Y'));
    await click(save());
    expect(onSave.mock.calls[0][0].referee).toBe('Y');
  });

  it('주심 본인 재탭은 공석', async () => {
    const onSave = vi.fn();
    await mount({ onSave });
    await click(chip('referee', 'X'));
    await click(chip('referee', 'X'));
    // 주심만 토글오프하면 초기값과 같아져 no-op 저장 가드(F-4)에 걸린다 — 무관한 역할
    // (영상촬영)도 같이 바꿔 실제 저장이 일어나게 한 뒤 referee 값을 관찰한다.
    await click(chip('camera', 'Y'));
    await click(save());
    expect(onSave.mock.calls[0][0].referee).toBe('');
  });

  it('부심은 2명까지 — 세 번째는 차단되고 안내가 보인다', async () => {
    const onSave = vi.fn();
    await mount({ onSave });
    await click(chip('assistants', 'X'));
    await click(chip('assistants', 'Y'));
    await click(chip('assistants', 'Z'));
    expect(container.textContent).toContain('부심은 2명까지');
    await click(save());
    expect(onSave.mock.calls[0][0].assistants).toEqual(['X', 'Y']);
  });

  it('부심 재탭은 해제이고, 해제 후에는 다시 넣을 수 있다', async () => {
    const onSave = vi.fn();
    await mount({ onSave });
    await click(chip('assistants', 'X'));
    await click(chip('assistants', 'Y'));
    await click(chip('assistants', 'X'));
    await click(chip('assistants', 'Z'));
    await click(save());
    expect(onSave.mock.calls[0][0].assistants).toEqual(['Y', 'Z']);
  });

  it('주심을 부심으로 탭하면 주심에서 빠지고 부심으로 이동한다', async () => {
    const onSave = vi.fn();
    await mount({ onSave });
    await click(chip('referee', 'X'));
    await click(chip('assistants', 'X'));
    await click(save());
    const roles = onSave.mock.calls[0][0];
    expect(roles.referee).toBe('');
    expect(roles.assistants).toEqual(['X']);
  });

  it('부심을 주심으로 탭하면 부심에서 빠지고 주심으로 이동한다', async () => {
    const onSave = vi.fn();
    await mount({ onSave });
    await click(chip('assistants', 'X'));
    await click(chip('assistants', 'Y'));
    await click(chip('referee', 'X'));
    await click(save());
    const roles = onSave.mock.calls[0][0];
    expect(roles.referee).toBe('X');
    expect(roles.assistants).toEqual(['Y']);
  });

  it('영상촬영은 주심과 겸임 허용 — 서로 밀어내지 않는다', async () => {
    const onSave = vi.fn();
    await mount({ onSave });
    await click(chip('camera', 'X'));
    await click(chip('referee', 'X'));
    await click(save());
    const roles = onSave.mock.calls[0][0];
    expect(roles.camera).toEqual(['X']);
    expect(roles.referee).toBe('X');
  });

  it('기존 roles 를 초기값으로 띄운다 (RTDB 드롭 모양도 안전)', async () => {
    const onSave = vi.fn();
    await mount({ match: { ...MATCH, roles: { referee: 'Z' } }, onSave });
    // 아무것도 안 건드리고 저장하면 no-op 가드에 걸려 onSave 가 호출되지 않으므로,
    // 칩 하나(camera 'X')를 토글해 초기값 referee:'Z' 가 결과에 그대로 반영되는지로 확인한다 —
    // 초기 state 가 실제로 'Z' 로 seed 되지 않았다면 여기서 referee 가 '' 로 나온다.
    await click(chip('camera', 'X'));
    await click(save());
    expect(onSave).toHaveBeenCalledWith({ camera: ['X'], referee: 'Z', assistants: [] });
  });

  it('아무것도 안 건드리고 저장하면 onSave 는 호출되지 않고 닫히기만 한다 (no-op 저장 가드)', async () => {
    const onSave = vi.fn();
    const onClose = vi.fn();
    await mount({ match: { ...MATCH, roles: { referee: 'Z' } }, onSave, onClose });
    await click(save());
    expect(onSave).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('저장하면 onClose 도 호출된다', async () => {
    const onClose = vi.fn();
    await mount({ onClose });
    await click(save());
    expect(onClose).toHaveBeenCalled();
  });

  // ★ no-op 저장 가드의 핵심 케이스. 2026-10-08 회귀 수정 —
  // 이전 구현은 initial 을 매 렌더 readRoles(match) 로 다시 계산해서, 원격이 바뀌면
  // 비교가 '로컬(열 때 스냅샷) vs 원격(새것)' 이 되어 달라지고 가드가 통과했다.
  // 그래서 아무것도 안 건드렸는데도 onSave 가 낡은 값으로 호출돼 상대 변경을 되돌렸다.
  it('모달 열어둔 채 원격이 바뀌어도, 아무것도 안 건드리고 저장하면 쓰지 않는다', async () => {
    const onSave = vi.fn();
    const onClose = vi.fn();
    await mount({ match: { ...MATCH, roles: { camera: [], referee: 'X', assistants: [] } }, onSave, onClose });
    // 다른 기기가 주심을 X → Y 로 바꿈 (RESTORE_STATE 로 새 match 객체가 prop 으로 도착)
    await rerender({ match: { ...MATCH, roles: { camera: [], referee: 'Y', assistants: [] } }, onSave, onClose });
    await click(save());
    expect(onSave).not.toHaveBeenCalled();   // 낡은 X 로 Y 를 덮지 않는다
    expect(onClose).toHaveBeenCalled();
  });

  it('원격이 바뀐 뒤 내가 실제로 편집하면 쓴다 — LWW 유지', async () => {
    const onSave = vi.fn();
    await mount({ match: { ...MATCH, roles: { camera: [], referee: 'X', assistants: [] } }, onSave });
    await rerender({ match: { ...MATCH, roles: { camera: [], referee: 'Y', assistants: [] } }, onSave });
    await click(chip('camera', 'Z'));        // 실제 편집
    await click(save());
    expect(onSave).toHaveBeenCalledWith({ camera: ['Z'], referee: 'X', assistants: [] });
  });
});
