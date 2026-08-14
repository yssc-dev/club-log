import { describe, it, expect } from 'vitest';
import { rankWindow } from '../rankUtils';

const rows = ['가', '나', '다', '라', '마', '바', '사'].map((name, i) => ({ name, rank: i + 1 }));
const names = (arr) => arr.map(r => r.name);

describe('rankWindow', () => {
  it('가운데면 앞뒤 2명씩', () => {
    expect(names(rankWindow(rows, '라'))).toEqual(['나', '다', '라', '마', '바']);
  });

  it('1위여도 5명을 채운다 — 위가 없으면 아래로 밀어서', () => {
    expect(names(rankWindow(rows, '가'))).toEqual(['가', '나', '다', '라', '마']);
  });

  it('꼴등이어도 5명을 채운다 — 아래가 없으면 위로 당겨서', () => {
    expect(names(rankWindow(rows, '사'))).toEqual(['다', '라', '마', '바', '사']);
  });

  it('전체가 5명 미만이면 전부', () => {
    const few = rows.slice(0, 3);
    expect(names(rankWindow(few, '나'))).toEqual(['가', '나', '다']);
  });

  it('내가 목록에 없으면 상위부터 보여준다', () => {
    expect(names(rankWindow(rows, '없는사람'))).toEqual(['가', '나', '다', '라', '마']);
  });

  it('radius를 조절할 수 있다', () => {
    expect(names(rankWindow(rows, '라', 1))).toEqual(['다', '라', '마']);
  });

  it('빈 입력은 빈 배열', () => {
    expect(rankWindow([], '가')).toEqual([]);
    expect(rankWindow(null, '가')).toEqual([]);
  });

  it('player 키도 이름으로 인정한다', () => {
    const p = [{ player: '가' }, { player: '나' }, { player: '다' }];
    expect(rankWindow(p, '나', 1).map(r => r.player)).toEqual(['가', '나', '다']);
  });

  it('입력 배열을 변형하지 않는다', () => {
    const input = [...rows];
    rankWindow(input, '라');
    expect(input).toHaveLength(7);
  });
});
