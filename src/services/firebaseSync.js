import { ref, set, get, remove, onValue, off, serverTimestamp, update } from 'firebase/database';
import { firebaseDb } from '../config/firebase';
import { countFinishedSoccerMatches } from '../utils/soccerScoring';
import {
  META_FIELDS,
  WHOLE_REPLACE_FIELDS,
  diffStateToWrites,
  reconstructState,
  expandStateForRtdb as expandStateForRtdbPure,
  eventsToObj,
  matchesToObj,
  soccerMatchesToObj,
} from './firebaseSyncDiff';

// gameId 타임스탬프(g_<ts>)에서 KST 기준 yyyy-MM-dd 추출
function _kstDateFromGameId(gameId) {
  if (gameId && gameId.indexOf('g_') === 0) {
    const ts = parseInt(gameId.substring(2), 10);
    if (ts > 0) {
      const d = new Date(ts + 9 * 3600 * 1000);
      return d.toISOString().substring(0, 10);
    }
  }
  const now = new Date(Date.now() + 9 * 3600 * 1000);
  return now.toISOString().substring(0, 10);
}

function _buildSummary(gameId, state) {
  const creator = state.gameCreator || state.lastEditor || '?';
  // 테니스: 이벤트/완료경기가 풋살 필드라 0이 되므로 라운드·완료 코트로 요약.
  if (state.sport === '테니스') {
    const rounds = state.rounds || [];
    const done = rounds.reduce((s, r) => s + (r.courts || []).filter(c => c.status === 'done').length, 0);
    return `${gameId} | ${creator} | ${state.phase || '?'} | ${rounds.length}라운드 | 완료 ${done}경기`;
  }
  const soccer = Array.isArray(state.soccerMatches) && state.soccerMatches.length > 0;
  const evtCount = soccer
    ? state.soccerMatches.reduce((s, m) => s + ((m.events || []).length), 0)
    : (state.allEvents || []).length;
  const matchCount = soccer
    ? countFinishedSoccerMatches(state.soccerMatches)
    : (state.completedMatches || []).length;
  return `${gameId} | ${creator} | ${state.phase || '?'} | 이벤트 ${evtCount}건 | 완료 ${matchCount}경기`;
}

// ───────────────────────── 노드별 동기화 (실시간 협업) ─────────────────────────
//
// 활성 게임은 RTDB 의 자식 노드 단위로 분산 저장.
// - gks/{teamIdx}: 노드별 update → 한 사람이 GK 바꿔도 다른 사람의 다른 GK 변경 안 덮어씀
// - events/{eventId}: id 키 사용 → push 상등 (eventId 가 unique 이므로 충돌 불가)
// - matches/{matchId}: matchId 키 사용 → 매치별 atomic
// - confirmedRounds/{idx}: 라운드별 atomic
// - meta/...: 단일값 묶음 (phase, currentRoundIdx 등)
//
// 클라이언트 측: dispatch 후 prev↔next state 를 diff 해 변경된 path 만 update 1회 호출.
// 순수 helper 들은 ./firebaseSyncDiff 에서 import (단위 테스트 가능).

// serverTimestamp 부착하여 RTDB 펼침
function _expandStateForRtdb(state) {
  const out = expandStateForRtdbPure(state);
  out.meta = { ...(out.meta || {}), updatedAt: serverTimestamp() };
  return out;
}

const FirebaseSync = {
  _safeTeam(team) {
    return (team || "기본팀").replace(/[.#$/[\]]/g, "_");
  },

  _gameRef(team, gameId) {
    return ref(firebaseDb, "games/" + this._safeTeam(team) + "/active/" + gameId);
  },

  _activeRef(team) {
    return ref(firebaseDb, "games/" + this._safeTeam(team) + "/active");
  },

  _finalizedBaseRef(team) {
    return ref(firebaseDb, "games/" + this._safeTeam(team) + "/finalized");
  },

  _finalizedMetaAllRef(team) {
    return ref(firebaseDb, "games/" + this._safeTeam(team) + "/finalized/_meta");
  },

  _finalizedStateRef(team, gameId) {
    return ref(firebaseDb, "games/" + this._safeTeam(team) + "/finalized/_states/" + gameId);
  },

  _finalizedStatesAllRef(team) {
    return ref(firebaseDb, "games/" + this._safeTeam(team) + "/finalized/_states");
  },

  // 이전 형식 호환 (마이그레이션용)
  _legacyRef(team) {
    return ref(firebaseDb, "games/" + this._safeTeam(team) + "/current");
  },

  // ──────────── 노드별 동기화 (active 게임) ────────────

  // prev↔next state diff 후 변경된 path 만 update. lastEditor/updatedAt 자동 첨부.
  // 변경 없으면 noop. 반환: 변경된 path 수 (디버그용).
  async syncDiff(team, gameId, prevState, nextState) {
    const writes = diffStateToWrites(prevState, nextState);
    if (Object.keys(writes).length === 0) return 0;
    // echo skip 용 메타 강제 첨부
    writes['meta/updatedAt'] = serverTimestamp();
    if (nextState?.lastEditor) writes['meta/lastEditor'] = nextState.lastEditor;
    try {
      await update(this._gameRef(team, gameId), writes);
      return Object.keys(writes).length;
    } catch (e) {
      console.warn("Firebase syncDiff 실패:", e.message);
      throw e;
    }
  },

  // 활성 게임 단일 구독. snap → reconstructed gameState 로 콜백.
  // callback(stateOrNull, { updatedAt, lastEditor })
  subscribe(team, gameId, callback) {
    const dbRef = this._gameRef(team, gameId);
    const handler = (snap) => {
      if (!snap.exists()) { callback(null, {}); return; }
      const raw = snap.val();
      const state = reconstructState(gameId, raw);
      const meta = raw?.meta || {};
      callback(state, { updatedAt: meta.updatedAt, lastEditor: meta.lastEditor });
    };
    onValue(dbRef, handler);
    return () => off(dbRef, "value", handler);
  },

  // 활성 게임 1회 로드 (재조립된 state).
  async loadStateReconstructed(team, gameId) {
    try {
      const snap = await get(this._gameRef(team, gameId));
      if (!snap.exists()) return null;
      return reconstructState(gameId, snap.val());
    } catch (e) {
      console.warn("Firebase loadStateReconstructed 실패:", e.message);
      return null;
    }
  },

  // 모든 활성 게임 목록 (재조립된 state 배열).
  async loadAllActiveReconstructed(team) {
    try {
      const snap = await get(this._activeRef(team));
      if (!snap.exists()) return [];
      const games = [];
      snap.forEach(child => {
        try {
          const state = reconstructState(child.key, child.val());
          games.push({ gameId: child.key, state, savedAt: child.val()?.meta?.updatedAt });
        } catch (e) { /* skip invalid */ }
      });
      return games;
    } catch (e) { console.warn("Firebase 활성 목록 로드 실패:", e.message); return []; }
  },

  // active 게임 전체 통짜 저장. finalized→active 복구 같은 부트스트랩 전용.
  // 일반 갱신은 syncDiff 사용.
  async saveState(team, gameId, state) {
    try {
      const expanded = _expandStateForRtdb(state);
      await set(this._gameRef(team, gameId), expanded);
    } catch (e) {
      console.warn("Firebase 저장 실패:", e.message);
      throw e;
    }
  },

  // 확정 경기 저장. _meta(목록용 요약) + _states(상세 JSON) 분리 — 목록 조회 시 JSON 다운로드 회피.
  async saveFinalized(team, gameId, state) {
    try {
      const summary = _buildSummary(gameId, state);
      const gameDate = _kstDateFromGameId(gameId);
      await update(this._finalizedBaseRef(team), {
        [`_meta/${gameId}`]: { summary, gameDate, updatedAt: serverTimestamp() },
        [`_states/${gameId}`]: { state: JSON.stringify(state) },
      });
    } catch (e) {
      console.warn("Firebase 확정 저장 실패:", e.message);
      throw e;
    }
  },

  // 히스토리 목록 (메타만, 가볍게). _deletedAt 있으면 휴지통 취급하여 제외.
  async loadFinalizedList(team) {
    try {
      const snap = await get(this._finalizedMetaAllRef(team));
      if (!snap.exists()) return [];
      const out = [];
      snap.forEach(child => {
        const v = child.val();
        if (v && v._deletedAt) return;
        out.push({
          gameId: child.key,
          gameDate: v.gameDate || '',
          summary: v.summary || '',
          savedAt: v.updatedAt || null,
        });
      });
      return out;
    } catch (e) { console.warn("확정 목록 로드 실패:", e.message); return []; }
  },

  // 휴지통 (소프트 삭제된 항목만)
  async loadTrashedFinalized(team) {
    try {
      const snap = await get(this._finalizedMetaAllRef(team));
      if (!snap.exists()) return [];
      const out = [];
      snap.forEach(child => {
        const v = child.val();
        if (!v || !v._deletedAt) return;
        out.push({
          gameId: child.key,
          gameDate: v.gameDate || '',
          summary: v.summary || '',
          savedAt: v.updatedAt || null,
          deletedAt: v._deletedAt || null,
        });
      });
      return out;
    } catch (e) { console.warn("휴지통 로드 실패:", e.message); return []; }
  },

  // 상세 1건 (목록에서 클릭 시)
  async loadFinalizedOne(team, gameId) {
    try {
      const snap = await get(this._finalizedStateRef(team, gameId));
      if (!snap.exists()) return null;
      return snap.val().state || null;
    } catch (e) { console.warn("확정 상세 로드 실패:", e.message); return null; }
  },

  // 전체 state 로드 (분석용: PlayerAnalytics가 전체 경기 집계에 사용)
  async loadFinalizedAll(team) {
    try {
      const [metaSnap, statesSnap] = await Promise.all([
        get(this._finalizedMetaAllRef(team)),
        get(this._finalizedStatesAllRef(team)),
      ]);
      if (!metaSnap.exists()) return [];
      const states = statesSnap.exists() ? statesSnap.val() : {};
      const out = [];
      metaSnap.forEach(child => {
        const v = child.val();
        out.push({
          gameId: child.key,
          gameDate: v.gameDate || '',
          summary: v.summary || '',
          savedAt: v.updatedAt || null,
          stateJson: states[child.key]?.state || '',
        });
      });
      return out;
    } catch (e) { console.warn("확정 전체 로드 실패:", e.message); return []; }
  },

  // 소프트 삭제: _meta._deletedAt 타임스탬프만 표시. _states 와 active 는 보존하여 복구 가능.
  async deleteFinalized(team, gameId) {
    try {
      await update(
        ref(firebaseDb, "games/" + this._safeTeam(team) + "/finalized/_meta/" + gameId),
        { _deletedAt: serverTimestamp() }
      );
    } catch (e) { console.warn("확정 소프트 삭제 실패:", e.message); throw e; }
  },

  // 복구: _deletedAt 제거 → 목록에 다시 노출.
  async restoreFinalized(team, gameId) {
    try {
      await update(
        ref(firebaseDb, "games/" + this._safeTeam(team) + "/finalized/_meta/" + gameId),
        { _deletedAt: null }
      );
    } catch (e) { console.warn("복구 실패:", e.message); throw e; }
  },

  // 영구 삭제: finalized 의 _meta + _states 만 제거. active 정리는 호출자가 필요 시 clearState 호출.
  async purgeFinalized(team, gameId) {
    try {
      await Promise.all([
        remove(ref(firebaseDb, "games/" + this._safeTeam(team) + "/finalized/_meta/" + gameId)),
        remove(ref(firebaseDb, "games/" + this._safeTeam(team) + "/finalized/_states/" + gameId)),
      ]);
    } catch (e) { console.warn("영구 삭제 실패:", e.message); throw e; }
  },

  async clearState(team, gameId) {
    try {
      await remove(this._gameRef(team, gameId));
      // 이전 형식도 정리
      await remove(this._legacyRef(team));
    } catch (e) { console.warn("Firebase 삭제 실패:", e.message); }
  },
};

export default FirebaseSync;
