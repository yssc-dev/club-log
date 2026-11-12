import { describe, it, expect } from 'vitest';
import { calcLinkGoals } from '../calcLinkGoals';

const goal = (p, a) => ({ event_type: 'goal', player: p, related_player: a });
const ml = (date, members, extra = false) => ({ date, our_members_json: JSON.stringify(members), is_extra: extra });

describe('calcLinkGoals', () => {
  it('두 방향 합산 + 방향별 분해 + 함께 뛴 경기일', () => {
    const r = calcLinkGoals({
      matchLogs: [ml('2026-11-01', ['나', '가']), ml('2026-11-01', ['가', '나']), ml('2026-11-08', ['가', '나']), ml('2026-11-09', ['가', '나'], true)],
      eventLogs: [goal('가', '나'), goal('나', '가'), goal('나', '가')],
    });
    expect(r).toEqual([{ members: ['가', '나'], count: 3, aToB: 1, bToA: 2, sessions: 2, rank: 1 }]);
  });
  it('어시 없음·자기 어시·골 아닌 이벤트는 제외', () => {
    const r = calcLinkGoals({ matchLogs: [], eventLogs: [goal('가', ''), goal('가', '가'), { event_type: 'owngoal', player: '가', related_player: '나' }] });
    expect(r).toEqual([]);
  });
  it('동률은 공동 순위, topN 경계 동률은 포함', () => {
    const ev = [goal('가', '나'), goal('가', '나'), goal('다', '라'), goal('다', '라'), goal('마', '바')];
    const r = calcLinkGoals({ matchLogs: [], eventLogs: ev, topN: 1 });
    expect(r.map(p => [p.members.join(''), p.rank])).toEqual([['가나', 1], ['다라', 1]]);
  });
  it('경계 동률 무리가 너무 크면 그 무리를 통째로 뺀다', () => {
    const names = '가나다라마바사아자차카타파하'.split('');
    const ev = [goal('갑', '을'), goal('갑', '을'), ...names.slice(0, 7).map((n, i) => goal(n, names[i + 7]))];
    // topN 2 → 경계(2위)가 1골 7조합 동률 → 포함하면 8행 > 2+5 → 1골 무리 통째 제외
    const r = calcLinkGoals({ matchLogs: [], eventLogs: ev, topN: 2 });
    expect(r.map(p => p.count)).toEqual([2]);
  });
});
