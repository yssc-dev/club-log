export default function TennisConfirmBar({ unfinishedCourts, onFinalize, busy, C, styles: s }) {
  return (
    <div style={{ ...s.bottomBar, flexDirection: 'column', gap: 6 }}>
      {unfinishedCourts.length > 0 && (
        <div style={{ fontSize: 12, color: C.orange }}>
          미완료 {unfinishedCourts.length}개 — 마감 시 전송되지 않고 버려집니다: {unfinishedCourts.join(', ')}
        </div>
      )}
      <button disabled={busy} onClick={onFinalize}
        style={s.btnFull(busy ? C.cardLight : C.accent)}>
        {busy ? '전송 중...' : '경기 마감'}
      </button>
    </div>
  );
}
