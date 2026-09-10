import { isIntra, fieldsOfA, fieldsOfB } from './sideView';

// 탭 side 의 FormationRecorder 에 넘길 attendees. 상대 편 피치 위 선수와 상대 편 퇴장자를 뺀다.
// 내 편 피치·내 편 퇴장자는 레코더 내부 getSubCandidates(attendees, assignments, events)가 내 시점 events 로 뺀다.
export function subPool(m, side, attendees) {
  if (!isIntra(m)) return attendees;
  const otherSide = side === 'A' ? 'B' : 'A';
  const other = side === 'A' ? fieldsOfB(m) : fieldsOfA(m);
  const onPitch = new Set(Object.values(other.assignments || {}).filter(Boolean));
  const expelled = new Set((m.events || [])
    .filter(e => (e.side || 'A') === otherSide && e.type === 'redCard')
    .map(e => e.player));
  return (attendees || []).filter(n => !onPitch.has(n) && !expelled.has(n));
}
