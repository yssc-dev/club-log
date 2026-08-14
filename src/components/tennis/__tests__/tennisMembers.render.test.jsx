// 로딩게이트 통과 후 실렌더(act). 목록·뱃지·폼·탈퇴토글·쓰기 payload 검증.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { createElement } from 'react';
import { ThemeProvider } from '../../../hooks/useTheme';
import TennisMembers from '../TennisMembers';

const { writeMock, getAdminMock, MEMBERS } = vi.hoisted(() => ({
  writeMock: vi.fn(() => Promise.resolve({ success: true })),
  getAdminMock: vi.fn(),
  MEMBERS: [
    // 박성언에 birthDate 주입 — 서버가 실수로 내려도 UI가 노출 안 하는지 방어 검증
    { row: 2, name: '박성언', nickname: '성언', grade: '금배', memberType: '정회원', status: '활동', seasonStartRank: 1, joinDate: '2024-01-01', note: '', birthDate: '1990-05-05' },
    { row: 3, name: '김게스트', nickname: '', grade: '', memberType: '게스트', status: '활동', seasonStartRank: null, joinDate: '', note: '자주옴' },
    { row: 4, name: '탈퇴자', nickname: '', grade: '동배', memberType: '정회원', status: '탈퇴', seasonStartRank: null, joinDate: '', note: '' },
  ],
}));

vi.mock('../../../services/tennisSync', () => ({
  default: { getRosterAdmin: getAdminMock, writeRosterMember: writeMock },
}));

Object.defineProperty(window, 'matchMedia', {
  writable: true, value: (q) => ({ matches: false, media: q, addListener(){}, removeListener(){}, addEventListener(){}, removeEventListener(){}, dispatchEvent(){} }),
});
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let container, root;
beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container);
  writeMock.mockClear();
  getAdminMock.mockReset();
  getAdminMock.mockResolvedValue(MEMBERS.map(m => ({ ...m })));
  window.confirm = vi.fn(() => true);
});
afterEach(() => { act(() => root?.unmount()); container.remove(); });

async function mount() {
  await act(async () => {
    root = createRoot(container);
    root.render(createElement(ThemeProvider, null, createElement(TennisMembers, { C: undefined })));
  });
}
const btn = (text) => [...container.querySelectorAll('button')].find(b => b.textContent.trim() === text);

describe('TennisMembers 실렌더', () => {
  it('로딩 후 목록·정회원/게스트 뱃지·추가버튼 렌더', async () => {
    await mount();
    expect(container.textContent).not.toContain('데이터 로딩중');
    expect(container.textContent).toContain('박성언');
    expect(container.textContent).toContain('김게스트');
    expect(container.textContent).toContain('게스트');
    expect(container.textContent).toContain('정회원');
    expect(btn('+ 회원 추가')).toBeTruthy();
    // 탈퇴자는 기본 숨김
    expect(container.textContent).not.toContain('탈퇴자');
  });

  it('추가 버튼 → 회원 추가 폼 렌더', async () => {
    await mount();
    await act(() => btn('+ 회원 추가').dispatchEvent(new window.MouseEvent('click', { bubbles: true })));
    expect(container.textContent).toContain('회원 추가');
    expect(container.textContent).toContain('이름');
    expect(container.textContent).toContain('구분');
  });

  it('탈퇴 회원 보기 토글 → 탈퇴자 + 복원 버튼', async () => {
    await mount();
    const toggle = [...container.querySelectorAll('button')].find(b => b.textContent.includes('탈퇴 회원 보기'));
    expect(toggle).toBeTruthy();
    await act(() => toggle.dispatchEvent(new window.MouseEvent('click', { bubbles: true })));
    expect(container.textContent).toContain('탈퇴자');
    expect(btn('복원')).toBeTruthy();
  });

  it('탈퇴 클릭 → 확인창 후 writeRosterMember에 status 탈퇴 payload', async () => {
    await mount();
    // 박성언 카드의 탈퇴 버튼(정렬상 김게스트가 먼저라 텍스트로 카드 특정)
    const delBtn = [...container.querySelectorAll('button')]
      .filter(b => b.textContent.trim() === '탈퇴')
      .find(b => b.parentElement.textContent.includes('박성언'));
    expect(delBtn).toBeTruthy();
    await act(async () => { delBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); });
    expect(window.confirm).toHaveBeenCalled();
    expect(writeMock).toHaveBeenCalledTimes(1);
    const payload = writeMock.mock.calls[0][0];
    expect(payload.row).toBe(2);
    expect(payload.status).toBe('탈퇴');
    expect(payload.name).toBe('박성언');
    expect(payload.seasonStartRank).toBe(1);  // 숫자 보존
  });

  it('생년월일은 UI에 노출되지 않음(서버가 내려도 방어)', async () => {
    await mount();
    expect(container.textContent).not.toContain('1990');   // 박성언 birthDate 미표시
  });

  it('조회 실패 시 "불러오지 못했습니다" (빈 목록과 구분)', async () => {
    getAdminMock.mockReset();
    getAdminMock.mockRejectedValue(new Error('관리자 권한이 필요합니다'));
    await mount();
    expect(container.textContent).toContain('불러오지 못했습니다');
    expect(container.textContent).not.toContain('회원이 없습니다');
  });
});
