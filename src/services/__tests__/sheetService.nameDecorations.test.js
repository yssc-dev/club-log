import { describe, it, expect } from 'vitest';
import { parseCSV, parseAttendanceGrid } from '../sheetService.js';

// 마스터FC 대시보드 시트는 100포인트 이상 선수 이름(D열)에 " ★"를 붙인다.
// 이 이름이 그대로 members로 들어오면 로그 기반 이름("정보영")과 별개 선수로
// 갈라져 분석 드롭다운에 "정보영 ★ (0경기)" 같은 유령 항목이 생긴다.
// → 시트에서 읽는 시점에 별표(+인접 공백)를 제거해야 한다.

describe('parseCSV (대시보드 선수 파싱) — 별표 제거', () => {
  const CSV = [
    ',,,,,',
    ',,,,,',
    'ppg,순위,등번호,이름,경기수,골',
    '4.54,28,,정보영 ★,28,59',
    '3.54,1,14,박재운,28,51',
  ].join('\n');

  it('이름의 " ★"를 제거해 로그 이름과 같은 키가 되게 한다', () => {
    const players = parseCSV(CSV);
    expect(players.map(p => p.name)).toEqual(['정보영', '박재운']);
  });
});

describe('parseAttendanceGrid (참석명단 파싱) — 별표 제거', () => {
  const CSV = [
    ',,,,,,,',
    ',,,,,1번 시드,정보영 ★,이영희',
    ',,,,,2번 시드,김진수 ★,박지성',
    ',,,,,3번 시드,★,',
  ].join('\n');

  it('참석자/팀원 이름의 별표를 제거한다', () => {
    const r = parseAttendanceGrid(CSV);
    // 수집 순서는 팀 컬럼 단위(캡틴→팀원)
    expect(r.attendees).toEqual(['정보영', '김진수', '이영희', '박지성']);
    expect(r.prebuiltTeams[0]).toEqual(['정보영', '김진수']);
  });

  it('캡틴 이름에서 파생되는 팀명도 별표 없이 생성된다 (팀보영, 팀영 ★ 아님)', () => {
    const r = parseAttendanceGrid(CSV);
    expect(r.prebuiltTeamNames).toEqual(['팀보영', '팀영희']);
  });

  it('별표만 있는 셀은 이름으로 취급하지 않는다', () => {
    const r = parseAttendanceGrid(CSV);
    expect(r.attendees).not.toContain('');
    expect(r.attendees).not.toContain('★');
  });
});

describe('parseSoccerOpponents — 별표 제거 (다른 이름 캡처 지점과 일관성)', () => {
  it('상대팀명에 별표가 붙어도 제거한다', async () => {
    const { parseSoccerOpponents } = await import('../sheetService.js');
    const csv = [
      ',,,,,,vs 상대팀명,경기',
      ',,,,,,한울 ★,31',
    ].join('\n');
    expect(parseSoccerOpponents(csv)).toEqual([{ name: '한울', games: 31 }]);
  });
});
