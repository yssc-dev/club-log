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

// 라운드 삭제 게이트 — "마지막 라운드 + 미확정"만 허용한다.
// 기록(진행/완료 코트)이 들어 있어도 지울 수 있게 두되(확인 모달이 경고를 띄운다),
// 확정된 라운드는 확정취소를 한 번 거치게 해서 오터치 한 번으로 날아가지 않게 한다.
// 라운드가 1개뿐이면 거부 — 전부 지우려면 "경기삭제"가 따로 있다(rounds 빈 배열도 막힌다).
export function canDeleteRound(rounds, confirmedRounds, roundIdx, phase) {
  const rs = rounds || [];
  if (phase === 'done') return false;
  if (rs.length < 2) return false;
  if (!rs.some(r => r.roundIdx === roundIdx)) return false;
  const last = rs.reduce((m, r) => Math.max(m, r.roundIdx), 0);
  if (roundIdx !== last) return false;
  return (confirmedRounds || {})[roundIdx] !== true;
}
