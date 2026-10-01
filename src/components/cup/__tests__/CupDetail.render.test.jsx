// src/components/cup/__tests__/CupDetail.render.test.jsx
// 3단계 스펙 §4.2·§5 — 대회 상세가 컵 뷰 2종을 읽어 순위표·개인기록·경기일별 결과를 그리고,
// 로그가 있으면 lockedAt 없이도 잠긴다. sheetCache·cupSync 는 목.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { ThemeProvider } from '../../../hooks/useTheme';

const h = vi.hoisted(() => ({ matchRows: [], eventRows: [], fail: false, calls: [] }));
vi.mock('../../../services/sheetCache', () => ({
  default: {
    get: (dataset, opts) => {
      h.calls.push([dataset, opts]);
      if (h.fail) return Promise.reject(new Error('boom'));
      if (dataset === 'cupMatchLog') return Promise.resolve(h.matchRows);
      if (dataset === 'cupEventLog') return Promise.resolve(h.eventRows);
      return Promise.resolve([]);
    },
  },
}));
vi.mock('../../../services/cupSync', () => ({
  default: {
    listCups: () => Promise.resolve([]), loadCup: () => Promise.resolve(null), createCup: () => Promise.resolve(null),
    saveTeams: () => Promise.resolve(), setStatus: () => Promise.resolve(), deleteCup: () => Promise.resolve(), markLocked: () => Promise.resolve(),
  },
}));

import CupDetail from '../CupDetail';

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (q) => ({ matches: false, media: q, onchange: null, addListener(){}, removeListener(){}, addEventListener(){}, removeEventListener(){}, dispatchEvent(){} }),
});
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let container, root;
beforeEach(() => {
  h.matchRows = []; h.eventRows = []; h.fail = false; h.calls = [];
  container = document.createElement('div'); document.body.appendChild(container);
});
afterEach(() => { act(() => root?.unmount()); container.remove(); });

const A7 = ['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7'];
const B6 = ['b1', 'b2', 'b3', 'b4', 'b5', 'b6'];
const cup = (extra = {}) => ({
  meta: { id: '컵2026', name: '컵2026', sport: '풋살', status: 'active', createdAt: 1, createdBy: '', updatedAt: 1, lockedAt: null, ...extra },
  teams: [
    { id: 't1', name: '팀A', captain: '', players: A7, order: 0 },
    { id: 't2', name: '팀B', captain: '', players: B6, order: 1 },
    { id: 't3', name: '팀C', captain: '', players: ['c1'], order: 2 },
  ],
});
const M = (over = {}) => ({
  team: '마스터FC', sport: '풋살', mode: '대회', tournament_id: '컵2026', date: '2026-10-01', game_id: 'g1', match_idx: 1,
  match_id: 'R1_C0', our_team_name: '팀A', opponent_team_name: '팀B',
  our_members_json: JSON.stringify(A7), opponent_members_json: JSON.stringify(B6),
  our_score: 3, opponent_score: 0, our_gk: 'a1', opponent_gk: 'b1', is_extra: false, ...over,
});
const E = (over = {}) => ({ team: '마스터FC', sport: '풋살', mode: '대회', tournament_id: '컵2026', date: '2026-10-01', game_id: 'g1', match_id: 'R1_C0', event_type: 'goal', player: 'a2', related_player: 'a3', ...over });

const BASE = { teamName: '마스터FC', members: [...A7, ...B6, 'c1'], pendingGames: [], isAdmin: true, onStartGame: vi.fn(), onContinueGame: vi.fn(), onBack: vi.fn(), onChanged: vi.fn() };
async function mount(props = {}) {
  await act(async () => { root = createRoot(container); root.render(createElement(ThemeProvider, null, createElement(CupDetail, { ...BASE, cup: cup(), ...props }))); });
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
}
const click = async (el) => { await act(async () => { el.click(); }); await act(async () => { await Promise.resolve(); await Promise.resolve(); }); };
const btn = (txt) => [...container.querySelectorAll('button')].find(b => b.textContent.trim().includes(txt));

describe('CupDetail 기록 섹션', () => {
  it('컵 뷰 2종을 풋살로 명시해 읽는다', async () => {
    await mount();
    expect(h.calls.map(c => c[0]).sort()).toEqual(['cupEventLog', 'cupMatchLog']);
    for (const [, opts] of h.calls) expect(opts).toEqual({ sport: '풋살' });
  });
  it('행이 있으면 순위표·개인기록·경기일별 카드가 그려지고 1위가 첫 행', async () => {
    h.matchRows = [M()];
    h.eventRows = [E(), E({ related_player: '' }), E({ player: 'a4', related_player: '' })];
    await mount();
    const rows = [...container.querySelectorAll('tr[data-role="cup-standing-row"]')];
    // A: 3:0 승 3 + 등록 7명 참석 1 = 4 / C: 0경기(gd 0) / B: 0점 gd −3 → A, C, B
    expect(rows.map(r => r.dataset.team)).toEqual(['팀A', '팀C', '팀B']);
    // 순위·팀·경기·승·무·패·득실·승점·참석·합계
    expect([...rows[0].querySelectorAll('td')].map(td => td.textContent.trim())).toEqual(['1', '팀A', '1', '1', '0', '0', '+3', '3', '1', '4']);
    const players = [...container.querySelectorAll('tr[data-role="cup-player-row"]')];
    expect(players[0].dataset.player).toBe('a2');
    expect(players[0].textContent).toContain('2');
    expect(container.querySelector('div[data-role="cup-day"][data-date="2026-10-01"]')).not.toBeNull();
    expect(container.textContent).toContain('경기일별 풀리그');
    expect(container.textContent).not.toContain('풀리그 1회전');
  });
  it('행이 없으면 안내 문구, 개인기록·경기일별 섹션 없음', async () => {
    await mount();
    expect(container.querySelector('[data-role="cup-records-empty"]').textContent).toContain('아직 마감된 경기가 없습니다');
    expect(container.textContent).not.toContain('개인기록');
    expect(container.querySelector('table[data-role="cup-player-records"]')).toBeNull();
  });
  it('다른 대회 행만 있으면 이 대회에는 경기가 없다', async () => {
    h.matchRows = [M({ tournament_id: '컵2025' })];
    await mount();
    expect(container.querySelector('[data-role="cup-records-empty"]')).not.toBeNull();
  });
  it('읽기 실패 → 실패 문구 + 다시 시도; 팀 편집은 여전히 가능; 재시도로 복구', async () => {
    h.fail = true;
    await mount();
    expect(container.querySelector('[data-role="cup-records-error"]').textContent).toContain('기록을 불러오지 못했습니다');
    expect(btn('팀 편집')).toBeDefined();
    h.fail = false; h.matchRows = [M()];
    await click(container.querySelector('button[data-role="cup-records-retry"]'));
    expect(container.querySelector('table[data-role="cup-standings"]')).not.toBeNull();
    expect(container.querySelector('[data-role="cup-records-error"]')).toBeNull();
  });
  it('lockedAt 이 없어도 로그 행이 있으면 🔒 잠김', async () => {
    h.matchRows = [M()];
    await mount();
    expect(container.textContent).toContain('🔒 잠김');
    expect(btn('대회 삭제').disabled).toBe(true);
  });
  it('lockedAt 도 없고 행도 없으면 잠기지 않는다', async () => {
    await mount();
    expect(container.textContent).not.toContain('🔒 잠김');
  });
  it('종료된 대회는 1위에 🏆 우승', async () => {
    h.matchRows = [M()];
    await mount({ cup: cup({ status: 'finished' }) });
    expect(container.querySelector('tr[data-role="cup-standing-row"]').textContent).toContain('🏆 우승');
  });
});
