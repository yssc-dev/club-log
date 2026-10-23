import { describe, it, expect } from 'vitest';
import { gameReducer, initialState } from '../useGameReducer';
import { resolveRoundGks } from '../../utils/roundGks';

// 2026-10-23 마스터스컵 사례의 엔드투엔드: 라운드마다 GK를 지정하고 전부 확정한 뒤
// 중간 라운드를 확정취소해도 "누가 GK였는지"가 화면에서 사라지면 안 된다.
// 화면이 읽는 경로(resolveRoundGks)까지 묶어서 본다 — 리듀서만 맞고 읽기가 틀리면 소용없다.
describe('라운드별 GK — 지정 → 확정 → 취소 → 재확정', () => {
  const view = (s, roundIdx) => resolveRoundGks({
    gksHistory: s.gksHistory, gks: s.gks,
    confirmedRounds: s.confirmedRounds, currentRoundIdx: s.currentRoundIdx,
  }, roundIdx);
  const confirm = (s, roundIdx) => gameReducer(s, {
    type: 'CONFIRM_ROUND',
    roundIdx,
    nextRoundIdx: roundIdx + 1,
    matchResults: [{
      matchId: `R${roundIdx + 1}_C0`, homeIdx: 0, awayIdx: 1,
      homeTeam: '광땡', awayTeam: '국뽕',
      homeGk: view(s, roundIdx)[0] || null, awayGk: view(s, roundIdx)[1] || null,
      homeScore: 0, awayScore: 0,
    }],
  });

  it('9라운드 모두 확정 후 7라운드를 취소해도 그 라운드 GK가 그대로 보인다', () => {
    let s = { ...initialState,
      teams: [['우상운', '김성환'], ['정보영', '노필선']],
      teamNames: ['광땡', '국뽕'],
      schedule: Array.from({ length: 9 }, () => ({ matches: [[0, 1]] })),
      currentRoundIdx: 0,
    };
    // 라운드마다 GK 지정 후 확정
    for (let r = 0; r < 9; r++) {
      s = gameReducer(s, { type: 'SET_ROUND_GK', roundIdx: r, teamIdx: 0, player: '우상운' });
      s = gameReducer(s, { type: 'SET_ROUND_GK', roundIdx: r, teamIdx: 1, player: '정보영' });
      s = confirm(s, r);
    }
    expect(s.completedMatches).toHaveLength(9);
    expect(s.completedMatches[6].homeGk).toBe('우상운');

    // 7라운드(=index 6) 확정취소 — 예전엔 여기서 GK가 통째로 사라졌다
    s = gameReducer(s, { type: 'UNCONFIRM_ROUND', roundIdx: 6 });
    expect(s.confirmedRounds[6]).toBeUndefined();
    expect(view(s, 6)).toEqual({ 0: '우상운', 1: '정보영' });

    // 8라운드도 추가로 취소 — 두 미확정 라운드가 서로 섞이지 않는다
    s = gameReducer(s, { type: 'SET_ROUND_GK', roundIdx: 7, teamIdx: 0, player: '김성환' });
    expect(view(s, 6)).toEqual({ 0: '우상운', 1: '정보영' });
    expect(view(s, 7)[0]).toBe('김성환');

    // 7라운드 재확정 — 지정돼 있던 GK가 그대로 매치에 기록된다
    s = confirm(s, 6);
    const r7 = s.completedMatches.find(m => m.matchId === 'R7_C0');
    expect(r7.homeGk).toBe('우상운');
    expect(r7.awayGk).toBe('정보영');
  });

  it('확정한 라운드의 GK는 다음 라운드로 새지 않는다', () => {
    let s = { ...initialState,
      schedule: [{ matches: [[0, 1]] }, { matches: [[0, 1]] }],
      currentRoundIdx: 0,
    };
    s = gameReducer(s, { type: 'SET_ROUND_GK', roundIdx: 0, teamIdx: 0, player: '우상운' });
    s = confirm(s, 0);
    expect(view(s, 1)).toEqual({});
  });
});

// 이 배포 전에 확정된 라운드는 GK가 숫자 키(gksHistory[roundIdx])에 들어 있다.
describe('구버전 데이터 호환', () => {
  it('확정취소하면 숫자 키의 GK가 라운드 키로 승격돼 계속 보인다', () => {
    const s = { ...initialState,
      schedule: Array.from({ length: 3 }, () => ({ matches: [[0, 1]] })),
      confirmedRounds: { 0: true, 1: true, 2: true },
      gksHistory: { 0: { 0: '우상운', 1: '정보영' } },   // 구버전 저장 형태
      completedMatches: [{ matchId: 'R1_C0', homeIdx: 0, awayIdx: 1 }],
      currentRoundIdx: 3, gks: {},
    };
    const next = gameReducer(s, { type: 'UNCONFIRM_ROUND', roundIdx: 0 });
    expect(next.gksHistory.R0).toEqual({ 0: '우상운', 1: '정보영' });
    expect(resolveRoundGks({
      gksHistory: next.gksHistory, gks: next.gks,
      confirmedRounds: next.confirmedRounds, currentRoundIdx: next.currentRoundIdx,
    }, 0)).toEqual({ 0: '우상운', 1: '정보영' });
  });

  it('승격 후 GK를 한 명만 바꿔도 나머지가 남는다', () => {
    let s = { ...initialState,
      schedule: [{ matches: [[0, 1]] }],
      confirmedRounds: { 0: true },
      gksHistory: { 0: { 0: '우상운', 1: '정보영' } },
      completedMatches: [{ matchId: 'R1_C0', homeIdx: 0, awayIdx: 1 }],
      currentRoundIdx: 1, gks: {},
    };
    s = gameReducer(s, { type: 'UNCONFIRM_ROUND', roundIdx: 0 });
    s = gameReducer(s, { type: 'SET_ROUND_GK', roundIdx: 0, teamIdx: 0, player: '김성환' });
    expect(s.gksHistory.R0).toEqual({ 0: '김성환', 1: '정보영' });
  });
});
