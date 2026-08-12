import { useState } from 'react';

function RuleToggle({ label, options, value, onPick, C, s }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
      <span style={{ flex: 1, fontSize: 12, color: C.gray }}>{label}</span>
      <div style={{ display: 'flex', gap: 4 }}>
        {options.map(([v, lbl]) => (
          <button key={String(v)} onClick={() => onPick(v)}
            style={{ ...s.btnSm(), padding: '5px 10px', fontSize: 12,
              background: v === value ? C.accent : C.cardLight,
              color: v === value ? '#fff' : C.gray }}>
            {lbl}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function TennisAttendeeSelector({ roster, attendees, guests, gameDate, dispatch, onStart, scoringRules, C, styles: s }) {
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
      <div style={{ ...s.card, marginTop: 14 }}>
        <div style={s.sectionTitle}>경기 규칙</div>
        <RuleToggle label="타이브레이크(5:5)"
          options={[['7point', '노애드 7점'], ['1point', '단판 1점']]}
          value={scoringRules?.tiebreakMode || '7point'}
          onPick={(v) => dispatch({ type: 'SET_SCORING_RULES', rules: { ...scoringRules, tiebreakMode: v } })}
          C={C} s={s} />
        <RuleToggle label="에이스·더블폴트"
          options={[[false, '분석 전용'], [true, '점수 반영']]}
          value={scoringRules?.acesDfAffectScore || false}
          onPick={(v) => dispatch({ type: 'SET_SCORING_RULES', rules: { ...scoringRules, acesDfAffectScore: v } })}
          C={C} s={s} />
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
