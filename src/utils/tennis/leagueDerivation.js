// 투어리그(1~8위)/챌린저리그(9위~)는 명부에 저장하지 않고 단식 로그에서 파생한다.
// 기준은 "경기일 직전까지의 시즌 누적 단식 승률" — 당일 결과는 그날 판정에 넣지 않는다.
// 덕분에 하루 안에서는 배치가 고정되고, 마감 순서가 꼬여도 포인트가 흔들리지 않는다.

import { LEAGUE_TOUR, LEAGUE_CHALLENGER, COMPETITION_SINGLES, TOUR_SLOTS } from './tennisSchema';

// seasonAggregate: 그 해 상세 로우 없는 단식 집계 [{player, wins, losses}](예: 2026 1~7월).
// 상세 이전의 시즌 기록이라 배치 판정 승률에 함께 가산 — 표시 승률(집계+상세)과 티어 기준을 일치시킨다.
export function singlesWinRatesBefore(playerGameRows, dateISO, seasonAggregate = []) {
  const acc = new Map();
  for (const r of (playerGameRows || [])) {
    if (!r || r.format !== '단식') continue;
    if (r.league !== COMPETITION_SINGLES) continue;   // 용병전 등 미성립 판 제외
    if (!r.date || String(r.date) >= String(dateISO)) continue; // 당일 포함 이후 제외
    const cur = acc.get(r.player) || { wins: 0, losses: 0, rate: 0 };
    if (r.result === '승') cur.wins++;
    else if (r.result === '패') cur.losses++;
    else continue;
    acc.set(r.player, cur);
  }
  for (const L of (seasonAggregate || [])) {
    if (!L || !L.player) continue;
    const cur = acc.get(L.player) || { wins: 0, losses: 0, rate: 0 };
    cur.wins += Number(L.wins) || 0;
    cur.losses += Number(L.losses) || 0;
    acc.set(L.player, cur);
  }
  for (const v of acc.values()) {
    const total = v.wins + v.losses;
    v.rate = total > 0 ? v.wins / total : 0;
  }
  return acc;
}

// 정렬: 기록 있는 사람 우선(승률↓ → 승수↓ → 이름) → 시드 있는 사람(전년도 순위↑) → 나머지(이름)
// seedOrder: 전년도 단식 승률 순위 이름 배열(best→worst). 그 해 기록 없는 선수의 시즌 초 시드.
function orderPlayers(roster, rates, seedOrder) {
  const byName = (a, b) => String(a.name).localeCompare(String(b.name), 'ko');
  const seedIdx = new Map((seedOrder || []).map((n, i) => [n, i]));
  const recorded = [];
  const seeded = [];
  const rest = [];

  for (const m of roster) {
    if (rates.has(m.name)) recorded.push(m);
    else if (seedIdx.has(m.name)) seeded.push(m);
    else rest.push(m);
  }

  recorded.sort((a, b) => {
    const ra = rates.get(a.name), rb = rates.get(b.name);
    if (rb.rate !== ra.rate) return rb.rate - ra.rate;
    if (rb.wins !== ra.wins) return rb.wins - ra.wins;
    return byName(a, b);
  });
  seeded.sort((a, b) => seedIdx.get(a.name) - seedIdx.get(b.name) || byName(a, b));
  rest.sort(byName);

  return [...recorded, ...seeded, ...rest];
}

// 전년도 단식 순위(이름 배열, 승률↓) — 시즌 초 자동 시드용. 상세 로우 + 집계(legacy) 합산.
// 로스터(정회원)만, 그 해 단식 경기 있는 선수만.
export function priorYearSinglesOrder({ rows, legacyRows, roster, year }) {
  const py = String(Number(year) - 1);
  const acc = new Map(); // name -> {wins, losses}
  const bump = (name, w, l) => {
    const cur = acc.get(name) || { wins: 0, losses: 0 };
    cur.wins += w; cur.losses += l; acc.set(name, cur);
  };
  for (const r of (rows || [])) {
    if (!r || r.format !== '단식' || r.is_guest === true) continue;
    if (r.league !== COMPETITION_SINGLES) continue; // 인시즌(singlesWinRatesBefore)과 동일 조건
    const rSeason = String(r.season || String(r.date || '').slice(0, 4));
    if (rSeason !== py) continue;
    if (r.result === '승') bump(r.player, 1, 0);
    else if (r.result === '패') bump(r.player, 0, 1);
  }
  for (const L of (legacyRows || [])) {
    if (!L || String(L.season) !== py || L.format !== '단식') continue;
    bump(L.player, Number(L.wins) || 0, Number(L.losses) || 0);
  }
  const members = new Set((roster || []).map(m => m && m.name).filter(Boolean));
  return [...acc.entries()]
    .filter(([name, v]) => members.has(name) && (v.wins + v.losses) > 0)
    .map(([name, v]) => ({ name, rate: v.wins / (v.wins + v.losses), games: v.wins + v.losses }))
    .sort((a, b) => b.rate - a.rate || b.games - a.games || String(a.name).localeCompare(String(b.name), 'ko'))
    .map(s => s.name);
}

// tourSlots: 투어리그 정원(기본 8 — 규정 '1~8 투어리그 / 9~16 챌린저리그'). 정원 이하 인원이면 전원 투어.
export function deriveLeagueForDate({ rows, dateISO, roster, seedOrder, seasonAggregate = [], tourSlots = TOUR_SLOTS }) {
  const list = (roster || []).filter(m => m && m.name);
  if (list.length === 0) return {};

  const rates = singlesWinRatesBefore(rows, dateISO, seasonAggregate);
  const seedSet = new Set(seedOrder || []);
  const hasAnySignal = list.some(m => rates.has(m.name) || seedSet.has(m.name));

  const out = {};
  // 시즌 초 — 순위를 가를 근거가 전혀 없으면 전원 같은 리그로 둔다.
  // (전원 투어리그로 두면 "챌린저가 투어를 이김" 보너스가 발생하지 않아 중립이다.)
  if (!hasAnySignal) {
    for (const m of list) out[m.name] = LEAGUE_TOUR;
    return out;
  }

  const ordered = orderPlayers(list, rates, seedOrder);
  // 상위 tourSlots명 = 투어리그(고정 정원), 나머지 = 챌린저리그. 순서는 경기 전 승률(티어 기준은 승률 유지 — 유저 결정 2026-08-28).
  const tourCount = Math.min(Math.max(1, Number(tourSlots) || TOUR_SLOTS), ordered.length);
  ordered.forEach((m, i) => { out[m.name] = i < tourCount ? LEAGUE_TOUR : LEAGUE_CHALLENGER; });
  return out;
}
