// 스펙 §6.5 불변식 1 — 정규 마감은 5개 시트를 이 순서로, 컵 마감은 로그 3종만.
import { describe, it, expect } from 'vitest';
import { selectFinalizeWrites, REGULAR_FINALIZE_WRITES, CUP_FINALIZE_WRITES } from '../cup/finalizeWrites';

describe('selectFinalizeWrites', () => {
  it('정규: 포인트로그 → 선수별집계 → 로그_이벤트 → 로그_선수경기 → 로그_매치 (App.jsx allSettled 순서)', () => {
    expect(selectFinalizeWrites(false)).toEqual(['pointLog', 'playerLog', 'rawEvents', 'rawPlayerGames', 'matchLog']);
    expect(REGULAR_FINALIZE_WRITES).toEqual(['pointLog', 'playerLog', 'rawEvents', 'rawPlayerGames', 'matchLog']);
  });
  it('컵: 로그 3종만 — 포인트로그·선수별집계는 절대 포함하지 않는다', () => {
    const w = selectFinalizeWrites(true);
    expect(w).toEqual(['rawEvents', 'rawPlayerGames', 'matchLog']);
    expect(w).not.toContain('pointLog');
    expect(w).not.toContain('playerLog');
    expect(CUP_FINALIZE_WRITES).toEqual(w);
  });
  it('반환 배열은 호출마다 새 배열(호출부가 변형해도 상수가 안 바뀜)', () => {
    const a = selectFinalizeWrites(true); a.push('x');
    expect(selectFinalizeWrites(true)).toEqual(['rawEvents', 'rawPlayerGames', 'matchLog']);
  });
});
