// 아카이브(히스토리) '선수별 기록'의 데이터 소스.
//
// 이 표는 원래 Firebase 에 저장된 원본 state(이벤트·매치·팀편성)에서 점수를 다시
// 계산했다. 그 재계산기가 App.jsx 의 진짜 집계(calcPlayerPoints)와 조용히 어긋나
// 두 가지가 빠져 있었다:
//   1) 황금크로바/탄고구마 배율 — 아카이브는 무조건 crovaPoint/gogumaPoint 만 썼다.
//      (2026-11-05 우창호 황금크로바 건에서 드러남. 정상 적용됐던 07-30·09-03
//       탄고구마도 -1 로 잘못 보였다.)
//   2) 반칙 감점(foulPoint) — 총점에서 통째로 누락.
//
// 그래서 아카이브는 계산하지 않고 로그_선수경기(진실 소스)의 그 경기일 행을 읽는다.
// 규칙이 또 바뀌어도 이 화면이 따로 틀어질 일이 없다. 그 날짜 행이 없으면
// (컵 세션·레거시·시트 조회 실패) 기존 재계산 결과를 그대로 쓴다.

/** 날짜 비슷한 값을 로컬 기준 'YYYY-MM-DD' 로. UTC 파싱으로 하루 밀리는 것을 막는다. */
export function ymdOf(v) {
  if (v == null) return "";
  if (v instanceof Date) {
    if (isNaN(v.getTime())) return "";
    return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, "0")}-${String(v.getDate()).padStart(2, "0")}`;
  }
  const s = String(v).trim();
  // 'YYYY-MM-DD' 로 시작하면 Date 를 거치지 않는다 — new Date('2026-11-05') 는 UTC 자정이라
  // KST 보다 이른 타임존에서 전날로 밀린다.
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  const d = new Date(s);
  return isNaN(d.getTime()) ? s : ymdOf(d);
}

const num = (v) => Number(v) || 0;

/**
 * 재계산 폴백 행에 로그_선수경기의 그 경기일 값을 덮어쓴다.
 *
 * @param {Array} fallbackRows - 원본 state 재계산 결과(현행 calcPlayerStats 출력)
 * @param {Array|null} logRows - 로그_선수경기 전체 행(SheetCache playerGameLog)
 * @param {*} gameDate - 그 세션의 경기일
 * @param {{ownGoalPoint:number, foulPoint?:number}} es - 세션 규칙 스냅샷
 * @returns {Array} 총점 내림차순 정렬된 선수별 행
 */
export function mergeArchivePlayerRows(fallbackRows, logRows, gameDate, es) {
  const base = fallbackRows || [];
  const ymd = ymdOf(gameDate);
  if (!ymd || !Array.isArray(logRows)) return base;

  const { ownGoalPoint, foulPoint = -1 } = es || {};
  const byName = new Map();
  for (const r of logRows) {
    if (ymdOf(r?.date) !== ymd) continue;
    const name = String(r.player || "").trim();
    if (!name || byName.has(name)) continue;   // 중복 행은 첫 행 우선
    const goals = num(r.goals), assists = num(r.assists), owngoals = num(r.owngoals);
    const fouls = num(r.fouls), cleanSheets = num(r.cleansheets);
    const crova = num(r.crova), goguma = num(r.goguma);
    byName.set(name, {
      name, team: String(r.session_team || "").trim(),
      goals, assists, owngoals, fouls, cleanSheets, crova, goguma,
      conceded: num(r.conceded), keeperGames: num(r.keeper_games),
      total: goals + assists + owngoals * num(ownGoalPoint) + fouls * num(foulPoint)
             + cleanSheets + crova + goguma,
    });
  }
  if (byName.size === 0) return base;

  const seen = new Set();
  const out = [];
  for (const row of base) {
    const hit = byName.get(row.name);
    // 시트 행에 session_team 이 비어 있으면(레거시) 재계산 쪽 팀명을 남긴다.
    out.push(hit ? { ...row, ...hit, team: hit.team || row.team } : row);
    seen.add(row.name);
  }
  for (const [name, row] of byName) if (!seen.has(name)) out.push(row);

  return out.sort((a, b) => (b.total - a.total) || (b.goals - a.goals) || (b.assists - a.assists));
}
