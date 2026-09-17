// src/components/__tests__/cupWiring.guard.test.js
// 스펙 §10 불변식 13 — 렌더 하네스가 없는 Root/App/TeamDashboard 배선을 정적으로 고정한다.
// (a) Root 가 gameParams 를 들고 GameApp 에 넘기며 두 곳에서 초기화한다. (b) App 컵 분기가 gameParams.cupId 를 쓴다.
// (c) TeamDashboard 는 tournament 탭을 종목으로 분기한다(Task 8 에서 통과).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel) => fs.readFileSync(path.join(SRC, rel), 'utf8');

describe('Root.jsx — gameParams 배선', () => {
  const src = read('Root.jsx');
  it('state·시그니처·GameApp 전달', () => {
    expect(src).toMatch(/const \[gameParams, setGameParams\] = useState\(null\)/);
    expect(src).toMatch(/const handleStartNew = async \(mode, params = null\)/);
    expect(src).toMatch(/setGameParams\(params\)/);
    expect(src).toMatch(/gameParams=\{gameParams\}/);
  });
  it('이어서 기록·뒤로가기에서 초기화(2곳 이상)', () => {
    expect((src.match(/setGameParams\(null\)/g) || []).length).toBeGreaterThanOrEqual(2);
  });
});

describe('App.jsx — 컵 로드 분기·배너·markLocked', () => {
  const src = read('App.jsx');
  it('gameParams prop 을 받고 컵 분기에서 cupId 를 쓴다', () => {
    expect(src).toMatch(/export default function App\(\{[^}]*gameParams[^}]*\}\)/);
    expect(src).toMatch(/gameMode === "cup"/);
    expect(src).toMatch(/gameParams\?\.cupId/);
  });
  it('컵 세션 배너와 마감 후 markLocked', () => {
    expect(src).toMatch(/CupSync\.markLocked\(/);
    expect((src.match(/\{cupBanner\}/g) || []).length).toBeGreaterThanOrEqual(4);
  });
});
