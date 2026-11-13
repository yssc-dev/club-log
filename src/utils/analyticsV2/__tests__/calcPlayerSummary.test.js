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

  it('fieldRounds = GK가 기록된 사이드에서 필드로 뛴 경기 (GK 미기록 사이드는 키퍼·필드 모두 제외)', () => {
    const matchLogs = [
      { match_id: 'R1_C0', our_members_json: '["A","B"]', opponent_members_json: '["C"]', our_gk: 'A', our_score: 1, opponent_score: 0 },
      { match_id: 'R2_C0', our_members_json: '["A","B"]', opponent_members_json: '["C"]', our_gk: 'B', our_score: 1, opponent_score: 0 },
    ];
    const r = calcPlayerSummary({ matchLogs, eventLogs: [] });
    expect(r.perPlayer.A).toMatchObject({ rounds: 2, keeperRounds: 1, fieldRounds: 1 });
    expect(r.perPlayer.B).toMatchObject({ rounds: 2, keeperRounds: 1, fieldRounds: 1 });
    // C 사이드는 opponent_gk 미기록 → 출전 2경기지만 키퍼·필드 둘 다 0
    expect(r.perPlayer.C).toMatchObject({ rounds: 2, keeperRounds: 0, fieldRounds: 0 });
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

  // 2026-11-13 유저 결정 A: 키퍼·필드 지표는 GK가 기록된 로그_매치 사이드만(calcGkFieldSplit 단일 소스).
  // PG의 keeper_games/conceded는 쓰지 않는다 — 경기 단위 지표(키퍼 vs 필드 카드·수비력)와 숫자를 맞추기 위함.
  describe('키퍼·필드 = GK 기록 경기 기준', () => {
    it('PG에 키퍼 기록이 있어도 로그_매치 GK가 비어 있으면 키퍼 경기로 세지 않음', () => {
      const matchLogs = [
        { date: '2026-01-15', match_id: 'R1_C0', our_members_json: '["A"]', opponent_members_json: '[]', our_gk: '', our_score: 1, opponent_score: 2 },
        { date: '2026-05-07', match_id: 'R1_C0', our_members_json: '["A","B"]', opponent_members_json: '[]', our_gk: 'A', our_score: 0, opponent_score: 3 },
      ];
      const playerGameLogs = [
        { date: '2026-01-15', player: 'A', keeper_games: 1, conceded: 2 },
        { date: '2026-05-07', player: 'A', keeper_games: 1, conceded: 3 },
      ];
      const r = calcPlayerSummary({ matchLogs, eventLogs: [], playerGameLogs });
      expect(r.perPlayer.A).toMatchObject({ rounds: 2, keeperRounds: 1, conceded: 3, fieldRounds: 0 });
      expect(r.perPlayer.B).toMatchObject({ rounds: 1, keeperRounds: 0, fieldRounds: 1, fieldConceded: 3 });
    });

    it('값은 calcGkFieldSplit과 항상 같다 (단일 소스)', async () => {
      const { calcGkFieldSplit } = await import('../calcGkFieldSplit');
      const matchLogs = [
        { date: '2026-05-07', match_id: 'R1_C0', our_members_json: '["A","B"]', opponent_members_json: '["C","D"]', our_gk: 'A', opponent_gk: 'C', our_score: 2, opponent_score: 1 },
        { date: '2026-05-07', match_id: 'R2_C0', our_members_json: '["A","B"]', opponent_members_json: '["C","D"]', our_gk: 'B', opponent_gk: '', our_score: 0, opponent_score: 0 },
        { date: '2026-05-07', match_id: 'R3_C0', our_members_json: '["A","B"]', opponent_members_json: '["C","D"]', our_gk: 'A', opponent_gk: 'D', our_score: 1, opponent_score: 3, is_extra: true },
      ];
      const r = calcPlayerSummary({ matchLogs, eventLogs: [] });
      const sp = calcGkFieldSplit({ matchLogs }).perPlayer;
      for (const n of ['A', 'B', 'C', 'D']) {
        expect(r.perPlayer[n]).toMatchObject({
          keeperRounds: sp[n]?.gk.games ?? 0, conceded: sp[n]?.gk.goalsAgainst ?? 0,
          fieldRounds: sp[n]?.field.games ?? 0, fieldConceded: sp[n]?.field.goalsAgainst ?? 0,
        });
      }
      expect(r.perPlayer.A).toMatchObject({ keeperRounds: 1, conceded: 1, fieldRounds: 1, fieldConceded: 0 });
    });
  });
});
