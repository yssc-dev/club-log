// src/utils/cup/cupRecords.js
// 마스터스컵 3단계 — 대회 누적 순위표·개인기록·경기일별 내역의 순수 계산.
// 스펙: docs/superpowers/specs/2026-09-26-masters-cup-s3-records-design.md §3.
// 입력은 시트 캐시 컵 뷰(cupMatchLog/cupEventLog) 행 + 대회 엔티티(팀명·players).
// React/firebase 를 import 하지 않는다(테스트·vite-node 양쪽에서 쓰인다).
import { normalizeMatchId } from '../matchIdNormalizer';
import { parseMembersWithAbsent } from '../analyticsV2/parseMembers';
import { cleanPlayerName, normalizeTeamName } from './cupEntity';

// 경기일당 등록 팀원 참석이 이 수 이상이면 참석 가점 +1
// 경기일당 등록 팀원 참석 수 → 참석 가점(구간제, 누적 아님). 위 구간부터 검사: 10명↑ +3, 7~9명 +1, 그 외 0.
// 전원 참석 기준이 팀당 10명이라 10에 +3 — 2026-09-28 사용자 확정.
export const ATTEND_BONUS_TIERS = [{ min: 10, bonus: 3 }, { min: 7, bonus: 1 }];
export function attendBonusOf(present) {
  const tier = ATTEND_BONUS_TIERS.find(t => present >= t.min);
  return tier ? tier.bonus : 0;
}

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

function newTeamStat(name, registered) {
  return { name, registered, games: 0, wins: 0, draws: 0, losses: 0, gf: 0, ga: 0, gd: 0, points: 0, bonusAttend: 0, bonus: 0, total: 0 };
}
function newDayTeam(registered) {
  return { registered, present: 0, guests: [], bonusAttend: 0, points: 0 };
}

/**
 * 대회 누적 순위표 + 경기일별 내역. matchRows 는 selectCupRows 를 거친(그 대회·임시 라운드 제외) 행.
 * 승점 3/1/0 + 가점(경기일 참석 등록 팀원 7~9명 +1·10명↑ +3) → 합계 → 골득실 → 다득점(총득점) → 팀명.
 * 무실점·3점차 승리 팀 가점은 없다(2026-09-28·10-01 폐지) — 키퍼 클린시트는 calcCupPlayerRecords 개인기록에만.
 * 참석은 "등록 팀원이 그날 어느 명단에든 있는가"로 원소속 팀에 센다(용병 이동 시 옮겨간 팀에는 안 센다).
 */
export function calcCupStandings({ matchRows = [], cup }) {
  const roster = rosterOf(cup);
  const stats = new Map();
  const ensure = (name) => {
    if (!stats.has(name)) stats.set(name, newTeamStat(name, roster.has(name)));
    return stats.get(name);
  };
  for (const name of roster.keys()) ensure(name);

  // 경기일 버킷: date → { date, matches, attendees:Set(그날 온 전원), lists:Map(팀→Set(그 팀 명단으로 뛴 사람)), teams:Map }
  const dayMap = new Map();
  const dayOf = (date) => {
    if (!dayMap.has(date)) dayMap.set(date, { date, matches: [], attendees: new Set(), lists: new Map(), teams: new Map() });
    return dayMap.get(date);
  };
  const dayTeam = (day, name) => {
    if (!day.teams.has(name)) day.teams.set(name, newDayTeam(roster.has(name)));
    return day.teams.get(name);
  };
  const dayList = (day, name) => {
    if (!day.lists.has(name)) day.lists.set(name, new Set());
    return day.lists.get(name);
  };

  const ordered = [...(matchRows || [])].filter(Boolean)
    .sort((a, b) => byKo(a.date, b.date) || byKo(a.game_id, b.game_id) || num(a.match_idx) - num(b.match_idx));

  for (const r of ordered) {
    const home = teamOf(r.our_team_name), away = teamOf(r.opponent_team_name);
    if (!home || !away) continue;
    const hs = num(r.our_score), as = num(r.opponent_score);
    const h = ensure(home), a = ensure(away);
    const day = dayOf(String(r.date ?? ''));
    const dh = dayTeam(day, home), da = dayTeam(day, away);

    h.games++; a.games++;
    h.gf += hs; h.ga += as; a.gf += as; a.ga += hs;
    let hp = 0, ap = 0;
    if (hs > as) { h.wins++; a.losses++; hp = 3; }
    else if (hs < as) { a.wins++; h.losses++; ap = 3; }
    else { h.draws++; a.draws++; hp = 1; ap = 1; }
    h.points += hp; a.points += ap;
    dh.points += hp; da.points += ap;

    day.matches.push({ key: matchKeyOf(r), matchId: String(r.match_id ?? ''), home, away, homeScore: hs, awayScore: as });
    for (const p of membersOf(r.our_members_json)) { day.attendees.add(p); dayList(day, home).add(p); }
    for (const p of membersOf(r.opponent_members_json)) { day.attendees.add(p); dayList(day, away).add(p); }
  }

  // 경기일 단위 참석 가점 — 등록 팀마다, 그날 온 등록 팀원 수로.
  const days = [...dayMap.values()].sort((x, y) => byKo(x.date, y.date)).map(day => {
    for (const [name, players] of roster) {
      const dt = dayTeam(day, name);
      let present = 0;
      for (const p of players) if (day.attendees.has(p)) present++;
      dt.present = present;
      dt.guests = [...(day.lists.get(name) || [])].filter(p => !players.has(p)).sort(byKo);
      const bonus = attendBonusOf(present);
      if (bonus > 0) { dt.bonusAttend = bonus; ensure(name).bonusAttend += bonus; }
    }
    // 팀명이 객체 키가 된다. 대괄호 대입은 '__proto__' 같은 이름에서 [[Set]] 이 프로토타입을 바꿔 항목이
    // 사라지므로(적대적 리뷰 D-1) own property 로 정의하는 Object.fromEntries 를 쓴다.
    return { date: day.date, matches: day.matches, teams: Object.fromEntries(day.teams) };
  });

  const standings = [...stats.values()].map(s => {
    const gd = s.gf - s.ga;
    const bonus = s.bonusAttend;
    return { ...s, gd, bonus, total: s.points + bonus };
  }).sort((x, y) => y.total - x.total || y.gd - x.gd || y.gf - x.gf || byKo(x.name, y.name));

  return { standings, days };
}

/**
 * 대회 개인기록. 골·어시·자책골은 로그_이벤트, 클린시트는 로그_매치 GK 열(경기 단위, 당일 세션 화면과 같은 정의),
 * 참석횟수는 어느 팀 명단에든(휴식 포함) 등장한 날짜 수. 등록 팀원 전원 ∪ 로그에 등장한 이름.
 */
export function calcCupPlayerRecords({ matchRows = [], eventRows = [], cup }) {
  const roster = rosterOf(cup);
  const teamByPlayer = new Map();
  for (const [team, players] of roster) for (const p of players) if (!teamByPlayer.has(p)) teamByPlayer.set(p, team);

  const recs = new Map();
  const ensure = (name) => {
    if (!recs.has(name)) {
      recs.set(name, { name, team: teamByPlayer.get(name) || '', guest: !teamByPlayer.has(name), goals: 0, assists: 0, cleanSheets: 0, ownGoals: 0, dates: new Set() });
    }
    return recs.get(name);
  };
  for (const p of teamByPlayer.keys()) ensure(p);

  for (const r of matchRows || []) {
    if (!r) continue;
    const date = String(r.date ?? '');
    const hs = num(r.our_score), as = num(r.opponent_score);
    for (const p of membersOf(r.our_members_json)) ensure(p).dates.add(date);
    for (const p of membersOf(r.opponent_members_json)) ensure(p).dates.add(date);
    const hg = nameOf(r.our_gk), ag = nameOf(r.opponent_gk);
    if (hg && as === 0) ensure(hg).cleanSheets++;
    if (ag && hs === 0) ensure(ag).cleanSheets++;
  }
  for (const e of eventRows || []) {
    if (!e) continue;
    const type = String(e.event_type ?? '');
    const p = nameOf(e.player);
    if (type === 'goal') {
      if (p) ensure(p).goals++;
      const a = nameOf(e.related_player);
      if (a) ensure(a).assists++;
    } else if (type === 'owngoal') {
      if (p) ensure(p).ownGoals++;
    }
  }

  return [...recs.values()]
    .map(({ dates, ...rec }) => ({ ...rec, days: dates.size }))
    .sort((x, y) => y.goals - x.goals || y.assists - x.assists || y.cleanSheets - x.cleanSheets || byKo(x.name, y.name));
}
