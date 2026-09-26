// src/utils/cup/cupRecords.js
// 마스터스컵 3단계 — 대회 누적 순위표·개인기록·경기일별 내역의 순수 계산.
// 스펙: docs/superpowers/specs/2026-09-26-masters-cup-s3-records-design.md §3.
// 입력은 시트 캐시 컵 뷰(cupMatchLog/cupEventLog) 행 + 대회 엔티티(팀명·players).
// React/firebase 를 import 하지 않는다(테스트·vite-node 양쪽에서 쓰인다).
import { normalizeMatchId } from '../matchIdNormalizer';
import { parseMembersWithAbsent } from '../analyticsV2/parseMembers';
import { cleanPlayerName, normalizeTeamName } from './cupEntity';

// 경기일당 등록 팀원 참석이 이 수 이상이면 참석 가점 +1
export const ATTEND_BONUS_MIN = 7;
// 이긴 팀의 득점−실점이 이 수 이상이면 다득점 가점 +1
export const MARGIN_BONUS_MIN = 3;

// is_extra 는 세션 저장값(boolean) 또는 시트 경유 문자열('TRUE')로 온다 — 둘 다 임시 라운드.
export function isExtraRow(row) {
  const v = row?.is_extra;
  return v === true || String(v ?? '').trim().toUpperCase() === 'TRUE';
}

// 경기 키. 로그_이벤트 match_id 는 표준형, 로그_매치 match_id 는 세션 원값 — 양쪽 다 정규화해 잇는다.
export function matchKeyOf(row) {
  const mid = normalizeMatchId(row?.match_id ?? '', '풋살') ?? '';
  return `${row?.date ?? ''}|${row?.game_id ?? ''}|${mid}`;
}

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const teamOf = (v) => normalizeTeamName(v);
const nameOf = (v) => cleanPlayerName(v);
const byKo = (a, b) => String(a ?? '').localeCompare(String(b ?? ''), 'ko');
const sameCup = (row, cupId) => String(row?.tournament_id ?? '') === String(cupId ?? '');

// 명단 JSON → 정규화된 이름 배열. 휴식(absent) 포함 — 참석은 "왔는가"다. 빈 이름·중복 제거.
function membersOf(json) {
  const { players } = parseMembersWithAbsent(json);
  return [...new Set(players.map(nameOf).filter(Boolean))];
}

// 대회 엔티티 → Map<정규화 팀명, Set<정규화 선수명>>. RTDB 빈 배열 누락 방어.
function rosterOf(cup) {
  const out = new Map();
  for (const t of cup?.teams || []) {
    const name = teamOf(t?.name);
    if (!name) continue;
    if (!out.has(name)) out.set(name, new Set());
    for (const p of t?.players || []) { const n = nameOf(p); if (n) out.get(name).add(n); }
  }
  return out;
}

/**
 * 그 대회의 행만 남기고 임시 라운드를 경기·이벤트에서 함께 걷어낸다.
 * 로그_매치에 짝이 없는 이벤트는 남긴다(부분 실패 재전송 중인 날의 골이 사라지면 안 된다).
 * 골/자책 이벤트는 어떤 키로도 중복 제거하지 않는다.
 */
export function selectCupRows({ matchRows = [], eventRows = [], cupId }) {
  const mine = (matchRows || []).filter(r => r && sameCup(r, cupId));
  const extraKeys = new Set(mine.filter(isExtraRow).map(matchKeyOf));
  return {
    matchRows: mine.filter(r => !isExtraRow(r)),
    eventRows: (eventRows || []).filter(e => e && sameCup(e, cupId) && !extraKeys.has(matchKeyOf(e))),
  };
}

// 잠금 파생용 — 그 대회의 (임시 라운드 아닌) 치른 팀 쌍 "A|B"(정렬). isLocked(cup, playedPairs) 의 두 번째 인자.
export function collectPlayedPairs(matchRows, cupId) {
  const out = new Set();
  for (const r of matchRows || []) {
    if (!r || !sameCup(r, cupId) || isExtraRow(r)) continue;
    const home = teamOf(r.our_team_name), away = teamOf(r.opponent_team_name);
    if (!home || !away) continue;
    out.add([home, away].sort(byKo).join('|'));
  }
  return out;
}

export const _internal = { num, teamOf, nameOf, byKo, membersOf, rosterOf, sameCup };
