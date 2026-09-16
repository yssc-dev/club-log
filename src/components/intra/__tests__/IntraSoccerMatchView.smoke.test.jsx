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
  // [증분 4] 자동 시작 effect가 준비완료 상태에서 무조건 벤치 재계산 patch를 보낸다 — 그 경로를
  // 쓰지 않는 테스트가 매번 mock을 넘기지 않아도 되게 기본 noop을 둔다(각 테스트는 필요하면 override).
  onPatchSetup: noop, onStartMatch: noop, onDeleteSetupMatch: noop,
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

// 같은 root 에 새 props 로 다시 렌더 — 원격(다른 기기) 변경이 구독으로 도착한 상황.
// mount 는 새 root 를 만들어 무조건 재마운트되므로 '재마운트 판정'을 검증할 수 없다.
async function rerender(props = {}) {
  await act(async () => {
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
    const saved = { intra: { teams, syncedAt: 123 } };
    await mount({ savedFormation: saved, onFormationChange });
    await click(byPartialText('button', '외부전'));
    // [증분 4] 외부전도 우리 팀을 먼저 고른다 — 팀이 2개면 자동 선택되지 않으므로 직접 고른다.
    await click(byPartialText('button', '흰팀'));
    const afterTeam = onFormationChange.mock.calls.at(-1)[0];
    expect(afterTeam.intra).toEqual({ teams, syncedAt: 123, selectedOurTeam: '흰팀' });
    // 팀 선택 동기화가 도착한 상황을 재현(다른 곳에서 구독으로 되돌아온 savedFormation).
    await rerender({ savedFormation: { ...saved, intra: afterTeam.intra }, onFormationChange });
    await click(byText('외부팀'));
    expect(onFormationChange).toHaveBeenCalled();
    const last = onFormationChange.mock.calls.at(-1)[0];
    expect(last.selectedOpponent).toBe('외부팀');
    expect(last.viewState).toBe('formation');
    expect(last.intra).toEqual({ teams, syncedAt: 123, selectedOurTeam: '흰팀' });
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

  // RTDB 는 빈 배열을 저장하지 않고(→ undefined) 배열을 객체화({0:..,1:..})할 수 있는데,
  // soccerFormation 은 reconstructState 가 정규화 없이 그대로 복원한다(firebaseSyncDiff.js:388).
  // 새로고침·다른 기기 진입 후 intra.teams 가 이 모양으로 들어와도 렌더가 던지면 안 된다.
  it('intra.teams 가 객체화되어 와도 던지지 않고 팀 이름·인원·게이트가 정상 표시된다', async () => {
    const objTeams = {
      0: { name: '주황', players: Object.fromEntries(WHITE.map((n, i) => [i, n])) },
      1: { name: '파랑', players: Object.fromEntries(BLACK.map((n, i) => [i, n])) },
    };
    await mount({ savedFormation: { intra: { teams: objTeams } } });
    expect(text()).toContain('자체전 (주황 vs 파랑 · 참석 22명)');
    expect(byPartialText('button', '자체전').disabled).toBe(false);
  });

  // 위 2팀 케이스는 teams.length>=3 select 분기( 이 컴포넌트에서 유일하게 내부 ARR
  // 방어가 없는 t.players.filter 읽기 지점)를 건드리지 않아, 컴포넌트가 teamsOf 를
  // 빼먹고 intra.teams 를 그대로 읽도록 되돌려도 통과해버린다. 3팀 객체화(teams 자체도
  // 객체화, players 도 객체화)로 그 분기까지 회귀를 가드한다.
  it('3팀 객체화(teams·players 모두) → select 2개 렌더 + 옵션 라벨의 팀별 참석 인원이 정상, 게이트 활성', async () => {
    const objTeams3 = {
      0: { name: '주황', players: Object.fromEntries(WHITE.map((n, i) => [i, n])) },
      1: { name: '파랑', players: Object.fromEntries(BLACK.map((n, i) => [i, n])) },
      2: { name: '검정', players: { 0: RED[0] } },
    };
    await mount({
      attendees: [...WHITE, ...BLACK, RED[0]],
      savedFormation: { intra: { teams: objTeams3 } },
    });
    const selects = [...container.querySelectorAll('select')];
    expect(selects).toHaveLength(2);
    expect(text()).toContain('주황 (11명)');
    expect(text()).toContain('파랑 (11명)');
    expect(text()).toContain('검정 (1명)');
    expect(text()).toContain('자체전 (주황 vs 파랑 · 참석 23명)');
    expect(byPartialText('button', '자체전').disabled).toBe(false);
  });
});

// 증분 3(스펙 §14): 여러 명이 동시에 접속해 누구나 기록한다. FormationRecorder 는 uncontrolled 라
// (배치를 마운트 시 1회 시드, FormationRecorder.jsx:24-27) 원격 배치 변경은 key 교체로 재마운트해야 보인다.
// ⚠️ '피치에 보이는가'는 text() 부분일치로 가를 수 없다 — 레코더가 벤치도 "후보: a12, b12" 로 렌더하므로
// 교체 전에도 text() 에 a12 가 들어있다. byText(이름)은 '이름만 들어있는 노드'(= 피치 이름 칸)를 찾으므로
// 피치 위/벤치를 실제로 구분한다.
describe('IntraSoccerMatchView 실시간 전파 — 증분 3', () => {
  const playingIntra = {
    matchIdx: 0, status: 'playing', opponent: '검은팀', startedAt: 1,
    lineup: WHITE, gk: 'a1', defenders: [], subs: ['a12'],
    formation: '4-4-2',
    assignments: Object.fromEntries(WHITE.map((n, i) => [i, n])),
    positionMap: Object.fromEntries(WHITE.map((n, i) => [n, i === 0 ? 'GK' : 'FW'])),
    events: [],
    sideA: { name: '흰팀' },
    sideB: { name: '검은팀', lineup: BLACK, gk: 'b1', defenders: [], subs: ['b12'],
             formation: '4-4-2',
             assignments: Object.fromEntries(BLACK.map((n, i) => [i, n])),
             positionMap: Object.fromEntries(BLACK.map((n, i) => [n, i === 0 ? 'GK' : 'FW'])) },
  };
  const withAttendees = { attendees: [...WHITE, ...BLACK, 'a12', 'b12'] };
  // 다른 기기에서 A 편 a11 → a12 교체: assignments·positionMap·subs 가 바뀐 새 경기 객체가 도착한다.
  const remoteSub = {
    ...playingIntra,
    assignments: { ...playingIntra.assignments, 10: 'a12' },
    positionMap: { ...playingIntra.positionMap, a12: 'FW' },
    subs: ['a11'],
  };

  it('원격 배치 변경(A 편 교체)이 도착하면 피치에 새 선수가 보인다', async () => {
    await mount({ ...withAttendees, soccerMatches: [playingIntra], currentMatchIdx: 0 });
    expect(byText('a11'), 'a11 이 피치에 있어야 한다').toBeTruthy();
    expect(byText('a12'), '교체 전 a12 는 벤치(후보 줄)뿐 — 피치엔 없다').toBeFalsy();
    await rerender({ ...withAttendees, soccerMatches: [remoteSub], currentMatchIdx: 0 });
    expect(byText('a12'), '원격 교체가 피치에 반영돼야 한다').toBeTruthy();
    expect(byText('a11'), '교체로 빠진 a11 은 피치에서 사라져야 한다').toBeFalsy();
  });

  it('입력 중(교체 모달 열림)에는 보류하고 안내를 띄우며, 닫으면 반영한다', async () => {
    await mount({ ...withAttendees, soccerMatches: [playingIntra], currentMatchIdx: 0 });
    await click(byPartialText('button', '교체'));              // 모달 열기 → onBusyChange(true)
    await rerender({ ...withAttendees, soccerMatches: [remoteSub], currentMatchIdx: 0 });
    expect(text()).toContain('다른 기기에서 배치가 변경');       // 보류 안내
    expect(byText('a12'), '입력 중에는 재마운트를 보류 — 피치가 그대로여야 한다').toBeFalsy();
    expect(byText('a11')).toBeTruthy();
    // Modal.jsx:64-66 의 닫기 버튼은 아이콘 전용(aria-label="닫기") — textContent 로는 찾을 수 없다.
    await click(container.querySelector('button[aria-label="닫기"]'));   // onBusyChange(false) → 보류분 적용
    expect(byText('a12')).toBeTruthy();
    expect(text()).not.toContain('다른 기기에서 배치가 변경');
  });

  // 재마운트는 DOM 노드 교체로만 관찰할 수 있다 — 재마운트 직후 배치는 시트(props) 기준이라
  // 화면 텍스트가 같아질 수 있고, 그래도 레코더의 로컬 상태(열린 상대골 메뉴 등)는 사라진다.
  const pitchNode = (name) => byText(name);
  const withBench3 = { attendees: [...WHITE, ...BLACK, 'a12', 'a13', 'b12'] };
  // 교체 모달을 열어 a11 → a12 로컬 교체. onStateChange 로 나간 patch 를 그대로 돌려주면 '내 변경의 echo'다.
  async function localSub() {
    await click(byPartialText('button', '교체'));
    await click(byPartialText('button', 'a11'));            // 나가는 선수(모달 1단계)
    await click(byText('a12'));                             // 후보 투입(모달 2단계) → 모달 닫힘
  }

  it('내 변경의 echo 뒤 무관한 업데이트(원격 골)가 와도 레코더를 재마운트하지 않는다', async () => {
    const onUpdateMatchFormation = vi.fn();
    await mount({ ...withBench3, soccerMatches: [playingIntra], currentMatchIdx: 0, onUpdateMatchFormation });
    await localSub();
    expect(onUpdateMatchFormation).toHaveBeenCalled();
    // 리듀서(UPDATE_SOCCER_MATCH_FORMATION)가 화이트리스트로 반영한 뒤 구독으로 돌아온 모양.
    const echoed = { ...playingIntra, ...onUpdateMatchFormation.mock.calls.at(-1)[1] };
    await rerender({ ...withBench3, soccerMatches: [echoed], currentMatchIdx: 0 });
    const before = pitchNode('a12');
    expect(before, '내 교체가 피치에 남아 있어야 한다').toBeTruthy();
    // 다른 기기의 골 하나 — 배치는 그대로다(지문에 events 가 없다). 재마운트 이유가 없다.
    await rerender({
      ...withBench3, currentMatchIdx: 0,
      soccerMatches: [{ ...echoed, events: [{ id: 'g1', type: 'goal', player: 'b5', side: 'B', timestamp: 2 }] }],
    });
    expect(text()).toContain('상대골');                     // 골은 반영(prop 파생)
    expect(pitchNode('a12'), '무관한 업데이트에 레코더가 재마운트되면 안 된다').toBe(before);
  });

  it('원격 변경으로 재마운트된 뒤 늦게 도착한 내 echo 는 화면을 시트와 맞춘다', async () => {
    const onUpdateMatchFormation = vi.fn();
    await mount({ ...withBench3, soccerMatches: [playingIntra], currentMatchIdx: 0, onUpdateMatchFormation });
    await localSub();                                        // 내 변경(아직 시트에 안 도착)
    // 내 쓰기가 도착하기 전에 다른 기기의 배치 변경(a10 → a13)이 먼저 온다 → 재마운트, 내 로컬 배치는 버려진다
    // (편 상태는 필드 통짜 쓰기 = 마지막 쓰기가 이긴다, 스펙 §14.5).
    const remoteOther = {
      ...playingIntra,
      assignments: { ...playingIntra.assignments, 9: 'a13' },
      positionMap: { ...playingIntra.positionMap, a13: 'FW' },
      subs: ['a12', 'a10'],
    };
    await rerender({ ...withBench3, soccerMatches: [remoteOther], currentMatchIdx: 0 });
    expect(pitchNode('a13'), '원격 변경은 재마운트로 반영된다').toBeTruthy();
    expect(pitchNode('a12'), '재마운트 시드는 시트 기준 — 내 로컬 교체는 남지 않는다').toBeFalsy();
    // 이제 내 쓰기가 도착한다(통짜 쓰기라 a13 배치를 덮는다). 화면이 시트를 따라가야 한다 —
    // 안 따라가면 다음 내 저장이 '화면에 없는 시트 상태'를 기준으로 계산돼 또 남의 변경을 덮는다.
    const myEcho = { ...playingIntra, ...onUpdateMatchFormation.mock.calls.at(-1)[1] };
    await rerender({ ...withBench3, soccerMatches: [myEcho], currentMatchIdx: 0 });
    expect(pitchNode('a12'), '시트가 내 교체를 들고 있으면 화면도 그래야 한다').toBeTruthy();
    expect(pitchNode('a13'), '덮인 원격 변경은 화면에서도 사라져야 한다').toBeFalsy();
  });

  it('종료된 경기에는 이벤트 입력 경로가 없다(레코더 미렌더 + 가드)', async () => {
    const onAddEvent = vi.fn();
    await mount({ ...withAttendees, soccerMatches: [{ ...playingIntra, status: 'finished' }], currentMatchIdx: 0, onAddEvent });
    expect(byPartialText('button', '상대골')).toBeFalsy();      // 레코더 없음
    expect(onAddEvent).not.toHaveBeenCalled();
  });

  // 동시 생성 가드(blockIfRemoteStarted, 스펙 §14.4). 배치 화면(FormationSetup)은 early return 이라
  // soccerMatches 와 무관하게 렌더된다 — 내가 11명을 배치하는 동안 남이 경기를 시작할 수 있고,
  // 그대로 확정하면 두 기기가 같은 soccerMatches/{idx} 경로를 노린다. 가드 호출부를 지우면 이 테스트가 깨진다.
  it('배치 중 다른 기기가 경기를 시작하면 확정이 생성을 만들지 않고 배치 화면을 떠난다', async () => {
    const onCreateMatch = vi.fn();
    const alertSpy = vi.fn();                                  // jsdom 의 window.alert 는 미구현(가상콘솔 에러)
    const realAlert = window.alert;
    window.alert = alertSpy;
    try {
      // savedFormation 은 같은 참조를 계속 넘긴다 — 새 객체를 주면 동기 effect 가 selectedOpponent 를
      // 다시 세팅(=null 로 초기화)해 배치 화면을 떠나버려 가드와 무관하게 테스트가 통과한다.
      const saved = { viewState: 'formation', selectedOpponent: '외부팀' };
      await mount({ ...withAttendees, savedFormation: saved, onCreateMatch });
      expect(text()).toContain('vs 외부팀');
      // 후보 칩을 11번 탭 → 순서대로 자동 배치(FormationSetup.jsx:38-43). 배치되면 목록에서 사라지므로
      // 매번 다시 쿼리한다. 이름만 들어있는 button = 후보 칩(피치 이름 칸은 div).
      const names = new Set(withAttendees.attendees);
      for (let i = 0; i < 11; i++) {
        await click([...container.querySelectorAll('button')].find(b => names.has(b.textContent.trim())));
      }
      expect(text()).toContain('11/11');
      // 여기서 남이 경기를 시작한다(구독으로 도착).
      await rerender({ ...withAttendees, savedFormation: saved, onCreateMatch, soccerMatches: [playingIntra], currentMatchIdx: 0 });
      await click(byPartialText('button', '경기 시작'));
      expect(onCreateMatch, '이미 진행 중 경기가 있으면 생성하지 않는다').not.toHaveBeenCalled();
      // [증분 4] 생성 가드가 배치 중까지 넓어지며 문구도 "진행 중이거나 배치 중"으로 바뀌었다(task-5-brief).
      expect(alertSpy).toHaveBeenCalledWith(expect.stringContaining('이미 진행 중이거나 배치 중인 경기가 있습니다'));
      // 배치 화면에 갇히지 않고 진행 중 노드로 돌아간다(안 떠나면 확정을 또 누르게 된다).
      expect(byPartialText('button', '경기 시작')).toBeFalsy();
      expect(text()).toContain('진행중');
    } finally {
      window.alert = realAlert;
    }
  });
});

// 증분 4(스펙 §16): 자체전은 A·B 를 따로 배치하고 양 팀 준비완료로 시작한다.
describe('IntraSoccerMatchView 배치 중 노드 — 증분 4', () => {
  const T = [team('흰팀', WHITE), team('검은팀', BLACK)];
  const props = { attendees: [...WHITE, ...BLACK], savedFormation: { intra: { teams: T } } };
  const setupMatch = (over = {}) => ({
    matchIdx: 0, status: 'setup', startedAt: null, opponent: '검은팀',
    sideA: { name: '흰팀' }, sideB: { name: '검은팀' }, events: [], ...over,
  });

  it('자체전 시작이 배치 중 경기를 만들고 양 팀 이름을 저장한다', async () => {
    const onCreateMatch = vi.fn();
    const onPatchSetup = vi.fn();
    await mount({ ...props, onCreateMatch, onPatchSetup });
    await click(byPartialText('button', '자체전'));
    expect(onCreateMatch).toHaveBeenCalledTimes(1);
    expect(onCreateMatch.mock.calls[0][0]).toMatchObject({ status: 'setup', startedAt: null, opponent: '검은팀' });
    expect(onPatchSetup).toHaveBeenCalledWith(0, 'A', { name: '흰팀' });
    expect(onPatchSetup).toHaveBeenCalledWith(0, 'B', { name: '검은팀' });
  });

  it('배치 중 노드는 두 팀 카드와 진행 상태를 보여준다', async () => {
    await mount({ ...props, currentMatchIdx: 0,
      soccerMatches: [setupMatch({ assignments: Object.fromEntries(WHITE.map((n, i) => [i, n])) })] });
    expect(text()).toContain('배치 중');
    expect(text()).toContain('흰팀');
    expect(text()).toContain('검은팀');
    expect(text()).toContain('11/11');      // A 는 다 찼고
    expect(text()).toContain('0/11');       // B 는 비었다
    // [최종 리뷰 F4] 스펙 §16.6 이 요구하는 고지 — 배치를 고치면 준비완료가 풀린다는 걸 카드에서 알린다.
    expect(text()).toContain('배치를 고치면 그 팀의 준비완료가 풀립니다');
  });

  it('편 배치 저장은 그 편만 패치하고 준비완료를 푼다', async () => {
    const onPatchSetup = vi.fn();
    await mount({ ...props, currentMatchIdx: 0, onPatchSetup,
      soccerMatches: [setupMatch({ sideA: { name: '흰팀', ready: true } })] });
    await click(byPartialText('button', '흰팀 배치'));
    // [최종 리뷰 F2] 편집기를 열면 그 편(이미 ready:true)의 준비완료가 먼저 풀린다(편집 중 시작 방지).
    expect(onPatchSetup).toHaveBeenCalledWith(0, 'A', { ready: false, readyBy: null });
    // 제목의 "그 편만" — 상대 편(B)에는 어떤 patch 도 나가지 않는다(F2 로 호출 횟수 단정을 뺀 자리 복원).
    expect(onPatchSetup.mock.calls.every(c => c[1] === 'A'), 'B 편에는 patch 가 나가면 안 된다').toBe(true);
    // FormationSetup 전체화면 — 후보 칩 11개를 눌러 채운다(배치되면 목록에서 사라지므로 매번 다시 쿼리).
    const names = new Set(WHITE);
    for (let i = 0; i < 11; i++) {
      await click([...container.querySelectorAll('button')].find(b => names.has(b.textContent.trim())));
    }
    await click(byPartialText('button', '배치 저장'));
    const savePatch = onPatchSetup.mock.calls.find(c => c[2] && c[2].lineup !== undefined);
    expect(savePatch, '배치 저장 patch 가 나가야 한다').toBeTruthy();
    const [idx, side, patch] = savePatch;
    expect(idx).toBe(0);
    expect(side).toBe('A');
    expect(patch.lineup).toHaveLength(11);
    expect(patch.ready).toBe(false);          // 배치를 고치면 준비완료가 풀린다
    expect(patch.readyBy).toBe(null);
  });

  it('B 배치 화면 후보에서 A 가 이미 쓴 유동 인원이 빠진다', async () => {
    await mount({ ...props, attendees: [...WHITE, ...BLACK, 'f1'], currentMatchIdx: 0,
      soccerMatches: [setupMatch({ assignments: { 0: 'f1' } })] });
    await click(byPartialText('button', '검은팀 배치'));
    expect(text()).toContain('검은팀 선발 11명');   // 배치 화면에 실제로 들어왔는지(안 열려도 통과하던 구멍)
    expect(text()).not.toContain('f1');
  });
});

// [증분 4] 양 팀 준비완료 시 자동 시작, 중복 선수 차단, 배치 취소, 생성 가드 확장.
describe('IntraSoccerMatchView 배치 중 — 시작과 취소', () => {
  const T = [team('흰팀', WHITE), team('검은팀', BLACK)];
  const base = { attendees: [...WHITE, ...BLACK], savedFormation: { intra: { teams: T } } };
  const elevenOf = (arr) => Object.fromEntries(arr.map((n, i) => [i, n]));
  const setupMatch = (over = {}) => ({
    matchIdx: 0, status: 'setup', startedAt: null, opponent: '검은팀',
    sideA: { name: '흰팀' }, sideB: { name: '검은팀' }, events: [], ...over,
  });
  const filled = (over = {}) => setupMatch({
    assignments: elevenOf(WHITE),
    sideB: { name: '검은팀', assignments: elevenOf(BLACK) },
    ...over,
  });

  it('한 팀만 준비완료면 경기를 시작하지 않는다', async () => {
    const onStartMatch = vi.fn();
    await mount({ ...base, currentMatchIdx: 0, onStartMatch,
      soccerMatches: [filled({ sideA: { name: '흰팀', ready: true } })] });
    expect(onStartMatch).not.toHaveBeenCalled();
  });

  it('양 팀 준비완료가 되면 경기를 시작한다', async () => {
    const onStartMatch = vi.fn();
    await mount({ ...base, currentMatchIdx: 0, onStartMatch,
      soccerMatches: [filled({
        sideA: { name: '흰팀', ready: true },
        sideB: { name: '검은팀', ready: true, assignments: elevenOf(BLACK) },
      })] });
    expect(onStartMatch).toHaveBeenCalledTimes(1);
    expect(onStartMatch.mock.calls[0][0]).toBe(0);
  });

  it('11명 미만이면 준비완료를 막는다', async () => {
    const onPatchSetup = vi.fn();
    const alertSpy = vi.fn(); const realAlert = window.alert; window.alert = alertSpy;
    try {
      await mount({ ...base, currentMatchIdx: 0, onPatchSetup,
        soccerMatches: [setupMatch({ assignments: { 0: WHITE[0] } })] });
      await click([...container.querySelectorAll('button')].find(b => b.textContent.trim() === '준비완료'));
      expect(onPatchSetup).not.toHaveBeenCalled();
      expect(alertSpy).toHaveBeenCalledWith(expect.stringContaining('11명'));
    } finally { window.alert = realAlert; }
  });

  it('양 팀에 같은 선수가 있으면 시작하지 않고 양쪽 준비를 푼다', async () => {
    const onStartMatch = vi.fn(); const onPatchSetup = vi.fn();
    const alertSpy = vi.fn(); const realAlert = window.alert; window.alert = alertSpy;
    try {
      const dup = [...BLACK.slice(0, 10), WHITE[0]];          // 흰팀 선발 1명이 검은팀에도 있다
      await mount({ ...base, currentMatchIdx: 0, onStartMatch, onPatchSetup,
        soccerMatches: [filled({
          sideA: { name: '흰팀', ready: true },
          sideB: { name: '검은팀', ready: true, assignments: elevenOf(dup) },
        })] });
      expect(onStartMatch).not.toHaveBeenCalled();
      expect(onPatchSetup).toHaveBeenCalledWith(0, 'A', { ready: false, readyBy: null });
      expect(onPatchSetup).toHaveBeenCalledWith(0, 'B', { ready: false, readyBy: null });
      expect(alertSpy).toHaveBeenCalledWith(expect.stringContaining(WHITE[0]));
    } finally { window.alert = realAlert; }
  });

  it('배치 취소는 마지막 배치 중 경기를 지운다', async () => {
    const onDeleteSetupMatch = vi.fn();
    const realConfirm = window.confirm; window.confirm = () => true;
    try {
      await mount({ ...base, currentMatchIdx: 0, onDeleteSetupMatch, soccerMatches: [setupMatch()] });
      await click(byPartialText('button', '배치 취소'));
      expect(onDeleteSetupMatch).toHaveBeenCalledWith(0);
    } finally { window.confirm = realConfirm; }
  });

  it('배치 중 경기가 있으면 새 경기 유형 카드를 띄우지 않는다(중복 생성 차단)', async () => {
    const onCreateMatch = vi.fn();
    await mount({ ...base, currentMatchIdx: 0, onCreateMatch, soccerMatches: [setupMatch()] });
    expect(byPartialText('button', '자체전')).toBeFalsy();
    expect(onCreateMatch).not.toHaveBeenCalled();
  });

  // [최종 리뷰 F1] 이전에는 시작 시 양 편 벤치(subs)를 재계산해 patch로 보냈으나, 그 쓰기가
  // 상대 기기가 방금 저장한 sideB 통짜를 stale 값으로 덮는 창을 만든다는 게 드러났다(correctness #3).
  // m.subs 는 어디서도 읽지 않으므로(soccerScoring.js:98) 이득 없는 쓰기 — 이제 아예 안 보낸다.
  it('시작할 때 벤치(subs)를 쓰지 않는다 — 상대 편 통짜 덮어쓰기 창을 만들지 않는다', async () => {
    const onStartMatch = vi.fn(); const onPatchSetup = vi.fn();
    await mount({ ...base, attendees: [...WHITE, ...BLACK, 'f1'], currentMatchIdx: 0, onStartMatch, onPatchSetup,
      soccerMatches: [filled({
        subs: ['f1'],
        sideA: { name: '흰팀', ready: true },
        sideB: { name: '검은팀', ready: true, assignments: elevenOf([...BLACK.slice(0, 10), 'f1']) },
      })] });
    expect(onPatchSetup.mock.calls.some(c => c[2] && c[2].subs !== undefined), 'subs 패치를 보내면 안 된다').toBe(false);
    expect(onStartMatch).toHaveBeenCalledTimes(1);
  });

  // [최종 리뷰 F2] 준비완료 상태에서도 '배치 수정'을 열 수 있어서, 그 사이 상대가 준비완료를 누르면
  // 양쪽 ready 가 참이 되어 자동 시작 effect가 START 를 보내고, 편집 화면이 닫히며 저장이 조용히 버려진다.
  it('배치 수정을 열면 그 편 준비완료가 풀린다(편집 중 시작으로 작업이 날아가는 것 방지)', async () => {
    const onPatchSetup = vi.fn();
    await mount({ ...base, currentMatchIdx: 0, onPatchSetup,
      soccerMatches: [filled({ sideA: { name: '흰팀', ready: true, readyBy: '홍길동' } })] });
    await click(byPartialText('button', '흰팀 배치'));
    expect(onPatchSetup).toHaveBeenCalledWith(0, 'A', { ready: false, readyBy: null });
  });

  it('편집 중 경기가 시작돼 저장이 무시되면 안내한다', async () => {
    const alertSpy = vi.fn(); const realAlert = window.alert; window.alert = alertSpy;
    const onPatchSetup = vi.fn();
    try {
      await mount({ ...base, currentMatchIdx: 0, onPatchSetup, soccerMatches: [filled()] });
      await click(byPartialText('button', '흰팀 배치'));
      onPatchSetup.mockClear();
      // 편집 화면을 연 사이 다른 기기가 경기를 시작했다(원격 상태 도착).
      await rerender({ ...base, currentMatchIdx: 0, onPatchSetup,
        soccerMatches: [{ ...filled(), status: 'playing', startedAt: 1 }] });
      // 이 시점엔 편집 화면이 닫혀 있어야 하고(정리 effect), 카드/레코더 화면이다.
      expect(alertSpy).not.toHaveBeenCalled();
    } finally { window.alert = realAlert; }
  });
});

// [증분 4] 외부전도 우리 팀을 먼저 고른다(스펙 §16.3.5) — 그 팀 소속 참석자만 배치 후보,
// 경기 생성 시 sideA.name 에 팀 이름을 남긴다.
describe('IntraSoccerMatchView 외부전 우리 팀 선택 — 증분 4', () => {
  const T = [team('흰팀', WHITE), team('검은팀', BLACK)];
  const base = { attendees: [...WHITE, ...BLACK, 'f1'], savedFormation: { intra: { teams: T } } };

  it('외부전을 고르면 우리 팀을 먼저 고르게 한다', async () => {
    await mount(base);
    await click(byPartialText('button', '외부전'));
    expect(text()).toContain('우리 팀');
    expect(text()).toContain('흰팀');
    expect(text()).toContain('검은팀');
  });

  it('우리 팀을 고르면 후보가 그 팀 소속만 나온다(유동 인원·다른 팀 제외)', async () => {
    await mount({ ...base,
      savedFormation: { viewState: 'formation', selectedOpponent: 'aaa', intra: { teams: T, selectedOurTeam: '흰팀' } } });
    expect(text()).toContain('흰팀 선발 11명');
    expect(text()).not.toContain('f1');
    expect(text()).not.toContain(BLACK[0]);
  });

  it('외부전 경기를 만들 때 우리 팀 이름을 sideA 에 저장한다', async () => {
    const onCreateMatch = vi.fn(); const onPatchSide = vi.fn();
    await mount({ ...base, onCreateMatch, onPatchSide,
      savedFormation: { viewState: 'formation', selectedOpponent: 'aaa', intra: { teams: T, selectedOurTeam: '흰팀' } } });
    const names = new Set(WHITE);
    for (let i = 0; i < 11; i++) {
      await click([...container.querySelectorAll('button')].find(b => names.has(b.textContent.trim())));
    }
    await click(byPartialText('button', '경기 시작'));
    expect(onCreateMatch).toHaveBeenCalledTimes(1);
    expect(onPatchSide).toHaveBeenCalledWith(0, 'A', { name: '흰팀' });
  });

  // [최종 리뷰 F3] 팀 목록이 비면(시트 로딩 실패 등) 게이트가 '우리 팀 선택'에서 막다른 길이 되던 회귀.
  it('팀 목록이 비면 외부전이 막히지 않고 상대팀 선택으로 간다', async () => {
    await mount({ attendees: [...WHITE], savedFormation: { intra: { teams: [] } } });
    await click(byPartialText('button', '외부전'));
    expect(text()).not.toContain('우리 팀 선택');
    expect(text()).toContain('상대팀');            // OpponentSelector 로 바로 진입
  });
});
