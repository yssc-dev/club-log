// src/utils/cup/cupInsights.js
// 마스터스컵 컵전용 지표 계산 — 상대전적·GK통계·필드수비·어워드.
// 입력 matchRows 는 selectCupRows 를 거친(그 대회·임시 라운드 제외) 행.
// React/firebase 를 import 하지 않는다(테스트·vite-node 양쪽에서 쓰인다).
import { parseMembersWithAbsent } from '../analyticsV2/parseMembers';
import { dynamicMin } from '../analyticsV2/dynamicMin';
import { teamKeyOf } from './cupRecords';
import { cleanPlayerName, normalizeTeamName } from './cupEntity';

const num = v => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const nameOf = v => cleanPlayerName(v);
const byKo = (a, b) => String(a ?? '').localeCompare(String(b ?? ''), 'ko');

// 엔티티 팀명 키맵 + 표시명 파생 함수.
// - 행 팀명의 teamKeyOf 가 엔티티 키와 일치하면 → 엔티티 이름 표시
// - 불일치(행 전용 팀)면 → normalizeTeamName(행 팀명) 표시
function buildTeamDisplay(matchRows, cup) {
  const sortedTeams = [...(cup?.teams || [])].sort((a, b) => num(a.order) - num(b.order));
  const entityByKey = new Map(); // teamKey → 표시명
  const entityNameList = [];     // 엔티티 표시명 (entity order)

  for (const t of sortedTeams) {
    const name = normalizeTeamName(t?.name ?? '');
    const key = teamKeyOf(name);
    if (!key || entityByKey.has(key)) continue;
    entityByKey.set(key, name);
    entityNameList.push(name);
  }

  const displayOf = raw => {
    const key = teamKeyOf(raw);
    if (!key) return '';
    return entityByKey.has(key) ? entityByKey.get(key) : normalizeTeamName(raw);
  };

  // 행 전용 팀 수집 (엔티티에 없는 것, 첫 등장 순서 → 최종에서 ko 정렬)
  const rowOnlyNames = new Map(); // 표시명 → true
  for (const r of matchRows || []) {
    if (!r) continue;
    for (const raw of [r.our_team_name, r.opponent_team_name]) {
      const key = teamKeyOf(raw);
      if (!key || entityByKey.has(key)) continue;
      const dn = normalizeTeamName(raw);
      if (!rowOnlyNames.has(dn)) rowOnlyNames.set(dn, true);
    }
  }

  const teams = [...entityNameList, ...[...rowOnlyNames.keys()].sort(byKo)];
  return { teams, displayOf };
}

/**
 * 팀별 상대전적 표.
 * @returns {{ teams: string[], cells: { [rowTeam]: { [colTeam]: { games, wins, draws, losses, gf, ga } } } }}
 * cells 는 Object.fromEntries 로 구성 — '__proto__' 같은 팀명이 Object.prototype 을 오염하지 않는다.
 * 짝 없는 팀 쌍은 키 부재(UI 가 '-' 표시).
 */
export function calcCupHeadToHead({ matchRows = [], cup }) {
  const { teams, displayOf } = buildTeamDisplay(matchRows, cup);

  // 누적 도중 Map 을 사용해 임의 문자열 키의 [[Set]] 트랩 회피
  const cellMaps = new Map(); // rowName → Map(colName → cell)

  const ensureCell = (row, col) => {
    if (!cellMaps.has(row)) cellMaps.set(row, new Map());
    const m = cellMaps.get(row);
    if (!m.has(col)) m.set(col, { games: 0, wins: 0, draws: 0, losses: 0, gf: 0, ga: 0 });
    return m.get(col);
  };

  for (const r of matchRows || []) {
    if (!r) continue;
    const hKey = teamKeyOf(r.our_team_name);
    const aKey = teamKeyOf(r.opponent_team_name);
    if (!hKey || !aKey) continue;

    const hName = displayOf(r.our_team_name);
    const aName = displayOf(r.opponent_team_name);
    if (!hName || !aName) continue;

    const hs = num(r.our_score), as = num(r.opponent_score);

    const hc = ensureCell(hName, aName);
    hc.games++; hc.gf += hs; hc.ga += as;
    if (hs > as) hc.wins++; else if (hs < as) hc.losses++; else hc.draws++;

    const ac = ensureCell(aName, hName);
    ac.games++; ac.gf += as; ac.ga += hs;
    if (as > hs) ac.wins++; else if (as < hs) ac.losses++; else ac.draws++;
  }

  // Map → 일반 객체. Object.fromEntries 는 [[CreateDataPropertyOrThrow]] 를 써서
  // '__proto__' 키도 own property 로 정의된다(bracket-assign 의 [[Set]] 와 다름).
  const cells = Object.fromEntries(
    [...cellMaps.entries()].map(([rowName, colMap]) => [
      rowName,
      Object.fromEntries(colMap.entries()),
    ])
  );

  return { teams, cells };
}

/**
 * GK별 실점 통계.
 * @returns {Array<{ name, games, conceded, cleanSheets, concededRate }>}
 * 정렬: games 내림 → concededRate 오름 → name ko.
 */
export function calcCupKeepers({ matchRows = [] }) {
  const map = new Map(); // name → 누적

  const ensure = name => {
    if (!map.has(name)) map.set(name, { name, games: 0, conceded: 0, cleanSheets: 0 });
    return map.get(name);
  };

  for (const r of matchRows || []) {
    if (!r) continue;
    const hg = nameOf(r.our_gk);
    const ag = nameOf(r.opponent_gk);
    const hs = num(r.our_score), as = num(r.opponent_score);

    if (hg) { const k = ensure(hg); k.games++; k.conceded += as; if (as === 0) k.cleanSheets++; }
    if (ag) { const k = ensure(ag); k.games++; k.conceded += hs; if (hs === 0) k.cleanSheets++; }
  }

  return [...map.values()]
    .map(k => ({ ...k, concededRate: Number((k.conceded / k.games).toFixed(2)) }))
    .sort((a, b) => b.games - a.games || a.concededRate - b.concededRate || byKo(a.name, b.name));
}


/**
 * 어워드 카드 배열 (고정 순서, 수상자 없는 카드는 생략).
 *
 * @param {{ players, keepers, onoff, days, topN }} params
 *   players = calcCupPlayerRecords 결과 rows.
 *   keepers = calcCupKeepers 결과.
 *   onoff   = calcCupOnOff 결과 { minOn, rated, unrated }.
 *   days    = calcCupStandings().days.
 *   topN    = 상위 몇 명 (기본 3). topN 번째와 같은 값(동률)은 최대 5행까지 포함.
 * @returns {Array}
 *   rows 카드: { key, title, note?, rows: [{ rank, name, value, display, ratio, sub? }] }
 *     sub = 기준값 한 줄(관여 카드만): "뛸 때 2.50 · 없을 때 0.67" — 차이값이 어디서 나왔는지 보여준다(2026-10-02).
 *   개근 카드: { key, title, names, value }  (rows 없음)
 *   수비력(무실점률) 카드는 2026-10-02 제거 — 분석 탭 필드 지표에 수비관여와 통합됐다.
 */
export function calcCupAwards({
  players = [],
  keepers = [],
  onoff = { minOn: 3, rated: [], unrated: [] },
  days = [],
  topN = 3,
} = {}) {
  const minOn = onoff.minOn ?? 3;
  const rated = onoff.rated || [];
  const cards = [];

  // ── 공통 헬퍼 ────────────────────────────────────────────────────────
  // 정렬된 배열에서 상위 topN + 동률(동일 primary 값) 행, 최대 5개.
  // ratioFn(item, pool) → 0~1. subFn(item) → 기준값 줄 문자열(없으면 sub 키 생략).
  function makeRows(items, keyFn, displayFn, ratioFn, subFn) {
    if (!items.length) return [];
    const sliceN = Math.min(topN, items.length);
    const borderVal = keyFn(items[sliceN - 1]);
    const pool = [];
    for (const item of items) {
      if (pool.length >= 5) break;
      const v = keyFn(item);
      if (pool.length < topN || v === borderVal) pool.push(item);
      else break;
    }
    return pool.map(item => {
      const v = keyFn(item);
      const rank = pool.findIndex(x => keyFn(x) === v) + 1; // 경쟁 순위(1,1,3)
      const row = { rank, name: item.name, value: v, display: displayFn(item), ratio: ratioFn(item, pool) };
      if (subFn) row.sub = subFn(item);
      return row;
    });
  }

  // 관여 카드 기준값 줄: "뛸 때 X · 없을 때 Y" (경기당 득점 또는 실점, toFixed 2)
  const onOffSub = (onKey, offKey) => item =>
    `뛸 때 ${Number(item[onKey]).toFixed(2)} · 없을 때 ${Number(item[offKey]).toFixed(2)}`;

  // 높을수록 좋은 지표 ratio: value / 1위 value (1위가 1)
  const stdRatio = fn => (item, pool) => {
    const top = fn(pool[0]);
    return top === 0 ? 1 : fn(item) / top;
  };

  // ── 1. 득점왕 ────────────────────────────────────────────────────────
  {
    const sorted = [...players]
      .filter(p => p.goals > 0)
      .sort((a, b) => b.goals - a.goals || byKo(a.name, b.name));
    const rows = makeRows(sorted, p => p.goals, p => `${p.goals}골`, stdRatio(p => p.goals));
    if (rows.length) cards.push({ key: 'topScorer', title: '득점왕', rows });
  }

  // ── 2. 도움왕 ────────────────────────────────────────────────────────
  {
    const sorted = [...players]
      .filter(p => p.assists > 0)
      .sort((a, b) => b.assists - a.assists || byKo(a.name, b.name));
    const rows = makeRows(sorted, p => p.assists, p => `${p.assists}어시`, stdRatio(p => p.assists));
    if (rows.length) cards.push({ key: 'topAssist', title: '도움왕', rows });
  }

  // ── 3. 클린시트왕 ────────────────────────────────────────────────────
  {
    const sorted = [...keepers]
      .filter(k => k.cleanSheets > 0)
      .sort((a, b) => b.cleanSheets - a.cleanSheets || b.games - a.games || byKo(a.name, b.name));
    const rows = makeRows(sorted, k => k.cleanSheets, k => `${k.cleanSheets}경기`, stdRatio(k => k.cleanSheets));
    if (rows.length) cards.push({ key: 'cleanSheet', title: '클린시트왕', rows });
  }

  // ── 4. 수문장 — games >= dynamicMin(최다경기) 중 최저 실점률 ─────────
  if (keepers.length > 0) {
    const maxGames = Math.max(...keepers.map(k => k.games));
    const minK = dynamicMin(maxGames);
    const qual = [...keepers]
      .filter(k => k.games >= minK)
      .sort((a, b) => a.concededRate - b.concededRate || b.games - a.games || byKo(a.name, b.name));
    if (qual.length > 0) {
      const keeperRatio = (item, pool) => {
        const maxRate = Math.max(...pool.map(k => k.concededRate));
        const minRate = Math.min(...pool.map(k => k.concededRate));
        if (maxRate === minRate) return 1; // 전원 동일(0 포함) → 모두 1
        return Math.max(0.08, (maxRate - item.concededRate) / (maxRate - minRate));
      };
      const rows = makeRows(qual, k => k.concededRate, k => `실점률 ${k.concededRate.toFixed(2)}`, keeperRatio);
      if (rows.length) cards.push({ key: 'keeper', title: '수문장', note: `최소 ${minK}경기`, rows });
    }
  }

  // (수비력 카드 자리 — 2026-10-02 제거. 무실점률은 분석 탭 필드 지표 열로만 남는다.)

  // ── 5. 득점관여 — onoff.rated 중 goalImpact > 0 ──────────────────────
  // goalImpact 가 숫자면 offGfPg 도 숫자(offGames>0)라 sub 의 toFixed 가 안전하다.
  {
    const sorted = [...rated]
      .filter(p => p.goalImpact !== null && p.goalImpact > 0)
      .sort((a, b) => b.goalImpact - a.goalImpact || b.onGames - a.onGames || byKo(a.name, b.name));
    const rows = makeRows(sorted, p => p.goalImpact, p => `+${p.goalImpact.toFixed(2)}`, stdRatio(p => p.goalImpact), onOffSub('onGfPg', 'offGfPg'));
    if (rows.length) cards.push({ key: 'goalImpact', title: '득점관여', note: `최소 ${minOn}경기(필드, GK 경기 제외) · 경기당 득점`, rows });
  }

  // ── 6. 수비관여 — onoff.rated 중 defImpact > 0 ───────────────────────
  {
    const sorted = [...rated]
      .filter(p => p.defImpact !== null && p.defImpact > 0)
      .sort((a, b) => b.defImpact - a.defImpact || b.onGames - a.onGames || byKo(a.name, b.name));
    const rows = makeRows(sorted, p => p.defImpact, p => `+${p.defImpact.toFixed(2)}`, stdRatio(p => p.defImpact), onOffSub('onGaPg', 'offGaPg'));
    if (rows.length) cards.push({ key: 'defImpact', title: '수비관여', note: `최소 ${minOn}경기(필드, GK 경기 제외) · 경기당 실점`, rows });
  }

  // ── 7. 개근 — days.length >= 2 일 때만 ──────────────────────────────
  if (days.length >= 2) {
    const totalDays = days.length;
    const names = players.filter(p => p.days === totalDays).map(p => p.name).sort(byKo);
    if (names.length > 0) {
      if (names.length > 4) {
        cards.push({ key: 'attendance', title: '개근', names: [], value: `${names.length}명 · ${totalDays}/${totalDays}일` });
      } else {
        cards.push({ key: 'attendance', title: '개근', names, value: `${totalDays}/${totalDays}일` });
      }
    }
  }

  return cards;
}

/**
 * 득점·수비 관여 (On/Off) 통계.
 *
 * "내가 필드로 명단에 있을 때 우리 팀의 경기당 득점·실점" vs
 * "내가 명단에 없을 때 우리 팀의 경기당 득점·실점" 의 차이.
 *
 * GK 미기록 사이드(gk 빈 값): 해당 사이드를 건너뛰지 않고
 * 전원 필드로 취급해 집계한다 — 득점·실점 자체는 유효하기 때문.
 *
 * @param {{ matchRows?: Array, cup?: object, minOn?: number }} params
 *   minOn: 필드 출전 최소 경기수 기준 (기본 3). 이 값 이상이면 rated.
 * @returns {{ minOn: number, rated: Array, unrated: Array }}
 * 각 항목: { name, team, onGames, offGames, gkGames, onGfPg, onGaPg, offGfPg, offGaPg, goalImpact, defImpact, onCleanSheets, cleanRate }
 *   gkGames: 소속(primary)팀 경기 중 GK로 서서 on/off 에서 제외된 경기 수(어느 팀 GK든).
 *            onGames + offGames + gkGames = 소속팀 경기 수 — 표에서 "GK(제외)" 열로 합이 맞는지 보여준다(2026-10-02).
 *   onCleanSheets: on 경기 중 팀 실점 0 인 경기 수.
 *   cleanRate: onCleanSheets / onGames, Number(x.toFixed(2)).
 * 정렬: (goalImpact ?? -Inf) + (defImpact ?? -Inf) 내림 → onGames 내림 → name ko (null 은 맨 뒤).
 */
export function calcCupOnOff({ matchRows = [], cup, minOn = 3 } = {}) {
  const { displayOf } = buildTeamDisplay(matchRows, cup);

  // 엔티티 팀 키 집합 — primary 팀 동률 시 엔티티 우선
  const entityKeySet = new Set();
  for (const t of (cup?.teams || [])) {
    const key = teamKeyOf(normalizeTeamName(t?.name ?? ''));
    if (key) entityKeySet.add(key);
  }

  // ── 1단계: 선수별·팀별 필드 출전 횟수 (primary 팀 결정용) ──────────
  // GK 로 뛴 경기는 필드 횟수에서 제외.
  const fieldCountMap = new Map(); // playerName → Map<teamKey, count>

  const accFieldCount = (membersJson, gkRaw, teamName) => {
    const teamKey = teamKeyOf(teamName);
    if (!teamKey) return;
    const gk = nameOf(gkRaw);
    const { actual } = parseMembersWithAbsent(membersJson);
    for (const raw of actual) {
      const name = nameOf(raw);
      if (!name) continue;
      if (gk && name === gk) continue; // GK 출전은 필드 횟수에서 제외
      if (!fieldCountMap.has(name)) fieldCountMap.set(name, new Map());
      const m = fieldCountMap.get(name);
      m.set(teamKey, (m.get(teamKey) || 0) + 1);
    }
  };

  for (const r of matchRows || []) {
    if (!r) continue;
    accFieldCount(r.our_members_json, r.our_gk, r.our_team_name);
    accFieldCount(r.opponent_members_json, r.opponent_gk, r.opponent_team_name);
  }

  if (fieldCountMap.size === 0) return { minOn: 0, rated: [], unrated: [] };

  // ── 2단계: primary 팀 결정 ────────────────────────────────────────────
  // 동률 → 엔티티 팀 우선 → 표시명 ko 오름 순 첫 번째
  const primaryKeyOf = new Map(); // playerName → teamKey

  for (const [name, teamCounts] of fieldCountMap) {
    const maxCount = Math.max(...teamCounts.values());
    let candidates = [...teamCounts.entries()]
      .filter(([, c]) => c === maxCount)
      .map(([k]) => k);

    let chosen;
    if (candidates.length === 1) {
      chosen = candidates[0];
    } else {
      const entityCands = candidates.filter(k => entityKeySet.has(k));
      const pool = entityCands.length > 0 ? entityCands : candidates;
      // displayOf 는 teamKey 를 raw 로 받아도 teamKeyOf 가 멱등이라 정상 동작
      pool.sort((a, b) => byKo(displayOf(a), displayOf(b)));
      chosen = pool[0];
    }
    primaryKeyOf.set(name, chosen);
  }

  // ── 3단계: teamKey → 해당 팀을 primary 로 하는 선수 집합 ─────────────
  const teamToPlayers = new Map(); // teamKey → Set<name>
  for (const [name, tKey] of primaryKeyOf) {
    if (!teamToPlayers.has(tKey)) teamToPlayers.set(tKey, new Set());
    teamToPlayers.get(tKey).add(name);
  }

  // ── 4단계: 경기 사이드별 on/off/GK 분류 ─────────────────────────────

  // 선수별 GK를 선 경기(matchRow 레퍼런스) Set — 양쪽 사이드 모두 수집.
  // 이 Set에 해당 경기 행이 있으면 어느 사이드 처리 시에도 on/off 집계에서 제외한다.
  const gkGamesOf = new Map(); // playerName → Set<matchRow>

  for (const r of matchRows || []) {
    if (!r) continue;
    for (const gkRaw of [r.our_gk, r.opponent_gk]) {
      const gk = nameOf(gkRaw);
      if (!gk) continue;
      if (!gkGamesOf.has(gk)) gkGamesOf.set(gk, new Set());
      gkGamesOf.get(gk).add(r);
    }
  }

  const statsMap = new Map(); // playerName → { onGames,offGames,gkGames,onGf,onGa,offGf,offGa,onCleanSheets }

  const ensureStat = name => {
    if (!statsMap.has(name)) {
      statsMap.set(name, { onGames: 0, offGames: 0, gkGames: 0, onGf: 0, onGa: 0, offGf: 0, offGa: 0, onCleanSheets: 0 });
    }
    return statsMap.get(name);
  };

  // r: 행 레퍼런스 — gkGamesOf 조회에 사용
  const processSide = (r, teamName, membersJson, gf, ga) => {
    const teamKey = teamKeyOf(teamName);
    if (!teamKey) return;
    const players = teamToPlayers.get(teamKey);
    if (!players || players.size === 0) return;

    const { actual } = parseMembersWithAbsent(membersJson);
    // GK 빈 값이면 전원 필드 취급 (set 에 포함)
    const actualSet = new Set(actual.map(nameOf).filter(Boolean));

    for (const name of players) {
      const s = ensureStat(name);
      // 양쪽 사이드 GK 포함 — 이 경기에서 어느 팀이든 GK로 뛴 경기는 on/off 제외, gkGames 로만 센다
      if (gkGamesOf.get(name)?.has(r)) { s.gkGames++; continue; }
      if (actualSet.has(name)) {
        s.onGames++; s.onGf += gf; s.onGa += ga;
        if (ga === 0) s.onCleanSheets++;
      } else {
        s.offGames++; s.offGf += gf; s.offGa += ga;
      }
    }
  };

  for (const r of matchRows || []) {
    if (!r) continue;
    processSide(r, r.our_team_name, r.our_members_json, num(r.our_score), num(r.opponent_score));
    processSide(r, r.opponent_team_name, r.opponent_members_json, num(r.opponent_score), num(r.our_score));
  }

  // ── 5단계: 지표 계산, onGames=0 제외 ─────────────────────────────────
  const entries = [];

  for (const [name, tKey] of primaryKeyOf) {
    const s = statsMap.get(name);
    if (!s || s.onGames === 0) continue;

    const onGfPg  = Number((s.onGf  / s.onGames).toFixed(2));
    const onGaPg  = Number((s.onGa  / s.onGames).toFixed(2));
    const offGfPg = s.offGames > 0 ? Number((s.offGf / s.offGames).toFixed(2)) : null;
    const offGaPg = s.offGames > 0 ? Number((s.offGa / s.offGames).toFixed(2)) : null;
    const goalImpact = offGfPg !== null ? Number((onGfPg - offGfPg).toFixed(2)) : null;
    const defImpact  = offGaPg !== null ? Number((offGaPg - onGaPg).toFixed(2)) : null;
    const onCleanSheets = s.onCleanSheets;
    const cleanRate = Number((onCleanSheets / s.onGames).toFixed(2));

    entries.push({
      name,
      team: displayOf(tKey),
      onGames:  s.onGames,
      offGames: s.offGames,
      gkGames:  s.gkGames,
      onGfPg, onGaPg, offGfPg, offGaPg,
      goalImpact, defImpact,
      onCleanSheets, cleanRate,
    });
  }

  if (entries.length === 0) return { minOn: 0, rated: [], unrated: [] };

  // ── 6단계: rated/unrated 분리 — onGames >= minOn 이면 rated ─────────
  // minOff 기준 없음. offGames=0 이면 impact=null 이지만 onGames 가 충분하면 rated.

  // 정렬: (goalImpact ?? -Inf) + (defImpact ?? -Inf) 내림 → onGames 내림 → name ko
  // null 이 하나라도 있으면 합이 -Infinity 가 되어 맨 뒤로.
  const sortFn = (a, b) => {
    const sumA = (a.goalImpact ?? -Infinity) + (a.defImpact ?? -Infinity);
    const sumB = (b.goalImpact ?? -Infinity) + (b.defImpact ?? -Infinity);
    if (sumB !== sumA) return sumB - sumA;
    if (b.onGames !== a.onGames) return b.onGames - a.onGames;
    return byKo(a.name, b.name);
  };

  const rated   = entries.filter(e => e.onGames >= minOn).sort(sortFn);
  const unrated = entries.filter(e => e.onGames < minOn).sort(sortFn);

  return { minOn, rated, unrated };
}

/**
 * calcCupPlayerRecords 결과에 GK 통계를 병합한다.
 *
 * @param {Array} players calcCupPlayerRecords 결과
 *   ({ name, team, guest, goals, assists, cleanSheets, ownGoals, days, ... })
 * @param {Array} keepers calcCupKeepers 결과
 *   ({ name, games, conceded, cleanSheets, concededRate })
 * @returns {Array} players 순서 그대로, 각 항목에 gkGames·gkConceded·gkRate 추가.
 *   gkGames: keeper.games 또는 0
 *   gkConceded: keeper.conceded 또는 0
 *   gkRate: gkGames > 0 이면 keeper.concededRate, 아니면 null
 *   keepers 에만 있고 players 에 없는 이름은 무시.
 *   입력을 변이하지 않는다.
 */
export function mergePlayerKeeperRecords(players = [], keepers = []) {
  const keeperMap = new Map();
  for (const k of keepers) {
    if (k && k.name) keeperMap.set(k.name, k);
  }

  return players.map(p => {
    const k = keeperMap.get(p.name);
    const gkGames    = k ? k.games    : 0;
    const gkConceded = k ? k.conceded : 0;
    const gkRate     = gkGames > 0    ? k.concededRate : null;
    return { ...p, gkGames, gkConceded, gkRate };
  });
}
