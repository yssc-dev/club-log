import { useState, useEffect } from 'react';
import TennisSync from '../../services/tennisSync';
import { nowKST } from '../../utils/tennis/tennisTime';

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
  const todayKST = nowKST().slice(0, 10);
  const [guestName, setGuestName] = useState('');
  const [dupCount, setDupCount] = useState(0);
  useEffect(() => {
    let alive = true;
    if (!gameDate) { setDupCount(0); return; }
    TennisSync.getPlayerGames(gameDate, gameDate).then(rows => {
      if (alive) setDupCount((rows || []).length);
    });
    return () => { alive = false; };
  }, [gameDate]);
  const toggle = (name) => dispatch({
    type: 'SET_ATTENDEES',
    attendees: attendees.includes(name) ? attendees.filter(n => n !== name) : [...attendees, name],
  });
  return (
    <div style={s.section}>
      <div style={{ ...s.card, marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13, color: C.gray }}>경기 날짜</span>
          <input type="date" value={gameDate || todayKST} max={todayKST}
            onChange={(e) => e.target.value && dispatch({ type: 'SET_GAME_DATE', date: e.target.value })}
            style={{ ...s.input, flex: 1, fontFamily: 'inherit' }} />
        </div>
        {dupCount > 0 && (
          <div style={{ fontSize: 12, color: C.orange, marginTop: 6 }}>
            이 날짜에 이미 {dupCount}판 기록됨 — 중복 입력에 주의하세요
          </div>
        )}
      </div>
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
          <span key={g} style={{ ...s.chip(true), cursor: 'default' }}>
            {g} <span style={{ fontSize: 10, opacity: 0.7 }}>용병</span>
          </span>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <input value={guestName} onChange={e => setGuestName(e.target.value)} placeholder="용병 이름"
          style={{ ...s.input, flex: 1, border: `1px solid ${C.grayDarker}` }} />
        <button onClick={() => {
          const name = guestName.trim();
          if (!name) return;
          // 회원 이름을 용병칸에 넣는 오입력 방지 — 용병은 세션 중 제거가 안 돼 회원이 갇힌다.
          if ((roster || []).some(m => m.name === name)) {
            alert(`${name}님은 회원입니다 — 위 명단에서 선택하세요.`);
            return;
          }
          dispatch({ type: 'ADD_ATTENDEE', name, isGuest: true });
          setGuestName('');
        }} style={s.btnSm()}>+ 용병</button>
      </div>
      <div style={{ ...s.card, marginTop: 14 }}>
        <div style={s.sectionTitle}>경기 규칙</div>
        <RuleToggle label="타이브레이크 시"
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
