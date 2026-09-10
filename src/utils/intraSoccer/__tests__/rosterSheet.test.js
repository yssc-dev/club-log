import { describe, it, expect, vi, afterEach } from 'vitest';
import { parseIntraRosterCsv, fetchIntraRoster } from '../rosterSheet';

describe('parseIntraRosterCsv', () => {
  it('1행 팀 이름, 아래 참석자 — 열 순서대로 팀·참석자를 만든다', () => {
    const csv = '주황,파랑\n홍길동,김철수\n이영희,박민수\n,최지훈\n';
    const r = parseIntraRosterCsv(csv);
    expect(r.teams).toEqual([
      { name: '주황', players: ['홍길동', '이영희'] },
      { name: '파랑', players: ['김철수', '박민수', '최지훈'] },
    ]);
    expect(r.attendees).toEqual(['홍길동', '이영희', '김철수', '박민수', '최지훈']);
    expect(r.warnings).toEqual([]);
  });
  it('빈 행을 건너뛰고 첫 비어있지 않은 행을 헤더로 잡으며, 헤더가 빈 열(A열)은 무시한다', () => {
    const csv = '\n,,\n,주황,파랑\n,홍길동,김철수\n\n,이영희,\n';
    const r = parseIntraRosterCsv(csv);
    expect(r.teams.map(t => t.name)).toEqual(['주황', '파랑']);
    expect(r.teams[0].players).toEqual(['홍길동', '이영희']);
    expect(r.teams[1].players).toEqual(['김철수']);
  });
  it('따옴표·쉼표가 든 셀과 ★ 장식을 처리한다', () => {
    const csv = '"주황","파랑"\n"홍길동 ★","김, 철수"\n';
    const r = parseIntraRosterCsv(csv);
    expect(r.teams[0].players).toEqual(['홍길동']);
    expect(r.teams[1].players).toEqual(['김, 철수']);
  });
  it('같은 열 중복은 1회만, 두 열에 같은 이름은 먼저 나온 열 소속 — 둘 다 warning', () => {
    const csv = '주황,파랑\n홍길동,홍길동\n홍길동,김철수\n';
    const r = parseIntraRosterCsv(csv);
    expect(r.teams[0].players).toEqual(['홍길동']);
    expect(r.teams[1].players).toEqual(['김철수']);
    expect(r.warnings.length).toBe(2);
    expect(r.attendees).toEqual(['홍길동', '김철수']);
  });
  it('팀 열 1개도 허용(외부전 전용 날), 0개·중복 팀 이름·"휴식"은 throw', () => {
    expect(parseIntraRosterCsv('주황\n홍길동\n').teams).toHaveLength(1);
    expect(() => parseIntraRosterCsv('')).toThrow('팀 열 없음');
    expect(() => parseIntraRosterCsv('\n,,\n')).toThrow('팀 열 없음');
    expect(() => parseIntraRosterCsv('주황,주황\n')).toThrow('팀 이름 중복');
    expect(() => parseIntraRosterCsv('주황,휴식\n')).toThrow('휴식');
  });
  it('팀 3개도 열 순서대로 만든다', () => {
    const r = parseIntraRosterCsv('주황,파랑,검정\na1,b1,c1\n');
    expect(r.teams.map(t => t.name)).toEqual(['주황', '파랑', '검정']);
  });
});

describe('fetchIntraRoster', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
  it('설정의 attendanceSheet 로 CSV 를 받아 파싱한다', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, text: async () => '주황,파랑\n홍길동,김철수\n' })));
    const AuthUtil = (await import('../../../services/authUtil')).default;
    vi.spyOn(AuthUtil, 'getStored').mockReturnValue({ team: '빅마스터FC', mode: '축구' });
    const settings = await import('../../../config/settings');
    vi.spyOn(settings, 'getSettings').mockReturnValue({ sheetId: 'SHEET', attendanceSheet: '빅마스터FC 참석명단' });
    const r = await fetchIntraRoster();
    expect(r.teams.map(t => t.name)).toEqual(['주황', '파랑']);
    const url = fetch.mock.calls[0][0];
    expect(url).toContain('SHEET');
    expect(url).toContain(encodeURIComponent('빅마스터FC 참석명단'));
  });
  it('attendanceSheet 미설정이면 throw', async () => {
    const AuthUtil = (await import('../../../services/authUtil')).default;
    vi.spyOn(AuthUtil, 'getStored').mockReturnValue({ team: '빅마스터FC', mode: '축구' });
    const settings = await import('../../../config/settings');
    vi.spyOn(settings, 'getSettings').mockReturnValue({ sheetId: 'SHEET' });
    await expect(fetchIntraRoster()).rejects.toThrow('참석명단 시트 미설정');
  });
});
