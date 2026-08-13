import { describe, it, expect } from 'vitest';
import { calcOpponentBreakdown } from '../calcOpponentBreakdown';

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

  it('경기수·승패는 legacy_ 백필 경기 제외, 골은 포함', () => {
    const matchLogs = [
      { date: '2026-01-06', match_id: 1, opponent_team_name: '한울', game_id: 'legacy_2026-01-06_하버FC', our_members_json: '["A"]', our_score: 3, opponent_score: 1 },
      { date: '2026-06-10', match_id: 1, opponent_team_name: '한울', game_id: 's_2', our_members_json: '["A"]', our_score: 0, opponent_score: 1 },
    ];
    const eventLogs = [
      { date: '2026-01-06', match_id: 1, event_type: 'goal', player: 'A', related_player: '', opponent: '한울' },
    ];
    const r = calcOpponentBreakdown({ eventLogs, matchLogs });
    const a = r.byPlayer['A'].find(x => x.opponent === '한울');
    expect(a.goals).toBe(1);     // legacy 경기 골도 집계
    expect(a.games).toBe(1);     // 경기수는 신뢰 명단 경기만
    expect(a.losses).toBe(1);
    expect(a.wins).toBe(0);
  });

  it('is_extra 매치는 경기수·이벤트 모두 제외, 명단 빈 경기(휴식)는 경기수 제외', () => {
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
