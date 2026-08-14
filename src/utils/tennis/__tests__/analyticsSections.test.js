import { describe, it, expect } from 'vitest';
import { analyticsSectionKeys } from '../analyticsSections';

describe('analyticsSectionKeys', () => {
  it('전체(미선택) 복식 = 케미·TB(+베이글)·에이스, 개인섹션 없음', () => {
    const k = analyticsSectionKeys({ player: '', format: '복식', hasLegacy: true });
    expect(k).toEqual(['chemistry', 'tb', 'acedf']);
    expect(k).not.toContain('summary');
    expect(k).not.toContain('partner');
  });
  it('전체 단식 = TB(+베이글)·에이스', () => {
    expect(analyticsSectionKeys({ player: '', format: '단식', hasLegacy: true }))
      .toEqual(['tb', 'acedf']);
  });
  it('개인 복식 = 레이더·요약·파트너·상대·월별·연도별, 전체랭킹 없음', () => {
    const k = analyticsSectionKeys({ player: '박성언', format: '복식', hasLegacy: true });
    expect(k).toEqual(['radar', 'summary', 'partner', 'h2h', 'monthly', 'yearly']);
    expect(k).not.toContain('doublesStandings');
    expect(k).not.toContain('tb');
  });
  it('개인 단식 = 레이더·요약·상대·월별·연도별(파트너 없음)', () => {
    expect(analyticsSectionKeys({ player: '박성언', format: '단식', hasLegacy: true }))
      .toEqual(['radar', 'summary', 'h2h', 'monthly', 'yearly']);
  });
  it('레거시 없으면 yearly 제외', () => {
    expect(analyticsSectionKeys({ player: '박성언', format: '복식', hasLegacy: false }))
      .toEqual(['radar', 'summary', 'partner', 'h2h', 'monthly']);
  });
  it('월 선택 시(hasMonth) 개인뷰에서 monthly 제외', () => {
    const k = analyticsSectionKeys({ player: '박성언', format: '복식', hasLegacy: true, hasMonth: true });
    expect(k).toEqual(['radar', 'summary', 'partner', 'h2h', 'yearly']);
    expect(k).not.toContain('monthly');
  });
  it('mode/hasMonth 미지정 시 레이더 포함(Tier 1 추가)', () => {
    expect(analyticsSectionKeys({ player: '박성언', format: '복식', hasLegacy: true }))
      .toEqual(['radar', 'summary', 'partner', 'h2h', 'monthly', 'yearly']);
  });
});
