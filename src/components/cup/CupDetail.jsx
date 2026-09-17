// src/components/cup/CupDetail.jsx
// 대회 상세 — 스펙 §6.1: 시작·이어서·팀 관리·상태·삭제. 순위·TOP·대진·결과·잠금 로그 파생은 3단계.
import { useState } from 'react';
import { useTheme } from '../../hooks/useTheme';
import CupSync from '../../services/cupSync';
import { validateTeams, isLocked } from '../../utils/cup/cupEntity';
import { isCupSession } from '../../utils/cup/cupSession';
import CupTeamEditor from './CupTeamEditor';

export default function CupDetail({ teamName, cup, members, pendingGames = [], isAdmin, onStartGame, onContinueGame, onBack, onChanged }) {
  const { C } = useTheme();
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  // 팀이 하나도 없는 새 대회는 관리자에게 편집기를 바로 연다(요약할 것이 없으므로).
  const [editing, setEditing] = useState(() => isAdmin && (cup.teams?.length ?? 0) === 0);
  const locked = isLocked(cup);
  const active = cup.meta.status === 'active';
  const validation = validateTeams(cup.teams);
  const canStart = isAdmin && active && validation.ok;
  const pendingCup = pendingGames.find(g => isCupSession(g.state) && g.state.tournamentId === cup.meta.id);

  const run = async (fn) => {
    setBusy(true);
    try { await fn(); await onChanged?.(); }
    catch (e) { alert(`저장 실패: ${e?.message || e}`); }
    finally { setBusy(false); }
  };
  const handleSave = async (teams) => {
    setBusy(true); setSaving(true);
    try { await CupSync.saveTeams(teamName, cup.meta.id, teams); await onChanged?.(); setEditing(false); }
    catch (e) { alert(`저장 실패: ${e?.message || e}`); }
    finally { setSaving(false); setBusy(false); }
  };
  const toggleStatus = () => run(() => CupSync.setStatus(teamName, cup.meta.id, active ? 'finished' : 'active'));
  const handleDelete = () => {
    if (!confirm(`"${cup.meta.name}" 대회를 삭제할까요? 팀 구성이 사라집니다.`)) return;
    run(async () => { await CupSync.deleteCup(teamName, cup.meta.id); onBack?.(); });
  };

  const section = { padding: "0 20px", marginBottom: 18 };
  const title = { fontSize: 13, color: C.gray, marginBottom: 8, paddingLeft: 4 };
  const card = { background: C.card, borderRadius: 14, padding: 14, border: `1px solid ${C.borderColor}` };
  const btn = (bg, fg = "#fff", extra = {}) => ({ background: bg, color: fg, border: "none", borderRadius: 12, padding: "12px 16px", fontSize: 15, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", width: "100%", ...extra });

  return (
    <div>
      <div style={section}>
        <button onClick={onBack} style={{ background: "transparent", border: "none", color: C.accent, fontSize: 14, cursor: "pointer", padding: "4px 0", fontFamily: "inherit" }}>← 대회 목록</button>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: C.white }}>🏆 {cup.meta.name}</div>
          <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 999, background: active ? "rgba(52,199,89,0.15)" : "var(--app-bg-row)", color: active ? "var(--app-green)" : C.gray }}>{active ? '진행중' : '완료'}</span>
          {locked && <span style={{ fontSize: 11, color: "var(--app-orange)" }}>🔒 잠김</span>}
        </div>
        <div style={{ fontSize: 12, color: C.gray, marginTop: 4 }}>{cup.teams.length}팀 · 풀리그 1회전</div>
      </div>

      {pendingCup && (
        <div style={section}>
          <div style={{ ...card, background: "rgba(0,122,255,0.08)", border: "0.5px solid rgba(0,122,255,0.25)", cursor: "pointer" }} onClick={() => onContinueGame?.(pendingCup.gameId)}>
            <div style={{ fontSize: 14, fontWeight: 600, color: "var(--app-blue)" }}>진행 중인 컵 세션이 있습니다</div>
            <button style={{ ...btn("var(--app-blue)"), marginTop: 8 }}>이어서 기록</button>
          </div>
        </div>
      )}

      {isAdmin && (
        <div style={section}>
          <button disabled={!canStart || busy} onClick={() => onStartGame?.('cup', { cupId: cup.meta.id })}
            style={btn("var(--app-orange)", "#fff", { opacity: canStart && !busy ? 1 : 0.45 })}>오늘 컵 경기 시작</button>
          {!active && <div style={{ fontSize: 12, color: C.gray, marginTop: 6 }}>완료된 대회입니다. "다시 열기" 후 시작할 수 있습니다.</div>}
          {active && !validation.ok && <div style={{ fontSize: 12, color: "var(--app-red)", marginTop: 6 }}>{validation.errors.join(' · ')}</div>}
        </div>
      )}

      <div style={section}>
        <div style={title}>팀 관리</div>
        {!editing ? (
          <>
            <div data-role="team-summary-list">
              {cup.teams.map(t => {
                const players = t.players || [];
                return (
                  <div key={t.id} data-role="team-summary" data-team={t.id} style={{ ...card, marginBottom: 8 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: C.white }}>{t.name} <span style={{ fontSize: 12, color: C.gray, fontWeight: 400 }}>· {players.length}명</span></div>
                    <div style={{ fontSize: 12, color: C.gray, marginTop: 4 }}>{players.length ? players.map(p => (p === t.captain ? `★${p}` : p)).join(', ') : '팀원 없음'}</div>
                  </div>
                );
              })}
              {cup.teams.length === 0 && <div style={{ fontSize: 12, color: C.gray, padding: 4 }}>아직 팀이 없습니다</div>}
            </div>
            {locked && <div style={{ fontSize: 12, color: "var(--app-orange)", marginTop: 4 }}>🔒 첫 경기 마감 후 팀명·팀 수는 고정. 팀원·팀장은 편집 가능</div>}
            {isAdmin && <button data-role="team-edit" onClick={() => setEditing(true)} style={btn("var(--app-bg-row)", C.white, { marginTop: 8 })}>팀 편집</button>}
          </>
        ) : (
          <CupTeamEditor key={`${cup.meta.id}:${cup.meta.updatedAt}`} teams={cup.teams} members={members} locked={locked} disabled={!isAdmin} saving={saving} onSave={handleSave} onCancel={() => setEditing(false)} />
        )}
      </div>

      {isAdmin && (
        <div style={{ ...section, display: "flex", gap: 8 }}>
          <button disabled={busy} onClick={toggleStatus} style={btn("var(--app-bg-row)", C.white)}>{active ? '대회 종료' : '다시 열기'}</button>
          <button disabled={busy || locked} onClick={handleDelete} title={locked ? '경기 기록이 있는 대회는 삭제할 수 없습니다' : ''}
            style={btn("rgba(255,59,48,0.12)", "var(--app-red)", { opacity: locked ? 0.45 : 1 })}>대회 삭제</button>
        </div>
      )}
    </div>
  );
}
