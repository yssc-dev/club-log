// src/utils/cup/cupEntity.js
// 대회(컵) 엔티티의 순수 로직 — 스펙 §3·§4.2·§4.5. firebase 를 import 하지 않는다(테스트·vite-node 양쪽에서 쓰인다).
import { safeKey } from '../../services/rtdbPath';
import { stripNameDecorations } from '../../services/appSync';

export const MIN_TEAMS = 3;
export const MAX_TEAMS = 8;

// RESTORE_STATE 와 같은 규칙: 구버전 "팀 X"(공백 포함) → "팀X". 로그_매치 행의 팀 이름과 엔티티가 어긋나지 않게 한다.
export function normalizeTeamName(name) {
  return String(name ?? '').trim().replace(/^팀 /, '팀');
}

export function cleanPlayerName(name) {
  return stripNameDecorations(String(name ?? '').trim()).trim();
}

// 대회 식별자 = tournament_id = 화면 이름. 생성 후 불변. safeKey 에 위임해 이중 구현을 막는다.
export function cupIdOf(name) {
  const trimmed = String(name ?? '').trim();
  if (!trimmed) throw new Error('대회명을 입력하세요');
  if (trimmed.includes('|')) throw new Error('대회명에 | 는 쓸 수 없습니다'); // 아카이브 summary 구분자
  const id = safeKey(trimmed, '');
  if (!id) throw new Error('대회명을 입력하세요');
  return id;
}

function toArray(v) {
  if (Array.isArray(v)) return v;
  if (v && typeof v === 'object') return Object.values(v);
  return [];
}

// RTDB 원본 → Cup. meta 가 없거나 풋살이 아니면 null(축구 대회 모드의 cache/activeGame 노드는 여기서 걸러진다).
export function normalizeCup(cupId, raw) {
  if (!raw || typeof raw !== 'object' || !raw.meta || raw.meta.sport !== '풋살') return null;
  const m = raw.meta;
  const meta = {
    id: cupId,
    name: m.name || cupId,
    sport: '풋살',
    format: m.format || 'league1',
    status: m.status === 'finished' ? 'finished' : 'active',
    createdAt: m.createdAt ?? 0,
    createdBy: m.createdBy || '',
    updatedAt: m.updatedAt ?? 0,
    lockedAt: m.lockedAt ?? null,
  };
  const teams = Object.entries(raw.teams || {})
    .map(([key, t]) => ({
      id: (t && t.id) || key,
      name: t?.name || '',
      captain: t?.captain || '',
      players: toArray(t?.players).filter(p => typeof p === 'string' && p),
      order: Number.isFinite(t?.order) ? t.order : 0,
    }))
    .sort((a, b) => a.order - b.order);
  return { meta, teams };
}

// 팀 배열 검증 + 정규화 사본. 저장은 ok 일 때만(스펙 §4.5).
export function validateTeams(teams) {
  const errors = [];
  const list = Array.isArray(teams) ? teams : [];
  const normalized = list.map((t, i) => ({
    id: t?.id,
    name: normalizeTeamName(t?.name),
    captain: cleanPlayerName(t?.captain),
    players: toArray(t?.players).map(cleanPlayerName).filter(Boolean),
    order: Number.isFinite(t?.order) ? t.order : i,
  }));
  if (normalized.length < MIN_TEAMS || normalized.length > MAX_TEAMS) errors.push('팀은 3~8개여야 합니다');
  const seenNames = new Set();
  const owner = new Map();
  for (const t of normalized) {
    if (!t.id) errors.push(`팀 id 가 없습니다: ${t.name || '(이름 없음)'}`);
    if (!t.name) errors.push('팀명이 비어 있습니다');
    else {
      if (t.name.includes('|')) errors.push(`팀명에 | 는 쓸 수 없습니다: ${t.name}`);
      if (seenNames.has(t.name)) errors.push(`팀명 중복: ${t.name}`);
      seenNames.add(t.name);
    }
    if (t.players.length === 0) errors.push(`${t.name || '(이름 없음)'}: 팀원이 없습니다`);
    for (const p of t.players) {
      if (owner.has(p) && owner.get(p) !== t.name) errors.push(`${p}: 두 팀에 있습니다(${owner.get(p)}, ${t.name})`);
      else owner.set(p, t.name);
    }
    if (t.captain && !t.players.includes(t.captain)) errors.push(`${t.name}: 팀장 ${t.captain} 이(가) 팀원에 없습니다`);
  }
  return { ok: errors.length === 0, errors, teams: normalized };
}

// 팀 id: 기존 최대 번호+1. 삭제된 번호는 재사용하지 않는다(로그·화면의 혼동 방지).
export function nextTeamId(teams) {
  let max = 0;
  for (const t of teams || []) {
    const m = /^t(\d+)$/.exec(t?.id || '');
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `t${max + 1}`;
}

// 잠금: 첫 컵 마감이 기록한 lockedAt(2단계) 또는 로그에서 파생한 치른 대진(3단계) 중 하나라도 있으면.
export function isLocked(cup, playedPairs = new Set()) {
  return !!(cup?.meta?.lockedAt) || (playedPairs?.size ?? 0) > 0;
}
