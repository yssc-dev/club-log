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

// 경기 결과 승점. calcCupStandings 집계와 순위표 툴팁(cupStandingRules)이 같은 값을 본다.
export const CUP_MATCH_POINTS = { win: 3, draw: 1, loss: 0 };

/**
 * 순위표 점수 규칙 문구(2026-10-08, 툴팁용). 상수에서 조립하므로 구간·승점을 바꾸면 문구도 따라온다.
 * 참석 구간은 오름차순으로 "7~9명 +1 · 10명 이상 +3" 처럼 잇는다(마지막 구간만 "이상").
 */
export function cupStandingRules() {
  const tiers = [...ATTEND_BONUS_TIERS].sort((a, b) => a.min - b.min);
  const tierText = tiers.map((t, i) => {
    const next = tiers[i + 1];
    const range = next ? `${t.min}~${next.min - 1}명` : `${t.min}명 이상`;
    return `${range} +${t.bonus}`;
  }).join(' · ');
  return [
    `승점: 승 ${CUP_MATCH_POINTS.win} · 무 ${CUP_MATCH_POINTS.draw} · 패 ${CUP_MATCH_POINTS.loss}`,
    `참석 가점: 경기일당 등록 팀원 ${tierText} (용병 제외)`,
    '합계 = 승점 + 참석 가점',
    '순위: 합계 → 골득실 → 총득점 → 팀명',
  ];
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
// 팀 매칭용 정규 키: 앞의 "팀" 접두어를 무시한다. 세션 팀명("팀광땡")과 대회 엔티티 팀명("광땡")이 접두어만 다른
// 채로 운영된 실사례(2026-10-02)에서 순위표가 8행으로 쪼개졌다. 표시명은 등록 팀이면 엔티티 이름을 쓴다.
export const teamKeyOf = (v) => teamOf(v).replace(/^팀\s*/, '');
const nameOf = (v) => cleanPlayerName(v);
const byKo = (a, b) => String(a ?? '').localeCompare(String(b ?? ''), 'ko');
const sameCup = (row, cupId) => String(row?.tournament_id ?? '') === String(cupId ?? '');

// 명단 JSON → 정규화된 이름 배열. 휴식(absent) 포함 — 참석은 "왔는가"다. 빈 이름·중복 제거.
function membersOf(json) {
  const { players } = parseMembersWithAbsent(json);
  return [...new Set(players.map(nameOf).filter(Boolean))];
}

// 대회 엔티티 → Map<팀 키, { name: 표시 팀명, captain: 팀장(없으면 ''), players: Set<정규화 선수명> }>. RTDB 빈 배열 누락 방어.
function rosterOf(cup) {
  const out = new Map();
  for (const t of cup?.teams || []) {
    const name = teamOf(t?.name);
    const key = teamKeyOf(name);
    if (!key) continue;
    if (!out.has(key)) out.set(key, { name, captain: nameOf(t?.captain), players: new Set() });
    for (const p of t?.players || []) { const n = nameOf(p); if (n) out.get(key).players.add(n); }
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
    const home = teamKeyOf(r.our_team_name), away = teamKeyOf(r.opponent_team_name);
    if (!home || !away) continue;
    out.add([home, away].sort(byKo).join('|'));
  }
  return out;
}

function newTeamStat(name, registered, captain = '') {
  return { name, registered, captain, games: 0, wins: 0, draws: 0, losses: 0, gf: 0, ga: 0, gd: 0, points: 0, bonusAttend: 0, bonus: 0, total: 0 };
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
  // 키 → 표시명: 등록 팀은 엔티티 이름, 아니면 처음 본 행의 팀명.
  const display = new Map([...roster].map(([k, v]) => [k, v.name]));
  const displayOf = (key, fallback) => { if (!display.has(key)) display.set(key, fallback); return display.get(key); };
  const stats = new Map();
  const ensure = (key, fallbackName) => {
    if (!stats.has(key)) stats.set(key, newTeamStat(displayOf(key, fallbackName), roster.has(key), roster.get(key)?.captain || ''));
    return stats.get(key);
  };
  for (const [key, v] of roster) ensure(key, v.name);

  // 경기일 버킷: date → { date, matches, attendees:Set(그날 온 전원), lists:Map(팀→Set(그 팀 명단으로 뛴 사람)), teams:Map }
  const dayMap = new Map();
  const dayOf = (date) => {
    if (!dayMap.has(date)) dayMap.set(date, { date, matches: [], attendees: new Set(), lists: new Map(), teams: new Map() });
    return dayMap.get(date);
  };
  const dayTeam = (day, key) => {
    if (!day.teams.has(key)) day.teams.set(key, newDayTeam(roster.has(key)));
    return day.teams.get(key);
  };
  const dayList = (day, name) => {
    if (!day.lists.has(name)) day.lists.set(name, new Set());
    return day.lists.get(name);
  };

  const ordered = [...(matchRows || [])].filter(Boolean)
    .sort((a, b) => byKo(a.date, b.date) || byKo(a.game_id, b.game_id) || num(a.match_idx) - num(b.match_idx));

  for (const r of ordered) {
    const home = teamKeyOf(r.our_team_name), away = teamKeyOf(r.opponent_team_name);
    if (!home || !away) continue;
    const hs = num(r.our_score), as = num(r.opponent_score);
    const h = ensure(home, teamOf(r.our_team_name)), a = ensure(away, teamOf(r.opponent_team_name));
    const day = dayOf(String(r.date ?? ''));
    const dh = dayTeam(day, home), da = dayTeam(day, away);

    h.games++; a.games++;
    h.gf += hs; h.ga += as; a.gf += as; a.ga += hs;
    const { win, draw, loss } = CUP_MATCH_POINTS;
    let hp = loss, ap = loss;
    if (hs > as) { h.wins++; a.losses++; hp = win; }
    else if (hs < as) { a.wins++; h.losses++; ap = win; }
    else { h.draws++; a.draws++; hp = draw; ap = draw; }
    h.points += hp; a.points += ap;
    dh.points += hp; da.points += ap;

    day.matches.push({ key: matchKeyOf(r), matchId: String(r.match_id ?? ''), home: display.get(home), away: display.get(away), homeScore: hs, awayScore: as });
    for (const p of membersOf(r.our_members_json)) { day.attendees.add(p); dayList(day, home).add(p); }
    for (const p of membersOf(r.opponent_members_json)) { day.attendees.add(p); dayList(day, away).add(p); }
  }

  // 경기일 단위 참석 가점 — 등록 팀마다, 그날 온 등록 팀원 수로.
  const days = [...dayMap.values()].sort((x, y) => byKo(x.date, y.date)).map(day => {
    for (const [key, { name, players }] of roster) {
      const dt = dayTeam(day, key);
      let present = 0;
      for (const p of players) if (day.attendees.has(p)) present++;
      dt.present = present;
      dt.guests = [...(day.lists.get(key) || [])].filter(p => !players.has(p)).sort(byKo);
      const bonus = attendBonusOf(present);
      if (bonus > 0) { dt.bonusAttend = bonus; ensure(key, name).bonusAttend += bonus; }
    }
    // 팀명이 객체 키가 된다. 대괄호 대입은 '__proto__' 같은 이름에서 [[Set]] 이 프로토타입을 바꿔 항목이
    // 사라지므로(적대적 리뷰 D-1) own property 로 정의하는 Object.fromEntries 를 쓴다.
    return { date: day.date, matches: day.matches, teams: Object.fromEntries([...day.teams].map(([k, dt]) => [display.get(k) ?? k, dt])) };
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
  for (const [, { name, players }] of roster) for (const p of players) if (!teamByPlayer.has(p)) teamByPlayer.set(p, name);

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
