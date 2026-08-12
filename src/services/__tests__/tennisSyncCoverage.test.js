import { describe, it, expect } from 'vitest';
import {
  META_FIELDS,
  WHOLE_REPLACE_FIELDS,
  CHILD_NODE_FIELDS,
  TENNIS_WHOLE_REPLACE_FIELDS,
  expandStateForRtdb,
  reconstructState,
} from '../firebaseSyncDiff';
import { tennisInitialState } from '../../hooks/useTennisReducer';
import { initialState } from '../../hooks/useGameReducer';
import { normalizeTennisMatch } from '../../utils/tennis/normalizeTennisMatch';

// 테니스 전용 로컬 전용 필드 — RTDB에 저장하지 않는다.
// (풋살 LOCAL_ONLY_FIELDS는 풋살 initialState 기준이라 여기에 별도 정의)
const TENNIS_LOCAL_ONLY = [
  'gameId',    // RTDB 노드 경로 자체가 gameId — 필드로 중복 저장 불필요
  'team',      // RTDB 경로에 팀 컨텍스트 포함, loadAllActiveReconstructed 호출부에서 별도 전달
  'viewingRoundIdx', // 보기 위치 — 사용자별 로컬, 원격값 무시 (풋살 LOCAL_ONLY_FIELDS와 동일 이유)
];

// 왕복 검증용 테니스 상태 — 라운드 1개, 코트 1개, 세트 스코어 4:3, stats, guests, scoringRules 포함
const SAMPLE_TENNIS_STATE = {
  gameId: 'game-test-1',
  team: '마스터FC',
  sport: '테니스',
  gameDate: '2026-08-07',
  season: '2026-S2',
  phase: 'playing',
  attendees: ['선수A', '선수B'],
  guests: ['손님C'],
  gameCreator: '홍길동',
  gameFinalized: false,
  viewingRoundIdx: 1,
  scoringRules: { tiebreakMode: '1point', acesDfAffectScore: true },
  rounds: [
    {
      roundIdx: 1,
      courts: [
        {
          courtId: 1,
          format: '단식',
          bestOf: 1,
          status: 'playing',
          sideA: ['선수A'],
          sideB: ['선수B'],
          sets: [{ a: 4, b: 3, tbA: 0, tbB: 0, done: false }],
          currentSet: 0,
          stats: { '선수A': { aces: 2, df: 0 } },
          undoStack: [],
        },
      ],
    },
  ],
};

describe('테니스 RTDB 동기화 — 왕복 테스트', () => {
  it('expandStateForRtdb → reconstructState 왕복 후 rounds 스코어가 원본과 같아야 한다', () => {
    const expanded = expandStateForRtdb(SAMPLE_TENNIS_STATE);
    const result = reconstructState('game-test-1', expanded);

    // rounds 배열이 살아남았는지
    expect(Array.isArray(result.rounds)).toBe(true);
    expect(result.rounds).toHaveLength(1);

    // 스코어 값 자체를 확인 — 빈 배열이면 이 단언에서 실패한다
    const court = result.rounds[0].courts[0];
    expect(court.sets[0].a).toBe(4);
    expect(court.sets[0].b).toBe(3);
  });

  it('expandStateForRtdb → reconstructState 왕복 후 guests가 살아남아야 한다', () => {
    const expanded = expandStateForRtdb(SAMPLE_TENNIS_STATE);
    const result = reconstructState('game-test-1', expanded);

    expect(Array.isArray(result.guests)).toBe(true);
    expect(result.guests).toContain('손님C');
  });

  it('expandStateForRtdb → reconstructState 왕복 후 sport/gameDate/season이 살아남아야 한다', () => {
    const expanded = expandStateForRtdb(SAMPLE_TENNIS_STATE);
    const result = reconstructState('game-test-1', expanded);

    expect(result.sport).toBe('테니스');
    expect(result.gameDate).toBe('2026-08-07');
    expect(result.season).toBe('2026-S2');
  });

  it('stats가 왕복 후에도 유지돼야 한다', () => {
    const expanded = expandStateForRtdb(SAMPLE_TENNIS_STATE);
    const result = reconstructState('game-test-1', expanded);

    const court = result.rounds[0].courts[0];
    expect(court.stats['선수A'].aces).toBe(2);
  });

  it('scoringRules가 왕복(expand→reconstruct→normalize) 전체 체인 후 보존돼야 한다', () => {
    const expanded = expandStateForRtdb(SAMPLE_TENNIS_STATE);
    // TENNIS_WHOLE_REPLACE_FIELDS에 등록됐는지 확인 — scoringRules가 포함돼야 전달된다
    expect(expanded.scoringRules).toEqual({ tiebreakMode: '1point', acesDfAffectScore: true });
    const result = reconstructState('game-test-1', expanded);
    expect(result.scoringRules).toEqual({ tiebreakMode: '1point', acesDfAffectScore: true });
    // normalize 체인 — reconstructState가 기본값을 땜질하지 않고 normalizeTennisMatch가 담당함을 검증
    const normalized = normalizeTennisMatch(result);
    expect(normalized.scoringRules).toEqual({ tiebreakMode: '1point', acesDfAffectScore: true });
  });
});

describe('테니스 initialState 필드 분류 가드', () => {
  it('tennisInitialState의 모든 필드는 5분류 중 하나에 속해야 한다', () => {
    const allSets = new Set([
      ...META_FIELDS,
      ...WHOLE_REPLACE_FIELDS,
      ...CHILD_NODE_FIELDS,
      ...TENNIS_WHOLE_REPLACE_FIELDS,
      ...TENNIS_LOCAL_ONLY,
    ]);
    const unclassified = Object.keys(tennisInitialState).filter(k => !allSets.has(k));
    // 실패 시: tennisInitialState에 새 필드가 추가됐으면 위의 5개 분류 중 하나에 넣어라.
    expect(unclassified).toEqual([]);
  });
});

describe('풋살 회귀 — 풋살 상태에 테니스 키가 생기지 않아야 한다', () => {
  it('풋살 initialState를 expandStateForRtdb에 통과시켜도 rounds/guests 키가 생기지 않는다', () => {
    const expanded = expandStateForRtdb(initialState);

    expect('rounds' in expanded).toBe(false);
    expect('guests' in expanded).toBe(false);
    expect('scoringRules' in expanded).toBe(false);
  });

  it('풋살 initialState를 expandStateForRtdb에 통과시켜도 meta.sport 키가 생기지 않는다', () => {
    const expanded = expandStateForRtdb(initialState);

    // 풋살 initialState에는 sport 필드가 없으므로 meta에도 포함되지 않아야 한다
    expect('sport' in expanded.meta).toBe(false);
  });
});
