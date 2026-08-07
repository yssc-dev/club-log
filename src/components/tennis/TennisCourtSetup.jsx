// 코트 배치. 토글이 슬롯 수를 결정한다 — 단식 좌우 1칸, 복식 2칸.
// 인원으로 단복식을 역추론하지 않는다.
export default function TennisCourtSetup({ court, roundIdx, attendees, usedNames, dispatch, C, styles: s, canDelete }) {
  const slots = court.format === '복식' ? 2 : 1;
  const key = { roundIdx, courtId: court.courtId };
  const ready = court.sideA.length === slots && court.sideB.length === slots;

  const Slot = ({ side, idx }) => {
    const name = (side === 'A' ? court.sideA : court.sideB)[idx];
    return (
      <div style={{
        background: C.cardLight, borderRadius: 10, minHeight: 38,
        display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 6,
        border: name ? '1.5px solid transparent' : `1.5px dashed ${C.grayDarker}`,
      }}>
        {name ? (
          <button onClick={() => dispatch({ type: 'REMOVE_PLAYER', ...key, name })}
            style={s.chip(true)}>
            {name} ×
          </button>
        ) : <span style={{ color: C.gray, fontSize: 12 }}>칩을 탭</span>}
      </div>
    );
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        <Segmented value={court.format} options={['단식', '복식']} C={C}
          onChange={(v) => dispatch({ type: 'SET_COURT_FORMAT', ...key, format: v })} />
        <Segmented value={String(court.bestOf)} options={['1', '3']} labels={['1세트', '3세트']} C={C}
          onChange={(v) => dispatch({ type: 'SET_COURT_BEST_OF', ...key, bestOf: Number(v) })} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 32px 1fr', marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 11, color: C.gray, textAlign: 'center', marginBottom: 6, fontWeight: 600 }}>A편</div>
          {Array.from({ length: slots }, (_, i) => <Slot key={i} side="A" idx={i} />)}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.gray, fontSize: 12 }}>vs</div>
        <div>
          <div style={{ fontSize: 11, color: C.gray, textAlign: 'center', marginBottom: 6, fontWeight: 600 }}>B편</div>
          {Array.from({ length: slots }, (_, i) => <Slot key={i} side="B" idx={i} />)}
        </div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', marginBottom: 12 }}>
        {attendees.map(n => {
          const used = usedNames.has(n);
          return (
            <button key={n} disabled={used}
              onClick={() => dispatch({ type: 'ASSIGN_PLAYER', ...key, name: n })}
              style={{ ...s.chip(!used), opacity: used ? 0.4 : 1, cursor: used ? 'default' : 'pointer' }}>
              {n}
            </button>
          );
        })}
      </div>

      <div style={{ display: 'flex', gap: 6 }}>
        <button onClick={() => dispatch({ type: 'SWAP_SIDES', ...key })}
          style={s.btnSm()}>⇄ 좌우</button>
        <button disabled={!ready} onClick={() => dispatch({ type: 'START_COURT', ...key })}
          style={{
            ...s.btnFull(ready ? C.accent : C.cardLight),
            flex: 1, opacity: ready ? 1 : 0.5,
          }}>
          {ready ? '시작' : `시작 (${slots * 2 - court.sideA.length - court.sideB.length}명 더)`}
        </button>
        {canDelete && (
          <button onClick={() => dispatch({ type: 'DELETE_COURT', ...key })}
            style={s.btnSm(C.red, '#fff')}>삭제</button>
        )}
      </div>
    </div>
  );
}

function Segmented({ value, options, labels, onChange, C }) {
  return (
    <div style={{ flex: 1, display: 'flex', background: C.cardLight, borderRadius: 10, padding: 2 }}>
      {options.map((o, i) => (
        <button key={o} onClick={() => onChange(o)}
          style={{
            flex: 1, padding: '6px 0', fontSize: 12, borderRadius: 8, border: 0,
            background: value === o ? C.card : 'transparent',
            color: value === o ? C.white : C.gray,
            fontWeight: value === o ? 600 : 400,
            cursor: 'pointer',
          }}>{labels ? labels[i] : o}</button>
      ))}
    </div>
  );
}
