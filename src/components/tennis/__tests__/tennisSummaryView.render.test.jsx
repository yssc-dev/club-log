// TennisSummaryView 렌더 테스트 — 하단 바 [경기로][기록확정][아카이브] 구성과 상태별 노출/활성 검증
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import TennisSummaryView from '../TennisSummaryView';
import { makeStyles } from '../../../styles/theme';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const C = {
  accent: '#5b5bf6', green: '#34c759', orange: '#ff9500', red: '#ff3b30',
  gray: '#8e8e93', grayDark: '#3a3a3c', grayDarker: '#2c2c2e', white: '#fff',
  card: '#fff', cardLight: '#f2f2f7', borderColor: '#d1d1d6', bg: '#f2f2f7',
};
const s = makeStyles(C);

let container, root;
beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); });
afterEach(() => { act(() => root?.unmount()); container.remove(); });

async function mount(props) {
  await act(async () => {
    root = createRoot(container);
    root.render(createElement(TennisSummaryView, { C, styles: s, busy: false, state: { gameFinalized: false, rounds: [] }, ...props }));
  });
}
const buttons = () => Array.from(container.querySelectorAll('button'));
const byText = (t) => buttons().find(b => b.textContent === t);

describe('TennisSummaryView 하단 바', () => {
  it('마감 상태(전송 전): [경기로][기록확정 (구글시트 전송)][아카이브] 한 줄, 상단 뒤로가기 없음', async () => {
    await mount({ isAdmin: true, onBack: vi.fn(), onSubmit: vi.fn(), onArchive: vi.fn() });
    expect(buttons().map(b => b.textContent)).toEqual(['경기로', '기록확정 (구글시트 전송)', '아카이브']);
    expect(container.textContent).not.toContain('경기로 돌아가기');
    expect(byText('기록확정 (구글시트 전송)').disabled).toBe(false);
    expect(byText('아카이브').disabled).toBe(true);           // 전송 전엔 아카이브 불가
  });

  it('"경기로"는 onBack만 호출한다 (상태 변경은 호출부 책임)', async () => {
    const onBack = vi.fn();
    await mount({ isAdmin: true, onBack, onSubmit: vi.fn(), onArchive: vi.fn() });
    await act(async () => { byText('경기로').click(); });
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('전송 완료(gameFinalized): "경기로" 숨김, "전송 완료" 비활성, 아카이브 활성', async () => {
    await mount({ isAdmin: true, state: { gameFinalized: true, rounds: [] }, onBack: vi.fn(), onSubmit: vi.fn(), onArchive: vi.fn() });
    expect(byText('경기로')).toBeUndefined();
    expect(byText('전송 완료').disabled).toBe(true);
    expect(byText('아카이브').disabled).toBe(false);
  });

  it('비관리자: 기록확정·아카이브 비활성, "경기로"는 가능', async () => {
    await mount({ isAdmin: false, onBack: vi.fn(), onSubmit: vi.fn(), onArchive: vi.fn() });
    expect(byText('경기로').disabled).toBe(false);
    expect(byText('기록확정 (관리자만)').disabled).toBe(true);
    expect(byText('아카이브').disabled).toBe(true);
  });
});
