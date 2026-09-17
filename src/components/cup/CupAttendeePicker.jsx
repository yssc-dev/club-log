// src/components/cup/CupAttendeePicker.jsx
// 컵 경기일 참석자 단계(스펙 §6.2 v2.1 5항): 대회 팀별 칩(기본 전원 참석)·토글·당일 추가.
// 상태는 부모(App)의 attendees/teams 가 진실 소스 — 여기서는 입력 초안만 들고 있다.
import { useState } from 'react';
import { useTheme } from '../../hooks/useTheme';

export default function CupAttendeePicker({ teams = [], teamNames = [], attendees = [], onToggle, onAddToTeam }) {
  const { C } = useTheme();
  const [drafts, setDrafts] = useState({}); // teamIdx → 입력 값

  const submit = (i) => {
    const name = (drafts[i] || '').trim();
    if (!name) return;
    onAddToTeam?.(i, name);
    setDrafts(d => ({ ...d, [i]: '' }));
  };

  const chip = (active) => ({
    display: "inline-flex", alignItems: "center", gap: 4, padding: "6px 10px", borderRadius: 999,
    background: active ? "var(--app-blue)" : "var(--app-bg-row-hover)", color: active ? "#fff" : "var(--app-text-primary)",
    border: "none", fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit",
  });

  return (
    <div data-role="cup-attendee-picker">
      {teams.map((raw, i) => {
        const players = raw || [];
        const present = players.filter(p => attendees.includes(p)).length;
        return (
          <div key={i} data-role="cup-team" data-team={i} className="app-row" style={{ flexDirection: "column", alignItems: "stretch", gap: 8, padding: "10px 12px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 14, fontWeight: 600 }}>{teamNames[i] || `팀 ${i + 1}`}</span>
              <span style={{ fontSize: 12, color: present === 0 ? "var(--app-orange)" : "var(--app-text-tertiary)" }}>
                {present}/{players.length}명 참석{present === 0 ? ' · 오늘 불참' : ''}
              </span>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {players.map(p => {
                const active = attendees.includes(p);
                return (
                  <button key={p} type="button" data-role="cup-attendee" data-name={p} aria-pressed={active}
                    onClick={() => onToggle?.(p)} style={chip(active)}>{p}</button>
                );
              })}
              {players.length === 0 && <span style={{ fontSize: 12, color: C.gray }}>팀원 없음</span>}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <input className="app-input" data-role="cup-guest-input" data-team={i} style={{ flex: 1 }} placeholder="당일 추가 (이름)"
                value={drafts[i] || ''} onChange={e => setDrafts(d => ({ ...d, [i]: e.target.value }))}
                onKeyDown={e => { if (e.key === 'Enter') submit(i); }} />
              <button type="button" data-role="cup-guest-add" data-team={i} onClick={() => submit(i)} style={{
                padding: "0 14px", borderRadius: 10, background: "var(--app-blue)", color: "#fff", border: "none",
                fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
              }}>추가</button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
