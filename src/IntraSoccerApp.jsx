import { useState, useCallback, useMemo, useEffect } from 'react';
import { useTheme } from './hooks/useTheme';
import { fetchSheetData } from './services/sheetService';
import { fetchIntraRoster } from './utils/intraSoccer/rosterSheet';
import { canIntra, floatingOf, teamsOf } from './utils/intraSoccer/pools';
import AppSync from './services/appSync';
import FirebaseSync from './services/firebaseSync';
import { useGameReducer } from './hooks/useGameReducer';
import { useFirebaseSync } from './hooks/useFirebaseSync';
import { getSettings, getEffectiveSettings } from './config/settings';
import { makeStyles } from './styles/theme';
import PhaseIndicator from './components/common/PhaseIndicator';
import Modal from './components/common/Modal';
import IntraSoccerMatchView from './components/intra/IntraSoccerMatchView';
import SoccerScheduleModal from './components/game/SoccerScheduleModal';
import SoccerStandingsModal from './components/game/SoccerStandingsModal';
import SoccerStandingsTable from './components/game/SoccerStandingsTable';
import IntraSoccerMatchResults from './components/intra/IntraSoccerMatchResults';
import MatchTabBar from './components/game/MatchTabBar';
import MatchHeader from './components/game/MatchHeader';
import AttendeeSelector from './components/game/AttendeeSelector';
import {
  calcSoccerPlayerStats, calcSoccerPlayerPoint,
  calcSoccerTeamRecord, calcSoccerOpponentRecords,
  countFinishedSoccerMatches, getSoccerPlayedPlayers, keepLockedAttendees, mergeAttendeesIntoRoster,
} from './utils/soccerScoring';
import { buildIntraRows } from './utils/intraSoccer/buildIntraRows';
import { isIntra, sideView } from './utils/intraSoccer/sideView';
import { refreshAfterFinalize } from './utils/refreshAfterFinalize';
import { gameDateFromId } from './utils/gameDate';

// ── 자체전 펼침 헬퍼 ──
// calcSoccerPlayerStats·calcSoccerTeamRecord·calcSoccerOpponentRecords·getSoccerPlayedPlayers·
// calcSoccerScore 는 side 를 모른다 — 자체전 경기 객체를 그대로 넘기면 A·B 양 편 골이 모두
// '우리 골'로 합산된다. 그래서 이 파일의 모든 소비자는 아래 둘 중 하나로 라우팅한다.
//   perSide      : 선수 축 지표 — 자체전 1경기를 A·B 시점 뷰(하버FC 모양) 2개로 펼친다.
//   externalOnly : 팀/상대팀 축 지표 — 자체전은 '상대팀'이 우리 멤버라 무의미하므로 제외(스펙 §7).
const perSide = (ms) => (ms || []).flatMap(m => (isIntra(m) ? [sideView(m, 'A'), sideView(m, 'B')] : [m]));
const externalOnly = (ms) => (ms || []).filter(m => !isIntra(m));
// 팀순위(상대별 전적) 섹션·탭 게이트. 휴식 노드는 외부전 모양이지만 전적이 없다 —
// 자체전 + 휴식만 있는 날에 0전적 팀순위 표가 렌더되는 것을 막는다.
const hasExternalRecord = (ms) => externalOnly(ms).some(m => m.status === 'finished' && m.opponent !== '휴식');

export default function IntraSoccerApp({ authUser, teamContext, isNewGame, gameMode, gameId, onLogout, onBackToMenu }) {
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
        fetchIntraRoster().catch(err => { console.warn("참석명단 로딩 실패:", err.message); return null; })
      );
    }
    Promise.all(loadPromises).then(([sheetData, cumBonus, roster]) => {
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

      // 시트 연동 시 참석자·팀 명단을 미리 채우되 setup 화면에 머문다 (자동 경기진입 없음).
      if (gameMode === "sheetSync" && roster && roster.attendees.length > 0) {
        if (roster.warnings.length) console.warn("[빅마스터FC 참석명단]", roster.warnings.join(" / "));
        dispatch({ type: 'SET_FIELDS', fields: { attendees: roster.attendees, matchMode: "soccer", courtCount: 1 } });
        // 팀 명단은 whole-replace 동기 필드 soccerFormation.intra 에(새 게임이라 기존 soccerFormation 은 null).
        dispatch({ type: 'SET_SOCCER_FORMATION', formation: {
          viewState: "selectOpponent", selectedOpponent: null, selectedPlayers: [],
          intra: { teams: roster.teams, syncedAt: Date.now() },
        } });
      }
    });
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
    // 자체전은 편별 시점 뷰로 펼쳐 넘긴다 — 원본 경기 객체를 넘기면 B팀 골이 A팀 선수 집계에 섞인다.
    const raw = calcSoccerPlayerStats(perSide(finished));
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
    // 자체전은 A·B 양 편을 펼쳐 돌린다 — 원본만 보면 B 선발이 잠기지 않아 '출전했는데 불참'이 뚫린다.
    for (const m of perSide(state.soccerMatches)) for (const n of getSoccerPlayedPlayers(m)) s.add(n);
    return s;
  }, [state.soccerMatches]);

  // RTDB 는 빈 배열을 저장하지 않고(→ undefined) 배열을 객체화({0:..,1:..})할 수 있는데,
  // soccerFormation 은 reconstructState 가 정규화 없이 그대로 복원한다(firebaseSyncDiff.js:388).
  // intra.teams 를 읽는 아래 두 사용처 모두 이 단일 보정 지점을 통과한다.
  const intraTeams = teamsOf(state.soccerFormation);

  // ── 참석명단(팀별 열) 재연동 — 팀 명단은 시트 기준으로 갱신, 출전 기록 있는 선수(locked)는 참석자에 남긴다(D3).
  const syncAttendance = () => {
    set('attendanceLoading', true);
    fetchIntraRoster()
      .then(r => {
        if (r.warnings.length) console.warn("[빅마스터FC 참석명단]", r.warnings.join(" / "));
        const merged = Array.from(new Set([...r.attendees, ...Array.from(locked)]));
        dispatch({ type: 'SET_FIELDS', fields: { attendees: merged } });
        const prev = state.soccerFormation || { viewState: "selectOpponent", selectedOpponent: null, selectedPlayers: [] };
        dispatch({ type: 'SET_SOCCER_FORMATION', formation: {
          ...prev, intra: { teams: r.teams, syncedAt: Date.now(), selectedPair: prev.intra?.selectedPair },
        } });
      })
      .catch(err => alert("참석명단 연동 실패: " + err.message))
      .finally(() => set('attendanceLoading', false));
  };

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
  const setSoccerMatchOpponent = (matchIdx, opponent) => {
    dispatch({ type: 'SET_SOCCER_MATCH_OPPONENT', matchIdx, opponent });
  };
  const correctSoccerLineup = (matchIdx, out, inn) => {
    dispatch({ type: 'CORRECT_SOCCER_LINEUP', matchIdx, out, in: inn });
  };
  const swapSoccerLineupPositions = (matchIdx, aIdx, bIdx) => {
    dispatch({ type: 'SWAP_SOCCER_LINEUP_POSITIONS', matchIdx, aIdx, bIdx });
  };
  // 자체전 편 상태 패치(A는 name만, B는 배치 전체). remapEvents=[out, in]은 그 편 이벤트만 치환.
  const patchSoccerSide = (matchIdx, side, patch, remapEvents) => {
    if (matchIdx < 0) return;
    dispatch({ type: 'PATCH_SOCCER_SIDE', matchIdx, side, patch, ...(remapEvents ? { remapEvents } : {}) });
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
    if (!confirm(`${gameD.getMonth() + 1}월 ${gameD.getDate()}일 축구기록을 확정하시겠습니까?\n\n${finished.length}경기 · 자체전/외부전 로그를 저장합니다.`)) return;
    // 펜딩 자동저장 취소 — 마감 성공 후 clearState된 노드를 타이머가 되살리는 레이스 방지
    cancelPendingSave();

    // 외부전은 하버FC 와 같은 빌더·같은 인자로(출력 동일), 자체전은 편별 시점 뷰로 빌드한다(스펙 §7).
    // 포인트 로그는 외부전 행만 — 자체전을 넣으면 팀 전적이 이중 계산된다.
    const team = teamContext?.team || '';
    const { pointLogRows, playerLogRows, rawEvents, rawPlayerGames, matchRows } =
      buildIntraRows({ team, dateStr, inputTime, finished });

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
      }
      // gameFinalized를 active 노드에 반영(풋살과 동일) — 대시보드 '전송완료' 뱃지 + Archive 활성 근거.
      // 자동 종료(clearState/메뉴) 제거: 확정 후에도 summary에 남아 '수정 후 재전송'·'Archive' 단계 제공.
      await FirebaseSync.syncDiff(teamContext?.team || '', gameId || "legacy", lastSyncedStateRef.current, finalState);
      lastSyncedStateRef.current = finalState;
      set('gameFinalized', allOk);
      // 캐시 재적재는 마감 기록(saveFinalized + syncDiff + set)이 끝난 뒤에 돈다 — 파생
      // 데이터를 critical path 에 두면 이 구간(Apps Script 최대 6회, 콜드스타트 각 10초)에서
      // 앱이 닫힐 때 gameFinalized 가 유실돼 유저가 재전송하고 5개 시트에 중복 행이 생긴다
      // (자동 멱등화가 없어 수동 삭제가 필요하다).
      // allOk 가 아니어도 돈다 — legacyOk 를 통과한 이상 포인트로그·선수별집계에는 이미
      // 행이 들어갔고, refresh 는 시트(진실 소스)를 다시 읽으므로 어떤 상태든 정확히 반영한다.
      // 여기서 돌지 않으면 그 두 시트의 캐시가 최대 12시간(L2 TTL) 낡은 채 남는다.
      await refreshAfterFinalize({ sport: '축구' });
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
        {(() => {
          const teams = intraTeams;
          if (teams.length === 0) return null;
          const floating = floatingOf(attendees, teams);
          return (
            <div style={s.section}>
              <div style={s.sectionTitle}>🟧🟦 자체전 팀 (시트)</div>
              <div style={{ ...s.card, fontSize: 12, color: C.grayLight, lineHeight: 1.7 }}>
                {/* t.players: teamsOf(intraTeams)가 배열을 보장하므로 여기서 || [] 방어가 불필요하다. */}
                {teams.map(t => <div key={t.name}><b style={{ color: C.white }}>{t.name}</b> {t.players.filter(n => attendees.includes(n)).length}명</div>)}
                {floating.length > 0 && <div><b style={{ color: C.white }}>팀 없음(유동)</b> {floating.join(", ")}</div>}
              </div>
            </div>
          );
        })()}
        <div style={s.section}>
          <div style={s.sectionTitle}>🆚 참석팀 <span style={{ fontSize: 12, fontWeight: 400, color: C.gray }}>({(state.opponents || []).length}팀)</span></div>
          <div style={s.card}>
            <div style={{ fontSize: 12, color: C.gray, marginBottom: 8 }}>오늘 온 상대팀을 고르세요 (시트의 자주 붙은 팀 순) · 자체전만 하는 날은 비워도 됩니다</div>
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
            const intraGate = canIntra({ teams: intraTeams, attendees, pair: state.soccerFormation?.intra?.selectedPair });
            const canStart = (state.opponents || []).length > 0 || intraGate.ok;
            return (
              <button onClick={() => { if (canStart) dispatch({ type: 'START_MATCHES', schedule: null, pushState: null }); }}
                disabled={!canStart}
                style={{ ...s.btnFull(C.accent, C.bg), opacity: canStart ? 1 : 0.4, cursor: canStart ? "pointer" : "not-allowed" }}>
                {canStart ? `축구 경기 시작 (${attendees.length}명)` : `외부전: 상대팀 선택 · 자체전: ${intraGate.reason}`}
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
    // 팀 전적·상대팀별 전적은 외부전만 — 자체전의 '상대'는 우리 멤버라 이 축이 무의미하다(스펙 §7).
    const externals = externalOnly(state.soccerMatches);
    const teamRec = calcSoccerTeamRecord(externals);
    const oppRecords = calcSoccerOpponentRecords(externals);
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
            { key: 'standings', label: '팀순위', onClick: () => set('matchModal', 'soccerStandings'), hidden: !hasExternalRecord(state.soccerMatches) },
            { key: 'playerStats', label: '개인기록', onClick: () => set('matchModal', 'playerStats') },
            { key: 'roster', label: '참석명단', onClick: () => set('matchModal', 'roster') },
            { key: 'finish', label: '경기마감', tone: 'green', strong: true, onClick: () => set('phase', 'summary'), hidden: finishedCount === 0 },
            { key: 'delete', label: '경기삭제', tone: 'red', onClick: deleteSoccerGame, hidden: teamContext?.role !== '관리자' },
          ]} />
        </MatchHeader>

        {matchModal === "soccerSchedule" && (
          // 자체전은 A 시점 뷰로 넘긴다(점수 = A:B, 상대 = B 이름). 모달의 '우리팀' 칩은 자체전에서 A팀을 뜻한다.
          <SoccerScheduleModal soccerMatches={state.soccerMatches.map(m => isIntra(m) ? sideView(m, 'A') : m)} onClose={() => set('matchModal', null)} styles={s} />
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
          <IntraSoccerMatchView
            soccerMatches={state.soccerMatches} currentMatchIdx={state.currentMatchIdx}
            attendees={attendees} opponents={state.opponents || []}
            onRemoveOpponent={removeOpponent} onRenameOpponent={renameOpponent}
            onCreateMatch={createSoccerMatch} onAddEvent={addSoccerEvent}
            onDeleteEvent={deleteSoccerEvent} onFinishMatch={finishSoccerMatch}
            onUpdateMatchFormation={updateSoccerMatchFormation}
            onCreateRestMatch={createRestMatch}
            onAddOpponent={addOpponent} onGoToSummary={() => set('phase', 'summary')}
            gameSettings={state.settingsSnapshot || gameSettings} styles={s}
            savedFormation={state.soccerFormation}
            onFormationChange={(f) => dispatch({ type: 'SET_SOCCER_FORMATION', formation: f })}
            onSetMatchOpponent={setSoccerMatchOpponent}
            onCorrectLineup={correctSoccerLineup}
            onSwapLineupPositions={swapSoccerLineupPositions}
            gameFinalized={state.gameFinalized}
            onPatchSide={patchSoccerSide}
          />
        </div>
      </div>
    );
  }

  // ── SUMMARY PHASE ──
  if (phase === "summary") {
    const finished = state.soccerMatches.filter(m => m.status === "finished");
    const sRows = soccerStats;
    // 팀 전적·상대팀별 전적은 외부전만(스펙 §7) — 자체전만 한 날은 섹션 자체를 숨긴다.
    const externals = externalOnly(state.soccerMatches);
    const rec = calcSoccerTeamRecord(externals);
    const oppRecords = calcSoccerOpponentRecords(externals);
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
        {hasExternalRecord(state.soccerMatches) && (
          <div style={s.section}>
            <div style={s.sectionTitle}>🏆 팀 순위 (상대별 전적)</div>
            <div style={s.card}>
              <SoccerStandingsTable records={oppRecords} total={rec} styles={s} />
            </div>
          </div>
        )}
        <div style={s.section}>
          <div style={s.sectionTitle}>📊 경기 결과</div>
          <div style={s.card}>
            <IntraSoccerMatchResults matches={state.soccerMatches} styles={s} />
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
