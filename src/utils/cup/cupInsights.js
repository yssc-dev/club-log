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
 * 필드 수비 통계.
 * - GK 비어있는 사이드는 통째 건너뜀.
 * - 멤버 = parseMembersWithAbsent(json).actual 에서 해당 사이드 GK 제외.
 * @returns {{ minGames: number, rated: Array, unrated: Array }}
 * 각 항목: { name, games, conceded, cleanSheets, cleanRate, concededPerGame }
 */
export function calcCupFieldDefense({ matchRows = [] }) {
  const map = new Map(); // name → 누적

  const ensure = name => {
    if (!map.has(name)) map.set(name, { name, games: 0, conceded: 0, cleanSheets: 0 });
    return map.get(name);
  };

  const processSide = (membersJson, gkRaw, conceded) => {
    const gk = nameOf(gkRaw);
    if (!gk) return; // GK 비어있으면 이 사이드 전체 건너뜀
    const { actual } = parseMembersWithAbsent(membersJson);
    for (const raw of actual) {
      const name = nameOf(raw);
      if (!name || name === gk) continue; // GK 자신은 필드 수비 제외
      const p = ensure(name);
      p.games++; p.conceded += conceded; if (conceded === 0) p.cleanSheets++;
    }
  };

  for (const r of matchRows || []) {
    if (!r) continue;
    processSide(r.our_members_json, r.our_gk, num(r.opponent_score));
    processSide(r.opponent_members_json, r.opponent_gk, num(r.our_score));
  }

  if (map.size === 0) return { minGames: 0, rated: [], unrated: [] };

  const maxGames = Math.max(...[...map.values()].map(p => p.games));
  const minGames = dynamicMin(maxGames);

  const entries = [...map.values()].map(p => ({
    ...p,
    cleanRate: Number((p.cleanSheets / p.games).toFixed(2)),
    concededPerGame: Number((p.conceded / p.games).toFixed(2)),
  }));

  const rated = entries
    .filter(p => p.games >= minGames)
    .sort((a, b) =>
      b.cleanRate - a.cleanRate ||
      a.concededPerGame - b.concededPerGame ||
      b.games - a.games ||
      byKo(a.name, b.name)
    );

  const unrated = entries
    .filter(p => p.games < minGames)
    .sort((a, b) => b.games - a.games || byKo(a.name, b.name));

  return { minGames, rated, unrated };
}

/**
 * 어워드 카드 배열 (고정 순서, 수상자 없는 카드는 생략).
 * @param {{ players, keepers, defense, days }} params
 *   players = calcCupPlayerRecords 결과 rows.
 *   keepers = calcCupKeepers 결과.
 *   defense = calcCupFieldDefense 결과.
 *   days    = calcCupStandings().days.
 * @returns {Array<{ key, title, names, value, note? }>}
 */
export function calcCupAwards({ players = [], keepers = [], defense = { minGames: 0, rated: [], unrated: [] }, days = [] }) {
  const cards = [];

  // 1. 득점왕
  if (players.length > 0) {
    const max = Math.max(0, ...players.map(p => p.goals));
    if (max > 0) {
      const names = players.filter(p => p.goals === max).map(p => p.name).sort(byKo);
      cards.push({ key: 'topScorer', title: '득점왕', names, value: `${max}골` });
    }
  }

  // 2. 도움왕
  if (players.length > 0) {
    const max = Math.max(0, ...players.map(p => p.assists));
    if (max > 0) {
      const names = players.filter(p => p.assists === max).map(p => p.name).sort(byKo);
      cards.push({ key: 'topAssist', title: '도움왕', names, value: `${max}어시` });
    }
  }

  // 3. 클린시트왕
  if (keepers.length > 0) {
    const max = Math.max(0, ...keepers.map(k => k.cleanSheets));
    if (max > 0) {
      const names = keepers.filter(k => k.cleanSheets === max).map(k => k.name).sort(byKo);
      cards.push({ key: 'cleanSheet', title: '클린시트왕', names, value: `${max}경기` });
    }
  }

  // 4. 수문장 — keepers 중 games >= dynamicMin(최다경기) 인 자 내 최저 실점률
  if (keepers.length > 0) {
    const maxGames = Math.max(...keepers.map(k => k.games));
    const minK = dynamicMin(maxGames);
    const qual = keepers.filter(k => k.games >= minK);
    if (qual.length > 0) {
      const minRate = Math.min(...qual.map(k => k.concededRate));
      const names = qual.filter(k => k.concededRate === minRate).map(k => k.name).sort(byKo);
      cards.push({
        key: 'keeper', title: '수문장',
        names, value: `실점률 ${minRate.toFixed(2)}`, note: `최소 ${minK}경기`,
      });
    }
  }

  // 5. 수비력 — defense.rated[0] 과 cleanRate 동률인 모든 선수
  if (defense.rated && defense.rated.length > 0) {
    const topRate = defense.rated[0].cleanRate;
    const names = defense.rated.filter(p => p.cleanRate === topRate).map(p => p.name).sort(byKo);
    const pct = Math.round(topRate * 100);
    cards.push({
      key: 'defense', title: '수비력',
      names, value: `무실점률 ${pct}%`, note: `최소 ${defense.minGames}경기(필드)`,
    });
  }

  // 6. 개근 — days.length >= 2 일 때만 (첫 경기일에는 전원 개근이라 생략)
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
