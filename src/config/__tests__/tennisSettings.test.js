import { describe, it, expect } from 'vitest';
import {
  SPORT_DEFAULTS, PRESETS, resolvePreset,
  isLegacyFormat, migrateToNested,
} from '../settings';

describe('테니스 기본값', () => {
  it('SPORT_DEFAULTS에 테니스가 있다', () => {
    expect(SPORT_DEFAULTS['테니스']).toBeDefined();
    expect(SPORT_DEFAULTS['테니스'].pointRules).toMatchObject({ baseWin: 1, gradeUpset: 5 });
  });

  it('PRESETS에 표준테니스가 있다', () => {
    expect(PRESETS['테니스']['표준테니스']).toBeDefined();
  });

  it('resolvePreset이 undefined를 반환하지 않는다 (Firebase set()이 undefined를 거부)', () => {
    expect(resolvePreset('아무팀', '테니스')).toBe('표준테니스');
  });
});

describe('isLegacyFormat', () => {
  it('테니스 키만 있는 설정을 레거시로 오판하지 않는다', () => {
    expect(isLegacyFormat({ '테니스': { preset: '표준테니스', overrides: {} } })).toBe(false);
  });

  it('회귀 — 풋살만 있는 설정은 여전히 false', () => {
    expect(isLegacyFormat({ '풋살': { preset: '표준풋살', overrides: {} } })).toBe(false);
  });

  it('회귀 — 진짜 레거시(flat)는 여전히 true', () => {
    expect(isLegacyFormat({ ownGoalPoint: -2, sheetId: 'abc' })).toBe(true);
  });
});

describe('migrateToNested', () => {
  it('테니스 팀의 설정을 버리지 않는다', () => {
    const out = migrateToNested('몽피스', { sheetId: 'abc' }, [{ mode: '테니스' }]);
    expect(out['테니스']).toBeDefined();
    expect(out['테니스'].preset).toBe('표준테니스');
    expect(out.shared.sheetId).toBe('abc');
  });

  it('회귀 — 풋살 팀 마이그레이션 결과가 그대로다', () => {
    const out = migrateToNested('마스터FC', { ownGoalPoint: -2 }, [{ mode: '풋살' }]);
    expect(out['풋살']).toBeDefined();
    expect(out['테니스']).toBeUndefined();
  });

  it('겸직 팀이면 두 종목 다 살아남는다', () => {
    const out = migrateToNested('겸직팀', {}, [{ mode: '풋살' }, { mode: '테니스' }]);
    expect(out['풋살']).toBeDefined();
    expect(out['테니스']).toBeDefined();
  });
});
