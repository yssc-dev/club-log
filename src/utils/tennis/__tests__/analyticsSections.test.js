import { describe, it, expect } from 'vitest';
import { analyticsSectionKeys } from '../analyticsSections';

describe('analyticsSectionKeys', () => {
  it('전체지표 복식 = 케미·TB(+베이글)·에이스', () => {
    expect(analyticsSectionKeys({ view: 'overall', format: '복식', hasLegacy: true }))
      .toEqual(['chemistry', 'tb', 'acedf']);
  });
  it('전체지표 단식 = TB(+베이글)·에이스', () => {
    expect(analyticsSectionKeys({ view: 'overall', format: '단식', hasLegacy: true }))
      .toEqual(['tb', 'acedf']);
  });

  it('개인지표 선수 미선택 = 빈 목록(힌트 표시용)', () => {
    expect(analyticsSectionKeys({ view: 'individual', player: '', indivTab: 'summary', hasLegacy: true })).toEqual([]);
  });

  it('개인 요약 탭 = 레이더 + 최근경기 + 요약 대시보드', () => {
    expect(analyticsSectionKeys({ view: 'individual', indivTab: 'summary', player: '박성언', hasLegacy: true }))
      .toEqual(['radar', 'recent', 'summaryDash']);
  });

  it('개인 복식 탭 = 종목요약·파트너·상대·월별·연도별', () => {
    expect(analyticsSectionKeys({ view: 'individual', indivTab: '복식', player: '박성언', hasLegacy: true }))
      .toEqual(['formatSummary', 'partner', 'h2h', 'monthly', 'yearly']);
  });

  it('개인 단식 탭 = 종목요약·상대·월별·연도별(파트너 없음)', () => {
    expect(analyticsSectionKeys({ view: 'individual', indivTab: '단식', player: '박성언', hasLegacy: true }))
      .toEqual(['formatSummary', 'h2h', 'monthly', 'yearly']);
  });

  it('레거시 없으면 yearly 제외', () => {
    expect(analyticsSectionKeys({ view: 'individual', indivTab: '단식', player: '박성언', hasLegacy: false }))
      .toEqual(['formatSummary', 'h2h', 'monthly']);
  });

  it('월 선택 시(hasMonth) monthly 제외', () => {
    expect(analyticsSectionKeys({ view: 'individual', indivTab: '복식', player: '박성언', hasLegacy: true, hasMonth: true }))
      .toEqual(['formatSummary', 'partner', 'h2h', 'yearly']);
  });
});
