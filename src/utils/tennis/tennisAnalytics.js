// 분석 탭 계산기. 입력은 시트 행 그대로 — 빈 셀은 ''로 들어온다.
// aces/double_faults의 ''은 "미기록"(마이그레이션 행)이므로 0으로 강제하지 말 것.
import { COMPETITION_DOUBLES } from './tennisSchema';

const isDoubles = (r) => r.format === '복식';
const memberNames = (roster) => new Set((roster || []).map(m => m.name));
const rate = (w, g) => (g > 0 ? w / g : 0);
// 판 식별 키 — game_id + match_id (match_id는 R{round}_C{court}라 날짜 넘어 재사용됨).
export const matchKey = (r) => `${r.game_id || ''}|${r.match_id || ''}`;

// 개인분석 선수 드롭다운 = 정회원 로스터 ∪ 기록 보유자(가나다순).
// roster에서 빠진 게스트(재분류 포함)도 본인 기록을 조회할 수 있게 union한다.
export function playerDropdownNames(roster, rows) {
  const names = new Set((roster || []).map(m => m && m.name).filter(Boolean));
  for (const r of (rows || [])) if (r && r.player) names.add(r.player);
  return [...names].sort((a, b) => String(a).localeCompare(String(b), 'ko'));
}

// 게스트가 하나라도 낀 판(game_id|match_id) 키 집합 — 번외 판정용.
// 리그 성립은 참가자 전원 회원일 때만이므로, 게스트 판은 회원 행까지 통째로 리그에서 뺀다.
export function guestMatchKeys(rows) {
  const keys = new Set();
  for (const r of rows || []) {
    if (r && r.is_guest === true) keys.add(matchKey(r));
  }
  return keys;
}

// 복식 순위표: 투몽 행만, 번외(게스트 낀 판) 통째 제외, 명부 전원 포함(0판도 표시)
export function buildDoublesStandings({ rows, roster }) {
  const acc = new Map((roster || []).filter(m => m?.name).map(m =>
    [m.name, { name: m.name, grade: m.grade || '', games: 0, wins: 0, losses: 0, rate: 0 }]));
  const guests = guestMatchKeys(rows);
  for (const r of rows || []) {
    if (!isDoubles(r) || r.league !== COMPETITION_DOUBLES || r.is_guest === true) continue;
    if (guests.has(matchKey(r))) continue; // 게스트 낀 판 전체 제외(번외)
    const cur = acc.get(r.player);
    if (!cur) continue; // 로스터 밖(용병·탈퇴) 제외
    cur.games++;
    if (r.result === '승') cur.wins++; else if (r.result === '패') cur.losses++;
    cur.rate = rate(cur.wins, cur.games);
  }
  return [...acc.values()].sort((a, b) =>
    b.rate - a.rate || b.wins - a.wins || String(a.name).localeCompare(String(b.name), 'ko'));
}

// 판(game_id|match_id) 단위 분류 수. 전체 = 투몽 + 길로틴 + 번외.
// 게스트 낀 판=번외, 아니면 형식으로 투몽(복식)/길로틴(단식). (집계 데이터 없이 로우 기준)
export function buildLeagueCounts({ rows }) {
  const byMatch = new Map(); // key → { format, hasGuest }
  for (const r of rows || []) {
    if (!r || !r.match_id) continue;
    const key = matchKey(r);
    const cur = byMatch.get(key) || { format: r.format, hasGuest: false };
    if (r.is_guest === true) cur.hasGuest = true;
    if (r.format) cur.format = r.format;
    byMatch.set(key, cur);
  }
  let tumong = 0, guillotine = 0, exhibition = 0;
  for (const m of byMatch.values()) {
    if (m.hasGuest) exhibition++;
    else if (m.format === '복식') tumong++;
    else if (m.format === '단식') guillotine++;
    else exhibition++; // 형식 불명(전원 회원이지만 비표준)도 번외로
  }
  return { tumong, guillotine, exhibition, total: byMatch.size };
}

// 페어 케미: 복식 전 행(미반영 포함), game_id|match_id|side 그룹핑으로 판 중복 제거
// hasGuest는 side의 두 행 모두 확인해야 파트너가 게스트인 경우를 잡는다
export function buildPairChemistry({ rows, minGames = 3 }) {
  // 같은 판·같은 side의 행들을 묶는다
  const groups = new Map();
  for (const r of rows || []) {
    if (!isDoubles(r) || !r.partner) continue;
    const key = `${r.game_id}|${r.match_id}|${r.side}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }

  const acc = new Map();
  for (const groupRows of groups.values()) {
    const rep = groupRows[0]; // 대표 행 (승패·파트너 정보)
    const players = [rep.player, rep.partner].sort((a, b) => String(a).localeCompare(String(b), 'ko'));
    const pairKey = players.join('|');
    // 그룹 내 모든 행을 확인해야 파트너가 게스트인 경우도 잡힌다
    const hasGuest = groupRows.some(r => r.is_guest === true);

    const cur = acc.get(pairKey) || { players, games: 0, wins: 0, losses: 0, rate: 0, hasGuest: false };
    cur.games++;
    if (rep.result === '승') cur.wins++; else if (rep.result === '패') cur.losses++;
    cur.hasGuest = cur.hasGuest || hasGuest;
    cur.rate = rate(cur.wins, cur.games);
    acc.set(pairKey, cur);
  }

  return [...acc.values()]
    .filter(p => p.games >= minGames)
    .sort((a, b) => b.rate - a.rate || b.games - a.games);
}

// 파트너별 성적: player의 복식 행에서 partner별 집계, 판수↓
export function buildPartnerBreakdown({ rows, player }) {
  // 파트너의 게스트 여부를 같은 경기의 파트너 행에서 확인
  const guestMap = new Map();
  for (const r of rows || []) {
    if (r.match_id && r.player) {
      guestMap.set(`${r.match_id}|${r.player}`, r.is_guest === true);
    }
  }

  const acc = new Map();
  for (const r of rows || []) {
    if (!isDoubles(r) || r.player !== player || !r.partner) continue;
    const partnerIsGuest = guestMap.get(`${r.match_id}|${r.partner}`) ?? false;
    const cur = acc.get(r.partner) || {
      partner: r.partner, games: 0, wins: 0, losses: 0, rate: 0, isGuestPartner: false,
    };
    cur.games++;
    if (r.result === '승') cur.wins++; else if (r.result === '패') cur.losses++;
    cur.rate = rate(cur.wins, cur.games);
    cur.isGuestPartner = cur.isGuestPartner || partnerIsGuest;
    acc.set(r.partner, cur);
  }
  return [...acc.values()].sort((a, b) => b.games - a.games || b.rate - a.rate);
}

// 상대 전적: player 행의 opponents_json(JSON 문자열) 파싱, 상대 개인별 집계, 판수↓
// format 미지정 시 단·복식 전체
export function buildHeadToHead({ rows, player, format }) {
  const acc = new Map();
  for (const r of rows || []) {
    if (r.player !== player) continue;
    if (format !== undefined && r.format !== format) continue;
    let opponents;
    try {
      opponents = JSON.parse(r.opponents_json);
    } catch {
      continue; // 손상 행 무시
    }
    if (!Array.isArray(opponents)) continue;
    for (const opp of opponents) {
      const cur = acc.get(opp) || { opponent: opp, games: 0, wins: 0, losses: 0, rate: 0 };
      cur.games++;
      if (r.result === '승') cur.wins++; else if (r.result === '패') cur.losses++;
      cur.rate = rate(cur.wins, cur.games);
      acc.set(opp, cur);
    }
  }
  return [...acc.values()].sort((a, b) => b.games - a.games || b.rate - a.rate);
}

// 월별 폼: month = date 앞 7자리('YYYY-MM'), 월 오름차순
// format 미지정 시 단·복식 전체
export function buildMonthlyForm({ rows, player, format }) {
  const acc = new Map();
  for (const r of rows || []) {
    if (r.player !== player) continue;
    if (format !== undefined && r.format !== format) continue;
    const month = String(r.date).slice(0, 7);
    const cur = acc.get(month) || { month, games: 0, wins: 0, rate: 0 };
    cur.games++;
    if (r.result === '승') cur.wins++;
    cur.rate = rate(cur.wins, cur.games);
    acc.set(month, cur);
  }
  return [...acc.values()].sort((a, b) => String(a.month).localeCompare(String(b.month)));
}

// TB 랭킹: 회원만, tbPlayed >= 1만, rate↓
// format 미지정 시 단·복식 전체
export function buildTbRanking({ rows, roster, format }) {
  const members = memberNames(roster);
  const acc = new Map();
  for (const r of rows || []) {
    if (!members.has(r.player)) continue;
    if (format !== undefined && r.format !== format) continue;
    const cur = acc.get(r.player) || { name: r.player, tbPlayed: 0, tbWon: 0, rate: 0 };
    cur.tbPlayed += Number(r.tb_played) || 0;
    cur.tbWon += Number(r.tb_won) || 0;
    cur.rate = rate(cur.tbWon, cur.tbPlayed);
    acc.set(r.player, cur);
  }
  return [...acc.values()]
    .filter(x => x.tbPlayed >= 1)
    .sort((a, b) => b.rate - a.rate || String(a.name).localeCompare(String(b.name), 'ko'));
}

// 베이글 랭킹: 회원만, given↓
// format 미지정 시 단·복식 전체
export function buildBagelRanking({ rows, roster, format }) {
  const members = memberNames(roster);
  const acc = new Map();
  for (const r of rows || []) {
    if (!members.has(r.player)) continue;
    if (format !== undefined && r.format !== format) continue;
    const cur = acc.get(r.player) || { name: r.player, given: 0, taken: 0 };
    cur.given += Number(r.bagels_given) || 0;
    cur.taken += Number(r.bagels_taken) || 0;
    acc.set(r.player, cur);
  }
  return [...acc.values()]
    .sort((a, b) => b.given - a.given || String(a.name).localeCompare(String(b.name), 'ko'));
}

// 에이스/더블폴트 랭킹: 미기록 행(aces === '' | null | undefined) 제외, 회원만, recordedGames>0만, aces↓
// 마이그레이션 행은 aces=''이므로 Number() 강제 변환으로 0으로 오염시키지 않는다
// format 미지정 시 단·복식 전체
export function buildAceDfRanking({ rows, roster, format }) {
  const members = memberNames(roster);
  const acc = new Map();
  for (const r of rows || []) {
    if (!members.has(r.player)) continue;
    if (format !== undefined && r.format !== format) continue;
    // 미기록 행 제외 — '' / null / undefined 모두 포함
    if (r.aces === '' || r.aces === null || r.aces === undefined) continue;
    const cur = acc.get(r.player) || { name: r.player, aces: 0, doubleFaults: 0, recordedGames: 0 };
    cur.aces += Number(r.aces) || 0;
    cur.doubleFaults += Number(r.double_faults) || 0;
    cur.recordedGames++;
    acc.set(r.player, cur);
  }
  return [...acc.values()]
    .filter(x => x.recordedGames > 0)
    .sort((a, b) => b.aces - a.aces || String(a.name).localeCompare(String(b.name), 'ko'));
}

// 연도별 전적: legacy는 season/format/player 매칭, 로그는 연도별 집계, 통산=합산
// season은 숫자일 수 있으므로 String() 변환
export function buildYearlyRecords({ legacyRows, rows, player, format }) {
  const seasonMap = new Map(); // '연도' → { wins, losses }

  // 레거시 행 처리
  for (const r of legacyRows || []) {
    if (String(r.player) !== String(player)) continue;
    if (format !== undefined && r.format !== format) continue;
    const season = String(r.season);
    const cur = seasonMap.get(season) || { wins: 0, losses: 0 };
    cur.wins += Number(r.wins) || 0;
    cur.losses += Number(r.losses) || 0;
    seasonMap.set(season, cur);
  }

  // 로그 행 처리
  for (const r of rows || []) {
    if (r.player !== player) continue;
    if (format !== undefined && r.format !== format) continue;
    const season = String(r.season || String(r.date).slice(0, 4));
    const cur = seasonMap.get(season) || { wins: 0, losses: 0 };
    if (r.result === '승') cur.wins++; else if (r.result === '패') cur.losses++;
    seasonMap.set(season, cur);
  }

  const entries = [...seasonMap.entries()]
    .sort((a, b) => String(a[0]).localeCompare(String(b[0])))
    .map(([season, { wins, losses }]) => ({
      season, wins, losses, rate: rate(wins, wins + losses),
    }));

  // 기록이 없으면 통산 행을 만들지 않는다
  if (!entries.length) return [];

  // 통산 합산
  const totalWins = entries.reduce((s, x) => s + x.wins, 0);
  const totalLosses = entries.reduce((s, x) => s + x.losses, 0);
  entries.push({
    season: '통산', wins: totalWins, losses: totalLosses, rate: rate(totalWins, totalWins + totalLosses),
  });

  return entries;
}
