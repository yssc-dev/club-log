// 빅마스터FC 증분 4(스펙 §16.3.3): 배치 중(status 'setup') 단계의 순수 로직. React/DOM 의존 없음.
// A 배치는 경기 최상위 필드, B 배치는 sideB — 저장 경로가 달라 두 사람이 동시에 편집해도 덮이지 않는다.
import { rosterOf, floatingOf } from './pools';

const uniq = (arr) => Array.from(new Set(arr));
const inter = (list, attendees) => { const a = new Set(attendees || []); return list.filter((n) => a.has(n)); };
// assignments 는 { 슬롯: 이름 } 객체다(RTDB 왕복에도 객체 그대로) — values 로 충분하다.
const namesOf = (assignments) => (assignments && typeof assignments === 'object' ? Object.values(assignments).filter(Boolean) : []);

export function sideMeta(m, side) {
  return (side === 'A' ? m && m.sideA : m && m.sideB) || {};
}

export function sideReady(m, side) {
  return sideMeta(m, side).ready === true;
}

export function sideStarters(m, side) {
  return namesOf(side === 'A' ? m && m.assignments : m && m.sideB && m.sideB.assignments);
}

export function bothReady(m) {
  return sideReady(m, 'A') && sideReady(m, 'B');
}

export function overlapStarters(m) {
  const b = new Set(sideStarters(m, 'B'));
  return uniq(sideStarters(m, 'A').filter((n) => b.has(n))).sort((x, y) => x.localeCompare(y, 'ko'));
}

// 자체전 배치 후보: (팀 명단 ∪ 유동 인원) ∩ 참석자 − 상대 편이 이미 쓴 이름.
export function setupPool({ teams, teamName, attendees, excludeNames }) {
  const roster = rosterOf(teams, teamName) || [];
  const ex = new Set(excludeNames || []);
  return inter(uniq([...roster, ...floatingOf(attendees, teams)]), attendees).filter((n) => !ex.has(n));
}

// 외부전 배치 후보: 그 팀 소속 참석자만(유동 인원 제외 — 유저 결정, 스펙 §16.1).
export function externalPool({ teams, teamName, attendees }) {
  const roster = rosterOf(teams, teamName);
  return roster ? inter(roster, attendees) : [];
}

export function canReady(m, side) {
  const n = sideStarters(m, side).length;
  if (n !== 11) return { ok: false, reason: `선발 11명을 채워야 합니다(현재 ${n}명)` };
  const dup = overlapStarters(m);
  if (dup.length) return { ok: false, reason: `양 팀에 같은 선수가 있습니다: ${dup.join(', ')}` };
  return { ok: true, reason: '' };
}

export function canStartSetup(m) {
  for (const side of ['A', 'B']) {
    const label = sideMeta(m, side).name || side;
    const r = canReady(m, side);
    if (!r.ok) return { ok: false, reason: `${label}: ${r.reason}` };
    if (!sideReady(m, side)) return { ok: false, reason: `${label} 준비 대기` };
  }
  return { ok: true, reason: '' };
}
