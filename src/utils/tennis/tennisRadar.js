// 개인 레이더 계산기: 5축 정규화 프로파일.
// 단식/복식 승률은 0~1 직접 패스스루, 포인트·참석·에이스는 로스터 최댓값으로 0~1 정규화.
// 최댓값이 0이면 해당 축 value=0 (divide-by-zero 가드).
import { buildPlayerSummary, buildSinglesStandings } from './tennisStandings';

/**
 * @param {{ rows: object[], roster: object[], player: string, asOfDate: string }} param0
 * @returns {{ axes: Array<{key:string,label:string,value:number,raw:string}>, player: string }}
 */
export function buildPlayerRadar({ rows, roster, player, asOfDate }) {
  const safeRows = rows || [];
  const safeRoster = roster || [];
  const rosterNames = safeRoster.map(m => m?.name).filter(Boolean);
  const dateStr = asOfDate || new Date().toISOString().slice(0, 10);

  // 포인트: 단식 순위표에서 조회 (길로틴 리그 포인트)
  const standings = buildSinglesStandings({
    rows: safeRows, roster: safeRoster, asOfDate: dateStr, sortBy: 'points',
  });
  const pointsByName = new Map(standings.map(s => [s.name, s.points ?? 0]));

  // 로스터 전원 요약 계산
  const summaryOf = (name) => buildPlayerSummary({ rows: safeRows, player: name });
  const rosterSummaries = rosterNames.map(n => summaryOf(n));

  // 축별 로스터 최댓값 (정규화용)
  const maxOf = (fn) => rosterSummaries.reduce((mx, s) => Math.max(mx, fn(s)), 0);
  const maxPoints = standings.reduce((mx, s) => Math.max(mx, s.points ?? 0), 0);
  const maxAttendance = maxOf(s => s.attendanceDates);
  const maxAces = maxOf(s => s.aces);

  // 선수 본인 요약
  const me = summaryOf(player);
  const myPoints = pointsByName.get(player) ?? 0;

  // 정규화 헬퍼 — max=0이면 0 반환
  const norm = (val, max) => (max > 0 ? Math.min(1, val / max) : 0);

  const axes = [
    {
      key: 'singlesRate',
      label: '단식승률',
      value: me.singles.rate,             // 0~1 직접 (승률 자체가 정규화된 값)
      raw: `${Math.round(me.singles.rate * 100)}%`,
    },
    {
      key: 'doublesRate',
      label: '복식승률',
      value: me.doubles.rate,             // 0~1 직접
      raw: `${Math.round(me.doubles.rate * 100)}%`,
    },
    {
      key: 'points',
      label: '포인트',
      value: norm(myPoints, maxPoints),
      raw: String(myPoints),
    },
    {
      key: 'attendance',
      label: '참석',
      value: norm(me.attendanceDates, maxAttendance),
      raw: `${me.attendanceDates}일`,
    },
    {
      key: 'aces',
      label: '에이스',
      value: norm(me.aces, maxAces),
      raw: String(me.aces),
    },
  ];

  return { axes, player };
}
