// 베스트 듀오 카드 3장(합작 골·동반 승리·실점 억제) — 풋살 전용.
// 로그_매치 한 행 = 한 라운드, 명단 = 필드 5인 + 그 라운드 GK(our_gk/opponent_gk).
// 승리·실점은 "둘 다 필드로 뛴 라운드"만 집계한다(한쪽이 GK면 그 라운드는 둘의 기록에서 뺀다).
import { describe, it, expect } from 'vitest';
import { calcDuoCards } from '../calcDuoCards';

// 홈 사이드 라운드 한 행. gk 생략 시 GK 미기록(레거시) 행.
const row = (date, id, members, our, opp, extra = {}) => ({
  date, match_id: id,
  our_members_json: JSON.stringify(members),
  opponent_members_json: JSON.stringify(extra.away || []),
  our_score: our, opponent_score: opp,
  our_gk: extra.gk ?? '',
  opponent_gk: extra.awayGk ?? '',
  is_extra: extra.is_extra ?? false,
});
const goal = (scorer, assister, type = 'goal') => ({ event_type: type, player: scorer, related_player: assister });
const find = (list, a, b) => list.find(x => x.members.join('|') === [a, b].sort((p, q) => p.localeCompare(q, 'ko')).join('|'));

describe('calcDuoCards — 합작 골', () => {
  it('어시→골 두 방향을 한 조합으로 합산하고 방향별 수를 남긴다', () => {
    const eventLogs = [
      goal('나', '가'), goal('나', '가'), goal('나', '가'), // 가→나 3
      goal('가', '나'),                                      // 나→가 1
      goal('라', '다'),                                      // 다→라 1
    ];
    const { linkGoals } = calcDuoCards({ matchLogs: [], eventLogs });
    const p = find(linkGoals, '가', '나');
    expect(p.count).toBe(4);
    // members는 가나다순 [가, 나]. aToB = 가 득점(나 어시)=1, bToA = 나 득점(가 어시)=3
    expect(p.members).toEqual(['가', '나']);
    expect(p.aToB).toBe(1);
    expect(p.bToA).toBe(3);
    expect(linkGoals[0].members).toEqual(['가', '나']);
    expect(find(linkGoals, '다', '라').count).toBe(1);
  });

  it('자책골·단독골·자기어시는 합작으로 세지 않는다', () => {
    const eventLogs = [
      goal('가', '', 'owngoal'),
      goal('가', ''),
      goal('가', '가'),
      goal('나', '가'),
    ];
    const { linkGoals } = calcDuoCards({ matchLogs: [], eventLogs });
    expect(linkGoals).toHaveLength(1);
    expect(linkGoals[0].count).toBe(1);
  });

  it('함께 뛴 경기일 수를 붙인다(GK 라운드 포함 — 합작은 명단 기준이 아니라 이벤트 기준)', () => {
    const matchLogs = [
      row('2026-05-07', 'R1_C0', ['가', '나', '다'], 1, 0, { gk: '가' }),
      row('2026-05-14', 'R1_C0', ['가', '나', '다'], 1, 0),
    ];
    const { linkGoals } = calcDuoCards({ matchLogs, eventLogs: [goal('나', '가')] });
    expect(find(linkGoals, '가', '나').sessions).toBe(2);
  });
});

describe('calcDuoCards — 동반 승리', () => {
  it('둘 다 필드로 뛴 라운드의 승수만 세고, 한쪽이 GK인 라운드는 뺀다', () => {
    const matchLogs = [
      row('2026-05-07', 'R1_C0', ['가', '나', '다'], 2, 0, { gk: '다' }), // 가·나 필드 → 승
      row('2026-05-07', 'R2_C0', ['가', '나', '다'], 1, 0, { gk: '가' }), // 가 GK → 가|나 제외, 나|다 포함
      row('2026-05-07', 'R3_C0', ['가', '나', '다'], 0, 1, { gk: '다' }), // 가·나 필드 → 패
    ];
    const { wins } = calcDuoCards({ matchLogs, eventLogs: [] });
    const ganA = find(wins, '가', '나');
    expect(ganA.rounds).toBe(2);
    expect(ganA.wins).toBe(1);
    expect(ganA.losses).toBe(1);
    const naDa = find(wins, '나', '다');
    expect(naDa.rounds).toBe(1); // R2만(R1·R3는 다가 GK)
    expect(naDa.wins).toBe(1);
  });

  it('GK 미기록(레거시) 행은 뺄 수 없어 전원 필드로 본다', () => {
    const matchLogs = [row('2026-02-05', 'R1_C0', ['가', '나'], 1, 0)];
    const { wins } = calcDuoCards({ matchLogs, eventLogs: [] });
    expect(find(wins, '가', '나').wins).toBe(1);
  });

  it('상대 사이드도 집계하고 GK는 opponent_gk로 판정한다', () => {
    const matchLogs = [
      row('2026-05-07', 'R1_C0', ['가', '나'], 0, 3, { gk: '가', away: ['다', '라', '마'], awayGk: '마' }),
    ];
    const { wins } = calcDuoCards({ matchLogs, eventLogs: [] });
    expect(find(wins, '다', '라').wins).toBe(1);   // 상대 사이드 승
    expect(find(wins, '다', '마')).toBeUndefined(); // 마는 GK → 필드 라운드 0
    expect(find(wins, '가', '나')).toBeUndefined(); // 가는 GK
  });

  it('같은 (날짜, match_id) 중복 행은 한 라운드로 센다', () => {
    const r = row('2026-05-07', 'R1_C0', ['가', '나'], 1, 0, { gk: '' });
    const { wins, conceded } = calcDuoCards({ matchLogs: [r, { ...r }], eventLogs: [] });
    // rounds는 Set이라 중복 add로도 1이 된다 — 승수·무실점 수가 두 번 쌓이지 않는지가 진짜 검증
    expect(find(wins, '가', '나').rounds).toBe(1);
    expect(find(wins, '가', '나').wins).toBe(1);
    expect(find(conceded, '가', '나').cleanSheets).toBe(1);
  });

  it('is_extra 행은 제외한다', () => {
    const matchLogs = [row('2026-05-07', 'R1_C0', ['가', '나'], 1, 0, { is_extra: true })];
    const { wins } = calcDuoCards({ matchLogs, eventLogs: [] });
    expect(wins).toEqual([]);
  });

  it('승수 내림차순, 동률은 승률 높은 쪽', () => {
    const matchLogs = [
      // 가|나: 2승 0패 (승률 100%)
      row('2026-05-07', 'R1_C0', ['가', '나'], 1, 0),
      row('2026-05-07', 'R2_C0', ['가', '나'], 1, 0),
      // 다|라: 2승 2패 (승률 50%)
      row('2026-05-07', 'R3_C0', ['다', '라'], 1, 0),
      row('2026-05-07', 'R4_C0', ['다', '라'], 1, 0),
      row('2026-05-07', 'R5_C0', ['다', '라'], 0, 1),
      row('2026-05-07', 'R6_C0', ['다', '라'], 0, 1),
      // 마|바: 3승
      row('2026-05-07', 'R7_C0', ['마', '바'], 1, 0),
      row('2026-05-07', 'R8_C0', ['마', '바'], 1, 0),
      row('2026-05-07', 'R9_C0', ['마', '바'], 1, 0),
    ];
    const { wins } = calcDuoCards({ matchLogs, eventLogs: [] });
    expect(wins.map(p => p.members.join('+'))).toEqual(['마+바', '가+나', '다+라']);
    expect(find(wins, '다', '라').winRate).toBeCloseTo(0.5, 5);
  });
});

describe('calcDuoCards — 실점 억제', () => {
  // 가|나 3일, 다|라 1일 → 최대 3일의 30% 올림 = 1일 … 진입선이 걸리게 날짜를 더 벌린다
  const days = (n, members, our, opp) => Array.from({ length: n }, (_, i) =>
    row(`2026-05-${String(i + 1).padStart(2, '0')}`, 'R1_C0', members, our, opp));

  it('둘 다 필드로 뛴 라운드의 경기당 실점을 오름차순으로 두고 무실점 수를 붙인다', () => {
    const matchLogs = [
      ...days(4, ['가', '나'], 1, 0),            // 4R 0실점
      ...days(4, ['다', '라'], 1, 2),            // 4R 8실점 → 2.00
      row('2026-06-01', 'R1_C0', ['가', '나', '마'], 0, 3, { gk: '가' }), // 가 GK → 가|나 집계에서 제외
    ];
    const { conceded } = calcDuoCards({ matchLogs, eventLogs: [] });
    const ganA = find(conceded, '가', '나');
    expect(ganA.rounds).toBe(4);
    expect(ganA.conceded).toBe(0);
    expect(ganA.concededPerRound).toBe(0);
    expect(ganA.cleanSheets).toBe(4);
    expect(find(conceded, '다', '라').concededPerRound).toBeCloseTo(2, 5);
    expect(conceded[0].members).toEqual(['가', '나']);
  });

  it('진입선은 함께 뛴 경기일 수 최대치의 30%(올림)이고 미달 조합은 뺀다', () => {
    const matchLogs = [
      ...days(10, ['가', '나'], 1, 1),  // 10일
      ...days(2, ['다', '라'], 1, 0),   // 2일 → 10×0.3=3일 미달
    ];
    const r = calcDuoCards({ matchLogs, eventLogs: [] });
    expect(r.minSessions).toBe(3);
    expect(r.maxSessions).toBe(10);
    expect(find(r.conceded, '다', '라')).toBeUndefined();
    expect(find(r.conceded, '가', '나')).toBeTruthy();
  });

  it('경기일 수는 날짜 기준(같은 날 여러 라운드는 1일)', () => {
    const matchLogs = [
      row('2026-05-07', 'R1_C0', ['가', '나'], 1, 0),
      row('2026-05-07', 'R2_C0', ['가', '나'], 1, 0),
      row('2026-05-14', 'R1_C0', ['가', '나'], 1, 0),
    ];
    const { conceded } = calcDuoCards({ matchLogs, eventLogs: [] });
    expect(find(conceded, '가', '나').sessions).toBe(2);
    expect(find(conceded, '가', '나').rounds).toBe(3);
  });
});

describe('calcDuoCards — 공통', () => {
  it('topN으로 각 목록을 자른다', () => {
    const matchLogs = [row('2026-05-07', 'R1_C0', ['가', '나', '다', '라'], 1, 0)];
    const r = calcDuoCards({ matchLogs, eventLogs: [], topN: 2 });
    expect(r.wins).toHaveLength(2);
    expect(r.conceded).toHaveLength(2);
  });

  it('입력이 비면 빈 목록과 진입선 0', () => {
    const r = calcDuoCards({ matchLogs: [], eventLogs: [] });
    expect(r.linkGoals).toEqual([]);
    expect(r.wins).toEqual([]);
    expect(r.conceded).toEqual([]);
    expect(r.minSessions).toBe(0);
  });
});
