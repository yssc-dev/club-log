// firebaseSync 의 순수 helper 함수들. firebase SDK 의존 없음.
// 별도 파일로 분리해 단위테스트 가능하게 함.

export const META_FIELDS = [
  'gameCreator', 'phase', 'currentRoundIdx', 'teamCount', 'courtCount',
  'matchMode', 'isExtraRound', 'splitPhase', 'rotations',
  'earlyFinish', 'gameFinalized', 'lastEditor',
  'currentMatchIdx', 'draftMode',
  'sport', 'gameDate', 'season',
];

// 통째로 set 하는 배열/객체 필드 (변경 시 전체 교체)
export const WHOLE_REPLACE_FIELDS = [
  'teams', 'teamNames', 'teamColorIndices',
  'schedule', 'attendees', 'opponents',
  'pushState', 'settingsSnapshot', 'soccerFormation',
  'freeCourtMatches',
];

// 테니스 통짜 교체 필드. rounds/guests는 테니스 전용이라 풋살 initialState엔 없어
// WHOLE_REPLACE_FIELDS에 섞으면 syncCoverage 의 stale 가드가 깨진다.
// (그 가드는 풋살 initialState 기준으로 오타/삭제를 잡는 장치이므로 약화시키지 않는다)
// confirmedRounds는 풋살/축구도 쓰는 공유 필드지만, 풋살 CHILD_NODE 경로와 별개로
// 테니스 통짜 저장(saveState)에도 포함돼야 해 여기 둔다(풋살 동기화엔 무영향).
export const TENNIS_WHOLE_REPLACE_FIELDS = [
  'rounds', 'guests', 'confirmedRounds',
];

// 자식 노드 단위로 diff/동기화되는 필드 (META/WHOLE_REPLACE 외). diffStateToWrites 의 개별 분기와 1:1.
export const CHILD_NODE_FIELDS = [
  'allEvents',        // events/{id}
  'completedMatches', // matches/{matchId}
  'soccerMatches',    // soccerMatches/{idx}
  'gks',              // gks/{teamIdx}
  'gksHistory',       // gksHistory/{round}
  'liveMercs',        // liveMercs/{matchId}
  'absentees',        // absentees/{matchId}
  'confirmedRounds',  // confirmedRounds/{idx}
];

// initialState 의 필드 중 RTDB 동기화 대상이 "아닌" 것 (로컬 UI 상태 / 임시 / 시즌 참조 데이터).
// ★ 새 state 필드 추가 시: 멀티유저 공유돼야 하면 META/WHOLE_REPLACE/CHILD_NODE 중 하나에,
//   아니면 여기에 분류해야 함. 어디에도 없으면 syncCoverage 테스트가 실패해 강제로 분류하게 함.
//   (자유대진 freeCourtMatches / CourtRecorder GK 처럼 "공유돼야 하는데 안 됐던" 버그 재발 방지 가드)
export const LOCAL_ONLY_FIELDS = [
  'dataLoading', 'dataSource',                       // 데이터 로드 상태
  'seasonPlayers', 'seasonCrova', 'seasonGoguma',    // 시즌 참조 데이터(별도 로드)
  'syncStatus', 'attendanceLoading', 'newPlayer',    // UI 상태/입력 드래프트
  'freeSelectTeam', 'editingTeamName', 'moveSource', // UI 선택/드래그
  'viewingRoundIdx',                                 // 보기 위치 — 사용자별 로컬(원격값 무시)
  'matchModal', 'matchModal_sortKey', 'playerSortMode',
  'teamEditMode', 'teamEditSnapshot',                // 팀명단 수정 임시 상태
];

export function deepEqual(a, b) {
  if (a === b) return true;
  if (a == null || b == null) return a === b;
  if (typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a), kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  for (const k of ka) if (!deepEqual(a[k], b[k])) return false;
  return true;
}

export function eventsToObj(arr) {
  const out = {};
  for (const e of (arr || [])) {
    if (!e || !e.id) continue;
    out[e.id] = e;
  }
  return out;
}

export function matchesToObj(arr) {
  const out = {};
  for (const m of (arr || [])) {
    if (!m || !m.matchId) continue;
    out[m.matchId] = m;
  }
  return out;
}

export function soccerMatchesToObj(arr) {
  const out = {};
  for (const m of (arr || [])) {
    if (!m) continue;
    const k = (m.matchIdx != null) ? String(m.matchIdx) : null;
    if (k == null) continue;
    out[k] = m;
  }
  return out;
}

// 매치의 이벤트가 전부 id를 가졌는지 — 이벤트 단위 diff 가능 여부 판정.
// (레거시 id 없는 이벤트가 섞이면 매치 통째 교체로 폴백해야 안전)
function soccerEventsHaveIds(events) {
  const arr = Array.isArray(events)
    ? events
    : (events && typeof events === 'object' ? Object.values(events) : []);
  return arr.every(e => e && e.id != null);
}

// RTDB 저장용 직렬화: events 배열을 id 키 객체로 변환.
// 배열로 저장하면 RTDB가 숫자 키 객체로 바꿔 이벤트 단위 경로(events/{id})와 충돌함.
export function serializeSoccerMatch(m) {
  if (!m || typeof m !== 'object') return m;
  if (Array.isArray(m.events) && m.events.length > 0 && soccerEventsHaveIds(m.events)) {
    return { ...m, events: eventsToObj(m.events) };
  }
  return m;
}

// prev → next state diff. RTDB update() 에 그대로 쓸 수 있는 path-value map 반환.
// updatedAt/lastEditor 는 호출자가 첨부 (firebase SDK serverTimestamp 사용 위해).
export function diffStateToWrites(prev, next) {
  const writes = {};

  for (const f of META_FIELDS) {
    if (!deepEqual(prev?.[f], next?.[f])) {
      writes[`meta/${f}`] = next[f] === undefined ? null : next[f];
    }
  }

  for (const f of WHOLE_REPLACE_FIELDS) {
    if (!deepEqual(prev?.[f], next?.[f])) {
      writes[f] = next[f] === undefined ? null : next[f];
    }
  }

  // events
  {
    const prevObj = eventsToObj(prev?.allEvents);
    const nextObj = eventsToObj(next?.allEvents);
    for (const id of new Set([...Object.keys(prevObj), ...Object.keys(nextObj)])) {
      if (!deepEqual(prevObj[id], nextObj[id])) {
        writes[`events/${id}`] = nextObj[id] === undefined ? null : nextObj[id];
      }
    }
  }

  // matches (completedMatches)
  {
    const prevObj = matchesToObj(prev?.completedMatches);
    const nextObj = matchesToObj(next?.completedMatches);
    for (const id of new Set([...Object.keys(prevObj), ...Object.keys(nextObj)])) {
      if (!deepEqual(prevObj[id], nextObj[id])) {
        writes[`matches/${id}`] = nextObj[id] === undefined ? null : nextObj[id];
      }
    }
  }

  // soccerMatches — 매치 통째 교체가 아니라 자식(필드/이벤트) 단위로 diff.
  // 두 탭이 같은 경기에 동시에 이벤트를 기록해도 서로의 이벤트를 덮어쓰지 않게 함 (풋살 events/{id}와 동일 원칙).
  {
    const prevObj = soccerMatchesToObj(prev?.soccerMatches);
    const nextObj = soccerMatchesToObj(next?.soccerMatches);
    for (const id of new Set([...Object.keys(prevObj), ...Object.keys(nextObj)])) {
      const pm = prevObj[id];
      const nm = nextObj[id];
      if (deepEqual(pm, nm)) continue;
      if (nm === undefined) {
        writes[`soccerMatches/${id}`] = null;
        continue;
      }
      // 신규 매치이거나 id 없는 이벤트가 섞인 경우(레거시)는 통째 교체
      if (pm === undefined || !soccerEventsHaveIds(pm.events) || !soccerEventsHaveIds(nm.events)) {
        writes[`soccerMatches/${id}`] = serializeSoccerMatch(nm);
        continue;
      }
      const keys = new Set([...Object.keys(pm), ...Object.keys(nm)]);
      keys.delete('events');
      for (const k of keys) {
        if (!deepEqual(pm[k], nm[k])) {
          writes[`soccerMatches/${id}/${k}`] = nm[k] === undefined ? null : nm[k];
        }
      }
      const pe = eventsToObj(pm.events);
      const ne = eventsToObj(nm.events);
      for (const evId of new Set([...Object.keys(pe), ...Object.keys(ne)])) {
        if (!deepEqual(pe[evId], ne[evId])) {
          writes[`soccerMatches/${id}/events/${evId}`] = ne[evId] === undefined ? null : ne[evId];
        }
      }
    }
  }

  // gks
  {
    const prevObj = prev?.gks || {};
    const nextObj = next?.gks || {};
    for (const k of new Set([...Object.keys(prevObj), ...Object.keys(nextObj)])) {
      if (!deepEqual(prevObj[k], nextObj[k])) {
        writes[`gks/${k}`] = nextObj[k] === undefined ? null : nextObj[k];
      }
    }
  }

  // gksHistory (이중 객체 — round 단위로 diff)
  {
    const prevObj = prev?.gksHistory || {};
    const nextObj = next?.gksHistory || {};
    for (const round of new Set([...Object.keys(prevObj), ...Object.keys(nextObj)])) {
      if (!deepEqual(prevObj[round], nextObj[round])) {
        writes[`gksHistory/${round}`] = nextObj[round] === undefined ? null : nextObj[round];
      }
    }
  }

  // liveMercs
  {
    const prevObj = prev?.liveMercs || {};
    const nextObj = next?.liveMercs || {};
    for (const k of new Set([...Object.keys(prevObj), ...Object.keys(nextObj)])) {
      if (!deepEqual(prevObj[k], nextObj[k])) {
        writes[`liveMercs/${k}`] = nextObj[k] === undefined ? null : nextObj[k];
      }
    }
  }

  // absentees — matchId 단위 diff (값 자체는 { teamIdx: [name] } 객체)
  {
    const prevObj = prev?.absentees || {};
    const nextObj = next?.absentees || {};
    for (const k of new Set([...Object.keys(prevObj), ...Object.keys(nextObj)])) {
      if (!deepEqual(prevObj[k], nextObj[k])) {
        writes[`absentees/${k}`] = nextObj[k] === undefined ? null : nextObj[k];
      }
    }
  }

  // confirmedRounds
  {
    const prevObj = prev?.confirmedRounds || {};
    const nextObj = next?.confirmedRounds || {};
    for (const k of new Set([...Object.keys(prevObj), ...Object.keys(nextObj)])) {
      if (!deepEqual(prevObj[k], nextObj[k])) {
        writes[`confirmedRounds/${k}`] = nextObj[k] === undefined ? null : nextObj[k];
      }
    }
  }

  return writes;
}

// RTDB는 빈 배열을 저장하지 않고, 희소 배열/중첩 배열은 객체로 변환됨.
// schedule[i].matches[j] = [homeIdx, awayIdx] 같은 깊은 중첩 구조에서
// 두 번째 매치가 trailing null로 인식돼 누락되거나 객체로 역직렬화되는 케이스 복구.
//
// 추가로 confirmedMatches에 라운드별 R{n}_C{ci} 매치가 남아있으면
// 그 정보로 누락된 round.matches 슬롯 보강.
export function normalizeSchedule(raw, completedMatches) {
  const objToArray = (v) => {
    if (Array.isArray(v)) return v;
    if (v && typeof v === 'object') {
      const arr = [];
      for (const k of Object.keys(v)) {
        const i = +k;
        if (Number.isInteger(i) && i >= 0) arr[i] = v[k];
      }
      return arr;
    }
    return [];
  };
  const rounds = objToArray(raw);
  const completedByRound = {};
  for (const m of (completedMatches || [])) {
    const id = m?.matchId;
    const match = id ? id.match(/^R(\d+)_C(\d+)$/) : null;
    if (!match) continue;
    const ri = +match[1] - 1;
    const ci = +match[2];
    if (!completedByRound[ri]) completedByRound[ri] = {};
    completedByRound[ri][ci] = [m.homeIdx, m.awayIdx];
  }
  return rounds.map((round, ri) => {
    if (!round || typeof round !== 'object') return { matches: [] };
    let matches = objToArray(round.matches).map(p => {
      if (Array.isArray(p)) return p;
      if (p && typeof p === 'object') return objToArray(p);
      return p;
    });
    // completedMatches에 라운드 ri의 매치가 더 있으면 매치 슬롯 보강
    const completed = completedByRound[ri];
    if (completed) {
      for (const ciStr of Object.keys(completed)) {
        const ci = +ciStr;
        if (!matches[ci] || !Array.isArray(matches[ci]) || matches[ci].length !== 2) {
          matches[ci] = completed[ci];
        }
      }
    }
    // 희소 → 밀집(빈 슬롯은 제거)
    matches = matches.filter(m => Array.isArray(m) && m.length === 2);
    return { ...round, matches };
  });
}

// RTDB는 빈 배열을 저장하지 않고, 희소 배열은 객체로 변환됨.
// 0~teamCount-1 인덱스를 가진 배열로 정규화 + 길이를 teamCount로 패딩.
function normalizeTeamArray(raw, teamCount, fill) {
  let arr;
  if (Array.isArray(raw)) {
    arr = [...raw];
  } else if (raw && typeof raw === 'object') {
    arr = [];
    for (const k of Object.keys(raw)) {
      const i = +k;
      if (Number.isInteger(i) && i >= 0) arr[i] = raw[k];
    }
  } else {
    arr = [];
  }
  while (arr.length < teamCount) arr.push(typeof fill === 'function' ? fill(arr.length) : fill);
  for (let i = 0; i < teamCount; i++) if (arr[i] == null) arr[i] = typeof fill === 'function' ? fill(i) : fill;
  return arr;
}

// RTDB 노드 트리 → gameState 객체 재조립.
// RTDB는 빈 배열/객체를 저장하지 않고, 비어있지 않은 배열은 객체화함.
// 경기 객체의 배열/객체 필드를 단일 지점에서 재정규화해 다운스트림 크래시(events undefined 등)를 원천 차단.
function normalizeSoccerMatch(m) {
  if (!m || typeof m !== 'object') return m;
  const asArr = (v) => Array.isArray(v) ? v : (v && typeof v === 'object' ? Object.values(v) : []);
  return {
    ...m,
    events: asArr(m.events).sort((a, b) => (a?.timestamp || 0) - (b?.timestamp || 0)),
    lineup: asArr(m.lineup),
    defenders: asArr(m.defenders),
    subs: asArr(m.subs),
    assignments: m.assignments || null,
    positionMap: m.positionMap || null,
    formation: m.formation || null,
  };
}

export function reconstructState(gameId, raw) {
  if (!raw) return null;
  const meta = raw.meta || {};
  const events = raw.events ? Object.values(raw.events) : [];
  events.sort((a, b) => (a?.timestamp || 0) - (b?.timestamp || 0));
  const matches = raw.matches ? Object.values(raw.matches) : [];
  const soccerMatches = raw.soccerMatches
    ? Object.values(raw.soccerMatches).sort((a, b) => (a?.matchIdx || 0) - (b?.matchIdx || 0)).map(normalizeSoccerMatch)
    : [];
  const teamCount = meta.teamCount ?? 4;
  return {
    gameId,
    gameCreator: meta.gameCreator || '',
    phase: meta.phase || '',
    currentRoundIdx: meta.currentRoundIdx ?? 0,
    teamCount,
    courtCount: meta.courtCount ?? 2,
    matchMode: meta.matchMode || 'schedule',
    isExtraRound: meta.isExtraRound ?? false,
    splitPhase: meta.splitPhase ?? null,
    rotations: meta.rotations ?? 2,
    earlyFinish: meta.earlyFinish ?? false,
    gameFinalized: meta.gameFinalized ?? false,
    lastEditor: meta.lastEditor || '',
    currentMatchIdx: meta.currentMatchIdx ?? -1,
    draftMode: meta.draftMode || 'snake',
    // 테니스 meta — sport/gameDate/season는 normalizeTennisMatch 대신 여기서 복원
    sport: meta.sport || '',
    gameDate: meta.gameDate || '',
    season: meta.season ?? null,
    teams: normalizeTeamArray(raw.teams, teamCount, () => []),
    teamNames: normalizeTeamArray(raw.teamNames, teamCount, (i) => `팀${i + 1}`),
    teamColorIndices: normalizeTeamArray(raw.teamColorIndices, teamCount, (i) => i),
    schedule: normalizeSchedule(raw.schedule, matches),
    attendees: raw.attendees || [],
    opponents: raw.opponents || [],
    // 테니스 whole-replace — normalizeTennisMatch이 빈배열/기본값을 담당하므로 || 없음.
    // undefined면 normalizeTennisMatch가 각각 [] 로 복원한다.
    rounds: raw.rounds,
    guests: raw.guests,
    // ★ confirmedRounds는 풋살/축구/테니스 공유 필드다. 풋살은 normalizeTennisMatch를
    //   거치지 않으므로 여기서 기본값을 보장해야 한다. 라운드 확정을 전부 취소하면
    //   Firebase가 노드를 삭제해 raw.confirmedRounds === undefined가 되는데, 그대로 두면
    //   풋살 RESTORE_STATE의 `!= null` 가드가 스킵돼 구독 탭의 stale 확정이 안 지워진다.
    confirmedRounds: raw.confirmedRounds ?? {},
    freeCourtMatches: raw.freeCourtMatches || {},
    pushState: raw.pushState ?? null,
    settingsSnapshot: raw.settingsSnapshot ?? null,
    soccerFormation: raw.soccerFormation ?? null,
    gks: raw.gks || {},
    gksHistory: raw.gksHistory || {},
    liveMercs: raw.liveMercs || {},
    absentees: raw.absentees || {},
    allEvents: events,
    completedMatches: matches,
    soccerMatches,
  };
}

// state → RTDB 노드 구조 펼침. set() 으로 통짜 저장할 때 사용.
// updatedAt 는 호출자가 직접 첨부 (serverTimestamp 사용 위해).
export function expandStateForRtdb(state) {
  const meta = {};
  for (const f of META_FIELDS) {
    if (state[f] !== undefined) meta[f] = state[f];
  }
  const out = { meta };
  for (const f of WHOLE_REPLACE_FIELDS) {
    if (state[f] !== undefined && state[f] !== null) out[f] = state[f];
  }
  for (const f of TENNIS_WHOLE_REPLACE_FIELDS) {
    if (state[f] !== undefined && state[f] !== null) out[f] = state[f];
  }
  if (state.gks) out.gks = state.gks;
  if (state.gksHistory) out.gksHistory = state.gksHistory;
  if (state.liveMercs) out.liveMercs = state.liveMercs;
  if (state.absentees) out.absentees = state.absentees;
  // confirmedRounds는 위 TENNIS_WHOLE_REPLACE_FIELDS 루프에서 이미 처리된다(중복 제거).
  if (state.allEvents) out.events = eventsToObj(state.allEvents);
  if (state.completedMatches) out.matches = matchesToObj(state.completedMatches);
  if (state.soccerMatches) {
    const obj = soccerMatchesToObj(state.soccerMatches);
    const serialized = {};
    for (const k of Object.keys(obj)) serialized[k] = serializeSoccerMatch(obj[k]);
    out.soccerMatches = serialized;
  }
  return out;
}
