// src/services/cupSync.js
// 컵 대회 엔티티 RTDB CRUD — 스펙 §4.2. 경로 tournaments/{safeTeam}/{cupId}/{meta,teams}.
// 축구 대회 모드가 같은 최상위 경로 아래 {id}/cache·activeGame 을 쓰지만 자식 이름이 다르고,
// listCups 는 meta.sport==='풋살' 인 자식만 대회로 본다. 모든 쓰기 실패는 throw — 화면이 alert 로 보여준다.
// 배포 전제: RTDB 규칙에 tournaments 최상위 읽기/쓰기 허용(스펙 §4.2·§12).
import { ref, get, set, update, remove } from 'firebase/database';
import { firebaseDb } from '../config/firebase';
import { safeTeam } from './rtdbPath';
import { normalizeCup, cupIdOf } from '../utils/cup/cupEntity';

export function cupPath(team, cupId) {
  return `tournaments/${safeTeam(team)}/${cupId}`;
}
function teamBase(team) {
  return `tournaments/${safeTeam(team)}`;
}

const CupSync = {
  async listCups(team) {
    const snap = await get(ref(firebaseDb, teamBase(team)));
    const val = snap.val() || {};
    return Object.entries(val)
      .map(([id, raw]) => normalizeCup(id, raw))
      .filter(Boolean)
      .sort((a, b) => (b.meta.createdAt || 0) - (a.meta.createdAt || 0));
  },

  async loadCup(team, cupId) {
    if (!cupId) return null;
    const snap = await get(ref(firebaseDb, cupPath(team, cupId)));
    return normalizeCup(cupId, snap.val());
  },

  async createCup(team, { name, createdBy }) {
    const id = cupIdOf(name);
    const existing = await get(ref(firebaseDb, cupPath(team, id)));
    if (existing.exists()) throw new Error(`같은 이름의 대회가 이미 있습니다: ${id}`);
    const now = Date.now();
    const meta = { id, name: id, sport: '풋살', format: 'league1', status: 'active', createdAt: now, createdBy: createdBy || '', updatedAt: now };
    await set(ref(firebaseDb, cupPath(team, id)), { meta });
    return normalizeCup(id, { meta });
  },

  // teams 노드 통째 교체 — 삭제된 팀은 사라진다. 검증은 호출 전 validateTeams(스펙 §4.5).
  // update() 는 없는 조상 경로도 만들어버리므로, 대회가 실제로 있는지 먼저 확인한다
  // (없으면 meta.sport 없는 유령 노드가 생겨 listCups 에는 안 보이면서 createCup 은 영구히 "이미 있습니다"로 막힌다).
  async saveTeams(team, cupId, teams) {
    const cup = await CupSync.loadCup(team, cupId);
    if (!cup) throw new Error(`대회를 찾을 수 없습니다: ${cupId}`);
    const obj = {};
    for (const t of teams || []) {
      if (!t || !t.id) throw new Error(`팀 id 가 없습니다: ${t?.name || '(이름 없음)'}`);
      obj[t.id] = { id: t.id, name: t.name || '', captain: t.captain || '', players: Array.isArray(t.players) ? t.players : [], order: Number.isFinite(t.order) ? t.order : 0 };
    }
    await update(ref(firebaseDb, cupPath(team, cupId)), { teams: obj, 'meta/updatedAt': Date.now() });
  },

  async setStatus(team, cupId, status) {
    const cup = await CupSync.loadCup(team, cupId);
    if (!cup) throw new Error(`대회를 찾을 수 없습니다: ${cupId}`);
    const s = status === 'finished' ? 'finished' : 'active';
    await update(ref(firebaseDb, cupPath(team, cupId)), { 'meta/status': s, 'meta/updatedAt': Date.now() });
  },

  // 첫 컵 마감 성공 시 App 이 호출. 이미 잠겨 있으면 유지(멱등).
  // meta 존재 확인을 겸해 lockedAt 을 읽는다(대회가 없으면(=meta.sport 가 '풋살' 이 아니면) 유령 노드를 만들지 않는다).
  async markLocked(team, cupId) {
    const snap = await get(ref(firebaseDb, `${cupPath(team, cupId)}/meta`));
    const meta = snap.val();
    if (!meta || meta.sport !== '풋살') throw new Error(`대회를 찾을 수 없습니다: ${cupId}`);
    if (meta.lockedAt) return;
    await update(ref(firebaseDb, cupPath(team, cupId)), { 'meta/lockedAt': Date.now(), 'meta/updatedAt': Date.now() });
  },

  async deleteCup(team, cupId) {
    const cup = await CupSync.loadCup(team, cupId);
    if (!cup) return; // 이미 없음(중복 삭제) — no-op. 존재하지 않는(비풋살) 노드를 지우지 않는다.
    if (cup.meta?.lockedAt) throw new Error('잠긴 대회는 삭제할 수 없습니다(경기 기록이 있습니다)');
    // 진행 중인 세션이 있으면 막는다. 화면(CupDetail)도 같은 조건으로 버튼을 잠그지만 그쪽은
    // pendingGames prop 에 의존하고 그 목록은 화면 전환 때만 갱신된다 — 다른 기기에서 방금 시작한
    // 세션은 보이지 않는다. 지워지면 그 세션의 마감이 로그 3종에 tournament_id 를 쓰고도
    // markLocked 가 실패해(경고만 남는다) 시트에 주인 없는 행만 남으므로 서버 쪽에서도 확인한다.
    // (삭제는 관리자가 드물게 하는 조작이라 active 노드를 통째로 한 번 읽는 비용은 감수한다.)
    const active = await get(ref(firebaseDb, `games/${safeTeam(team)}/active`));
    const running = Object.values(active.val() || {}).some(g => g?.meta?.tournamentId === cupId);
    if (running) throw new Error('진행 중인 컵 세션이 있습니다. 마감 후 삭제하세요');
    await remove(ref(firebaseDb, cupPath(team, cupId)));
  },
};

export default CupSync;
