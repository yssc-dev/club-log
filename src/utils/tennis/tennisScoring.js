// 테니스 스코어 상태 전이. React/DOM 의존 없음.
//
// 세트 모델: { a, b, tbA, tbB, done }
//   - a/b   : 게임 수
//   - tbA/tbB: 타이브레이크 포인트 (5:5 도달 후에만 쌓인다)
//   - done  : 세트 종료 여부
//
// 규칙(클럽 커스텀): 6게임 선취. 5:5가 되면 타이브레이크.
//   - 노에드7(기본, 7point): 노애드 7점 선취 → 승자 7게임 → 최종 7:5.
//   - 단판1점(1point): 단판 데스 1점 → 승자 6게임 → 최종 6:5.
// 7:5·6:5는 타이브레이크로만 나온다 — 5:4에서 다음 게임은 6:4 아니면 5:5이기 때문.
// (기존에 저장된 6:5 타이브레이크 세트는 소급 변경하지 않는다. 집계는 그대로 유효.)

const GAMES_TO_WIN_SET = 6;
export const TIEBREAK_POINTS_TO_WIN = 7;

export function emptySet() {
  return { a: 0, b: 0, tbA: 0, tbB: 0, done: false };
}

export function isSetComplete(set) {
  if (!set) return false;
  return set.a >= GAMES_TO_WIN_SET || set.b >= GAMES_TO_WIN_SET;
}

export function isTiebreakActive(set) {
  if (!set || set.done) return false;
  return set.a === 5 && set.b === 5;
}

export function setWinner(set) {
  if (!set) return null;
  if (set.a >= GAMES_TO_WIN_SET) return 'A';
  if (set.b >= GAMES_TO_WIN_SET) return 'B';
  return null;
}

export function incrementGame(set, side, rules = {}) {
  if (!set || set.done) return set;
  const key = side === 'A' ? 'a' : 'b';
  const other = side === 'A' ? 'b' : 'a';
  const oneMode = rules.tiebreakMode === '1point';

  // 이미 6게임인 쪽은 더 올릴 수 없다 (7 금지)
  if ((set[key] || 0) >= GAMES_TO_WIN_SET) return set;

  if (oneMode) {
    // 1점 데스 모드: 5:5에서도 게임 +1 허용 — 단, 6:6 금지
    const nextVal = (set[key] || 0) + 1;
    if (nextVal >= GAMES_TO_WIN_SET && (set[other] || 0) >= GAMES_TO_WIN_SET) return set;
    return { ...set, [key]: nextVal };
  }

  // 7점 모드(기본): 5:5는 타이브레이크로만 처리
  if (isTiebreakActive(set)) return set;
  // 6:5·6:6 금지 — 6:5는 타이브레이크 승자만 만들 수 있는 스코어
  const nextVal = (set[key] || 0) + 1;
  const otherVal = set[other] || 0;
  if (nextVal === GAMES_TO_WIN_SET && otherVal >= 5) return set;  // 자기가 6이 될 때 상대≥5 금지
  if (nextVal === 5 && otherVal === GAMES_TO_WIN_SET) return set; // 역방향 6:5 금지
  return { ...set, [key]: nextVal };
}

export function incrementTiebreakPoint(set, side, rules = {}) {
  if (!set || set.done || !isTiebreakActive(set)) return set;
  const key = side === 'A' ? 'tbA' : 'tbB';
  const next = { ...set, [key]: (set[key] || 0) + 1 };
  const oneMode = rules.tiebreakMode === '1point';
  const threshold = oneMode ? 1 : TIEBREAK_POINTS_TO_WIN;
  if (next[key] >= threshold) {
    // 단판1점: 승자 6게임 → 6:5.  노에드7: 승자 7게임 → 7:5.
    // (둘 다 5:5에서만 발생. 기존에 저장된 6:5 타이브레이크 세트는 그대로 유효하다.)
    const winGames = oneMode ? GAMES_TO_WIN_SET : GAMES_TO_WIN_SET + 1;
    if (side === 'A') next.a = winGames;
    else next.b = winGames;
  }
  return next;
}

export function setsNeeded(bestOf) {
  return Math.ceil((Number(bestOf) || 1) / 2);
}

export function matchWinner(sets, bestOf) {
  const need = setsNeeded(bestOf);
  let a = 0, b = 0;
  for (const s of (sets || [])) {
    const w = setWinner(s);
    if (w === 'A') a++;
    else if (w === 'B') b++;
  }
  if (a >= need) return 'A';
  if (b >= need) return 'B';
  return null;
}

export function summarizeCourt(court) {
  const sets = (court && Array.isArray(court.sets)) ? court.sets : [];
  let setsA = 0, setsB = 0, gamesA = 0, gamesB = 0;
  let tbPlayed = 0, tbWonA = 0, tbWonB = 0;
  let bagelsGivenA = 0, bagelsGivenB = 0;

  for (const s of sets) {
    gamesA += s.a || 0;
    gamesB += s.b || 0;
    const w = setWinner(s);
    if (w === 'A') setsA++;
    else if (w === 'B') setsB++;

    // 타이브레이크는 5:5를 거쳐야만 발생하므로 tb 포인트 존재로 판정한다.
    if ((s.tbA || 0) > 0 || (s.tbB || 0) > 0) {
      tbPlayed++;
      if (w === 'A') tbWonA++;
      else if (w === 'B') tbWonB++;
    }

    if (s.a === GAMES_TO_WIN_SET && s.b === 0) bagelsGivenA++;
    if (s.b === GAMES_TO_WIN_SET && s.a === 0) bagelsGivenB++;
  }

  return {
    setsA, setsB, gamesA, gamesB,
    winner: matchWinner(sets, court && court.bestOf),
    tbPlayed, tbWonA, tbWonB,
    bagelsGivenA, bagelsGivenB,
  };
}
