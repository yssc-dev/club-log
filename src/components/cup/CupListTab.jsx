// src/components/cup/CupListTab.jsx
// 대시보드 "대회" 탭(풋살) — 스펙 §6.1: 대회 목록·생성·완료 접기 → CupDetail. 통산(개인 누적)은 3단계.
// tournamentActive/onTournamentView 계열은 쓰지 않는다(탭 바·헤더 유지, 목록↔상세는 내부 state).
import { useState, useEffect, useCallback } from 'react';
import { useTheme } from '../../hooks/useTheme';
import CupSync from '../../services/cupSync';
import CupDetail from './CupDetail';

export default function CupListTab({ teamName, members = [], pendingGames = [], isAdmin, authUserName, onStartGame, onContinueGame }) {
  const { C } = useTheme();
  const [cups, setCups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [showFinished, setShowFinished] = useState(false);

  const reload = useCallback(async () => {
    try { setError(null); setCups(await CupSync.listCups(teamName)); }
    catch (e) { setError(e?.message || '대회 목록을 불러오지 못했습니다'); }
    finally { setLoading(false); }
  }, [teamName]);
  useEffect(() => { let alive = true; setLoading(true); (async () => { if (alive) await reload(); })(); return () => { alive = false; }; }, [reload]);

  const handleCreate = async () => {
    try {
      const cup = await CupSync.createCup(teamName, { name: newName, createdBy: authUserName || '' });
      setCreating(false); setNewName('');
      await reload();
      setSelectedId(cup.meta.id);
    } catch (e) { alert(`대회 생성 실패: ${e?.message || e}`); }
  };

  const section = { padding: "0 20px", marginBottom: 18 };
  const title = { fontSize: 13, color: C.gray, marginBottom: 8, paddingLeft: 4 };
  const card = { background: C.card, borderRadius: 14, padding: 14, border: `1px solid ${C.borderColor}`, marginBottom: 8, width: "100%", textAlign: "left", cursor: "pointer", color: C.white, fontFamily: "inherit" };
  const input = { flex: 1, minWidth: 0, padding: "10px 12px", borderRadius: 10, border: `1px solid ${C.borderColor}`, background: "var(--app-bg-elevated)", color: C.white, fontSize: 15, fontFamily: "inherit" };
  const btn = (bg, fg = "#fff") => ({ background: bg, color: fg, border: "none", borderRadius: 10, padding: "10px 14px", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" });

  const selected = cups.find(c => c.meta.id === selectedId);
  if (selected) {
    return (
      <CupDetail teamName={teamName} cup={selected} members={members} pendingGames={pendingGames} isAdmin={isAdmin}
        onStartGame={onStartGame} onContinueGame={onContinueGame}
        onBack={() => setSelectedId(null)} onChanged={reload} />
    );
  }

  const activeCups = cups.filter(c => c.meta.status === 'active');
  const finishedCups = cups.filter(c => c.meta.status !== 'active');
  const cupCard = (c) => (
    <button key={c.meta.id} onClick={() => setSelectedId(c.meta.id)} style={card}>
      <div style={{ fontSize: 16, fontWeight: 700 }}>🏆 {c.meta.name}</div>
      <div style={{ fontSize: 12, color: C.gray, marginTop: 4 }}>{c.teams.length}팀 · {c.meta.status === 'active' ? '진행중' : '완료'}{c.meta.lockedAt ? ' · 🔒' : ''}</div>
    </button>
  );

  return (
    <div>
      {error && <div style={{ ...section, color: "var(--app-red)", fontSize: 13 }}>{error}</div>}
      <div style={section}>
        <div style={title}>진행중 대회</div>
        {loading ? <div style={{ color: C.gray, fontSize: 13, padding: 8 }}>불러오는 중…</div>
          : activeCups.length === 0 ? <div style={{ color: C.gray, fontSize: 13, padding: 8 }}>아직 대회가 없습니다</div>
          : activeCups.map(cupCard)}
        {isAdmin && !creating && <button onClick={() => setCreating(true)} style={{ ...btn("var(--app-orange)"), width: "100%", marginTop: 4 }}>+ 새 대회</button>}
        {isAdmin && creating && (
          <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
            <input data-role="new-cup-name" value={newName} placeholder="대회명 (예: 마스터스컵 2026)" onChange={e => setNewName(e.target.value)} style={input} />
            <button onClick={handleCreate} style={btn(C.green)}>만들기</button>
            <button onClick={() => { setCreating(false); setNewName(''); }} style={btn("var(--app-bg-row)", C.white)}>취소</button>
          </div>
        )}
      </div>
      {finishedCups.length > 0 && (
        <div style={section}>
          <button onClick={() => setShowFinished(v => !v)} style={{ ...title, background: "transparent", border: "none", cursor: "pointer", fontFamily: "inherit" }}>
            완료된 대회 ({finishedCups.length}) {showFinished ? '▾' : '▸'}
          </button>
          {showFinished && finishedCups.map(cupCard)}
        </div>
      )}
    </div>
  );
}
