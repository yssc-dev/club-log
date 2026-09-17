import { describe, it, expect } from 'vitest';
import { pendingGameProgressLabel } from '../pendingGameLabel';

describe('pendingGameProgressLabel', () => {
  describe('축구(soccer)', () => {
    it('soccerMatches 중 status=finished 개수를 센다 (휴식 포함)', () => {
      const gs = {
        matchMode: 'soccer',
        soccerMatches: [
          { matchIdx: 0, status: 'finished' },
          { matchIdx: 1, status: 'finished' },
          { matchIdx: 2, status: 'finished', opponent: '휴식' }, // 휴식도 finished
          { matchIdx: 3, status: 'finished' },
          { matchIdx: 4, status: 'finished' },
          { matchIdx: 5, status: 'finished' },
          { matchIdx: 6, status: 'playing' }, // 진행중 → 제외
        ],
      };
      expect(pendingGameProgressLabel(gs)).toBe('6경기 완료');
    });

    it('축구 state에 풋살 잔재 completedMatches가 있어도 무시하고 soccerMatches로 센다 (회귀 방지)', () => {
      // 버그 재현: 과거엔 completedMatches(축구엔 항상 빈배열)를 읽어 항상 "0매치 완료"로 표시됐다.
      const gs = {
        matchMode: 'soccer',
        completedMatches: [], // reconstructState가 축구에 채우는 빈 배열
        soccerMatches: [
          { status: 'finished' },
          { status: 'finished' },
          { status: 'finished' },
        ],
      };
      expect(pendingGameProgressLabel(gs)).toBe('3경기 완료');
    });

    it('완료 경기가 없으면 0경기 완료', () => {
      expect(pendingGameProgressLabel({ matchMode: 'soccer', soccerMatches: [{ status: 'playing' }] })).toBe('0경기 완료');
    });

    it('soccerMatches 미정의여도 안전하게 0경기 완료', () => {
      expect(pendingGameProgressLabel({ matchMode: 'soccer' })).toBe('0경기 완료');
    });
  });

  describe('풋살 대진표(schedule)', () => {
    it('현재라운드/전체라운드 표기', () => {
      const gs = { matchMode: 'schedule', currentRoundIdx: 2, schedule: [[], [], [], []] };
      expect(pendingGameProgressLabel(gs)).toBe('3/4 라운드');
    });

    it('schedule이 비면 매치 완료로 폴백', () => {
      const gs = { matchMode: 'schedule', schedule: [], completedMatches: [{}, {}] };
      expect(pendingGameProgressLabel(gs)).toBe('2매치 완료');
    });
  });

  describe('풋살 자유대진/밀어내기', () => {
    it('completedMatches 길이로 매치 완료 표기', () => {
      expect(pendingGameProgressLabel({ matchMode: 'free', completedMatches: [{}, {}, {}] })).toBe('3매치 완료');
      expect(pendingGameProgressLabel({ matchMode: 'push', completedMatches: [{}] })).toBe('1매치 완료');
    });
  });

  it('빈 객체/undefined 입력도 크래시 없이 0매치 완료', () => {
    expect(pendingGameProgressLabel()).toBe('0매치 완료');
    expect(pendingGameProgressLabel({})).toBe('0매치 완료');
  });
});

describe('컵 세션 라벨 (스펙 §6.1)', () => {
  it('tournamentId 가 있으면 🏆 접두, 나머지 동일', () => {
    const gs = { matchMode: 'schedule', schedule: [{}, {}, {}], currentRoundIdx: 1, tournamentId: '마스터스컵 2026' };
    expect(pendingGameProgressLabel(gs)).toBe('🏆 2/3 라운드');
    expect(pendingGameProgressLabel({ ...gs, tournamentId: '' })).toBe('2/3 라운드');
  });
});
