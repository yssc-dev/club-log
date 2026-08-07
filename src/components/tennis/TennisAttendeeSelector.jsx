import { useState } from 'react';

export default function TennisAttendeeSelector({ roster, attendees, guests, gameDate, dispatch, onStart, C, styles: s }) {
  const [guestName, setGuestName] = useState('');
  const toggle = (name) => dispatch({
    type: 'SET_ATTENDEES',
    attendees: attendees.includes(name) ? attendees.filter(n => n !== name) : [...attendees, name],
  });
  return (
    <div style={s.section}>
      <div style={s.sectionTitle}>{gameDate} · 참석자 {attendees.length}명</div>
      <div style={{ display: 'flex', flexWrap: 'wrap' }}>
        {roster.map(m => {
          const on = attendees.includes(m.name);
          return (
            <button key={m.name} onClick={() => toggle(m.name)}
              style={s.chip(on)}>
              {m.name} <span style={{ fontSize: 10, opacity: 0.7 }}>{m.grade}</span>
            </button>
          );
        })}
        {guests.map(g => (
          <span key={g} style={{ ...s.chip(false), cursor: 'default' }}>
            {g} <span style={{ fontSize: 10, opacity: 0.7 }}>용병</span>
          </span>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <input value={guestName} onChange={e => setGuestName(e.target.value)} placeholder="용병 이름"
          style={{ ...s.input, flex: 1 }} />
        <button onClick={() => {
          if (!guestName.trim()) return;
          dispatch({ type: 'ADD_ATTENDEE', name: guestName.trim(), isGuest: true });
          setGuestName('');
        }} style={s.btnSm()}>+ 용병</button>
      </div>
      <button disabled={attendees.length < 2} onClick={onStart}
        style={{
          ...s.btnFull(attendees.length >= 2 ? C.accent : C.cardLight),
          marginTop: 16,
          opacity: attendees.length >= 2 ? 1 : 0.5,
        }}>
        경기 시작
      </button>
    </div>
  );
}
