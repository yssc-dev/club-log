// src/components/cup/__tests__/CupDetail.render.test.jsx
// 3단계 스펙 §4.2·§5 — 대회 상세가 컵 뷰 2종을 읽어 순위표·개인기록·경기일별 결과를 그리고,
// 로그가 있으면 lockedAt 없이도 잠긴다. sheetCache·cupSync 는 목.
// 탭 구조(2026-10-02): 대시보드·분석·팀 관리 세 탭.
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
// 탭 전환 헬퍼: data-tab 속성으로 탭 버튼을 찾아 클릭한다.
const switchTab = async (tabKey) => { await click(container.querySelector(`[data-tab="${tabKey}"]`)); };

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
    // 순위표와 경기일별 결과는 대시보드 탭(기본)에서 확인
    const rows = [...container.querySelectorAll('tr[data-role="cup-standing-row"]')];
    // A: 3:0 승 3 + 등록 7명 참석 1 = 4 / C: 0경기(gd 0) / B: 0점 gd −3 → A, C, B
    expect(rows.map(r => r.dataset.team)).toEqual(['팀A', '팀C', '팀B']);
    // 순위·팀·경기·승·무·패·득실·승점·참석·합계
    expect([...rows[0].querySelectorAll('td')].map(td => td.textContent.trim())).toEqual(['1', '팀A', '1', '1', '0', '0', '+3', '3', '1', '4']);
    expect(container.querySelector('div[data-role="cup-day"][data-date="2026-10-01"]')).not.toBeNull();
    expect(container.textContent).toContain('경기일별 풀리그');
    expect(container.textContent).not.toContain('풀리그 1회전');
    // 분석 탭으로 전환 후 개인기록 확인
    await switchTab('analysis');
    const players = [...container.querySelectorAll('tr[data-role="cup-player-row"]')];
    expect(players[0].dataset.player).toBe('a2');
    expect(players[0].textContent).toContain('2');
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
    // 에러 블록은 대시보드 탭(기본)의 순위표 섹션에
    expect(container.querySelector('[data-role="cup-records-error"]').textContent).toContain('기록을 불러오지 못했습니다');
    // 팀 편집 버튼은 팀 관리 탭으로 전환 후 확인
    await switchTab('teams');
    expect(btn('팀 편집')).toBeDefined();
    // 대시보드 탭으로 돌아와 재시도
    await switchTab('dashboard');
    h.fail = false; h.matchRows = [M()];
    await click(container.querySelector('button[data-role="cup-records-retry"]'));
    expect(container.querySelector('table[data-role="cup-standings"]')).not.toBeNull();
    expect(container.querySelector('[data-role="cup-records-error"]')).toBeNull();
  });
  it('lockedAt 이 없어도 로그 행이 있으면 🔒 잠김', async () => {
    h.matchRows = [M()];
    await mount();
    expect(container.textContent).toContain('🔒 잠김');
    // 삭제 버튼은 팀 관리 탭에
    await switchTab('teams');
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
  it('행이 있으면 시상·맞대결·키퍼·수비력 네 섹션이 그려진다', async () => {
    // M(): 팀A 3:0 팀B, our_gk=a1, opponent_gk=b1
    // E(): goal player=a2, related_player=a3
    h.matchRows = [M()];
    h.eventRows = [E()];
    await mount();
    // 시상: 대시보드 탭(기본)에서 확인 (득점왕 a2)
    const awards = container.querySelector('[data-role="cup-awards"]');
    expect(awards).not.toBeNull();
    expect(awards.textContent).toContain('득점왕');
    expect(awards.textContent).toContain('a2');
    // 분석 탭으로 전환 후 맞대결·키퍼·수비력 확인
    await switchTab('analysis');
    // 키퍼: a1 clean sheet 1, b1 clean sheet 0
    const keeperTable = container.querySelector('table[data-role="cup-keepers"]');
    expect(keeperTable).not.toBeNull();
    const a1Row = container.querySelector('[data-role="cup-keeper-row"][data-player="a1"]');
    const b1Row = container.querySelector('[data-role="cup-keeper-row"][data-player="b1"]');
    expect(a1Row).not.toBeNull();
    expect(b1Row).not.toBeNull();
    // a1: 1 game, 0 conceded, 1 clean sheet
    const a1Cells = [...a1Row.querySelectorAll('td')].map(td => td.textContent.trim());
    expect(a1Cells[4]).toBe('1'); // cleanSheets
    // 맞대결: 팀A→팀B 1-0-0
    const h2hTable = container.querySelector('table[data-role="cup-h2h"]');
    expect(h2hTable).not.toBeNull();
    const h2hCell = container.querySelector('[data-role="cup-h2h-cell"][data-row="팀A"][data-col="팀B"]');
    expect(h2hCell).not.toBeNull();
    expect(h2hCell.textContent).toContain('1승0무0패');
    // 수비력
    expect(container.querySelector('table[data-role="cup-defense"]')).not.toBeNull();
  });
  it('행이 없으면 시상·맞대결·키퍼·수비력 섹션 없음', async () => {
    await mount();
    expect(container.querySelector('[data-role="cup-awards"]')).toBeNull();
    expect(container.querySelector('table[data-role="cup-h2h"]')).toBeNull();
    expect(container.querySelector('table[data-role="cup-keepers"]')).toBeNull();
    expect(container.querySelector('table[data-role="cup-defense"]')).toBeNull();
  });
  it('행이 있으면 분석 탭에 cup-onoff 표가 그려진다', async () => {
    h.matchRows = [M()];
    h.eventRows = [E()];
    await mount();
    await switchTab('analysis');
    expect(container.querySelector('table[data-role="cup-onoff"]')).not.toBeNull();
  });
});

describe('CupDetail 탭 구조', () => {
  it('기본 탭은 대시보드이고 분석 탭 내용(개인기록 표)은 DOM 에 없다', async () => {
    h.matchRows = [M()];
    h.eventRows = [E()];
    await mount();
    // 대시보드 탭이 선택됨
    expect(container.querySelector('[data-tab="dashboard"]').getAttribute('aria-selected')).toBe('true');
    // 순위표는 대시보드 탭에 있음
    expect(container.querySelector('table[data-role="cup-standings"]')).not.toBeNull();
    // 개인기록 표는 분석 탭에만 있으므로 DOM 에 없음
    expect(container.querySelector('table[data-role="cup-player-records"]')).toBeNull();
  });
  it('탭 전환 후 aria-selected 가 바뀐다', async () => {
    await mount();
    const dashTab = container.querySelector('[data-tab="dashboard"]');
    const analysisTab = container.querySelector('[data-tab="analysis"]');
    const teamsTab = container.querySelector('[data-tab="teams"]');
    expect(dashTab.getAttribute('aria-selected')).toBe('true');
    expect(analysisTab.getAttribute('aria-selected')).toBe('false');
    expect(teamsTab.getAttribute('aria-selected')).toBe('false');
    await click(analysisTab);
    expect(dashTab.getAttribute('aria-selected')).toBe('false');
    expect(analysisTab.getAttribute('aria-selected')).toBe('true');
    expect(teamsTab.getAttribute('aria-selected')).toBe('false');
  });
  it('팀 0개 관리자면 팀 관리 탭이 열린 채 편집기가 보인다', async () => {
    await mount({ cup: { meta: cup().meta, teams: [] } });
    // 팀 관리 탭이 초기 탭
    expect(container.querySelector('[data-tab="teams"]').getAttribute('aria-selected')).toBe('true');
    // CupTeamEditor 가 열려 있음(취소 버튼 존재)
    expect(container.querySelector('[data-role="cancel"]')).not.toBeNull();
  });
  it('분석 탭에서도 로딩/에러 블록이 보이고 다시 시도가 동작한다', async () => {
    h.fail = true;
    await mount();
    // 분석 탭으로 전환
    await switchTab('analysis');
    // 에러 블록이 분석 탭에도 표시됨
    expect(container.querySelector('[data-role="cup-records-error"]')).not.toBeNull();
    // 다시 시도 클릭 후 개인기록이 보임
    h.fail = false; h.matchRows = [M()]; h.eventRows = [E()];
    await click(container.querySelector('button[data-role="cup-records-retry"]'));
    expect(container.querySelector('table[data-role="cup-player-records"]')).not.toBeNull();
    expect(container.querySelector('[data-role="cup-records-error"]')).toBeNull();
  });
});
