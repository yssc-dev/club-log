import { useState } from 'react';

// 경기 중 참석명단 관리 모달 — 지각/용병 추가만 허용(제거 없음).
// TennisAttendeeSelector 구조를 따르되 "경기 시작" 버튼을 포함하지 않는다.
export default function TennisAttendeeModal({ roster, attendees, guests, dispatch, C, styles: s }) {
  const [guestName, setGuestName] = useState('');

  const notAttending = roster.filter(m => !attendees.includes(m.name));

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <div style={s.sectionTitle}>참석 중 ({attendees.length}명)</div>
        <div style={{ display: 'flex', flexWrap: 'wrap' }}>
          {attendees.map(name => (
            <span key={name} style={{ ...s.chip(true), cursor: 'default' }}>
              {name}
              {guests.includes(name) && <span style={{ fontSize: 10, opacity: 0.7 }}>용병</span>}
            </span>
          ))}
          {attendees.length === 0 && (
            <div style={{ color: C.gray, fontSize: 13 }}>참석자가 없습니다.</div>
          )}
        </div>
      </div>

      {notAttending.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={s.sectionTitle}>추가 가능 — 탭하면 참석으로 등록</div>
          <div style={{ display: 'flex', flexWrap: 'wrap' }}>
            {notAttending.map(m => (
              <button
                key={m.name}
                onClick={() => dispatch({ type: 'ADD_ATTENDEE', name: m.name, isGuest: false })}
                style={s.chip(false)}>
                {m.name}
                <span style={{ fontSize: 10, opacity: 0.7 }}>{m.grade}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        <input
          value={guestName}
          onChange={e => setGuestName(e.target.value)}
          placeholder="용병 이름"
          style={{ ...s.input, flex: 1 }}
        />
        <button
          onClick={() => {
            if (!guestName.trim()) return;
            dispatch({ type: 'ADD_ATTENDEE', name: guestName.trim(), isGuest: true });
            setGuestName('');
          }}
          style={s.btnSm()}>
          + 용병
        </button>
      </div>
      <div style={{ fontSize: 11, color: C.gray, lineHeight: 1.5 }}>
        코트에 배정된 선수는 여기서 제거할 수 없습니다. 해당 코트의 [설정 수정]을 이용하세요.
      </div>
    </div>
  );
}
