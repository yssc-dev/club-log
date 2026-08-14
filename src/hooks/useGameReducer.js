import { useReducer } from 'react';
import { FALLBACK_DATA } from '../config/fallbackData';
import { calcMatchScore } from '../utils/scoring';
import { calcSoccerScore, remapPlayerInSoccerEvents } from '../utils/soccerScoring';
import { createInitialPushState, calcNextPushMatch } from '../utils/pushMatch';
import { FORMATIONS, swapFormationSlots, defendersFromPositionMap, revertSubInFormation } from '../utils/formations';
import { teamAbsentList, pruneAbsentPlayer } from '../utils/absentees';

const initialState = {
  phase: "setup",
  dataLoading: true,
  dataSource: "",
  seasonPlayers: FALLBACK_DATA.players,
  seasonCrova: FALLBACK_DATA.seasonCrova,
  seasonGoguma: FALLBACK_DATA.seasonGoguma,
  syncStatus: "",
  attendanceLoading: false,
  attendees: [],
  newPlayer: "",
  teamCount: 4,
  courtCount: 2,
  matchMode: "schedule",
  rotations: 2,
  draftMode: "snake",
  freeSelectTeam: 0,
  teams: [],
  teamNames: [],
  teamColorIndices: [],
  gks: {},
  gksHistory: {},  // { roundIdx: { teamIdx: playerName } } — 확정된 라운드별 GK 기록
  // 라이브 매치별 용병 — { matchId: [{ player, teamIdx }] }. 라운드 확정 시 해당 entry는 클리어되고 명단 스냅샷이 completedMatches[i].homePlayers/awayPlayers/mercenaries로 저장됨.
  liveMercs: {},
  // 매치별 휴식 선수 — { matchId: { teamIdx: [name] } }. 라운드 확정 시 completedMatches[i].homeAbsent/awayAbsent로 박제.
  absentees: {},
  // 자유대진 수동 편성(확정 전) — { courtIdx: { home: teamIdx, away: teamIdx } }. RTDB 동기화 대상이라 실시간 공유됨(대진표모드 schedule / 밀어내기 pushState와 동급). 라운드 확정 시 {}로 클리어.
  freeCourtMatches: {},
  editingTeamName: null,
  moveSource: null,
  schedule: [],
  currentRoundIdx: 0,
  viewingRoundIdx: 0,
  confirmedRounds: {},
  completedMatches: [],
  allEvents: [],
  isExtraRound: false,
  splitPhase: null,
  gameCreator: "",
  earlyFinish: false,
  gameFinalized: false,
  matchModal: null,
  matchModal_sortKey: "total",
  playerSortMode: "point",
  pushState: null,
  // 경기 중 팀 명단 수정
  teamEditMode: false,
  teamEditSnapshot: null,
  // 축구 전용
  soccerMatches: [],
  currentMatchIdx: -1,
  opponents: [],
  soccerFormation: null, // UI 네비 상태만: { viewState, selectedOpponent, selectedPlayers }. 포메이션 데이터는 경기 객체가 단일 소스.
  // 경기 시작 시 스냅샷된 effective settings — 경기 중 규칙 변경에 영향받지 않음
  settingsSnapshot: null,
};

// 같은 배치(라운드 또는 동시 라이브 매치) 내 다른 매치들의 mercs player Set 반환.
// scopeMatchIds가 비어있거나 result.matchId만 있으면 빈 Set.
function collectBorrowedOut(liveMercs, currentMatchId, scopeMatchIds) {
  const out = new Set();
  if (!liveMercs) return out;
  for (const mid of scopeMatchIds || []) {
    if (mid === currentMatchId) continue;
    const list = liveMercs[mid] || [];
    for (const m of list) out.add(m.player);
  }
  return out;
}

// matchId의 배치 키 — 같은 라운드/동시 라이브였던 매치들을 묶음.
// schedule: R{n}_, free: F{n}_, push: 단일 매치(null 반환).
function getMatchBatchKey(matchId) {
  const m = String(matchId || '').match(/^([RF]\d+_)/);
  return m ? m[1] : null;
}

// 같은 배치 내 다른 confirmed 매치의 mercenaries를 종합해
// 해당 매치의 base에서 차출자를 제외한 homePlayers/awayPlayers를 재계산.
// completedMatches 배열을 받아 갱신된 배열 반환.
function rebuildBatchSnapshots(completedMatches, batchKey, teams) {
  if (!batchKey) return completedMatches;
  const inBatch = completedMatches.filter(m => getMatchBatchKey(m.matchId) === batchKey);
  if (inBatch.length === 0) return completedMatches;
  // 배치 내 모든 mercs player set
  const mercByMatch = {};
  inBatch.forEach(m => {
    mercByMatch[m.matchId] = (m.mercenaries || []).map(x => x.player);
  });
  return completedMatches.map(m => {
    if (getMatchBatchKey(m.matchId) !== batchKey) return m;
    const ownMercs = m.mercenaries || [];
    const ownHomeMercs = ownMercs.filter(x => x.teamIdx === m.homeIdx).map(x => x.player);
    const ownAwayMercs = ownMercs.filter(x => x.teamIdx === m.awayIdx).map(x => x.player);
    const ownMercPlayers = new Set(ownMercs.map(x => x.player));
    const homeBase = teams?.[m.homeIdx] || [];
    const awayBase = teams?.[m.awayIdx] || [];
    // 다른 매치들의 mercs(차출자) 모음
    const borrowedOut = new Set();
    Object.entries(mercByMatch).forEach(([mid, players]) => {
      if (mid === m.matchId) return;
      players.forEach(p => borrowedOut.add(p));
    });
    // 본 매치의 자기 측·반대 측 mercs도 base에서 제외 (self-borrow 처리)
    const homeBaseEff = homeBase.filter(p => !borrowedOut.has(p) && !ownMercPlayers.has(p));
    const awayBaseEff = awayBase.filter(p => !borrowedOut.has(p) && !ownMercPlayers.has(p));
    const homePlayers = [...homeBaseEff, ...ownHomeMercs];
    const awayPlayers = [...awayBaseEff, ...ownAwayMercs];
    return { ...m, homePlayers, awayPlayers };
  });
}

// 라이브 매치 결과에 명단 스냅샷을 합쳐 저장 가능한 형태로 변환.
// scopeMatchIds: 같은 배치 내 모든 matchId. 다른 매치로 차출된 player는 base에서 제외.
function snapshotMatchResult(result, teams, liveMercs, scopeMatchIds, absentees) {
  const mercList = (liveMercs && result?.matchId) ? (liveMercs[result.matchId] || []) : [];
  const homeBase = teams?.[result.homeIdx] || [];
  const awayBase = teams?.[result.awayIdx] || [];
  const homeMercs = mercList.filter(m => m.teamIdx === result.homeIdx).map(m => m.player);
  const awayMercs = mercList.filter(m => m.teamIdx === result.awayIdx).map(m => m.player);
  // 같은 배치 내 다른 매치로 차출된 player는 본 매치 base에서 제외 (중복 카운트 방지)
  const borrowedOut = collectBorrowedOut(liveMercs, result.matchId, scopeMatchIds);
  // 같은 매치 내 self-borrow도 base에서 제외 (예: 팀4 선수가 같은 매치의 팀3 측 mercs로 등록)
  const ownMercPlayers = new Set(mercList.map(m => m.player));
  const homeBaseEff = homeBase.filter(p => !borrowedOut.has(p) && !ownMercPlayers.has(p));
  const awayBaseEff = awayBase.filter(p => !borrowedOut.has(p) && !ownMercPlayers.has(p));
  const homePlayers = [...homeBaseEff, ...homeMercs];
  const awayPlayers = [...awayBaseEff, ...awayMercs];
  // 매치별 휴식 스냅샷 — 그 팀 명단에 실제로 있는 사람만 박제(유령 레코드 차단)
  const homeAbsent = teamAbsentList(absentees, result?.matchId, result.homeIdx, homePlayers);
  const awayAbsent = teamAbsentList(absentees, result?.matchId, result.awayIdx, awayPlayers);
  return {
    ...result,
    homePlayers,
    awayPlayers,
    mercenaries: mercList.map(m => ({ player: m.player, teamIdx: m.teamIdx })),
    homeAbsent,
    awayAbsent,
  };
}

// 이벤트 변경 시 confirmed 매치들의 점수를 allEvents 기반으로 재계산.
// 매치업(homeIdx/awayIdx) 등 다른 필드는 유지 — 과거 대진은 절대 바뀌지 않음.
function recomputeCompletedScores(completedMatches, allEvents) {
  let changed = false;
  const next = completedMatches.map(m => {
    if (!m.matchId) return m;
    const evts = allEvents.filter(e => e.matchId === m.matchId);
    const homeScore = calcMatchScore(evts, m.matchId, m.homeTeam);
    const awayScore = calcMatchScore(evts, m.matchId, m.awayTeam);
    if (homeScore === m.homeScore && awayScore === m.awayScore) return m;
    changed = true;
    return { ...m, homeScore, awayScore };
  });
  return changed ? next : completedMatches;
}

// 밀어내기 모드: completedMatches 순회로 pushState 재계산.
// 과거 매치업은 그대로 유지하고, 새 점수 기준으로 다음 라이브 매치 추천만 갱신됨.
function recomputePushStateFromCompleted(completedMatches, teamCount, teamNames) {
  let ps = createInitialPushState(teamCount);
  for (const m of completedMatches) {
    ps = calcNextPushMatch(ps, {
      homeIdx: m.homeIdx, awayIdx: m.awayIdx,
      homeScore: m.homeScore, awayScore: m.awayScore,
    }, teamCount, teamNames);
  }
  return ps;
}

// 이벤트 변경에 따라 completedMatches/pushState를 일괄 갱신해 반환.
function applyEventChange(state, allEvents) {
  const completedMatches = recomputeCompletedScores(state.completedMatches, allEvents);
  const updates = { allEvents };
  if (completedMatches !== state.completedMatches) {
    updates.completedMatches = completedMatches;
    if (state.matchMode === 'push' && state.pushState) {
      updates.pushState = recomputePushStateFromCompleted(completedMatches, state.teamCount, state.teamNames);
    }
  }
  return updates;
}

// matchId → gksHistory key + (해당 매치의) teamIdx 변환.
// 풋살 schedule: R{n}_C{i} → gksHistory[n-1] (roundIdx 기반, 같은 라운드 2코트 공유)
// 풋살 push: P{n}_C0 → gksHistory[completedMatches index]
// 풋살 free: F{N}_C{ci} → gksHistory[completedMatches index] (매치 단위)
function resolveGksHistoryKey(matchId, completedIdx) {
  const sm = String(matchId || '').match(/^R(\d+)_C(\d+)$/);
  if (sm) return parseInt(sm[1], 10) - 1;
  if (/^P\d+_C0$/.test(matchId)) return completedIdx;
  if (/^F\d+_C\d+$/.test(matchId)) return completedIdx;
  return null;
}

function gameReducer(state, action) {
  switch (action.type) {
    case 'SET_FIELD':
      return { ...state, [action.field]: action.value };
    case 'SET_FIELDS':
      return { ...state, ...action.fields };
    case 'RESTORE_STATE': {
      const s = action.state;
      const updates = {};
      // 배열/객체 필드: != null 체크로 빈 배열([])과 빈 객체({})도 정상 복원
      if (s.attendees != null) updates.attendees = s.attendees;
      if (s.teamCount != null) updates.teamCount = s.teamCount;
      if (s.courtCount != null) updates.courtCount = s.courtCount;
      if (s.matchMode != null) updates.matchMode = s.matchMode;
      if (s.rotations != null) updates.rotations = s.rotations;
      if (s.teams != null) updates.teams = s.teams;
      // 팀명 정규화: 구버전 "팀 X" (공백 포함) → "팀X" 통일
      const normalizeTeamName = (n) => (typeof n === 'string' ? n.replace(/^팀 /, '팀') : n);
      if (s.teamNames != null) updates.teamNames = s.teamNames.map(normalizeTeamName);
      if (s.teamColorIndices != null) updates.teamColorIndices = s.teamColorIndices;
      if (s.gks != null) updates.gks = s.gks;
      if (s.gksHistory != null) updates.gksHistory = s.gksHistory;
      if (s.liveMercs != null) updates.liveMercs = s.liveMercs;
      if (s.absentees != null) updates.absentees = s.absentees;
      if (s.schedule != null) updates.schedule = s.schedule;
      if (s.currentRoundIdx != null) {
        // ★ 범위 보정: schedule 길이를 초과하면 마지막 라운드로 고정
        const maxIdx = (updates.schedule || s.schedule || state.schedule || []).length - 1;
        updates.currentRoundIdx = maxIdx >= 0 ? Math.min(s.currentRoundIdx, maxIdx) : s.currentRoundIdx;
        // ★ 자가복구: confirmedRounds 의 최대 인덱스보다 작으면 끌어올림.
        // 과거 UNCONFIRM_ROUND 가 currentRoundIdx 를 잘못 롤백한 상태가 저장됐을 때 복구.
        if (s.confirmedRounds && typeof s.confirmedRounds === 'object') {
          const confirmedKeys = Object.entries(s.confirmedRounds)
            .filter(([, v]) => v)
            .map(([k]) => parseInt(k, 10))
            .filter(n => !isNaN(n));
          if (confirmedKeys.length > 0) {
            const maxConfirmed = Math.max(...confirmedKeys);
            if (updates.currentRoundIdx < maxConfirmed) updates.currentRoundIdx = maxConfirmed;
          }
        }
      }
      if (s.completedMatches != null) {
        updates.completedMatches = s.completedMatches.map(m => ({
          ...m,
          homeTeam: normalizeTeamName(m.homeTeam),
          awayTeam: normalizeTeamName(m.awayTeam),
        }));
      }
      if (s.allEvents != null) {
        updates.allEvents = s.allEvents.map(e => ({
          ...e,
          team: normalizeTeamName(e.team),
          scoringTeam: normalizeTeamName(e.scoringTeam),
          concedingTeam: normalizeTeamName(e.concedingTeam),
        }));
      }
      if (s.isExtraRound != null) updates.isExtraRound = s.isExtraRound;
      if (s.splitPhase != null) {
        // splitPhase 는 schedule 모드에서만 의미 있음 (push/free 무관).
        // 구버전 initialState 가 "first" 였던 잔재 정리.
        const mm = updates.matchMode ?? s.matchMode ?? state.matchMode;
        updates.splitPhase = (mm === 'schedule') ? s.splitPhase : null;
      }
      // viewingRoundIdx는 로컬 전용 — 원격 저장값 무시, currentRoundIdx 기준으로 설정
      {
        const resolvedCurrent = updates.currentRoundIdx ?? state.currentRoundIdx ?? 0;
        const maxIdx2 = (updates.schedule || s.schedule || state.schedule || []).length - 1;
        updates.viewingRoundIdx = maxIdx2 >= 0 ? Math.min(resolvedCurrent, maxIdx2) : resolvedCurrent;
      }
      if (s.confirmedRounds != null) updates.confirmedRounds = s.confirmedRounds;
      if (s.freeCourtMatches != null) updates.freeCourtMatches = s.freeCourtMatches;
      if (s.earlyFinish != null) updates.earlyFinish = s.earlyFinish;
      if (s.gameFinalized != null) updates.gameFinalized = s.gameFinalized;
      if (s.pushState != null) updates.pushState = s.pushState;
      if (s.soccerMatches != null) updates.soccerMatches = s.soccerMatches;
      if (s.currentMatchIdx != null) updates.currentMatchIdx = s.currentMatchIdx;
      if (s.opponents != null) updates.opponents = s.opponents;
      if (s.soccerFormation !== undefined) updates.soccerFormation = s.soccerFormation; // null도 반영(다른 탭이 종료/초기화 시 동기화)
      if (s.gameCreator != null) updates.gameCreator = s.gameCreator;
      if (s.phase != null) updates.phase = s.phase;
      if (s.settingsSnapshot != null) updates.settingsSnapshot = s.settingsSnapshot;
      // ★ 자가복구: ENTER_TEAM_EDIT 도중 종료된 잔재
      // (phase=teamBuild지만 라운드 진행 흔적이 남아있음 → 'match'로 복구)
      // teamEditMode/teamEditSnapshot은 로컬 전용이라 sync되지 않아 발생.
      if (updates.phase === 'teamBuild') {
        const sched = updates.schedule ?? state.schedule ?? [];
        const completed = updates.completedMatches ?? state.completedMatches ?? [];
        const confirmed = updates.confirmedRounds ?? state.confirmedRounds ?? {};
        const curIdx = updates.currentRoundIdx ?? state.currentRoundIdx ?? 0;
        const hasProgress = (sched && sched.length > 0) && (
          completed.length > 0 ||
          Object.values(confirmed).some(v => !!v) ||
          curIdx > 0
        );
        if (hasProgress) updates.phase = 'match';
      }
      return { ...state, ...updates };
    }
    case 'TOGGLE_ATTENDEE': {
      const name = action.name;
      const attendees = state.attendees.includes(name)
        ? state.attendees.filter(x => x !== name)
        : [...state.attendees, name];
      return { ...state, attendees };
    }
    case 'SET_ATTENDEES':
      return { ...state, attendees: action.attendees };
    case 'ADD_EVENT': {
      const allEvents = [...state.allEvents, action.event];
      return { ...state, ...applyEventChange(state, allEvents) };
    }
    case 'UNDO_EVENT': {
      const { courtId, matchId } = action;
      const idx = [];
      state.allEvents.forEach((e, i) => { if (e.matchId === matchId && e.courtId === courtId) idx.push(i); });
      if (idx.length === 0) return state;
      const allEvents = state.allEvents.filter((_, i) => i !== idx[idx.length - 1]);
      return { ...state, ...applyEventChange(state, allEvents) };
    }
    case 'DELETE_EVENT': {
      const allEvents = state.allEvents.filter((_, i) => i !== action.index);
      return { ...state, ...applyEventChange(state, allEvents) };
    }
    case 'EDIT_EVENT': {
      const allEvents = state.allEvents.map((e, i) =>
        i === action.index ? { ...action.event, courtId: e.courtId, timestamp: e.timestamp } : e
      );
      return { ...state, ...applyEventChange(state, allEvents) };
    }
    case 'EDIT_PAST_GK': {
      const { matchId, side, player } = action;
      const idx = state.completedMatches.findIndex(m => m.matchId === matchId);
      if (idx === -1) return state;
      const m = state.completedMatches[idx];
      const next = side === 'home' ? { ...m, homeGk: player } : { ...m, awayGk: player };
      const completedMatches = state.completedMatches.map((x, i) => i === idx ? next : x);
      const histKey = resolveGksHistoryKey(matchId, idx);
      const teamIdx = side === 'home' ? m.homeIdx : m.awayIdx;
      let gksHistory = state.gksHistory;
      if (histKey != null && teamIdx != null) {
        gksHistory = {
          ...gksHistory,
          [histKey]: { ...(gksHistory[histKey] || {}), [teamIdx]: player },
        };
      }
      return { ...state, completedMatches, gksHistory };
    }
    case 'EDIT_PAST_MERC_ADD': {
      const { matchId, player, teamIdx } = action;
      const idx = state.completedMatches.findIndex(m => m.matchId === matchId);
      if (idx === -1) return state;
      const target = state.completedMatches[idx];
      const isHome = teamIdx === target.homeIdx;
      const isAway = teamIdx === target.awayIdx;
      if (!isHome && !isAway) return state;
      // 같은 player가 같은 teamIdx로 이미 있으면 no-op (기존 동작 보존).
      const existing = (target.mercenaries || []).find(x => x.player === player);
      if (existing && existing.teamIdx === teamIdx) return state;
      // 같은 배치의 다른 confirmed 매치에서 같은 player가 mercs로 등록돼 있으면 거기서 제거 (자동 이동).
      // 본 매치에 stale entry(잘못된 teamIdx)가 있으면 정리하고 새 entry로 교체.
      const batchKey = getMatchBatchKey(matchId);
      let nextCompleted = state.completedMatches.map((m, i) => {
        if (i === idx) {
          const cleaned = (m.mercenaries || []).filter(x => x.player !== player);
          return { ...m, mercenaries: [...cleaned, { player, teamIdx }] };
        }
        if (batchKey && getMatchBatchKey(m.matchId) === batchKey) {
          const mercs = m.mercenaries || [];
          if (mercs.some(x => x.player === player)) {
            return { ...m, mercenaries: mercs.filter(x => x.player !== player) };
          }
        }
        return m;
      });
      // 배치 단위로 homePlayers/awayPlayers 재계산. push처럼 batchKey 없으면 단건만 갱신.
      if (batchKey) {
        nextCompleted = rebuildBatchSnapshots(nextCompleted, batchKey, state.teams);
      } else {
        // 단건: 본 매치만 갱신
        nextCompleted = nextCompleted.map((m, i) => {
          if (i !== idx) return m;
          const homeBase = state.teams?.[m.homeIdx] || [];
          const awayBase = state.teams?.[m.awayIdx] || [];
          const ownMercs = m.mercenaries || [];
          const ownMercPlayers = new Set(ownMercs.map(x => x.player));
          const ownHomeMercs = ownMercs.filter(x => x.teamIdx === m.homeIdx).map(x => x.player);
          const ownAwayMercs = ownMercs.filter(x => x.teamIdx === m.awayIdx).map(x => x.player);
          const homeBaseEff = homeBase.filter(p => !ownMercPlayers.has(p));
          const awayBaseEff = awayBase.filter(p => !ownMercPlayers.has(p));
          return {
            ...m,
            homePlayers: [...homeBaseEff, ...ownHomeMercs],
            awayPlayers: [...awayBaseEff, ...ownAwayMercs],
          };
        });
      }
      return { ...state, completedMatches: nextCompleted };
    }
    case 'EDIT_PAST_MERC_REMOVE': {
      const { matchId, player } = action;
      const idx = state.completedMatches.findIndex(m => m.matchId === matchId);
      if (idx === -1) return state;
      const target = state.completedMatches[idx];
      if (!(target.mercenaries || []).some(x => x.player === player)) return state;
      const batchKey = getMatchBatchKey(matchId);
      let nextCompleted = state.completedMatches.map((m, i) => {
        if (i !== idx) return m;
        return { ...m, mercenaries: (m.mercenaries || []).filter(x => x.player !== player) };
      });
      if (batchKey) {
        nextCompleted = rebuildBatchSnapshots(nextCompleted, batchKey, state.teams);
      } else {
        nextCompleted = nextCompleted.map((m, i) => {
          if (i !== idx) return m;
          const homeBase = state.teams?.[m.homeIdx] || [];
          const awayBase = state.teams?.[m.awayIdx] || [];
          const ownMercs = m.mercenaries || [];
          const ownMercPlayers = new Set(ownMercs.map(x => x.player));
          const ownHomeMercs = ownMercs.filter(x => x.teamIdx === m.homeIdx).map(x => x.player);
          const ownAwayMercs = ownMercs.filter(x => x.teamIdx === m.awayIdx).map(x => x.player);
          const homeBaseEff = homeBase.filter(p => !ownMercPlayers.has(p));
          const awayBaseEff = awayBase.filter(p => !ownMercPlayers.has(p));
          return {
            ...m,
            homePlayers: [...homeBaseEff, ...ownHomeMercs],
            awayPlayers: [...awayBaseEff, ...ownAwayMercs],
          };
        });
      }
      return { ...state, completedMatches: nextCompleted };
    }
    case 'ADD_LIVE_MERC': {
      const { matchId, player, teamIdx } = action;
      const list = state.liveMercs[matchId] || [];
      const existing = list.find(m => m.player === player);
      // 같은 팀에 다시 추가하면 무시 (중복 추가 방지)
      if (existing && existing.teamIdx === teamIdx) return state;
      // 같은 매치의 다른 팀으로 추가 = 팀 이동. 순서는 유지해 카드 위치가 튀지 않게.
      // (제거→재추가를 강요하면 그 사이 휴식 기록이 이전 팀에 남아 유령이 됨)
      if (existing) {
        return {
          ...state,
          liveMercs: {
            ...state.liveMercs,
            [matchId]: list.map(m => (m.player === player ? { ...m, teamIdx } : m)),
          },
          absentees: pruneAbsentPlayer(state.absentees, player, { keep: { matchId, teamIdx } }),
        };
      }
      // 다른 라이브 매치에 차출돼 있으면 그쪽에서 제거하고 본 매치로 이동 (한 player는 한 매치에만)
      const nextLiveMercs = { ...state.liveMercs };
      for (const otherId of Object.keys(nextLiveMercs)) {
        if (otherId === matchId) continue;
        const otherList = nextLiveMercs[otherId] || [];
        if (!otherList.some(m => m.player === player)) continue;
        const filtered = otherList.filter(m => m.player !== player);
        if (filtered.length === 0) delete nextLiveMercs[otherId];
        else nextLiveMercs[otherId] = filtered;
      }
      nextLiveMercs[matchId] = [...list, { player, teamIdx }];
      // 다른 팀/매치에 남아있던 휴식 기록 정리 — 소속이 바뀌면 그쪽 휴식은 무효.
      // (안 지우면 화면엔 표시 안 되는데 골/GK 입력만 막히는 유령 휴식이 됨)
      const nextAbsenteesAM = pruneAbsentPlayer(state.absentees, player, { keep: { matchId, teamIdx } });
      return { ...state, liveMercs: nextLiveMercs, absentees: nextAbsenteesAM };
    }
    case 'REMOVE_LIVE_MERC': {
      const { matchId, player } = action;
      const list = state.liveMercs[matchId] || [];
      const next = list.filter(m => m.player !== player);
      const nextLiveMercs = { ...state.liveMercs };
      if (next.length === 0) delete nextLiveMercs[matchId]; else nextLiveMercs[matchId] = next;
      // 이 매치에서 빠졌으므로 이 매치의 휴식 기록도 함께 정리
      const nextAbsenteesRM = pruneAbsentPlayer(state.absentees, player, { onlyMatchId: matchId });
      return { ...state, liveMercs: nextLiveMercs, absentees: nextAbsenteesRM };
    }
    case 'EDIT_PAST_ABSENT_TOGGLE': {
      // 과거 매치의 휴식 토글 — completedMatches[idx].homeAbsent/awayAbsent 스냅샷 직접 변경.
      // TOGGLE_ABSENT는 state.absentees 라이브 맵만 다루므로 confirmed 매치엔 효과 없음.
      const { matchId, teamIdx, player } = action;
      if (!matchId || teamIdx == null || !player) return state;
      const idx = state.completedMatches.findIndex(m => m.matchId === matchId);
      if (idx === -1) return state;
      const target = state.completedMatches[idx];
      const isHome = teamIdx === target.homeIdx;
      const isAway = teamIdx === target.awayIdx;
      if (!isHome && !isAway) return state;
      const field = isHome ? 'homeAbsent' : 'awayAbsent';
      const current = target[field] || [];
      const has = current.includes(player);
      const updated = has ? current.filter(p => p !== player) : [...current, player];
      const nextCompleted = state.completedMatches.map((m, i) =>
        i === idx ? { ...m, [field]: updated } : m
      );
      return { ...state, completedMatches: nextCompleted };
    }
    case 'TOGGLE_ABSENT': {
      // 매치별 휴식 토글. matchId + teamIdx 단위, player가 이미 있으면 제거, 없으면 추가.
      const { matchId, teamIdx, player } = action;
      if (!matchId || teamIdx == null || !player) return state;
      const next = { ...state.absentees };
      const forMatch = { ...(next[matchId] || {}) };
      const list = forMatch[teamIdx] || [];
      const has = list.includes(player);
      const updatedList = has ? list.filter(p => p !== player) : [...list, player];
      if (updatedList.length === 0) delete forMatch[teamIdx];
      else forMatch[teamIdx] = updatedList;
      if (Object.keys(forMatch).length === 0) delete next[matchId];
      else next[matchId] = forMatch;
      return { ...state, absentees: next };
    }
    case 'SET_FREE_COURT_MATCH': {
      // 자유대진 수동 편성 — courtIdx별 {home, away}. reducer state라 RTDB로 실시간 공유됨.
      return {
        ...state,
        freeCourtMatches: { ...state.freeCourtMatches, [action.courtIdx]: { home: action.home, away: action.away } },
      };
    }
    case 'FINISH_MATCH': {
      // 단건 finalize (free 모드 단일 코트 등). 다른 라이브 매치는 scope 외.
      const snapped = snapshotMatchResult(action.match, state.teams, state.liveMercs, [action.match?.matchId], state.absentees);
      const nextLiveMercs = { ...state.liveMercs };
      if (snapped.matchId) delete nextLiveMercs[snapped.matchId];
      const nextAbsentees = { ...state.absentees };
      if (snapped.matchId) delete nextAbsentees[snapped.matchId];
      // free F* matchId: gksHistory[completedIdx] = { homeIdx: gk, awayIdx: gk }
      const newIdx = state.completedMatches.length;
      const histKey = resolveGksHistoryKey(snapped.matchId, newIdx);
      let gksHistory = state.gksHistory;
      if (histKey != null) {
        const entry = {};
        if (snapped.homeIdx != null && snapped.homeGk) entry[snapped.homeIdx] = snapped.homeGk;
        if (snapped.awayIdx != null && snapped.awayGk) entry[snapped.awayIdx] = snapped.awayGk;
        gksHistory = { ...gksHistory, [histKey]: { ...(gksHistory[histKey] || {}), ...entry } };
      }
      return {
        ...state,
        completedMatches: [...state.completedMatches, snapped],
        gksHistory,
        liveMercs: nextLiveMercs,
        absentees: nextAbsentees,
        freeCourtMatches: {},
      };
    }
    case 'CONFIRM_FREE_ROUND': {
      // free 2코트 atomic finalize. 라운드 내 다른 매치 mercs를 base에서 제외해 저장.
      const { results } = action;
      const scope = results.map(r => r.matchId).filter(Boolean);
      const snappedResults = results.map(r =>
        snapshotMatchResult({ ...r, isExtra: state.isExtraRound }, state.teams, state.liveMercs, scope, state.absentees)
      );
      const nextLiveMercs = { ...state.liveMercs };
      snappedResults.forEach(r => { if (r.matchId) delete nextLiveMercs[r.matchId]; });
      const nextAbsenteesFR = { ...state.absentees };
      snappedResults.forEach(r => { if (r.matchId) delete nextAbsenteesFR[r.matchId]; });
      // 각 free 매치별로 gksHistory[completedIdx] 추가 (매치 단위)
      let gksHistory = state.gksHistory;
      let baseIdx = state.completedMatches.length;
      snappedResults.forEach((r, i) => {
        const histKey = resolveGksHistoryKey(r.matchId, baseIdx + i);
        if (histKey == null) return;
        const entry = {};
        if (r.homeIdx != null && r.homeGk) entry[r.homeIdx] = r.homeGk;
        if (r.awayIdx != null && r.awayGk) entry[r.awayIdx] = r.awayGk;
        gksHistory = { ...gksHistory, [histKey]: { ...(gksHistory[histKey] || {}), ...entry } };
      });
      return {
        ...state,
        completedMatches: [...state.completedMatches, ...snappedResults],
        gksHistory,
        liveMercs: nextLiveMercs,
        absentees: nextAbsenteesFR,
        freeCourtMatches: {},
      };
    }
    case 'CONFIRM_PUSH_ROUND': {
      const { matchResult, newPushState } = action;
      // push는 1코트라 scope에 자기 자신만
      const snapped = snapshotMatchResult(matchResult, state.teams, state.liveMercs, [matchResult?.matchId], state.absentees);
      const nextLiveMercs = { ...state.liveMercs };
      if (snapped.matchId) delete nextLiveMercs[snapped.matchId];
      const nextAbsenteesPush = { ...state.absentees };
      if (snapped.matchId) delete nextAbsenteesPush[snapped.matchId];
      return {
        ...state,
        completedMatches: [...state.completedMatches, snapped],
        gksHistory: { ...state.gksHistory, [state.completedMatches.length]: { ...state.gks } },
        gks: {},
        liveMercs: nextLiveMercs,
        absentees: nextAbsenteesPush,
        pushState: newPushState,
      };
    }
    case 'UNCONFIRM_PUSH_ROUND': {
      const { prevPushState } = action;
      const lastIdx = state.completedMatches.length - 1;
      const lastMatch = state.completedMatches[lastIdx];
      const newCompleted = state.completedMatches.slice(0, -1);
      const restoredGks = state.gksHistory[lastIdx] || {};
      const newGksHistory = { ...state.gksHistory };
      delete newGksHistory[lastIdx];
      // 확정취소 시 그 매치의 용병을 다시 라이브 상태로 복원
      const nextLiveMercs = { ...state.liveMercs };
      if (lastMatch?.matchId && Array.isArray(lastMatch.mercenaries) && lastMatch.mercenaries.length > 0) {
        nextLiveMercs[lastMatch.matchId] = lastMatch.mercenaries.map(m => ({ player: m.player, teamIdx: m.teamIdx }));
      }
      // 확정취소 시 그 매치의 휴식 정보도 라이브로 복원
      const nextAbsenteesUP = { ...state.absentees };
      if (lastMatch?.matchId) {
        const restored = {};
        if (lastMatch.homeAbsent?.length) restored[lastMatch.homeIdx] = lastMatch.homeAbsent;
        if (lastMatch.awayAbsent?.length) restored[lastMatch.awayIdx] = lastMatch.awayAbsent;
        if (Object.keys(restored).length > 0) nextAbsenteesUP[lastMatch.matchId] = restored;
      }
      return {
        ...state,
        completedMatches: newCompleted,
        gks: restoredGks,
        gksHistory: newGksHistory,
        liveMercs: nextLiveMercs,
        absentees: nextAbsenteesUP,
        pushState: prevPushState,
      };
    }
    case 'CONFIRM_ROUND': {
      const { roundIdx, matchResults, nextRoundIdx, newSchedule, newSplitPhase } = action;
      // 라운드 내 모든 매치를 scope로 묶어 차출자 base 제외 처리
      const roundScope = matchResults.map(r => r.matchId).filter(Boolean);
      const snappedResults = matchResults.map(r =>
        snapshotMatchResult({ ...r, isExtra: state.isExtraRound }, state.teams, state.liveMercs, roundScope, state.absentees)
      );
      const newCompleted = [...state.completedMatches, ...snappedResults];
      const nextLiveMercs = { ...state.liveMercs };
      snappedResults.forEach(r => { if (r.matchId) delete nextLiveMercs[r.matchId]; });
      const nextAbsenteesCR = { ...state.absentees };
      snappedResults.forEach(r => { if (r.matchId) delete nextAbsenteesCR[r.matchId]; });
      // 현재 GK를 라운드별 히스토리에 저장 후 초기화
      const updates = {
        completedMatches: newCompleted,
        confirmedRounds: { ...state.confirmedRounds, [roundIdx]: true },
        gksHistory: { ...state.gksHistory, [roundIdx]: { ...state.gks } },
        gks: {},
        liveMercs: nextLiveMercs,
        absentees: nextAbsenteesCR,
      };
      if (newSchedule) updates.schedule = newSchedule;
      if (newSplitPhase) updates.splitPhase = newSplitPhase;
      if (nextRoundIdx != null) {
        updates.currentRoundIdx = nextRoundIdx;
        // 확정한 라운드(roundIdx)를 보던 경우에만 다음 라운드로 자동 이동.
        // 사용자가 다른 과거 라운드를 보다가 확정한 경우엔 그 위치 유지.
        if (state.viewingRoundIdx === roundIdx) {
          updates.viewingRoundIdx = nextRoundIdx;
        }
      }
      return { ...state, ...updates };
    }
    case 'UNCONFIRM_ROUND': {
      const { roundIdx } = action;
      const prefix = `R${roundIdx + 1}_`;
      const newConfirmed = { ...state.confirmedRounds };
      delete newConfirmed[roundIdx];
      // 뒤에 확정된 라운드가 남아있으면(중간 라운드 취소) 라이브 gks 를 보존해야 함.
      // 구 라운드 GK로 덮어쓰면 이후 라운드 확정 시 잘못된 GK가 기록(로그_선수경기 오염)됨.
      const hasLaterConfirmed = Object.entries(newConfirmed)
        .some(([k, v]) => v && parseInt(k, 10) > roundIdx);
      const restoredGks = hasLaterConfirmed ? state.gks : (state.gksHistory[roundIdx] || {});
      const newGksHistory = { ...state.gksHistory };
      delete newGksHistory[roundIdx];
      // matchId 없는 항목(RTDB partial write 등)은 라운드 소속 판정 불가 — 보존
      const removedMatches = state.completedMatches.filter(
        m => (m.matchId || '').startsWith(prefix) && !m.isExtra
      );
      const newCompleted = state.completedMatches.filter(
        m => !(m.matchId || '').startsWith(prefix) || m.isExtra
      );
      // 확정취소 시 그 라운드 매치들의 용병을 다시 라이브로 복원
      const nextLiveMercs = { ...state.liveMercs };
      removedMatches.forEach(m => {
        if (m.matchId && Array.isArray(m.mercenaries) && m.mercenaries.length > 0) {
          nextLiveMercs[m.matchId] = m.mercenaries.map(x => ({ player: x.player, teamIdx: x.teamIdx }));
        }
      });
      // 휴식 정보도 함께 복원
      const nextAbsenteesUR = { ...state.absentees };
      removedMatches.forEach(m => {
        if (!m.matchId) return;
        const restored = {};
        if (m.homeAbsent?.length) restored[m.homeIdx] = m.homeAbsent;
        if (m.awayAbsent?.length) restored[m.awayIdx] = m.awayAbsent;
        if (Object.keys(restored).length > 0) nextAbsenteesUR[m.matchId] = restored;
      });
      // 뒤에 확정된 라운드가 남아있으면 currentRoundIdx 를 보존(진행 위치 유지).
      // 그렇지 않을 때만 roundIdx 로 롤백(가장 최신 라운드를 취소한 경우).
      const newCurrentRoundIdx = hasLaterConfirmed ? state.currentRoundIdx : roundIdx;
      const updates = {
        confirmedRounds: newConfirmed,
        gks: restoredGks,
        gksHistory: newGksHistory,
        completedMatches: newCompleted,
        liveMercs: nextLiveMercs,
        absentees: nextAbsenteesUR,
        currentRoundIdx: newCurrentRoundIdx,
        viewingRoundIdx: roundIdx,
        earlyFinish: false,
      };
      // 6·8팀 스플릿 후 전반부 취소 시 스플릿 초기화
      if (state.splitPhase === "second") {
        const firstHalfLen = (state.teamCount === 6 || state.teamCount === 8) && state.courtCount === 2 ? 6 : state.schedule.length;
        const isFirstHalf = roundIdx < firstHalfLen;
        if (isFirstHalf) {
          updates.splitPhase = "first";
          updates.schedule = state.schedule.slice(0, firstHalfLen);
        }
      }
      return { ...state, ...updates };
    }
    case 'MOVE_PLAYER': {
      const { player, fromIdx, toIdx } = action;
      const teams = state.teams.map(t => [...t]);
      teams[fromIdx] = teams[fromIdx].filter(p => p !== player);
      teams[toIdx] = [...teams[toIdx], player];
      const gks = { ...state.gks };
      if (gks[fromIdx] === player) delete gks[fromIdx];
      return { ...state, teams, gks };
    }
    case 'ENTER_TEAM_EDIT': {
      return {
        ...state,
        teamEditMode: true,
        teamEditSnapshot: {
          teams: state.teams.map(t => [...t]),
          teamNames: [...state.teamNames],
          attendees: [...state.attendees],
          gks: { ...state.gks },
        },
        phase: 'teamBuild',
        draftMode: 'free',
        matchModal: null,
        moveSource: null,
        editingTeamName: null,
      };
    }
    case 'EXIT_TEAM_EDIT_SAVE': {
      // GK 정리: 각 팀에서 빠진 선수가 GK로 지정돼 있으면 해제
      const newGks = { ...state.gks };
      state.teams.forEach((team, i) => {
        if (newGks[i] && !team.includes(newGks[i])) delete newGks[i];
      });
      // 팀명이 바뀐 경우 기존 이벤트의 팀명 문자열도 새 이름으로 동기화
      const snap = state.teamEditSnapshot;
      const nameMap = {};
      if (snap) {
        snap.teamNames.forEach((oldName, i) => {
          if (oldName !== state.teamNames[i]) nameMap[oldName] = state.teamNames[i];
        });
      }
      const remapTeamName = (name) => nameMap[name] ?? name;
      const remappedEvents = Object.keys(nameMap).length > 0
        ? state.allEvents.map(e => ({
            ...e,
            team: remapTeamName(e.team),
            scoringTeam: remapTeamName(e.scoringTeam),
            concedingTeam: remapTeamName(e.concedingTeam),
          }))
        : state.allEvents;
      const remappedCompleted = Object.keys(nameMap).length > 0
        ? state.completedMatches.map(m => ({
            ...m,
            homeTeam: remapTeamName(m.homeTeam),
            awayTeam: remapTeamName(m.awayTeam),
          }))
        : state.completedMatches;
      return {
        ...state,
        teamEditMode: false,
        teamEditSnapshot: null,
        gks: newGks,
        phase: 'match',
        moveSource: null,
        editingTeamName: null,
        allEvents: remappedEvents,
        completedMatches: remappedCompleted,
      };
    }
    case 'EXIT_TEAM_EDIT_CANCEL': {
      const snap = state.teamEditSnapshot;
      return {
        ...state,
        teams: snap.teams,
        teamNames: snap.teamNames,
        attendees: snap.attendees,
        gks: snap.gks,
        teamEditMode: false,
        teamEditSnapshot: null,
        phase: 'match',
        moveSource: null,
        editingTeamName: null,
      };
    }
    case 'APPEND_SCHEDULE_SEGMENT': {
      const { newRounds, newCourtCount } = action;
      if (!Array.isArray(newRounds) || newRounds.length === 0) return state;
      const newSchedule = [...state.schedule, ...newRounds];
      const prevLen = state.schedule.length;
      // 이전 segment를 다 확정했으면(currentRoundIdx >= prevLen) 새 첫 라운드 가리킴.
      // 미확정이 남아있으면 현재 위치 보존.
      const nextCurrent = (prevLen === 0 || state.currentRoundIdx >= prevLen) ? prevLen : state.currentRoundIdx;
      return {
        ...state,
        schedule: newSchedule,
        courtCount: typeof newCourtCount === 'number' ? newCourtCount : state.courtCount,
        currentRoundIdx: nextCurrent,
        viewingRoundIdx: nextCurrent,
      };
    }
    case 'POP_SCHEDULE_SEGMENT': {
      // 마지막 자동 segment 취소 — N개 라운드를 schedule 끝에서 제거.
      // 해당 라운드들의 confirmedRounds / completedMatches (R{ri+1}_C*) / gksHistory 도 같이 정리.
      const { count } = action;
      const rawCount = Number(count) || 0;
      if (rawCount <= 0) return state;
      const n = Math.min(rawCount, state.schedule.length);
      if (n <= 0) return state;
      const newLen = state.schedule.length - n;
      const removedIndices = new Set();
      for (let i = newLen; i < state.schedule.length; i++) removedIndices.add(i);
      // matchId R{ri+1}_C* 가 removed에 속하면 제거
      const removedMatchPrefix = (mid) => {
        const mt = mid?.match?.(/^R(\d+)_C\d+$/);
        if (!mt) return false;
        return removedIndices.has(+mt[1] - 1);
      };
      const newConfirmed = { ...state.confirmedRounds };
      for (const idx of removedIndices) delete newConfirmed[idx];
      const newGksHistory = { ...state.gksHistory };
      for (const idx of removedIndices) delete newGksHistory[idx];
      const newCompleted = state.completedMatches.filter(m => !removedMatchPrefix(m?.matchId));
      const newEvents = state.allEvents.filter(e => !removedMatchPrefix(e?.matchId));
      const newLiveMercs = { ...state.liveMercs };
      for (const mid of Object.keys(newLiveMercs)) if (removedMatchPrefix(mid)) delete newLiveMercs[mid];
      const newAbsentees = { ...state.absentees };
      for (const mid of Object.keys(newAbsentees)) if (removedMatchPrefix(mid)) delete newAbsentees[mid];
      const newCurrent = Math.min(state.currentRoundIdx, newLen);
      const newViewing = Math.min(state.viewingRoundIdx, Math.max(0, newLen - 1));
      return {
        ...state,
        schedule: state.schedule.slice(0, newLen),
        confirmedRounds: newConfirmed,
        completedMatches: newCompleted,
        allEvents: newEvents,
        gksHistory: newGksHistory,
        liveMercs: newLiveMercs,
        absentees: newAbsentees,
        currentRoundIdx: newCurrent,
        viewingRoundIdx: newViewing,
      };
    }
    case 'RESET_MATCH_PROGRESS': {
      // 팀 구성/명단/설정은 유지하고 라운드 진행 기록만 모두 초기화.
      // 게임 처음 시작 직후 상태와 동일.
      return {
        ...state,
        schedule: [],
        currentRoundIdx: 0,
        viewingRoundIdx: 0,
        completedMatches: [],
        allEvents: [],
        confirmedRounds: {},
        liveMercs: {},
        absentees: {},
        freeCourtMatches: {},
        gks: {},
        gksHistory: {},
        isExtraRound: false,
        earlyFinish: false,
        splitPhase: null,
        pushState: state.matchMode === 'push' ? createInitialPushState(state.teamCount) : null,
      };
    }
    case 'START_MATCHES': {
      const { schedule, pushState: initPushState } = action;
      return {
        ...state,
        schedule: schedule || [],
        currentRoundIdx: 0,
        completedMatches: [],
        allEvents: [],
        isExtraRound: false,
        viewingRoundIdx: 0,
        confirmedRounds: {},
        matchModal: null,
        phase: "match",
        gameFinalized: false,
        pushState: initPushState || null,
        splitPhase: action.splitPhase ?? null, // 6팀 스플릿만 'first', 나머지 모드/팀수는 null로 초기화(이전 게임 잔재 방지)
        liveMercs: {},
        freeCourtMatches: {},
        soccerMatches: [],
        currentMatchIdx: -1,
      };
    }
    case 'CREATE_SOCCER_MATCH': {
      const { opponent, lineup, gk, defenders, subs, formation, assignments, positionMap } = action;
      const newMatch = {
        matchIdx: state.soccerMatches.length,
        opponent, lineup, gk, defenders,
        subs: subs || [],
        // 포메이션 배치는 경기마다 영구 저장 — 다시 열기/풀편집을 위해
        formation: formation || null,
        assignments: assignments || null,
        positionMap: positionMap || null,
        events: [],
        startedAt: Date.now(),
        ourScore: 0, opponentScore: 0,
        status: "playing",
      };
      return {
        ...state,
        soccerMatches: [...state.soccerMatches, newMatch],
        currentMatchIdx: state.soccerMatches.length,
      };
    }
    // 경기 진행 중 포메이션/교체/카드로 배치가 바뀌면 경기 객체에 반영
    // (events/status/score 등 다른 필드는 덮어쓰지 않도록 포메이션 필드만 화이트리스트)
    case 'UPDATE_SOCCER_MATCH_FORMATION': {
      const { matchIdx, patch } = action;
      const allowed = {};
      for (const k of ["formation", "assignments", "positionMap", "gk", "subs", "defenders"]) {
        if (patch && patch[k] !== undefined) allowed[k] = patch[k];
      }
      const matches = state.soccerMatches.map((m, i) => i === matchIdx ? { ...m, ...allowed } : m);
      return { ...state, soccerMatches: matches };
    }
    // 상대팀만 교체(오기입 정정). 논리 matchIdx로 매칭 — 배열 index 불변식에 의존하지 않아
    // 격리 보장(타 경기 무변경). events/score/status/lineup 등 다른 필드는 스프레드로 보존.
    case 'SET_SOCCER_MATCH_OPPONENT': {
      const { matchIdx, opponent } = action;
      const matches = state.soccerMatches.map(m =>
        m.matchIdx === matchIdx ? { ...m, opponent } : m
      );
      return { ...state, soccerMatches: matches };
    }
    // 선발 오기입 정정: out(b, 잘못 기록)→in(a, 실제 뜀). 매치 전체 b→a 치환, b는 벤치로.
    // 교체(sub) 아님 → sub 이벤트 생성 안 함. b의 이벤트는 a로 이관. 논리 matchIdx 매칭.
    case 'CORRECT_SOCCER_LINEUP': {
      const { matchIdx, out: b, in: a } = action;
      if (!b || !a || b === a) return state;
      const matches = state.soccerMatches.map(m => {
        if (m.matchIdx !== matchIdx) return m;
        const lineup = (m.lineup || []).map(n => n === b ? a : n);
        const defenders = (m.defenders || []).map(n => n === b ? a : n);
        const assignments = {};
        for (const [idx, name] of Object.entries(m.assignments || {})) assignments[idx] = name === b ? a : name;
        const positionMap = { ...(m.positionMap || {}) };
        const roleForA = positionMap[b] ?? positionMap[a]; // b role, 없으면 a 기존 role(orphan)
        delete positionMap[b];
        if (roleForA !== undefined) positionMap[a] = roleForA;
        const gk = m.gk === b ? a : m.gk;
        const subs = [...(m.subs || []).filter(n => n !== a)];
        if (!subs.includes(b)) subs.push(b);
        const events = remapPlayerInSoccerEvents(m.events, b, a);
        const { ourScore, opponentScore } = calcSoccerScore(events);
        return { ...m, lineup, defenders, assignments, positionMap, gk, subs, events, ourScore, opponentScore };
      });
      return { ...state, soccerMatches: matches };
    }
    // 위치 교대(라인업 변경 편집기): 두 출전 슬롯의 위치만 교대. 논리 matchIdx 매칭(격리).
    // role이 바뀌면 defenders 재계산(클린시트 정합). 전제: 편집기 진입 시 레거시는 승격됨.
    case 'SWAP_SOCCER_LINEUP_POSITIONS': {
      const { matchIdx, aIdx, bIdx } = action;
      const matches = state.soccerMatches.map(m => {
        if (m.matchIdx !== matchIdx) return m;
        const positions = FORMATIONS[m.formation]?.positions;
        const res = swapFormationSlots(
          { assignments: m.assignments, positionMap: m.positionMap, gk: m.gk, positions },
          aIdx, bIdx
        );
        const defenders = defendersFromPositionMap(res.positionMap);
        // lineup 불변: SWAP은 '누가 뛰었는지'가 아닌 '어디서 뛰었는지'만 변경.
        // gkChange 미기록: 편집기 위치교대는 사후 정정이라 키퍼 교체(2인 집계)가 아님 — 최종 gk만 키퍼.
        return { ...m, assignments: res.assignments, positionMap: res.positionMap, gk: res.gk, defenders };
      });
      return { ...state, soccerMatches: matches };
    }
    // 휴식 경기: 생성+마감을 한 액션으로(2-dispatch 인덱스 레이스 제거)
    case 'CREATE_AND_FINISH_REST_MATCH': {
      const newMatch = {
        matchIdx: state.soccerMatches.length,
        opponent: "휴식", lineup: [], gk: "", defenders: [],
        subs: [], formation: null, assignments: null, positionMap: null,
        events: [], startedAt: Date.now(), ourScore: 0, opponentScore: 0,
        status: "finished",
      };
      return { ...state, soccerMatches: [...state.soccerMatches, newMatch], currentMatchIdx: -1 };
    }
    // 끝난 경기 다시 열기(풀편집): finished → playing 복귀
    // 다른 진행중 경기는 finished로 정리해 "playing은 최대 1개" 불변식 유지(오펀/중복 진행 방지)
    case 'REOPEN_SOCCER_MATCH': {
      const { matchIdx } = action;
      const matches = state.soccerMatches.map((m, i) => {
        if (i === matchIdx) return { ...m, status: "playing" };
        if (m.status === "playing") return { ...m, status: "finished" };
        return m;
      });
      return { ...state, soccerMatches: matches, currentMatchIdx: matchIdx };
    }
    case 'ADD_SOCCER_EVENT': {
      const { matchIdx, event } = action;
      const matches = state.soccerMatches.map((m, i) => {
        if (i !== matchIdx) return m;
        const events = [...(m.events || []), { ...event, id: event.id || Date.now().toString(), timestamp: event.timestamp || Date.now() }];
        const { ourScore, opponentScore } = calcSoccerScore(events); // 상대자책골 포함 단일 집계
        return { ...m, events, ourScore, opponentScore };
      });
      return { ...state, soccerMatches: matches };
    }
    case 'DELETE_SOCCER_EVENT': {
      // matchIdx는 배열 index(append-only 생성 + 삭제 없음으로 matchIdx===index 불변). 다른 소서 이벤트 액션과 동일.
      const { matchIdx, eventId } = action;
      const matches = state.soccerMatches.map((m, i) => {
        if (i !== matchIdx) return m;
        const deleted = (m.events || []).find(e => e.id === eventId);
        const events = (m.events || []).filter(e => e.id !== eventId);
        const { ourScore, opponentScore } = calcSoccerScore(events);
        // 교체(sub) 삭제 → 그 교체를 되돌린다. 단 그 슬롯(posIdx)이 이후 안 바뀐 경우만(오염 방지).
        // FormationRecorder 로컬 state와 같은 헬퍼 공유 — 한쪽만 되돌리는 드리프트 방지.
        const reverted = deleted ? revertSubInFormation(m, deleted) : null;
        if (reverted) return { ...m, events, ourScore, opponentScore, ...reverted };
        return { ...m, events, ourScore, opponentScore };
      });
      return { ...state, soccerMatches: matches };
    }
    case 'FINISH_SOCCER_MATCH': {
      const { matchIdx } = action;
      const matches = state.soccerMatches.map((m, i) =>
        i === matchIdx ? { ...m, status: "finished" } : m
      );
      return { ...state, soccerMatches: matches, currentMatchIdx: -1 };
    }
    case 'SET_SOCCER_FORMATION': {
      return { ...state, soccerFormation: action.formation };
    }
    case 'SET_OPPONENTS': {
      return { ...state, opponents: action.opponents };
    }
    case 'SET_SETTINGS_SNAPSHOT':
      return { ...state, settingsSnapshot: action.snapshot };
    default:
      return state;
  }
}

export function useGameReducer() {
  return useReducer(gameReducer, initialState);
}

export { initialState, gameReducer };
