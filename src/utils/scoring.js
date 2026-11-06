/**
 * @typedef {Object} PlayerData
 * @property {string} name - 선수 이름
 * @property {number} point - 누적 포인트
 * @property {number} games - 경기 수
 * @property {number|null} backNum - 등번호
 * @property {number} goals - 골 수
 * @property {number} assists - 어시스트 수
 * @property {number} ownGoals - 자책골 수
 * @property {number} crova - 크로바(MVP) 횟수
 * @property {number} goguma - 고구마(꼴지) 횟수
 * @property {number} cleanSheets - 클린시트 횟수
 * @property {number} keeperGames - 키퍼 경기 수
 * @property {number} conceded - 실점 수
 * @property {number} concededRate - 실점률
 */

/**
 * @typedef {Object} GameEvent
 * @property {string} matchId - 매치 식별자 (예: "R1_C0")
 * @property {string} type - 이벤트 타입 ("goal" | "owngoal")
 * @property {string} player - 관련 선수 이름
 * @property {string|null} assist - 어시스트 선수 이름
 * @property {string} team - 이벤트 발생 팀
 * @property {string} scoringTeam - 득점 팀
 * @property {string} concedingTeam - 실점 팀
 * @property {string} concedingGk - 실점 키퍼 이름
 * @property {number} concedingGkLoss - 키퍼 실점 수 (goal: 1, owngoal: 2)
 * @property {string} homeTeam - 홈 팀명
 * @property {string} awayTeam - 어웨이 팀명
 * @property {string} [courtId] - 코트 식별자
 * @property {number} [timestamp] - 이벤트 시각
 */

/** @param {string} name @param {PlayerData[]} players @returns {number} */
export function getPlayerPoint(name, players) {
  const p = players.find(x => x.name === name);
  return p ? p.point : 0;
}

/** @param {string} name @param {PlayerData[]} players @returns {PlayerData} */
export function getPlayerData(name, players) {
  return players.find(x => x.name === name) || { name, point: 0, games: 0, backNum: null };
}

/** @param {string[]} members @param {PlayerData[]} players @returns {number} */
export function teamPower(members, players) {
  return members.reduce((sum, p) => sum + getPlayerPoint(p, players), 0);
}

/**
 * 경기 점수 계산 (자책골은 상대팀에 +2로 집계)
 * foul(옐로카드) 등 비득점 이벤트는 scoringTeam이 붙어 있어도 스코어 미반영.
 * @param {GameEvent[]} events - 전체 이벤트 배열
 * @param {string} matchId - 매치 식별자
 * @param {string} teamName - 점수를 계산할 팀명
 * @returns {number} 해당 팀의 득점
 */
export function calcMatchScore(events, matchId, teamName) {
  return events
    .filter(e => e.matchId === matchId && e.scoringTeam === teamName)
    .reduce((s, e) => s + (e.type === "goal" ? 1 : e.type === "owngoal" ? 2 : 0), 0);
}

/**
 * 시즌 누적 크로바/고구마 1위. 황금크로바(고구마 1위가 1등팀) / 탄고구마(크로바
 * 1위가 꼴찌팀) 배율의 입력이다.
 *
 * 선수별집계기록 로그의 크로바/고구마 열은 '횟수'가 아니라 이미 부호가 실린
 * 누적 포인트다 — 크로바는 양수(+2/회), 고구마는 음수(-1/회, 탄고구마 -2).
 * '1위 = 많이 받은 사람'이므로 절대값 기준으로 정렬한다(대시보드
 * CrovaGogumaRankTab 과 같은 기준). 원시값 내림차순으로 뽑으면 고구마 1위가
 * '가장 적게 받은 사람'이 되고, -1 동률자가 흔해 tie 가드에 걸려 항상 null 이 된다.
 *
 * 동률 1위는 null — 누구에게 배율을 줄지 정할 수 없으므로 보너스를 적용하지 않는다.
 *
 * @param {Record<string, number>} data - 이름 → 누적 포인트
 * @returns {string|null} 1위 선수명, 없거나 동률이면 null
 */
export function seasonLeader(data) {
  const entries = Object.entries(data || {})
    .map(([name, v]) => [name, Math.abs(Number(v) || 0)])
    .filter(([, v]) => v !== 0)
    .sort(([, a], [, b]) => b - a);
  if (entries.length === 0) return null;
  if (entries.length >= 2 && entries[0][1] === entries[1][1]) return null;
  return entries[0][0];
}
