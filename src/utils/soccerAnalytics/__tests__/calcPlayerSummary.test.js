import { describe, it, expect } from 'vitest';
import { calcPlayerSummary } from '../calcPlayerSummary';

// matchLogs와 eventLogs 만으로 PersonalAnalysisTab의 6개 숫자를 일관되게 계산.
// playerGameLogs / gameRecordBuilder 의존성 제거가 목적.

describe('calcPlayerSummary', () => {
  it('rounds = 선수가 our/opponent members_json에 등장한 매치 수', () => {
    const matchLogs = [
      { date: '2026-01-01', match_id: 'R1_C0', our_members_json: '["A","B"]', opponent_members_json: '["C"]', our_score: 1, opponent_score: 0 },
      { date: '2026-01-01', match_id: 'R2_C0', our_members_json: '["A"]',     opponent_members_json: '["B","C"]', our_score: 0, opponent_score: 2 },
    ];
    const r = calcPlayerSummary({ matchLogs, eventLogs: [] });
    expect(r.perPlayer.A.rounds).toBe(2);
    expect(r.perPlayer.B.rounds).toBe(2);
    expect(r.perPlayer.C.rounds).toBe(2);
  });

  it('keeperRounds = our_gk / opponent_gk 카운트', () => {
    const matchLogs = [
      { match_id: 'R1_C0', our_members_json: '["A","B"]', opponent_members_json: '["C","D"]', our_gk: 'A', opponent_gk: 'C', our_score: 1, opponent_score: 1 },
      { match_id: 'R2_C0', our_members_json: '["A","B"]', opponent_members_json: '["C","D"]', our_gk: 'B', opponent_gk: 'D', our_score: 0, opponent_score: 0 },
    ];
    const r = calcPlayerSummary({ matchLogs, eventLogs: [] });
    expect(r.perPlayer.A.keeperRounds).toBe(1);
    expect(r.perPlayer.B.keeperRounds).toBe(1);
    expect(r.perPlayer.C.keeperRounds).toBe(1);
    expect(r.perPlayer.D.keeperRounds).toBe(1);
  });

  it('fieldRounds = rounds - keeperRounds', () => {
    const matchLogs = [
      { match_id: 'R1_C0', our_members_json: '["A","B"]', opponent_members_json: '["C"]', our_gk: 'A', our_score: 1, opponent_score: 0 },
      { match_id: 'R2_C0', our_members_json: '["A","B"]', opponent_members_json: '["C"]', our_gk: 'B', our_score: 1, opponent_score: 0 },
    ];
    const r = calcPlayerSummary({ matchLogs, eventLogs: [] });
    expect(r.perPlayer.A).toMatchObject({ rounds: 2, keeperRounds: 1, fieldRounds: 1 });
    expect(r.perPlayer.B).toMatchObject({ rounds: 2, keeperRounds: 1, fieldRounds: 1 });
    expect(r.perPlayer.C).toMatchObject({ rounds: 2, keeperRounds: 0, fieldRounds: 2 });
  });

  it('keeper conceded = 본인이 GK일 때 상대 득점 합', () => {
    const matchLogs = [
      { match_id: 'R1_C0', our_members_json: '["A","B"]', opponent_members_json: '["C"]', our_gk: 'A', our_score: 0, opponent_score: 3 },
      { match_id: 'R2_C0', our_members_json: '["A","B"]', opponent_members_json: '["C"]', our_gk: 'A', our_score: 1, opponent_score: 2 },
    ];
    const r = calcPlayerSummary({ matchLogs, eventLogs: [] });
    expect(r.perPlayer.A.conceded).toBe(5);
  });

  it('field 실점 = 본인이 필드 출전했을 때 우리팀이 먹은 골 합 (같은 팀 GK 입장에서 본 실점)', () => {
    const matchLogs = [
      { match_id: 'R1_C0', our_members_json: '["A","B"]', opponent_members_json: '["C"]', our_gk: 'A', our_score: 0, opponent_score: 3 },
      { match_id: 'R2_C0', our_members_json: '["A","B"]', opponent_members_json: '["C"]', our_gk: 'B', our_score: 1, opponent_score: 2 },
    ];
    const r = calcPlayerSummary({ matchLogs, eventLogs: [] });
    // A: R2에서 필드 → 2실점 / R1은 GK니까 제외
    expect(r.perPlayer.A.fieldConceded).toBe(2);
    // B: R1에서 필드 → 3실점 / R2는 GK니까 제외
    expect(r.perPlayer.B.fieldConceded).toBe(3);
  });

  it('wins/draws/losses = 자기 팀(our 또는 opponent) 결과', () => {
    const matchLogs = [
      { match_id: 'R1_C0', our_members_json: '["A"]', opponent_members_json: '["B"]', our_score: 2, opponent_score: 1 }, // A win, B loss
      { match_id: 'R2_C0', our_members_json: '["A"]', opponent_members_json: '["B"]', our_score: 1, opponent_score: 1 }, // draw
      { match_id: 'R3_C0', our_members_json: '["A"]', opponent_members_json: '["B"]', our_score: 0, opponent_score: 3 }, // A loss, B win
    ];
    const r = calcPlayerSummary({ matchLogs, eventLogs: [] });
    expect(r.perPlayer.A).toMatchObject({ matches: 3, wins: 1, draws: 1, losses: 1 });
    expect(r.perPlayer.B).toMatchObject({ matches: 3, wins: 1, draws: 1, losses: 1 });
    expect(r.perPlayer.A.winRate).toBeCloseTo((1 + 0.5) / 3);
  });

  it('goals/assists/ownGoals = eventLogs 카운트', () => {
    const eventLogs = [
      { event_type: 'goal', player: 'A', related_player: 'B' },
      { event_type: 'goal', player: 'A', related_player: '' },
      { event_type: 'goal', player: 'C', related_player: 'B' },
      { event_type: 'owngoal', player: 'A' },
    ];
    const matchLogs = [
      { match_id: 'R1_C0', our_members_json: '["A","B","C"]', opponent_members_json: '[]', our_score: 0, opponent_score: 0 },
    ];
    const r = calcPlayerSummary({ matchLogs, eventLogs });
    expect(r.perPlayer.A).toMatchObject({ goals: 2, assists: 0, ownGoals: 1 });
    expect(r.perPlayer.B).toMatchObject({ goals: 0, assists: 2, ownGoals: 0 });
    expect(r.perPlayer.C).toMatchObject({ goals: 1, assists: 0, ownGoals: 0 });
  });

  it('isExtra 매치는 모든 카운트에서 제외', () => {
    const matchLogs = [
      { match_id: 'R1_C0', our_members_json: '["A"]', opponent_members_json: '["B"]', our_gk: 'A', our_score: 1, opponent_score: 0, is_extra: true },
      { match_id: 'R2_C0', our_members_json: '["A"]', opponent_members_json: '["B"]', our_gk: 'A', our_score: 1, opponent_score: 2, is_extra: false },
    ];
    const r = calcPlayerSummary({ matchLogs, eventLogs: [] });
    expect(r.perPlayer.A).toMatchObject({ rounds: 1, keeperRounds: 1, conceded: 2, matches: 1, losses: 1 });
  });

  it('games = 본인 출전 unique date 수, totalSessions = 전체 unique date 수 (참석률 분자/분모)', () => {
    const matchLogs = [
      { date: '2026-01-01', match_id: 'R1_C0', our_members_json: '["A","B"]', opponent_members_json: '[]', our_score: 0, opponent_score: 0 },
      { date: '2026-01-01', match_id: 'R2_C0', our_members_json: '["A"]',     opponent_members_json: '[]', our_score: 0, opponent_score: 0 },
      { date: '2026-01-08', match_id: 'R1_C0', our_members_json: '["A"]',     opponent_members_json: '[]', our_score: 0, opponent_score: 0 },
      { date: '2026-01-15', match_id: 'R1_C0', our_members_json: '["B"]',     opponent_members_json: '[]', our_score: 0, opponent_score: 0 },
    ];
    const r = calcPlayerSummary({ matchLogs, eventLogs: [] });
    expect(r.totalSessions).toBe(3);     // 1/01, 1/08, 1/15
    expect(r.perPlayer.A.games).toBe(2); // 1/01, 1/08
    expect(r.perPlayer.B.games).toBe(2); // 1/01, 1/15
  });

  it('games는 PG 날짜도 참석으로 인정 — 레거시 부분 명단에 없어도 PG에 있으면 참석 (대시보드 출석 기준)', () => {
    const matchLogs = [
      { date: '2026-01-01', match_id: 'R1_C0', our_members_json: '["A","B"]', opponent_members_json: '[]', our_score: 0, opponent_score: 0 },
      { date: '2026-01-08', match_id: 'R1_C0', our_members_json: '["A"]',     opponent_members_json: '[]', our_score: 0, opponent_score: 0 },
    ];
    // B는 1/08 로그_매치 명단(레거시 부분 명단)에 없지만 PG 행이 있음 = 참석
    const playerGameLogs = [
      { date: '2026-01-08', player: 'B', keeper_games: 0, conceded: 0 },
      // 세션 날짜가 아닌 PG 행은 무시 (>100% 방지)
      { date: '2026-02-01', player: 'B', keeper_games: 0, conceded: 0 },
    ];
    const r = calcPlayerSummary({ matchLogs, eventLogs: [], playerGameLogs });
    expect(r.perPlayer.B.games).toBe(2);   // 1/01(명단) + 1/08(PG)
    expect(r.perPlayer.B.rounds).toBe(1);  // 경기수는 명단 기준 유지
    expect(r.perPlayer.A.games).toBe(2);
  });

  it('teamGoals = 본인 출전 매치의 자기팀 득점 합, goalInvolvement = (G+A)/teamGoals', () => {
    const matchLogs = [
      // A는 our 측: 팀 3득점
      { date: '2026-01-01', match_id: 'R1_C0', our_members_json: '["A"]', opponent_members_json: '["B"]', our_score: 3, opponent_score: 1 },
      // A는 opp 측: 팀 2득점 (opponent_score가 자기팀 득점)
      { date: '2026-01-01', match_id: 'R2_C0', our_members_json: '["B"]', opponent_members_json: '["A"]', our_score: 0, opponent_score: 2 },
    ];
    const eventLogs = [
      { event_type: 'goal', player: 'A', related_player: '', date: '2026-01-01', match_id: 'R1_C0' },
      { event_type: 'goal', player: 'X', related_player: 'A', date: '2026-01-01', match_id: 'R2_C0' },
    ];
    const r = calcPlayerSummary({ matchLogs, eventLogs });
    expect(r.perPlayer.A.teamGoals).toBe(5);          // 3 + 2
    expect(r.perPlayer.A.goalInvolvement).toBeCloseTo(2 / 5, 5); // 1골 + 1어시
    expect(r.perPlayer.B.teamGoals).toBe(1);          // R1 opp측 1 + R2 our측 0
  });

  it('sessionDates = 전체 세션 날짜 정렬 배열 (스트릭 결석 절단용)', () => {
    const matchLogs = [
      { date: '2026-01-15', match_id: 'R1_C0', our_members_json: '["B"]', opponent_members_json: '[]', our_score: 0, opponent_score: 0 },
      { date: '2026-01-01', match_id: 'R1_C0', our_members_json: '["A"]', opponent_members_json: '[]', our_score: 0, opponent_score: 0 },
      { date: '2026-01-01', match_id: 'R2_C0', our_members_json: '["A"]', opponent_members_json: '[]', our_score: 0, opponent_score: 0 },
    ];
    const r = calcPlayerSummary({ matchLogs, eventLogs: [] });
    expect(r.sessionDates).toEqual(['2026-01-01', '2026-01-15']);
  });

  it('isExtra-only 날짜는 totalSessions에서 제외', () => {
    const matchLogs = [
      { date: '2026-01-01', match_id: 'R1_C0', our_members_json: '["A"]', opponent_members_json: '[]', our_score: 0, opponent_score: 0, is_extra: true },
      { date: '2026-01-08', match_id: 'R1_C0', our_members_json: '["A"]', opponent_members_json: '[]', our_score: 0, opponent_score: 0 },
    ];
    const r = calcPlayerSummary({ matchLogs, eventLogs: [] });
    expect(r.totalSessions).toBe(1);
    expect(r.perPlayer.A.games).toBe(1);
  });

  it('maxRounds = 모든 선수의 rounds 최댓값 (참석률 분모)', () => {
    const matchLogs = [
      { match_id: 'R1_C0', our_members_json: '["A","B"]', opponent_members_json: '["C"]', our_score: 0, opponent_score: 0 },
      { match_id: 'R2_C0', our_members_json: '["A"]',     opponent_members_json: '["C"]', our_score: 0, opponent_score: 0 },
      { match_id: 'R3_C0', our_members_json: '["A"]',     opponent_members_json: '["C"]', our_score: 0, opponent_score: 0 },
    ];
    const r = calcPlayerSummary({ matchLogs, eventLogs: [] });
    expect(r.maxRounds).toBe(3);
  });

  it('avgConceded = fieldConceded / fieldRounds (필드 0이면 0)', () => {
    const matchLogs = [
      { match_id: 'R1_C0', our_members_json: '["A","B"]', opponent_members_json: '["C"]', our_gk: 'B', our_score: 0, opponent_score: 4 },
      { match_id: 'R2_C0', our_members_json: '["A","B"]', opponent_members_json: '["C"]', our_gk: 'B', our_score: 0, opponent_score: 2 },
    ];
    const r = calcPlayerSummary({ matchLogs, eventLogs: [] });
    // A: 필드 2매치, 6실점 → avg 3
    expect(r.perPlayer.A.avgConceded).toBe(3);
    // B: 필드 0
    expect(r.perPlayer.B.avgConceded).toBe(0);
  });

  it('malformed members_json은 skip (안 죽음)', () => {
    const matchLogs = [
      { match_id: 'R1_C0', our_members_json: 'bad', opponent_members_json: '["A"]', our_score: 0, opponent_score: 0 },
    ];
    const r = calcPlayerSummary({ matchLogs, eventLogs: [] });
    expect(r.perPlayer.A.rounds).toBe(1);
  });

  it('빈 입력 → empty perPlayer, maxRounds=0', () => {
    const r = calcPlayerSummary({ matchLogs: [], eventLogs: [] });
    expect(r.perPlayer).toEqual({});
    expect(r.maxRounds).toBe(0);
  });

  // playerGameLogs(PG) 시트는 keeper 정보의 권위 소스. matchLogs.our_gk는 2026-04-23 이전 legacy
  // 데이터에서 거의 비어있음 — PG가 있으면 PG를 우선해서 keeperRounds/conceded를 채워야 정확함.
  describe('playerGameLogs override (keeper 권위 소스)', () => {
    it('PG.keeper_games 합 → keeperRounds (matchLogs.our_gk보다 우선)', () => {
      const matchLogs = [
        { date: '2026-01-15', match_id: 'R1_C0', our_members_json: '["A"]', opponent_members_json: '[]', our_gk: '', our_score: 1, opponent_score: 2 },
        { date: '2026-01-15', match_id: 'R2_C0', our_members_json: '["A"]', opponent_members_json: '[]', our_gk: '', our_score: 0, opponent_score: 3 },
      ];
      const playerGameLogs = [
        { date: '2026-01-15', player: 'A', keeper_games: 2, conceded: 5, goals: 0, assists: 0 },
      ];
      const r = calcPlayerSummary({ matchLogs, eventLogs: [], playerGameLogs });
      expect(r.perPlayer.A).toMatchObject({ rounds: 2, keeperRounds: 2, fieldRounds: 0, conceded: 5 });
    });

    it('PG.conceded 합 → conceded (matchLogs 합산보다 우선)', () => {
      const matchLogs = [
        { date: '2026-01-15', match_id: 'R1_C0', our_members_json: '["A"]', opponent_members_json: '[]', our_gk: '', our_score: 0, opponent_score: 99 },
      ];
      const playerGameLogs = [
        { date: '2026-01-15', player: 'A', keeper_games: 1, conceded: 3 },
      ];
      const r = calcPlayerSummary({ matchLogs, eventLogs: [], playerGameLogs });
      expect(r.perPlayer.A.conceded).toBe(3);
    });

    it('fieldConceded = (출전 매치 팀실점 합) - conceded(GK)', () => {
      const matchLogs = [
        { date: '2026-01-15', match_id: 'R1_C0', our_members_json: '["A","B"]', opponent_members_json: '[]', our_gk: '', our_score: 0, opponent_score: 4 },
        { date: '2026-01-15', match_id: 'R2_C0', our_members_json: '["A","B"]', opponent_members_json: '[]', our_gk: '', our_score: 0, opponent_score: 6 },
      ];
      const playerGameLogs = [
        { date: '2026-01-15', player: 'A', keeper_games: 1, conceded: 4 },
        // B는 PG row 없음 → keeperRounds=0, fieldConceded=10
      ];
      const r = calcPlayerSummary({ matchLogs, eventLogs: [], playerGameLogs });
      expect(r.perPlayer.A).toMatchObject({ rounds: 2, keeperRounds: 1, fieldRounds: 1, conceded: 4, fieldConceded: 6 });
      expect(r.perPlayer.B).toMatchObject({ rounds: 2, keeperRounds: 0, fieldRounds: 2, conceded: 0, fieldConceded: 10 });
    });

    it('PG keeperRounds가 rounds 초과해도 그대로 합산 (PG가 권위, fieldRounds는 0으로 클램프)', () => {
      // 실데이터: 2026-01-15에 PG는 keeper=2이지만 matchLogs members에 1매치만 등장하는 케이스 존재.
      // 이건 matchLogs members가 불완전한 거지 PG가 틀린 게 아니므로 PG 값을 신뢰.
      const matchLogs = [
        { date: '2026-01-15', match_id: 'R1_C0', our_members_json: '["A"]', opponent_members_json: '[]', our_gk: '', our_score: 0, opponent_score: 1 },
      ];
      const playerGameLogs = [
        { date: '2026-01-15', player: 'A', keeper_games: 5, conceded: 5 },
      ];
      const r = calcPlayerSummary({ matchLogs, eventLogs: [], playerGameLogs });
      expect(r.perPlayer.A.keeperRounds).toBe(5);
      expect(r.perPlayer.A.fieldRounds).toBe(0); // max(0, 1-5) = 0
    });

    it('PG가 없으면 matchLogs.our_gk fallback (기존 동작 유지)', () => {
      const matchLogs = [
        { match_id: 'R1_C0', our_members_json: '["A"]', opponent_members_json: '[]', our_gk: 'A', our_score: 0, opponent_score: 2 },
      ];
      const r = calcPlayerSummary({ matchLogs, eventLogs: [] });
      expect(r.perPlayer.A).toMatchObject({ keeperRounds: 1, conceded: 2 });
    });
  });
});
