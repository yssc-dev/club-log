import { describe, it, expect } from 'vitest';
import { gameReducer, initialState } from '../useGameReducer';

function withState(overrides) {
  return { ...initialState, ...overrides };
}

describe('gameReducer — past match edit', () => {
  describe('이벤트 변경 시 confirmed 매치 점수 재계산', () => {
    it('ADD_EVENT가 과거 매치 점수에 반영됨 (매치업은 불변)', () => {
      const state = withState({
        teamNames: ['Team A', 'Team B'],
        completedMatches: [{
          matchId: 'R1_C0', homeIdx: 0, awayIdx: 1,
          homeTeam: 'Team A', awayTeam: 'Team B',
          homeScore: 2, awayScore: 1,
        }],
        allEvents: [
          { matchId: 'R1_C0', type: 'goal', scoringTeam: 'Team A' },
          { matchId: 'R1_C0', type: 'goal', scoringTeam: 'Team A' },
          { matchId: 'R1_C0', type: 'goal', scoringTeam: 'Team B' },
        ],
      });
      const next = gameReducer(state, {
        type: 'ADD_EVENT',
        event: { matchId: 'R1_C0', type: 'goal', scoringTeam: 'Team B', courtId: '' },
      });
      const m = next.completedMatches[0];
      expect(m.homeScore).toBe(2);
      expect(m.awayScore).toBe(2);
      expect(m.homeIdx).toBe(0);
      expect(m.awayIdx).toBe(1);
    });

    it('DELETE_EVENT가 과거 매치 점수에 반영됨', () => {
      const state = withState({
        teamNames: ['A', 'B'],
        completedMatches: [{
          matchId: 'R1_C0', homeIdx: 0, awayIdx: 1,
          homeTeam: 'A', awayTeam: 'B', homeScore: 2, awayScore: 0,
        }],
        allEvents: [
          { matchId: 'R1_C0', type: 'goal', scoringTeam: 'A' },
          { matchId: 'R1_C0', type: 'goal', scoringTeam: 'A' },
        ],
      });
      const next = gameReducer(state, { type: 'DELETE_EVENT', index: 1 });
      expect(next.completedMatches[0].homeScore).toBe(1);
    });

    it('EDIT_EVENT(scoringTeam 변경)도 점수에 반영', () => {
      const state = withState({
        completedMatches: [{
          matchId: 'R1_C0', homeIdx: 0, awayIdx: 1,
          homeTeam: 'A', awayTeam: 'B', homeScore: 1, awayScore: 0,
        }],
        allEvents: [
          { matchId: 'R1_C0', type: 'goal', scoringTeam: 'A', courtId: '', timestamp: 1 },
        ],
      });
      const next = gameReducer(state, {
        type: 'EDIT_EVENT', index: 0,
        event: { matchId: 'R1_C0', type: 'goal', scoringTeam: 'B' },
      });
      expect(next.completedMatches[0].homeScore).toBe(0);
      expect(next.completedMatches[0].awayScore).toBe(1);
    });

    it('라이브 매치(미확정 matchId)에 이벤트 추가는 completedMatches 미변경', () => {
      const completed = [{
        matchId: 'R1_C0', homeIdx: 0, awayIdx: 1,
        homeTeam: 'A', awayTeam: 'B', homeScore: 1, awayScore: 0,
      }];
      const state = withState({
        completedMatches: completed,
        allEvents: [{ matchId: 'R1_C0', type: 'goal', scoringTeam: 'A' }],
      });
      const next = gameReducer(state, {
        type: 'ADD_EVENT',
        event: { matchId: 'R2_C0', type: 'goal', scoringTeam: 'A', courtId: '' },
      });
      expect(next.completedMatches).toBe(state.completedMatches);
    });

    it('push 모드: 점수 변경 시 pushState 재계산 (매치업 불변)', () => {
      const state = withState({
        matchMode: 'push',
        teamCount: 4,
        teamNames: ['T1', 'T2', 'T3', 'T4'],
        completedMatches: [{
          matchId: 'P1_C0', homeIdx: 0, awayIdx: 1,
          homeTeam: 'T1', awayTeam: 'T2', homeScore: 1, awayScore: 0,
        }],
        allEvents: [{ matchId: 'P1_C0', type: 'goal', scoringTeam: 'T1' }],
        pushState: { teamPlayCounts: {}, suggestedMatch: { home: 0, away: 1 } },
      });
      const next = gameReducer(state, {
        type: 'ADD_EVENT',
        event: { matchId: 'P1_C0', type: 'goal', scoringTeam: 'T2', courtId: '' },
      });
      // pushState 재계산이 일어남 (참조 변경)
      expect(next.pushState).not.toBe(state.pushState);
      // 매치업은 그대로
      expect(next.completedMatches[0].homeIdx).toBe(0);
      expect(next.completedMatches[0].awayIdx).toBe(1);
      // 점수도 반영
      expect(next.completedMatches[0].homeScore).toBe(1);
      expect(next.completedMatches[0].awayScore).toBe(1);
    });
  });

  describe('EDIT_PAST_GK', () => {
    it("schedule 모드: completedMatches와 gksHistory('R{roundIdx}' 키) 동시 갱신", () => {
      const state = withState({
        completedMatches: [{
          matchId: 'R3_C1', homeIdx: 2, awayIdx: 4,
          homeTeam: 'A', awayTeam: 'B', homeGk: '구A', awayGk: '구B',
        }],
        gksHistory: { R2: { 2: '구A', 4: '구B' } },
      });
      const next = gameReducer(state, {
        type: 'EDIT_PAST_GK', matchId: 'R3_C1', side: 'home', player: '새A',
      });
      expect(next.completedMatches[0].homeGk).toBe('새A');
      expect(next.gksHistory.R2[2]).toBe('새A');
      expect(next.gksHistory.R2[4]).toBe('구B');
    });

    it('구버전 숫자 키에 저장된 schedule 라운드를 고쳐도 같은 라운드의 다른 팀 GK가 남는다', () => {
      const state = withState({
        completedMatches: [{
          matchId: 'R3_C1', homeIdx: 2, awayIdx: 4,
          homeTeam: 'A', awayTeam: 'B', homeGk: '구A', awayGk: '구B',
        }],
        gksHistory: { 2: { 2: '구A', 4: '구B' } },   // 이 배포 전 데이터
      });
      const next = gameReducer(state, {
        type: 'EDIT_PAST_GK', matchId: 'R3_C1', side: 'home', player: '새A',
      });
      expect(next.gksHistory.R2).toEqual({ 2: '새A', 4: '구B' });
    });

    it('push 모드: gksHistory 키는 completedMatches 인덱스', () => {
      const state = withState({
        matchMode: 'push',
        completedMatches: [
          { matchId: 'P1_C0', homeIdx: 0, awayIdx: 1, homeTeam: 'A', awayTeam: 'B', homeGk: 'G1', awayGk: 'G2' },
          { matchId: 'P2_C0', homeIdx: 0, awayIdx: 2, homeTeam: 'A', awayTeam: 'C', homeGk: 'G1', awayGk: 'G3' },
        ],
        gksHistory: { 0: { 0: 'G1', 1: 'G2' }, 1: { 0: 'G1', 2: 'G3' } },
      });
      const next = gameReducer(state, {
        type: 'EDIT_PAST_GK', matchId: 'P2_C0', side: 'away', player: 'NEW',
      });
      expect(next.completedMatches[1].awayGk).toBe('NEW');
      expect(next.gksHistory[1][2]).toBe('NEW');
      expect(next.gksHistory[0]).toEqual({ 0: 'G1', 1: 'G2' });
    });

    it('존재하지 않는 matchId는 state 미변경', () => {
      const state = withState({ completedMatches: [] });
      const next = gameReducer(state, {
        type: 'EDIT_PAST_GK', matchId: 'R1_C0', side: 'home', player: 'X',
      });
      expect(next).toBe(state);
    });

    it('free 모드: gksHistory 키는 completedMatches 인덱스 (F* matchId)', () => {
      const state = withState({
        matchMode: 'free',
        completedMatches: [
          { matchId: 'F1_C0', homeIdx: 0, awayIdx: 1, homeTeam: 'A', awayTeam: 'B', homeGk: 'GA', awayGk: 'GB' },
          { matchId: 'F2_C1', homeIdx: 2, awayIdx: 3, homeTeam: 'C', awayTeam: 'D', homeGk: 'GC', awayGk: 'GD' },
        ],
        gksHistory: {
          0: { 0: 'GA', 1: 'GB' },
          1: { 2: 'GC', 3: 'GD' },
        },
      });
      const next = gameReducer(state, {
        type: 'EDIT_PAST_GK', matchId: 'F2_C1', side: 'home', player: '새C',
      });
      expect(next.completedMatches[1].homeGk).toBe('새C');
      expect(next.gksHistory[1][2]).toBe('새C');
      expect(next.gksHistory[1][3]).toBe('GD');
      expect(next.gksHistory[0]).toEqual({ 0: 'GA', 1: 'GB' });
    });
  });

  describe('FINISH_MATCH / CONFIRM_FREE_ROUND — gksHistory 작성', () => {
    it('FINISH_MATCH (free 단건): gksHistory[completedIdx] 작성', () => {
      const state = withState({
        teams: [['A1'], ['B1']],
        completedMatches: [],
      });
      const match = {
        matchId: 'F1_C0', homeIdx: 0, awayIdx: 1,
        homeTeam: 'A', awayTeam: 'B', homeGk: 'GA', awayGk: 'GB',
        homeScore: 0, awayScore: 0,
      };
      const next = gameReducer(state, { type: 'FINISH_MATCH', match });
      expect(next.completedMatches.length).toBe(1);
      expect(next.gksHistory[0]).toEqual({ 0: 'GA', 1: 'GB' });
    });

    it('CONFIRM_FREE_ROUND (free 2코트): 매치별로 gksHistory 인덱스 분리 작성', () => {
      const state = withState({
        teams: [['A1'], ['B1'], ['C1'], ['D1']],
        completedMatches: [],
      });
      const results = [
        { matchId: 'F1_C0', homeIdx: 0, awayIdx: 1, homeTeam: 'A', awayTeam: 'B', homeGk: 'GA', awayGk: 'GB', homeScore: 1, awayScore: 0 },
        { matchId: 'F2_C1', homeIdx: 2, awayIdx: 3, homeTeam: 'C', awayTeam: 'D', homeGk: 'GC', awayGk: 'GD', homeScore: 0, awayScore: 1 },
      ];
      const next = gameReducer(state, { type: 'CONFIRM_FREE_ROUND', results });
      expect(next.completedMatches.length).toBe(2);
      expect(next.gksHistory[0]).toEqual({ 0: 'GA', 1: 'GB' });
      expect(next.gksHistory[1]).toEqual({ 2: 'GC', 3: 'GD' });
    });

    it('CONFIRM_FREE_ROUND: 기존 completedMatches가 있어도 새 인덱스 baseIdx부터 작성', () => {
      const state = withState({
        teams: [['A1'], ['B1'], ['C1'], ['D1']],
        completedMatches: [
          { matchId: 'F0_C0', homeIdx: 0, awayIdx: 1, homeTeam: 'A', awayTeam: 'B', homeGk: 'X', awayGk: 'Y', homeScore: 0, awayScore: 0 },
        ],
        gksHistory: { 0: { 0: 'X', 1: 'Y' } },
      });
      const results = [
        { matchId: 'F1_C0', homeIdx: 0, awayIdx: 2, homeTeam: 'A', awayTeam: 'C', homeGk: 'GA', awayGk: 'GC', homeScore: 0, awayScore: 0 },
      ];
      const next = gameReducer(state, { type: 'CONFIRM_FREE_ROUND', results });
      expect(next.gksHistory[0]).toEqual({ 0: 'X', 1: 'Y' }); // 보존
      expect(next.gksHistory[1]).toEqual({ 0: 'GA', 2: 'GC' }); // 신규
    });
  });

  describe('EDIT_PAST_MERC_ADD / REMOVE', () => {
    it('용병 추가는 mercenaries와 homePlayers 갱신', () => {
      const state = withState({
        teams: [['A1', 'A2'], ['B1', 'B2']],
        completedMatches: [{
          matchId: 'R1_C0', homeIdx: 0, awayIdx: 1,
          homeTeam: 'TA', awayTeam: 'TB',
          homePlayers: ['A1', 'A2'], awayPlayers: ['B1', 'B2'],
          mercenaries: [],
        }],
      });
      const next = gameReducer(state, {
        type: 'EDIT_PAST_MERC_ADD', matchId: 'R1_C0', teamIdx: 0, player: '용병1',
      });
      const m = next.completedMatches[0];
      expect(m.mercenaries).toEqual([{ player: '용병1', teamIdx: 0 }]);
      expect(m.homePlayers).toContain('용병1');
      expect(m.awayPlayers).not.toContain('용병1');
    });

    it('용병 제거', () => {
      const state = withState({
        teams: [['A1'], ['B1']],
        completedMatches: [{
          matchId: 'R1_C0', homeIdx: 0, awayIdx: 1,
          homeTeam: 'TA', awayTeam: 'TB',
          homePlayers: ['A1'], awayPlayers: ['B1', '용병X'],
          mercenaries: [{ player: '용병X', teamIdx: 1 }],
        }],
      });
      const next = gameReducer(state, {
        type: 'EDIT_PAST_MERC_REMOVE', matchId: 'R1_C0', player: '용병X',
      });
      const m = next.completedMatches[0];
      expect(m.mercenaries).toEqual([]);
      expect(m.awayPlayers).toEqual(['B1']);
      expect(m.homePlayers).toEqual(['A1']);
    });

    it('잘못된 teamIdx (홈/원정 아님)는 state 미변경', () => {
      const state = withState({
        teams: [['A'], ['B'], ['C']],
        completedMatches: [{
          matchId: 'R1_C0', homeIdx: 0, awayIdx: 1,
          homeTeam: 'TA', awayTeam: 'TB',
          homePlayers: ['A'], awayPlayers: ['B'], mercenaries: [],
        }],
      });
      const next = gameReducer(state, {
        type: 'EDIT_PAST_MERC_ADD', matchId: 'R1_C0', teamIdx: 2, player: 'X',
      });
      expect(next).toBe(state);
    });

    it('이미 추가된 용병 중복 추가 무시', () => {
      const state = withState({
        completedMatches: [{
          matchId: 'R1_C0', homeIdx: 0, awayIdx: 1,
          homeTeam: 'A', awayTeam: 'B',
          homePlayers: ['P1'], awayPlayers: ['P2'],
          mercenaries: [{ player: '용병', teamIdx: 0 }],
        }],
      });
      const next = gameReducer(state, {
        type: 'EDIT_PAST_MERC_ADD', matchId: 'R1_C0', teamIdx: 0, player: '용병',
      });
      expect(next).toBe(state);
    });
  });

  describe('UNCONFIRM_ROUND — currentRoundIdx 보존', () => {
    it('뒤에 확정된 라운드가 있으면 currentRoundIdx 를 보존(롤백 X)', () => {
      // 시나리오: 10라운드 모두 확정, currentRoundIdx=9.
      // 라운드 9(idx 8) 확정취소 시 currentRoundIdx=9 유지(라운드 10 진행 위치).
      const schedule = Array.from({ length: 10 }, () => ({ matches: [[0, 1]] }));
      const confirmedRounds = {};
      for (let i = 0; i < 10; i++) confirmedRounds[i] = true;
      const completedMatches = [];
      for (let i = 0; i < 10; i++) {
        completedMatches.push({
          matchId: `R${i + 1}_C0`, homeIdx: 0, awayIdx: 1,
          homeTeam: 'A', awayTeam: 'B', homeScore: 1, awayScore: 0,
        });
      }
      const state = withState({
        schedule, confirmedRounds, completedMatches,
        currentRoundIdx: 9, viewingRoundIdx: 8,
        teamNames: ['A', 'B'], teams: [['p1'], ['p2']],
      });
      const next = gameReducer(state, { type: 'UNCONFIRM_ROUND', roundIdx: 8 });
      expect(next.currentRoundIdx).toBe(9);
      expect(next.viewingRoundIdx).toBe(8);
      expect(next.confirmedRounds[8]).toBeUndefined();
      expect(next.confirmedRounds[9]).toBe(true);
    });

    it('가장 최신 라운드 확정취소 시에는 roundIdx 로 롤백(기존 동작 유지)', () => {
      const schedule = Array.from({ length: 10 }, () => ({ matches: [[0, 1]] }));
      const confirmedRounds = { 0: true, 1: true, 2: true };
      const completedMatches = [0, 1, 2].map(i => ({
        matchId: `R${i + 1}_C0`, homeIdx: 0, awayIdx: 1,
        homeTeam: 'A', awayTeam: 'B', homeScore: 1, awayScore: 0,
      }));
      const state = withState({
        schedule, confirmedRounds, completedMatches,
        currentRoundIdx: 3, viewingRoundIdx: 2,
        teamNames: ['A', 'B'], teams: [['p1'], ['p2']],
      });
      const next = gameReducer(state, { type: 'UNCONFIRM_ROUND', roundIdx: 2 });
      // 뒤에 확정 없음 → roundIdx 로 롤백
      expect(next.currentRoundIdx).toBe(2);
      expect(next.viewingRoundIdx).toBe(2);
    });
  });

  describe('RESTORE_STATE — currentRoundIdx 자가복구', () => {
    it('confirmedRounds 의 최대 인덱스보다 currentRoundIdx 가 작으면 끌어올림', () => {
      // 과거 버그로 저장된 상태: 라운드 9·10 확정인데 currentRoundIdx=8
      const schedule = Array.from({ length: 10 }, () => ({ matches: [[0, 1]] }));
      const next = gameReducer(initialState, {
        type: 'RESTORE_STATE',
        state: {
          schedule,
          currentRoundIdx: 8,
          confirmedRounds: { 0: true, 1: true, 2: true, 3: true, 4: true, 5: true, 6: true, 7: true, 8: true, 9: true },
        },
      });
      expect(next.currentRoundIdx).toBe(9);
    });

    it('정상 상태(currentRoundIdx >= maxConfirmed)는 그대로 유지', () => {
      const schedule = Array.from({ length: 5 }, () => ({ matches: [[0, 1]] }));
      const next = gameReducer(initialState, {
        type: 'RESTORE_STATE',
        state: {
          schedule,
          currentRoundIdx: 3,
          confirmedRounds: { 0: true, 1: true, 2: true },
        },
      });
      expect(next.currentRoundIdx).toBe(3);
    });
  });

  describe('RESTORE_STATE — splitPhase 정규화 (matchMode 기준)', () => {
    it('push 모드에서 splitPhase="first" 면 null 로 정규화', () => {
      const next = gameReducer(initialState, {
        type: 'RESTORE_STATE',
        state: { matchMode: 'push', splitPhase: 'first' },
      });
      expect(next.splitPhase).toBeNull();
    });

    it('free 모드에서 splitPhase="first" 면 null 로 정규화', () => {
      const next = gameReducer(initialState, {
        type: 'RESTORE_STATE',
        state: { matchMode: 'free', splitPhase: 'first' },
      });
      expect(next.splitPhase).toBeNull();
    });

    it('schedule 모드면 splitPhase 보존 (실제 split 여부는 게임 시작 로직이 결정)', () => {
      const next = gameReducer(initialState, {
        type: 'RESTORE_STATE',
        state: { matchMode: 'schedule', splitPhase: 'second' },
      });
      expect(next.splitPhase).toBe('second');
    });

    it('initialState.splitPhase 기본값은 null', () => {
      expect(initialState.splitPhase).toBeNull();
    });
  });
});
