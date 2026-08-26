// 최근 한 달 폼 TOP3 — 대시보드 최상단 카드의 계산층 (풋살).
//
// 통화는 대시보드 POINT 열과 **같은 식**이다: 골+어시+클린시트+크로바+고구마+역주행감점.
// (2026-08-26 대시보드 시트 77명 전수 대조로 확인 — rank_score는 들어가지 않는다.)
//
// 분모는 PG 행 수 = 세션 수. 대시보드 "게임당 POINT"의 GAME 열이 라운드가 아니라
// 참석 세션 수이기 때문이다 — 같은 시트에서 정보영 GAME 30 / 키퍼경기 57처럼
// 키퍼 출전이 GAME을 넘는 행이 나오므로 GAME은 라운드일 수 없다.
// 덕분에 분자·분모가 같은 행 집합에서 나와 로그_매치 명단(레거시 부분명단 구간이 있다)에
// 전혀 의존하지 않는다.
//
// 기준일은 오늘(Date.now)이 아니라 **PG의 마지막 날짜**:
//   - 휴식기 뒤에 열어도 "마지막 한 달치"가 비지 않는다 (시트의 최근 경기 일자는 오늘보다 며칠 뒤처진다)
//   - 입력이 같으면 결과가 같아 테스트가 결정적이다
// 같은 규약을 쓰는 이웃: calcRecentForm(개인분석 폼 비교 카드).
import { dynamicMin } from './dynamicMin';
import { owngoalPoints } from './calcDailyMvp';

// 동적 진입선의 하한. 창이 30일이면 풋살 세션은 4~5개뿐이라 30%는 1~2로 떨어지는데,
// 1세션 몰아치기가 상위를 독식하는 걸 막으려면 최소 2세션은 필요하다
// (누적 전체에서도 3세션 9.67pt가 22세션 5.27pt를 앞선다 — 게이트 없이는 소표본이 지배한다).
const MIN_GAMES_FLOOR = 2;

// 평소(baseline) 표본이 이보다 적으면 Δ를 내지 않는다 — 1~2세션 평균과의 비교는 노이즈다.
const BASELINE_MIN_GAMES = 3;

function shiftDays(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// 풋살: PG 1행 = 1세션. 화면에는 축구와 용어를 맞춰 '경기'로 표기하지만(풋살의 한 경기 = 한 세션),
// 계산상 단위는 세션이다. 재마감 중복 행이 있어도 분자·분모가 함께 늘어 비율은 안 흔들린다.
const gamesOf = () => 1;

const emptyBucket = () => ({
  points: 0, games: 0, goals: 0, assists: 0, cleansheets: 0,
  crova: 0, goguma: 0, owngoalPts: 0, dates: new Set(),
});

export function calcRecentHotStreak({
  playerLogs = [],
  windowDays = 30,
  topN = 3,
  minGames = null,
  baselineMinGames = BASELINE_MIN_GAMES,
} = {}) {
  const rows = (playerLogs || []).filter(
    p => p && p.player && typeof p.date === 'string' && p.date.length >= 10
  );
  if (rows.length === 0) return null;

  let anchor = '';
  for (const p of rows) if (p.date > anchor) anchor = p.date;
  const cutoff = shiftDays(anchor, -windowDays);

  const acc = {};
  const windowDates = new Set();
  for (const p of rows) {
    if (!acc[p.player]) acc[p.player] = { recent: emptyBucket(), base: emptyBucket() };
    const isRecent = p.date >= cutoff;
    if (isRecent) windowDates.add(p.date);
    const b = isRecent ? acc[p.player].recent : acc[p.player].base;
    const goals = Number(p.goals) || 0;
    const assists = Number(p.assists) || 0;
    const cleansheets = Number(p.cleansheets) || 0;
    const crova = Number(p.crova) || 0;
    const goguma = Number(p.goguma) || 0;
    const og = owngoalPoints(p.owngoals);
    b.goals += goals;
    b.assists += assists;
    b.cleansheets += cleansheets;
    b.crova += crova;
    b.goguma += goguma;
    b.owngoalPts += og;
    b.points += goals + assists + cleansheets + crova + goguma + og;
    b.games += gamesOf(p);
    b.dates.add(p.date);
  }

  const candidates = Object.entries(acc)
    .map(([player, v]) => ({ player, ...v }))
    .filter(x => x.recent.games > 0);
  if (candidates.length === 0) return null;

  const maxGames = candidates.reduce((m, x) => Math.max(m, x.recent.games), 0);
  const gate = minGames ?? Math.max(MIN_GAMES_FLOOR, dynamicMin(maxGames));

  // ppg 동률은 실데이터에서 사실상 안 생기지만 순서는 결정적이어야 한다.
  // dashboardRankComparator를 그대로 쓰지 않는 이유: 그쪽 역주행/고구마 타이브레이크는
  // 시트가 이미 음수(감점)로 주는 값을 오름차순 비교해 "역주행 많은 쪽이 앞선다".
  // 여기선 총점 → 표본 → 골 → 어시 → 이름으로 단조롭게 간다.
  const ranked = candidates
    .filter(x => x.recent.games >= gate)
    .map(x => {
      const ppg = x.recent.points / x.recent.games;
      const hasBaseline = x.base.games >= baselineMinGames;
      const basePpg = hasBaseline ? x.base.points / x.base.games : null;
      return {
        player: x.player,
        points: x.recent.points,
        games: x.recent.games,
        sessions: x.recent.dates.size,
        ppg,
        goals: x.recent.goals,
        assists: x.recent.assists,
        cleansheets: x.recent.cleansheets,
        crova: x.recent.crova,
        goguma: x.recent.goguma,
        owngoalPts: x.recent.owngoalPts,
        baseGames: x.base.games,
        baseSessions: x.base.dates.size,
        basePoints: x.base.points,
        basePpg,
        delta: hasBaseline ? ppg - basePpg : null,
        hasBaseline,
      };
    })
    .sort((a, b) =>
      b.ppg - a.ppg ||
      b.points - a.points ||
      b.games - a.games ||
      b.goals - a.goals ||
      b.assists - a.assists ||
      a.player.localeCompare(b.player, 'ko')
    )
    .slice(0, topN);

  if (ranked.length === 0) return null;
  return { anchor, cutoff, windowDays, sessions: windowDates.size, minGames: gate, rows: ranked };
}
