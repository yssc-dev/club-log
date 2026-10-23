import { describe, it, expect } from 'vitest';
import { inspectSessionPlayerRemoval } from '../sessionPlayerRemoval';

describe('inspectSessionPlayerRemoval', () => {
  const session = {
    allEvents: [
      { type: 'goal', player: '박재운', assist: '김종현', concedingGk: '정보영' },
      { type: 'owngoal', player: '조정', concedingGk: '우상운' },
      { type: 'foul', player: '남인진' },
    ],
    completedMatches: [
      { matchId: 'R7_C0', homeGk: '우상운', awayGk: '정보영',
        homePlayers: ['김성환', '김형욱', '박재운'], awayPlayers: ['노필선'] },
      { matchId: 'R8_C0', homeGk: '우상운', awayGk: '정보영',
        homePlayers: ['김성환', '김형욱'], awayPlayers: ['노필선'] },
    ],
    gks: {},
    gksHistory: { 6: { 0: '우상운', 1: '정보영' } },
  };

  it('기록이 없는 선수는 제외 가능 — 박제된 확정 매치 수를 알려준다', () => {
    const r = inspectSessionPlayerRemoval(session, '김형욱');
    expect(r.blocked).toBe(false);
    expect(r.reasons).toEqual([]);
    expect(r.matchesListed).toBe(2);
  });

  it('득점자는 막는다', () => {
    const r = inspectSessionPlayerRemoval(session, '박재운');
    expect(r.blocked).toBe(true);
    expect(r.reasons).toContain('골 1');
  });

  it('어시스트만 있어도 막는다', () => {
    expect(inspectSessionPlayerRemoval(session, '김종현')).toMatchObject({
      blocked: true, reasons: ['어시 1'],
    });
  });

  it('자책·파울도 기록으로 센다', () => {
    expect(inspectSessionPlayerRemoval(session, '조정').reasons).toEqual(['자책 1']);
    expect(inspectSessionPlayerRemoval(session, '남인진').reasons).toEqual(['파울 1']);
  });

  it('GK는 기록이 0이어도 막는다 (확정 매치·히스토리·라이브 어디서든)', () => {
    expect(inspectSessionPlayerRemoval(session, '정보영').reasons).toEqual(['GK 지정']);
    const liveOnly = { allEvents: [], completedMatches: [], gks: { 0: '이강국' }, gksHistory: {} };
    expect(inspectSessionPlayerRemoval(liveOnly, '이강국').blocked).toBe(true);
  });

  it('빈 세션·빈 이름에도 안전', () => {
    expect(inspectSessionPlayerRemoval(null, '김형욱')).toEqual({ blocked: false, reasons: [], matchesListed: 0 });
    expect(inspectSessionPlayerRemoval(session, '')).toEqual({ blocked: false, reasons: [], matchesListed: 0 });
  });
});
