// src/components/cup/CupTeamEditor.jsx
// 컵 팀 관리 편집기 — 스펙 §4.5. 로컬 사본을 편집하고 저장 시 validateTeams 를 통과한 팀 배열만 onSave 에 넘긴다.
// 잠기면(locked) 팀명·팀 추가/삭제는 비활성, 팀원·팀장은 계속 편집 가능. disabled(비관리자)면 읽기 전용.
import { useState, useMemo } from 'react';
import { useTheme } from '../../hooks/useTheme';
import { validateTeams, nextTeamId, cleanPlayerName } from '../../utils/cup/cupEntity';

export default function CupTeamEditor({ teams, members = [], locked = false, disabled = false, saving = false, onSave }) {
  const { C } = useTheme();
  // 원격 값을 useState 초기값으로 직접 쓰지 않는다 — 편집기는 열릴 때의 스냅샷을 로컬 사본으로 만든다(스펙 §4.5).
  const [draft, setDraft] = useState(() => (teams || []).map(t => ({ ...t, players: [...(t.players || [])] })));
  const [errors, setErrors] = useState([]);
  const [freeText, setFreeText] = useState({});   // teamId → 자유 입력 값
  const [search, setSearch] = useState('');

  const assigned = useMemo(() => new Set(draft.flatMap(t => t.players)), [draft]);
  const candidates = useMemo(() => {
    const q = search.trim();
    return (members || []).map(cleanPlayerName).filter(Boolean).filter(m => !assigned.has(m)).filter(m => !q || m.includes(q));
  }, [members, assigned, search]);

  const canEditStructure = !disabled && !locked;
  const canEditMembers = !disabled;

  const patchTeam = (id, patch) => setDraft(d => d.map(t => (t.id === id ? { ...t, ...patch } : t)));
  const addTeam = () => setDraft(d => [...d, { id: nextTeamId(d), name: '', captain: '', players: [], order: d.length }]);
  const removeTeam = (id) => setDraft(d => d.filter(t => t.id !== id).map((t, i) => ({ ...t, order: i })));
  const addPlayer = (id, name) => {
    const n = cleanPlayerName(name);
    if (!n) return;
    setDraft(d => d.map(t => (t.id === id && !t.players.includes(n) ? { ...t, players: [...t.players, n] } : t)));
  };
  const removePlayer = (id, name) => setDraft(d => d.map(t => (t.id === id
    ? { ...t, players: t.players.filter(p => p !== name), captain: t.captain === name ? '' : t.captain }
    : t)));

  const handleSave = () => {
    const v = validateTeams(draft);
    setErrors(v.errors);
    if (!v.ok) return;
    onSave?.(v.teams);
  };

  const card = { background: C.card, borderRadius: 14, padding: 12, border: `1px solid ${C.borderColor}`, marginBottom: 10 };
  const input = { flex: 1, minWidth: 0, padding: "8px 10px", borderRadius: 8, border: `1px solid ${C.borderColor}`, background: "var(--app-bg-elevated)", color: C.white, fontSize: 14, fontFamily: "inherit" };
  const chip = (active) => ({ display: "inline-flex", alignItems: "center", gap: 4, padding: "4px 8px", borderRadius: 999, fontSize: 12, margin: 2, background: active ? "rgba(255,149,0,0.16)" : "var(--app-bg-row)", color: active ? "var(--app-orange)" : C.white, border: "none", cursor: "pointer", fontFamily: "inherit" });
  const smallBtn = (bg, fg = "#fff") => ({ background: bg, color: fg, border: "none", borderRadius: 8, padding: "6px 10px", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" });

  return (
    <div>
      {locked && (
        <div style={{ ...card, background: "rgba(255,149,0,0.10)", color: "var(--app-orange)", fontSize: 12 }}>
          🔒 첫 경기 마감 후 팀명·팀 수는 바꿀 수 없습니다. 팀원·팀장은 수정할 수 있습니다.
        </div>
      )}
      {draft.map(t => (
        <div key={t.id} style={card}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
            {/* input value 는 DOM textContent 에 나타나지 않아 화면 확인용 라벨을 별도로 둔다 */}
            <span style={{ fontSize: 13, fontWeight: 700, color: C.white }}>{t.name}</span>
            <input data-role="team-name" value={t.name} disabled={!canEditStructure} placeholder="팀명"
              onChange={e => patchTeam(t.id, { name: e.target.value })} style={input} />
            <button data-role="team-remove" disabled={!canEditStructure} onClick={() => removeTeam(t.id)}
              style={{ ...smallBtn("rgba(255,59,48,0.12)", "var(--app-red)"), opacity: canEditStructure ? 1 : 0.4 }}>삭제</button>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", marginBottom: 6 }}>
            {t.players.map(p => (
              <button key={p} data-role="member-chip" disabled={!canEditMembers} title="탭: 팀장 지정 / ✕: 제외"
                onClick={() => patchTeam(t.id, { captain: t.captain === p ? '' : p })} style={chip(t.captain === p)}>
                {t.captain === p ? 'Ⓒ ' : ''}{p}
                {canEditMembers && <span data-role="member-remove" onClick={(e) => { e.stopPropagation(); removePlayer(t.id, p); }} style={{ marginLeft: 4, color: C.gray }}>✕</span>}
              </button>
            ))}
            {t.players.length === 0 && <span style={{ fontSize: 12, color: C.gray, padding: 4 }}>팀원 없음</span>}
          </div>
          {canEditMembers && (
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <input data-role="free-add" value={freeText[t.id] || ''} placeholder="이름 직접 입력"
                onChange={e => setFreeText(f => ({ ...f, [t.id]: e.target.value }))} style={input} />
              <button data-role="free-add-btn" onClick={() => { addPlayer(t.id, freeText[t.id]); setFreeText(f => ({ ...f, [t.id]: '' })); }}
                style={smallBtn(C.accent, C.bg)}>추가</button>
            </div>
          )}
          {canEditMembers && candidates.length > 0 && (
            <div style={{ marginTop: 6 }}>
              <div style={{ fontSize: 11, color: C.gray, marginBottom: 2 }}>회원에서 추가</div>
              <div style={{ display: "flex", flexWrap: "wrap" }}>
                {candidates.slice(0, 30).map(m => (
                  <button key={m} data-role="member-add" data-team={t.id} onClick={() => addPlayer(t.id, m)} style={chip(false)}>+ {m}</button>
                ))}
              </div>
            </div>
          )}
        </div>
      ))}
      {canEditMembers && (
        <input value={search} placeholder="회원 검색" onChange={e => setSearch(e.target.value)} style={{ ...input, width: "100%", marginBottom: 8 }} />
      )}
      {errors.length > 0 && (
        <div style={{ ...card, background: "rgba(255,59,48,0.10)", color: "var(--app-red)", fontSize: 12 }}>
          {errors.map((e, i) => <div key={i}>• {e}</div>)}
        </div>
      )}
      {!disabled && (
        <div style={{ display: "flex", gap: 8 }}>
          <button disabled={!canEditStructure} onClick={addTeam} style={{ ...smallBtn("var(--app-bg-row)", C.white), flex: 1, padding: 10, opacity: canEditStructure ? 1 : 0.4 }}>+ 팀 추가</button>
          <button disabled={saving} onClick={handleSave} style={{ ...smallBtn(C.green), flex: 1, padding: 10 }}>{saving ? '저장 중…' : '저장'}</button>
        </div>
      )}
    </div>
  );
}
