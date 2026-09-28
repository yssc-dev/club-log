import { useState, useEffect } from 'react';
import { useTheme } from '../../hooks/useTheme';
import { useBackNavigation } from '../../hooks/useBackNavigation';
import AppSync from '../../services/appSync';
import CreateTournament from './CreateTournament';
import TournamentDashboard from './TournamentDashboard';

export default function TournamentListTab({ teamName, ourTeamName, isAdmin, attendees, gameSettings, onTournamentView, onGoHome, onTournamentName }) {
  const { C } = useTheme();
  const [tournaments, setTournaments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [selectedTournament, setSelectedTournament] = useState(null);

  const loadList = () => { setLoading(true); AppSync.getTournamentList().then(list => setTournaments(list)).finally(() => setLoading(false)); };
  useEffect(() => { loadList(); }, []);
  useEffect(() => {
    if (onTournamentView) onTournamentView(!!selectedTournament);
    if (onTournamentName) onTournamentName(selectedTournament?.name || null);
  }, [selectedTournament]);
  // 브라우저 뒤로가기: 대회 상세가 열려 있으면 목록으로(TournamentDashboard 의 onBack 과 같은 동작).
  useBackNavigation(!!selectedTournament, () => { setSelectedTournament(null); loadList(); });

  const handleCreate = async (data) => {
    const result = await AppSync.createTournament(data);
    if (result?.success) { setCreating(false); loadList(); }
    else { alert("대회 생성 실패: " + (result?.error || "알 수 없는 오류")); }
  };

  const handleDelete = async (t, e) => {
    e.stopPropagation();
    if (!confirm(`"${t.name}" 대회를 삭제하시겠습니까?\n관련 시트(일정/이벤트로그/선수기록)도 함께 삭제됩니다.`)) return;
    if (!confirm("정말 삭제하시겠습니까? 되돌릴 수 없습니다.")) return;
    await AppSync.deleteTournament(t.id);
    loadList();
  };

  if (selectedTournament) {
    return <TournamentDashboard tournament={selectedTournament} ourTeamName={ourTeamName} gameSettings={gameSettings} isAdmin={isAdmin}
      onBack={() => { setSelectedTournament(null); loadList(); }} onGoHome={onGoHome} />;
  }

  if (creating) {
    return <div style={{ padding: "0 16px" }}><CreateTournament ourTeamName={ourTeamName} onSubmit={handleCreate} onCancel={() => setCreating(false)} /></div>;
  }

  const active = tournaments.filter(t => t.status === "active");
  const finished = tournaments.filter(t => t.status === "finished");

  return (
    <div style={{ padding: "0 16px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: C.white }}>대회</div>
        {isAdmin && <button onClick={() => setCreating(true)} style={{ padding: "6px 14px", borderRadius: 8, background: C.accent, color: C.bg, border: "none", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>+ 새 대회</button>}
      </div>
      {loading ? <div style={{ textAlign: "center", padding: 20, color: C.gray }}>불러오는 중...</div>
      : tournaments.length === 0 ? (
        <div style={{ textAlign: "center", padding: 30, color: C.gray }}>
          <div style={{ fontSize: 24, marginBottom: 8 }}>🏆</div>
          <div style={{ fontSize: 13 }}>등록된 대회가 없습니다</div>
          {isAdmin && <div style={{ fontSize: 11, marginTop: 4 }}>"+ 새 대회" 버튼으로 대회를 만들어보세요</div>}
        </div>
      ) : (
        <>
          {active.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, color: C.gray, fontWeight: 600, marginBottom: 6 }}>진행중</div>
              {active.map(t => (
                <div key={t.id} onClick={() => setSelectedTournament(t)} style={{ padding: "12px 14px", background: C.card, borderRadius: 10, marginBottom: 6, cursor: "pointer", borderLeft: `3px solid ${C.green}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: C.white }}>{t.name}</div>
                    <div style={{ fontSize: 11, color: C.gray, marginTop: 2 }}>{t.startDate} ~ {t.endDate} · {t.teams.length}팀 · {t.format}</div>
                  </div>
                  {isAdmin && <button onClick={(e) => handleDelete(t, e)} style={{ padding: "4px 8px", borderRadius: 6, background: `${C.red}20`, color: C.red, border: "none", fontSize: 10, fontWeight: 700, cursor: "pointer", flexShrink: 0 }}>삭제</button>}
                </div>
              ))}
            </div>
          )}
          {finished.length > 0 && (
            <div>
              <div style={{ fontSize: 12, color: C.gray, fontWeight: 600, marginBottom: 6 }}>완료</div>
              {finished.map(t => (
                <div key={t.id} onClick={() => setSelectedTournament(t)} style={{ padding: "12px 14px", background: C.cardLight, borderRadius: 10, marginBottom: 6, cursor: "pointer", opacity: 0.7 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: C.grayLight }}>{t.name}</div>
                  <div style={{ fontSize: 11, color: C.grayDark, marginTop: 2 }}>{t.startDate} ~ {t.endDate}</div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
