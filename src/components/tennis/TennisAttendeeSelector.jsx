import { useState } from 'react';

export default function TennisAttendeeSelector({ roster, attendees, guests, gameDate, dispatch, onStart, C }) {
  const [guestName, setGuestName] = useState('');
  const toggle = (name) => dispatch({
    type: 'SET_ATTENDEES',
    attendees: attendees.includes(name) ? attendees.filter(n => n !== name) : [...attendees, name],
  });
  return (
    <div style={{ padding: 12 }}>
      <div style={{ fontSize: 13, marginBottom: 8 }}>{gameDate} · 참석자 {attendees.length}명</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {roster.map(m => {
          const on = attendees.includes(m.name);
          return (
            <button key={m.name} onClick={() => toggle(m.name)}
              style={{ borderRadius: 13, padding: '5px 10px', fontSize: 12,
                border: `1px solid ${C.grayDarker}`,
                background: on ? C.white : C.bg, color: on ? C.bg : C.white }}>
              {m.name} <span style={{ fontSize: 9, opacity: 0.65 }}>{m.grade}</span>
            </button>
          );
        })}
        {guests.map(g => (
          <span key={g} style={{ borderRadius: 13, padding: '5px 10px', fontSize: 12, background: C.grayDarker }}>
            {g} <span style={{ fontSize: 9 }}>용병</span>
          </span>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
        <input value={guestName} onChange={e => setGuestName(e.target.value)} placeholder="용병 이름"
          style={{ flex: 1, padding: 8 }} />
        <button onClick={() => {
          if (!guestName.trim()) return;
          dispatch({ type: 'ADD_ATTENDEE', name: guestName.trim(), isGuest: true });
          setGuestName('');
        }}>+ 용병</button>
      </div>
      <button disabled={attendees.length < 2} onClick={onStart}
        style={{ width: '100%', marginTop: 12, padding: 12, borderRadius: 8, border: 0,
          background: attendees.length >= 2 ? C.white : C.grayDarker,
          color: attendees.length >= 2 ? C.bg : C.gray, fontWeight: 600 }}>
        경기 시작
      </button>
    </div>
  );
}
