import { isRoundComplete, unfinishedCourtLabels } from '../../utils/tennis/roundConfirm';

// 하단 고정 바 — 보는 라운드의 확정 상태에 따라 3가지 모습.
//   미확정+전 코트 완료 → [라운드 N 확정]
//   미확정+미완료 존재 → 비활성 + 미완료 코트 안내 (자동 폐기 없음 — 스펙 §2)
//   확정됨           → [라운드 N 확정취소]
export default function TennisConfirmBar({ round, isConfirmed, onConfirm, onUnconfirm, canAddRound, onAddRound, C, styles: s }) {
  if (!round) return null;
  const complete = isRoundComplete(round);
  const unfinished = unfinishedCourtLabels(round);

  if (isConfirmed) {
    return (
      <div style={{ ...s.bottomBar, flexDirection: 'column', gap: 6 }}>
        {canAddRound && (
          <button onClick={onAddRound} style={s.btnFull(C.accent)}>
            + 다음 라운드 시작
          </button>
        )}
        <button onClick={onUnconfirm}
          style={canAddRound
            ? { ...s.btnSm(), alignSelf: 'center', background: 'transparent', color: C.gray }
            : s.btnFull(C.orange)}>
          라운드 {round.roundIdx} 확정취소
        </button>
      </div>
    );
  }
  return (
    <div style={{ ...s.bottomBar, flexDirection: 'column', gap: 6 }}>
      {!complete && (
        <div style={{ fontSize: 12, color: C.orange }}>
          미완료 코트: {unfinished.join(', ')} — 삭제하거나 기록을 완료해야 확정할 수 있습니다
        </div>
      )}
      <button disabled={!complete} onClick={onConfirm}
        style={{ ...s.btnFull(complete ? C.accent : C.cardLight), opacity: complete ? 1 : 0.6 }}>
        라운드 {round.roundIdx} 확정
      </button>
    </div>
  );
}
