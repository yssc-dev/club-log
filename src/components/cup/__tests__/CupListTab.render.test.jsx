// src/components/cup/__tests__/CupListTab.render.test.jsx
// 스펙 §6.1 — 대회 목록·생성·상세(시작 버튼·이어서·잠금·삭제) 실렌더. cupSync 는 목.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { ThemeProvider } from '../../../hooks/useTheme';

const h = vi.hoisted(() => ({ cups: [], created: [], saved: [], deleted: [], status: [] }));
vi.mock('../../../services/cupSync', () => ({
  default: {
    listCups: () => Promise.resolve(h.cups),
    loadCup: (_t, id) => Promise.resolve(h.cups.find(c => c.meta.id === id) || null),
    createCup: (_t, { name }) => { const cup = { meta: { id: name, name, sport: '풋살', status: 'active', createdAt: 9, createdBy: '', updatedAt: 9, lockedAt: null }, teams: [] }; h.created.push(name); h.cups = [cup, ...h.cups]; return Promise.resolve(cup); },
    saveTeams: (_t, id, teams) => { h.saved.push({ id, teams }); const c = h.cups.find(x => x.meta.id === id); if (c) c.teams = teams; return Promise.resolve(); },
    setStatus: (_t, id, s) => { h.status.push([id, s]); const c = h.cups.find(x => x.meta.id === id); if (c) c.meta.status = s; return Promise.resolve(); },
    deleteCup: (_t, id) => { h.deleted.push(id); h.cups = h.cups.filter(c => c.meta.id !== id); return Promise.resolve(); },
    markLocked: () => Promise.resolve(),
  },
}));

import CupListTab from '../CupListTab';

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (q) => ({ matches: false, media: q, onchange: null, addListener(){}, removeListener(){}, addEventListener(){}, removeEventListener(){}, dispatchEvent(){} }),
});
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let container, root;
beforeEach(() => {
  h.cups = []; h.created = []; h.saved = []; h.deleted = []; h.status = [];
  container = document.createElement('div'); document.body.appendChild(container);
  window.confirm = () => true;
});
afterEach(() => { act(() => root?.unmount()); container.remove(); });

const T3 = [
  { id: 't1', name: '팀A', captain: '', players: ['a1'], order: 0 },
  { id: 't2', name: '팀B', captain: '', players: ['b1'], order: 1 },
  { id: 't3', name: '팀C', captain: '', players: ['c1'], order: 2 },
];
const cup = (id, extra = {}, teams = T3) => ({ meta: { id, name: id, sport: '풋살', status: 'active', createdAt: 1, createdBy: '', updatedAt: 1, lockedAt: null, ...extra }, teams });

const BASE = { teamName: '마스터FC', members: ['a1', 'b1', 'c1', 'd1'], pendingGames: [], isAdmin: true, authUserName: '홍길동', onStartGame: vi.fn(), onContinueGame: vi.fn() };
async function mount(props = {}) {
  await act(async () => {
    root = createRoot(container);
    root.render(createElement(ThemeProvider, null, createElement(CupListTab, { ...BASE, ...props })));
  });
}
const click = async (el) => { await act(async () => { el.click(); }); };
const btn = (txt) => [...container.querySelectorAll('button')].find(b => b.textContent.trim().includes(txt));
const type = async (input, value) => {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true }));
  });
};

describe('CupListTab 실렌더', () => {
  it('대회가 없으면 안내 문구', async () => {
    await mount();
    expect(container.textContent).toContain('아직 대회가 없습니다');
  });

  it('목록: 진행중 대회는 펼쳐지고 완료 대회는 접힘 섹션에', async () => {
    h.cups = [cup('컵2026'), cup('컵2025', { status: 'finished' })];
    await mount();
    expect(container.textContent).toContain('컵2026');
    expect(container.textContent).toContain('완료된 대회');
    expect(container.textContent).not.toContain('🏆 컵2025'); // 접힘 상태
  });

  it('새 대회 생성 → createCup 호출 후 상세로 진입(팀 관리가 보인다)', async () => {
    await mount();
    await click(btn('+ 새 대회'));
    await type(container.querySelector('input[data-role="new-cup-name"]'), '마스터스컵 2026');
    await click(btn('만들기'));
    expect(h.created).toEqual(['마스터스컵 2026']);
    expect(container.textContent).toContain('팀 관리');
  });

  it('상세: 팀 검증 통과 + active 면 시작 버튼이 onStartGame("cup", { cupId }) 호출', async () => {
    const onStartGame = vi.fn();
    h.cups = [cup('컵2026')];
    await mount({ onStartGame });
    await click(btn('컵2026'));
    await click(btn('오늘 컵 경기 시작'));
    expect(onStartGame).toHaveBeenCalledWith('cup', { cupId: '컵2026' });
  });

  it('상세: 팀이 부족하면 시작 버튼 비활성 + 이유, 진행 중 컵 세션은 이어서 기록 카드', async () => {
    const onContinueGame = vi.fn();
    h.cups = [cup('컵2026', {}, T3.slice(0, 2))];
    await mount({ onContinueGame, pendingGames: [{ gameId: 'g_1', state: { tournamentId: '컵2026', phase: 'match', schedule: [{}], currentRoundIdx: 0, attendees: ['a1'] } }] });
    await click(btn('컵2026'));
    expect(btn('오늘 컵 경기 시작').disabled).toBe(true);
    expect(container.textContent).toContain('팀은 3~8개여야 합니다');
    await click(btn('이어서 기록'));
    expect(onContinueGame).toHaveBeenCalledWith('g_1');
  });

  it('상세: 잠긴 대회는 삭제 버튼 비활성, 잠기지 않으면 삭제 → deleteCup 후 목록으로', async () => {
    h.cups = [cup('잠김', { lockedAt: 5 }), cup('열림')];
    await mount();
    await click(btn('잠김'));
    expect(btn('대회 삭제').disabled).toBe(true);
    await click(btn('← 대회 목록'));
    await click(btn('열림'));
    await click(btn('대회 삭제'));
    expect(h.deleted).toEqual(['열림']);
    expect(container.textContent).not.toContain('팀 관리');
  });

  it('비관리자: 새 대회·시작·삭제 없음, 팀 관리는 읽기 전용', async () => {
    h.cups = [cup('컵2026')];
    await mount({ isAdmin: false });
    expect(btn('+ 새 대회')).toBeUndefined();
    await click(btn('컵2026'));
    expect(btn('오늘 컵 경기 시작')).toBeUndefined();
    expect(btn('대회 삭제')).toBeUndefined();
    expect(btn('저장')).toBeUndefined();
  });
});
