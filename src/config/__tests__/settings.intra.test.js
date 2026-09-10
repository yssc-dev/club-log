import { describe, it, expect } from 'vitest';
import { resolvePreset, getPresetValue, PRESETS } from '../settings';

describe('빅마스터FC 자체전 프리셋', () => {
  it('빅마스터FC 축구는 자체전축구 프리셋으로 해석된다', () => {
    expect(resolvePreset('빅마스터FC', '축구')).toBe('자체전축구');
  });
  it('자체전축구 프리셋은 intraSquad=true 를 갖는다', () => {
    expect(getPresetValue('축구', '자체전축구', 'intraSquad')).toBe(true);
    expect(PRESETS.축구['자체전축구'].values).toEqual({ intraSquad: true });
  });
  it('하버FC·마스터FC 해석은 바뀌지 않는다', () => {
    expect(resolvePreset('하버FC', '축구')).toBe('표준축구');
    expect(resolvePreset('마스터FC', '풋살')).toBe('마스터FC풋살');
    expect(getPresetValue('축구', '표준축구', 'intraSquad')).toBeUndefined();
  });
});
