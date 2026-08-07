// 코트 배치. 토글이 슬롯 수를 결정한다 — 단식 좌우 1칸, 복식 2칸.
// 인원으로 단복식을 역추론하지 않는다.
export default function TennisCourtSetup({ court, roundIdx, attendees, usedNames, dispatch, C, canDelete }) {
  const slots = court.format === '복식' ? 2 : 1;
  const key = { roundIdx, courtId: court.courtId };
  const ready = court.sideA.length === slots && court.sideB.length === slots;

  const Slot = ({ side, idx }) => {
    const name = (side === 'A' ? court.sideA : court.sideB)[idx];
    return (
      <div style={{
        border: name ? '1.5px solid transparent' : '1.5px dashed var(--app-divider)',
        borderRadius: 9, minHeight: 34, display: 'flex', alignItems: 'center',
        justifyContent: 'center', marginBottom: 5,
      }}>
        {name ? (
          <button onClick={() => dispatch({ type: 'REMOVE_PLAYER', ...key, name })}
            style={{ background: C.white, color: C.bg, borderRadius: 13, padding: '4px 9px', border: 0, fontSize: 11 }}>
            {name} ×
          </button>
        ) : <span style={{ color: C.gray, fontSize: 10 }}>칩을 탭</span>}
      </div>
    );
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 9 }}>
        <Segmented value={court.format} options={['단식', '복식']} C={C}
          onChange={(v) => dispatch({ type: 'SET_COURT_FORMAT', ...key, format: v })} />
        <Segmented value={String(court.bestOf)} options={['1', '3']} labels={['1세트', '3세트']} C={C}
          onChange={(v) => dispatch({ type: 'SET_COURT_BEST_OF', ...key, bestOf: Number(v) })} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 26px 1fr' }}>
        <div>
          <div style={{ fontSize: 9.5, color: C.gray, textAlign: 'center', marginBottom: 4 }}>A편</div>
          {Array.from({ length: slots }, (_, i) => <Slot key={i} side="A" idx={i} />)}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.gray, fontSize: 10 }}>vs</div>
        <div>
          <div style={{ fontSize: 9.5, color: C.gray, textAlign: 'center', marginBottom: 4 }}>B편</div>
          {Array.from({ length: slots }, (_, i) => <Slot key={i} side="B" idx={i} />)}
        </div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, margin: '9px 0' }}>
        {attendees.map(n => {
          const used = usedNames.has(n);
          return (
            <button key={n} disabled={used}
              onClick={() => dispatch({ type: 'ASSIGN_PLAYER', ...key, name: n })}
              style={{
                borderRadius: 13, padding: '4px 9px', fontSize: 11,
                border: `1px solid ${C.grayDarker}`,
                background: used ? C.grayDarker : C.bg,
                color: used ? C.gray : C.white,
              }}>{n}</button>
          );
        })}
      </div>

      <div style={{ display: 'flex', gap: 6 }}>
        <button onClick={() => dispatch({ type: 'SWAP_SIDES', ...key })}
          style={{ flex: '0 0 auto', padding: '8px 10px', fontSize: 11 }}>⇄ 좌우</button>
        <button disabled={!ready} onClick={() => dispatch({ type: 'START_COURT', ...key })}
          style={{ flex: 1, padding: 10, borderRadius: 8, fontWeight: 600, border: 0,
            background: ready ? C.white : C.grayDarker, color: ready ? C.bg : C.gray }}>
          {ready ? '시작' : `시작 (${slots * 2 - court.sideA.length - court.sideB.length}명 더)`}
        </button>
        {canDelete && (
          <button onClick={() => dispatch({ type: 'DELETE_COURT', ...key })}
            style={{ flex: '0 0 auto', padding: '8px 10px', fontSize: 11, color: C.red }}>삭제</button>
        )}
      </div>
    </div>
  );
}

function Segmented({ value, options, labels, onChange, C }) {
  return (
    <div style={{ flex: 1, display: 'flex', background: C.grayDarker, borderRadius: 8, padding: 2 }}>
      {options.map((o, i) => (
        <button key={o} onClick={() => onChange(o)}
          style={{
            flex: 1, padding: '5px 0', fontSize: 10.5, borderRadius: 6, border: 0,
            background: value === o ? C.bg : 'transparent',
            color: value === o ? C.white : C.gray,
            fontWeight: value === o ? 600 : 400,
          }}>{labels ? labels[i] : o}</button>
      ))}
    </div>
  );
}
