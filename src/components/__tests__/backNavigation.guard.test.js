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

describe('2단계 — 대시보드 서브 화면·공용 Modal', () => {
  it('공용 Modal 은 열려 있는 동안 항목을 쌓고 뒤로가기로 onClose 를 부른다', () => {
    const src = read('components/common/Modal.jsx');
    expect(src).toMatch(/import \{ useBackNavigation \} from '\.\.\/\.\.\/hooks\/useBackNavigation'/);
    expect(src).toMatch(/useBackNavigation\(true, onClose\)/);
  });
  it('풋살 대회 목록 ↔ 상세', () => {
    const src = read('components/cup/CupListTab.jsx');
    expect(src).toMatch(/useBackNavigation\(!!selectedId, \(\) => setSelectedId\(null\)\)/);
  });
  it('축구 대회 목록 ↔ 상세(TournamentListTab)는 기존 onBack 과 같은 동작', () => {
    const src = read('components/tournament/TournamentListTab.jsx');
    expect(src).toMatch(/useBackNavigation\(!!selectedTournament, \(\) => \{ setSelectedTournament\(null\); loadList\(\); \}\)/);
  });
  it('테니스 마감 화면(보고 있을 때만, done 제외)', () => {
    const src = read('TennisApp.jsx');
    expect(src).toMatch(/useBackNavigation\(closed && showSummary && state\.phase !== 'done', \(\) => setShowSummary\(false\)\)/);
  });
});
