import { describe, it, expect } from 'vitest';
import { gameReducer, initialState } from '../useGameReducer';

function withState(overrides) {
  return { ...initialState, ...overrides };
}

// 시나리오: 4팀·2코트 schedule. 라운드 1에 A구장(팀1 vs 팀2), B구장(팀3 vs 팀4).
// 팀4의 '이영문'을 A구장 팀1 용병으로 차출 → 팀4 명단에서 제외돼야 함.
describe('gameReducer — 용병 차출 모델', () => {
  const baseTeams = [
    ['김장수', '김형근', '김형욱', '정보영', '채수찬'],            // 팀1 (A구장 home)
    ['김홍익', '배민철', '서라현', '우창호', '조재상'],            // 팀2 (A구장 away)
    ['김성환', '노필선', '오희종', '정동근', '조승훈'],            // 팀3 (B구장 home)
    ['김성태', '우상운', '유소진', '이강성', '이동규', '이영문'],  // 팀4 (B구장 away) — 이영문 보유
  ];
  const baseTeamNames = ['팀1', '팀2', '팀3', '팀4'];

  describe('ADD_LIVE_MERC 자동 이동', () => {
    it('이미 다른 라이브 매치에 차출된 player를 새 매치에 추가하면 이전 매치에서 자동 제거', () => {
      const state = withState({
        teams: baseTeams,
        teamNames: baseTeamNames,
        liveMercs: { 'R1_C0': [{ player: '이영문', teamIdx: 0 }] },
      });
      const next = gameReducer(state, {
        type: 'ADD_LIVE_MERC', matchId: 'R1_C1', player: '이영문', teamIdx: 2,
      });
      expect(next.liveMercs['R1_C0']).toBeUndefined();
      expect(next.liveMercs['R1_C1']).toEqual([{ player: '이영문', teamIdx: 2 }]);
    });

    it('같은 매치의 다른 팀으로 추가하면 팀 이동 (제거 후 재추가 불필요)', () => {
      const state = withState({
        teams: baseTeams,
        liveMercs: { 'R1_C0': [{ player: '이동규', teamIdx: 0 }, { player: '이영문', teamIdx: 0 }] },
      });
      const next = gameReducer(state, {
        type: 'ADD_LIVE_MERC', matchId: 'R1_C0', player: '이영문', teamIdx: 1,
      });
      // 순서 유지 — 카드 위치가 튀지 않게
      expect(next.liveMercs['R1_C0']).toEqual([
        { player: '이동규', teamIdx: 0 }, { player: '이영문', teamIdx: 1 },
      ]);
    });

    it('팀 이동 시 이전 팀에 남은 휴식 기록도 정리', () => {
      const state = withState({
        teams: baseTeams,
        liveMercs: { 'R1_C0': [{ player: '이영문', teamIdx: 0 }] },
        absentees: { 'R1_C0': { 0: ['이영문', '김장수'] } },
      });
      const next = gameReducer(state, {
        type: 'ADD_LIVE_MERC', matchId: 'R1_C0', player: '이영문', teamIdx: 1,
      });
      expect(next.absentees['R1_C0']).toEqual({ 0: ['김장수'] });
    });

    it('같은 매치에 이미 mercs로 있으면 무시', () => {
      const state = withState({
        teams: baseTeams,
        liveMercs: { 'R1_C0': [{ player: '이영문', teamIdx: 0 }] },
      });
      const next = gameReducer(state, {
        type: 'ADD_LIVE_MERC', matchId: 'R1_C0', player: '이영문', teamIdx: 0,
      });
      expect(next).toBe(state);
    });

    it('차출 시 다른 매치에 다른 player가 남아있으면 그 entry 유지', () => {
      const state = withState({
        teams: baseTeams,
        liveMercs: {
          'R1_C0': [{ player: '이영문', teamIdx: 0 }, { player: '이동규', teamIdx: 0 }],
        },
      });
      const next = gameReducer(state, {
        type: 'ADD_LIVE_MERC', matchId: 'R1_C1', player: '이영문', teamIdx: 2,
      });
      expect(next.liveMercs['R1_C0']).toEqual([{ player: '이동규', teamIdx: 0 }]);
      expect(next.liveMercs['R1_C1']).toEqual([{ player: '이영문', teamIdx: 2 }]);
    });
  });

  describe('CONFIRM_ROUND 스냅샷 — 차출자 base 제외', () => {
    it('A구장에 차출된 이영문은 B구장의 awayPlayers(팀4)에서 제외되고 A구장 homePlayers(팀1)에만 포함', () => {
      const state = withState({
        teams: baseTeams,
        teamNames: baseTeamNames,
        liveMercs: { 'R1_C0': [{ player: '이영문', teamIdx: 0 }] },
      });
      const matchResults = [
        {
          matchId: 'R1_C0', homeIdx: 0, awayIdx: 1,
          homeTeam: '팀1', awayTeam: '팀2', homeScore: 0, awayScore: 0,
          homeGk: '김장수', awayGk: '배민철',
        },
        {
          matchId: 'R1_C1', homeIdx: 2, awayIdx: 3,
          homeTeam: '팀3', awayTeam: '팀4', homeScore: 0, awayScore: 0,
          homeGk: '김성환', awayGk: '김성태',
        },
      ];
      const next = gameReducer(state, {
        type: 'CONFIRM_ROUND', roundIdx: 0, matchResults, nextRoundIdx: 1,
      });
      const aMatch = next.completedMatches.find(m => m.matchId === 'R1_C0');
      const bMatch = next.completedMatches.find(m => m.matchId === 'R1_C1');
      // A구장 팀1: 원 팀1 + 이영문(차출)
      expect(aMatch.homePlayers).toContain('이영문');
      expect(aMatch.homePlayers.filter(p => p === '이영문').length).toBe(1);
      // B구장 팀4: 원 팀4에서 이영문 제외
      expect(bMatch.awayPlayers).not.toContain('이영문');
      // 다른 팀4 멤버는 그대로
      expect(bMatch.awayPlayers).toContain('이동규');
      // mercenaries 정보는 A구장에만 저장
      expect(aMatch.mercenaries).toEqual([{ player: '이영문', teamIdx: 0 }]);
      expect(bMatch.mercenaries).toEqual([]);
      // liveMercs는 클리어
      expect(next.liveMercs).toEqual({});
    });

    it('차출 없을 때는 기존 동작 유지', () => {
      const state = withState({ teams: baseTeams, teamNames: baseTeamNames, liveMercs: {} });
      const matchResults = [
        { matchId: 'R1_C0', homeIdx: 0, awayIdx: 1, homeTeam: '팀1', awayTeam: '팀2', homeScore: 1, awayScore: 0 },
        { matchId: 'R1_C1', homeIdx: 2, awayIdx: 3, homeTeam: '팀3', awayTeam: '팀4', homeScore: 0, awayScore: 0 },
      ];
      const next = gameReducer(state, {
        type: 'CONFIRM_ROUND', roundIdx: 0, matchResults, nextRoundIdx: 1,
      });
      expect(next.completedMatches[0].homePlayers).toEqual(baseTeams[0]);
      expect(next.completedMatches[1].awayPlayers).toEqual(baseTeams[3]);
    });

    it('viewingRoundIdx === roundIdx (확정 중인 라운드)면 자동으로 nextRoundIdx로 이동', () => {
      const state = withState({
        teams: baseTeams, teamNames: baseTeamNames,
        viewingRoundIdx: 0, currentRoundIdx: 0,
      });
      const matchResults = [
        { matchId: 'R1_C0', homeIdx: 0, awayIdx: 1, homeTeam: '팀1', awayTeam: '팀2', homeScore: 0, awayScore: 0 },
      ];
      const next = gameReducer(state, {
        type: 'CONFIRM_ROUND', roundIdx: 0, matchResults, nextRoundIdx: 1,
      });
      expect(next.currentRoundIdx).toBe(1);
      expect(next.viewingRoundIdx).toBe(1);
    });

    it('viewingRoundIdx !== roundIdx (다른 라운드 보다가 확정)면 viewingRoundIdx 유지', () => {
      const state = withState({
        teams: baseTeams, teamNames: baseTeamNames,
        viewingRoundIdx: 3, currentRoundIdx: 0,
      });
      const matchResults = [
        { matchId: 'R1_C0', homeIdx: 0, awayIdx: 1, homeTeam: '팀1', awayTeam: '팀2', homeScore: 0, awayScore: 0 },
      ];
      const next = gameReducer(state, {
        type: 'CONFIRM_ROUND', roundIdx: 0, matchResults, nextRoundIdx: 1,
      });
      expect(next.currentRoundIdx).toBe(1);
      expect(next.viewingRoundIdx).toBe(3);
    });

    it('nextRoundIdx === null (마지막 라운드 확정)이면 viewingRoundIdx 유지', () => {
      const state = withState({
        teams: baseTeams, teamNames: baseTeamNames,
        viewingRoundIdx: 5, currentRoundIdx: 5,
      });
      const matchResults = [
        { matchId: 'R6_C0', homeIdx: 0, awayIdx: 1, homeTeam: '팀1', awayTeam: '팀2', homeScore: 0, awayScore: 0 },
      ];
      const next = gameReducer(state, {
        type: 'CONFIRM_ROUND', roundIdx: 5, matchResults, nextRoundIdx: null,
      });
      expect(next.viewingRoundIdx).toBe(5);
    });
  });

  describe('UNCONFIRM_ROUND — 차출 라이브 복원', () => {
    it('확정취소 시 mercenaries가 liveMercs로 복원되어 다시 편집 가능', () => {
      const state = withState({
        teams: baseTeams,
        teamNames: baseTeamNames,
        confirmedRounds: { 0: true },
        completedMatches: [
          {
            matchId: 'R1_C0', homeIdx: 0, awayIdx: 1,
            homeTeam: '팀1', awayTeam: '팀2',
            homePlayers: [...baseTeams[0], '이영문'],
            awayPlayers: baseTeams[1],
            mercenaries: [{ player: '이영문', teamIdx: 0 }],
            homeScore: 0, awayScore: 0,
          },
          {
            matchId: 'R1_C1', homeIdx: 2, awayIdx: 3,
            homeTeam: '팀3', awayTeam: '팀4',
            homePlayers: baseTeams[2],
            awayPlayers: baseTeams[3].filter(p => p !== '이영문'),
            mercenaries: [],
            homeScore: 0, awayScore: 0,
          },
        ],
        gksHistory: { 0: { 0: '김장수', 1: '배민철', 2: '김성환', 3: '김성태' } },
      });
      const next = gameReducer(state, { type: 'UNCONFIRM_ROUND', roundIdx: 0 });
      expect(next.liveMercs['R1_C0']).toEqual([{ player: '이영문', teamIdx: 0 }]);
      expect(next.confirmedRounds[0]).toBeUndefined();
      expect(next.completedMatches.length).toBe(0);
    });
  });

  describe('CONFIRM_FREE_ROUND — free 두 코트 atomic', () => {
    it('두 코트 동시 finalize 시 차출자가 원팀 명단에서 제외', () => {
      const state = withState({
        teams: baseTeams,
        teamNames: baseTeamNames,
        liveMercs: { 'F1_C0': [{ player: '이영문', teamIdx: 0 }] },
      });
      const results = [
        {
          matchId: 'F1_C0', homeIdx: 0, awayIdx: 1,
          homeTeam: '팀1', awayTeam: '팀2', homeScore: 0, awayScore: 0,
        },
        {
          matchId: 'F2_C1', homeIdx: 2, awayIdx: 3,
          homeTeam: '팀3', awayTeam: '팀4', homeScore: 0, awayScore: 0,
        },
      ];
      const next = gameReducer(state, { type: 'CONFIRM_FREE_ROUND', results });
      const a = next.completedMatches.find(m => m.matchId === 'F1_C0');
      const b = next.completedMatches.find(m => m.matchId === 'F2_C1');
      expect(a.homePlayers).toContain('이영문');
      expect(b.awayPlayers).not.toContain('이영문');
      expect(next.liveMercs).toEqual({});
    });
  });

  describe('EDIT_PAST_MERC_ADD — 과거 라운드 차출 시 같은 라운드 재계산', () => {
    it('schedule 같은 라운드 다른 매치에서 차출자 자동 제거', () => {
      const state = withState({
        teams: baseTeams,
        teamNames: baseTeamNames,
        completedMatches: [
          {
            matchId: 'R1_C0', homeIdx: 0, awayIdx: 1,
            homeTeam: '팀1', awayTeam: '팀2',
            homePlayers: [...baseTeams[0]], awayPlayers: [...baseTeams[1]],
            mercenaries: [], homeScore: 0, awayScore: 0,
          },
          {
            matchId: 'R1_C1', homeIdx: 2, awayIdx: 3,
            homeTeam: '팀3', awayTeam: '팀4',
            homePlayers: [...baseTeams[2]], awayPlayers: [...baseTeams[3]],
            mercenaries: [], homeScore: 0, awayScore: 0,
          },
        ],
      });
      const next = gameReducer(state, {
        type: 'EDIT_PAST_MERC_ADD', matchId: 'R1_C0', player: '이영문', teamIdx: 0,
      });
      const a = next.completedMatches[0];
      const b = next.completedMatches[1];
      expect(a.homePlayers).toContain('이영문');
      expect(a.mercenaries).toEqual([{ player: '이영문', teamIdx: 0 }]);
      expect(b.awayPlayers).not.toContain('이영문');
    });

    it('이미 같은 라운드 다른 매치에 mercs로 있던 player를 추가하면 그쪽에서 자동 제거', () => {
      const state = withState({
        teams: baseTeams,
        completedMatches: [
          {
            matchId: 'R1_C0', homeIdx: 0, awayIdx: 1,
            homeTeam: '팀1', awayTeam: '팀2',
            homePlayers: [...baseTeams[0]],
            awayPlayers: [...baseTeams[1], '이영문'],
            mercenaries: [{ player: '이영문', teamIdx: 1 }],
            homeScore: 0, awayScore: 0,
          },
          {
            matchId: 'R1_C1', homeIdx: 2, awayIdx: 3,
            homeTeam: '팀3', awayTeam: '팀4',
            homePlayers: [...baseTeams[2]],
            awayPlayers: baseTeams[3].filter(p => p !== '이영문'),
            mercenaries: [], homeScore: 0, awayScore: 0,
          },
        ],
      });
      const next = gameReducer(state, {
        type: 'EDIT_PAST_MERC_ADD', matchId: 'R1_C1', player: '이영문', teamIdx: 2,
      });
      const a = next.completedMatches[0];
      const b = next.completedMatches[1];
      // 이전 차출(C0)에서 이영문 제거
      expect(a.mercenaries).toEqual([]);
      expect(a.awayPlayers).not.toContain('이영문');
      // 새 차출(C1)에 이영문 등록
      expect(b.mercenaries).toEqual([{ player: '이영문', teamIdx: 2 }]);
      expect(b.homePlayers).toContain('이영문');
      // 원팀 base에서도 제외 유지
      expect(b.awayPlayers).not.toContain('이영문');
    });
  });

  describe('EDIT_PAST_MERC_REMOVE — 차출 해제 시 원팀 복귀', () => {
    it('차출 해제하면 같은 라운드 원팀 매치에 다시 등장', () => {
      const state = withState({
        teams: baseTeams,
        completedMatches: [
          {
            matchId: 'R1_C0', homeIdx: 0, awayIdx: 1,
            homeTeam: '팀1', awayTeam: '팀2',
            homePlayers: [...baseTeams[0], '이영문'],
            awayPlayers: [...baseTeams[1]],
            mercenaries: [{ player: '이영문', teamIdx: 0 }],
            homeScore: 0, awayScore: 0,
          },
          {
            matchId: 'R1_C1', homeIdx: 2, awayIdx: 3,
            homeTeam: '팀3', awayTeam: '팀4',
            homePlayers: [...baseTeams[2]],
            awayPlayers: baseTeams[3].filter(p => p !== '이영문'),
            mercenaries: [], homeScore: 0, awayScore: 0,
          },
        ],
      });
      const next = gameReducer(state, {
        type: 'EDIT_PAST_MERC_REMOVE', matchId: 'R1_C0', player: '이영문',
      });
      const a = next.completedMatches[0];
      const b = next.completedMatches[1];
      expect(a.mercenaries).toEqual([]);
      expect(a.homePlayers).not.toContain('이영문');
      // 원팀(팀4) 명단에 다시 등장
      expect(b.awayPlayers).toContain('이영문');
    });
  });
});
