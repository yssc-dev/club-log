// 테니스 스코어 상태 전이. React/DOM 의존 없음.
//
// 세트 모델: { a, b, tbA, tbB, done }
//   - a/b   : 게임 수
//   - tbA/tbB: 타이브레이크 포인트 (5:5 도달 후에만 쌓인다)
//   - done  : 세트 종료 여부
//
// 규칙(클럽 커스텀): 6게임 선취. 5:5가 되면 노애드 타이브레이크 7점 선취.
// 타이브레이크 승자가 6번째 게임을 가져가므로 최종 세트 스코어는 6:5가 된다.
// 6:5는 타이브레이크로만 나온다 — 5:4에서 다음 게임은 6:4 아니면 5:5이기 때문.

const GAMES_TO_WIN_SET = 6;
const TIEBREAK_POINTS_TO_WIN = 7;

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

export function incrementGame(set, side) {
  if (!set || set.done || isSetComplete(set)) return set;
  if (isTiebreakActive(set)) return set; // 타이브레이크 중엔 포인트만 센다
  const key = side === 'A' ? 'a' : 'b';
  return { ...set, [key]: (set[key] || 0) + 1 };
}

export function incrementTiebreakPoint(set, side) {
  if (!set || set.done || !isTiebreakActive(set)) return set;
  const key = side === 'A' ? 'tbA' : 'tbB';
  const next = { ...set, [key]: (set[key] || 0) + 1 };
  if (next[key] >= TIEBREAK_POINTS_TO_WIN) {
    // 승자가 6번째 게임을 가져간다 → 6:5
    if (side === 'A') next.a = GAMES_TO_WIN_SET;
    else next.b = GAMES_TO_WIN_SET;
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
