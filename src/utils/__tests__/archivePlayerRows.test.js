// 아카이브 '선수별 기록'을 로그_선수경기(진실 소스)에서 읽는다.
// 원본 state 재계산은 App.jsx 집계와 조용히 어긋났다 — 황금크로바/탄고구마 배율과
// 반칙 감점이 빠져 있었다(2026-11-06 우창호 황금크로바 건).
import { describe, it, expect } from 'vitest';
import { mergeArchivePlayerRows } from '../archivePlayerRows';

const ES = { ownGoalPoint: -2, foulPoint: -1 };
// 재계산 폴백 행(현행 calcPlayerStats 출력 모양)
const fb = (name, over = {}) => ({
  name, team: '팀필선', goals: 0, assists: 0, owngoals: 0, conceded: 0,
  keeperGames: 0, cleanSheets: 0, crova: 2, goguma: 0, total: 2, ...over,
});
// 로그_선수경기 행
const log = (player, over = {}) => ({
  date: '2026-11-05', player, session_team: '팀필선',
  goals: 0, assists: 0, owngoals: 0, fouls: 0, conceded: 0, cleansheets: 0,
  crova: 4, goguma: 0, ...over,
});

describe('mergeArchivePlayerRows', () => {
  it('시트에 기록된 크로바를 그대로 쓴다(재계산값 2를 덮어쓴다)', () => {
    const out = mergeArchivePlayerRows([fb('우창호')], [log('우창호')], '2026-11-05', ES);
    expect(out[0].crova).toBe(4);
  });

  it('총점 = 골+어시+자책×자책점수+반칙×반칙점수+클린+크로바+고구마', () => {
    const rows = [log('우창호', { goals: 1, assists: 2, owngoals: 1, fouls: 1, cleansheets: 2, crova: 4 })];
    const out = mergeArchivePlayerRows([fb('우창호')], rows, '2026-11-05', ES);
    // 1 + 2 + (1×-2) + (1×-1) + 2 + 4 = 6
    expect(out[0].total).toBe(6);
  });

  it('고구마(음수 포인트)도 시트 값 그대로 — 탄고구마 -2 가 -2 로 나온다', () => {
    const out = mergeArchivePlayerRows(
      [fb('정동근', { crova: 0, goguma: -1, total: -1 })],
      [log('정동근', { crova: 0, goguma: -2, session_team: '팀동근' })],
      '2026-11-05', ES);
    expect(out[0].goguma).toBe(-2);
    expect(out[0].team).toBe('팀동근');
  });

  it('그 경기일 행이 하나도 없으면 폴백 행을 그대로 돌려준다', () => {
    const fallback = [fb('우창호')];
    expect(mergeArchivePlayerRows(fallback, [log('우창호', { date: '2026-10-29' })], '2026-11-05', ES))
      .toEqual(fallback);
    expect(mergeArchivePlayerRows(fallback, null, '2026-11-05', ES)).toEqual(fallback);
  });

  it('시트 행이 없는 참석자는 폴백 행을 유지한다', () => {
    const out = mergeArchivePlayerRows(
      [fb('우창호'), fb('결석킴', { crova: 0, total: 0 })],
      [log('우창호')], '2026-11-05', ES);
    expect(out.map(r => r.name).sort()).toEqual(['결석킴', '우창호']);
    expect(out.find(r => r.name === '결석킴').crova).toBe(0);
  });

  it('참석자 목록에 없는 시트 행도 포함한다(용병 등 누락 방지)', () => {
    const out = mergeArchivePlayerRows([fb('우창호')], [log('우창호'), log('용병손')], '2026-11-05', ES);
    expect(out.map(r => r.name)).toContain('용병손');
  });

  it('총점 내림차순 → 골 → 어시 순으로 정렬한다', () => {
    const rows = [log('A', { goals: 1, crova: 0 }), log('B', { goals: 3, crova: 0 }), log('C', { assists: 1, goals: 1, crova: 0 })];
    const out = mergeArchivePlayerRows([], rows, '2026-11-05', ES);
    expect(out.map(r => r.name)).toEqual(['B', 'C', 'A']);
  });

  it('경기일이 Date 객체나 ISO 문자열이어도 같은 날로 맞춘다', () => {
    const rows = [log('우창호')];
    for (const d of [new Date(2026, 10, 5), '2026-11-05T09:00:00+09:00', '2026-11-05']) {
      expect(mergeArchivePlayerRows([fb('우창호')], rows, d, ES)[0].crova, String(d)).toBe(4);
    }
  });

  it('같은 선수 중복 행은 첫 행만 쓴다', () => {
    const out = mergeArchivePlayerRows([fb('우창호')], [log('우창호'), log('우창호', { crova: 99 })], '2026-11-05', ES);
    expect(out[0].crova).toBe(4);
  });
});
