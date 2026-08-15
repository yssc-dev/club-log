// 개인 레이더 계산기: 5축 백분위(회원 대비 순위) 프로파일.
// 각 축 value = 이 선수가 회원 모집단에서 차지하는 백분위(0~1). 오각형 모양이 '상대 순위'를 뜻함.
// - 승률 축(단식/복식/TB): 소표본 왜곡 방지로 해당 종목 MIN_RATE_GAMES경기↑ 회원만 모집단.
// - 카운트 축(포인트/참석): 전 회원 모집단.
// raw 라벨은 실제값 그대로(100%·7·111일) — 모양만 상대화.
import { buildPlayerSummary, buildSinglesStandings } from './tennisStandings';

export const MIN_RATE_GAMES = 3; // 승률 축 모집단 최소 경기수

// v의 백분위(0~1): 모집단 중 v보다 낮은 수 + 동점 절반, N으로 나눔. 빈 모집단이면 0.
// 전원 0(무데이터)이고 본인도 0이면 0 반환 — 동점-0을 0.5로 채우는 오해 방지.
export function percentileRank(v, population) {
  const pop = population || [];
  if (!pop.length) return 0;
  let below = 0, equal = 0, allZero = true;
  for (const p of pop) {
    if (p !== 0) allZero = false;
    if (p < v) below++;
    else if (p === v) equal++;
  }
  if (allZero && v === 0) return 0;
  return (below + 0.5 * equal) / pop.length;
}

/**
 * @param {{ rows: object[], roster: object[], player: string, asOfDate: string, seedOrder?: string[] }} param0
 * @returns {{ axes: Array<{key:string,label:string,value:number,raw:string}>, player: string }}
 */
export function buildPlayerRadar({ rows, roster, player, asOfDate, seedOrder = [] }) {
  const safeRows = rows || [];
  const safeRoster = roster || [];
  const rosterNames = safeRoster.map(m => m?.name).filter(Boolean);
  const dateStr = asOfDate || new Date().toISOString().slice(0, 10);

  // 포인트: 단식 순위표(길로틴 리그 포인트). seedOrder로 시즌초 시드 일관 유지.
  const standings = buildSinglesStandings({
    rows: safeRows, roster: safeRoster, asOfDate: dateStr, sortBy: 'points', seedOrder,
  });
  const pointsByName = new Map(standings.map(s => [s.name, s.points ?? 0]));

  // 로스터 전원 요약 (모집단 계산용)
  const summaries = new Map(rosterNames.map(n => [n, buildPlayerSummary({ rows: safeRows, player: n })]));
  const summaryList = [...summaries.values()];
  const tbRateOf = (s) => (s.tbPlayed > 0 ? s.tbWon / s.tbPlayed : 0);

  // 선수 본인 (로스터 밖이면 별도 계산)
  const me = summaries.get(player) || buildPlayerSummary({ rows: safeRows, player });
  const myPoints = pointsByName.get(player) ?? 0;
  const myTbRate = tbRateOf(me);

  // 모집단
  const ratePop = (pick) => summaryList.filter(s => pick(s).games >= MIN_RATE_GAMES).map(s => pick(s).rate);
  const tbPop = summaryList.filter(s => (s.tbPlayed || 0) >= MIN_RATE_GAMES).map(tbRateOf);
  const pointsPop = rosterNames.map(n => pointsByName.get(n) ?? 0);
  const attPop = summaryList.map(s => s.attendanceDates);

  const axes = [
    {
      key: 'singlesRate',
      label: '단식승률',
      value: percentileRank(me.singles.rate, ratePop(s => s.singles)),
      raw: `${Math.round(me.singles.rate * 100)}%`,
    },
    {
      key: 'doublesRate',
      label: '복식승률',
      value: percentileRank(me.doubles.rate, ratePop(s => s.doubles)),
      raw: `${Math.round(me.doubles.rate * 100)}%`,
    },
    {
      key: 'tbRate',
      label: 'TB승률',
      value: percentileRank(myTbRate, tbPop),
      raw: `${Math.round(myTbRate * 100)}%`,
    },
    {
      key: 'points',
      label: '포인트',
      value: percentileRank(myPoints, pointsPop),
      raw: String(myPoints),
    },
    {
      key: 'attendance',
      label: '참석',
      value: percentileRank(me.attendanceDates, attPop),
      raw: `${me.attendanceDates}일`,
    },
  ];

  return { axes, player };
}
