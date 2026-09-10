// IntraSoccerMatchView 오케스트레이터의 결정 로직. 전부 순수 — 컴포넌트는 결과를 dispatch/setTab 할 뿐이다.
import { isIntra, fieldsOfA, fieldsOfB } from './sideView';
import { FORMATIONS, swapFormationSlots, defendersFromPositionMap, revertSubInFormation } from '../formations';

const otherOf = (side) => (side === 'A' ? 'B' : 'A');
const fieldsOf = (m, side) => (side === 'A' ? fieldsOfA(m) : fieldsOfB(m));
const SIDE_PATCH_KEYS = ["formation", "assignments", "positionMap", "gk", "subs", "defenders"];

// 탭 side 의 레코더가 내보낸 이벤트 → 저장할 이벤트 또는 탭 전환 지시.
// 자체전에서 상대 편 골은 상대 편 탭에서 득점자를 골라 입력한다(저장 이벤트에 opponentGoal 은 없다).
export function planAddEvent(m, side, ev) {
  if (!isIntra(m)) return { kind: 'dispatch', event: { ...ev, side: 'A' } };
  if (ev.type === 'opponentGoal' || ev.type === 'opponentOwnGoal') return { kind: 'redirect', toSide: otherOf(side) };
  const event = { ...ev, side };
  if (ev.type === 'goal') event.concedeGk = fieldsOf(m, otherOf(side)).gk; // 실점한(=상대) 편 GK 스냅샷
  return { kind: 'dispatch', event };
}

// 삭제: 리듀서 DELETE 는 A 편 교체만 되돌린다(B 선수는 A 배치에 없어 no-op). B 편 교체는 여기서 되돌림 patch 를 만든다.
export function planDeleteEvent(m, matchIdx, eventId) {
  const actions = [{ type: 'DELETE_SOCCER_EVENT', matchIdx, eventId }];
  if (!isIntra(m)) return actions;
  const deleted = (m.events || []).find(e => e.id === eventId);
  if (deleted && deleted.type === 'sub' && deleted.side === 'B') {
    const reverted = revertSubInFormation(fieldsOfB(m), deleted);
    if (reverted) actions.push({ type: 'PATCH_SOCCER_SIDE', matchIdx, side: 'B', patch: reverted });
  }
  return actions;
}

// B 편 위치교대 — SWAP_SOCCER_LINEUP_POSITIONS 의 B 대응. positions 는 FORMATIONS 슬롯에서 주입한다.
export function sideBSwapPatch(m, aIdx, bIdx) {
  const b = fieldsOfB(m);
  const positions = (FORMATIONS[b.formation] || FORMATIONS["4-4-2"]).positions;
  const r = swapFormationSlots({ assignments: b.assignments || {}, positionMap: b.positionMap || {}, gk: b.gk, positions }, aIdx, bIdx);
  return { ...r, defenders: defendersFromPositionMap(r.positionMap) };
}

// B 편 라인업 정정 out→inn — CORRECT_SOCCER_LINEUP 의 B 대응. 이벤트 치환은 PATCH_SOCCER_SIDE.remapEvents 가 한다.
export function sideBCorrectPatch(m, out, inn) {
  const b = fieldsOfB(m);
  const rep = (v) => (v === out ? inn : v);
  const assignments = Object.fromEntries(Object.entries(b.assignments || {}).map(([k, v]) => [k, rep(v)]));
  const positionMap = {};
  for (const [name, role] of Object.entries(b.positionMap || {})) positionMap[rep(name)] = role;
  const lineup = b.lineup.map(rep);
  const subs = [...b.subs.filter(n => n !== inn && n !== out), out];
  return {
    patch: { lineup, assignments, positionMap, gk: rep(b.gk), subs, defenders: defendersFromPositionMap(positionMap) },
    remapEvents: [out, inn],
  };
}

// 레코더 onStateChange(updates) 중 편 상태로 저장할 키만.
export function pickSidePatch(updates) {
  const out = {};
  for (const k of SIDE_PATCH_KEYS) if (updates && updates[k] !== undefined) out[k] = updates[k];
  return out;
}
