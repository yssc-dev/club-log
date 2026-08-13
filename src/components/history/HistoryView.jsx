import { useState, useEffect, useMemo } from 'react';
import FirebaseSync from '../../services/firebaseSync';
import { useTheme } from '../../hooks/useTheme';
import { TEAM_COLORS } from '../../config/constants';
import { calcMatchScore } from '../../utils/scoring';
import { getEffectiveSettings } from '../../config/settings';
import { countFinishedSoccerMatches } from '../../utils/soccerScoring';
import SoccerArchiveDetail from './SoccerArchiveDetail';
import TennisResultsModal from '../tennis/TennisResultsModal';
import { makeStyles } from '../../styles/theme';

function calcStandings(completedMatches, teamNames) {
  const stats = {};
  teamNames.forEach((t, i) => { stats[t] = { idx: i, games: 0, wins: 0, draws: 0, losses: 0, gf: 0, ga: 0, points: 0 }; });
  completedMatches.forEach(m => {
    if (m.isExtra || !stats[m.homeTeam] || !stats[m.awayTeam]) return;
    stats[m.homeTeam].games++; stats[m.awayTeam].games++;
    stats[m.homeTeam].gf += m.homeScore; stats[m.homeTeam].ga += m.awayScore;
    stats[m.awayTeam].gf += m.awayScore; stats[m.awayTeam].ga += m.homeScore;
    if (m.homeScore > m.awayScore) { stats[m.homeTeam].wins++; stats[m.homeTeam].points += 3; stats[m.awayTeam].losses++; }
    else if (m.awayScore > m.homeScore) { stats[m.awayTeam].wins++; stats[m.awayTeam].points += 3; stats[m.homeTeam].losses++; }
    else { stats[m.homeTeam].draws++; stats[m.awayTeam].draws++; stats[m.homeTeam].points++; stats[m.awayTeam].points++; }
  });
  return Object.entries(stats).map(([name, s]) => ({ name, ...s })).sort((a, b) => (b.points - a.points) || ((b.gf - b.ga) - (a.gf - a.ga)) || (b.gf - a.gf));
}

function calcPlayerStats(allEvents, completedMatches, attendees, teams, teamNames, es) {
  const { ownGoalPoint, crovaPoint, gogumaPoint, useCrovaGoguma } = es;
  const pStats = {};
  attendees.forEach(p => { pStats[p] = { goals: 0, assists: 0, owngoals: 0, conceded: 0, keeperGames: 0, cleanSheets: 0 }; });
  allEvents.forEach(e => {
    if (e.type === "goal") { if (pStats[e.player]) pStats[e.player].goals++; if (e.assist && pStats[e.assist]) pStats[e.assist].assists++; if (e.concedingGk && pStats[e.concedingGk]) pStats[e.concedingGk].conceded++; }
    if (e.type === "owngoal") { if (pStats[e.player]) pStats[e.player].owngoals++; if (e.concedingGk && pStats[e.concedingGk]) pStats[e.concedingGk].conceded += 2; }
  });
  completedMatches.forEach(m => {
    if (m.homeGk && pStats[m.homeGk]) { pStats[m.homeGk].keeperGames++; if (m.awayScore === 0) pStats[m.homeGk].cleanSheets++; }
    if (m.awayGk && pStats[m.awayGk]) { pStats[m.awayGk].keeperGames++; if (m.homeScore === 0) pStats[m.awayGk].cleanSheets++; }
  });
  const getTeam = (player) => { for (let i = 0; i < teams.length; i++) { if (teams[i].includes(player)) return teamNames[i]; } return ""; };
  // 크로바/고구마: 1위팀 전원 crova, 꼴찌팀 전원 goguma
  const standings = calcStandings(completedMatches, teamNames);
  const firstTeam = standings[0]?.name || "";
  const lastTeam = standings[standings.length - 1]?.name || "";
  return attendees.map(p => {
    const st = pStats[p] || {};
    const pt = getTeam(p);
    const crova = useCrovaGoguma && pt === firstTeam ? (crovaPoint || 1) : 0;
    const goguma = useCrovaGoguma && pt === lastTeam ? (gogumaPoint || -1) : 0;
    const total = (st.goals || 0) + (st.assists || 0) + (st.owngoals || 0) * ownGoalPoint + (st.cleanSheets || 0) + crova + goguma;
    return { name: p, team: pt, ...st, crova, goguma, total };
  }).sort((a, b) => {
    const d = b.total - a.total;
    if (d !== 0) return d;
    const gd = b.goals - a.goals;
    if (gd !== 0) return gd;
    return b.assists - a.assists;
  });
}

function formatDate(dateStr) {
  if (!dateStr) return "";
  // Date 객체인 경우
  if (dateStr instanceof Date || (typeof dateStr === "object" && dateStr.getFullYear)) {
    return `${dateStr.getFullYear()}/${dateStr.getMonth() + 1}/${dateStr.getDate()}`;
  }
  const s = String(dateStr);
  // "Fri Mar 27 2026 ..." 같은 raw Date string
  const parsed = new Date(s);
  if (!isNaN(parsed.getTime()) && s.length > 10) {
    return `${parsed.getFullYear()}/${parsed.getMonth() + 1}/${parsed.getDate()}`;
  }
  // "2026-04-03" 형식
  const d = s.split("-");
  if (d.length === 3) return `${d[0]}/${+d[1]}/${+d[2]}`;
  return s;
}

export default function HistoryView({ teamContext, onBack }) {
  const { C } = useTheme();
  const [loading, setLoading] = useState(true);
  const [history, setHistory] = useState([]);
  const [trash, setTrash] = useState([]);
  const [view, setView] = useState("active"); // "active" | "trash"
  const [selectedGame, setSelectedGame] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const team = teamContext?.team;

  const sortByDateDesc = (data) => [...data].sort((a, b) => {
    const da = new Date(a.gameDate), db = new Date(b.gameDate);
    if (!isNaN(da) && !isNaN(db)) return db - da;
    return String(b.gameDate || "").localeCompare(String(a.gameDate || ""));
  });

  const reload = () => {
    if (!team) { setLoading(false); return; }
    setLoading(true);
    Promise.all([
      FirebaseSync.loadFinalizedList(team),
      FirebaseSync.loadTrashedFinalized(team),
    ]).then(([active, trashed]) => {
      setHistory(sortByDateDesc(active));
      setTrash(sortByDateDesc(trashed));
    }).finally(() => setLoading(false));
  };

  useEffect(() => { reload(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [team]);

  const handleSelect = async (h) => {
    setDetailLoading(true);
    try {
      const stateJson = await FirebaseSync.loadFinalizedOne(team, h.gameId);
      setSelectedGame({ ...h, stateJson: stateJson || "" });
    } finally {
      setDetailLoading(false);
    }
  };

  const hs = {
    container: { background: C.bg, minHeight: "100vh", color: C.white, fontFamily: "'Pretendard', -apple-system, BlinkMacSystemFont, sans-serif", maxWidth: 500, margin: "0 auto" },
    header: { background: C.headerBg, padding: "16px", textAlign: "center", position: "sticky", top: 0, zIndex: 100 },
    card: { background: C.card, borderRadius: 12, padding: 14, marginBottom: 10 },
    th: { fontSize: 10, color: C.gray, fontWeight: 600, padding: "4px 3px", textAlign: "center", borderBottom: `1px solid ${C.grayDark}` },
    td: (highlight) => ({ fontSize: 12, fontWeight: highlight ? 700 : 400, padding: "5px 3px", textAlign: "center", color: C.white }),
  };

  if (loading) {
    return (
      <div style={{ ...hs.container, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
        <div style={{ color: C.gray, fontSize: 14 }}>과거 경기 불러오는 중...</div>
      </div>
    );
  }

  if (selectedGame) {
    let gs = null;
    try { gs = JSON.parse(selectedGame.stateJson); } catch (e) { /* ignore */ }

    const matches = gs?.completedMatches || [];
    const events = gs?.allEvents || [];
    const teamNames = gs?.teamNames || [];
    const teams = gs?.teams || [];
    const attendees = gs?.attendees || [];
    const teamColorIndices = gs?.teamColorIndices || [];
    const matchMode = gs?.matchMode || "schedule";
    const isPush = matchMode === "push";

    const standings = calcStandings(matches, teamNames);
    const esBase = getEffectiveSettings(teamContext.team, teamContext.mode);
    const esSnap = gs?.settingsSnapshot || {};
    const es = { ...esBase, ...esSnap };
    const courtCount = gs?.courtCount || 1;
    const showBonus = es.useCrovaGoguma && courtCount === 2 && !isPush;
    const playerRows = calcPlayerStats(events, matches, attendees, teams, teamNames, es);

    // 축구 게임: 데이터가 soccerMatches에 있고 completedMatches/teams는 비어있음.
    // futsal 필드로는 0경기·0점이 되므로 전용 렌더(SoccerArchiveDetail)로 분기한다.
    const isSoccer = matchMode === "soccer";
    const soccerMatches = gs?.soccerMatches || [];
    const soccerFinishedCount = countFinishedSoccerMatches(soccerMatches);
    // 테니스: state.sport로 판별, rounds를 TennisResultsModal로 렌더(라운드별 코트 결과).
    const isTennis = gs?.sport === '테니스';
    const tennisRounds = gs?.rounds || [];
    const ds = makeStyles(C);

    return (
      <div style={hs.container}>
        <div style={hs.header}>
          <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <button onClick={() => setSelectedGame(null)} style={{
              position: "absolute", left: 0, background: "none", border: "none",
              color: "#fff", fontSize: 22, cursor: "pointer", padding: "0 4px", lineHeight: 1,
            }}>‹</button>
            <div style={{ fontSize: 18, fontWeight: 800, color: "#fff" }}>{formatDate(selectedGame.gameDate)} 경기 기록</div>
          </div>
          <div style={{ fontSize: 12, color: C.headerTextDim, marginTop: 2 }}>
            {teamContext.team} · {isTennis ? "테니스" : isSoccer ? "축구" : isPush ? "밀어내기" : matchMode === "schedule" ? "대진표" : "자유대진"} · {isTennis ? `${tennisRounds.length}라운드` : `${isSoccer ? soccerFinishedCount : matches.length}경기`}
          </div>
        </div>
        <div style={{ padding: 16 }}>

          {isTennis ? (
            <TennisResultsModal rounds={tennisRounds} C={C} styles={ds} />
          ) : isSoccer ? (
            <SoccerArchiveDetail soccerMatches={soccerMatches} es={es} styles={hs} />
          ) : (
          <>

          {/* 팀 순위 */}
          {standings.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: C.white, marginBottom: 8 }}>🏆 팀 순위</div>
              <div style={hs.card}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead><tr>
                    {["#", "팀", "경기", "승", "무", "패", "득", "실", "점"].map(h => <th key={h} style={hs.th}>{h}</th>)}
                  </tr></thead>
                  <tbody>
                    {standings.map((t, i) => {
                      const color = TEAM_COLORS[teamColorIndices[t.idx]];
                      return (
                        <tr key={i} style={{ background: i === 0 ? `${C.accent}08` : "transparent" }}>
                          <td style={hs.td(true)}>{i + 1}</td>
                          <td style={{ ...hs.td(true), color: color?.bg || C.white, textAlign: "left", paddingLeft: 4 }}>{t.name}</td>
                          <td style={hs.td(false)}>{t.games}</td>
                          <td style={hs.td(t.wins > 0)}>{t.wins}</td>
                          <td style={hs.td(false)}>{t.draws}</td>
                          <td style={hs.td(false)}>{t.losses}</td>
                          <td style={hs.td(false)}>{t.gf}</td>
                          <td style={hs.td(false)}>{t.ga}</td>
                          <td style={{ ...hs.td(true), color: C.accent }}>{t.points}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 개인 기록 */}
          {playerRows.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: C.white, marginBottom: 8 }}>👤 선수별 기록</div>
              <div style={hs.card}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead><tr>
                    {["선수", "골", "어시", "역주행", "클린", ...(showBonus ? ["🍀", "🍠"] : []), "실점", "GK", "총점"].map(h => <th key={h} style={hs.th}>{h}</th>)}
                  </tr></thead>
                  <tbody>
                    {playerRows.map((p, i) => (
                      <tr key={i}>
                        <td style={{ ...hs.td(true), textAlign: "left", paddingLeft: 4 }}>
                          {p.name}<span style={{ fontSize: 9, color: C.gray, fontWeight: 400 }}>({p.team})</span>
                        </td>
                        <td style={hs.td(p.goals > 0)}>{p.goals}</td>
                        <td style={hs.td(p.assists > 0)}>{p.assists}</td>
                        <td style={{ ...hs.td(p.owngoals > 0), color: p.owngoals > 0 ? C.red : C.white }}>{p.owngoals > 0 ? p.owngoals * es.ownGoalPoint : 0}</td>
                        <td style={hs.td(p.cleanSheets > 0)}>{p.cleanSheets}</td>
                        {showBonus && <td style={{ ...hs.td(p.crova > 0), color: p.crova > 0 ? C.green : C.white }}>{p.crova || ""}</td>}
                        {showBonus && <td style={{ ...hs.td(p.goguma < 0), color: p.goguma < 0 ? C.red : C.white }}>{p.goguma || ""}</td>}
                        <td style={hs.td(false)}>{p.conceded}</td>
                        <td style={hs.td(false)}>{p.keeperGames}</td>
                        <td style={{ ...hs.td(true), fontSize: 13, fontWeight: 800, color: p.total > 0 ? C.green : p.total < 0 ? C.red : C.white }}>{p.total}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 경기 기록 */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: C.white, marginBottom: 8 }}>📋 경기 기록</div>
            {matches.map((m, i) => {
              const evts = events.filter(e => e.matchId === m.matchId);
              const courtCount = gs?.courtCount || 1;
              const label = (() => {
                const pP = m.matchId?.match(/^P(\d+)_C0$/);
                if (pP) return `${pP[1]}경기`;
                const pF = m.matchId?.match(/^F(\d+)_C(\d+)$/);
                if (pF) { const ct = courtCount === 2 ? (pF[2] === "0" ? "A구장" : "B구장") : ""; return `${pF[1]}경기${ct ? " " + ct : ""}`; }
                const p = m.matchId?.match(/^R(\d+)_C(\d+)$/);
                if (!p) return m.matchId;
                const court = courtCount === 2 ? (p[2] === "0" ? "A구장" : "B구장") : `매치${+p[2]+1}`;
                return `${p[1]}라운드 ${court}`;
              })();
              return (
                <div key={i} style={{ ...hs.card, background: m.isExtra ? `${C.orange}11` : C.card }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <span style={{ fontSize: 11, color: C.gray }}>{label}{m.isExtra ? " (임시)" : ""}</span>
                    {m.court && <span style={{ fontSize: 10, color: C.gray }}>{m.court}</span>}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, fontSize: 16, fontWeight: 700 }}>
                    <span style={{ color: m.homeScore > m.awayScore ? C.green : C.white }}>{m.homeTeam}</span>
                    <span style={{ fontSize: 24, fontWeight: 900 }}>{m.homeScore} : {m.awayScore}</span>
                    <span style={{ color: m.awayScore > m.homeScore ? C.green : C.white }}>{m.awayTeam}</span>
                  </div>
                  {evts.length > 0 && (
                    <div style={{ marginTop: 6 }}>
                      {evts.map((e, ei) => (
                        <div key={ei} style={{ display: "flex", alignItems: "center", padding: "4px 8px", borderRadius: 6, background: C.cardLight, marginBottom: 3, fontSize: 11, gap: 4, color: C.white }}>
                          <span>{e.type === "goal" ? "⚽" : "🔴"}</span>
                          <span style={{ fontWeight: 600 }}>{e.player}</span>
                          <span style={{ color: C.gray }}>({e.type === "goal" ? "골" : "자책골"})</span>
                          {e.assist && <span style={{ color: C.gray }}> ← {e.assist}(어시)</span>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {matches.length === 0 && (
            <div style={{ textAlign: "center", color: C.gray, padding: 20 }}>상세 기록이 없습니다</div>
          )}
          </>
          )}

          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            {teamContext?.role === "관리자" && view === "active" && (
              <button onClick={async () => {
                if (!confirm("이 경기 기록을 휴지통으로 이동하시겠습니까?\n휴지통에서 복구 또는 영구 삭제 가능합니다.")) return;
                try {
                  await FirebaseSync.deleteFinalized(team, selectedGame.gameId);
                  alert("휴지통으로 이동 완료");
                  setSelectedGame(null);
                  reload();
                } catch (e) {
                  alert("삭제 실패: " + e.message);
                }
              }} style={{ background: "rgba(255,59,48,0.12)", color: "var(--app-red)", border: "none", borderRadius: 8, padding: "10px 14px", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
                삭제
              </button>
            )}
            {teamContext?.role === "관리자" && view === "trash" && (
              <>
                <button onClick={async () => {
                  if (!confirm("이 경기를 휴지통에서 복구하시겠습니까?")) return;
                  try {
                    await FirebaseSync.restoreFinalized(team, selectedGame.gameId);
                    alert("복구 완료");
                    setSelectedGame(null);
                    reload();
                  } catch (e) {
                    alert("복구 실패: " + e.message);
                  }
                }} style={{ background: "rgba(34,197,94,0.18)", color: "var(--app-green)", border: "none", borderRadius: 8, padding: "10px 14px", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
                  복구
                </button>
                <button onClick={async () => {
                  if (!confirm("⚠️ 이 경기를 영구 삭제하시겠습니까?\n되돌릴 수 없습니다.")) return;
                  if (!confirm("정말 영구 삭제하시겠습니까? 마지막 확인입니다.")) return;
                  try {
                    await FirebaseSync.purgeFinalized(team, selectedGame.gameId);
                    await FirebaseSync.clearState(team, selectedGame.gameId);
                    alert("영구 삭제 완료");
                    setSelectedGame(null);
                    reload();
                  } catch (e) {
                    alert("영구 삭제 실패: " + e.message);
                  }
                }} style={{ background: "rgba(255,59,48,0.18)", color: "var(--app-red)", border: "none", borderRadius: 8, padding: "10px 14px", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
                  영구삭제
                </button>
              </>
            )}
            {teamContext?.role === "관리자" && view === "active" && (
              <button onClick={async () => {
                if (!confirm("이 경기를 수정 가능한 상태로 복구하시겠습니까?\n경기관리 목록에 다시 표시됩니다.")) return;
                try {
                  const stateObj = JSON.parse(selectedGame.stateJson);
                  await FirebaseSync.saveState(team, selectedGame.gameId, { ...stateObj, gameFinalized: true });
                  await FirebaseSync.purgeFinalized(team, selectedGame.gameId);
                  alert("복구 완료!\n경기관리 탭에서 \"전송완료\" 상태로 확인할 수 있습니다.");
                  setSelectedGame(null);
                  setHistory(prev => prev.filter(h => h.gameId !== selectedGame.gameId));
                } catch (e) {
                  alert("복구 실패: " + e.message);
                }
              }} style={{ background: "rgba(255,149,0,0.18)", color: "var(--app-orange)", border: "none", borderRadius: 8, padding: "10px 16px", fontSize: 14, fontWeight: 600, cursor: "pointer", flex: 1 }}>
                복구
              </button>
            )}
            <button onClick={() => setSelectedGame(null)}
              style={{ background: C.grayDark, color: C.white, border: "none", borderRadius: 8, padding: "10px 16px", fontSize: 14, fontWeight: 600, cursor: "pointer", flex: 1 }}>
              목록으로
            </button>
          </div>
        </div>
      </div>
    );
  }

  const items = view === "trash" ? trash : history;
  const emptyMsg = view === "trash" ? "휴지통이 비어있습니다" : "확정된 경기 기록이 없습니다";

  return (
    <div style={hs.container}>
      <div style={hs.header}>
        <div style={{ fontSize: 18, fontWeight: 800, color: "#fff" }}>{view === "trash" ? "Archive · 휴지통" : "Archive"}</div>
        <div style={{ fontSize: 12, color: C.headerTextDim, marginTop: 2 }}>{teamContext.team}</div>
      </div>
      <div style={{ padding: 16 }}>
        {teamContext?.role === "관리자" && (
          <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
            <button onClick={() => { setSelectedGame(null); setView("active"); }}
              style={{ flex: 1, padding: "8px 10px", borderRadius: 6, border: "none", fontSize: 12, fontWeight: 600, cursor: "pointer",
                background: view === "active" ? C.accent : C.grayDarker, color: view === "active" ? C.bg : C.gray }}>
              정상 ({history.length})
            </button>
            <button onClick={() => { setSelectedGame(null); setView("trash"); }}
              style={{ flex: 1, padding: "8px 10px", borderRadius: 6, border: "none", fontSize: 12, fontWeight: 600, cursor: "pointer",
                background: view === "trash" ? C.accent : C.grayDarker, color: view === "trash" ? C.bg : C.gray }}>
              휴지통 ({trash.length})
            </button>
          </div>
        )}
        {items.length === 0 ? (
          <div style={{ textAlign: "center", color: C.gray, padding: 40 }}>{emptyMsg}</div>
        ) : (
          items.map((h, i) => {
            const parts = (h.summary || "").split("|").map(s => s.trim());
            const creator = parts[1] || "";
            const evtInfo = parts[3] || "";
            const matchInfo = parts[4] || "";
            return (
              <div key={i} onClick={() => !detailLoading && handleSelect(h)}
                style={{ ...hs.card, cursor: detailLoading ? "wait" : "pointer", border: `1px solid ${C.grayDark}`, opacity: detailLoading ? 0.6 : 1 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: C.white }}>{formatDate(h.gameDate)} 경기{view === "trash" ? " (휴지통)" : ""}</div>
                    <div style={{ fontSize: 12, color: C.gray, marginTop: 2 }}>
                      {creator && `작성자: ${creator}`}{evtInfo && ` | ${evtInfo}`}{matchInfo && ` | ${matchInfo}`}
                    </div>
                  </div>
                  <div style={{ fontSize: 12, color: C.accent, fontWeight: 600 }}>상세 ▶</div>
                </div>
              </div>
            );
          })
        )}
        <button onClick={onBack}
          style={{ background: C.grayDark, color: C.white, border: "none", borderRadius: 8, padding: "10px 16px", fontSize: 14, fontWeight: 600, cursor: "pointer", width: "100%", marginTop: 12 }}>
          대시보드로 돌아가기
        </button>
      </div>
    </div>
  );
}
