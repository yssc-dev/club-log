// IntraSoccerMatchView 실렌더(act) 스모크 — 빅마스터FC 증분 2(스펙 §13) 계약 검증.
// 이 파일은 렌더 하네스가 없어 build/vitest가 마운트 크래시(선언순서/TDZ)를 못 잡던 공백을 메운다
// (memory: feedback_component_render_verification_gap, TeamDashboard.render.test.jsx와 같은 패턴).
// SSR(renderToStaticMarkup)로는 ◀▶ 네비게이션·저장 콜백을 누를 수 없어 act+createRoot 실렌더로 간다.
// 검증 계약: ① 자체전 게이트 사유 문구 ② 3팀 이상 선택 UI가 selectedPair를 따름
// ③ 종료 노드(자체전·외부전)는 읽기 전용 ④ 자체전과 무관한 저장에도 savedFormation.intra가 보존된다.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { ThemeProvider, useTheme } from '../../../hooks/useTheme';
import { makeStyles } from '../../../styles/theme';
import IntraSoccerMatchView from '../IntraSoccerMatchView';

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (q) => ({ matches: false, media: q, onchange: null, addListener(){}, removeListener(){}, addEventListener(){}, removeEventListener(){}, dispatchEvent(){} }),
});
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const eleven = (p) => Array.from({ length: 11 }, (_, i) => `${p}${i + 1}`);
const WHITE = eleven('a'), BLACK = eleven('b'), RED = eleven('c');
const team = (name, players) => ({ name, players });

// 기록화면은 styles prop(s.card/s.input/s.btnFull)을 부모에서 받는다 — 테마에서 실제 스타일을 만들어 넘긴다.
function Harness(props) {
  const { C } = useTheme();
  return createElement(IntraSoccerMatchView, { styles: makeStyles(C), ...props });
}

const noop = () => {};
const BASE_PROPS = {
  soccerMatches: [], currentMatchIdx: -1, attendees: [...WHITE, ...BLACK], opponents: ['외부팀'],
  onCreateMatch: noop, onAddEvent: noop, onDeleteEvent: noop, onFinishMatch: noop,
  onUpdateMatchFormation: noop, onCreateRestMatch: noop, onPatchSide: noop,
  onAddOpponent: noop, onRemoveOpponent: noop, onRenameOpponent: noop,
  savedFormation: null, onFormationChange: noop,
};

const finishedIntra = {
  matchIdx: 0, status: 'finished', opponent: '검은팀', startedAt: 1,
  lineup: WHITE, gk: 'a1', defenders: [], subs: [], events: [],
  sideA: { name: '흰팀' },
  sideB: { name: '검은팀', lineup: BLACK, gk: 'b1', defenders: [], subs: [], events: [] },
};

let container, root;
beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); });
afterEach(async () => { await act(async () => root?.unmount()); root = null; container.remove(); });

async function mount(props = {}) {
  await act(async () => {
    root = createRoot(container);
    root.render(createElement(ThemeProvider, null, createElement(Harness, { ...BASE_PROPS, ...props })));
  });
}

const text = () => container.textContent;
// 텍스트로 엘리먼트 찾기 — 가장 안쪽(마지막) 일치를 고른다. 상대팀 항목은 button이 아니라 span이라
// 태그를 박으면 OpponentSelector 마크업이 바뀔 때마다 깨진다.
const byText = (t) => [...container.querySelectorAll('*')].filter(el => el.textContent.trim() === t).pop();
const byPartialText = (sel, t) => [...container.querySelectorAll(sel)].find(el => el.textContent.includes(t));
const click = async (el) => {
  expect(el, '클릭 대상 엘리먼트를 찾지 못했다').toBeTruthy();
  await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
};

describe('IntraSoccerMatchView 실렌더(act) — 증분 2', () => {
  it('intra 없음 → 자체전 비활성 + 게이트 사유, 선택 UI 없음', async () => {
    await mount();
    expect(text()).toContain('자체전 — 시트에 팀 열이 2개 이상 필요');
    expect(text()).toContain('외부전 (상대팀 선택)');
    expect(container.querySelectorAll('select')).toHaveLength(0);
    expect(byPartialText('button', '자체전').disabled).toBe(true);
  });

  it('2팀·참석 22명 → 자체전 활성 + 시트 팀 이름 표시(이름 입력 없음)', async () => {
    await mount({ savedFormation: { intra: { teams: [team('흰팀', WHITE), team('검은팀', BLACK)] } } });
    expect(text()).toContain('자체전 (흰팀 vs 검은팀 · 참석 22명)');
    expect(byPartialText('button', '자체전').disabled).toBe(false);
    // 편 이름은 시트가 정한다 — 유형 카드에 이름 입력칸이 없어야 한다.
    expect(container.querySelectorAll('input')).toHaveLength(0);
    // 2팀이면 대결 상대가 하나뿐이라 선택 UI를 내지 않는다.
    expect(container.querySelectorAll('select')).toHaveLength(0);
  });

  it('참석 부족 → 게이트 사유에 팀별 참석 인원이 들어간다', async () => {
    await mount({ attendees: WHITE, savedFormation: { intra: { teams: [team('흰팀', WHITE), team('검은팀', BLACK)] } } });
    expect(text()).toContain('흰팀 11명 · 검은팀 0명 · 참석 11명');
    expect(byPartialText('button', '자체전').disabled).toBe(true);
  });

  it('3팀 → select 2개가 selectedPair를 반영하고, 변경 시 teams를 보존해 저장한다', async () => {
    const teams = [team('흰팀', WHITE), team('검은팀', BLACK), team('빨강팀', RED)];
    const onFormationChange = vi.fn();
    await mount({
      attendees: [...WHITE, ...BLACK, ...RED],
      savedFormation: { intra: { teams, selectedPair: [1, 2], syncedAt: 7 } },
      onFormationChange,
    });
    const selects = [...container.querySelectorAll('select')];
    expect(selects).toHaveLength(2);
    expect(selects.map(s => s.value)).toEqual(['1', '2']);
    expect(text()).toContain('자체전 (검은팀 vs 빨강팀 · 참석 33명)');
    expect(text()).toContain('빨강팀 (11명)');

    // 첫 select를 흰팀(0)으로 바꾸면 selectedPair만 바뀌고 teams/syncedAt은 살아남아야 한다.
    await act(async () => {
      selects[0].value = '0';
      selects[0].dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(onFormationChange).toHaveBeenCalled();
    expect(onFormationChange.mock.calls.at(-1)[0].intra).toEqual({ teams, selectedPair: [0, 2], syncedAt: 7 });
  });

  // 핵심 불변식: soccerFormation은 whole-replace 동기 필드라 자체전과 무관한 저장(외부전 상대 선택)에도
  // savedFormation.intra가 살아남아야 한다. 안 그러면 저장 한 번에 시트 팀 명단이 RTDB에서 사라진다.
  it('saveFormationState가 savedFormation.intra를 보존한다', async () => {
    const teams = [team('흰팀', WHITE), team('검은팀', BLACK)];
    const onFormationChange = vi.fn();
    await mount({ savedFormation: { intra: { teams, syncedAt: 123 } }, onFormationChange });
    await click(byPartialText('button', '외부전'));
    await click(byText('외부팀'));
    expect(onFormationChange).toHaveBeenCalled();
    const last = onFormationChange.mock.calls.at(-1)[0];
    expect(last.selectedOpponent).toBe('외부팀');
    expect(last.viewState).toBe('formation');
    expect(last.intra).toEqual({ teams, syncedAt: 123 });
  });

  // 종료 노드는 초기 포커스가 트레일링 '새 경기'라 ◀ 한 번 눌러야 보인다.
  it('자체전 종료 노드 = 읽기 전용(확정취소·출전 수정·상대팀 변경 없음)', async () => {
    await mount({ soccerMatches: [finishedIntra] });
    expect(text()).toContain('새 경기');
    await click(container.querySelector('button[aria-label="이전"]'));
    expect(text()).toContain('종료됨 · 확정(수정 불가)');
    expect(text()).toContain('흰팀 vs 검은팀');
    expect(text()).not.toContain('확정취소');
    expect(text()).not.toContain('출전 수정');
    expect(text()).not.toContain('상대팀 변경');
  });

  it('외부전 종료 노드도 읽기 전용', async () => {
    const finishedExt = { matchIdx: 0, status: 'finished', opponent: '외부팀', startedAt: 1, lineup: WHITE, gk: 'a1', defenders: [], subs: [], events: [] };
    await mount({ soccerMatches: [finishedExt] });
    await click(container.querySelector('button[aria-label="이전"]'));
    expect(text()).toContain('종료됨 · 확정(수정 불가)');
    expect(text()).not.toContain('확정취소');
    expect(text()).not.toContain('출전 수정');
    expect(text()).not.toContain('상대팀 변경');
  });

  // 읽기 전용은 finished에만 걸린다 — 진행중 경기는 A/B 탭과 출전 수정이 그대로 있어야 한다.
  it('진행중 자체전 노드 = A/B 탭·점수판·출전 수정 유지', async () => {
    await mount({ soccerMatches: [{ ...finishedIntra, status: 'playing' }], currentMatchIdx: 0 });
    expect(text()).toContain('흰팀 기록');
    expect(text()).toContain('출전 수정');
    expect(text()).toContain('진행중');
    expect(text()).not.toContain('확정(수정 불가)');
  });
});
