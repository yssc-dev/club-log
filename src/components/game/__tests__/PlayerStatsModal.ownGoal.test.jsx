// src/components/game/__tests__/PlayerStatsModal.ownGoal.test.jsx
// "오늘의 선수기록" 자책 열은 세션 규칙(ownGoalPoint)대로 표시해야 한다 — 합계는 ownGoalPoint 로 계산하는데
// 표시만 -2 로 박혀 있어 컵(자책 -1)·표준 규칙 팀에서 합계와 어긋났다(2026-10-02).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { ThemeProvider } from '../../../hooks/useTheme';
import PlayerStatsModal from '../PlayerStatsModal';

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (q) => ({ matches: false, media: q, onchange: null, addListener(){}, removeListener(){}, addEventListener(){}, removeEventListener(){}, dispatchEvent(){} }),
});
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let container, root;
beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); });
afterEach(() => { act(() => root?.unmount()); root = null; container.remove(); });

const styles = { th: {}, td: () => ({}) };
const calc = (ownGoalPoint) => (p) => {
  const st = { 이강국: { goals: 2, assists: 2, owngoals: 1, cleanSheets: 0, keeperGames: 0, conceded: 1, crova: 0, goguma: 0 } }[p]
    || { goals: 0, assists: 0, owngoals: 0, cleanSheets: 0, keeperGames: 0, conceded: 0, crova: 0, goguma: 0 };
  return { ...st, total: st.goals + st.assists + st.owngoals * ownGoalPoint + st.cleanSheets };
};
async function mount(props) {
  await act(async () => { root = createRoot(container); root.render(createElement(ThemeProvider, null, createElement(PlayerStatsModal, { attendees: ['이강국', '우창호'], showBonus: false, onClose: vi.fn(), styles, ...props }))); });
}
const rowCells = (name) => [...container.querySelectorAll('tbody tr')].find(tr => tr.textContent.startsWith(name)).querySelectorAll('td');

describe('PlayerStatsModal 자책 표시', () => {
  it('ownGoalPoint -1 (컵·표준 규칙): 자책 1개 → "-1", 합계 2+2-1 = +3 과 일치', async () => {
    await mount({ calcPlayerPoints: calc(-1), ownGoalPoint: -1 });
    const tds = rowCells('이강국');
    expect(tds[3].textContent).toBe('-1');
    expect(tds[tds.length - 1].textContent).toBe('+3');
  });
  it('ownGoalPoint -2 (마스터FC 정규): 자책 1개 → "-2", 합계 +2', async () => {
    await mount({ calcPlayerPoints: calc(-2), ownGoalPoint: -2 });
    const tds = rowCells('이강국');
    expect(tds[3].textContent).toBe('-2');
    expect(tds[tds.length - 1].textContent).toBe('+2');
  });
  it('자책 0개는 "0", prop 생략 시 표준(-1)로 표시', async () => {
    await mount({ calcPlayerPoints: calc(-1) });
    expect(rowCells('우창호')[3].textContent).toBe('0');
    expect(rowCells('이강국')[3].textContent).toBe('-1');
  });
});
