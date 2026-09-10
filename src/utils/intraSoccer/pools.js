// 빅마스터FC 증분 2(스펙 §13.4): 시트 팀 명단 + 유동 인원(팀 없는 참석자)으로 배치·교체 풀을 만든다. 전부 순수.
import { isIntra, fieldsOfA, fieldsOfB } from './sideView';
import { subPool } from './subPool';

export const DEFAULT_PAIR = [0, 1];
const uniq = (arr) => Array.from(new Set(arr));
const inter = (list, attendees) => { const a = new Set(attendees || []); return list.filter(n => a.has(n)); };

export function resolvePair(teams, selectedPair) {
  const n = (teams || []).length;
  const ok = (i) => Number.isInteger(i) && i >= 0 && i < n;
  const p = Array.isArray(selectedPair) && selectedPair.length === 2 ? selectedPair : DEFAULT_PAIR;
  return ok(p[0]) && ok(p[1]) && p[0] !== p[1] ? [p[0], p[1]] : [...DEFAULT_PAIR];
}

export function rosterOf(teams, name) {
  const t = (teams || []).find(t => t.name === name);
  return t ? t.players : null;
}

export function floatingOf(attendees, teams) {
  const inTeam = new Set((teams || []).flatMap(t => t.players || []));
  return (attendees || []).filter(n => !inTeam.has(n));
}

export function setupPoolA({ teams, a, attendees }) {
  const roster = (teams || [])[a]?.players || [];
  return inter(uniq([...roster, ...floatingOf(attendees, teams)]), attendees);
}

export function setupPoolB({ teams, b, attendees, aAssigned }) {
  const taken = new Set(aAssigned || []);
  return setupPoolA({ teams, a: b, attendees }).filter(n => !taken.has(n));
}

// 탭 side 레코더의 attendees. 자체전: 자기 팀 명단 ∪ 유동 인원(∩ 참석자) 에서 상대 편 출전 이력·퇴장자를 subPool 이 뺀다.
export function sidePool(m, side, attendees, teams) {
  if (!isIntra(m)) return subPool(m, side, attendees);
  const name = side === 'A' ? fieldsOfA(m).name : fieldsOfB(m).name;
  const roster = rosterOf(teams, name);
  const base = roster ? inter(uniq([...roster, ...floatingOf(attendees, teams)]), attendees) : (attendees || []);
  return subPool(m, side, base);
}

export function canIntra({ teams, attendees, pair }) {
  const t = teams || [];
  if (t.length < 2) return { ok: false, reason: '시트에 팀 열이 2개 이상 필요' };
  const [a, b] = resolvePair(t, pair);
  const pa = setupPoolA({ teams: t, a, attendees }).length;
  const pb = setupPoolA({ teams: t, a: b, attendees }).length;
  const total = (attendees || []).length;
  if (pa < 11 || pb < 11 || total < 22) {
    return { ok: false, reason: `${t[a].name} ${pa}명 · ${t[b].name} ${pb}명 · 참석 ${total}명 (각 11명·총 22명 필요)` };
  }
  return { ok: true, reason: '' };
}

// saveFormationState 용 병합 — soccerFormation 은 whole-replace 동기 필드라 saved(특히 intra)를 펼치지 않으면 호출마다 삭제된다.
export function mergeFormationState(saved, current, updates) {
  return { ...(saved || {}), ...(current || {}), ...(updates || {}) };
}
