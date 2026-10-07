// SoccerMatchView 역할 지정 버튼·모달·읽기전용 표시 계약(act 실렌더).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { ThemeProvider, useTheme } from '../../../hooks/useTheme';
import { makeStyles } from '../../../styles/theme';
import SoccerMatchView from '../SoccerMatchView';

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (q) => ({ matches: false, media: q, onchange: null, addListener(){}, removeListener(){}, addEventListener(){}, removeEventListener(){}, dispatchEvent(){} }),
});
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const ATTENDEES = ['A', 'B', 'X', 'Y', 'Z'];
const finished = (extra = {}) => ({
  matchIdx: 0, opponent: '한울', status: 'finished', startedAt: 1,
  lineup: ['A', 'B'], gk: 'A', defenders: ['B'], subs: [],
  formation: '4-4-2', assignments: { 0: 'A', 1: 'B' }, positionMap: { A: 'GK', B: 'DF' },
  events: [], ourScore: 0, opponentScore: 0, ...extra,
});
const rest = { ...finished(), opponent: '휴식' };

function Harness(props) {
  const { C } = useTheme();
  return createElement(SoccerMatchView, { styles: makeStyles(C), ...props });
}

const noop = () => {};
const BASE = {
  soccerMatches: [finished()], currentMatchIdx: -1, attendees: ATTENDEES, opponents: ['한울'],
  onCreateMatch: noop, onAddEvent: noop, onDeleteEvent: noop, onFinishMatch: noop,
  onUpdateMatchFormation: noop, onReopenMatch: noop, onCreateRestMatch: noop,
  onAddOpponent: noop, onRemoveOpponent: noop, onRenameOpponent: noop, onGoToSummary: noop,
  gameSettings: {}, savedFormation: null, onFormationChange: noop,
  onSetMatchOpponent: noop, onCorrectLineup: noop, onSwapLineupPositions: noop,
  gameFinalized: false, onSetMatchRoles: noop,
};

let container, root;
beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); });
afterEach(async () => { await act(async () => root?.unmount()); root = null; container.remove(); });

async function mount(props = {}) {
  await act(async () => {
    root = createRoot(container);
    root.render(createElement(ThemeProvider, null, createElement(Harness, { ...BASE, ...props })));
  });
}
const click = async (el) => {
  expect(el, '클릭 대상 엘리먼트를 찾지 못했다').toBeTruthy();
  await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
};
const btn = (t) => [...container.querySelectorAll('button')].find(b => b.textContent.includes(t));

// 기본 착지점은 트레일링 '새 경기' 노드다(editableIdx = orderedMatches.length).
// 종료된 경기를 보려면 ◀ 로 한 칸 되돌아가야 한다 — 실제 사용자 동작과 같다.
const goPrevNode = async () => {
  const prev = container.querySelector('button[aria-label="이전"]');
  expect(prev, '◀ 버튼을 찾지 못했다').toBeTruthy();
  expect(prev.disabled, '◀ 가 비활성이면 종료 경기 노드로 갈 수 없다').toBe(false);
  await click(prev);
};

describe('SoccerMatchView — 역할 지정', () => {
  it('종료된 경기 노드에 역할 지정 버튼이 있다', async () => {
    await mount();
    await goPrevNode();
    expect(btn('역할 지정')).toBeTruthy();
  });

  it('휴식 경기에는 역할 지정 버튼이 없다', async () => {
    await mount({ soccerMatches: [rest] });
    await goPrevNode();
    expect(container.textContent).toContain('휴식');
    expect(btn('역할 지정')).toBeFalsy();
  });

  it('경기가 없으면(새 경기 노드) 역할 지정 버튼이 없다', async () => {
    await mount({ soccerMatches: [] });
    expect(btn('역할 지정')).toBeFalsy();
  });

  it('기본 착지점은 트레일링 새 경기 노드다 — 종료 경기는 ◀ 로 가야 보인다', async () => {
    await mount();
    expect(container.textContent).toContain('새 경기');
    expect(btn('역할 지정')).toBeFalsy();     // 새 경기 노드엔 역할 버튼이 없다
    await goPrevNode();
    expect(btn('역할 지정')).toBeTruthy();    // 종료 경기 노드엔 있다
  });

  it('버튼을 누르면 모달이 열린다', async () => {
    await mount();
    await goPrevNode();
    await click(btn('역할 지정'));
    expect(container.textContent).toContain('제1경기 역할 지정');
    expect(container.textContent).toContain('영상촬영');
  });

  it('모달에서 저장하면 논리 matchIdx 와 함께 onSetMatchRoles 가 호출된다', async () => {
    const onSetMatchRoles = vi.fn();
    await mount({ onSetMatchRoles });
    await goPrevNode();
    await click(btn('역할 지정'));
    const refChip = [...container.querySelectorAll('[data-role="referee"] button[data-name]')]
      .find(b => b.dataset.name === 'X');
    await click(refChip);
    await click(btn('저장'));
    expect(onSetMatchRoles).toHaveBeenCalledWith(0, { camera: [], referee: 'X', assistants: [] });
  });

  it('종료 노드에 역할이 읽기전용으로 표시된다', async () => {
    await mount({
      soccerMatches: [finished({ roles: { camera: ['X', 'Y'], referee: 'Z', assistants: ['A'] } })],
    });
    await goPrevNode();
    expect(container.textContent).toContain('영상촬영: X, Y');
    expect(container.textContent).toContain('주심: Z');
    expect(container.textContent).toContain('부심: A');
  });

  it('역할이 전부 공석이면 — 로 표시한다 (RTDB 드롭 모양도 안전)', async () => {
    await mount({ soccerMatches: [finished({ roles: { referee: '' } })] });
    await goPrevNode();
    expect(container.textContent).toContain('영상촬영');
    expect(container.textContent).toContain('—');
  });

  it('마감된 경기에서 버튼을 누르면 confirm 을 띄우고, 취소하면 모달이 안 열린다', async () => {
    const spy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    await mount({ gameFinalized: true });
    await goPrevNode();
    await click(btn('역할 지정'));
    expect(spy).toHaveBeenCalled();
    expect(spy.mock.calls[0][0]).toContain('재전송');
    expect(container.textContent).not.toContain('제1경기 역할 지정');
    spy.mockRestore();
  });
});
