import { describe, it, expect } from 'vitest';
import { teamAbsentList, pruneAbsentPlayer } from '../absentees';

describe('teamAbsentList — 팀 명단 교집합', () => {
  it('그 팀 명단에 있는 휴식자만 반환', () => {
    const absentees = { R1_C1: { 2: ['남인진'], 3: ['조정'] } };
    expect(teamAbsentList(absentees, 'R1_C1', 2, ['남인진', '김영중'])).toEqual(['남인진']);
  });

  it('명단에 없는 이름(유령 레코드)은 제외', () => {
    // 2026-08-13 마스터FC R1_C1 실제 상태: 이영문은 팀관수(3) 용병인데 휴식은 팀동규(2)에 박혀있음
    const absentees = { R1_C1: { 2: ['이영문'], 3: ['조정'] } };
    const 팀동규 = ['이동규', '노필선', '조경준', '남인진', '김영중', '배민철', '조정'];
    const 팀관수 = ['신관수', '김의선', '제갈종주', '윤대운', '김진수', '황세원', '이영문'];
    expect(teamAbsentList(absentees, 'R1_C1', 2, 팀동규)).toEqual([]);
    expect(teamAbsentList(absentees, 'R1_C1', 3, 팀관수)).toEqual([]);
  });

  it('RTDB 배열 coercion 형태({0:..,1:..}가 배열로 옴)도 동일하게 처리', () => {
    const absentees = { R1_C1: [null, null, ['이영문'], ['조정']] };
    expect(teamAbsentList(absentees, 'R1_C1', 3, ['조정', '신관수'])).toEqual(['조정']);
  });

  it('없는 매치/팀/빈 입력은 빈 배열', () => {
    expect(teamAbsentList(undefined, 'R1_C1', 2, ['A'])).toEqual([]);
    expect(teamAbsentList({}, 'R1_C1', 2, ['A'])).toEqual([]);
    expect(teamAbsentList({ R1_C1: {} }, 'R1_C1', 2, ['A'])).toEqual([]);
  });

  it('players 미지정이면 저장값 그대로(필터 없음)', () => {
    expect(teamAbsentList({ R1_C1: { 2: ['A'] } }, 'R1_C1', 2)).toEqual(['A']);
  });
});

describe('pruneAbsentPlayer — 선수가 팀/매치를 떠날 때 휴식 기록 정리', () => {
  it('onlyMatchId: 해당 매치의 모든 팀에서 제거', () => {
    const before = { R1_C0: { 0: ['이영문'] }, R1_C1: { 2: ['이영문'], 3: ['조정'] } };
    const after = pruneAbsentPlayer(before, '이영문', { onlyMatchId: 'R1_C1' });
    expect(after.R1_C1).toEqual({ 3: ['조정'] });
    expect(after.R1_C0).toEqual({ 0: ['이영문'] }); // 다른 매치는 손대지 않음
  });

  it('keep: 지정한 (matchId, teamIdx) 만 남기고 나머지 전부 제거', () => {
    const before = { R1_C1: { 2: ['이영문'], 3: ['이영문', '조정'] }, R3_C0: { 4: ['이영문'] } };
    const after = pruneAbsentPlayer(before, '이영문', { keep: { matchId: 'R1_C1', teamIdx: 3 } });
    expect(after.R1_C1).toEqual({ 3: ['이영문', '조정'] });
    expect(after.R3_C0).toBeUndefined();
  });

  it('비게 된 팀/매치 키는 삭제', () => {
    const before = { R1_C1: { 2: ['이영문'] } };
    expect(pruneAbsentPlayer(before, '이영문', { onlyMatchId: 'R1_C1' })).toEqual({});
  });

  it('변경 없으면 원본 객체를 그대로 반환(불필요한 리렌더/동기화 방지)', () => {
    const before = { R1_C1: { 2: ['조정'] } };
    expect(pruneAbsentPlayer(before, '이영문', { onlyMatchId: 'R1_C1' })).toBe(before);
  });

  it('원본을 변형하지 않음', () => {
    const before = { R1_C1: { 2: ['이영문', '남인진'] } };
    pruneAbsentPlayer(before, '이영문', { onlyMatchId: 'R1_C1' });
    expect(before).toEqual({ R1_C1: { 2: ['이영문', '남인진'] } });
  });

  it('RTDB 배열 coercion 형태도 처리', () => {
    const before = { R1_C1: [null, null, ['이영문'], ['조정']] };
    const after = pruneAbsentPlayer(before, '이영문', { onlyMatchId: 'R1_C1' });
    expect(after.R1_C1[3]).toEqual(['조정']);
    expect(after.R1_C1[2]).toBeUndefined();
  });
});
