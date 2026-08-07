export default function TennisConfirmBar({ unfinishedCourts, onFinalize, busy, C }) {
  return (
    <div style={{ position: 'sticky', bottom: 0, padding: 10, background: C.bg, borderTop: `1px solid ${C.grayDarker}` }}>
      {unfinishedCourts.length > 0 && (
        <div style={{ fontSize: 11, color: C.orange, marginBottom: 6 }}>
          미완료 {unfinishedCourts.length}개 — 마감 시 전송되지 않고 버려집니다: {unfinishedCourts.join(', ')}
        </div>
      )}
      <button disabled={busy} onClick={onFinalize}
        style={{ width: '100%', padding: 13, borderRadius: 8, border: 0, background: C.white, color: C.bg, fontWeight: 600 }}>
        {busy ? '전송 중...' : '경기 마감'}
      </button>
    </div>
  );
}
