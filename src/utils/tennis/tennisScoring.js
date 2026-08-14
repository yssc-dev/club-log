// 테니스 스코어 상태 전이. React/DOM 의존 없음.
//
// 세트 모델: { a, b, tbA, tbB, done }
//   - a/b   : 게임 수
//   - tbA/tbB: 타이브레이크 포인트 (5:5 도달 후에만 쌓인다)
//   - done  : 세트 종료 여부
//
// 규칙(클럽 커스텀): 6게임 선취(예: 6:0~6:4).
//   - 노에드7(기본, 7point): 5:5가 되면 별도 미니게임 없이 게임을 계속 —
//     먼저 7게임을 선취한 쪽이 승. 6:5는 승리 아님, 6:6이면 다음 게임 딴 쪽이 7:6/6:7로 승(win-by-1).
//     가능 스코어: 6:0~6:4, 7:5, 7:6, 6:7, 5:7.
//   - 단판1점(1point): 5:5가 되면 단판 데스 1게임으로 결정 → 6:5. (6:6 금지)
// (기존에 저장된 6:5 타이브레이크 세트(tbA/tbB)는 소급 변경하지 않는다. 집계는 그대로 유효.
//  타이브레이크 미니게임은 폐지 — isTiebreakActive/incrementTiebreakPoint는 레거시 데이터·미사용.)

const GAMES_TO_WIN_SET = 6;
export const TIEBREAK_POINTS_TO_WIN = 7; // 레거시(폐지된 타이브레이크). 남겨둔 상수.

export function emptySet() {
  return { a: 0, b: 0, tbA: 0, tbB: 0, done: false };
}

// 세트 완료 판정(모드별).
//   노에드7: 6게임 & 2게임차, 또는 7게임 도달(7:5·7:6). → 6:5·6:6은 미완료(계속).
//   그 외(단판1점·기본): 6게임 도달이면 완료(6:5 포함).
export function isSetComplete(set, rules = {}) {
  if (!set) return false;
  const a = set.a || 0, b = set.b || 0;
  const max = Math.max(a, b), diff = Math.abs(a - b);
  if (rules.tiebreakMode === '7point') {
    return max >= GAMES_TO_WIN_SET + 1 || (max >= GAMES_TO_WIN_SET && diff >= 2);
  }
  return max >= GAMES_TO_WIN_SET;
}

// 레거시: 폐지된 타이브레이크 판정(리듀서 dead path만 참조). 신규 경기에선 발동 안 함.
export function isTiebreakActive(set) {
  if (!set || set.done) return false;
  return set.a === 5 && set.b === 5;
}

// 완료된(또는 저장된 종료) 세트의 승자 = 게임 많은 쪽. 6:7·5:7 같은 역전 스코어도 정확.
export function setWinner(set) {
  if (!set) return null;
  const a = set.a || 0, b = set.b || 0;
  if (Math.max(a, b) < GAMES_TO_WIN_SET) return null;
  if (a === b) return null;   // 6:6 등 동점(진행중)은 승자 없음 — 노에드7에서 발생
  return a > b ? 'A' : 'B';
}

export function incrementGame(set, side, rules = {}) {
  if (!set || set.done) return set;
  if (isSetComplete(set, rules)) return set;   // 이미 끝난 세트는 못 올린다
  const key = side === 'A' ? 'a' : 'b';
  const other = side === 'A' ? 'b' : 'a';
  const next = (set[key] || 0) + 1;

  if (rules.tiebreakMode === '7point') {
    // 노에드7: 최대 7게임(6:5·6:6·7:6 허용, 8 금지). 완료 판정은 isSetComplete가 담당.
    if (next > GAMES_TO_WIN_SET + 1) return set;
    return { ...set, [key]: next };
  }
  // 단판1점 & 기본: 6게임까지. 6:6 금지(5:5→6:5 단판).
  if (next > GAMES_TO_WIN_SET) return set;
  if (next === GAMES_TO_WIN_SET && (set[other] || 0) >= GAMES_TO_WIN_SET) return set;
  return { ...set, [key]: next };
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
    const w = s && s.done === false ? null : setWinner(s);   // 진행중(라이브) 세트는 승자로 세지 않음
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
    const w = s.done === false ? null : setWinner(s);   // 진행중(라이브) 세트는 세트 승으로 세지 않음
    if (w === 'A') setsA++;
    else if (w === 'B') setsB++;

    // 타이브레이크는 폐지 — 신규 경기엔 tbPlayed=0. 과거 데이터의 tbA/tbB(6:5 등)만 집계.
    // (5:5를 거쳐야만 발생하므로 tb 포인트 존재로 판정)
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
