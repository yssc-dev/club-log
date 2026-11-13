import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createElement, act } from 'react';
import { createRoot } from 'react-dom/client';
import { ThemeProvider } from '../../../hooks/useTheme';
import PushMatchView from '../PushMatchView';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (q) => ({ matches: false, media: q, onchange: null, addListener(){}, removeListener(){}, addEventListener(){}, removeEventListener(){}, dispatchEvent(){} }),
});

// 2026-11-12 마스터FC 밀어내기 P9·P16: 0:0 경기에서 한쪽 GK를 지정하지 않은 채 확정돼
// 로그_매치 GK 칸이 비었다. 골 입력은 GK가 없으면 막히지만(CourtRecorder) 무득점 경기는
// 그 관문을 안 거친다 → 확정 버튼에서 막아야 한다(자유대진·대진표 모드와 같은 규칙).
const teams = [['A1', 'A2', 'A3'], ['B1', 'B2', 'B3'], ['C1', 'C2', 'C3']];
const teamNames = ['팀A', '팀B', '팀C'];

const props = (over = {}) => ({
  teams, teamNames, teamColorIndices: [0, 1, 2],
  gks: {}, gksHistory: {}, allEvents: [],
  onRecordEvent(){}, onUndoEvent(){}, onDeleteEvent(){}, onEditEvent(){},
  onConfirmPushRound: vi.fn(), onUnconfirmLastRound(){}, completedMatches: [],
  attendees: teams.flat(), onGkChange(){},
  liveMercs: {}, onAddLiveMerc(){}, onRemoveLiveMerc(){},
  onEditPastGk(){}, onEditPastMercAdd(){}, onEditPastMercRemove(){},
  absentees: {}, onToggleAbsent(){},
  pushState: { suggestedMatch: { home: 0, away: 1 } },
  // 스타일 객체: btn* 는 함수, 나머지는 빈 스타일
  styles: new Proxy({}, { get: (_, k) => (typeof k === 'string' && k.startsWith('btn') ? () => ({}) : {}) }),
  ...over,
});

let container, root;
beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  vi.stubGlobal('alert', vi.fn());
  vi.stubGlobal('confirm', vi.fn(() => true));
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

const render = (p) => act(() => root.render(createElement(ThemeProvider, null, createElement(PushMatchView, p))));
const clickConfirm = () => {
  const btn = [...container.querySelectorAll('button')].find(b => b.textContent.trim() === '경기 확정');
  expect(btn).toBeTruthy();
  act(() => btn.click());
};

describe('PushMatchView 경기 확정 — GK 필수', () => {
  it('한쪽 GK가 비어 있으면 확정하지 않고 어느 팀인지 알린다 (0:0이어도)', () => {
    const p = props({ gks: { 0: 'A1' } });
    render(p);
    clickConfirm();
    expect(p.onConfirmPushRound).not.toHaveBeenCalled();
    expect(globalThis.alert).toHaveBeenCalledWith('키퍼를 지정하세요: 팀B');
    expect(globalThis.confirm).not.toHaveBeenCalled();
  });

  it('양쪽 GK가 비어 있으면 두 팀을 모두 알린다', () => {
    const p = props();
    render(p);
    clickConfirm();
    expect(p.onConfirmPushRound).not.toHaveBeenCalled();
    expect(globalThis.alert).toHaveBeenCalledWith('키퍼를 지정하세요: 팀A, 팀B');
  });

  it('양쪽 GK가 있으면 그대로 확정된다', () => {
    const p = props({ gks: { 0: 'A1', 1: 'B1' } });
    render(p);
    clickConfirm();
    expect(globalThis.alert).not.toHaveBeenCalled();
    expect(p.onConfirmPushRound).toHaveBeenCalledTimes(1);
    expect(p.onConfirmPushRound.mock.calls[0][0]).toMatchObject({ homeGk: 'A1', awayGk: 'B1', homeScore: 0, awayScore: 0 });
  });
});
