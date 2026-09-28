// src/components/__tests__/backNavigation.guard.test.js
// 브라우저 뒤로가기 1단계(화면 단위) 배선을 정적으로 고정한다 — Root/HistoryView 는 렌더 하네스가 없다.
// 대시보드 ↔ 기록 보관소/설정/경기 화면, 보관소 목록 ↔ 상세.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel) => fs.readFileSync(path.join(SRC, rel), 'utf8');

describe('Root.jsx — 화면 단위 뒤로가기', () => {
  const src = read('Root.jsx');
  it('훅을 import 하고 history·settings·app 세 화면에 건다', () => {
    expect(src).toMatch(/import \{ useBackNavigation \} from '\.\/hooks\/useBackNavigation'/);
    expect(src).toMatch(/useBackNavigation\(screen === "history", backToDashboard\)/);
    expect(src).toMatch(/useBackNavigation\(screen === "settings", backToDashboard\)/);
    expect(src).toMatch(/useBackNavigation\(screen === "app", backToMenu\)/);
  });
  it('경기 화면의 onBackToMenu 와 뒤로가기가 같은 핸들러(backToMenu)를 쓴다', () => {
    expect(src).toMatch(/onBackToMenu=\{backToMenu\}/);
    expect((src.match(/const backToMenu = /g) || []).length).toBe(1);
  });
});

describe('HistoryView.jsx — 목록 ↔ 상세 뒤로가기', () => {
  const src = read('components/history/HistoryView.jsx');
  it('상세가 열려 있을 때 뒤로가기가 상세를 닫는다', () => {
    expect(src).toMatch(/import \{ useBackNavigation \} from '\.\.\/\.\.\/hooks\/useBackNavigation'/);
    expect(src).toMatch(/useBackNavigation\(!!selectedGame, \(\) => setSelectedGame\(null\)\)/);
  });
});
