import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { TEAM_COLORS } from './config/constants';
import { FALLBACK_DATA } from './config/fallbackData';
import { useTheme } from './hooks/useTheme';
import { getPlayerPoint, getPlayerData, teamPower, calcMatchScore } from './utils/scoring';
import { snakeDraft } from './utils/draft';
import { generate4Team2Court, generate5Team2Court, generate6Team2Court, generate6TeamSecondHalf, generate7Team2Court, generate8Team2Court, generate8TeamSecondHalf, generate1Court } from './utils/brackets';
import { generateEventId, formatEventInputTime } from './utils/idGenerator';
import { refreshAfterFinalize } from './utils/refreshAfterFinalize';
import { buildRawEventsFromFutsal, buildRawPlayerGamesFromFutsal } from './utils/rawLogBuilders';
import { buildRoundRowsFromFutsal } from './utils/matchRowBuilder';
import { gameDateFromId } from './utils/gameDate';
import { fetchSheetData, fetchAttendanceData } from './services/sheetService';
import AppSync from './services/appSync';
import SheetCache from './services/sheetCache';
import FirebaseSync from './services/firebaseSync';
import { useGameReducer } from './hooks/useGameReducer';
import { useFirebaseSync } from './hooks/useFirebaseSync';
import { getSettings, getEffectiveSettings } from './config/settings';
import { makeStyles } from './styles/theme';
import PhaseIndicator from './components/common/PhaseIndicator';
import Modal from './components/common/Modal';
import { BackIcon, ListIcon, PlusIcon } from './components/common/icons';
import ScheduleMatchView from './components/game/ScheduleMatchView';
import FreeMatchView from './components/game/FreeMatchView';
import PushMatchView from './components/game/PushMatchView';
import { createInitialPushState, calcNextPushMatch } from './utils/pushMatch';
import ScheduleModal from './components/game/ScheduleModal';
import BalancedScheduleModal from './components/game/BalancedScheduleModal';
import StandingsModal from './components/game/StandingsModal';
import PlayerStatsModal from './components/game/PlayerStatsModal';

export default function App({ authUser, teamContext, isNewGame, gameMode, gameId, onLogout, onBackToMenu }) {
  const gameSettings = useMemo(() => getSettings(teamContext?.team), [teamContext?.team]);
  const [state, dispatch] = useGameReducer();
  const {
    phase, dataLoading, dataSource, seasonPlayers, seasonCrova, seasonGoguma,
    syncStatus, attendanceLoading, attendees, newPlayer, teamCount, courtCount,
    matchMode, rotations, draftMode, freeSelectTeam, teams, teamNames,
    teamColorIndices, gks, gksHistory, liveMercs, absentees, freeCourtMatches, editingTeamName, moveSource, schedule, currentRoundIdx,
    viewingRoundIdx, confirmedRounds, completedMatches, allEvents, isExtraRound,
    splitPhase, earlyFinish, gameFinalized, matchModal, matchModal_sortKey, playerSortMode, pushState, teamEditMode,
    settingsSnapshot,
  } = state;

  const set = (field, value) => dispatch({ type: 'SET_FIELD', field, value });
  const [selectedPoolPlayers, setSelectedPoolPlayers] = useState([]);
  // ScheduleView 활성 중에도 자유 라운드(F-id) 매치를 직접 열어볼 수 있게.
  // null이 아니면 해당 자유 매치를 FreeMatchView의 forced 모드로 렌더링.
  const [viewingFreeIdx, setViewingFreeIdx] = useState(null);

  // eslint-disable-next-line react-hooks/exhaustive-deps -- 마운트 시 1회: gameId/isNewGame는 props로 변경되지 않음
  useEffect(() => {
    const team = teamContext?.team || "";

    // 이어하기: Firebase에서 복원
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

    // 새 경기: 모든 데이터 병렬 로딩
    _loadAllData(team);

  }, []);

  // 백그라운드로 시트 데이터 + 누적보너스 로딩 (이어하기 시)
  const _loadBackgroundData = (team) => {
    const es = getEffectiveSettings(teamContext.team, "풋살");
    Promise.all([
      fetchSheetData().catch(() => null),
      es.useCrovaGoguma
        ? SheetCache.get('cumulativeBonus', { sport: '풋살' }).catch(() => ({ crova: {}, goguma: {} }))
        : Promise.resolve({ crova: {}, goguma: {} }),
    ]).then(([sheetData, cumBonus]) => {
      const fields = {};
      if (sheetData) { fields.seasonPlayers = sheetData.players; fields.dataSource = "sheet"; }
      if (cumBonus) { fields.seasonCrova = cumBonus.crova || {}; fields.seasonGoguma = cumBonus.goguma || {}; }
      if (Object.keys(fields).length > 0) dispatch({ type: 'SET_FIELDS', fields });
    });
  };

  // 전체 데이터 로딩 (새 경기/구글시트 연동)
  const _loadAllData = (team) => {
    const es = getEffectiveSettings(teamContext.team, "풋살");
    const loadPromises = [
      fetchSheetData().catch(err => { console.warn("시트 로딩 실패:", err.message); return null; }),
      es.useCrovaGoguma
        ? SheetCache.get('cumulativeBonus', { sport: '풋살' }).catch(err => { console.warn("누적보너스 로딩 실패:", err.message); return { crova: {}, goguma: {} }; })
        : Promise.resolve({ crova: {}, goguma: {} }),
    ];
    if (gameMode === "sheetSync") {
      loadPromises.push(
        fetchAttendanceData().catch(err => { console.warn("참석명단 로딩 실패:", err.message); return null; })
      );
    }
    Promise.all(loadPromises).then(([sheetData, cumBonus, attendanceData]) => {
      const fields = { dataLoading: false };
      let players = null;
      if (sheetData) {
        fields.seasonPlayers = sheetData.players;
        fields.dataSource = "sheet";
        players = sheetData.players;
      } else {
        fields.dataSource = "fallback";
      }
      if (cumBonus) {
        fields.seasonCrova = cumBonus.crova || {};
        fields.seasonGoguma = cumBonus.goguma || {};
      }
      if (isNewGame) {
        const { _meta, ...snap } = getEffectiveSettings(teamContext.team, "풋살");
        fields.settingsSnapshot = snap;
      }
      dispatch({ type: 'SET_FIELDS', fields });

      // 시트의 팀 편성을 그대로 사용, 없으면 스네이크 드래프트
      if (gameMode === "sheetSync" && attendanceData && attendanceData.attendees.length > 0) {
        const sp = players || FALLBACK_DATA.players;
        const prebuilt = attendanceData.prebuiltTeams || [];
        const hasPrebuilt = prebuilt.length > 0 && prebuilt.some(t => t.length > 0);

        let finalTeams;
        let sheetTeamCount;
        if (hasPrebuilt) {
          // 시트에서 이미 편성된 팀 사용 (G2:L9)
          finalTeams = prebuilt;
          sheetTeamCount = prebuilt.length;
        } else {
          // 편성 없으면 스네이크 드래프트
          sheetTeamCount = attendanceData.teamCount || 4;
          finalTeams = snakeDraft(attendanceData.attendees, sheetTeamCount, sp);
        }

        // 참석자 = 모든 팀원 합산 (시트 편성에 포함된 용병 포함)
        const allPlayers = [...new Set([...attendanceData.attendees, ...finalTeams.flat()])];

        const makeNameFromTeam = (members) => {
          if (members.length === 0) return "팀";
          const top = [...members].sort((a, b) => getPlayerPoint(b, sp) - getPlayerPoint(a, sp))[0];
          const firstName = top.length > 1 ? top.slice(1) : top;
          return `팀 ${firstName}`;
        };
        // 시트에서 팀명을 가져왔으면 사용, 없으면 자동 생성
        const sheetNames = attendanceData.prebuiltTeamNames || [];
        const tNames = hasPrebuilt && sheetNames.length === finalTeams.length
          ? sheetNames
          : finalTeams.map(t => makeNameFromTeam(t));
        const tColors = Array.from({ length: sheetTeamCount }, (_, i) => i % TEAM_COLORS.length);

        const cc = sheetTeamCount <= 3 ? 1 : 2;
        let sched = null;
        if (cc === 2) {
          if (sheetTeamCount === 4) sched = generate4Team2Court();
          else if (sheetTeamCount === 5) sched = generate5Team2Court();
          else if (sheetTeamCount === 6) sched = generate6Team2Court().firstHalf;
          else if (sheetTeamCount === 7) sched = generate7Team2Court();
          else if (sheetTeamCount === 8) sched = generate8Team2Court().firstHalf;
        }
        // 1코트: 회전수 선택을 위해 teamBuild로 이동
        if (cc === 1) {
          dispatch({
            type: 'SET_FIELDS',
            fields: {
              attendees: allPlayers,
              teamCount: sheetTeamCount,
              courtCount: cc,
              matchMode: "schedule",
              draftMode: hasPrebuilt ? "sheet" : "snake",
              teams: finalTeams,
              teamNames: tNames,
              teamColorIndices: tColors,
              gks: {},
              phase: "teamBuild",
            },
          });
          return;
        }

        if (!sched) sched = generate1Court(sheetTeamCount, 2);

        dispatch({
          type: 'SET_FIELDS',
          fields: {
            attendees: allPlayers,
            teamCount: sheetTeamCount,
            courtCount: cc,
            matchMode: "schedule",
            draftMode: hasPrebuilt ? "sheet" : "snake",
            teams: finalTeams,
            teamNames: tNames,
            teamColorIndices: tColors,
            gks: {},
            schedule: sched || [],
            currentRoundIdx: 0,
            completedMatches: [],
            allEvents: [],
            isExtraRound: false,
            viewingRoundIdx: 0,
            confirmedRounds: {},
            matchModal: null,
            phase: "match",
            ...(sheetTeamCount === 6 || sheetTeamCount === 8 ? { splitPhase: "first" } : {}),
          },
        });
      }
    });
  };

  // Attendance sync
  const syncAttendance = () => {
    set('attendanceLoading', true);
    fetchAttendanceData()
      .then(data => {
        dispatch({ type: 'SET_FIELDS', fields: { attendees: data.attendees, ...(data.teamCount ? { teamCount: data.teamCount } : {}) } });
      })
      .catch(err => alert("참석명단 연동 실패: " + err.message))
      .finally(() => set('attendanceLoading', false));
  };

  // Auto-save + 구독 — 풋살/축구 공용 훅 (src/hooks/useFirebaseSync.js)
  const setSyncStatus = useCallback((v) => dispatch({ type: 'SET_FIELD', field: 'syncStatus', value: v }), [dispatch]);
  const { editorTag, autoSync, lastSyncedStateRef, cancelPendingSave } = useFirebaseSync({
    teamContext, gameId, authUser, dispatch, setSyncStatus,
  });
  const gameState = useMemo(() => ({
    gameId: gameId || "legacy",
    gameCreator: state.gameCreator || authUser?.name || "알 수 없음",
    phase, teams, teamNames, teamColorIndices, gks, gksHistory, liveMercs, absentees, freeCourtMatches, allEvents,
    completedMatches, schedule, currentRoundIdx, confirmedRounds, attendees,
    teamCount, courtCount, matchMode, isExtraRound, splitPhase, rotations, earlyFinish, gameFinalized, pushState,
    settingsSnapshot,
    lastEditor: editorTag,
  }), [state.gameCreator, phase, teams, teamNames, teamColorIndices, gks, gksHistory, liveMercs, absentees, freeCourtMatches, allEvents, completedMatches, schedule, currentRoundIdx, confirmedRounds, attendees, teamCount, courtCount, matchMode, isExtraRound, splitPhase, rotations, earlyFinish, gameFinalized, pushState, settingsSnapshot, authUser, gameId, editorTag]);

  // 자동저장 트리거. gameState의 일부 필드(schedule/teamCount/settingsSnapshot 등)는
  // setup 단계에서만 바뀌거나 phase 전환에 동반되므로 deps에서 의도적으로 제외.
  // 새 필드를 gameState에 추가할 때 단독으로 바뀔 수 있으면 여기 deps에도 넣을 것.
  useEffect(() => {
    if (phase !== "setup" && phase !== "") {
      autoSync(gameState);
    }
  }, [autoSync, allEvents, completedMatches, currentRoundIdx, phase, gks, gksHistory, liveMercs, absentees, freeCourtMatches, confirmedRounds, pushState, teams, teamNames, splitPhase, attendees]);

  // Derived state
  const sortedPlayers = useMemo(() => {
    const arr = [...seasonPlayers];
    if (playerSortMode === "name") return arr.sort((a, b) => a.name.localeCompare(b.name, "ko"));
    return arr.sort((a, b) => b.point - a.point);
  }, [seasonPlayers, playerSortMode]);

  const getTeamStandings = useCallback(() => {
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
    // 6·8팀 split second phase: 전반 6라운드 순위로 상/하위 리그 라벨 부여.
    const leagueByTeam = {};
    if ((teamCount === 6 || teamCount === 8) && splitPhase === 'second') {
      const fhStats = {};
      teamNames.forEach((t, i) => { fhStats[t] = { idx: i, gf: 0, ga: 0, points: 0 }; });
      completedMatches.forEach(m => {
        if (m.isExtra || !fhStats[m.homeTeam] || !fhStats[m.awayTeam]) return;
        const rIdx = typeof m.matchId === 'string' ? parseInt(m.matchId.match(/^R(\d+)/)?.[1] ?? -1) - 1 : -1;
        if (rIdx < 0 || rIdx >= 6) return; // 전반 6라운드만
        fhStats[m.homeTeam].gf += m.homeScore; fhStats[m.homeTeam].ga += m.awayScore;
        fhStats[m.awayTeam].gf += m.awayScore; fhStats[m.awayTeam].ga += m.homeScore;
        if (m.homeScore > m.awayScore) fhStats[m.homeTeam].points += 3;
        else if (m.awayScore > m.homeScore) fhStats[m.awayTeam].points += 3;
        else { fhStats[m.homeTeam].points++; fhStats[m.awayTeam].points++; }
      });
      const fhRanked = Object.entries(fhStats)
        .map(([name, s]) => ({ name, ...s }))
        .sort((a, b) => (b.points - a.points) || ((b.gf - b.ga) - (a.gf - a.ga)) || (b.gf - a.gf));
      fhRanked.forEach((t, i) => { leagueByTeam[t.name] = i < teamCount / 2 ? 'upper' : 'lower'; });
    }
    return Object.entries(stats)
      .map(([name, s]) => ({ name, ...s, league: leagueByTeam[name] || null }))
      .sort((a, b) => (b.points - a.points) || ((b.gf - b.ga) - (a.gf - a.ga)) || (b.gf - a.gf));
  }, [completedMatches, teamNames, teamCount, splitPhase]);

  const finalStandings = useMemo(() => getTeamStandings(), [getTeamStandings]);

  const allRoundsComplete = useMemo(() => {
    if (schedule.length > 0 && matchMode !== "push") {
      // 마지막 라운드가 확정됐으면 전체 완료
      const lastIdx = schedule.length - 1;
      return confirmedRounds[lastIdx] === true;
    }
    if (matchMode === "free" || matchMode === "push") return phase === "summary";
    return false;
  }, [matchMode, schedule, confirmedRounds, phase]);

  // 자동 segment + free 모드 공존 케이스를 위한 헬퍼.
  // 대진표 모드는 라운드 완료 후에도 ScheduleView 잔류(기존 동작 보존),
  // free 모드만 라운드 완료 시 FreeView로 자동 복귀.
  const shouldShowSchedule = matchMode !== "push" && schedule.length > 0 && !isExtraRound
    && !(matchMode === "free" && allRoundsComplete);

  // 자유 + 자동 schedule 혼합 모드에서 schedule 라운드 표시 번호를 자유 라운드 수만큼 offset.
  // 예: 자유 5R 후 자동 R1은 사용자에겐 '라운드 6'으로 보여야 함.
  // 일반 대진표 모드(matchMode='schedule')는 offset=0이라 영향 없음.
  const roundDisplayOffset = matchMode === "free"
    ? completedMatches.filter(m => m?.matchId?.startsWith?.('F')).length
    : 0;

  // 자유대진 라이브 매치 진행 중 여부 — F{n}_C{c} 이벤트가 있고 completedMatches에 없음
  const hasLiveFreeMatch = useMemo(() => {
    if (matchMode !== "free") return false;
    const completedIds = new Set(completedMatches.map(m => m.matchId).filter(Boolean));
    return allEvents.some(e => {
      const id = e.matchId;
      return typeof id === 'string' && id.startsWith('F') && !completedIds.has(id);
    });
  }, [matchMode, allEvents, completedMatches]);

  const getPlayerTeamName = useCallback((player) => {
    for (let i = 0; i < teams.length; i++) { if (teams[i].includes(player)) return teamNames[i]; }
    return null;
  }, [teams, teamNames]);

  const playerMatchStats = useMemo(() => {
    const stats = {};
    attendees.forEach(p => { stats[p] = { goals: 0, assists: 0, owngoals: 0, fouls: 0, conceded: 0, keeperGames: 0, cleanSheets: 0 }; });
    allEvents.forEach(e => {
      if (e.type === "goal") { if (stats[e.player]) stats[e.player].goals++; if (e.assist && stats[e.assist]) stats[e.assist].assists++; if (e.concedingGk && stats[e.concedingGk]) stats[e.concedingGk].conceded++; }
      if (e.type === "owngoal") { if (stats[e.player]) stats[e.player].owngoals++; if (e.concedingGk && stats[e.concedingGk]) stats[e.concedingGk].conceded += 2; }
      // foul(옐로카드)은 스코어·GK 실점 무영향 — 레거시 이벤트에 concedingGk가 남아 있어도 미집계
      if (e.type === "foul") { if (stats[e.player]) stats[e.player].fouls++; }
    });
    completedMatches.forEach(m => {
      if (m.homeGk && stats[m.homeGk]) { stats[m.homeGk].keeperGames++; if (m.awayScore === 0) stats[m.homeGk].cleanSheets++; }
      if (m.awayGk && stats[m.awayGk]) { stats[m.awayGk].keeperGames++; if (m.homeScore === 0) stats[m.awayGk].cleanSheets++; }
    });
    return stats;
  }, [allEvents, completedMatches, attendees]);

  const getSeasonLeader = useCallback((type) => {
    const data = type === "crova" ? seasonCrova : seasonGoguma;
    const entries = Object.entries(data).filter(([, v]) => v !== 0);
    if (entries.length === 0) return null;
    const sorted = entries.sort(([, a], [, b]) => b - a);
    if (sorted.length >= 2 && sorted[0][1] === sorted[1][1]) return null;
    return sorted[0][0];
  }, [seasonCrova, seasonGoguma]);

  const calcPlayerPoints = useCallback((player) => {
    const st = playerMatchStats[player];
    if (!st) return { total: 0, goals: 0, assists: 0, owngoals: 0, fouls: 0, cleanSheets: 0, crova: 0, goguma: 0, conceded: 0, keeperGames: 0 };
    const ES = state.settingsSnapshot || gameSettings;
    const { ownGoalPoint, foulPoint = -1, crovaPoint, gogumaPoint, bonusMultiplier, useCrovaGoguma } = ES;
    let pts = st.goals + st.assists + st.owngoals * ownGoalPoint + (st.fouls || 0) * foulPoint + st.cleanSheets;
    let crova = 0, goguma = 0;
    if (courtCount === 2 && matchMode !== "push" && useCrovaGoguma && (allRoundsComplete || earlyFinish) && finalStandings.length > 0 && completedMatches.filter(m => !m.isExtra).length > 0) {
      const pt = getPlayerTeamName(player);
      const first = finalStandings[0], last = finalStandings[finalStandings.length - 1];
      const sgl = getSeasonLeader("goguma"), scl = getSeasonLeader("crova");
      let cm = 1, gm = 1;
      if (sgl && getPlayerTeamName(sgl) === first.name) cm = bonusMultiplier;
      if (scl && getPlayerTeamName(scl) === last.name) gm = bonusMultiplier;
      if (pt === first.name) { crova = crovaPoint * cm; pts += crova; }
      if (pt === last.name) { goguma = gogumaPoint * gm; pts += goguma; }
    }
    return { total: pts, goals: st.goals, assists: st.assists, owngoals: st.owngoals, fouls: st.fouls || 0, cleanSheets: st.cleanSheets, crova, goguma, conceded: st.conceded, keeperGames: st.keeperGames };
  }, [playerMatchStats, finalStandings, completedMatches, getPlayerTeamName, getSeasonLeader, allRoundsComplete, earlyFinish, gameSettings, courtCount]);

  // Actions
  const handleGkChange = useCallback((teamIdx, player) => {
    set('gks', { ...gks, [teamIdx]: player });
  }, [gks]);

  // 라이브 매치별 용병 추가/제거 — 라운드 확정 시 reducer가 명단 스냅샷에 합쳐 저장.
  const handleAddLiveMerc = useCallback((matchId, teamIdx, player) => {
    dispatch({ type: 'ADD_LIVE_MERC', matchId, teamIdx, player });
  }, []);
  const handleRemoveLiveMerc = useCallback((matchId, player) => {
    dispatch({ type: 'REMOVE_LIVE_MERC', matchId, player });
  }, []);

  // 매치별 휴식 토글
  const handleToggleAbsent = useCallback(({ matchId, teamIdx, player }) => {
    dispatch({ type: 'TOGGLE_ABSENT', matchId, teamIdx, player });
  }, []);

  // 확정된 과거 매치의 부분 수정. 매치업(homeIdx/awayIdx)과 이후 매치들은 영향 없음.
  const handleEditPastGk = useCallback((matchId, side, player) => {
    dispatch({ type: 'EDIT_PAST_GK', matchId, side, player });
  }, []);
  const handleEditPastMercAdd = useCallback((matchId, teamIdx, player) => {
    dispatch({ type: 'EDIT_PAST_MERC_ADD', matchId, teamIdx, player });
  }, []);
  const handleEditPastMercRemove = useCallback((matchId, player) => {
    dispatch({ type: 'EDIT_PAST_MERC_REMOVE', matchId, player });
  }, []);
  const handleEditPastAbsent = useCallback(({ matchId, teamIdx, player }) => {
    dispatch({ type: 'EDIT_PAST_ABSENT_TOGGLE', matchId, teamIdx, player });
  }, []);

  const recordMatchEvent = (courtId, event) => dispatch({ type: 'ADD_EVENT', event: { ...event, id: generateEventId(), courtId, timestamp: Date.now() } });
  const undoMatchEvent = (courtId, matchId) => dispatch({ type: 'UNDO_EVENT', courtId, matchId });
  const deleteEvent = (globalIdx) => dispatch({ type: 'DELETE_EVENT', index: globalIdx });
  const editEvent = (globalIdx, updatedEvent) => dispatch({ type: 'EDIT_EVENT', index: globalIdx, event: updatedEvent });

  const finishMatch = (matchData) => dispatch({ type: 'FINISH_MATCH', match: { ...matchData, isExtra: isExtraRound } });
  // free 모드 두 코트 atomic finalize. 라운드 내 다른 매치 mercs를 base에서 제외하고 한 번에 저장.
  const confirmFreeRound = (results) => dispatch({ type: 'CONFIRM_FREE_ROUND', results: results.map(r => ({ ...r, isExtra: isExtraRound })) });
  // 자유대진 수동 편성 — reducer state(freeCourtMatches)에 저장해 RTDB로 실시간 공유.
  const setFreeCourtMatch = (courtIdx, home, away) => dispatch({ type: 'SET_FREE_COURT_MATCH', courtIdx, home, away });
  const confirmPushRound = (matchResult, newPushState) => {
    dispatch({ type: 'CONFIRM_PUSH_ROUND', matchResult, newPushState });
  };

  const unconfirmLastPushRound = () => {
    if (completedMatches.length === 0) return;
    const last = completedMatches[completedMatches.length - 1];
    if (!confirm(`${last.homeTeam} ${last.homeScore}:${last.awayScore} ${last.awayTeam}\n\n이 경기의 확정을 취소하시겠습니까?`)) return;
    // pushState를 이전 상태로 되돌리기: 마지막 경기 결과를 제외하고 처음부터 재계산
    let prevPushState = createInitialPushState(teamCount);
    for (let i = 0; i < completedMatches.length - 1; i++) {
      const m = completedMatches[i];
      prevPushState = calcNextPushMatch(prevPushState, { homeIdx: m.homeIdx, awayIdx: m.awayIdx, homeScore: m.homeScore, awayScore: m.awayScore }, teamCount, teamNames);
    }
    dispatch({ type: 'UNCONFIRM_PUSH_ROUND', prevPushState });
  };

  const makeTeamName = (members) => {
    const top = [...members].sort((a, b) => getPlayerPoint(b, seasonPlayers) - getPlayerPoint(a, seasonPlayers))[0];
    const firstName = top.length > 1 ? top.slice(1) : top;
    return `팀${firstName}`;
  };

  const sheetDraft = () => {
    if (attendanceLoading) return;
    set('attendanceLoading', true);
    fetchAttendanceData()
      .then(data => {
        const prebuilt = data?.prebuiltTeams || [];
        if (prebuilt.length === 0 || !prebuilt.some(t => t.length > 0)) {
          alert("시트에 팀 편성 데이터가 없습니다.");
          return;
        }
        const sheetTeamCount = prebuilt.length;
        const allPlayers = [...new Set([...(data.attendees || []), ...prebuilt.flat()])];
        const tNames = (data.prebuiltTeamNames && data.prebuiltTeamNames.length === sheetTeamCount)
          ? data.prebuiltTeamNames
          : prebuilt.map(t => makeTeamName(t));
        const tColors = Array.from({ length: sheetTeamCount }, (_, i) => i % TEAM_COLORS.length);
        dispatch({
          type: 'SET_FIELDS',
          fields: {
            draftMode: 'sheet',
            attendees: allPlayers,
            teamCount: sheetTeamCount,
            teams: prebuilt,
            teamNames: tNames,
            teamColorIndices: tColors,
            gks: {},
          },
        });
      })
      .catch(err => alert("시트 연동 실패: " + err.message))
      .finally(() => set('attendanceLoading', false));
  };

  const goToTeamBuild = () => {
    if (draftMode === "snake") {
      if (attendees.length < teamCount * 2) { alert(`최소 ${teamCount * 2}명 선택`); return; }
      const drafted = snakeDraft(attendees, teamCount, seasonPlayers);
      dispatch({ type: 'SET_FIELDS', fields: { teams: drafted, teamNames: drafted.map(t => makeTeamName(t)), teamColorIndices: Array.from({ length: teamCount }, (_, i) => i % TEAM_COLORS.length), gks: {}, phase: "teamBuild" } });
    } else if (draftMode === "sheet") {
      if (!teams.length || !teams.some(t => t.length > 0)) {
        alert("먼저 시트 연동 버튼을 눌러주세요.");
        return;
      }
      set('phase', 'teamBuild');
    } else {
      if (attendees.length === 0) {
        dispatch({ type: 'SET_FIELDS', fields: { attendees: sortedPlayers.map(p => p.name) } });
      }
      dispatch({ type: 'SET_FIELDS', fields: { teams: Array.from({ length: teamCount }, () => []), teamNames: Array.from({ length: teamCount }, (_, i) => `팀 ${i + 1}`), teamColorIndices: Array.from({ length: teamCount }, (_, i) => i % TEAM_COLORS.length), gks: {}, freeSelectTeam: 0, phase: "teamBuild" } });
    }
  };

  const reshuffleTeams = () => {
    const d = snakeDraft(attendees, teamCount, seasonPlayers);
    dispatch({ type: 'SET_FIELDS', fields: { teams: d, teamNames: d.map(t => makeTeamName(t)), gks: {} } });
  };

  // 다중 선택된 선수를 한 팀에 일괄 배정 (attendees 자동 포함 + 한 번의 dispatch로 batch)
  const addPlayersToTeam = (players, targetIdx) => {
    if (!players.length) return;
    const newAttendees = [...attendees];
    for (const p of players) {
      if (!newAttendees.includes(p)) newAttendees.push(p);
    }
    const newTeams = teams.map(t => [...t]);
    newTeams[targetIdx].push(...players);
    const newNames = [...teamNames];
    newNames[targetIdx] = makeTeamName(newTeams[targetIdx]);
    dispatch({ type: 'SET_FIELDS', fields: {
      attendees: newAttendees,
      teams: newTeams,
      teamNames: newNames,
    } });
  };

  const togglePoolSelect = (player) => {
    setSelectedPoolPlayers(prev => prev.includes(player) ? prev.filter(p => p !== player) : [...prev, player]);
  };

  const addSelectedToTeam = (targetIdx) => {
    if (!selectedPoolPlayers.length) return;
    addPlayersToTeam(selectedPoolPlayers, targetIdx);
    setSelectedPoolPlayers([]);
  };

  const freeRemovePlayer = (player, teamIdx) => {
    const newTeams = teams.map(t => [...t]);
    newTeams[teamIdx] = newTeams[teamIdx].filter(p => p !== player);
    const newNames = [...teamNames];
    newNames[teamIdx] = newTeams[teamIdx].length > 0 ? makeTeamName(newTeams[teamIdx]) : `팀 ${teamIdx + 1}`;
    const newGks = { ...gks };
    if (newGks[teamIdx] === player) delete newGks[teamIdx];
    dispatch({ type: 'SET_FIELDS', fields: { teams: newTeams, teamNames: newNames, gks: newGks } });
  };

  const addGuestPlayer = () => {
    const name = newPlayer.trim();
    if (!name || attendees.includes(name) || teams.flat().includes(name)) { set('newPlayer', ""); return; }
    dispatch({ type: 'SET_FIELDS', fields: { attendees: [...attendees, name], newPlayer: "" } });
    setSelectedPoolPlayers(prev => prev.includes(name) ? prev : [...prev, name]);
  };

  const unassignedPlayers = useMemo(() => {
    const assigned = new Set(teams.flat());
    return attendees.filter(p => !assigned.has(p));
  }, [teams, attendees]);

  const absentSeasonPool = useMemo(() => {
    if (!teamEditMode) return [];
    const assigned = new Set(teams.flat());
    return seasonPlayers
      .map(p => p.name)
      .filter(n => !attendees.includes(n) && !assigned.has(n));
  }, [teamEditMode, teams, attendees, seasonPlayers]);

  const startMatches = () => {
    if (teams.some(t => t.length < 1)) { alert("모든 팀에 최소 1명"); return; }
    let sched = null;
    let initPushState = null;
    let initSplitPhase = null;
    if (matchMode === "schedule") {
      if (courtCount === 2) {
        if (teamCount === 4) sched = generate4Team2Court();
        else if (teamCount === 5) sched = generate5Team2Court();
        else if (teamCount === 6) { sched = generate6Team2Court().firstHalf; initSplitPhase = 'first'; }
        else if (teamCount === 7) sched = generate7Team2Court();
        else if (teamCount === 8) { sched = generate8Team2Court().firstHalf; initSplitPhase = 'first'; }
      } else sched = generate1Court(teamCount, rotations);
    } else if (matchMode === "push") {
      initPushState = createInitialPushState(teamCount);
    }
    dispatch({ type: 'START_MATCHES', schedule: sched, pushState: initPushState, splitPhase: initSplitPhase });
  };

  const confirmRound = (roundIdx, matchResults) => {
    let newSchedule = null, newSplitPhase = null;
    if (matchMode === "schedule" && !isExtraRound && (teamCount === 6 || teamCount === 8) && courtCount === 2 && splitPhase === "first") {
      // 6·8팀 공통: 전반 6라운드 × 2코트 = 12경기 모두 완료 시 스플릿
      const cnt = completedMatches.filter(m => !m.isExtra).length + matchResults.length;
      if (cnt >= 12) {
        // 현재 라운드 결과까지 포함하여 순위 계산
        const allMatches = [...completedMatches.filter(m => !m.isExtra), ...matchResults];
        const stats = {};
        teamNames.forEach((t, i) => { stats[t] = { idx: i, points: 0, gf: 0, ga: 0 }; });
        allMatches.forEach(m => {
          if (!stats[m.homeTeam] || !stats[m.awayTeam]) return;
          stats[m.homeTeam].gf += m.homeScore; stats[m.homeTeam].ga += m.awayScore;
          stats[m.awayTeam].gf += m.awayScore; stats[m.awayTeam].ga += m.homeScore;
          if (m.homeScore > m.awayScore) { stats[m.homeTeam].points += 3; }
          else if (m.awayScore > m.homeScore) { stats[m.awayTeam].points += 3; }
          else { stats[m.homeTeam].points++; stats[m.awayTeam].points++; }
        });
        const ranked = Object.entries(stats)
          .map(([, s]) => s)
          .sort((a, b) => (b.points - a.points) || ((b.gf - b.ga) - (a.gf - a.ga)) || (b.gf - a.gf));
        const rankedIndices = ranked.map(s => s.idx);
        const secondHalf = teamCount === 8 ? generate8TeamSecondHalf(rankedIndices) : generate6TeamSecondHalf(rankedIndices);
        newSchedule = [...schedule, ...secondHalf];
        newSplitPhase = "second";
      }
    }
    const sched = newSchedule || schedule;
    let scanIdx = roundIdx + 1;
    while (scanIdx < sched.length && confirmedRounds[scanIdx]) scanIdx++;
    const nextIdx = (matchMode !== "push" && !isExtraRound && scanIdx < sched.length) ? scanIdx : null;
    dispatch({ type: 'CONFIRM_ROUND', roundIdx, matchResults, nextRoundIdx: nextIdx, newSchedule, newSplitPhase });
  };

  const handleConfirmScheduleRound = () => {
    const viewRound = schedule[viewingRoundIdx];
    if (!viewRound) return;
    const results = viewRound.matches.map((pair, i) => {
      const matchId = `R${viewingRoundIdx + 1}_C${i}`;
      const evts = allEvents.filter(e => e.matchId === matchId);
      const homeTeam = teamNames[pair[0]], awayTeam = teamNames[pair[1]];
      return {
        homeIdx: pair[0], awayIdx: pair[1], matchId, homeTeam, awayTeam,
        homeGk: gks[pair[0]] || null, awayGk: gks[pair[1]] || null,
        homeScore: calcMatchScore(evts, matchId, homeTeam),
        awayScore: calcMatchScore(evts, matchId, awayTeam),
        court: courtCount === 2 ? (i === 0 ? "A구장" : "B구장") : "",
        mercenaries: [],
      };
    });
    for (const r of results) {
      if (!r.homeGk || !r.awayGk) {
        alert(`${r.court} 키퍼를 지정하세요: ${!r.homeGk ? r.homeTeam : ""}${!r.homeGk && !r.awayGk ? ", " : ""}${!r.awayGk ? r.awayTeam : ""}`);
        return;
      }
    }
    const msg = results.map(r => `${r.court ? r.court + ": " : ""}${r.homeTeam} ${r.homeScore}:${r.awayScore} ${r.awayTeam}`).join("\n");
    if (!confirm(msg + "\n\n라운드 " + (viewingRoundIdx + 1 + roundDisplayOffset) + " 결과를 확정하시겠습니까?")) return;
    confirmRound(viewingRoundIdx, results);
    // 다음 라운드로 자동 이동 후 화면 상단으로 스크롤
    requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "smooth" }));
  };

  const handleUnconfirmRound = (roundIdx) => {
    if (!confirm(`라운드 ${roundIdx + 1 + roundDisplayOffset} 확정을 취소하시겠습니까?\n결과가 초기화되고 다시 수정할 수 있습니다.`)) return;
    dispatch({ type: 'UNCONFIRM_ROUND', roundIdx });
  };

  const handleEarlyFinish = () => {
    const confirmedCount = Object.keys(confirmedRounds).length;
    if (!confirm(`${confirmedCount}/${schedule.length} 라운드만 진행되었습니다.\n확정된 라운드 결과로 경기를 마감하시겠습니까?`)) return;
    dispatch({ type: 'SET_FIELD', field: 'earlyFinish', value: true });
    set('phase', 'summary');
  };

  const handleFinalize = async () => {
    // 경기일자: 경기 생성 시점 (gameId = "g_timestamp")
    const gameTs = gameId?.startsWith("g_") ? parseInt(gameId.slice(2)) : null;
    const gameD = gameTs ? new Date(gameTs) : new Date();
    const dateStr = `${gameD.getFullYear()}-${String(gameD.getMonth() + 1).padStart(2, "0")}-${String(gameD.getDate()).padStart(2, "0")}`;
    // 입력시간: 구글시트로 데이터전송 시점
    const inputTime = new Date().toLocaleString("ko-KR");
    const ES = state.settingsSnapshot || gameSettings;

    const reconfirmMsg = gameFinalized
      ? `⚠️ 이미 전송된 기록입니다.\n재전송 시 구글시트에 중복 저장될 수 있습니다.\n\n수정된 내용을 재전송하시겠습니까?`
      : `${gameD.getMonth() + 1}월 ${gameD.getDate()}일 풋살기록을 확정하시겠습니까?\n\n시트에 포인트로그 + 선수별집계를 저장합니다.`;
    if (!confirm(reconfirmMsg)) return;
    // 펜딩 자동저장이 마감 직후 stale state를 다시 쓰지 않게 취소
    cancelPendingSave();

    const formatMatchId = (mid) => {
      const pPush = mid?.match(/^P(\d+)_C0$/);
      if (pPush) return `${pPush[1]}경기`;
      const pFree = mid?.match(/^F(\d+)_C(\d+)$/);
      if (pFree) {
        const court = courtCount === 2 ? (pFree[2] === "0" ? "A구장" : "B구장") : "";
        return `${pFree[1]}경기${court ? " " + court : ""}`;
      }
      const p = mid?.match(/^R(\d+)_C(\d+)$/);
      if (!p) return mid || "";
      const court = courtCount === 2 ? (p[2] === "0" ? "A구장" : "B구장") : `매치${+p[2]+1}`;
      return `${p[1]}라운드 ${court}`;
    };
    const pointEvents = allEvents.filter(e => e.type === "goal" || e.type === "owngoal" || e.type === "foul").map(e => ({
      gameDate: dateStr, matchId: e.matchId || "",
      myTeam: e.team || "",
      // goal: 본인팀이 득점 → 상대팀은 concedingTeam.
      // owngoal/foul: 본인팀 이벤트 → 상대팀은 scoringTeam.
      opponentTeam: e.type === "goal" ? (e.concedingTeam || "") : (e.scoringTeam || ""),
      scorer: e.type === "goal" ? e.player : "", assist: e.assist || "",
      ownGoalPlayer: e.type === "owngoal" ? e.player : "",
      foulPlayer: e.type === "foul" ? e.player : "",
      // foul(옐로카드)은 실점 아님 — 레거시 이벤트의 concedingGk가 시트로 새지 않게 차단
      concedingGk: e.type === "foul" ? "" : (e.concedingGk || ""),
      inputTime: formatEventInputTime(e.timestamp, inputTime),
    }));

    // 팀순위점수 계산: 1등팀 = teamCount점, 꼴찌팀 = 1점
    const teamRankScore = {};
    finalStandings.forEach((t, i) => { teamRankScore[t.name] = teamCount - i; });

    const playerData = attendees.map(p => {
      const pts = calcPlayerPoints(p);
      const playerTeam = getPlayerTeamName(p);
      const rankScore = teamRankScore[playerTeam] || 0;
      const ES2 = state.settingsSnapshot || gameSettings;
      if (!ES2.useCrovaGoguma) {
        pts.crova = 0;
        pts.goguma = 0;
      }
      if (pts.goals === 0 && pts.assists === 0 && pts.owngoals === 0 && (pts.fouls || 0) === 0 && pts.conceded === 0 && pts.cleanSheets === 0 && pts.keeperGames === 0 && pts.crova === 0 && pts.goguma === 0 && rankScore === 0) return null;
      // owngoals/fouls: 선수별집계 로그(역주행/반칙 컬럼)는 포인트 환산값,
      // 로그_선수경기(PG)는 원시 횟수 — owngoalCount/foulCount로 분리 전달.
      return {
        gameDate: dateStr, name: p, ...pts,
        owngoals: pts.owngoals * ES2.ownGoalPoint, fouls: (pts.fouls || 0) * (ES2.foulPoint ?? -1),
        owngoalCount: pts.owngoals, foulCount: pts.fouls || 0,
        rankScore, inputTime,
      };
    }).filter(Boolean);

    const team = teamContext?.team || '';
    const rawEvents = buildRawEventsFromFutsal({ team, gameId: gameState.gameId, events: pointEvents });
    const rawPlayerGames = buildRawPlayerGamesFromFutsal({
      team, inputTime,
      players: playerData.map(p => ({
        ...p,
        owngoals: p.owngoalCount, fouls: p.foulCount, // PG 시트는 원시 횟수
        playerTeam: getPlayerTeamName(p.name),
      })),
    });
    const matchRows = buildRoundRowsFromFutsal({
      team,
      mode: '기본',
      tournamentId: '',
      date: dateStr,
      stateJSON: gameState,
      inputTime,
    });

    try {
      const results = await Promise.allSettled([
        AppSync.writePointLog({ events: pointEvents }, ES.pointLogSheet),
        AppSync.writePlayerLog({ players: playerData }, ES.playerLogSheet),
        AppSync.writeRawEvents({ rows: rawEvents }),
        AppSync.writeRawPlayerGames({ rows: rawPlayerGames }),
        AppSync.writeMatchLog(matchRows),
      ]);
      const [r1, r2, r3, r4, r5] = results;
      const legacyOk = r1.status === 'fulfilled' && r2.status === 'fulfilled';
      if (!legacyOk) {
        const f = [];
        if (r1.status !== 'fulfilled') f.push('포인트로그');
        if (r2.status !== 'fulfilled') f.push('선수별집계');
        const reasons = [r1, r2].filter(r => r.status !== 'fulfilled').map(r => r.reason?.message || '').filter(Boolean);
        throw new Error(`핵심 시트 저장 실패: ${f.join(', ')}` + (reasons.length ? `\n${reasons.join('\n')}` : ''));
      }
      // 분석 소스(로그_*) 전송 실패를 silent 처리하지 않음 — 하나라도 실패하면 미확정으로 두고 경고.
      const rawFailed = [];
      if (r3.status !== 'fulfilled') rawFailed.push('로그_이벤트');
      if (r4.status !== 'fulfilled') rawFailed.push('로그_선수경기');
      if (r5.status !== 'fulfilled') rawFailed.push('로그_매치');
      const allOk = rawFailed.length === 0;
      // Firebase에 확정 state 저장 (HistoryView/PlayerAnalytics 소스)
      // — 모든 시트 성공 시에만. 부분 실패 시 finalized 기록을 남기면
      //   히스토리에 '완료'처럼 보여 재전송 의무를 놓치게 됨.
      if (allOk) {
        await FirebaseSync.saveFinalized(teamContext?.team, gameId, gameState);
      }
      // 모든 시트 성공 시에만 gameFinalized:true (분석 로그 누락 시 false로 두어 재전송 유도 + Archive 차단)
      const team = teamContext?.team || '';
      const finalState = { ...gameState, gameFinalized: allOk };
      await FirebaseSync.syncDiff(team, gameId || "legacy", lastSyncedStateRef.current, finalState);
      lastSyncedStateRef.current = finalState;
      // 캐시 재적재는 마감 기록(saveFinalized + syncDiff)이 끝난 뒤에 돈다 — 파생 데이터를
      // critical path 에 두면 이 구간(Apps Script 최대 7회, 콜드스타트 각 10초)에서 앱이
      // 닫힐 때 gameFinalized 가 유실돼 유저가 재전송하고 5개 시트에 중복 행이 생긴다
      // (자동 멱등화가 없어 수동 삭제가 필요하다).
      // allOk 가 아니어도 돈다 — legacyOk 를 통과한 이상 포인트로그·선수별집계에는 이미
      // 행이 들어갔고, refresh 는 시트(진실 소스)를 다시 읽으므로 어떤 상태든 정확히 반영한다.
      // 여기서 돌지 않으면 그 두 시트의 캐시가 최대 12시간(L2 TTL) 낡은 채 남는다.
      await refreshAfterFinalize({ sport: '풋살' });
      const r1v = r1.value, r2v = r2.value;
      const r3v = r3.status === 'fulfilled' ? r3.value : null;
      const r4v = r4.status === 'fulfilled' ? r4.value : null;
      const r5v = r5.status === 'fulfilled' ? r5.value : null;
      const ct = (v, unit) => v ? `${v.count || 0}${unit}${v.skipped ? ` (skip ${v.skipped})` : ''}` : '❌ 실패';
      const detail = `포인트로그: ${r1v?.count || 0}건\n선수별집계: ${r2v?.count || 0}명\n로그_이벤트: ${ct(r3v, '건')}\n로그_선수경기: ${ct(r4v, '명')}\n로그_매치: ${ct(r5v, '건')}`;
      if (allOk) {
        alert(`기록 확정 완료!\n\n${detail}\n\n수정이 필요하면 "경기로" 버튼으로 돌아갈 수 있습니다.`);
      } else {
        alert(`⚠️ 분석 로그 일부 전송 실패: ${rawFailed.join(', ')}\n\n${detail}\n\n분석용 데이터가 누락됐습니다. "기록확정"을 다시 눌러 재전송하세요.\n(전부 성공 전까지 미확정 상태로 둡니다.)`);
      }
      set('gameFinalized', allOk);
    } catch (err) {
      alert("시트 저장 실패: " + err.message);
    }
  };

  const { C, mode: themeMode, toggle: toggleTheme } = useTheme();
  const s = makeStyles(C);
  const viewRoundConfirmed = confirmedRounds[viewingRoundIdx] || false;

  // LOADING
  if (dataLoading) {
    return (
      <div style={{ ...s.app, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
        <div style={{ fontSize: 32, marginBottom: 16 }}>⚽</div>
        <div style={{ color: C.white, fontSize: 16, fontWeight: 600, marginBottom: 8 }}>{teamContext?.team || "풋살"} 경기기록</div>
        <div style={{ color: C.gray, fontSize: 13 }}>선수 데이터 불러오는 중...</div>
      </div>
    );
  }

  // SETUP PHASE
  if (phase === "setup") {
    const segBar = {
      display: "flex", gap: 4, padding: 3,
      background: "var(--app-bg-row-hover)", borderRadius: 8,
    };
    const segBtn = (active, disabled) => ({
      flex: 1, padding: "6px 10px", border: "none", cursor: disabled ? "not-allowed" : "pointer",
      background: active ? "var(--app-bg-elevated)" : "transparent",
      color: active ? "var(--app-text-primary)" : "var(--app-text-secondary)",
      fontWeight: 500, fontSize: 14, borderRadius: 6,
      boxShadow: active ? "0 1px 2px rgba(0,0,0,0.08)" : "none",
      opacity: disabled ? 0.3 : 1,
      fontFamily: "inherit", letterSpacing: "-0.01em",
    });
    const scheduleHint = matchMode === "schedule" && courtCount === 2 ? (
      teamCount === 4 ? "동일팀 4번씩 경기 · 12라운드"
      : teamCount === 5 ? "동일팀 2번씩 경기 · 10라운드"
      : teamCount === 6 ? "조별리그 → 순위별 재편성 · 12라운드"
      : teamCount === 7 ? "전팀 풀리그 · 11라운드 · 매R 3팀 휴식"
      : teamCount === 8 ? "조별리그 → 순위별 재편성 · 12라운드"
      : ""
    ) : "";

    return (
      <div style={{
        background: "var(--app-bg-grouped)", minHeight: "100vh",
        color: "var(--app-text-primary)",
        fontFamily: "var(--app-font-sans)", letterSpacing: "-0.014em",
        maxWidth: 500, margin: "0 auto", paddingBottom: 96,
      }}>
        <div style={{ padding: "24px 20px 12px", position: "sticky", top: 0, background: "var(--app-bg-grouped)", zIndex: 100 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h1 style={{ fontSize: 28, fontWeight: 700, letterSpacing: "-0.022em", margin: 0, color: "var(--app-text-primary)" }}>
              {teamContext?.team || "경기 설정"}
            </h1>
            <div style={{ display: "flex", gap: 6 }}>
              {onBackToMenu && (
                <button onClick={onBackToMenu} style={{
                  background: "var(--app-bg-row)", border: "0.5px solid var(--app-divider)",
                  borderRadius: 999, width: 36, height: 36,
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                  color: "var(--app-text-primary)", cursor: "pointer", padding: 0,
                }} aria-label="메뉴"><BackIcon width={16} /></button>
              )}
            </div>
          </div>
          <div style={{ fontSize: 15, color: "var(--app-text-secondary)", marginTop: 4,
                        display: "flex", alignItems: "center", gap: 8 }}>
            <span>{authUser?.name} · {teamContext?.mode || "풋살"}</span>
            <span style={{
              fontSize: 11, padding: "1px 6px", borderRadius: 4, fontWeight: 500,
              background: dataSource === "sheet" ? "rgba(52,199,89,0.15)" : "rgba(255,149,0,0.15)",
              color:      dataSource === "sheet" ? "var(--app-green)" : "var(--app-orange)",
            }}>{dataSource === "sheet" ? "시트 연동" : "오프라인"}</span>
          </div>
        </div>

        <PhaseIndicator activeIndex={0} />

        <div style={{ padding: "0 16px", marginBottom: 20 }}>
          <div className="app-section-label">경기 설정</div>
          <div className="app-grouped">
            <div className="app-row" style={{ flexDirection: "column", alignItems: "stretch", gap: 8 }}>
              <span className="app-row-title">팀 수</span>
              <div style={segBar}>
                {[3, 4, 5, 6, 7, 8].map(n => (
                  <button key={n} onClick={() => dispatch({ type: 'SET_FIELDS', fields: { teamCount: n, ...(n === 3 ? { courtCount: 1 } : {}) } })}
                    style={segBtn(teamCount === n)}>{n}팀</button>
                ))}
              </div>
            </div>
            <div className="app-row" style={{ flexDirection: "column", alignItems: "stretch", gap: 8 }}>
              <span className="app-row-title">구장 수</span>
              <div style={segBar}>
                {[1, 2].map(n => {
                  const disabled = (matchMode === "push" || teamCount === 3) && n !== 1;
                  return <button key={n} onClick={() => { if (!disabled) set('courtCount', n); }} disabled={disabled}
                    style={segBtn(courtCount === n, disabled)}>{n}코트</button>;
                })}
              </div>
            </div>
            <div className="app-row" style={{ flexDirection: "column", alignItems: "stretch", gap: 8 }}>
              <span className="app-row-title">경기 모드</span>
              <div style={segBar}>
                <button onClick={() => set('matchMode', 'schedule')} style={segBtn(matchMode === "schedule")}>
                  {(teamCount === 6 || teamCount === 8) && courtCount === 2 ? "그룹 스플릿" : "대진표"}
                </button>
                <button onClick={() => set('matchMode', 'free')} style={segBtn(matchMode === "free")}>자유대진</button>
                <button onClick={() => dispatch({ type: 'SET_FIELDS', fields: { matchMode: 'push', courtCount: 1 } })} style={segBtn(matchMode === "push")}>밀어내기</button>
              </div>
            </div>
            <div className="app-row" style={{ flexDirection: "column", alignItems: "stretch", gap: 8 }}>
              <span className="app-row-title">팀 편성 방식</span>
              <div style={segBar}>
                <button onClick={() => set('draftMode', 'snake')} style={segBtn(draftMode === "snake")}>스네이크</button>
                <button onClick={() => set('draftMode', 'free')} style={segBtn(draftMode === "free")}>자유편성</button>
                <button onClick={sheetDraft} disabled={attendanceLoading} style={segBtn(draftMode === "sheet")}>
                  {attendanceLoading ? "로딩..." : "시트 연동"}
                </button>
              </div>
            </div>
            {courtCount === 1 && matchMode === "schedule" && (
              <div className="app-row" style={{ flexDirection: "column", alignItems: "stretch", gap: 8 }}>
                <span className="app-row-title">회전 수</span>
                <div style={segBar}>
                  {[1, 2, 3, 4, 5].map(n => (
                    <button key={n} onClick={() => set('rotations', n)} style={segBtn(rotations === n)}>{n}회전</button>
                  ))}
                </div>
              </div>
            )}
          </div>
          {scheduleHint && (
            <div style={{ fontSize: 13, color: "var(--app-text-tertiary)", padding: "8px 16px 0" }}>
              {scheduleHint}
            </div>
          )}
        </div>

        <div style={{ padding: "0 16px", marginBottom: 20 }}>
          <div className="app-section-label" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span>참석자</span>
            <span style={{ fontSize: 12, color: "var(--app-text-tertiary)", textTransform: "none" }}>{attendees.length}명 선택됨</span>
          </div>
          <div className="app-grouped">
            <div className="app-row" style={{ gap: 6, flexWrap: "wrap", padding: "10px 12px" }}>
              <button onClick={syncAttendance} disabled={attendanceLoading} style={{
                display: "inline-flex", alignItems: "center", gap: 4,
                padding: "6px 12px", borderRadius: 999,
                background: "rgba(52,199,89,0.12)", color: "var(--app-green)",
                border: "none", fontSize: 13, fontWeight: 500, cursor: "pointer",
                fontFamily: "inherit", opacity: attendanceLoading ? 0.6 : 1,
              }}>
                <ListIcon width={14} /> {attendanceLoading ? "연동 중..." : "시트 연동"}
              </button>
              <button onClick={() => dispatch({ type: 'SET_ATTENDEES', attendees: sortedPlayers.filter(p => p.games > 0).map(p => p.name) })} style={{
                padding: "6px 12px", borderRadius: 999,
                background: "var(--app-bg-row-hover)", color: "var(--app-text-primary)",
                border: "none", fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit",
              }}>활동선수 전체</button>
              <button onClick={() => set('attendees', [])} style={{
                padding: "6px 12px", borderRadius: 999,
                background: "var(--app-bg-row-hover)", color: "var(--app-text-primary)",
                border: "none", fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit",
              }}>초기화</button>
              <button onClick={() => set('playerSortMode', playerSortMode === "point" ? "name" : "point")} style={{
                padding: "6px 12px", borderRadius: 999,
                background: "rgba(0,122,255,0.1)", color: "var(--app-blue)",
                border: "none", fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit", marginLeft: "auto",
              }}>{playerSortMode === "point" ? "포인트순" : "이름순"}</button>
            </div>
            <div className="app-row" style={{ padding: "10px 12px" }}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, width: "100%" }}>
                {sortedPlayers.map(p => {
                  const active = attendees.includes(p.name);
                  return (
                    <button key={p.name} onClick={() => dispatch({ type: 'TOGGLE_ATTENDEE', name: p.name })} style={{
                      display: "inline-flex", alignItems: "center", gap: 4,
                      padding: "6px 10px", borderRadius: 999,
                      background: active ? "var(--app-blue)" : "var(--app-bg-row-hover)",
                      color:      active ? "#fff"             : "var(--app-text-primary)",
                      border: "none", fontSize: 13, fontWeight: 500, cursor: "pointer",
                      fontFamily: "inherit",
                    }}>
                      <span>{p.name}</span>
                      <span style={{ fontSize: 11, opacity: 0.75 }}>{p.point}p</span>
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="app-row" style={{ padding: "10px 12px", gap: 8 }}>
              <input className="app-input" style={{ flex: 1 }} placeholder="새 선수 이름" value={newPlayer}
                onChange={e => set('newPlayer', e.target.value)}
                onKeyDown={e => {
                  if (e.key === "Enter") { const name = newPlayer.trim(); if (name && !attendees.includes(name)) { dispatch({ type: 'SET_FIELDS', fields: { attendees: [...attendees, name], newPlayer: "" } }); } }
                }} />
              <button onClick={() => { const name = newPlayer.trim(); if (name && !attendees.includes(name)) { dispatch({ type: 'SET_FIELDS', fields: { attendees: [...attendees, name], newPlayer: "" } }); } }} style={{
                padding: "0 16px", borderRadius: 10,
                background: "var(--app-blue)", color: "#fff",
                border: "none", fontSize: 15, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
                display: "inline-flex", alignItems: "center", gap: 4,
              }}>
                <PlusIcon width={14} color="#fff" /> 추가
              </button>
            </div>
          </div>
        </div>

        <div style={{
          position: "fixed", bottom: 0, left: 0, right: 0,
          padding: "12px 16px calc(12px + env(safe-area-inset-bottom))",
          background: "var(--app-bg-grouped)",
          borderTop: "0.5px solid var(--app-divider)",
          maxWidth: 500, margin: "0 auto",
        }}>
          {(() => {
            const sheetReady = draftMode === "sheet" && teams.length > 0 && teams.some(t => t.length > 0);
            const ctaDisabled =
              (draftMode === "snake" && attendees.length < teamCount * 2) ||
              (draftMode === "sheet" && !sheetReady);
            const ctaLabel =
              draftMode === "free" ? `자유 편성 (${teamCount}팀)` :
              draftMode === "sheet" ? (sheetReady ? `시트 편성 (${teamCount}팀)` : "시트 연동을 먼저 눌러주세요") :
              `팀 편성 (${attendees.length}명 → ${teamCount}팀)`;
            return (
              <button onClick={goToTeamBuild} disabled={ctaDisabled} style={{
                width: "100%", padding: "14px 16px", borderRadius: 12,
                background: "var(--app-blue)", color: "#fff",
                border: "none", fontSize: 16, fontWeight: 600, cursor: "pointer",
                fontFamily: "inherit", letterSpacing: "-0.01em",
                opacity: ctaDisabled ? 0.5 : 1,
              }}>
                {ctaLabel}
              </button>
            );
          })()}
        </div>
        {onLogout && (
          <div style={{ textAlign: "center", padding: "8px 16px" }}>
            <button onClick={onLogout} style={{
              background: "transparent", color: "var(--app-red)",
              border: "none", fontSize: 14, cursor: "pointer", fontFamily: "inherit",
            }}>로그아웃</button>
          </div>
        )}
      </div>
    );
  }

  // TEAM BUILD PHASE
  if (phase === "teamBuild") {
    const sortedTeam = (team) => [...team].sort((a, b) => getPlayerPoint(b, seasonPlayers) - getPlayerPoint(a, seasonPlayers));

    return (
      <div style={s.app}>
        <div style={s.header}>
          <div style={s.title}>⚽ {teamEditMode ? "팀 명단 수정" : "팀 편성"}</div>
          <div style={s.subtitle}>{teamEditMode ? "경기 진행 중 · 편집 모드" : `${draftMode === "snake" ? "스네이크 드래프트" : draftMode === "sheet" ? "시트 편성" : "자유 편성"} · ${teamCount}팀 · ${attendees.length}명`}</div>
        </div>
        {!teamEditMode && <PhaseIndicator activeIndex={1} />}
        <div style={s.section}>
          <div style={{ ...s.row, marginBottom: 12 }}>
            {!teamEditMode && draftMode === "snake" && <button onClick={reshuffleTeams} style={s.btnSm(C.grayDark)}>재배치</button>}
            {!teamEditMode && draftMode === "free" && <button onClick={() => dispatch({ type: 'SET_FIELDS', fields: { teams: Array.from({ length: teamCount }, () => []), teamNames: Array.from({ length: teamCount }, (_, i) => `팀 ${i + 1}`), gks: {} } })} style={s.btnSm(C.grayDark)}>초기화</button>}
            <span style={{ fontSize: 11, color: C.gray }}>전력: {teams.map(t => teamPower(t, seasonPlayers)).join(" / ")}</span>
          </div>

          {draftMode === "free" && (unassignedPlayers.length > 0 || teamEditMode) && (
            <div style={{ ...s.card, border: `2px solid ${C.accent}44`, marginBottom: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: C.accent, flex: 1 }}>
                  미배정 선수 ({unassignedPlayers.length}명)
                  {selectedPoolPlayers.length === 0
                    ? " · 선수 다중 선택 후 아래 팀의 + 추가 탭"
                    : ` · ${selectedPoolPlayers.length}명 선택됨 → 아래 팀의 + 추가 탭`}
                  {selectedPoolPlayers.length > 0 && (
                    <button onClick={() => setSelectedPoolPlayers([])}
                      style={{ marginLeft: 6, padding: "2px 8px", borderRadius: 999, background: C.cardLight, color: C.gray, border: "none", fontSize: 10, cursor: "pointer", fontFamily: "inherit" }}>
                      선택 해제
                    </button>
                  )}
                </div>
                <button onClick={() => set('playerSortMode', playerSortMode === "point" ? "name" : "point")} style={{
                  padding: "3px 10px", borderRadius: 999,
                  background: "rgba(0,122,255,0.1)", color: "var(--app-blue)",
                  border: "none", fontSize: 11, fontWeight: 500, cursor: "pointer", fontFamily: "inherit", flexShrink: 0,
                }}>{playerSortMode === "point" ? "포인트순" : "이름순"}</button>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {[...unassignedPlayers].sort((a, b) => playerSortMode === "name" ? a.localeCompare(b, "ko") : getPlayerPoint(b, seasonPlayers) - getPlayerPoint(a, seasonPlayers)).map(p => {
                  const pd = getPlayerData(p, seasonPlayers);
                  const isSel = selectedPoolPlayers.includes(p);
                  return (
                    <div key={p} onClick={() => togglePoolSelect(p)} style={{ ...s.chip(isSel), cursor: "pointer", padding: "6px 10px", fontSize: 12, display: "inline-flex", alignItems: "center", gap: 6 }}>
                      <span>{p}</span><span style={{ fontSize: 10, opacity: 0.6 }}>{pd.point}p</span>
                      <span
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedPoolPlayers(prev => prev.filter(x => x !== p));
                          dispatch({ type: 'SET_ATTENDEES', attendees: attendees.filter(a => a !== p) });
                        }}
                        title="불참 처리"
                        style={{
                          display: "inline-flex", alignItems: "center", justifyContent: "center",
                          width: 16, height: 16, borderRadius: 999,
                          background: "rgba(0,0,0,0.08)", color: C.gray,
                          fontSize: 10, fontWeight: 700, lineHeight: 1, cursor: "pointer",
                          marginLeft: 2,
                        }}
                      >×</span>
                    </div>
                  );
                })}
              </div>
              {teamEditMode && absentSeasonPool.length > 0 && (
                <>
                  <div style={{ fontSize: 11, fontWeight: 700, color: C.gray, marginTop: 10, marginBottom: 6 }}>불참 시즌 선수 ({absentSeasonPool.length}명)</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                    {[...absentSeasonPool].sort((a, b) => playerSortMode === "name" ? a.localeCompare(b, "ko") : getPlayerPoint(b, seasonPlayers) - getPlayerPoint(a, seasonPlayers)).map(p => {
                      const pd = getPlayerData(p, seasonPlayers);
                      const isSel = selectedPoolPlayers.includes(p);
                      return (
                        <div key={p} onClick={() => togglePoolSelect(p)}
                          style={{ ...s.chip(isSel), cursor: "pointer", padding: "6px 10px", fontSize: 12, opacity: isSel ? 1 : 0.85 }}>
                          <span>{p}</span><span style={{ fontSize: 10, opacity: 0.6 }}>{pd.point}p</span>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
              {teamEditMode && (
                <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
                  <input style={{ ...s.input, flex: 1, fontSize: 12, padding: "6px 8px" }} placeholder="새 선수 이름 (게스트)"
                    value={newPlayer} onChange={e => set('newPlayer', e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") addGuestPlayer(); }} />
                  <button onClick={addGuestPlayer} style={s.btnSm(C.green, C.bg)}>추가</button>
                </div>
              )}
            </div>
          )}

          {teams.map((team, tIdx) => {
            const color = TEAM_COLORS[teamColorIndices[tIdx]];
            const sorted = sortedTeam(team);
            const canAddHere = draftMode === "free" && selectedPoolPlayers.length > 0;
            return (
              <div key={tIdx} style={{ ...s.teamCard(teamColorIndices[tIdx]), border: canAddHere ? `2px dashed ${color?.bg || C.accent}` : "none" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {editingTeamName === tIdx ? (
                      <input autoFocus style={{ ...s.input, width: 100, padding: "4px 8px", fontSize: 14, fontWeight: 700 }} value={teamNames[tIdx]}
                        onChange={e => { const c = [...teamNames]; c[tIdx] = e.target.value; set('teamNames', c); }}
                        onBlur={() => set('editingTeamName', null)} onKeyDown={e => e.key === "Enter" && set('editingTeamName', null)} />
                    ) : (
                      <span style={{ fontWeight: 700, fontSize: 14, cursor: "pointer" }}
                        onClick={(e) => { e.stopPropagation(); set('editingTeamName', tIdx); }}>{teamNames[tIdx]}</span>
                    )}
                    <span style={{ fontSize: 11, color: C.gray }}>전력 {teamPower(team, seasonPlayers)}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    {!teamEditMode && (
                      <div style={{ display: "flex", gap: 3 }}>
                        {TEAM_COLORS.map((tc, ci) => (
                          <div key={ci} onClick={(e) => { e.stopPropagation(); const c = [...teamColorIndices]; c[tIdx] = ci; set('teamColorIndices', c); }}
                            style={{ width: 16, height: 16, borderRadius: "50%", background: tc.bg, border: teamColorIndices[tIdx] === ci ? `2px solid ${C.white}` : `1px solid ${C.grayDark}`, cursor: "pointer" }} />
                        ))}
                      </div>
                    )}
                    {draftMode === "free" && (
                      <button onClick={(e) => { e.stopPropagation(); addSelectedToTeam(tIdx); }}
                        disabled={selectedPoolPlayers.length === 0}
                        style={{ ...s.btnSm(selectedPoolPlayers.length > 0 ? C.green : C.grayDarker, selectedPoolPlayers.length > 0 ? C.bg : C.gray), padding: "4px 12px", fontSize: 13, fontWeight: 700, opacity: selectedPoolPlayers.length > 0 ? 1 : 0.5, cursor: selectedPoolPlayers.length > 0 ? "pointer" : "not-allowed" }}>
                        + 추가{selectedPoolPlayers.length > 0 ? ` (${selectedPoolPlayers.length})` : ""}
                      </button>
                    )}
                  </div>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {sorted.map((player, pIdx) => {
                    const pd = getPlayerData(player, seasonPlayers);
                    return (
                      <div key={player} style={{ ...s.playerInTeam(color), color: C.white }}>
                        {pIdx === 0 && team.length > 0 && <span style={{ fontSize: 10, marginRight: 2 }}>👑</span>}
                        <span>{player}</span>
                        <span style={{ fontSize: 10, opacity: 0.6, marginLeft: 4 }}>{pd.point}p</span>
                        {draftMode === "snake" || (draftMode === "sheet" && !teamEditMode) ? (
                          <button onClick={e => { e.stopPropagation(); set('moveSource', moveSource?.player === player ? null : { player, teamIdx: tIdx }); }}
                            style={{ ...s.btnSm(moveSource?.player === player ? C.orange : C.grayDarker, C.gray), padding: "2px 6px", fontSize: 10, marginLeft: 4 }}>
                            {moveSource?.player === player ? "취소" : "↔"}
                          </button>
                        ) : (
                          <button onClick={e => { e.stopPropagation(); freeRemovePlayer(player, tIdx); }}
                            style={{ ...s.btnSm(C.redDim, C.white), padding: "2px 6px", fontSize: 10, marginLeft: 4 }}>
                            ✕
                          </button>
                        )}
                      </div>
                    );
                  })}
                  {(draftMode === "snake" || (draftMode === "sheet" && !teamEditMode)) && moveSource && moveSource.teamIdx !== tIdx && (
                    <div onClick={() => { dispatch({ type: 'MOVE_PLAYER', player: moveSource.player, fromIdx: moveSource.teamIdx, toIdx: tIdx }); set('moveSource', null); }}
                      style={{ display: "inline-flex", alignItems: "center", padding: "6px 12px", borderRadius: 8, fontSize: 12, margin: 2, cursor: "pointer", border: `2px dashed ${C.accent}`, color: C.accent }}>
                      + {moveSource.player}
                    </div>
                  )}
                  {draftMode === "free" && team.length === 0 && (
                    <div style={{ color: C.grayDark, fontSize: 12, padding: 8 }}>선수 선택 후 + 추가</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        {courtCount === 1 && matchMode === "schedule" && (
          <div style={{ ...s.section, marginTop: 0 }}>
            <div style={{ ...s.card, display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 12, color: C.gray, fontWeight: 700, whiteSpace: "nowrap" }}>회전 수</span>
              <div style={s.row}>{[1, 2, 3, 4, 5].map(n => <button key={n} onClick={() => set('rotations', n)} style={s.btn(rotations === n ? C.accent : C.grayDark, rotations === n ? C.bg : C.white)}>{n}회전</button>)}</div>
              <span style={{ fontSize: 11, color: C.gray, whiteSpace: "nowrap" }}>{teamCount * (teamCount - 1) / 2 * rotations}경기</span>
            </div>
          </div>
        )}
        <div style={s.bottomBar}>
          {teamEditMode ? (
            <>
              <button onClick={() => dispatch({ type: 'EXIT_TEAM_EDIT_CANCEL' })} style={s.btn(C.grayDark)}>취소</button>
              <button onClick={() => {
                if (teams.some(t => t.length < 1)) { alert("모든 팀에 최소 1명"); return; }
                dispatch({ type: 'EXIT_TEAM_EDIT_SAVE' });
              }} style={{ ...s.btn(C.green), flex: 1, opacity: teams.some(t => t.length < 1) ? 0.5 : 1 }}>완료</button>
            </>
          ) : (
            <>
              <button onClick={() => set('phase', 'setup')} style={s.btn(C.grayDark)}>이전</button>
              <button onClick={startMatches} style={{ ...s.btn(C.green), flex: 1, opacity: teams.some(t => t.length < 1) ? 0.5 : 1 }}>경기 시작</button>
            </>
          )}
        </div>
      </div>
    );
  }

  // MATCH PHASE
  if (phase === "match") {
    const _showModalBonus = matchMode !== "push" && courtCount === 2 && (state.settingsSnapshot?.useCrovaGoguma ?? gameSettings.useCrovaGoguma ?? false);
    const pillBtnStyle = ({ tone = "neutral", strong = false } = {}) => {
      const toneMap = {
        neutral: { bg: "var(--app-bg-row)", fg: "var(--app-text-primary)", border: "0.5px solid var(--app-divider)" },
        green:   { bg: strong ? "var(--app-green)" : "rgba(52,199,89,0.12)",  fg: strong ? "#fff" : "var(--app-green)",  border: "none" },
        orange:  { bg: strong ? "var(--app-orange)" : "rgba(255,149,0,0.12)", fg: strong ? "#fff" : "var(--app-orange)", border: "none" },
        red:     { bg: strong ? "var(--app-red)" : "rgba(255,59,48,0.12)",    fg: strong ? "#fff" : "var(--app-red)",    border: "none" },
      };
      const t = toneMap[tone] || toneMap.neutral;
      return {
        flexShrink: 0, padding: "7px 14px", borderRadius: 999,
        background: t.bg, color: t.fg, border: t.border,
        fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
        letterSpacing: "-0.01em", whiteSpace: "nowrap",
      };
    };
    return (
      <div style={s.app}>
        <div style={{
          padding: "20px 16px 12px", background: "var(--app-bg-grouped)",
          position: "sticky", top: 0, zIndex: 100,
          borderBottom: "0.5px solid var(--app-divider)",
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <button onClick={onBackToMenu} aria-label="홈으로" style={{
              width: 36, height: 36, borderRadius: 999,
              background: "var(--app-bg-row)", border: "0.5px solid var(--app-divider)",
              color: "var(--app-text-primary)", cursor: "pointer", padding: 0,
              display: "inline-flex", alignItems: "center", justifyContent: "center",
            }}>
              <BackIcon width={16} />
            </button>
            <div style={{ flex: 1 }} />
            {AppSync.enabled() && syncStatus && (
              <div style={{
                fontSize: 11, padding: "4px 10px", borderRadius: 999, fontWeight: 500,
                background: syncStatus === "saved" ? "rgba(52,199,89,0.12)" : syncStatus === "saving" ? "rgba(0,122,255,0.12)" : "rgba(255,59,48,0.12)",
                color: syncStatus === "saved" ? "var(--app-green)" : syncStatus === "saving" ? "var(--app-blue)" : "var(--app-red)",
              }}>
                {syncStatus === "saving" ? "저장 중…" : syncStatus === "saved" ? "저장됨" : "저장 실패"}
              </div>
            )}
          </div>
          <h1 style={{
            fontSize: 28, fontWeight: 700, letterSpacing: "-0.022em",
            color: "var(--app-text-primary)", margin: 0, lineHeight: 1.1,
          }}>경기 진행</h1>
          <div style={{ fontSize: 14, color: "var(--app-text-secondary)", marginTop: 4 }}>
            {(() => {
              if (matchMode === "push") return `밀어내기 · ${completedMatches.length}경기`;
              if (matchMode === "schedule") {
                return allRoundsComplete ? "전체 라운드 완료" : `라운드 ${currentRoundIdx + 1} / ${schedule.length}`;
              }
              // free 모드 — 자유 라운드와 자동 schedule을 합산 누적 카운트로 표시
              const freeCount = completedMatches.filter(m => m?.matchId?.startsWith?.('F')).length;
              if (schedule.length > 0) {
                const total = freeCount + schedule.length;
                return allRoundsComplete
                  ? `전체 ${total}라운드 완료`
                  : `라운드 ${freeCount + currentRoundIdx + 1} / ${total}`;
              }
              return `자유대전 · ${completedMatches.length}라운드`;
            })()}
          </div>
          <div style={{
            display: "flex", gap: 6, marginTop: 12, overflowX: "auto",
            scrollbarWidth: "none", paddingBottom: 2,
          }}>
            {matchMode !== "push" && (
              <button onClick={() => set('matchModal', 'schedule')} style={pillBtnStyle()}>대진표</button>
            )}
            <button onClick={() => set('matchModal', 'teamRoster')} style={pillBtnStyle()}>팀명단</button>
            <button onClick={() => set('matchModal', 'standings')} style={pillBtnStyle()}>팀순위</button>
            <button onClick={() => set('matchModal', 'playerStats')} style={pillBtnStyle()}>개인기록</button>
            {(allRoundsComplete || matchMode === "free" || (matchMode === "push" && completedMatches.length > 0)) && (
              <button onClick={() => set('phase', 'summary')} style={pillBtnStyle({ tone: "green", strong: true })}>경기마감</button>
            )}
            {matchMode === "schedule" && !allRoundsComplete && Object.keys(confirmedRounds).length > 0 && (
              earlyFinish
                ? <button onClick={() => set('phase', 'summary')} style={pillBtnStyle({ tone: "green", strong: true })}>최종집계</button>
                : <button onClick={handleEarlyFinish} style={pillBtnStyle({ tone: "orange", strong: true })}>조기마감</button>
            )}
            {teamContext?.role === "관리자" && completedMatches.length > 0 && (
              <button onClick={() => {
                if (!confirm("라운드 진행 기록을 모두 초기화하시겠습니까?\n팀 구성과 명단은 유지되고 매치/이벤트/스케줄만 지워집니다.")) return;
                if (!confirm("되돌릴 수 없습니다. 정말 초기화하시겠습니까?")) return;
                dispatch({ type: 'RESET_MATCH_PROGRESS' });
              }} style={pillBtnStyle({ tone: "orange" })}>라운드초기화</button>
            )}
            {teamContext?.role === "관리자" && (
              <button onClick={async () => {
                if (!confirm("경기를 삭제하시겠습니까?\n모든 기록이 초기화됩니다.")) return;
                if (!confirm("되돌릴 수 없습니다. 정말 삭제하시겠습니까?")) return;
                await FirebaseSync.clearState(teamContext?.team, gameId);
                await AppSync.clearState(gameId);
                window.location.reload();
              }} style={pillBtnStyle({ tone: "red" })}>경기삭제</button>
            )}
          </div>
        </div>

        {matchModal === "schedule" && (
          <ScheduleModal schedule={schedule} currentRoundIdx={currentRoundIdx} viewingRoundIdx={viewingRoundIdx}
            setViewingRoundIdx={(v) => set('viewingRoundIdx', v)} confirmedRounds={confirmedRounds}
            allEvents={allEvents} teamNames={teamNames} teamColorIndices={teamColorIndices} courtCount={courtCount}
            splitPhase={splitPhase} teamCount={teamCount} matchMode={matchMode} rotations={rotations}
            completedMatches={completedMatches}
            roundDisplayOffset={roundDisplayOffset}
            onOpenAutoConfig={matchMode === "free" && [4, 5].includes(teamCount)
              ? () => set('matchModal', 'balancedAuto')
              : undefined}
            onPopScheduleSegment={matchMode === "free" && schedule.length > 0
              ? (n) => dispatch({ type: 'POP_SCHEDULE_SEGMENT', count: n })
              : undefined}
            onViewFreeMatch={(idx) => {
              // 자유 라운드 (F-id) 매치를 열기 — completedMatches 내 인덱스 매핑
              const fMatchIds = completedMatches
                .map((m, i) => m?.matchId?.startsWith?.('F') ? i : null)
                .filter(i => i !== null);
              const targetIdx = fMatchIds[idx];
              if (targetIdx != null) {
                setViewingFreeIdx(targetIdx);
                set('matchModal', null);
              }
            }}
            onClose={() => set('matchModal', null)} styles={s} />
        )}
        {matchModal === "balancedAuto" && (
          <BalancedScheduleModal
            teamCount={teamCount}
            teamNames={teamNames}
            teamColorIndices={teamColorIndices}
            completedMatches={completedMatches}
            allEvents={allEvents}
            courtCount={courtCount}
            hasLiveMatch={hasLiveFreeMatch}
            onConfirm={({ newRounds, newCourtCount }) => {
              dispatch({ type: 'APPEND_SCHEDULE_SEGMENT', newRounds, newCourtCount });
              set('matchModal', null);
            }}
            onClose={() => set('matchModal', null)}
          />
        )}

        {matchModal === "teamRoster" && (
          <Modal onClose={() => set('matchModal', null)} title="팀 명단">
            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
              <button onClick={() => dispatch({ type: 'ENTER_TEAM_EDIT' })}
                style={{ ...s.btnSm(C.orange, C.bg), fontSize: 12, fontWeight: 700 }}>
                팀 수정
              </button>
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {teams.map((team, tIdx) => {
                const color = TEAM_COLORS[teamColorIndices[tIdx]];
                const colWidth = teams.length <= 4 ? `calc(${100 / teams.length}% - 5px)` : `calc(${100 / Math.ceil(teams.length / 2)}% - 5px)`;
                return (
                  <div key={tIdx} style={{ width: colWidth, background: C.card, borderRadius: 10, borderTop: `3px solid ${color?.bg || C.accent}`, padding: "8px 6px" }}>
                    <div style={{ textAlign: "center", marginBottom: 6 }}>
                      <div style={{ fontWeight: 700, fontSize: 12, color: color?.bg || C.accent }}>{teamNames[tIdx]}</div>
                      <div style={{ fontSize: 9, color: C.gray }}>{team.length}명</div>
                    </div>
                    {team.map((p, pIdx) => (
                      <div key={p} style={{ padding: "4px 2px", borderBottom: pIdx < team.length - 1 ? `1px solid ${C.grayDarker}` : "none", fontSize: 11 }}>
                        <span style={{ fontWeight: 600, color: C.white }}>{p}</span>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          </Modal>
        )}

        {matchModal === "standings" && <StandingsModal standings={getTeamStandings()} splitPhase={splitPhase} teamCount={teamCount} onClose={() => set('matchModal', null)} styles={s} />}
        {matchModal === "playerStats" && <PlayerStatsModal attendees={attendees} calcPlayerPoints={calcPlayerPoints} showBonus={_showModalBonus} onClose={() => set('matchModal', null)} styles={s} />}

        {matchModal === "gameFormat" && (
          <Modal onClose={() => set('matchModal', null)} title="경기방식">
            <div style={{ fontSize: 13, color: C.white, lineHeight: 1.7 }}>
              <div style={{ background: C.cardLight, borderRadius: 10, padding: 12, marginBottom: 10 }}>
                <div style={{ fontWeight: 700, color: C.accent, marginBottom: 6 }}>현재 설정</div>
                <div>{teamCount}팀 · {courtCount}코트 · {matchMode === "schedule" ? "대진표" : matchMode === "push" ? "밀어내기" : "자유대진"}{matchMode === "schedule" && courtCount === 1 ? ` · ${rotations}회전` : ""}</div>
                <div style={{ fontSize: 12, color: C.gray, marginTop: 4 }}>
                  {teamCount === 4 && courtCount === 2 && "동일팀 4번씩 경기 · 12라운드"}
                  {teamCount === 5 && courtCount === 2 && "동일팀 2번씩 경기 · 10라운드 · 매 라운드 1팀 휴식"}
                  {teamCount === 6 && courtCount === 2 && "조별리그 → 순위별 재편성 · 12라운드"}
                  {teamCount === 7 && courtCount === 2 && "전팀 풀리그 · 11라운드 · 매 라운드 3팀 휴식"}
                  {teamCount === 8 && courtCount === 2 && "조별리그(4팀×2조) → 순위별 재편성 · 12라운드"}
                  {courtCount === 1 && matchMode === "schedule" && `모든 팀 순서대로 경기 × ${rotations}회전`}
                  {matchMode === "free" && "매 라운드 직접 대진 선택"}
                  {matchMode === "push" && "승리팀 잔류, 패배팀 교체 · 2골 이상 승리 시 연장 · 3연승 후 휴식"}
                </div>
              </div>
              <details style={{ marginBottom: 8 }}>
                <summary style={{ fontSize: 12, color: C.gray, cursor: "pointer", padding: "8px 0" }}>다른 경기방식 보기</summary>
                <div style={{ fontSize: 11, color: C.gray, lineHeight: 1.8, padding: "8px 0" }}>
                  <b style={{ color: C.orange }}>4팀·2코트</b> — 동일팀 4번씩 경기 (4×라운드로빈) 12R<br/>
                  <b style={{ color: C.orange }}>5팀·2코트</b> — 동일팀 2번씩 경기 (더블 라운드로빈) 10R. 매 라운드 1팀 휴식<br/>
                  <b style={{ color: C.orange }}>6팀·2코트</b> — 조별리그 → 순위별 재편성 (그룹 스플릿) 12R<br/>
                  <b style={{ color: C.orange }}>N팀·1코트</b> — 모든 팀 순서대로 경기 × 회전수<br/>
                  <b style={{ color: C.accent }}>자동 팀편성</b> — 포인트순 지그재그 배정 (1→2→3→4 / 4→3→2→1)
                </div>
              </details>
            </div>
          </Modal>
        )}

        <div style={s.section}>
          {matchMode === "push" ? (
            <PushMatchView teams={teams} teamNames={teamNames} teamColorIndices={teamColorIndices} gks={gks} gksHistory={gksHistory || {}}
              allEvents={allEvents} onRecordEvent={recordMatchEvent}
              onUndoEvent={undoMatchEvent} onDeleteEvent={deleteEvent} onEditEvent={editEvent}
              onConfirmPushRound={confirmPushRound} onUnconfirmLastRound={unconfirmLastPushRound} completedMatches={completedMatches}
              attendees={attendees} onGkChange={handleGkChange} pushState={pushState}
              liveMercs={liveMercs || {}} onAddLiveMerc={handleAddLiveMerc} onRemoveLiveMerc={handleRemoveLiveMerc}
              absentees={absentees || {}} onToggleAbsent={handleToggleAbsent}
              onEditPastGk={handleEditPastGk} onEditPastMercAdd={handleEditPastMercAdd} onEditPastMercRemove={handleEditPastMercRemove} onEditPastAbsent={handleEditPastAbsent}
              styles={s} />
          ) : viewingFreeIdx !== null ? (
            <FreeMatchView teams={teams} teamNames={teamNames} teamColorIndices={teamColorIndices} gks={gks}
              courtCount={courtCount} allEvents={allEvents} onRecordEvent={recordMatchEvent}
              onUndoEvent={undoMatchEvent} onDeleteEvent={deleteEvent} onEditEvent={editEvent}
              onFinishMatch={finishMatch} onConfirmFreeRound={confirmFreeRound} completedMatches={completedMatches}
              freeCourtMatches={freeCourtMatches} onSetFreeCourtMatch={setFreeCourtMatch}
              attendees={attendees} onGkChange={handleGkChange}
              liveMercs={liveMercs || {}} onAddLiveMerc={handleAddLiveMerc} onRemoveLiveMerc={handleRemoveLiveMerc}
              absentees={absentees || {}} onToggleAbsent={handleToggleAbsent}
              onEditPastGk={handleEditPastGk} onEditPastMercAdd={handleEditPastMercAdd} onEditPastMercRemove={handleEditPastMercRemove} onEditPastAbsent={handleEditPastAbsent}
              styles={s} isExtraRound={isExtraRound}
              forcedPastIdx={viewingFreeIdx}
              onExitForcedPast={() => setViewingFreeIdx(null)}
              roundDisplayOffset={roundDisplayOffset}
              totalRoundsForDisplay={schedule.length > 0 ? roundDisplayOffset + schedule.length : undefined} />
          ) : shouldShowSchedule ? (
            <ScheduleMatchView schedule={schedule} currentRoundIdx={currentRoundIdx}
              viewingRoundIdx={viewingRoundIdx} setViewingRoundIdx={(v) => set('viewingRoundIdx', v)}
              confirmedRounds={confirmedRounds} onConfirmRound={confirmRound}
              roundDisplayOffset={roundDisplayOffset}
              onWrapToLastFree={roundDisplayOffset > 0 ? () => {
                const fIndices = completedMatches.map((m, i) => m?.matchId?.startsWith?.('F') ? i : -1).filter(i => i >= 0);
                if (fIndices.length > 0) setViewingFreeIdx(fIndices[fIndices.length - 1]);
              } : undefined}
              teams={teams} teamNames={teamNames} teamColorIndices={teamColorIndices} gks={gks} gksHistory={gksHistory || {}}
              courtCount={courtCount} allEvents={allEvents} onRecordEvent={recordMatchEvent}
              onUndoEvent={undoMatchEvent} onDeleteEvent={deleteEvent} onEditEvent={editEvent}
              completedMatches={completedMatches} attendees={attendees} onGkChange={handleGkChange}
              liveMercs={liveMercs || {}} onAddLiveMerc={handleAddLiveMerc} onRemoveLiveMerc={handleRemoveLiveMerc}
              absentees={absentees || {}} onToggleAbsent={handleToggleAbsent}
              onEditPastGk={handleEditPastGk} onEditPastMercAdd={handleEditPastMercAdd} onEditPastMercRemove={handleEditPastMercRemove} onEditPastAbsent={handleEditPastAbsent}
              splitPhase={splitPhase} styles={s} />
          ) : (
            <FreeMatchView teams={teams} teamNames={teamNames} teamColorIndices={teamColorIndices} gks={gks}
              courtCount={courtCount} allEvents={allEvents} onRecordEvent={recordMatchEvent}
              onUndoEvent={undoMatchEvent} onDeleteEvent={deleteEvent} onEditEvent={editEvent}
              onFinishMatch={finishMatch} onConfirmFreeRound={confirmFreeRound} completedMatches={completedMatches}
              freeCourtMatches={freeCourtMatches} onSetFreeCourtMatch={setFreeCourtMatch}
              attendees={attendees} onGkChange={handleGkChange}
              liveMercs={liveMercs || {}} onAddLiveMerc={handleAddLiveMerc} onRemoveLiveMerc={handleRemoveLiveMerc}
              absentees={absentees || {}} onToggleAbsent={handleToggleAbsent}
              onEditPastGk={handleEditPastGk} onEditPastMercAdd={handleEditPastMercAdd} onEditPastMercRemove={handleEditPastMercRemove} onEditPastAbsent={handleEditPastAbsent}
              styles={s} isExtraRound={isExtraRound}
              roundDisplayOffset={roundDisplayOffset}
              totalRoundsForDisplay={schedule.length > 0 ? roundDisplayOffset + schedule.length : undefined} />
          )}
        </div>

        {shouldShowSchedule && viewingFreeIdx === null && (
          <div style={s.bottomBar}>
            {!viewRoundConfirmed && viewingRoundIdx <= currentRoundIdx && viewingRoundIdx < schedule.length ? (
              <button onClick={handleConfirmScheduleRound} style={{ ...s.btn(C.accent, C.bg), flex: 1 }}>
                라운드 {viewingRoundIdx + 1 + roundDisplayOffset} 종료 확정
              </button>
            ) : viewRoundConfirmed ? (
              <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, flexWrap: "wrap" }}>
                <span style={{ color: C.green, fontWeight: 700, padding: 10 }}>라운드 {viewingRoundIdx + 1 + roundDisplayOffset} 종료됨</span>
                <button onClick={() => handleUnconfirmRound(viewingRoundIdx)}
                  style={{ ...s.btnSm(C.orange, C.bg), fontSize: 11 }}>확정취소</button>
              </div>
            ) : null}
          </div>
        )}
      </div>
    );
  }

  // SUMMARY PHASE
  if (phase === "summary") {
    const standings = finalStandings;
    const playerRows = attendees.map(p => ({ name: p, team: getPlayerTeamName(p), ...calcPlayerPoints(p) })).sort((a, b) => b.total - a.total);
    const gameDate = gameDateFromId(gameId);

    return (
      <div style={s.app}>
        <div style={s.header}>
          <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <button onClick={onBackToMenu} style={{
              position: "absolute", left: 0, background: "none", border: "none",
              color: "var(--app-text-primary)", fontSize: 22, cursor: "pointer", padding: "0 4px", lineHeight: 1,
            }}>‹</button>
            <div style={s.title}>📊 최종 집계</div>
          </div>
          <div style={s.subtitle}>{gameDate.toLocaleDateString("ko-KR")} · {completedMatches.length}매치</div>
        </div>
        <PhaseIndicator activeIndex={3} />
        <div style={s.section}>
          <div style={s.sectionTitle}>🏆 팀 순위</div>
          <div style={s.card}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr>{["#", "팀", "경기", "승", "무", "패", "득", "실", "승점", ...(courtCount === 2 ? [""] : [])].map(h => <th key={h} style={s.th}>{h}</th>)}</tr></thead>
              <tbody>
                {standings.map((t, i) => (
                  <tr key={t.name} style={{ background: i === 0 ? `${C.green}11` : i === standings.length - 1 ? `${C.red}11` : "transparent" }}>
                    <td style={s.td()}>{i + 1}</td><td style={s.td(true)}>{t.name}</td>
                    <td style={s.td()}>{t.games}</td><td style={s.td()}>{t.wins}</td><td style={s.td()}>{t.draws}</td><td style={s.td()}>{t.losses}</td>
                    <td style={s.td()}>{t.gf}</td><td style={s.td()}>{t.ga}</td><td style={s.td(true)}>{t.points}</td>
                    {courtCount === 2 && <td style={s.td()}>{i === 0 ? "🍀" : i === standings.length - 1 ? "🍠" : ""}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div style={s.section}>
          <div style={s.sectionTitle}>👤 선수별 기록</div>
          <div style={s.card}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr>{((matchMode !== "push" && courtCount === 2 && (state.settingsSnapshot?.useCrovaGoguma ?? gameSettings.useCrovaGoguma)) ? ["선수", "골", "어시", "역주행", "클린", "🍀", "🍠", "실점", "GK", "총점"] : ["선수", "골", "어시", "역주행", "클린", "실점", "GK", "총점"]).map(h => <th key={h} style={s.th}>{h}</th>)}</tr></thead>
              <tbody>
                {playerRows.map(p => (
                  <tr key={p.name}>
                    <td style={s.td(true)}>{p.name}<span style={{ fontSize: 10, color: C.gray, fontWeight: 400 }}>({p.team})</span></td>
                    <td style={s.td(p.goals > 0)}>{p.goals}</td><td style={s.td(p.assists > 0)}>{p.assists}</td>
                    <td style={{ ...s.td(p.owngoals > 0), color: p.owngoals > 0 ? C.red : C.white }}>{p.owngoals > 0 ? p.owngoals * (state.settingsSnapshot?.ownGoalPoint ?? gameSettings.ownGoalPoint) : 0}</td>
                    <td style={s.td(p.cleanSheets > 0)}>{p.cleanSheets}</td>
                    {matchMode !== "push" && courtCount === 2 && (state.settingsSnapshot?.useCrovaGoguma ?? gameSettings.useCrovaGoguma) && <td style={{ ...s.td(p.crova > 0), color: p.crova > 0 ? C.green : C.white }}>{p.crova || ""}</td>}
                    {matchMode !== "push" && courtCount === 2 && (state.settingsSnapshot?.useCrovaGoguma ?? gameSettings.useCrovaGoguma) && <td style={{ ...s.td(p.goguma < 0), color: p.goguma < 0 ? C.red : C.white }}>{p.goguma || ""}</td>}
                    <td style={s.td()}>{p.conceded}</td><td style={s.td()}>{p.keeperGames}</td>
                    <td style={{ ...s.td(true), fontSize: 14, fontWeight: 800 }}>{p.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div style={s.section}>
          <div style={s.sectionTitle}>📋 경기 기록</div>
          {completedMatches.map((m, i) => {
            const evts = allEvents.filter(e => e.matchId === m.matchId);
            return (
              <div key={i} style={{ ...s.card, background: m.isExtra ? `${C.orange}11` : C.card }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ fontSize: 11, color: C.gray }}>{(() => { const pP = m.matchId.match(/^P(\d+)_C0$/); if (pP) return `${pP[1]}경기`; const pF = m.matchId.match(/^F(\d+)_C(\d+)$/); if (pF) { const ct = courtCount === 2 ? (pF[2] === "0" ? "A구장" : "B구장") : ""; return `${pF[1]}경기${ct ? " " + ct : ""}`; } const p = m.matchId.match(/^R(\d+)_C(\d+)$/); if (!p) return m.matchId; const court = courtCount === 2 ? (p[2] === "0" ? "A구장" : "B구장") : `매치${+p[2]+1}`; return `${p[1]}라운드 ${court}`; })()}{m.isExtra ? " (임시)" : ""}</span>
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
                      <div key={ei} style={s.eventLog}>
                        <span>{e.type === "goal" ? "⚽" : e.type === "foul" ? "🟨" : "🔴"}</span>
                        <span style={{ fontWeight: 600 }}>{e.player}</span>
                        <span style={{ color: C.gray, fontSize: 11 }}>({e.type === "goal" ? "골" : e.type === "foul" ? "반칙" : "자책골"})</span>
                        {e.assist && <span style={{ color: C.gray, fontSize: 11 }}> ← {e.assist}<span style={{ opacity: 0.7 }}>(어시)</span></span>}
                        {e.type !== "foul" && e.concedingGk && <span style={{ color: C.gray, fontSize: 11 }}> / 실점: {e.concedingGk}{e.type === "owngoal" ? " (2점)" : ""}</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
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
              disabled={!gameFinalized}
              onClick={async () => {
                if (!confirm("경기를 아카이브하면 더 이상 수정할 수 없습니다.\n수정이 필요하면 'Archive'에서 복구할 수 있습니다.\n\n아카이브하시겠습니까?")) return;
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
              style={{ ...s.btn(C.grayDark), opacity: gameFinalized ? 1 : 0.3, cursor: gameFinalized ? "pointer" : "not-allowed" }}>
              Archive
            </button>
          )}
        </div>
      </div>
    );
  }

  return null;
}
