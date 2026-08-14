import { describe, it, expect } from 'vitest';
import { calcOpponentBreakdown } from '../calcOpponentBreakdown';

// 주 지표(골·어시·경기수·승패·경기당포인트)는 앱 기록 구간만.
// 앱 이전(legacy) 명단은 골 이벤트 역산 부분명단이라 분모로 쓸 수 없다.
// 통산 골·어시만 careerGoals/careerAssists로 따로 남겨 화면이 차이를 밝힐 수 있게 한다.
describe('calcOpponentBreakdown', () => {
  it('returns empty for no logs', () => {
    const r = calcOpponentBreakdown({ eventLogs: [], matchLogs: [] });
    expect(r.players).toEqual([]);
    expect(r.byPlayer).toEqual({});
  });

  it('골·어시는 이벤트에서, 상대명은 로그_매치 조인으로 귀속', () => {
    const matchLogs = [
      { date: '2026-06-10', match_id: 1, opponent_team_name: '터틀파크', game_id: 's_1', our_members_json: '["A","B"]', our_score: 2, opponent_score: 0 },
    ];
    const eventLogs = [
      { date: '2026-06-10', match_id: 1, event_type: 'goal', player: 'A', related_player: 'B', opponent: '터틀' }, // 이벤트쪽 옛 표기 → 매치 조인이 이김
      { date: '2026-06-10', match_id: 1, event_type: 'goal', player: 'A', related_player: '', opponent: '터틀' },
    ];
    const r = calcOpponentBreakdown({ eventLogs, matchLogs });
    const a = r.byPlayer['A'].find(x => x.opponent === '터틀파크');
    expect(a.goals).toBe(2); // 동일 내용 골 2행 dedupe 금지
    expect(r.byPlayer['B'].find(x => x.opponent === '터틀파크').assists).toBe(1);
  });

  it('앱 이전 경기는 주 지표에서 빠지고 통산에만 남는다', () => {
    const matchLogs = [
      { date: '2026-01-06', match_id: 1, opponent_team_name: '한울', game_id: 'legacy_2026-01-06_하버FC', our_members_json: '["A","B"]', our_score: 3, opponent_score: 1 },
      { date: '2026-06-10', match_id: 1, opponent_team_name: '한울', game_id: 's_2', our_members_json: '["A","B"]', our_score: 0, opponent_score: 1 },
    ];
    const eventLogs = [
      { date: '2026-01-06', match_id: 1, event_type: 'goal', player: 'A', related_player: 'B' }, // 앱 이전
      { date: '2026-06-10', match_id: 1, event_type: 'goal', player: 'A', related_player: 'B' }, // 앱 구간
    ];
    const r = calcOpponentBreakdown({ eventLogs, matchLogs });
    const a = r.byPlayer['A'].find(x => x.opponent === '한울');
    expect(a.goals).toBe(1);        // 주 지표 = 앱 구간만
    expect(a.careerGoals).toBe(2);  // 통산 = 전 기간
    expect(a.games).toBe(1);        // 앱 이전 경기는 경기수에서 제외
    expect(a.losses).toBe(1);
    expect(a.wins).toBe(0);         // 앱 이전 3:1 승은 안 잡힘
    expect(a.pointsPerGame).toBeCloseTo(1); // 1골 / 1경기 — 분자·분모 같은 구간

    const b = r.byPlayer['B'].find(x => x.opponent === '한울');
    expect(b.assists).toBe(1);
    expect(b.careerAssists).toBe(2);
  });

  it('앱 이전에만 뛴 선수는 통산만 남고 경기당 포인트는 null', () => {
    const matchLogs = [
      { date: '2026-01-06', match_id: 1, opponent_team_name: '한울', game_id: 'legacy_x', our_members_json: '["L"]', our_score: 3, opponent_score: 1 },
    ];
    const eventLogs = [{ date: '2026-01-06', match_id: 1, event_type: 'goal', player: 'L', related_player: '' }];
    const r = calcOpponentBreakdown({ eventLogs, matchLogs });
    const l = r.byPlayer['L'].find(x => x.opponent === '한울');
    expect(l.games).toBe(0);
    expect(l.goals).toBe(0);
    expect(l.careerGoals).toBe(1);
    expect(l.pointsPerGame).toBeNull(); // 0으로 찍으면 '기록 없음'과 구분되지 않는다
  });

  it('is_extra 매치는 경기수·이벤트·통산 모두 제외', () => {
    const matchLogs = [
      { date: '2026-06-10', match_id: 1, opponent_team_name: '한울', game_id: 's_1', our_members_json: '["A"]', our_score: 1, opponent_score: 0, is_extra: true },
      { date: '2026-06-10', match_id: 3, opponent_team_name: '휴식', game_id: 's_1', our_members_json: '[]', our_score: 0, opponent_score: 0 },
    ];
    const eventLogs = [
      { date: '2026-06-10', match_id: 1, event_type: 'goal', player: 'A', related_player: '', opponent: '한울' },
    ];
    const r = calcOpponentBreakdown({ eventLogs, matchLogs });
    expect(r.byPlayer['A']).toBeUndefined();
    expect(r.players).toEqual([]);
  });

  it('골과 어시가 함께면 포인트에 둘 다 들어간다', () => {
    const matchLogs = [
      { date: '2026-06-10', match_id: 1, opponent_team_name: '한울', game_id: 's_1', our_members_json: '["A"]', our_score: 2, opponent_score: 0 },
      { date: '2026-06-17', match_id: 1, opponent_team_name: '한울', game_id: 's_2', our_members_json: '["A"]', our_score: 1, opponent_score: 0 },
    ];
    const eventLogs = [
      { date: '2026-06-10', match_id: 1, event_type: 'goal', player: 'A', related_player: '' },
      { date: '2026-06-10', match_id: 1, event_type: 'goal', player: 'X', related_player: 'A' },
      { date: '2026-06-17', match_id: 1, event_type: 'goal', player: 'A', related_player: '' },
    ];
    const r = calcOpponentBreakdown({ eventLogs, matchLogs });
    const a = r.byPlayer['A'].find(x => x.opponent === '한울');
    expect(a.goals).toBe(2);
    expect(a.assists).toBe(1);
    expect(a.pointsPerGame).toBeCloseTo(1.5); // 3P / 2경기
  });

  it('byPlayer 정렬: games desc → goals desc → 가나다', () => {
    const matchLogs = [
      { date: '2026-06-10', match_id: 1, opponent_team_name: '한울', game_id: 's_1', our_members_json: '["A"]', our_score: 1, opponent_score: 0 },
      { date: '2026-06-10', match_id: 2, opponent_team_name: '한울', game_id: 's_1', our_members_json: '["A"]', our_score: 1, opponent_score: 1 },
      { date: '2026-06-10', match_id: 3, opponent_team_name: '아이콘', game_id: 's_1', our_members_json: '["A"]', our_score: 0, opponent_score: 2 },
    ];
    const r = calcOpponentBreakdown({ eventLogs: [], matchLogs });
    expect(r.byPlayer['A'].map(x => x.opponent)).toEqual(['한울', '아이콘']);
    const 한울 = r.byPlayer['A'][0];
    expect([한울.games, 한울.wins, 한울.draws, 한울.losses]).toEqual([2, 1, 1, 0]);
  });
});
