import { describe, it, expect } from 'vitest';
import { calcVolatility } from '../calcVolatility';

describe('calcVolatility', () => {
  it('minGames 미달 선수는 양쪽 모두 제외', () => {
    const logs = [
      { player: 'A', goals: 2, assists: 1 },
      { player: 'A', goals: 1, assists: 0 },
    ];
    const r = calcVolatility({ playerLogs: logs, minGames: 5 });
    expect(r.streaky).toEqual([]);
    expect(r.consistent).toEqual([]);
  });

  it('std 큰 선수가 streaky 1위', () => {
    const flat = Array.from({ length: 5 }, () => ({ player: 'Flat', goals: 1, assists: 0 }));
    const swing = [
      { player: 'Swing', goals: 5, assists: 0 },
      { player: 'Swing', goals: 0, assists: 0 },
      { player: 'Swing', goals: 5, assists: 0 },
      { player: 'Swing', goals: 0, assists: 0 },
      { player: 'Swing', goals: 0, assists: 0 },
    ];
    const r = calcVolatility({ playerLogs: [...flat, ...swing], minGames: 5 });
    expect(r.streaky[0].player).toBe('Swing');
  });

  it('std 0인 0골 선수는 꾸준형에 안 들어감 (중앙값 미만)', () => {
    const zeros = Array.from({ length: 5 }, () => ({ player: 'Zero', goals: 0, assists: 0 }));
    const high = Array.from({ length: 5 }, () => ({ player: 'High', goals: 3, assists: 1 }));
    const r = calcVolatility({ playerLogs: [...zeros, ...high], minGames: 5 });
    // Zero는 std=0이지만 mean=0이라 중앙값 미만 → 제외, High만 노출
    expect(r.consistent.map(x => x.player)).toEqual(['High']);
  });

  it('동률 std는 한글 가나다순', () => {
    const a = Array.from({ length: 5 }, (_, i) => ({ player: '가', goals: i % 2, assists: 0 }));
    const b = Array.from({ length: 5 }, (_, i) => ({ player: '나', goals: i % 2, assists: 0 }));
    const r = calcVolatility({ playerLogs: [...a, ...b], minGames: 5 });
    expect(r.streaky.map(x => x.player)).toEqual(['가', '나']);
  });

  it('mean과 std 값을 정확히 계산 (표본 분산 ÷(n-1) — 소표본 과소추정 보정)', () => {
    const logs = [
      { player: 'P', goals: 0, assists: 0 },
      { player: 'P', goals: 0, assists: 0 },
      { player: 'P', goals: 4, assists: 0 },
      { player: 'P', goals: 4, assists: 0 },
      { player: 'P', goals: 2, assists: 0 },
    ];
    const r = calcVolatility({ playerLogs: logs, minGames: 5 });
    const p = r.streaky.find(x => x.player === 'P');
    expect(p.mean).toBeCloseTo(2, 5);
    // var = ((0-2)^2 + (0-2)^2 + (4-2)^2 + (4-2)^2 + (2-2)^2)/(5-1) = 16/4 = 4 → std=2
    expect(p.std).toBeCloseTo(2, 5);
  });

  it('짝수 인원: 상위 중간값 선수는 꾸준형 후보 유지 (중앙값 평균화 회귀 방지)', () => {
    // 필터 경계 후보는 항상 모집단 구성원이라 두 중간값 '사이' 평균은 존재 불가 —
    // 중앙값 공식 교체(평균화)로 포함/제외가 바뀌는 선수는 없어야 한다.
    const mk = (name, g) => Array.from({ length: 5 }, () => ({ player: name, goals: g, assists: 0 }));
    const logs = [...mk('하', 0), ...mk('중하', 1), ...mk('중상', 2), ...mk('상', 3)];
    const r = calcVolatility({ playerLogs: logs, minGames: 5, topN: 4 });
    // 참 중앙값 (1+2)/2 = 1.5 → '중상'(2)·'상'(3) 포함, '중하'(1) 제외
    expect(r.consistent.map(x => x.player).sort()).toEqual(['상', '중상']);
  });
});
