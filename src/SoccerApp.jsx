import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { FALLBACK_DATA } from './config/fallbackData';
import { useTheme } from './hooks/useTheme';
import { fetchSheetData, fetchAttendanceData } from './services/sheetService';
import AppSync from './services/appSync';
import FirebaseSync from './services/firebaseSync';
import { useGameReducer } from './hooks/useGameReducer';
import { useFirebaseSync } from './hooks/useFirebaseSync';
import { getSettings, getEffectiveSettings } from './config/settings';
import { makeStyles } from './styles/theme';
import PhaseIndicator from './components/common/PhaseIndicator';
import Modal from './components/common/Modal';
import SoccerMatchView from './components/game/SoccerMatchView';
import SoccerScheduleModal from './components/game/SoccerScheduleModal';
import SoccerStandingsModal from './components/game/SoccerStandingsModal';
import SoccerStandingsTable from './components/game/SoccerStandingsTable';
import SoccerMatchResults from './components/game/SoccerMatchResults';
import MatchTabBar from './components/game/MatchTabBar';
import MatchHeader from './components/game/MatchHeader';
import AttendeeSelector from './components/game/AttendeeSelector';
import {
  calcSoccerPlayerStats, calcSoccerPlayerPoint,
  calcSoccerTeamRecord, calcSoccerOpponentRecords,
  buildEventLogRows, buildPointLogRows, buildPlayerLogRows,
  countFinishedSoccerMatches, getSoccerPlayedPlayers, keepLockedAttendees, mergeAttendeesIntoRoster,
} from './utils/soccerScoring';
import { buildRawEventsFromSoccer, buildRawPlayerGamesFromSoccer } from './utils/rawLogBuilders';
import { buildRoundRowsFromSoccer } from './utils/matchRowBuilder';
import { refreshAfterFinalize, FINALIZE_DATASETS } from './utils/refreshAfterFinalize';
import { gameDateFromId } from './utils/gameDate';

export default function SoccerApp({ authUser, teamContext, isNewGame, gameMode, gameId, onLogout, onBackToMenu }) {
  const gameSettings = useMemo(() => getSettings(teamContext?.team), [teamContext?.team]);
  const [state, dispatch] = useGameReducer();
  const [opponentSuggestions, setOpponentSuggestions] = useState([]); // 시트에서 받은 상대팀 후보 (비동기화)
  const [newOpponentSetup, setNewOpponentSetup] = useState("");
  const {
    phase, dataLoading, dataSource, seasonPlayers,
    syncStatus, attendanceLoading, attendees, newPlayer,
    playerSortMode, matchModal, settingsSnapshot, gameFinalized,
  } = state;

  const set = (field, value) => dispatch({ type: 'SET_FIELD', field, value });

  // ── 초기 데이터 로딩 ──
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const team = teamContext?.team || "";
    dispatch({ type: 'SET_FIELDS', fields: { matchMode: "soccer", courtCount: 1 } });

    if (!isNewGame && gameId) {
      FirebaseSync.loadStateReconstructed(team, gameId).then(state => {
        if (state && state.phase !== "setup") {
          dispatch({ type: 'SET_FIELDS', fields: { dataLoading: false, dataSource: "restoring" } });
          dispatch({ type: 'RESTORE_STATE', state });
          _loadBackgroundData(team);
          return;
        }
        _loadAllData(team);
      }).catch(() => _loadAllData(team));
      return;
    }

    _loadAllData(team);
  }, []);

  const _loadBackgroundData = (team) => {
    Promise.all([
      fetchSheetData().catch(() => null),
      Promise.resolve({ crova: {}, goguma: {} }),
    ]).then(([sheetData, cumBonus]) => {
      const fields = {};
      if (sheetData) { fields.seasonPlayers = sheetData.players; fields.dataSource = "sheet"; }
      if (sheetData?.opponents?.length > 0) setOpponentSuggestions(sheetData.opponents);
      if (cumBonus) { fields.seasonCrova = cumBonus.crova || {}; fields.seasonGoguma = cumBonus.goguma || {}; }
      if (Object.keys(fields).length > 0) dispatch({ type: 'SET_FIELDS', fields });
    });
  };

  const _loadAllData = (team) => {
    const loadPromises = [
      fetchSheetData().catch(err => { console.warn("시트 로딩 실패:", err.message); return null; }),
      Promise.resolve({ crova: {}, goguma: {} }),
    ];
    if (gameMode === "sheetSync") {
      loadPromises.push(
        fetchAttendanceData().catch(err => { console.warn("참석명단 로딩 실패:", err.message); return null; })
      );
    }
    Promise.all(loadPromises).then(([sheetData, cumBonus, attendanceData]) => {
      const fields = { dataLoading: false };
      if (sheetData) { fields.seasonPlayers = sheetData.players; fields.dataSource = "sheet"; }
      else { fields.dataSource = "fallback"; }
      if (cumBonus) { fields.seasonCrova = cumBonus.crova || {}; fields.seasonGoguma = cumBonus.goguma || {}; }
      if (isNewGame) {
        const { _meta, ...snap } = getEffectiveSettings(teamContext.team, "축구");
        fields.settingsSnapshot = snap;
      }
      dispatch({ type: 'SET_FIELDS', fields });

      // 상대팀 후보: 구글시트 대시보드에서 (settings 영구저장 대신 시트가 소스)
      if (sheetData?.opponents?.length > 0) setOpponentSuggestions(sheetData.opponents);

      // 시트 연동 시 참석자는 미리 채우되, setup 화면에 머문다 (자동 경기진입 제거)
      if (gameMode === "sheetSync" && attendanceData && attendanceData.attendees.length > 0) {
        dispatch({
          type: 'SET_FIELDS',
          fields: { attendees: attendanceData.attendees, matchMode: "soccer", courtCount: 1 },
        });
      }
    });
  };

  // ── 참석자 시트 연동 ──
  const syncAttendance = () => {
    set('attendanceLoading', true);
    fetchAttendanceData()
      .then(data => dispatch({ type: 'SET_FIELDS', fields: { attendees: data.attendees } }))
      .catch(err => alert("참석명단 연동 실패: " + err.message))
      .finally(() => set('attendanceLoading', false));
  };

  // ── 자동저장 + 구독 — 풋살/축구 공용 훅 (src/hooks/useFirebaseSync.js) ──
  const setSyncStatus = useCallback((v) => dispatch({ type: 'SET_FIELD', field: 'syncStatus', value: v }), [dispatch]);
  const { editorTag, autoSync, cancelPendingSave, lastSyncedStateRef } = useFirebaseSync({
    teamContext, gameId, authUser, dispatch, setSyncStatus,
  });
  const gameState = useMemo(() => ({
    gameId: gameId || "legacy",
    gameCreator: state.gameCreator || authUser?.name || "알 수 없음",
    phase, attendees, matchMode: "soccer", courtCount: 1,
    soccerMatches: state.soccerMatches, currentMatchIdx: state.currentMatchIdx,
    opponents: state.opponents, soccerFormation: state.soccerFormation,
    settingsSnapshot, gameFinalized: state.gameFinalized,
    lastEditor: editorTag,
  }), [state.gameCreator, phase, attendees, state.soccerMatches, state.currentMatchIdx, state.opponents, state.soccerFormation, settingsSnapshot, state.gameFinalized, authUser, gameId, editorTag]);

  // 자동저장 트리거 — deps에서 제외된 gameState 필드는 setup에서만 바뀌거나 phase 전환에 동반됨.
  useEffect(() => {
    if (phase !== "setup" && phase !== "") autoSync(gameState);
  }, [autoSync, state.soccerMatches, phase, state.currentMatchIdx, state.soccerFormation, state.opponents, attendees]);

  // ── 정렬된 선수 목록 ──
  // 로스터('대시보드' 시트)에 없는 참석자도 칩을 갖게 합친다 — 참석 명단은 '참석명단' 시트에서
  // 오므로 두 시트가 어긋나면 참석자인데 토글할 칩이 없다(7/14 게임: 참석 24명 중 14명 누락).
  const sortedPlayers = useMemo(() => {
    const arr = mergeAttendeesIntoRoster(seasonPlayers, attendees);
    if (playerSortMode === "name") return arr.sort((a, b) => a.name.localeCompare(b.name, "ko"));
    return arr.sort((a, b) => b.point - a.point);
  }, [seasonPlayers, playerSortMode, attendees]);

  // ── 축구 개인기록 (경기 중 모달용) ──
  const soccerStats = useMemo(() => {
    const finished = state.soccerMatches.filter(m => m.status === "finished");
    if (finished.length === 0) return [];
    const ES = state.settingsSnapshot || gameSettings;
    const raw = calcSoccerPlayerStats(finished);
    return Object.entries(raw).map(([name, st]) => ({
      name, ...st, point: calcSoccerPlayerPoint(st, ES),
    })).sort((a, b) =>
      b.point - a.point ||
      b.goals - a.goals ||
      b.assists - a.assists ||
      b.cleanSheets - a.cleanSheets ||
      a.owngoals - b.owngoals ||
      a.conceded - b.conceded ||
      a.games - b.games
    );
  }, [state.soccerMatches, state.settingsSnapshot, gameSettings]);

  // ── 참석 해제 잠금: 오늘 한 경기라도 뛴 선수 ──
  // "출전했는데 불참 처리"라는 모순을 예방(유저 요구). 조기 귀가해도 뛴 기록은 남으므로 해제 금지.
  // 이 잠금은 D2(교체후보 = 참석자 − 피치위 − 퇴장자)의 정합성 전제이기도 하다 —
  // 교체아웃된 선수가 참석에서 빠지면 벤치에서 사라져 재투입이 불가능해진다.
  // 축구 전용 파생: 리듀서(풋살 공용)는 건드리지 않는다.
  const locked = useMemo(() => {
    const s = new Set();
    for (const m of state.soccerMatches || []) for (const n of getSoccerPlayedPlayers(m)) s.add(n);
    return s;
  }, [state.soccerMatches]);

  // ── 축구 핸들러 ──
  const createSoccerMatch = ({ opponent, lineup, gk, defenders, subs, formation, assignments, positionMap }) => {
    dispatch({ type: 'CREATE_SOCCER_MATCH', opponent, lineup, gk, defenders, subs, formation, assignments, positionMap });
  };
  const addSoccerEvent = (matchIdx, event) => {
    dispatch({ type: 'ADD_SOCCER_EVENT', matchIdx, event });
  };
  const deleteSoccerEvent = (matchIdx, eventId) => {
    dispatch({ type: 'DELETE_SOCCER_EVENT', matchIdx, eventId });
  };
  const finishSoccerMatch = (matchIdx) => {
    dispatch({ type: 'FINISH_SOCCER_MATCH', matchIdx });
  };
  const updateSoccerMatchFormation = (matchIdx, patch) => {
    if (matchIdx < 0) return;
    dispatch({ type: 'UPDATE_SOCCER_MATCH_FORMATION', matchIdx, patch });
  };
  const reopenSoccerMatch = (matchIdx) => {
    dispatch({ type: 'REOPEN_SOCCER_MATCH', matchIdx });
  };
  const setSoccerMatchOpponent = (matchIdx, opponent) => {
    dispatch({ type: 'SET_SOCCER_MATCH_OPPONENT', matchIdx, opponent });
  };
  const correctSoccerLineup = (matchIdx, out, inn) => {
    dispatch({ type: 'CORRECT_SOCCER_LINEUP', matchIdx, out, in: inn });
  };
  const swapSoccerLineupPositions = (matchIdx, aIdx, bIdx) => {
    dispatch({ type: 'SWAP_SOCCER_LINEUP_POSITIONS', matchIdx, aIdx, bIdx });
  };
  const createRestMatch = () => {
    dispatch({ type: 'CREATE_AND_FINISH_REST_MATCH' });
  };
  // 오늘 참석팀에 추가 (시트가 마스터 소스이므로 settings 영구저장 안 함)
  const addOpponent = (name) => {
    const trimmed = (name || "").trim();
    if (!trimmed) return;
    if ((state.opponents || []).includes(trimmed)) return;
    dispatch({ type: 'SET_OPPONENTS', opponents: [...(state.opponents || []), trimmed] });
  };
  const removeOpponent = (name) => {
    dispatch({ type: 'SET_OPPONENTS', opponents: (state.opponents || []).filter(n => n !== name) });
  };
  const renameOpponent = (oldName, newName) => {
    const trimmed = (newName || "").trim();
    if (!trimmed) return;
    dispatch({ type: 'SET_OPPONENTS', opponents: (state.opponents || []).map(n => n === oldName ? trimmed : n) });
  };
  // setup에서 오늘 참석팀 토글 (후보 칩 탭)
  const toggleTodayOpponent = (name) => {
    const list = state.opponents || [];
    dispatch({ type: 'SET_OPPONENTS', opponents: list.includes(name) ? list.filter(n => n !== name) : [...list, name] });
  };

  // ── 기록확정 (구글시트 저장) ──
  const handleFinalize = async () => {
    const gameTs = gameId?.startsWith("g_") ? parseInt(gameId.slice(2)) : null;
    const gameD = gameTs ? new Date(gameTs) : new Date();
    const dateStr = `${gameD.getFullYear()}-${String(gameD.getMonth() + 1).padStart(2, "0")}-${String(gameD.getDate()).padStart(2, "0")}`;
    const inputTime = new Date().toLocaleString("ko-KR");

    const finished = state.soccerMatches.filter(m => m.status === "finished");
    if (finished.length === 0) { alert("종료된 경기가 없습니다."); return; }
    if (!confirm(`${gameD.getMonth() + 1}월 ${gameD.getDate()}일 축구기록을 확정하시겠습니까?\n\n${finished.length}경기 · 3종 로그를 저장합니다.`)) return;
    // 펜딩 자동저장 취소 — 마감 성공 후 clearState된 노드를 타이머가 되살리는 레이스 방지
    cancelPendingSave();

    const eventLogRows = buildEventLogRows(finished, dateStr);
    const pointLogRows = buildPointLogRows(finished, dateStr, inputTime);
    const playerLogRows = buildPlayerLogRows(finished, dateStr, inputTime);
    const team = teamContext?.team || '';
    const stateForMatchRows = {
      ...state,
      soccerMatches: finished.map(m => ({ ...m, matchIdx: m.matchIdx + 1 })),
    };
    const sessionGameId = finished.length > 0
      ? (finished[0].startedAt ? `s_${finished[0].startedAt}` : `s_${dateStr}_${finished[0].matchIdx + 1}`)
      : '';
    const matchRows = buildRoundRowsFromSoccer({
      team,
      mode: '기본',
      tournamentId: '',
      date: dateStr,
      stateJSON: stateForMatchRows,
      inputTime,
    });
    matchRows.forEach(r => { r.game_id = sessionGameId; });
    const rawEvents = buildRawEventsFromSoccer({ team, gameId: sessionGameId, events: eventLogRows });
    const rawPlayerGames = buildRawPlayerGamesFromSoccer({ team, inputTime, players: playerLogRows });

    try {
      const results = await Promise.allSettled([
        AppSync.writeSoccerPointLog({ events: pointLogRows }, gameSettings.pointLogSheet),
        AppSync.writeSoccerPlayerLog({ players: playerLogRows }, gameSettings.playerLogSheet),
        AppSync.writeRawEvents({ rows: rawEvents }),
        AppSync.writeRawPlayerGames({ rows: rawPlayerGames }),
        AppSync.writeMatchLog(matchRows),
      ]);
      const [r1, r2, r3, r4, r5] = results;
      const legacyOk = r1.status === 'fulfilled' && r2.status === 'fulfilled';
      if (!legacyOk) {
        const reasons = [r1, r2].filter(r => r.status !== 'fulfilled').map(r => r.reason?.message || '').filter(Boolean);
        throw new Error('기존 시트 저장 실패' + (reasons.length ? `\n${reasons.join('\n')}` : ''));
      }
      // 분석 소스(로그_*) 전송 실패를 silent 처리하지 않음 — 하나라도 실패하면 미확정으로 두고 경고(풋살과 동일).
      const rawFailed = [];
      if (r3.status !== 'fulfilled') rawFailed.push('로그_이벤트');
      if (r4.status !== 'fulfilled') rawFailed.push('로그_선수경기');
      if (r5.status !== 'fulfilled') rawFailed.push('로그_매치');
      const allOk = rawFailed.length === 0;
      // Firebase에 확정 state 저장 (HistoryView/PlayerAnalytics 소스)
      // — 모든 시트 성공 시에만(풋살과 동일). 부분 실패 시 finalized 기록을 남기면
      //   아카이브에 '완료'처럼 보여 재전송 의무를 놓치게 됨.
      const finalState = { ...gameState, gameFinalized: allOk };
      if (allOk) {
        await FirebaseSync.saveFinalized(teamContext?.team, gameId, finalState);
        // 5개 시트가 전부 성공했을 때만 — 캐시 재적재가 실패해도 위 saveFinalized/마감은 되돌리지 않는다.
        await refreshAfterFinalize(FINALIZE_DATASETS);
      }
      // gameFinalized를 active 노드에 반영(풋살과 동일) — 대시보드 '전송완료' 뱃지 + Archive 활성 근거.
      // 자동 종료(clearState/메뉴) 제거: 확정 후에도 summary에 남아 '수정 후 재전송'·'Archive' 단계 제공.
      await FirebaseSync.syncDiff(teamContext?.team || '', gameId || "legacy", lastSyncedStateRef.current, finalState);
      lastSyncedStateRef.current = finalState;
      set('gameFinalized', allOk);
      const r1v = r1.value, r2v = r2.value;
      const ct = (r, unit) => r.status === 'fulfilled' ? `${r.value?.count || 0}${unit}${r.value?.skipped ? ` (skip ${r.value.skipped})` : ''}` : '❌ 실패';
      const detail = `포인트로그: ${r1v?.count || 0}건\n선수별집계: ${r2v?.count || 0}명\n로그_이벤트: ${ct(r3, '건')}\n로그_선수경기: ${ct(r4, '명')}\n로그_매치: ${ct(r5, '건')}`;
      if (allOk) {
        // active를 지우지 않고 '전송완료'로 목록에 남김 → 'Archive' 버튼으로 명시적 보관
        alert(`기록 확정 완료!\n\n${detail}\n\n경기가 '전송완료'로 목록에 남았습니다.\n'Archive'를 누르면 목록에서 정리되고 보관됩니다.`);
      } else {
        // 분석 로그 누락 → 미확정 유지(active 보존)해 재전송 유도
        alert(`⚠️ 분석 로그 일부 전송 실패: ${rawFailed.join(', ')}\n\n${detail}\n\n분석용 데이터가 누락됐습니다. "수정 후 재전송"을 눌러 재전송하세요.\n(전부 성공 전까지 미확정 상태로 둡니다.)`);
      }
    } catch (err) {
      alert("시트 저장 실패: " + err.message);
    }
  };

  const { C } = useTheme();
  const s = makeStyles(C);

  // ── LOADING ──
  if (dataLoading) {
    return (
      <div style={{ ...s.app, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
        <div style={{ fontSize: 32, marginBottom: 16 }}>⚽</div>
        <div style={{ color: C.white, fontSize: 16, fontWeight: 600, marginBottom: 8 }}>{teamContext?.team || "축구"} 경기기록</div>
        <div style={{ color: C.gray, fontSize: 13 }}>선수 데이터 불러오는 중...</div>
      </div>
    );
  }

  // ── SETUP PHASE ──
  if (phase === "setup") {
    return (
      <div style={s.app}>
        <div style={s.header}>
          <div style={s.title}>⚽ {teamContext?.team || "축구"} 경기기록</div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
            <div style={s.subtitle}>{new Date().toLocaleDateString("ko-KR")} 축구 기록기</div>
            <div style={{ fontSize: 9, padding: "2px 6px", borderRadius: 4, background: dataSource === "sheet" ? "#22c55e22" : "#f9731644", color: dataSource === "sheet" ? "#22c55e" : "#f97316", fontWeight: 600 }}>
              {dataSource === "sheet" ? "시트 연동" : "오프라인"}
            </div>
          </div>
          {authUser && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 4 }}>
              <span style={{ fontSize: 11, color: C.headerBtnDimColor }}>{authUser.name} · {teamContext?.team}</span>
              {onBackToMenu && <button onClick={onBackToMenu} style={{ fontSize: 10, padding: "2px 8px", borderRadius: 4, background: C.headerBtnBg, color: C.headerBtnDimColor, border: "none", cursor: "pointer" }}>메뉴</button>}
              <button onClick={onLogout} style={{ fontSize: 10, padding: "2px 8px", borderRadius: 4, background: C.headerBtnBg, color: C.headerBtnDimColor, border: "none", cursor: "pointer" }}>로그아웃</button>
            </div>
          )}
        </div>
        <PhaseIndicator activeIndex={0} />
        <div style={s.section}>
          <div style={s.sectionTitle}>👥 참석자 선택 <span style={{ fontSize: 12, fontWeight: 400, color: C.gray }}>({attendees.length}명)</span></div>
          <AttendeeSelector
            attendees={attendees} sortedPlayers={sortedPlayers} playerSortMode={playerSortMode}
            onSyncSheet={syncAttendance}
            onToggle={(name) => dispatch({ type: 'TOGGLE_ATTENDEE', name })}
            onSetAll={(names) => dispatch({ type: 'SET_ATTENDEES', attendees: names })}
            onClear={() => set('attendees', [])}
            onToggleSort={() => set('playerSortMode', playerSortMode === "point" ? "name" : "point")}
            onAddManual={(name) => dispatch({ type: 'SET_FIELDS', fields: { attendees: [...attendees, name], newPlayer: "" } })}
            newPlayer={newPlayer} onNewPlayerChange={(v) => set('newPlayer', v)}
            attendanceLoading={attendanceLoading} styles={s}
          />
        </div>
        <div style={s.section}>
          <div style={s.sectionTitle}>🆚 참석팀 <span style={{ fontSize: 12, fontWeight: 400, color: C.gray }}>({(state.opponents || []).length}팀)</span></div>
          <div style={s.card}>
            <div style={{ fontSize: 12, color: C.gray, marginBottom: 8 }}>오늘 온 상대팀을 고르세요 (시트의 자주 붙은 팀 순)</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
              {opponentSuggestions.map(o => (
                <div key={o.name} onClick={() => toggleTodayOpponent(o.name)} style={s.chip((state.opponents || []).includes(o.name))}>
                  <span>{o.name}</span>
                </div>
              ))}
              {opponentSuggestions.length === 0 && (
                <span style={{ fontSize: 12, color: C.gray }}>시트에 상대팀 기록이 없습니다. 아래에서 직접 추가하세요.</span>
              )}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <input style={s.input} placeholder="새 상대팀 직접 추가" value={newOpponentSetup}
                onChange={e => setNewOpponentSetup(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") { addOpponent(newOpponentSetup); setNewOpponentSetup(""); } }} />
              <button onClick={() => { addOpponent(newOpponentSetup); setNewOpponentSetup(""); }} style={s.btn(C.green)}>추가</button>
            </div>
            {(state.opponents || []).filter(n => !opponentSuggestions.some(o => o.name === n)).length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
                {(state.opponents || []).filter(n => !opponentSuggestions.some(o => o.name === n)).map(name => (
                  <div key={name} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 8px", borderRadius: 999, background: C.cardLight, fontSize: 13, color: C.white }}>
                    <span>{name}</span>
                    <button onClick={() => removeOpponent(name)} style={{ background: "transparent", border: "none", color: C.red, cursor: "pointer", padding: 0, fontSize: 14, lineHeight: 1 }} aria-label={`${name} 제거`}>✕</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        <div style={s.bottomBar}>
          {(() => {
            const canStart = (state.opponents || []).length > 0;
            return (
              <button onClick={() => { if (canStart) dispatch({ type: 'START_MATCHES', schedule: null, pushState: null }); }}
                disabled={!canStart}
                style={{ ...s.btnFull(C.accent, C.bg), opacity: canStart ? 1 : 0.4, cursor: canStart ? "pointer" : "not-allowed" }}>
                {canStart ? `축구 경기 시작 (${attendees.length}명)` : "상대팀을 1팀 이상 선택하세요"}
              </button>
            );
          })()}
        </div>
      </div>
    );
  }

  // ── MATCH PHASE ──
  if (phase === "match") {
    const finishedCount = countFinishedSoccerMatches(state.soccerMatches);
    const gameDate = gameDateFromId(gameId);
    const teamRec = calcSoccerTeamRecord(state.soccerMatches);
    const oppRecords = calcSoccerOpponentRecords(state.soccerMatches);
    const deleteSoccerGame = async () => {
      if (!confirm("경기를 삭제하시겠습니까?\n모든 기록이 초기화됩니다.")) return;
      if (!confirm("되돌릴 수 없습니다. 정말 삭제하시겠습니까?")) return;
      await FirebaseSync.clearState(teamContext?.team, gameId);
      await AppSync.clearState(gameId);
      window.location.reload();
    };

    const rosterHandlers = {
      onSyncSheet: syncAttendance,
      // 출전 기록이 있으면 해제 불가(D3). 추가는 언제나 허용 — 지각 참석 처리가 이 기능의 핵심.
      onToggle: (name) => { if (locked.has(name)) return; dispatch({ type: 'TOGGLE_ATTENDEE', name }); },
      // 통째 교체·초기화도 잠금 인원은 남긴다 — 칩만 막으면 이 둘로 뚫린다.
      // 초기화는 "빈 명단 + 잠금 보존"이라 같은 헬퍼로 표현된다.
      onSetAll: (names) => dispatch({ type: 'SET_ATTENDEES', attendees: keepLockedAttendees(names, locked) }),
      onClear: () => dispatch({ type: 'SET_ATTENDEES', attendees: keepLockedAttendees([], locked) }),
      onToggleSort: () => set('playerSortMode', playerSortMode === "point" ? "name" : "point"),
      onAddManual: (name) => dispatch({ type: 'SET_FIELDS', fields: { attendees: [...attendees, name], newPlayer: "" } }),
      newPlayer, onNewPlayerChange: (v) => set('newPlayer', v),
      attendanceLoading, lockedNames: [...locked],
    };

    return (
      <div style={s.app}>
        <MatchHeader title="경기 진행" subtitle={`${gameDate.toLocaleDateString("ko-KR")} · 축구 · ${finishedCount}경기`} onHome={onBackToMenu}
          syncStatus={AppSync.enabled() ? syncStatus : null}>
          <MatchTabBar tabs={[
            { key: 'schedule', label: '대진표', onClick: () => set('matchModal', 'soccerSchedule') },
            { key: 'standings', label: '팀순위', onClick: () => set('matchModal', 'soccerStandings') },
            { key: 'playerStats', label: '개인기록', onClick: () => set('matchModal', 'playerStats') },
            { key: 'roster', label: '참석명단', onClick: () => set('matchModal', 'roster') },
            { key: 'finish', label: '경기마감', tone: 'green', strong: true, onClick: () => set('phase', 'summary'), hidden: finishedCount === 0 },
            { key: 'delete', label: '경기삭제', tone: 'red', onClick: deleteSoccerGame, hidden: teamContext?.role !== '관리자' },
          ]} />
        </MatchHeader>

        {matchModal === "soccerSchedule" && (
          <SoccerScheduleModal soccerMatches={state.soccerMatches} onClose={() => set('matchModal', null)} styles={s} />
        )}

        {matchModal === "soccerStandings" && (
          <SoccerStandingsModal records={oppRecords} total={teamRec} onClose={() => set('matchModal', null)} styles={s} />
        )}

        {matchModal === "playerStats" && (
          <Modal onClose={() => set('matchModal', null)} title="오늘의 선수기록" maxWidth={500}>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 380 }}>
                <thead><tr>{["선수", "경기", "골", "어시", "자책", "CS", "실점", "포인트"].map(h => <th key={h} style={s.th}>{h}</th>)}</tr></thead>
                <tbody>
                  {soccerStats.map(p => (
                    <tr key={p.name}>
                      <td style={s.td(true)}>{p.name}</td>
                      <td style={s.td()}>{p.games}</td>
                      <td style={s.td(p.goals > 0)}>{p.goals}</td>
                      <td style={s.td(p.assists > 0)}>{p.assists}</td>
                      <td style={{ ...s.td(p.owngoals > 0), color: p.owngoals > 0 ? C.red : C.white }}>{p.owngoals}</td>
                      <td style={s.td(p.cleanSheets > 0)}>{p.cleanSheets}</td>
                      <td style={s.td()}>{p.conceded}</td>
                      <td style={{ ...s.td(true), fontSize: 13, fontWeight: 800 }}>{p.point}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Modal>
        )}

        {matchModal === "roster" && (
          <Modal onClose={() => set('matchModal', null)} title="참석명단" maxWidth={500}>
            <div style={{ fontSize: 11, color: C.gray, marginBottom: 10, lineHeight: 1.5 }}>
              참석 여부만 바꿉니다.
              이미 기록된 경기의 출전 선수는 그 경기에서 "🔁 출전 수정"으로 고치세요.
            </div>
            <AttendeeSelector
              attendees={attendees} sortedPlayers={sortedPlayers} playerSortMode={playerSortMode}
              {...rosterHandlers} styles={s} />
          </Modal>
        )}

        <div style={s.section}>
          <SoccerMatchView
            soccerMatches={state.soccerMatches} currentMatchIdx={state.currentMatchIdx}
            attendees={attendees} opponents={state.opponents || []}
            onRemoveOpponent={removeOpponent} onRenameOpponent={renameOpponent}
            onCreateMatch={createSoccerMatch} onAddEvent={addSoccerEvent}
            onDeleteEvent={deleteSoccerEvent} onFinishMatch={finishSoccerMatch}
            onUpdateMatchFormation={updateSoccerMatchFormation} onReopenMatch={reopenSoccerMatch}
            onCreateRestMatch={createRestMatch}
            onAddOpponent={addOpponent} onGoToSummary={() => set('phase', 'summary')}
            gameSettings={state.settingsSnapshot || gameSettings} styles={s}
            savedFormation={state.soccerFormation}
            onFormationChange={(f) => dispatch({ type: 'SET_SOCCER_FORMATION', formation: f })}
            onSetMatchOpponent={setSoccerMatchOpponent}
            onCorrectLineup={correctSoccerLineup}
            onSwapLineupPositions={swapSoccerLineupPositions}
            gameFinalized={state.gameFinalized}
          />
        </div>
      </div>
    );
  }

  // ── SUMMARY PHASE ──
  if (phase === "summary") {
    const finished = state.soccerMatches.filter(m => m.status === "finished");
    const sRows = soccerStats;
    const rec = calcSoccerTeamRecord(state.soccerMatches);
    const oppRecords = calcSoccerOpponentRecords(state.soccerMatches);
    const gameDate = gameDateFromId(gameId);

    return (
      <div style={s.app}>
        <div style={s.header}>
          <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <button onClick={onBackToMenu} aria-label="메뉴로" style={{
              position: "absolute", left: 0, background: "none", border: "none",
              color: "var(--app-text-primary)", fontSize: 22, cursor: "pointer", padding: "0 4px", lineHeight: 1,
            }}>‹</button>
            <div style={s.title}>📊 최종 집계</div>
          </div>
          <div style={s.subtitle}>{gameDate.toLocaleDateString("ko-KR")} · {finished.length}경기</div>
        </div>
        <PhaseIndicator activeIndex={3} />
        <div style={s.section}>
          <div style={s.sectionTitle}>🏆 팀 순위 (상대별 전적)</div>
          <div style={s.card}>
            <SoccerStandingsTable records={oppRecords} total={rec} styles={s} />
          </div>
        </div>
        <div style={s.section}>
          <div style={s.sectionTitle}>📊 경기 결과</div>
          <div style={s.card}>
            <SoccerMatchResults matches={state.soccerMatches} styles={s} />
          </div>
        </div>
        <div style={s.section}>
          <div style={s.sectionTitle}>👤 선수별 기록</div>
          <div style={s.card}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr>{["선수", "경기", "골", "어시", "자책", "CS", "실점", "포인트"].map(h => <th key={h} style={s.th}>{h}</th>)}</tr></thead>
              <tbody>
                {sRows.map(p => (
                  <tr key={p.name}>
                    <td style={s.td(true)}>{p.name}</td>
                    <td style={s.td()}>{p.games}</td>
                    <td style={s.td(p.goals > 0)}>{p.goals}</td>
                    <td style={s.td(p.assists > 0)}>{p.assists}</td>
                    <td style={{ ...s.td(p.owngoals > 0), color: p.owngoals > 0 ? C.red : C.white }}>{p.owngoals}</td>
                    <td style={s.td(p.cleanSheets > 0)}>{p.cleanSheets}</td>
                    <td style={s.td()}>{p.conceded}</td>
                    <td style={{ ...s.td(true), fontSize: 14, fontWeight: 800 }}>{p.point}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div style={s.bottomBar}>
          <button onClick={() => set('phase', 'match')} style={s.btn(C.grayDark)}>경기로</button>
          <button onClick={handleFinalize}
            style={{ ...s.btn(gameFinalized ? C.orange : C.green), flex: 1, opacity: teamContext?.role === "관리자" ? 1 : 0.4 }}
            disabled={teamContext?.role !== "관리자"}>
            {teamContext?.role === "관리자"
              ? (gameFinalized ? "수정 후 재전송" : "기록확정(구글시트로 데이터전송)")
              : "기록확정 (관리자만)"}
          </button>
          {onBackToMenu && (
            <button
              onClick={async () => {
                // gameFinalized면 일반 확인, 미확정이면 시트 전송 누락 경고(이미 전송했으면 보관 OK).
                const msg = gameFinalized
                  ? "경기를 아카이브하면 더 이상 수정할 수 없습니다.\n수정이 필요하면 'Archive'에서 복구할 수 있습니다.\n\n아카이브하시겠습니까?"
                  : "⚠️ 이번 세션에서 '기록확정(구글시트 전송)'을 하지 않았습니다.\n\n• 이미 시트로 전송하셨다면 그대로 보관해도 됩니다.\n• 아직 전송 전이라면 보관 시 분석 데이터(로그_*)가 시트에서 누락됩니다 → 취소하고 '기록확정'을 먼저 누르세요.\n\n그래도 보관(아카이브)하시겠습니까?";
                if (!confirm(msg)) return;
                // 펜딩 자동저장 취소 — clearState 후 타이머가 active 노드를 되살리는 레이스 방지
                cancelPendingSave();
                try {
                  await FirebaseSync.saveFinalized(teamContext?.team, gameId, gameState);
                } catch (e) {
                  // finalized 저장 실패 시 active를 지우면 경기가 유실됨 → 차단하고 active 보존.
                  alert(`Archive 실패: finalized 저장에 실패했습니다.\n(${e.message})\n\n데이터 보존을 위해 active를 지우지 않았습니다. 잠시 후 다시 시도해주세요.`);
                  return;
                }
                await FirebaseSync.clearState(teamContext?.team, gameId);
                onBackToMenu();
              }}
              style={{ ...s.btn(C.grayDark), opacity: 1, cursor: "pointer" }}>
              Archive
            </button>
          )}
        </div>
      </div>
    );
  }

  return null;
}
