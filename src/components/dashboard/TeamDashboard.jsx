import { useState, useEffect, useMemo, useRef } from 'react';
import { fetchSheetData } from '../../services/sheetService';
import AppSync from '../../services/appSync';
import AuthUtil from '../../services/authUtil';
import { getSettings, getEffectiveSettings, loadSettingsFromFirebase } from '../../config/settings';
import { buildAttendanceData, buildAttendanceView } from '../../utils/dashboardAttendance';
import { pendingGameProgressLabel } from '../../utils/pendingGameLabel';
import { useTheme } from '../../hooks/useTheme';
import Modal from '../common/Modal';
import { SunIcon, MoonIcon, SettingsIcon, HomeIcon, TrophyIcon, ChevronRight, SoccerBallIcon, ListIcon, MenuIcon, StarIcon } from '../common/icons';
import RankingCandlestickChart from './RankingCandlestickChart';
import PlayerAnalytics from './PlayerAnalytics';
import DualTeamTab from './analytics/DualTeamTab';
import DefenseTopCards from './analytics/DefenseTopCards';
import TournamentListTab from '../tournament/TournamentListTab';
import TennisTabs from '../tennis/TennisTabs';
import { buildMainTabs } from './mainTabs';

export default function TeamDashboard({ authUser, teamName, teamEntries, onStartGame, onContinueGame, onViewHistory, onSettings, onSwitchTeam, onLogout, pendingGames = [], checkingPending }) {
  const { C, mode, toggle } = useTheme();
  const [activeSport, setActiveSport] = useState(teamEntries[0]?.mode || "풋살");
  const [members, setMembers] = useState([]);
  const [keepers, setKeepers] = useState([]);
  const [membersLoading, setMembersLoading] = useState(true);
  const [prevRanks, setPrevRanks] = useState({});
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [showDualTeam, setShowDualTeam] = useState(false);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [rankingHistory, setRankingHistory] = useState(null);
  const [rankingLoading, setRankingLoading] = useState(false);
  // 테니스는 최초 화면이 대시보드(tdash), 그 외 종목은 대시보드=records.
  const [activeTab, setActiveTab] = useState(() => (teamEntries[0]?.mode === "테니스" ? "tdash" : "records"));
  const [tournamentActive, setTournamentActive] = useState(false);
  const [tournamentName, setTournamentName] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [favoriteTeam, setFavoriteTeam] = useState(() => AuthUtil.getFavoriteTeam(authUser));
  const menuRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  const isFavorite = favoriteTeam === teamName;
  const toggleFavorite = () => {
    const next = isFavorite ? null : teamName;
    AuthUtil.setFavoriteTeam(authUser, next);
    setFavoriteTeam(next);
    setMenuOpen(false);
  };

  const activeEntry = teamEntries.find(e => e.mode === activeSport) || teamEntries[0];
  const [teamRecord, setTeamRecord] = useState(null);
  const [opponentRecords, setOpponentRecords] = useState([]); // [{opponent, games, wins, draws, losses, gf, ga}]
  const [attendanceData, setAttendanceData] = useState(null); // { totalDates, playerDates: {name: count} }

  // 배열 prop 대신 파생 primitive로 의존 — 렌더마다 재fetch 방지
  const hasSoccerEntry = teamEntries.some(e => e.mode === "축구");
  const isTennis = activeSport === "테니스";

  useEffect(() => {
    // 테니스는 대시보드 시트(풋살/축구 명부)를 읽지 않는다. 호출하면 빈 명단으로 위젯이 0으로 채워진다.
    if (isTennis) { setMembersLoading(false); return; }
    let cancelled = false;
    const load = async () => {
      // 시트명 설정(RTDB)이 도착하기 전에 기본 시트명으로 조회하던 레이스 방지.
      // 로드 실패(오프라인 등) 폴백은 loadSettingsFromFirebase가 내부에서 처리하고 throw하지
      // 않는다 — 이 catch는 함수가 나중에 throw하게 바뀌어도 대시보드가 죽지 않게 하는 보험.
      try { await loadSettingsFromFirebase(teamName, teamEntries); } catch { /* 보험용 */ }
      if (cancelled) return;
      const s = getSettings(teamName);
      fetchSheetData()
        .then(data => { if (cancelled) return; setMembers(data.players || []); setKeepers(data.keepers || []); })
        .catch(() => { if (!cancelled) setMembers([]); })
        .finally(() => { if (!cancelled) setMembersLoading(false); });
      AppSync.getLatestDeltas(s.playerLogSheet).then(deltas => {
        if (!cancelled) setPrevRanks(deltas);
      }).catch(() => {});
      // 축구팀: 포인트로그에서 팀 전적 + 선수별집계에서 출석률
      if (hasSoccerEntry) {
        AppSync.getPlayerLog(s.playerLogSheet).then(plog => {
          if (!cancelled) setAttendanceData(buildAttendanceData(plog));
        }).catch(() => {});
        AppSync.getPointLog(s.pointLogSheet).then(events => {
          if (cancelled) return;
          if (!events || events.length === 0) return;
          const matches = {};
          for (const e of events) {
            if (!e.date || !e.matchId) continue;
            const key = `${e.date}_${e.matchId}`;
            if (!matches[key]) matches[key] = { ourGoals: 0, opponentGoals: 0, date: e.date, matchId: e.matchId };
            if (e.scorer && e.scorer !== "OG") matches[key].ourGoals++;
            if (e.ownGoal) matches[key].opponentGoals++;
            if (e.concedingGk && !e.scorer) matches[key].opponentGoals++;
          }
          const sorted = Object.values(matches).sort((a, b) => `${a.date}_${a.matchId}`.localeCompare(`${b.date}_${b.matchId}`));
          let wins = 0, draws = 0, losses = 0, gf = 0, ga = 0;
          const form = [];
          for (const m of sorted) {
            gf += m.ourGoals; ga += m.opponentGoals;
            if (m.ourGoals > m.opponentGoals) { wins++; form.push("W"); }
            else if (m.ourGoals < m.opponentGoals) { losses++; form.push("L"); }
            else { draws++; form.push("D"); }
          }
          setTeamRecord({ wins, draws, losses, gf, ga, games: sorted.length, form: form.slice(-5) });
          // 상대팀별 전적 — events에서 매치별 상대 추출
          const matchOpponents = {};
          for (const e of events) {
            if (!e.date || !e.matchId) continue;
            const key = `${e.date}_${e.matchId}`;
            if (e.opponent && !matchOpponents[key]) matchOpponents[key] = e.opponent;
          }
          const oppRec = {};
          for (const m of sorted) {
            const key = `${m.date}_${m.matchId}`;
            const opp = matchOpponents[key];
            if (!opp) continue;
            if (!oppRec[opp]) oppRec[opp] = { opponent: opp, games: 0, wins: 0, draws: 0, losses: 0, gf: 0, ga: 0 };
            oppRec[opp].games++; oppRec[opp].gf += m.ourGoals; oppRec[opp].ga += m.opponentGoals;
            if (m.ourGoals > m.opponentGoals) oppRec[opp].wins++;
            else if (m.ourGoals < m.opponentGoals) oppRec[opp].losses++;
            else oppRec[opp].draws++;
          }
          setOpponentRecords(Object.values(oppRec).sort((a, b) => b.games - a.games));
        }).catch(() => {});
      }
    };
    load();
    // teamName/hasSoccerEntry/isTennis 변경 시 재조회 — 이전엔 []라 팀 전환에도 최초 데이터가 유지됐음
    return () => { cancelled = true; };
  }, [teamName, hasSoccerEntry, isTennis]);

  const ds = useMemo(() => ({
    container: { background: "var(--app-bg-grouped)", minHeight: "100vh",
                 color: "var(--app-text-primary)",
                 fontFamily: "var(--app-font-sans)", fontWeight: 400, letterSpacing: "-0.014em",
                 maxWidth: 500, margin: "0 auto" },
    header:    { background: "var(--app-bg-grouped)", padding: "24px 20px 12px",
                 position: "sticky", top: 0, zIndex: 100 },
    section:   { padding: "0 20px", marginBottom: 18 },
    card:      { background: C.card, borderRadius: 14, padding: 14,
                 border: `1px solid ${C.borderColor}` },
    sectionTitle: { fontSize: 13, fontWeight: 400,
                    color: C.gray, marginBottom: 8, paddingLeft: 4,
                    display: "flex", alignItems: "center", gap: 6 },
    sportTab: (active) => ({ flex: "0 0 auto", padding: "6px 14px", textAlign: "center",
      background: active ? C.card : "transparent",
      color: active ? C.white : C.gray,
      fontWeight: 500, fontSize: 13,
      border: "none", borderRadius: 7,
      boxShadow: active ? "0 1px 2px rgba(0,0,0,0.08)" : "none",
      cursor: "pointer" }),
    btn: (bg, tc = "#fff") => ({ background: bg, color: tc, border: "none",
      borderRadius: 10, padding: "12px 16px", fontSize: 15, fontWeight: 500,
      letterSpacing: "-0.01em", cursor: "pointer", width: "100%" }),
    thStyle: { padding: "8px 4px", textAlign: "center", color: C.gray,
      borderBottom: `1px solid ${C.borderColor}`,
      fontWeight: 500, fontSize: 12,
      whiteSpace: "nowrap" },
    tdStyle: (hl = false) => ({ padding: "9px 4px", textAlign: "center",
      borderBottom: `0.5px solid ${C.borderColor}`,
      fontWeight: hl ? 600 : 400, color: hl ? C.white : C.gray, fontSize: 13,
      fontVariantNumeric: "tabular-nums" }),
    mainTab: (active) => ({ flex: 1, padding: "12px 8px", textAlign: "center",
      fontSize: 14, fontWeight: active ? 600 : 500,
      border: "none", cursor: "pointer", background: "transparent",
      color: active ? C.accent : C.gray,
      borderBottom: active ? `2px solid ${C.accent}` : "2px solid transparent",
      position: "relative" }),
  }), [C]);

  const maxGames = members.length > 0 ? Math.max(...members.map(p => p.games)) : 1;
  const totalGoals = members.reduce((s, p) => s + (p.goals || 0), 0);
  const totalAssists = members.reduce((s, p) => s + (p.assists || 0), 0);
  const activePlayers = members.filter(p => p.games > 0);
  const maxPoint = members.length > 0 ? Math.max(...members.map(p => p.point), 1) : 1;

  const Bar = ({ value, max, color, height = 10 }) => (
    <div style={{ background: "transparent", border: `1px dashed ${C.grayDarker}`,
                  borderRadius: height / 2, height, flex: 1, overflow: "hidden" }}>
      <div style={{ background: C.white, height: "100%", borderRadius: height / 2,
                    width: `${Math.min(100, (value / (max || 1)) * 100)}%`,
                    transition: "width 0.3s" }} />
    </div>
  );

  const DeltaBadge = ({ value }) => {
    if (!value || value === 0) return <span style={{ minWidth: 28 }} />;
    const up = value > 0;
    return (
      <span style={{ fontSize: 10, fontWeight: 500,
                     minWidth: 28, textAlign: "right",
                     color: up ? C.white : C.gray }}>
        {up ? "↑" : "↓"}{Math.abs(value)}
      </span>
    );
  };

  const renderRecords = () => (
    <>
      {membersLoading ? (
        <div style={{ ...ds.section, textAlign: "center", color: C.gray, fontSize: 13, padding: 20 }}>불러오는 중...</div>
      ) : (
        <>
          {/* 팀 전적 (축구) */}
          {activeSport === "축구" && teamRecord && (
            <div style={ds.section}>
              <div style={ds.card}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 10, color: C.gray }}>팀 전적</span>
                    <span style={{ fontSize: 11, fontWeight: 500, color: C.white, fontVariantNumeric: "tabular-nums" }}>{teamRecord.games > 0 ? Math.round((teamRecord.wins / teamRecord.games) * 100) : 0}%</span>
                  </div>
                  <div style={{ display: "flex", gap: 4 }}>
                    {teamRecord.form.map((r, i) => (
                      <span key={i} style={{
                        width: 22, height: 22, borderRadius: "50%",
                        display: "inline-flex", alignItems: "center", justifyContent: "center",
                        fontSize: 9, fontWeight: 600,
                        background: r === "W" ? C.white : "transparent",
                        color:      r === "W" ? C.bg    : C.gray,
                        border:     r === "W" ? "none"  : `1px dashed ${C.grayDarker}`,
                      }}>{r}</span>
                    ))}
                  </div>
                </div>
                <div style={{ display: "flex", justifyContent: "space-around", textAlign: "center" }}>
                  {[
                    { label: "경기", value: teamRecord.games },
                    { label: "승", value: teamRecord.wins },
                    { label: "무", value: teamRecord.draws },
                    { label: "패", value: teamRecord.losses },
                    { label: "득점", value: teamRecord.gf },
                    { label: "실점", value: teamRecord.ga },
                  ].map((it, idx) => (
                    <div key={idx}>
                      <div style={{ fontSize: 22, fontWeight: 400, letterSpacing: "-0.6px", color: C.white, fontVariantNumeric: "tabular-nums" }}>{it.value}</div>
                      <div style={{ fontSize: 9, color: C.gray, marginTop: 2 }}>{it.label}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* 시즌 요약 카드 (풋살만) — Stats C Widget */}
          {activeSport !== "축구" && (
            <div style={ds.section}>
              <div style={{
                background: C.card,
                border: `0.5px solid ${C.borderColor}`,
                borderRadius: 18,
                padding: "18px 18px 14px",
              }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: C.gray }}>이번 시즌</div>
                </div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 6 }}>
                  <div style={{
                    fontSize: 56, fontWeight: 700, lineHeight: 1,
                    color: C.white, letterSpacing: "-0.03em",
                    fontVariantNumeric: "tabular-nums",
                  }}>{totalGoals}</div>
                  <div style={{ fontSize: 17, fontWeight: 500, color: C.gray }}>골</div>
                </div>
                <div style={{
                  marginTop: 14, paddingTop: 12,
                  borderTop: `0.5px solid ${C.borderColor}`,
                  display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8,
                }}>
                  {[
                    { label: "경기", value: maxGames },
                    { label: "어시", value: totalAssists },
                    { label: "참여", value: activePlayers.length },
                  ].map((stat) => (
                    <div key={stat.label}>
                      <div style={{
                        fontSize: 20, fontWeight: 600, color: C.white,
                        letterSpacing: "-0.022em", fontVariantNumeric: "tabular-nums",
                      }}>{stat.value}</div>
                      <div style={{ fontSize: 12, color: C.gray, marginTop: 2 }}>{stat.label}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* 포인트 TOP 5 — Lead B Grouped List */}
          {members.length > 0 && (
            <div style={ds.section}>
              <div style={ds.sectionTitle}>포인트 TOP 5</div>
              <div style={{
                background: C.card,
                border: `0.5px solid ${C.borderColor}`,
                borderRadius: 14,
                overflow: "hidden",
              }}>
                {members.slice(0, 5).map((p, i) => {
                  const isFirst = i === 0;
                  const delta = (p.goalsDelta || 0) + (p.assistsDelta || 0)
                              + (p.ownGoalsDelta || 0) + (p.cleanSheetsDelta || 0);
                  return (
                    <div key={i} style={{
                      display: "grid",
                      gridTemplateColumns: "28px 1fr auto",
                      alignItems: "center", gap: 12,
                      padding: "12px 16px",
                      borderBottom: i < 4 ? `0.5px solid ${C.borderColor}` : "none",
                    }}>
                      <div style={{
                        width: 24, height: 24, borderRadius: 999,
                        background: isFirst ? C.accent : C.cardLight,
                        color:      isFirst ? "#fff"   : C.gray,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 12, fontWeight: 600, fontVariantNumeric: "tabular-nums",
                      }}>{i + 1}</div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 15, fontWeight: 500, color: C.white }}>{p.name}</div>
                        <div style={{
                          marginTop: 5, height: 3, maxWidth: 160,
                          background: C.cardLight, borderRadius: 2, overflow: "hidden",
                        }}>
                          <div style={{
                            height: "100%", borderRadius: 2,
                            width: `${Math.min(100, (p.point / (maxPoint || 1)) * 100)}%`,
                            background: isFirst ? C.accent : C.grayLight,
                            transition: "width 0.3s",
                          }} />
                        </div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{
                          fontSize: 20, fontWeight: 600, color: C.white,
                          letterSpacing: "-0.022em", fontVariantNumeric: "tabular-nums",
                        }}>{p.point}</div>
                        {delta > 0 && (
                          <div style={{
                            fontSize: 11, fontWeight: 500, color: C.green, marginTop: 1,
                            fontVariantNumeric: "tabular-nums",
                          }}>↑ {delta}</div>
                        )}
                        {delta < 0 && (
                          <div style={{
                            fontSize: 11, fontWeight: 500, color: C.red, marginTop: 1,
                            fontVariantNumeric: "tabular-nums",
                          }}>↓ {Math.abs(delta)}</div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 골·어시 TOP 5 */}
          {members.length > 0 && (
            <div style={ds.section}>
              <div style={{ display: "flex", gap: 8 }}>
                {/* 골 TOP 5 */}
                <div style={{ flex: 1 }}>
                  <div style={{ ...ds.sectionTitle, fontSize: 12 }}>⚽ 골 TOP 5</div>
                  <div style={ds.card}>
                    {[...members].sort((a, b) => b.goals - a.goals).slice(0, 5).map((p, i) => (
                      <div key={i} style={{ display: "flex", alignItems: "center", gap: 4, padding: "5px 0", borderBottom: i < 4 ? `1px solid ${C.borderColor}` : "none", fontSize: 12 }}>
                        <span style={{ fontWeight: 700, color: i < 3 ? C.orange : C.gray, minWidth: 14 }}>{i + 1}</span>
                        <span style={{ fontWeight: 600, flex: 1 }}>{p.name}</span>
                        <span style={{ fontWeight: 700, color: "#22c55e" }}>{p.goals}</span>
                        <DeltaBadge value={p.goalsDelta} />
                      </div>
                    ))}
                  </div>
                </div>
                {/* 어시 TOP 5 */}
                <div style={{ flex: 1 }}>
                  <div style={{ ...ds.sectionTitle, fontSize: 12 }}>👟 어시 TOP 5</div>
                  <div style={ds.card}>
                    {[...members].sort((a, b) => b.assists - a.assists).slice(0, 5).map((p, i) => (
                      <div key={i} style={{ display: "flex", alignItems: "center", gap: 4, padding: "5px 0", borderBottom: i < 4 ? `1px solid ${C.borderColor}` : "none", fontSize: 12 }}>
                        <span style={{ fontWeight: 700, color: i < 3 ? C.orange : C.gray, minWidth: 14 }}>{i + 1}</span>
                        <span style={{ fontWeight: 600, flex: 1 }}>{p.name}</span>
                        <span style={{ fontWeight: 700, color: "#3b82f6" }}>{p.assists}</span>
                        <DeltaBadge value={p.assistsDelta} />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 수비 TOP5 (축구 전용) — 로그_매치를 자체 지연 로드해 첫 페인트를 막지 않는다 */}
          {activeSport === "축구" && <DefenseTopCards activeSport={activeSport} C={C} ds={ds} />}

          {/* 최근 핫/콜드 */}
          {activePlayers.length > 0 && (() => {
            // 포인트 변동 = 골 + 어시 - 역주행*2 + 클린시트 (크로바/고구마 변동은 시트 미제공)
            const withDelta = activePlayers.map(p => ({
              ...p,
              totalDelta: (p.goalsDelta || 0) + (p.assistsDelta || 0) + (p.ownGoalsDelta || 0) + (p.cleanSheetsDelta || 0),
            }));
            const hot = [...withDelta].sort((a, b) => b.totalDelta - a.totalDelta).slice(0, 3).filter(p => p.totalDelta > 0);
            const cold = [...withDelta].sort((a, b) => a.totalDelta - b.totalDelta).slice(0, 3).filter(p => p.totalDelta < 0);
            if (hot.length === 0 && cold.length === 0) return null;
            return (
              <div style={ds.section}>
                <div style={ds.sectionTitle}>최근 변동 <span title="직전 경기 대비 포인트 변동 (골+어시+역주행+클린시트). 크로바/고구마 변동은 미포함" style={{ fontSize: 11, color: C.grayDark, cursor: "help", marginLeft: 2 }}>?</span></div>
                <div style={{ display: "flex", gap: 8 }}>
                  {hot.length > 0 && (
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: "#22c55e", marginBottom: 6 }}>HOT</div>
                      {hot.map((p, i) => (
                        <div key={i} style={{ ...ds.card, marginBottom: 6, padding: 10 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <span style={{ fontWeight: 700, fontSize: 13 }}>{p.name}</span>
                            <DeltaBadge value={p.totalDelta} />
                          </div>
                          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 3 }}>
                            {p.goalsDelta !== 0 && <span style={{ fontSize: 10, color: C.gray }}>골{p.goalsDelta > 0 ? "+" : ""}{p.goalsDelta}</span>}
                            {p.assistsDelta !== 0 && <span style={{ fontSize: 10, color: C.gray }}>어시{p.assistsDelta > 0 ? "+" : ""}{p.assistsDelta}</span>}
                            {p.ownGoalsDelta !== 0 && <span style={{ fontSize: 10, color: C.gray }}>역주행{p.ownGoalsDelta > 0 ? "+" : ""}{p.ownGoalsDelta}</span>}
                            {p.cleanSheetsDelta !== 0 && <span style={{ fontSize: 10, color: C.gray }}>CS{p.cleanSheetsDelta > 0 ? "+" : ""}{p.cleanSheetsDelta}</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {cold.length > 0 && (
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: "#ef4444", marginBottom: 6 }}>COLD</div>
                      {cold.map((p, i) => (
                        <div key={i} style={{ ...ds.card, marginBottom: 6, padding: 10 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <span style={{ fontWeight: 700, fontSize: 13 }}>{p.name}</span>
                            <DeltaBadge value={p.totalDelta} />
                          </div>
                          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 3 }}>
                            {p.goalsDelta !== 0 && <span style={{ fontSize: 10, color: C.gray }}>골{p.goalsDelta > 0 ? "+" : ""}{p.goalsDelta}</span>}
                            {p.assistsDelta !== 0 && <span style={{ fontSize: 10, color: C.gray }}>어시{p.assistsDelta > 0 ? "+" : ""}{p.assistsDelta}</span>}
                            {p.ownGoalsDelta !== 0 && <span style={{ fontSize: 10, color: C.gray }}>역주행{p.ownGoalsDelta > 0 ? "+" : ""}{p.ownGoalsDelta}</span>}
                            {p.cleanSheetsDelta !== 0 && <span style={{ fontSize: 10, color: C.gray }}>CS{p.cleanSheetsDelta > 0 ? "+" : ""}{p.cleanSheetsDelta}</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })()}

          {/* 키퍼 성적 — Q열(키퍼경기수) 평균 이상 & T열(실점률) 낮은순 */}
          {(() => {
            const keeperPlayers = members.filter(p => p.keeperGames > 0);
            if (keeperPlayers.length === 0) return null;
            const avgKG = keeperPlayers.reduce((s, p) => s + p.keeperGames, 0) / keeperPlayers.length;
            const qualified = keeperPlayers
              .filter(p => p.keeperGames >= avgKG)
              .sort((a, b) => (a.concededRate || 999) - (b.concededRate || 999));
            if (qualified.length === 0) return null;
            return (
              <div style={ds.section}>
                <div style={ds.sectionTitle}>🧤 키퍼 실점률 TOP 10 <span style={{ fontSize: 10, fontWeight: 400, color: C.gray }}>({Math.round(avgKG)}경기 이상)</span></div>
                <div style={ds.card}>
                  {qualified.slice(0, 10).map((p, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: i < qualified.length - 1 ? `1px solid ${C.borderColor}` : "none" }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: i < 3 ? C.orange : C.gray, minWidth: 14 }}>{i + 1}</span>
                      <span style={{ fontSize: 13, fontWeight: 600, flex: 1 }}>{p.name}</span>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: C.accent }}>{p.concededRate || 0} 실점률</div>
                        <div style={{ fontSize: 10, color: C.gray }}>{p.keeperGames}경기 · 실점 {p.conceded} · CS {p.cleanSheets}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* 출석률 */}
          {activePlayers.length > 0 && (() => {
            const av = buildAttendanceView(activeSport, attendanceData, members, maxGames);
            return (
              <div style={ds.section}>
                <div style={ds.sectionTitle}>출석률 TOP 10 {av.mode !== "empty" && <span style={{ fontSize: 11, fontWeight: 400, color: C.gray }}>(전체 {av.totalDates}일 기준)</span>}</div>
                <div style={{ ...ds.card, display: "flex", flexWrap: "wrap", gap: 0 }}>
                  {av.mode === "empty" ? (
                    <div style={{ padding: "6px", fontSize: 12, color: C.gray }}>출석 데이터 없음</div>
                  ) : (
                    av.list.map((p, i) => {
                      const ratio = p.att / (av.totalDates || 1);
                      const opacity = 0.3 + ratio * 0.7;
                      return (
                        <div key={i} style={{ width: "50%", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 6px", fontSize: 12 }}>
                          <span style={{ fontWeight: 600, opacity }}>{p.name}</span>
                          <span style={{ fontWeight: 700, color: ratio >= 1 ? "#22c55e" : C.accent, opacity }}>{Math.round(ratio * 100)}%({p.att}일)</span>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })()}

        </>
      )}
    </>
  );

  // prevRanks에 저장된 deltas를 사용해 이전 랭킹 계산
  const prevRankMap = useMemo(() => {
    if (!prevRanks || Object.keys(prevRanks).length === 0 || members.length === 0) return {};
    // 현재 대시보드 데이터에서 마지막 경기 증분을 빼서 이전 데이터 생성
    const prevMembers = members.map(p => {
      const d = prevRanks[p.name]; // delta from latest game
      if (!d) return { ...p }; // no delta = no change in stats
      return {
        ...p,
        goals: (p.goals || 0) - (d.goals || 0),
        assists: (p.assists || 0) - (d.assists || 0),
        ownGoals: (p.ownGoals || 0) - (d.ownGoals || 0),
        cleanSheets: (p.cleanSheets || 0) - (d.cleanSheets || 0),
        crova: (p.crova || 0) - (d.crova || 0),
        goguma: (p.goguma || 0) - (d.goguma || 0),
        point: (p.point || 0) - ((d.goals || 0) + (d.assists || 0) + (d.ownGoals || 0) + (d.cleanSheets || 0) + (d.crova || 0) + (d.goguma || 0)),
      };
    });
    // 대시보드와 동일한 정렬: 포인트desc, 역주행asc, 고구마asc, 골desc, 어시desc, 클린시트desc
    prevMembers.sort((a, b) => {
      if (b.point !== a.point) return b.point - a.point;
      if (a.ownGoals !== b.ownGoals) return a.ownGoals - b.ownGoals;
      if (a.goguma !== b.goguma) return a.goguma - b.goguma;
      if (b.goals !== a.goals) return b.goals - a.goals;
      if (b.assists !== a.assists) return b.assists - a.assists;
      return b.cleanSheets - a.cleanSheets;
    });
    const map = {};
    prevMembers.forEach((p, i) => { map[p.name] = i + 1; });
    console.log("이전 랭킹:", Object.entries(map).sort((a, b) => a[1] - b[1]).map(([n, r]) => `${r}. ${n}`).join(", "));
    return map;
  }, [members, prevRanks]);

  const loadRankingHistory = async () => {
    if (rankingHistory) return rankingHistory;
    setRankingLoading(true);
    try {
      const allNames = members.map(m => m.name);
      const s = getSettings(teamName);
      const data = await AppSync.getRankingHistory(allNames, s.playerLogSheet);
      setRankingHistory(data);
      return data;
    } catch (e) { console.warn("랭킹 히스토리 로드 실패:", e); return null; }
    finally { setRankingLoading(false); }
  };

  const handlePlayerClick = async (playerName) => {
    setSelectedPlayer(playerName);
    await loadRankingHistory();
  };


  const showCG = activeSport !== "축구" && getEffectiveSettings(teamName, "풋살").useCrovaGoguma;

  const [statSort, setStatSort] = useState("point");
  const statCols = [
    { key: "name", label: "선수" },
    { key: "games", label: "경기" },
    { key: "goals", label: "골" },
    { key: "assists", label: "어시" },
    { key: "ownGoals", label: "자책" },
    showCG ? { key: "crova", label: "🍀" } : null,
    showCG ? { key: "goguma", label: "🍠" } : null,
    { key: "point", label: "PT" },
    { key: "cleanSheets", label: "CS" },
    { key: "keeperGames", label: "GK" },
    { key: "conceded", label: "실점" },
    { key: "concededRate", label: "실점률" },
  ].filter(Boolean);

  // 포인트 기준 고정 랭킹 (대시보드 정렬과 동일)
  const pointRankMap = useMemo(() => {
    const sorted = [...members].sort((a, b) => {
      if (b.point !== a.point) return b.point - a.point;
      if (a.ownGoals !== b.ownGoals) return a.ownGoals - b.ownGoals;
      if (a.goguma !== b.goguma) return a.goguma - b.goguma;
      if (b.goals !== a.goals) return b.goals - a.goals;
      if (b.assists !== a.assists) return b.assists - a.assists;
      return b.cleanSheets - a.cleanSheets;
    });
    const map = {};
    sorted.forEach((p, i) => { map[p.name] = i + 1; });
    return map;
  }, [members]);

  const sortedMembers = [...members].sort((a, b) => {
    if (statSort === "name") return a.name.localeCompare(b.name, "ko");
    if (statSort === "point") {
      // 포인트순은 대시보드 정렬과 동일
      return (pointRankMap[a.name] || 999) - (pointRankMap[b.name] || 999);
    }
    const primary = (b[statSort] || 0) - (a[statSort] || 0);
    if (primary !== 0) return primary;
    if (statSort !== "goals") { const d = (b.goals || 0) - (a.goals || 0); if (d !== 0) return d; }
    if (statSort !== "assists") { const d = (b.assists || 0) - (a.assists || 0); if (d !== 0) return d; }
    return a.name.localeCompare(b.name, "ko");
  });

  const rankBadge = (rank) => {
    const first = rank === 1;
    const top3 = rank <= 3;
    return (
      <span style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        width: 22, height: 22, borderRadius: "50%",
        background: first ? "var(--app-blue)" : (top3 ? "var(--app-bg-row-hover)" : "transparent"),
        color:      first ? "#fff"           : (top3 ? "var(--app-text-primary)" : "var(--app-text-tertiary)"),
        border: "none",
        fontSize: 11, fontWeight: 600,
        fontVariantNumeric: "tabular-nums",
      }}>{rank}</span>
    );
  };

  const renderRoster = () => (
    <>
    {/* 상대팀별 전적 (축구) */}
    {activeSport === "축구" && opponentRecords.length > 0 && (
      <div style={ds.section}>
        <div style={ds.sectionTitle}>상대팀별 전적</div>
        <div style={{ ...ds.card, overflowX: "auto", padding: 8 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
            <thead><tr>{["상대팀", "경기", "승", "무", "패", "득", "실", "승률"].map(h => <th key={h} style={ds.thStyle}>{h}</th>)}</tr></thead>
            <tbody>
              {opponentRecords.map(o => (
                <tr key={o.opponent}>
                  <td style={{ ...ds.tdStyle(true), textAlign: "left" }}>{o.opponent}</td>
                  <td style={ds.tdStyle()}>{o.games}</td>
                  <td style={ds.tdStyle()}>{o.wins}</td>
                  <td style={ds.tdStyle()}>{o.draws}</td>
                  <td style={ds.tdStyle()}>{o.losses}</td>
                  <td style={ds.tdStyle()}>{o.gf}</td>
                  <td style={ds.tdStyle()}>{o.ga}</td>
                  <td style={ds.tdStyle(true)}>{o.games > 0 ? Math.round((o.wins / o.games) * 100) : 0}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    )}
    <div style={ds.section}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={ds.sectionTitle}>개인 누적 기록 <span style={{ fontSize: 11, fontWeight: 400, color: C.gray }}>({members.length}명)</span></div>
        {activeSport !== "축구" && <button onClick={() => setShowDualTeam(true)} style={{ background: C.orange + "22", color: C.orange, border: "none", borderRadius: 6, padding: "4px 10px", fontSize: 10, fontWeight: 600, cursor: "pointer" }}>팀전</button>}
      </div>
      <div style={{ ...ds.card, overflowX: "auto", padding: 8 }}>
        {membersLoading ? (
          <div style={{ textAlign: "center", color: C.gray, fontSize: 13, padding: 8 }}>불러오는 중...</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <colgroup>
              <col style={{ width: 28 }} />
              <col style={{ width: 64 }} />
            </colgroup>
            <thead>
              <tr>
                <th style={ds.thStyle}>#</th>
                {statCols.map(col => (
                  <th key={col.key} onClick={() => setStatSort(col.key)}
                    style={{ ...ds.thStyle, cursor: "pointer", color: statSort === col.key ? C.accent : C.gray }}>
                    {col.label}{statSort === col.key ? " ▼" : ""}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedMembers.map((p, i) => {
                const rank = pointRankMap[p.name] || (i + 1);
                const isTop3 = rank <= 3;
                const prev = prevRankMap[p.name];
                const diff = prev ? prev - rank : 0;
                return (
                  <tr key={i} style={{ background: rank === 1 ? "rgba(0,122,255,0.06)" : "transparent" }}>
                    <td style={{ ...ds.tdStyle(false), padding: "5px 1px" }}>{rankBadge(rank)}</td>
                    <td style={{ ...ds.tdStyle(true), textAlign: "left", paddingLeft: 4, whiteSpace: "nowrap" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 2, whiteSpace: "nowrap" }}>
                        <span onClick={() => handlePlayerClick(p.name)}
                          style={{ cursor: "pointer", borderBottom: `1px dashed ${C.accent}44` }}>{p.name}</span>
                        {diff !== 0 && (
                          <span style={{ fontSize: 8, fontWeight: 700, color: diff > 0 ? "#ef4444" : "#3b82f6" }}>
                            {diff > 0 ? `▲${diff}` : `▼${Math.abs(diff)}`}
                          </span>
                        )}
                      </div>
                    </td>
                    <td style={ds.tdStyle(false)}>{p.games}</td>
                    <td style={ds.tdStyle(p.goals > 0)}>{p.goals}</td>
                    <td style={ds.tdStyle(p.assists > 0)}>{p.assists}</td>
                    <td style={{ ...ds.tdStyle(p.ownGoals > 0), color: p.ownGoals > 0 ? C.red : undefined }}>{p.ownGoals}</td>
                    {showCG && <td style={ds.tdStyle(p.crova > 0)}>{p.crova || 0}</td>}
                    {showCG && <td style={{ ...ds.tdStyle(p.goguma > 0), color: p.goguma > 0 ? C.red : undefined }}>{p.goguma || 0}</td>}
                    <td style={{ ...ds.tdStyle(true), fontWeight: 800, color: C.accent }}>{p.point}</td>
                    <td style={ds.tdStyle(p.cleanSheets > 0)}>{p.cleanSheets}</td>
                    <td style={ds.tdStyle(false)}>{p.keeperGames}</td>
                    <td style={ds.tdStyle(false)}>{p.conceded}</td>
                    <td style={ds.tdStyle(false)}>{p.concededRate || "-"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

    </div>
    </>
  );

  const renderGames = () => (
    <div style={ds.section}>
      {checkingPending ? (
        <div style={{ textAlign: "center", padding: 20, color: C.gray, fontSize: 13 }}>진행중인 경기 확인 중...</div>
      ) : (
        <>
          {pendingGames.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div style={ds.sectionTitle}>진행중인 경기 ({pendingGames.length})</div>
              {pendingGames.map((game, idx) => {
                const gs = game.state || {};
                const creator = gs.gameCreator || gs.lastEditor || "알 수 없음";
                const roundInfo = pendingGameProgressLabel(gs);
                const attendeeCount = (gs.attendees || []).length;
                // gameId = "g_1234567890" → 타임스탬프에서 날짜 추출
                const gameTs = game.gameId?.startsWith("g_") ? parseInt(game.gameId.slice(2)) : null;
                const gameDate = gameTs ? new Date(gameTs) : (game.savedAt ? new Date(game.savedAt) : null);
                const dateFmt = gameDate ? `${gameDate.getMonth() + 1}/${gameDate.getDate()}` : "";

                const isSummary = gs.phase === "summary" || gs.earlyFinish === true;
                const isFinalized = gs.gameFinalized === true;
                return (
                  <div key={game.gameId} style={{
                    background: "rgba(0,122,255,0.08)",
                    border: "0.5px solid rgba(0,122,255,0.25)",
                    borderRadius: 14, padding: 14, cursor: "pointer", marginBottom: 8,
                  }} onClick={() => onContinueGame(game.gameId)}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4, flexWrap: "wrap" }}>
                          {dateFmt && <span style={{ fontSize: 13, color: "var(--app-text-secondary)", fontWeight: 500 }}>{dateFmt}</span>}
                          <span style={{ fontSize: 15, fontWeight: 600, color: "var(--app-blue)" }}>{roundInfo}</span>
                          {isFinalized
                            ? <span style={{ fontSize: 11, padding: "1px 6px", borderRadius: 4, background: "rgba(52,199,89,0.15)", color: "var(--app-green)", fontWeight: 500 }}>전송완료</span>
                            : isSummary
                              ? <span style={{ fontSize: 11, padding: "1px 6px", borderRadius: 4, background: "rgba(255,149,0,0.15)", color: "var(--app-orange)", fontWeight: 500 }}>마감됨</span>
                              : <span style={{ fontSize: 11, padding: "1px 6px", borderRadius: 4, background: "rgba(52,199,89,0.15)", color: "var(--app-green)", fontWeight: 500 }}>진행중</span>
                          }
                        </div>
                        <div style={{ fontSize: 13, color: "var(--app-text-secondary)" }}>
                          {creator} · {attendeeCount}명 · {gs.teamCount || "?"}팀
                        </div>
                      </div>
                      <ChevronRight color="var(--app-blue)" width={16} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div>
            <div style={ds.sectionTitle}>새 경기</div>
            {activeSport === "축구" ? (
              <button onClick={() => onStartGame("sheetSync")} style={{
                width: "100%", background: "var(--app-blue)", color: "#fff",
                border: "none", borderRadius: 14, padding: "14px 16px", cursor: "pointer",
                display: "flex", alignItems: "center", gap: 12, textAlign: "left",
                fontFamily: "inherit",
              }}>
                <SoccerBallIcon color="#fff" width={22} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 16, fontWeight: 600 }}>경기 시작</div>
                  <div style={{ fontSize: 13, color: "rgba(255,255,255,0.85)", marginTop: 2 }}>참석명단 연동 → 포메이션 → 경기 진행</div>
                </div>
                <ChevronRight color="rgba(255,255,255,0.9)" width={16} />
              </button>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <button onClick={() => onStartGame("sheetSync")} style={{
                  width: "100%", background: "var(--app-blue)", color: "#fff",
                  border: "none", borderRadius: 14, padding: "14px 16px", cursor: "pointer",
                  display: "flex", alignItems: "center", gap: 12, textAlign: "left",
                  fontFamily: "inherit",
                }}>
                  <ListIcon color="#fff" width={22} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 16, fontWeight: 600 }}>자동설정 경기</div>
                    <div style={{ fontSize: 13, color: "rgba(255,255,255,0.85)", marginTop: 2 }}>시트 명단 · 2구장 · 대진표 자동</div>
                  </div>
                  <ChevronRight color="rgba(255,255,255,0.9)" width={16} />
                </button>
                <button onClick={() => onStartGame("custom")} style={{
                  width: "100%", background: "rgba(0,122,255,0.1)", color: "var(--app-blue)",
                  border: "none", borderRadius: 14, padding: "14px 16px", cursor: "pointer",
                  display: "flex", alignItems: "center", gap: 12, textAlign: "left",
                  fontFamily: "inherit",
                }}>
                  <SettingsIcon color="var(--app-blue)" width={22} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 16, fontWeight: 600 }}>커스텀 경기</div>
                    <div style={{ fontSize: 13, color: "var(--app-text-secondary)", marginTop: 2 }}>참석자 선택 → 팀 편성 → 경기 진행</div>
                  </div>
                  <ChevronRight color="var(--app-blue)" width={16} />
                </button>
              </div>
            )}
          </div>
        </>
      )}

      <div style={{ marginTop: 16 }}>
        <button onClick={onViewHistory} style={{
          width: "100%", background: "transparent", color: "var(--app-blue)",
          border: "none", borderRadius: 12, padding: "12px 16px", cursor: "pointer",
          fontSize: 15, fontWeight: 500, fontFamily: "inherit",
        }}>Archive</button>
      </div>
    </div>
  );

  const iconBtnStyle = {
    background: "var(--app-bg-row)",
    border: "0.5px solid var(--app-divider)",
    borderRadius: 999, width: 36, height: 36,
    display: "inline-flex", alignItems: "center", justifyContent: "center",
    color: "var(--app-text-primary)", cursor: "pointer",
    padding: 0,
  };

  return (
    <div style={ds.container}>
      <div style={ds.header}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
          <h1 style={{ fontSize: 28, fontWeight: 700, letterSpacing: "-0.022em",
                       lineHeight: 1.1, color: "var(--app-text-primary)", margin: 0,
                       display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
            {tournamentActive && tournamentName && <TrophyIcon width={22} color="var(--app-orange)" />}
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {tournamentActive && tournamentName ? tournamentName : teamName}
            </span>
          </h1>
          <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
            <button onClick={toggle} style={iconBtnStyle} aria-label="테마 전환">
              {mode === "dark" ? <SunIcon width={16} /> : <MoonIcon width={16} />}
            </button>
            <button onClick={onSettings} style={iconBtnStyle} aria-label="설정">
              <SettingsIcon width={16} />
            </button>
            {tournamentActive && (
              <button onClick={() => {
                if (!confirm("대회 모드에서 홈 화면으로 이동하시겠습니까?")) return;
                setTournamentActive(false);
                setActiveTab("records");
              }} style={iconBtnStyle} aria-label="홈">
                <HomeIcon width={16} />
              </button>
            )}
            <div ref={menuRef} style={{ position: "relative" }}>
              <button onClick={() => setMenuOpen(v => !v)} style={iconBtnStyle} aria-label="메뉴" aria-expanded={menuOpen}>
                <MenuIcon width={16} />
              </button>
              {menuOpen && (
                <div role="menu" style={{
                  position: "absolute", right: 0, top: 42,
                  minWidth: 180,
                  background: "var(--app-bg-row)",
                  border: "0.5px solid var(--app-divider)",
                  borderRadius: 12,
                  boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
                  overflow: "hidden", zIndex: 200,
                }}>
                  <button role="menuitem" onClick={toggleFavorite} style={{
                    display: "flex", alignItems: "center", gap: 10, width: "100%",
                    padding: "12px 14px", background: "transparent",
                    border: 0, fontFamily: "inherit", fontSize: 14, cursor: "pointer",
                    color: "var(--app-text-primary)", textAlign: "left",
                  }}>
                    <StarIcon width={16}
                      color={isFavorite ? "var(--app-orange)" : "var(--app-text-secondary)"}
                      fill={isFavorite ? "var(--app-orange)" : "none"} />
                    {isFavorite ? "즐겨찾기 해제" : "즐겨찾기 지정"}
                  </button>
                  <div style={{ height: "0.5px", background: "var(--app-divider)" }} />
                  <button role="menuitem" onClick={() => { setMenuOpen(false); onSwitchTeam(); }} style={{
                    display: "flex", alignItems: "center", gap: 10, width: "100%",
                    padding: "12px 14px", background: "transparent",
                    border: 0, fontFamily: "inherit", fontSize: 14, cursor: "pointer",
                    color: "var(--app-text-primary)", textAlign: "left",
                  }}>
                    팀 전환
                  </button>
                  <div style={{ height: "0.5px", background: "var(--app-divider)" }} />
                  <button role="menuitem" onClick={() => { setMenuOpen(false); onLogout(); }} style={{
                    display: "flex", alignItems: "center", gap: 10, width: "100%",
                    padding: "12px 14px", background: "transparent",
                    border: 0, fontFamily: "inherit", fontSize: 14, cursor: "pointer",
                    color: "var(--app-red)", textAlign: "left",
                  }}>
                    로그아웃
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
        <div style={{ fontSize: 15, color: "var(--app-text-secondary)", marginBottom: 10 }}>
          {authUser.name}
          {activeEntry?.role === "관리자" && (
            <span style={{
              marginLeft: 8, fontSize: 11, padding: "1px 6px", borderRadius: 4,
              background: "rgba(255,149,0,0.15)", color: "var(--app-orange)", fontWeight: 500,
            }}>관리자</span>
          )}
        </div>
        <div style={{ display: "flex", gap: 6, padding: 4, background: "var(--app-bg-row-hover)", borderRadius: 10, overflowX: "auto" }}>
          {teamEntries.map(e => (
            <button key={e.mode} style={ds.sportTab(e.mode === activeSport)} onClick={() => { setActiveSport(e.mode); setActiveTab(e.mode === "테니스" ? "tdash" : "records"); }}>
              {e.mode}
            </button>
          ))}
        </div>
      </div>

      {!tournamentActive && <div style={{ display: "flex", background: C.bg, borderBottom: `1px solid ${C.grayDarker}` }}>
        {buildMainTabs({ activeSport, role: activeEntry?.role, pendingCount: pendingGames.length }).filter(Boolean).map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)} style={ds.mainTab(activeTab === tab.key)}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              {tab.label}
              {tab.badge && (
                <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 4, background: "#22c55e22", color: "#22c55e", fontWeight: 700 }}>진행중</span>
              )}
              {tab.beta && (
                <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 4, background: "#a78bfa22", color: "#a78bfa", fontWeight: 700, letterSpacing: 0.3 }}>beta</span>
              )}
            </span>
          </button>
        ))}
      </div>}

      <div style={{ padding: "16px 0" }}>
        {isTennis ? (
          <TennisTabs activeTab={activeTab} pendingGames={pendingGames}
            onStartGame={onStartGame} onContinueGame={onContinueGame}
            onViewHistory={onViewHistory}
            authUserName={authUser?.name} role={activeEntry?.role} C={C} />
        ) : (
          <>
            {activeTab === "records" && renderRecords()}
            {activeTab === "roster" && renderRoster()}
            {activeTab === "analytics" && (
              <div style={ds.section}>
                <div style={ds.sectionTitle}>선수 분석</div>
                <PlayerAnalytics teamName={teamName} teamMode={activeSport} isAdmin={activeEntry?.role === "관리자"} authUserName={authUser?.name} />
              </div>
            )}
            {activeTab === "games" && renderGames()}
            {activeTab === "tournament" && (
              <TournamentListTab
                teamName={teamName} ourTeamName={teamName}
                isAdmin={activeEntry?.role === "관리자"}
                attendees={members.map(m => m.name)}
                gameSettings={getSettings(teamName)}
                onTournamentView={setTournamentActive}
                onTournamentName={setTournamentName}
                onGoHome={() => {
                  if (!confirm("대회 모드에서 홈 화면으로 이동하시겠습니까?")) return;
                  setTournamentActive(false);
                  setActiveTab("records");
                }}
              />
            )}
          </>
        )}
      </div>

      {selectedPlayer && (
        <Modal onClose={() => setSelectedPlayer(null)} title={`${selectedPlayer} 랭킹 추이`}>
          {rankingLoading ? (
            <div style={{ textAlign: "center", padding: 20, color: C.gray }}>불러오는 중...</div>
          ) : rankingHistory ? (
            <RankingCandlestickChart
              playerName={selectedPlayer}
              rankingHistory={rankingHistory}
              currentRank={pointRankMap[selectedPlayer]}
              C={C}
            />
          ) : (
            <div style={{ textAlign: "center", padding: 20, color: C.gray }}>데이터 없음</div>
          )}
        </Modal>
      )}

      {showDualTeam && (
        <Modal onClose={() => setShowDualTeam(false)} title="팀전 랭킹">
          <DualTeamTab teamName={teamName} isAdmin={activeEntry?.role === "관리자"} />
        </Modal>
      )}

    </div>
  );
}
