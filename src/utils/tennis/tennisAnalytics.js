// 분석 탭 계산기. 입력은 시트 행 그대로 — 빈 셀은 ''로 들어온다.
// aces/double_faults의 ''은 "미기록"(마이그레이션 행)이므로 0으로 강제하지 말 것.
import { isLeagueByGuests } from './leagueRule';

const isDoubles = (r) => r.format === '복식';
const memberNames = (roster) => new Set((roster || []).map(m => m.name));
const rate = (w, g) => (g > 0 ? w / g : 0);
// 순위 정렬 공통: 승률↓ → 승↓ → 이름(ko). 복식 순위표·선수 성적표가 공유.
const byRateWinsName = (a, b) =>
  b.rate - a.rate || b.wins - a.wins || String(a.name).localeCompare(String(b.name), 'ko');
// 판 식별 키 — game_id + match_id (match_id는 R{round}_C{court}라 날짜 넘어 재사용됨).
export const matchKey = (r) => `${r.game_id || ''}|${r.match_id || ''}`;

// 판(game_id|match_id)별 게스트 행 수 — 리그 성립 판정의 입력.
export function guestCountByMatch(rows) {
  const counts = new Map();
  for (const r of rows || []) {
    if (r && r.match_id && r.is_guest === true) {   // match_id 없는 행은 키 충돌 방지를 위해 무시(buildLeagueCounts와 동일)
      const k = matchKey(r);
      counts.set(k, (counts.get(k) || 0) + 1);
    }
  }
  return counts;
}

// 리그 성립 판정(행 단위) — 본인이 게스트가 아니고, 그 판의 게스트 수가 종목 허용치 이내일 때
// (단식 0명 / 복식 1명, leagueRule.js). 시트의 league 라벨은 보지 않는다(구성이 진실 소스).
// guestCounts = guestCountByMatch(rows). 순위표·개인 전적·선수 성적표·리그 카운트가 같은 판정을 쓴다.
export function isLeagueRow(r, guestCounts) {
  if (!r || r.is_guest === true) return false;
  const guests = guestCounts ? (guestCounts.get(matchKey(r)) || 0) : 0;
  return isLeagueByGuests(r.format, guests);
}

// 선수 성적표(전체지표): 기간 내 한 판이라도 뛴 모든 선수(게스트 포함, isGuest 표시).
// format('단식'|'복식') 지정 시 그 종목 판만(전체지표의 단/복식 토글과 연동). 미지정이면 두 종목 합산.
// leagueOnly면 리그 판만(게스트는 자연히 빠짐). 득실 = games_won − games_lost(빈 셀은 0).
// 정렬: 승률↓ → 승↓ → 이름.
export function buildPlayerReportCard({ rows, leagueOnly = false, format } = {}) {
  const all = rows || [];
  const guests = leagueOnly ? guestCountByMatch(all) : null;
  const acc = new Map();
  const blank = () => ({ games: 0, wins: 0, losses: 0, rate: 0 });
  for (const r of all) {
    if (!r || !r.player) continue;
    if (format !== undefined && r.format !== format) continue;
    if (leagueOnly && !isLeagueRow(r, guests)) continue;
    const cur = acc.get(r.player) || {
      name: r.player, isGuest: false, games: 0, wins: 0, losses: 0, rate: 0, gameDiff: 0,
      singles: blank(), doubles: blank(),
    };
    if (r.is_guest === true) cur.isGuest = true;
    const bucket = r.format === '복식' ? cur.doubles : cur.singles;
    cur.games++; bucket.games++;
    if (r.result === '승') { cur.wins++; bucket.wins++; }
    else if (r.result === '패') { cur.losses++; bucket.losses++; }
    cur.gameDiff += (Number(r.games_won) || 0) - (Number(r.games_lost) || 0);
    cur.rate = rate(cur.wins, cur.games);
    bucket.rate = rate(bucket.wins, bucket.games);
    acc.set(r.player, cur);
  }
  return [...acc.values()].sort(byRateWinsName);
}

// 복식 순위표: 투몽 성립 판(회원 3명 이상)의 회원 행만, 명부 전원 포함(0판도 표시)
export function buildDoublesStandings({ rows, roster }) {
  const acc = new Map((roster || []).filter(m => m?.name).map(m =>
    [m.name, { name: m.name, grade: m.grade || '', games: 0, wins: 0, losses: 0, rate: 0 }]));
  const guestCounts = guestCountByMatch(rows);
  for (const r of rows || []) {
    if (!isDoubles(r) || !isLeagueRow(r, guestCounts)) continue;
    const cur = acc.get(r.player);
    if (!cur) continue; // 로스터 밖(용병·탈퇴) 제외
    cur.games++;
    if (r.result === '승') cur.wins++; else if (r.result === '패') cur.losses++;
    cur.rate = rate(cur.wins, cur.games);
  }
  return [...acc.values()].sort(byRateWinsName);
}

// 판(game_id|match_id) 단위 분류 수. 전체 = 투몽 + 길로틴 + 번외.
// 리그 성립은 게스트 수로(단식 0 / 복식 ≤1, leagueRule.js). 형식 불명은 번외. (라벨 무관, 로우 기준)
export function buildLeagueCounts({ rows }) {
  const byMatch = new Map(); // key → { format, guests }
  for (const r of rows || []) {
    if (!r || !r.match_id) continue;
    const key = matchKey(r);
    const cur = byMatch.get(key) || { format: r.format, guests: 0 };
    if (r.is_guest === true) cur.guests++;
    if (r.format) cur.format = r.format;
    byMatch.set(key, cur);
  }
  let tumong = 0, guillotine = 0, exhibition = 0;
  for (const m of byMatch.values()) {
    if (!isLeagueByGuests(m.format, m.guests)) exhibition++;
    else if (m.format === '복식') tumong++;
    else guillotine++;
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

// 최근 N경기: player의 행을 최신순(날짜↓ → 세션 input_time↓ → 라운드↓ → 코트↓)으로 정렬해 상위 N개.
// 세션은 한 번에 확정돼 같은 input_time을 공유하므로 라운드/코트로 세션 내 순서를 가른다.
export function buildRecentMatches({ rows, player, limit = 5 }) {
  const mine = (rows || []).filter(r => r.player === player);
  mine.sort((a, b) =>
    String(b.date).localeCompare(String(a.date)) ||
    String(b.input_time || '').localeCompare(String(a.input_time || '')) ||
    (Number(b.round_idx) || 0) - (Number(a.round_idx) || 0) ||
    (Number(b.court_id) || 0) - (Number(a.court_id) || 0));
  return mine.slice(0, limit).map(r => {
    let opponents = [];
    try { const o = JSON.parse(r.opponents_json); if (Array.isArray(o)) opponents = o; } catch { /* 손상 행: 상대 미표시 */ }
    return {
      date: r.date,
      format: r.format,
      partner: r.partner || '',
      opponents,
      result: r.result,
      gamesWon: Number(r.games_won) || 0,
      gamesLost: Number(r.games_lost) || 0,
    };
  });
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
