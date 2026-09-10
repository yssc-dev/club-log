import { isIntra, sideView } from './sideView';
import { getSoccerPlayedPlayers } from '../soccerScoring';

// 탭 side 의 FormationRecorder 에 넘길 attendees. 상대 편으로 뛴 선수 전원(선발·교체 투입·GK 교대·현재 배치)과
// 상대 편 퇴장자를 뺀다 — 교체 아웃된 선수가 내 편 후보로 새어 한 선수가 양 편 기록에 등장하는 것을 막는다.
// 내 편 피치·내 편 퇴장자는 레코더 내부 getSubCandidates(attendees, assignments, events)가 내 시점 events 로 뺀다.
export function subPool(m, side, attendees) {
  if (!isIntra(m)) return attendees;
  const otherSide = side === 'A' ? 'B' : 'A';
  const played = new Set(getSoccerPlayedPlayers(sideView(m, otherSide)));
  const expelled = new Set((m.events || [])
    .filter(e => (e.side || 'A') === otherSide && e.type === 'redCard')
    .map(e => e.player));
  return (attendees || []).filter(n => !played.has(n) && !expelled.has(n));
}
