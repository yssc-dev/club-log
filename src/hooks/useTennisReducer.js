import { useReducer } from 'react';
import {
  emptySet, incrementGame, incrementTiebreakPoint,
  isTiebreakActive, isSetComplete, matchWinner,
  TIEBREAK_POINTS_TO_WIN,
} from '../utils/tennis/tennisScoring';
import { normalizeTennisMatch, normalizeTennisCourt, normalizeScoringRules } from '../utils/tennis/normalizeTennisMatch';
import { isRoundComplete } from '../utils/tennis/roundConfirm';

export const tennisInitialState = {
  gameId: '',
  team: '',
  sport: '테니스',
  gameDate: '',
  season: null,
  phase: 'setup',
  attendees: [],
  guests: [],
  rounds: [],
  viewingRoundIdx: 1,
  gameCreator: '',
  confirmedRounds: {},
  scoringRules: normalizeScoringRules({}),
  gameFinalized: false,
};

// 확정된 라운드의 코트는 편집 불가 — UI 차단만으로는 실시간 동기화 다중 탭에서 뚫린다.
const COURT_EDIT_ACTIONS = new Set([
  'ADD_COURT', 'DELETE_COURT', 'SET_COURT_FORMAT', 'SET_COURT_BEST_OF',
  'ASSIGN_PLAYER', 'REMOVE_PLAYER', 'SWAP_SIDES', 'START_COURT',
  'INCREMENT_GAME', 'INCREMENT_TIEBREAK_POINT', 'INCREMENT_STAT',
  'END_SET', 'UNDO', 'EDIT_COURT_SETTINGS', 'EXTEND_TO_THREE_SETS',
]);

function newCourt(courtId) {
  return normalizeTennisCourt({ courtId, format: '단식', bestOf: 1, status: 'ready' });
}

export function findCourt(state, roundIdx, courtId) {
  const r = (state.rounds || []).find(x => x.roundIdx === roundIdx);
  if (!r) return null;
  return (r.courts || []).find(c => c.courtId === courtId) || null;
}

// 코트는 배열 index가 아니라 (roundIdx, courtId) 논리 키로 찾는다.
function mapCourt(state, roundIdx, courtId, fn) {
  return {
    ...state,
    rounds: (state.rounds || []).map(r => {
      if (r.roundIdx !== roundIdx) return r;
      return { ...r, courts: (r.courts || []).map(c => (c.courtId === courtId ? fn(c) : c)) };
    }),
  };
}

const slotsPerSide = (format) => (format === '복식' ? 2 : 1);

function pushUndo(court, entry) {
  return { ...court, undoStack: [...(court.undoStack || []), entry] };
}

function currentSetOf(court) {
  const sets = court.sets || [];
  return sets[court.currentSet] || null;
}

function withCurrentSet(court, nextSet) {
  const sets = [...(court.sets || [])];
  sets[court.currentSet] = nextSet;
  return { ...court, sets };
}

export function tennisReducer(state, action) {
  if (COURT_EDIT_ACTIONS.has(action.type) && (state.confirmedRounds || {})[action.roundIdx]) {
    return state;
  }
  switch (action.type) {
    case 'INIT_STATE':
      return { ...tennisInitialState, ...normalizeTennisMatch(action.state) };

    case 'SET_GAME_META': {
      // action을 통째로 전개하면 type이 state에 섞인다. 필요한 필드만 뽑는다.
      const { gameId, team, gameDate, season, gameCreator } = action;
      return {
        ...state,
        ...(gameId !== undefined && { gameId }),
        ...(team !== undefined && { team }),
        ...(gameDate !== undefined && { gameDate }),
        ...(season !== undefined && { season }),
        ...(gameCreator !== undefined && { gameCreator }),
      };
    }

    case 'SET_GAME_DATE': {
      if (state.phase !== 'setup') return state;         // 경기 시작 후 고정
      if (!/^\d{4}-\d{2}-\d{2}$/.test(action.date || '')) return state;
      return { ...state, gameDate: action.date, season: Number(action.date.slice(0, 4)) };
    }

    case 'SET_ATTENDEES':
      return { ...state, attendees: action.attendees || [] };

    case 'SET_SCORING_RULES':
      if (state.phase !== 'setup') return state;   // 경기 시작 후 고정
      return { ...state, scoringRules: normalizeScoringRules(action.rules) };

    case 'ADD_ATTENDEE': {
      if (!action.name || state.attendees.includes(action.name)) return state;
      return {
        ...state,
        attendees: [...state.attendees, action.name],
        guests: action.isGuest ? [...state.guests, action.name] : state.guests,
      };
    }

    case 'ADD_ROUND': {
      const nextIdx = (state.rounds || []).reduce((m, r) => Math.max(m, r.roundIdx), 0) + 1;
      return {
        ...state,
        phase: 'playing',
        rounds: [...(state.rounds || []), { roundIdx: nextIdx, courts: [newCourt(1)] }],
        viewingRoundIdx: nextIdx,
      };
    }

    case 'SET_VIEWING_ROUND':
      return { ...state, viewingRoundIdx: action.roundIdx };

    case 'ADD_COURT':
      return {
        ...state,
        rounds: (state.rounds || []).map(r => {
          if (r.roundIdx !== action.roundIdx) return r;
          const nextId = (r.courts || []).reduce((m, c) => Math.max(m, c.courtId), 0) + 1;
          return { ...r, courts: [...(r.courts || []), newCourt(nextId)] };
        }),
      };

    case 'DELETE_COURT': {
      // 진행/완료된 코트는 지우지 않는다 — 오터치 한 번으로 기록이 날아가면 안 된다.
      const target = findCourt(state, action.roundIdx, action.courtId);
      if (!target || target.status !== 'ready') return state;
      return {
        ...state,
        rounds: (state.rounds || []).map(r => (r.roundIdx !== action.roundIdx
          ? r
          : { ...r, courts: (r.courts || []).filter(c => c.courtId !== action.courtId) })),
      };
    }

    case 'SET_COURT_FORMAT':
      return mapCourt(state, action.roundIdx, action.courtId, (c) => {
        if (c.status !== 'ready') return c;   // 시작 후 잠금
        const n = slotsPerSide(action.format);
        return { ...c, format: action.format, sideA: c.sideA.slice(0, n), sideB: c.sideB.slice(0, n) };
      });

    case 'SET_COURT_BEST_OF':
      return mapCourt(state, action.roundIdx, action.courtId, (c) => (
        c.status !== 'ready' ? c : { ...c, bestOf: action.bestOf }
      ));

    case 'ASSIGN_PLAYER':
      return mapCourt(state, action.roundIdx, action.courtId, (c) => {
        if (c.status !== 'ready') return c;
        if (c.sideA.includes(action.name) || c.sideB.includes(action.name)) return c;
        const n = slotsPerSide(c.format);
        if (c.sideA.length < n) return { ...c, sideA: [...c.sideA, action.name] };
        if (c.sideB.length < n) return { ...c, sideB: [...c.sideB, action.name] };
        return c;
      });

    case 'REMOVE_PLAYER':
      return mapCourt(state, action.roundIdx, action.courtId, (c) => (
        c.status !== 'ready' ? c : {
          ...c,
          sideA: c.sideA.filter(n => n !== action.name),
          sideB: c.sideB.filter(n => n !== action.name),
        }
      ));

    case 'SWAP_SIDES':
      return mapCourt(state, action.roundIdx, action.courtId, (c) => (
        c.status !== 'ready' ? c : { ...c, sideA: c.sideB, sideB: c.sideA }
      ));

    case 'START_COURT':
      return mapCourt(state, action.roundIdx, action.courtId, (c) => {
        const n = slotsPerSide(c.format);
        if (c.sideA.length !== n || c.sideB.length !== n) return c;
        return { ...c, status: 'playing', sets: [emptySet()], currentSet: 0, undoStack: [] };
      });

    case 'INCREMENT_GAME':
      return mapCourt(state, action.roundIdx, action.courtId, (c) => {
        if (c.status !== 'playing') return c;
        const cur = currentSetOf(c);
        const next = incrementGame(cur, action.side, state.scoringRules);
        if (next === cur) return c;   // 이미 끝난 세트(또는 상한 도달)
        return pushUndo(withCurrentSet(c, next), { kind: 'game', side: action.side, setIdx: c.currentSet });
      });

    case 'INCREMENT_TIEBREAK_POINT':   // 레거시(타이브레이크 폐지) — UI 미사용. 노에드7에선 무효.
      return mapCourt(state, action.roundIdx, action.courtId, (c) => {
        if (c.status !== 'playing') return c;
        if (state.scoringRules?.tiebreakMode === '7point') return c;   // 노에드7=게임 기반, 타이브레이크 없음
        const cur = currentSetOf(c);
        if (!isTiebreakActive(cur)) return c;
        const next = incrementTiebreakPoint(cur, action.side, state.scoringRules);
        return pushUndo(withCurrentSet(c, next), { kind: 'tb', side: action.side, setIdx: c.currentSet });
      });

    case 'INCREMENT_STAT':
      return mapCourt(state, action.roundIdx, action.courtId, (c) => {
        if (c.status !== 'playing') return c;
        const prev = c.stats[action.player] || { aces: 0, df: 0 };
        const stats = { ...c.stats, [action.player]: { ...prev, [action.stat]: (prev[action.stat] || 0) + 1 } };
        let nextCourt = { ...c, stats };
        let scoredSide = null;
        if (state.scoringRules?.acesDfAffectScore) {
          const cur = currentSetOf(c);
          if (cur) {   // 타이브레이크 폐지 — 5:5에서도 에이스/DF가 게임에 반영(incrementGame이 완료 세트는 무시)
            const playerSide = c.sideA.includes(action.player) ? 'A' : 'B';
            const targetSide = action.stat === 'aces' ? playerSide : (playerSide === 'A' ? 'B' : 'A');
            const incd = incrementGame(cur, targetSide, state.scoringRules);
            if (incd !== cur) { nextCourt = withCurrentSet(nextCourt, incd); scoredSide = targetSide; }
          }
        }
        return pushUndo(nextCourt, { kind: 'stat', player: action.player, stat: action.stat, scoredSide, setIdx: c.currentSet });
      });

    case 'END_SET':
      return mapCourt(state, action.roundIdx, action.courtId, (c) => {
        const cur = currentSetOf(c);
        if (!cur || !isSetComplete(cur, state.scoringRules)) return c;
        const sets = [...c.sets];
        sets[c.currentSet] = { ...cur, done: true };
        const finished = !!matchWinner(sets, c.bestOf);
        const undoEntry = { kind: 'endSet', setIdx: c.currentSet, endedMatch: finished };
        if (finished) {
          return pushUndo({ ...c, sets, status: 'done' }, undoEntry);
        }
        return pushUndo({ ...c, sets: [...sets, emptySet()], currentSet: c.currentSet + 1 }, undoEntry);
      });

    case 'UNDO':
      return mapCourt(state, action.roundIdx, action.courtId, (c) => {
        const stack = c.undoStack || [];
        if (stack.length === 0) return c;
        const last = stack[stack.length - 1];
        const rest = stack.slice(0, -1);
        const sets = [...c.sets];

        if (last.kind === 'game') {
          const s = sets[last.setIdx];
          const key = last.side === 'A' ? 'a' : 'b';
          sets[last.setIdx] = { ...s, [key]: Math.max(0, (s[key] || 0) - 1) };
          return { ...c, sets, undoStack: rest };
        }
        if (last.kind === 'tb') {
          const s = sets[last.setIdx];
          const key = last.side === 'A' ? 'tbA' : 'tbB';
          const games = last.side === 'A' ? 'a' : 'b';
          const nextPoint = Math.max(0, (s[key] || 0) - 1);
          // threshold 도달로 게임이 확정됐던 경우(노에드7=7게임, 단판1점=6게임) 게임도 5로 되돌린다.
          const threshold = state.scoringRules?.tiebreakMode === '1point' ? 1 : TIEBREAK_POINTS_TO_WIN;
          const nextGames = (s[key] || 0) >= threshold ? 5 : s[games];
          sets[last.setIdx] = { ...s, [key]: nextPoint, [games]: nextGames };
          return { ...c, sets, undoStack: rest };
        }
        if (last.kind === 'stat') {
          const prev = c.stats[last.player] || { aces: 0, df: 0 };
          const stats = { ...c.stats, [last.player]: { ...prev, [last.stat]: Math.max(0, (prev[last.stat] || 0) - 1) } };
          let base2 = { ...c, stats, undoStack: rest };
          if (last.scoredSide) {   // 스코어 반영분도 되돌림
            const setsCopy = [...c.sets];
            const key = last.scoredSide === 'A' ? 'a' : 'b';
            const sIdx = last.setIdx ?? c.currentSet;
            const sSet = setsCopy[sIdx];
            if (sSet) setsCopy[sIdx] = { ...sSet, [key]: Math.max(0, (sSet[key] || 0) - 1) };
            base2 = { ...base2, sets: setsCopy };
          }
          return base2;
        }
        if (last.kind === 'endSet') {
          // ★ 세트 종료가 판을 끝냈다면 status도 함께 되돌린다.
          //   빠뜨리면 점수는 풀렸는데 카드가 done에 갇히고, done 카드엔 [설정 수정]이 없어 빠져나갈 길이 없다.
          const trimmed = last.endedMatch ? sets : sets.slice(0, last.setIdx + 1);
          trimmed[last.setIdx] = { ...trimmed[last.setIdx], done: false };
          return {
            ...c,
            sets: trimmed,
            currentSet: last.setIdx,
            status: 'playing',
            undoStack: rest,
          };
        }
        return { ...c, undoStack: rest };
      });

    case 'EDIT_COURT_SETTINGS':
      return mapCourt(state, action.roundIdx, action.courtId, (c) => ({
        ...c, status: 'ready', sets: [], currentSet: 0, stats: {}, undoStack: [],
      }));

    case 'EXTEND_TO_THREE_SETS':
      // 유일한 예외 — 점수를 유지한 채 세트만 늘린다.
      return mapCourt(state, action.roundIdx, action.courtId, (c) => (
        c.bestOf === 1 ? { ...c, bestOf: 3, status: c.status === 'done' ? 'playing' : c.status } : c
      ));

    case 'CONFIRM_ROUND': {
      const r = (state.rounds || []).find(x => x.roundIdx === action.roundIdx);
      if (!r || !isRoundComplete(r)) return state;
      return { ...state, confirmedRounds: { ...(state.confirmedRounds || {}), [action.roundIdx]: true } };
    }

    case 'UNCONFIRM_ROUND': {
      const next = { ...(state.confirmedRounds || {}) };
      delete next[action.roundIdx];
      return { ...state, confirmedRounds: next };
    }

    case 'SET_PHASE':
      // 마감 확인 화면 왕복 전용. done 전이는 FINALIZE가 담당한다.
      if (action.phase !== 'playing' && action.phase !== 'summary') return state;
      return { ...state, phase: action.phase };

    case 'FINALIZE':
      return { ...state, gameFinalized: true, phase: 'done' };

    default:
      return state;
  }
}

export function useTennisReducer() {
  return useReducer(tennisReducer, tennisInitialState);
}
