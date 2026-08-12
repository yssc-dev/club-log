// 라운드 확정 게이트 판정. 리듀서와 화면이 같은 판정을 쓰도록 순수 함수로 분리한다.
// confirmedRounds는 RTDB 왕복 후에도 normalizeTennisMatch가 객체로 보정해 준다는 전제.
export function isRoundComplete(round) {
  const courts = round?.courts || [];
  return courts.length > 0 && courts.every(c => c.status === 'done');
}

export function unfinishedCourtLabels(round) {
  return (round?.courts || []).filter(c => c.status !== 'done').map(c => `C${c.courtId}`);
}

export function allRoundsConfirmed(rounds, confirmedRounds) {
  const rs = rounds || [];
  const cf = confirmedRounds || {};
  return rs.length > 0 && rs.every(r => cf[r.roundIdx] === true);
}

export function isLastRoundConfirmed(rounds, confirmedRounds) {
  const rs = rounds || [];
  if (rs.length === 0) return false;
  const last = rs.reduce((m, r) => Math.max(m, r.roundIdx), 0);
  return (confirmedRounds || {})[last] === true;
}
