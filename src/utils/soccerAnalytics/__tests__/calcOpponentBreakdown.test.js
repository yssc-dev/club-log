import { describe, it, expect } from 'vitest';
import { calcOpponentBreakdown } from '../calcOpponentBreakdown';

// 집계 정책: 분자 = 로그의 모든 골·어시, 분모 = 앱 이전 + 현행 출전횟수 전부.
// 앱 이전 명단은 골 이벤트 역산 부분명단이라 출전이 실제보다 적게 잡히지만,
// 그건 감안하고 한계를 화면 상단에 표기한다(분자만 전 기간으로 두는 편향은 피한다).
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

  it('앱 이전 경기도 골·어시와 경기수·승패에 함께 들어간다', () => {
    const matchLogs = [
      { date: '2026-01-06', match_id: 1, opponent_team_name: '한울', game_id: 'legacy_2026-01-06_하버FC', our_members_json: '["A","B"]', our_score: 3, opponent_score: 1 },
      { date: '2026-06-10', match_id: 1, opponent_team_name: '한울', game_id: 's_2', our_members_json: '["A","B"]', our_score: 0, opponent_score: 1 },
    ];
    const eventLogs = [
      { date: '2026-01-06', match_id: 1, event_type: 'goal', player: 'A', related_player: 'B' }, // 앱 이전
      { date: '2026-06-10', match_id: 1, event_type: 'goal', player: 'A', related_player: 'B' }, // 현행
    ];
    const r = calcOpponentBreakdown({ eventLogs, matchLogs });
    const a = r.byPlayer['A'].find(x => x.opponent === '한울');
    expect(a.goals).toBe(2);
    expect(a.games).toBe(2);  // 앱 이전 출전도 분모에 포함
    expect(a.wins).toBe(1);   // 앱 이전 3:1 승
    expect(a.losses).toBe(1);
    expect(a.pointsPerGame).toBeCloseTo(1); // 2골 / 2경기 — 분자·분모 같은 범위

    const b = r.byPlayer['B'].find(x => x.opponent === '한울');
    expect(b.assists).toBe(2);
    expect(b.pointsPerGame).toBeCloseTo(1);
  });

  it('명단이 비어 경기수가 0이면 경기당 포인트는 null', () => {
    const matchLogs = [
      { date: '2026-01-06', match_id: 1, opponent_team_name: '한울', game_id: 'legacy_x', our_members_json: '[]', our_score: 3, opponent_score: 1 },
    ];
    const eventLogs = [{ date: '2026-01-06', match_id: 1, event_type: 'goal', player: 'L', related_player: '' }];
    const r = calcOpponentBreakdown({ eventLogs, matchLogs });
    const l = r.byPlayer['L'].find(x => x.opponent === '한울');
    expect(l.games).toBe(0);
    expect(l.goals).toBe(1);
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

  it('공격포인트(골+어시) 총합 기준 상대팀별 순위와 모집단을 낸다', () => {
    const matchLogs = [
      { date: '2026-06-10', match_id: 1, opponent_team_name: '한울', game_id: 's_1', our_members_json: '["A","B","C"]', our_score: 3, opponent_score: 0 },
    ];
    const eventLogs = [
      { date: '2026-06-10', match_id: 1, event_type: 'goal', player: 'A', related_player: 'B' },
      { date: '2026-06-10', match_id: 1, event_type: 'goal', player: 'A', related_player: '' },
      { date: '2026-06-10', match_id: 1, event_type: 'goal', player: 'B', related_player: '' },
    ];
    const r = calcOpponentBreakdown({ eventLogs, matchLogs });
    const at = (n) => r.byPlayer[n].find(x => x.opponent === '한울');
    expect(at('A').attackPoints).toBe(2); // 2골
    expect(at('B').attackPoints).toBe(2); // 1골 1어시
    expect(at('C').attackPoints).toBe(0);
    expect(at('A').attackRank).toBe(1);   // 동점 공동 1위
    expect(at('B').attackRank).toBe(1);
    expect(at('C').attackRank).toBe(3);   // 2가 아니라 3
    expect(at('A').attackPool).toBe(3);
  });

  it('순위는 상대팀별로 독립적으로 매겨진다', () => {
    const matchLogs = [
      { date: '2026-06-10', match_id: 1, opponent_team_name: '한울', game_id: 's_1', our_members_json: '["A","B"]', our_score: 1, opponent_score: 0 },
      { date: '2026-06-17', match_id: 1, opponent_team_name: '아이콘', game_id: 's_2', our_members_json: '["A","B"]', our_score: 1, opponent_score: 0 },
    ];
    const eventLogs = [
      { date: '2026-06-10', match_id: 1, event_type: 'goal', player: 'A', related_player: '' },
      { date: '2026-06-17', match_id: 1, event_type: 'goal', player: 'B', related_player: '' },
    ];
    const r = calcOpponentBreakdown({ eventLogs, matchLogs });
    expect(r.byPlayer['A'].find(x => x.opponent === '한울').attackRank).toBe(1);
    expect(r.byPlayer['A'].find(x => x.opponent === '아이콘').attackRank).toBe(2);
    expect(r.byPlayer['B'].find(x => x.opponent === '아이콘').attackRank).toBe(1);
  });

  // 차트가 '내 위아래 순위'를 그리려면 그 상대팀의 순위 정렬 전체 목록이 필요하다
  it('byOpponent로 상대팀별 순위 정렬 목록을 낸다', () => {
    const matchLogs = [
      { date: '2026-06-10', match_id: 1, opponent_team_name: '한울', game_id: 's_1', our_members_json: '["A","B","C"]', our_score: 3, opponent_score: 0 },
    ];
    const eventLogs = [
      { date: '2026-06-10', match_id: 1, event_type: 'goal', player: 'A', related_player: 'B' },
      { date: '2026-06-10', match_id: 1, event_type: 'goal', player: 'A', related_player: '' },
    ];
    const r = calcOpponentBreakdown({ eventLogs, matchLogs });
    const list = r.byOpponent['한울'];
    expect(list.map(x => x.name)).toEqual(['A', 'B', 'C']); // 2P, 1P, 0P
    expect(list.map(x => x.rank)).toEqual([1, 2, 3]);
    expect(list[0]).toMatchObject({ attackPoints: 2, goals: 2, assists: 0 });
    expect(list[1]).toMatchObject({ attackPoints: 1, goals: 0, assists: 1 });
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
