// src/utils/__tests__/cupAttendanceSheet.test.js
// 컵 참석 시트(전용 탭: 1행 팀명, 아래 참석자 이름) → 참석자/팀 반영 규칙.
// 명단에 있는 이름은 어느 열에 있든 참석, 명단 밖 이름은 열 머리글이 대회 팀명일 때만 그 팀 당일 추가.
import { describe, it, expect } from 'vitest';
import { applyCupSheetAttendance, formatCupSheetSummary } from '../cup/cupAttendanceSheet';

const teams = [['a1', 'a2', 'a3'], ['b1', 'b2'], ['c1']];
const teamNames = ['팀광땡', '팀리즈', '팀나와'];
const apply = (columns, t = teams) => applyCupSheetAttendance({ teams: t, teamNames, columns });

describe('applyCupSheetAttendance', () => {
  it('열 머리글이 팀명이면 그 열의 명단 이름은 참석, 빠진 팀원은 불참', () => {
    const r = apply([{ header: '팀광땡', names: ['a1', 'a3'] }, { header: '팀리즈', names: ['b2'] }, { header: '팀나와', names: [] }]);
    expect(r.empty).toBe(false);
    expect(r.attendees).toEqual(['a1', 'a3', 'b2']);
    expect(r.teams).toEqual(teams);                       // 명단 자체는 그대로
    expect(r.summary).toMatchObject({ present: 3, absent: ['a2', 'b1', 'c1'], guestsAdded: [], unplaced: [], unknownHeaders: [] });
  });
  it('명단 이름은 다른 팀 열에 적혀 있어도 참석으로 잡힌다(원소속 팀 유지)', () => {
    const r = apply([{ header: '팀리즈', names: ['a1', 'b1'] }]);
    expect(r.attendees).toEqual(['a1', 'b1']);
    expect(r.teams).toEqual(teams);
  });
  it('명단 밖 이름은 열 머리글이 팀명일 때 그 팀에 당일 추가된다', () => {
    const r = apply([{ header: '팀리즈', names: ['b1', '용병1'] }]);
    expect(r.teams[1]).toEqual(['b1', 'b2', '용병1']);
    expect(r.attendees).toEqual(['b1', '용병1']);
    expect(r.summary.guestsAdded).toEqual([{ name: '용병1', team: '팀리즈' }]);
  });
  it('머리글이 팀명이 아니면 명단 이름만 참석, 명단 밖 이름은 배치 못 함으로 보고', () => {
    const r = apply([{ header: '참석', names: ['a2', '모르는사람'] }]);
    expect(r.attendees).toEqual(['a2']);
    expect(r.teams).toEqual(teams);
    expect(r.summary.unplaced).toEqual(['모르는사람']);
    expect(r.summary.unknownHeaders).toEqual(['참석']);
  });
  it('머리글·이름의 공백과 ★ 장식을 정규화해 맞춘다("팀 광땡", "a1 ★")', () => {
    const r = apply([{ header: '팀 광땡', names: ['a1 ★', ' a2'] }]);
    expect(r.attendees).toEqual(['a1', 'a2']);
    expect(r.summary.unknownHeaders).toEqual([]);
  });
  it('같은 이름이 여러 열에 있어도 한 번만, 당일 추가도 한 번만', () => {
    const r = apply([{ header: '팀광땡', names: ['a1', 'a1', '게스트'] }, { header: '팀리즈', names: ['a1', '게스트'] }]);
    expect(r.attendees).toEqual(['a1', '게스트']);
    expect(r.teams[0]).toEqual(['a1', 'a2', 'a3', '게스트']);
    expect(r.teams[1]).toEqual(['b1', 'b2']);
    expect(r.summary.guestsAdded).toEqual([{ name: '게스트', team: '팀광땡' }]);
  });
  it('이미 세션 팀에 들어온 당일 추가 인원은 명단 취급(중복 추가 없음)', () => {
    const t = [['a1', 'a2', 'a3', '기존용병'], ['b1', 'b2'], ['c1']];
    const r = apply([{ header: '팀광땡', names: ['기존용병'] }], t);
    expect(r.teams).toEqual(t);
    expect(r.attendees).toEqual(['기존용병']);
    expect(r.summary.guestsAdded).toEqual([]);
  });
  it('시트에 이름이 하나도 없으면 empty', () => {
    const r = apply([{ header: '팀광땡', names: [] }, { header: '', names: [] }]);
    expect(r.empty).toBe(true);
    expect(r.attendees).toEqual([]);
  });
  it('참석자 순서는 세션 팀 순서(명단 순) 다음에 당일 추가', () => {
    const r = apply([{ header: '팀나와', names: ['c1', 'z9'] }, { header: '팀광땡', names: ['a3', 'a1'] }]);
    expect(r.attendees).toEqual(['a1', 'a3', 'c1', 'z9']);
  });
});

describe('formatCupSheetSummary', () => {
  it('참석·불참·당일 추가·배치 못 함·알 수 없는 열을 한 문단으로', () => {
    const r = apply([{ header: '팀광땡', names: ['a1', '용병1'] }, { header: '기타', names: ['모모'] }]);
    const text = formatCupSheetSummary(r, '컵참석');
    expect(text).toContain('컵참석');
    expect(text).toContain('참석 1명');
    expect(text).toContain('불참 5명');
    expect(text).toContain('당일 추가 1명: 용병1(팀광땡)');
    expect(text).toContain('배치 못 함 1명: 모모');
    expect(text).toContain("'기타'");
  });
  it('추가 항목이 없으면 그 줄은 생략', () => {
    const r = apply([{ header: '팀광땡', names: ['a1', 'a2', 'a3'] }, { header: '팀리즈', names: ['b1', 'b2'] }, { header: '팀나와', names: ['c1'] }]);
    const text = formatCupSheetSummary(r, '컵참석');
    expect(text).toContain('참석 6명');
    expect(text).toContain('불참 0명');
    expect(text).not.toContain('당일 추가');
    expect(text).not.toContain('배치 못 함');
  });
});
