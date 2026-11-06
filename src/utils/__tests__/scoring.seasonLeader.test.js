// 시즌 누적 크로바/고구마 1위 판정 — 황금크로바/탄고구마 보너스 배율의 입력.
// 선수별집계기록 로그의 크로바/고구마 열은 '횟수'가 아니라 이미 부호가 실린
// 누적 포인트다(크로바 +2/회, 고구마 -1/회). 1위 = 많이 받은 사람이므로
// 고구마는 절대값(=더 음수)이 큰 쪽이 1위다.
import { describe, it, expect } from 'vitest';
import { seasonLeader } from '../scoring';

describe('seasonLeader', () => {
  it('크로바는 누적 포인트가 가장 큰 선수를 1위로 뽑는다', () => {
    expect(seasonLeader({ 우창호: 18, 노필선: 14, 박형조: 14 })).toBe('우창호');
  });

  it('고구마는 음수 누적 포인트의 절대값이 가장 큰 선수를 1위로 뽑는다', () => {
    // 실측(2026-11-05 마스터FC): 우창호 -10, 김성태 -9, 다수 -1.
    // 원시값 내림차순으로 뽑으면 -1 동률자가 1위로 와 tie 로 null 이 된다.
    expect(seasonLeader({ 우창호: -10, 김성태: -9, 김경수: -1, 김병기: -1 })).toBe('우창호');
  });

  it('1위가 동률이면 null (보너스 미적용)', () => {
    expect(seasonLeader({ 김성태: -9, 김성환: -9, 우창호: -1 })).toBe(null);
  });

  it('0점은 집계에서 제외한다', () => {
    expect(seasonLeader({ 우창호: 0, 노필선: 0, 박형조: -2 })).toBe('박형조');
  });

  it('비어 있거나 전부 0이면 null', () => {
    expect(seasonLeader({})).toBe(null);
    expect(seasonLeader({ 우창호: 0 })).toBe(null);
    expect(seasonLeader(null)).toBe(null);
  });
});
