// src/services/__tests__/sheetService.cupAttendance.test.js
// 컵 참석 시트(전용 탭) CSV 파싱 — 1행 머리글(팀명), 아래 행 참석자 이름. 숫자·빈 칸 무시, 열별 중복 제거.
import { describe, it, expect } from 'vitest';
import { parseCupAttendanceGrid } from '../sheetService.js';

describe('parseCupAttendanceGrid', () => {
  it('1행을 머리글로, 각 열 아래 이름을 모은다(빈 칸·숫자 무시, 열별 중복 제거)', () => {
    const csv = [
      '팀광땡,팀리즈,팀나와,팀국뽕',
      '최성광,조정,나민혁,이강국',
      '강민석,,김의선,',
      '최성광,김성태,,3',
      ',,,',
    ].join('\n');
    const { columns } = parseCupAttendanceGrid(csv);
    expect(columns).toEqual([
      { header: '팀광땡', names: ['최성광', '강민석'] },
      { header: '팀리즈', names: ['조정', '김성태'] },
      { header: '팀나와', names: ['나민혁', '김의선'] },
      { header: '팀국뽕', names: ['이강국'] },
    ]);
  });
  it('따옴표·★ 장식·앞뒤 공백을 정리하고, 머리글 없는 열의 이름도 머리글 빈 문자열로 모은다', () => {
    const csv = [
      '"팀광땡",, 메모',
      '"최성광 ★",홍길동,기타',
    ].join('\n');
    const { columns } = parseCupAttendanceGrid(csv);
    expect(columns).toEqual([
      { header: '팀광땡', names: ['최성광'] },
      { header: '', names: ['홍길동'] },
      { header: '메모', names: ['기타'] },
    ]);
  });
  it('맨 앞 빈 행은 건너뛰고 첫 비어 있지 않은 행을 머리글로 본다', () => {
    const csv = ['', ',,', '팀광땡,팀리즈', '최성광,조정'].join('\n');
    const { columns } = parseCupAttendanceGrid(csv);
    expect(columns.map(c => c.header)).toEqual(['팀광땡', '팀리즈']);
    expect(columns[0].names).toEqual(['최성광']);
  });
  it('내용이 없으면 빈 columns', () => {
    expect(parseCupAttendanceGrid('')).toEqual({ columns: [] });
    expect(parseCupAttendanceGrid('\n,,\n')).toEqual({ columns: [] });
  });
});
