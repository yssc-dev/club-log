/**
 * 경기 스코어 계산
 * @param {Array} events - 경기 이벤트 배열
 * @returns {{ ourScore: number, opponentScore: number }}
 */
export function calcSoccerScore(events) {
  let ourScore = 0, opponentScore = 0;
  for (const e of (events || [])) {
    if (e.type === "goal" || e.type === "opponentOwnGoal") ourScore++;
    else if (e.type === "owngoal" || e.type === "opponentGoal") opponentScore++;
  }
  return { ourScore, opponentScore };
}

/** 단일 경기 결과 라벨 (우리팀 기준) */
export function soccerResultLabel(ourScore, opponentScore) {
  return ourScore > opponentScore ? "승" : ourScore < opponentScore ? "패" : "무";
}

/**
 * 완료된(status "finished") 축구 경기 수 — 휴식 경기 포함.
 * 진행도/요약 카운트(대시보드 라벨·인앱 헤더·동기화 요약)의 단일 소스.
 * ⚠️ 전적 계산(calcSoccerTeamRecord/calcSoccerOpponentRecords)은 휴식을 제외하므로 이 헬퍼를 쓰지 말 것.
 */
export function countFinishedSoccerMatches(soccerMatches) {
  return (soccerMatches || []).filter(m => m && m.status === "finished").length;
}

/**
 * 오늘 팀 전적 집계 (우리팀 기준, 휴식 경기 제외) — 상대별 전적의 합계
 * @returns {{ played, wins, draws, losses, gf, ga }}
 */
export function calcSoccerTeamRecord(soccerMatches) {
  return calcSoccerOpponentRecords(soccerMatches).reduce((acc, r) => ({
    played: acc.played + r.played,
    wins: acc.wins + r.wins,
    draws: acc.draws + r.draws,
    losses: acc.losses + r.losses,
    gf: acc.gf + r.gf,
    ga: acc.ga + r.ga,
  }), { played: 0, wins: 0, draws: 0, losses: 0, gf: 0, ga: 0 });
}

/**
 * 상대별 전적 집계 (우리팀 기준, 휴식 제외) — 승점/득실 순 정렬
 * @returns {Array<{opponent, played, wins, draws, losses, gf, ga}>}
 */
export function calcSoccerOpponentRecords(soccerMatches) {
  const map = {};
  for (const m of (soccerMatches || [])) {
    if (m.status !== "finished" || m.opponent === "휴식") continue;
    const opp = m.opponent;
    if (!map[opp]) map[opp] = { opponent: opp, played: 0, wins: 0, draws: 0, losses: 0, gf: 0, ga: 0 };
    const { ourScore, opponentScore } = calcSoccerScore(m.events || []);
    const r = map[opp];
    r.played++; r.gf += ourScore; r.ga += opponentScore;
    if (ourScore > opponentScore) r.wins++;
    else if (ourScore < opponentScore) r.losses++;
    else r.draws++;
  }
  return Object.values(map).sort((a, b) =>
    ((b.wins * 3 + b.draws) - (a.wins * 3 + a.draws)) ||
    ((b.gf - b.ga) - (a.gf - a.ga)) ||
    (b.gf - a.gf)
  );
}

/**
 * 클린시트 대상 선수 목록 (무실점 경기 시 GK + 모든 DF)
 * 교체로 나간 DF/GK도 포함
 */
// 한 경기에서 GK로 뛴 모든 선수 집합.
// 최종 match.gk + GK 변경(교체 sub[pos GK], 위치교대 gkChange)의 나간/들어온 선수 모두.
// 무실점 경기는 실점 이벤트가 없어 이 기록으로만 두 GK를 알 수 있다(집계·클린시트 근거).
/**
 * 그 경기에 실제 출전한 선수 전원 — 출전 라벨/개인 집계의 단일 소스.
 * lineup(선발) ∪ sub 투입 ∪ gkChange 참여 ∪ 최종 피치 assignments.
 * lineup ∪ sub-in만으로는 부족: sub 이벤트가 삭제되거나 배치 편집으로 들어온 선수는
 * assignments에만 남는다(matchRowBuilder our_members_json과 같은 합집합 철학).
 * assignments는 RTDB 왕복 후 배열(숫자키 변환)일 수 있어 Object.values로 흡수.
 */
export function getSoccerPlayedPlayers(match) {
  const fromEvents = (match.events || []).flatMap(e => {
    if (e.type === "sub") return [e.playerIn];
    if (e.type === "gkChange") return [e.playerOut, e.playerIn];
    return [];
  });
  return [...new Set([
    ...(match.lineup || []),
    ...fromEvents,
    ...Object.values(match.assignments || {}),
  ].filter(Boolean))];
}

/**
 * 미출전 = 참석자 − 출전자. 요약 표시와 라인업 편집기의 정정 후보가 공유한다.
 * 유저 정의: "참석자 전원에서 (스타팅멤버+교체출전자)를 제외한 나머지가 미출전".
 * 경기에 저장된 m.subs(생성 시점 스냅샷)는 의도적으로 안 본다 — 나중에 참석 처리된 지각자가
 * 포함돼야 하고, 불참 처리된 벤치전용자는 빠져야 하기 때문.
 * @param {object} match
 * @param {string[]} attendees - 오늘 참석자
 * @returns {string[]} 이 경기에 안 뛴 참석자
 */
export function getNonPlayers(match, attendees) {
  const played = new Set(getSoccerPlayedPlayers(match));
  return (attendees || []).filter(n => !played.has(n));
}

/**
 * 진행중 경기의 교체 후보 = 참석자 − 피치 위 − 퇴장자.
 * getNonPlayers와 규칙이 다르다: 교체아웃된 선수는 '출전자'지만 재투입 가능해야 하므로
 * '− 출전자'를 쓸 수 없다. 대신 지금 피치에 없는 참석자를 후보로 본다.
 * 퇴장자는 assignments에서 지워져 onPitch에 안 잡히므로 events에서 따로 배제한다.
 * attendees에 기본값을 두지 않는다 — prop 미연결 시 조용히 빈 벤치가 되는 대신 즉시 터뜨린다.
 * @param {string[]} attendees - 오늘 참석자
 * @param {object} assignments - 현재 배치 { posIdx: name }
 * @param {object[]} events - 경기 이벤트
 * @returns {string[]} 지금 투입 가능한 선수
 */
export function getSubCandidates(attendees, assignments, events) {
  const expelled = new Set((events || []).filter(e => e.type === "redCard").map(e => e.player));
  const onPitch = new Set(Object.values(assignments || {}).filter(Boolean));
  return attendees.filter(n => !onPitch.has(n) && !expelled.has(n));
}

/**
 * 참석 명단을 일괄 변경할 때 잠금 인원(오늘 출전 기록 보유자)을 보존한다.
 * "활동선수 전체"(onSetAll)와 "초기화"(onClear)가 공유 — 칩 탭만 막으면 이 둘로 뚫린다.
 * 초기화는 keepLockedAttendees([], locked)로 호출한다.
 * @param {string[]} names - 새로 지정하려는 명단
 * @param {Set<string>|string[]} locked - 해제 금지 인원
 * @returns {string[]}
 */
export function keepLockedAttendees(names, locked) {
  return [...new Set([...(names || []), ...locked])];
}

/**
 * 참석자 칩 목록 = 시즌 로스터 ∪ 참석자.
 * 로스터는 '대시보드' 시트에서, 참석/출전 명단은 '참석명단' 시트에서 온다. 두 시트가 어긋나면
 * 참석자인데 칩이 없어 보이지도 토글되지도 않는 선수가 생긴다 —
 * 2026-07-14 게임 실측: 참석 24명 중 14명이 대시보드에 없었다.
 * 로스터에 없는 참석자는 합성 항목으로 채운다. point/games는 대시보드 기준값이라 알 수 없어 0이고,
 * games 0이라 '활동선수 전체'(games > 0) 필터에는 잡히지 않는다.
 * @param {{name:string, point:number, games:number}[]} seasonPlayers
 * @param {string[]} attendees
 * @returns {{name:string, point:number, games:number}[]} 새 배열(원본 불변)
 */
export function mergeAttendeesIntoRoster(seasonPlayers, attendees) {
  const arr = [...(seasonPlayers || [])];
  const known = new Set(arr.map(p => p.name));
  for (const n of (attendees || [])) {
    if (!known.has(n)) { arr.push({ name: n, point: 0, games: 0 }); known.add(n); }
  }
  return arr;
}

export function getMatchGks(match) {
  const gks = new Set();
  if (match.gk) gks.add(match.gk);
  for (const e of (match.events || [])) {
    if ((e.type === "sub" && e.position === "GK") || e.type === "gkChange") {
      if (e.playerOut) gks.add(e.playerOut);
      if (e.playerIn) gks.add(e.playerIn);
    }
  }
  return gks;
}

export function getCleanSheetPlayers(match) {
  const { opponentScore } = calcSoccerScore(match.events);
  if (opponentScore > 0) return []; // 경기 총실점 0일 때만 — 그러면 뛴 GK 모두 클린시트
  const csPlayers = new Set();
  getMatchGks(match).forEach(g => csPlayers.add(g)); // 뛴 모든 GK
  (match.defenders || []).forEach(d => csPlayers.add(d));
  for (const e of (match.events || [])) {
    // GK 교체는 getMatchGks가 이미 반영 — 여기선 DF로 투입된 교체 선수만 추가
    if (e.type === "sub" && e.position === "DF") {
      csPlayers.add(e.playerIn);
    }
  }
  return [...csPlayers];
}

/**
 * 경기별 선수 통계 집계
 */
export function calcSoccerPlayerStats(soccerMatches) {
  const stats = {};
  const ensure = (name) => {
    if (!stats[name]) stats[name] = { games: 0, fieldGames: 0, keeperGames: 0, goals: 0, assists: 0, owngoals: 0, cleanSheets: 0, conceded: 0 };
  };
  for (const match of (soccerMatches || [])) {
    if (match.status !== "finished") continue;
    const allPlayed = new Set(getSoccerPlayedPlayers(match));
    const csPlayers = getCleanSheetPlayers(match);
    const matchGks = getMatchGks(match); // 이 경기에서 GK로 뛴 모든 선수(교대/교체 포함)
    for (const name of allPlayed) {
      ensure(name);
      stats[name].games++;
      const wasGk = matchGks.has(name);
      if (wasGk) stats[name].keeperGames++;
      else stats[name].fieldGames++;
      if (csPlayers.includes(name)) stats[name].cleanSheets++;
    }
    for (const e of (match.events || [])) {
      if (e.type === "goal") {
        ensure(e.player); stats[e.player].goals++;
        if (e.assist) { ensure(e.assist); stats[e.assist].assists++; }
      }
      if (e.type === "owngoal") { ensure(e.player); stats[e.player].owngoals++; }
      if (e.type === "opponentGoal" && e.currentGk) { ensure(e.currentGk); stats[e.currentGk].conceded++; }
    }
  }
  return stats;
}

/**
 * 선수별 포인트 계산
 */
export function calcSoccerPlayerPoint(playerStat, settings) {
  const { goals, assists, owngoals, cleanSheets } = playerStat;
  return goals + assists + (owngoals * settings.ownGoalPoint) + (cleanSheets * settings.cleanSheetPoint);
}

/**
 * 이벤트로그 시트용 로우 데이터 빌드
 */
export function buildEventLogRows(soccerMatches, gameDate) {
  // timestamp/startedAt 부재 시 'Invalid Date' 문자열이 시트에 영구 기록되는 것을 방지
  const fmtTime = (ts) => (ts ? new Date(ts).toLocaleString("ko-KR") : "");
  const rows = [];
  for (const match of soccerMatches) {
    if (match.status !== "finished") continue;
    const matchNum = match.matchIdx + 1;
    const opponent = match.opponent;
    for (const name of (match.lineup || [])) {
      // 정확한 포지션은 positionMap 우선, 없으면 gk/defenders로 폴백(MF가 FW로 잘못 기록되던 문제 수정)
      let position = (match.positionMap && match.positionMap[name]) || "";
      if (!position) {
        if (name === match.gk) position = "GK";
        else if ((match.defenders || []).includes(name)) position = "DF";
        else position = "FW";
      }
      rows.push({
        gameDate, matchNum, opponent,
        event: "출전", player: name, relatedPlayer: "", position,
        inputTime: fmtTime(match.startedAt),
      });
    }
    const sorted = [...(match.events || [])].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0)); // 무timestamp NaN 비교자 → 비결정 정렬 방지
    for (const e of sorted) {
      if (e.type === "goal") {
        rows.push({ gameDate, matchNum, opponent, event: "골", player: e.player, relatedPlayer: e.assist || "", position: "", inputTime: fmtTime(e.timestamp) });
      } else if (e.type === "owngoal") {
        rows.push({ gameDate, matchNum, opponent, event: "자책골", player: e.player, relatedPlayer: "", position: "", inputTime: fmtTime(e.timestamp) });
      } else if (e.type === "opponentGoal") {
        rows.push({ gameDate, matchNum, opponent, event: "실점", player: e.currentGk || "", relatedPlayer: "", position: "GK", inputTime: fmtTime(e.timestamp) });
      } else if (e.type === "opponentOwnGoal") {
        // 상대 자책골(우리팀 +1) — 귀속 선수 없음. 이벤트 완전성을 위해 기록
        rows.push({ gameDate, matchNum, opponent, event: "상대자책골", player: "", relatedPlayer: "", position: "", inputTime: fmtTime(e.timestamp) });
      } else if (e.type === "sub") {
        rows.push({ gameDate, matchNum, opponent, event: "교체", player: e.playerIn, relatedPlayer: e.playerOut, position: e.position || "", inputTime: fmtTime(e.timestamp) });
      }
      // gkChange: 집계 전용 배경 이벤트 — 로그_이벤트 시트에는 기록하지 않음(의도적).
      // 실점 귀속은 '실점' 행의 currentGk로, keeperGames/클린시트는 로그_선수경기(PG)로 반영됨.
    }
  }
  return rows;
}

/**
 * 포인트로그 시트용 로우 데이터 빌드
 */
export function buildPointLogRows(soccerMatches, gameDate, inputTime) {
  const rows = [];
  for (const match of soccerMatches) {
    if (match.status !== "finished") continue;
    const matchNum = match.matchIdx + 1;
    for (const e of (match.events || [])) {
      if (e.type === "goal") {
        rows.push({ gameDate, matchId: String(matchNum), opponent: match.opponent, scorer: e.player, assist: e.assist || "", conceded: "", ownGoalPlayer: "", inputTime });
      } else if (e.type === "owngoal") {
        rows.push({ gameDate, matchId: String(matchNum), opponent: match.opponent, scorer: "OG", assist: "", conceded: "", ownGoalPlayer: e.player, inputTime });
      } else if (e.type === "opponentGoal") {
        // 실점 컬럼에는 실점 키퍼명(currentGk) — 리터럴 "실점"이 아님. buildEventLogRows와 동일 소스.
        rows.push({ gameDate, matchId: String(matchNum), opponent: match.opponent, scorer: "", assist: "", conceded: e.currentGk || "", ownGoalPlayer: "", inputTime });
      }
    }
  }
  return rows;
}

/**
 * 선수별집계기록로그 시트용 로우 데이터 빌드
 */
export function buildPlayerLogRows(soccerMatches, gameDate, inputTime) {
  const stats = calcSoccerPlayerStats(soccerMatches);
  return Object.entries(stats).map(([name, s]) => ({
    gameDate, name,
    games: s.games, fieldGames: s.fieldGames, keeperGames: s.keeperGames,
    goals: s.goals, assists: s.assists, cleanSheets: s.cleanSheets,
    conceded: s.conceded, owngoals: s.owngoals,
    inputTime,
  }));
}

// 한 매치 이벤트에서 선수 이름 from→to를 모든 이름 필드에 걸쳐 치환(라인업 정정 시 b→a 이관).
// 순수 — 입력 불변, 새 배열 반환.
export function remapPlayerInSoccerEvents(events, from, to) {
  if (!Array.isArray(events) || from === to) return events || [];
  const r = (v) => (v === from ? to : v);
  return events.map(e => {
    switch (e.type) {
      case "goal": return { ...e, player: r(e.player), assist: r(e.assist) };
      case "owngoal":
      case "redCard":
      case "yellowCard": return { ...e, player: r(e.player) };
      case "opponentGoal": return { ...e, currentGk: r(e.currentGk) };
      case "sub":
      case "gkChange": return { ...e, playerIn: r(e.playerIn), playerOut: r(e.playerOut) };
      default: return e;
    }
  });
}
