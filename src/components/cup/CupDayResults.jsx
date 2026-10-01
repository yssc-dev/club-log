// src/components/cup/CupDayResults.jsx
// 경기일별 결과·참석 가점 내역(3단계 스펙 §5; 경기 단위 가점 배지는 폐지). calcCupStandings().days(date 오름차순)를 받아 최신 날짜가 위에
// 오도록 뒤집어 접이식 카드로 그린다. 첫(최신) 카드만 기본 펼침. 펼침 상태는 "기본값과 반대로 토글된 날짜"
// 집합으로 들고 있어 days 가 바뀌어도(재조회) 상태를 재설정할 필요가 없다.
import { useState } from 'react';
import { useTheme } from '../../hooks/useTheme';

export default function CupDayResults({ days = [] }) {
  const { C } = useTheme();
  const [toggled, setToggled] = useState(() => new Set());
  const flip = (date) => setToggled(prev => { const n = new Set(prev); if (n.has(date)) n.delete(date); else n.add(date); return n; });
  const ordered = [...days].reverse();
  const card = { background: C.card, borderRadius: 14, padding: 12, border: `1px solid ${C.borderColor}`, marginBottom: 8 };
  const toggleBtn = { background: "transparent", border: "none", color: C.white, fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", padding: 0, width: "100%", textAlign: "left" };

  return (
    <div>
      {ordered.map((day, i) => {
        const isOpen = (i === 0) !== toggled.has(day.date);
        const teams = Object.entries(day.teams || {}).map(([name, t]) => ({ name, ...t }))
          .sort((a, b) => a.name.localeCompare(b.name, 'ko'));
        return (
          <div key={day.date} data-role="cup-day" data-date={day.date} style={card}>
            <button data-role="cup-day-toggle" aria-expanded={isOpen} onClick={() => flip(day.date)} style={toggleBtn}>
              {day.date} · {day.matches.length}경기 {isOpen ? '▾' : '▸'}
            </button>
            {isOpen && (
              <div style={{ marginTop: 8 }}>
                {day.matches.map(m => (
                  <div key={m.key} data-role="cup-day-match" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "4px 0", fontSize: 13, color: C.white, borderTop: `1px solid ${C.borderColor}` }}>
                    <span style={{ flex: 1, textAlign: "right" }}>{m.home}</span>
                    <span style={{ fontWeight: 700, minWidth: 48, textAlign: "center" }}>{m.homeScore} : {m.awayScore}</span>
                    <span style={{ flex: 1, textAlign: "left" }}>{m.away}</span>
                  </div>
                ))}
                <div style={{ marginTop: 8, fontSize: 12, color: C.gray }}>
                  {teams.map(t => (
                    <div key={t.name} data-role="cup-day-team" data-team={t.name} style={{ padding: "2px 0" }}>
                      {t.name}{' '}
                      {t.registered ? `등록 ${t.present}명 참석` : '미등록 팀'}
                      {t.guests.length > 0 && ` + 용병 ${t.guests.length}명(${t.guests.join(', ')})`}
                      {t.registered && (t.bonusAttend ? <span style={{ color: "var(--app-green)", marginLeft: 4 }}>✓ +{t.bonusAttend}</span> : <span style={{ marginLeft: 4 }}>✗</span>)}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
