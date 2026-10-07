// 사람별 역할 횟수 집계. 입력은 로그_매치 행의 roles_json.
import { describe, it, expect } from 'vitest';
import { calcRoleCounts } from '../calcRoleCounts';

const row = (roles) => ({ roles_json: roles === null ? '' : JSON.stringify(roles) });

describe('calcRoleCounts', () => {
  it('빈 입력 → 빈 결과 + hasAny false', () => {
    expect(calcRoleCounts([])).toEqual({ rows: [], hasAny: false });
    expect(calcRoleCounts(null)).toEqual({ rows: [], hasAny: false });
    expect(calcRoleCounts(undefined)).toEqual({ rows: [], hasAny: false });
  });

  it('roles_json 이 전부 비면 hasAny false (레거시 행만 있는 상태)', () => {
    expect(calcRoleCounts([row(null), row(null)])).toEqual({ rows: [], hasAny: false });
  });

  it('역할별 횟수를 센다', () => {
    const { rows, hasAny } = calcRoleCounts([
      row({ camera: ['X'], referee: 'Y', assistants: ['Z', 'W'] }),
      row({ camera: ['X'], referee: 'X', assistants: [] }),
    ]);
    expect(hasAny).toBe(true);
    const byName = Object.fromEntries(rows.map(r => [r.name, r]));
    expect(byName.X).toEqual({ name: 'X', camera: 2, referee: 1, assistant: 0, total: 3 });
    expect(byName.Y).toEqual({ name: 'Y', camera: 0, referee: 1, assistant: 0, total: 1 });
    expect(byName.Z).toEqual({ name: 'Z', camera: 0, referee: 0, assistant: 1, total: 1 });
    expect(byName.W).toEqual({ name: 'W', camera: 0, referee: 0, assistant: 1, total: 1 });
  });

  it('역할 1회 이상인 사람만 담는다 (0회는 행이 없다)', () => {
    const { rows } = calcRoleCounts([row({ camera: ['X'], referee: '', assistants: [] })]);
    expect(rows.map(r => r.name)).toEqual(['X']);
  });

  it('합계 내림차순, 동점은 이름 오름차순으로 정렬한다', () => {
    const { rows } = calcRoleCounts([
      row({ camera: ['b', 'a'], referee: 'c', assistants: [] }),
      row({ camera: ['c'], referee: 'c', assistants: [] }),
    ]);
    // c=3(referee2+camera1), a=1, b=1 → c, a, b
    expect(rows.map(r => r.name)).toEqual(['c', 'a', 'b']);
  });

  it('깨진 JSON 행은 건너뛴다 (크래시 금지)', () => {
    const { rows, hasAny } = calcRoleCounts([
      { roles_json: '{nope' },
      row({ camera: ['X'], referee: '', assistants: [] }),
    ]);
    expect(hasAny).toBe(true);
    expect(rows.map(r => r.name)).toEqual(['X']);
  });

  it('roles_json 키가 아예 없는 행도 건너뛴다', () => {
    expect(calcRoleCounts([{ date: '2026-10-07' }])).toEqual({ rows: [], hasAny: false });
  });

  it('부심 3명이 적힌 이상 행은 2명까지만 센다 (parseRoles 상한)', () => {
    const { rows } = calcRoleCounts([row({ camera: [], referee: '', assistants: ['a', 'b', 'c'] })]);
    expect(rows.map(r => r.name).sort()).toEqual(['a', 'b']);
  });
});
