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

describe('TeamDashboard.jsx — tournament 탭 종목 분기·컵 버튼', () => {
  const src = read('components/dashboard/TeamDashboard.jsx');
  it('풋살은 CupListTab, 축구는 기존 TournamentListTab', () => {
    expect(src).toMatch(/import CupListTab from '\.\.\/cup\/CupListTab'/);
    expect(src).toMatch(/activeTab === "tournament" && \(\s*isSoccer \?/);
    expect(src).toMatch(/<CupListTab/);
  });
  it('경기관리 새 경기 영역에 컵대회 버튼과 선택 모달', () => {
    expect(src).toMatch(/🏆 컵대회 경기/);
    expect(src).toMatch(/onStartGame\("cup", \{ cupId/);
    expect(src).toMatch(/<CupPickerModal/);
  });
  it('activeCups 이펙트가 종목 게이트·active 필터·버튼 노출 조건을 유지한다(M6·M3)', () => {
    expect(src).toMatch(/activeSport !== "풋살"/);
    expect(src).toMatch(/meta\.status === 'active'/);
    expect(src).toMatch(/activeCups\.length > 0/);
  });
});

describe('App.jsx — 컵 경기일 마법사 경유 게이트 (스펙 §6.2 v2.1)', () => {
  const src = read('App.jsx');
  it('컵 로드 분기는 setup 으로 들어가고 로드 시점에 대진을 만들지 않는다', () => {
    // gameMode === "cup" 은 파일에 2곳(113행 로드 프로미스 구성, 234행 디스패치 분기) —
    // 'Promise.all(loadPromises)'(122행, 유일)를 앵커로 써서 두 번째(234행) occurrence 부터 찾는다.
    const start = src.indexOf('gameMode === "cup"', src.indexOf('Promise.all(loadPromises)'));
    const cupBranch = src.slice(start, src.indexOf('phase: "setup"', start) + 20);
    expect(cupBranch).toMatch(/phase: "setup"/);
    expect(cupBranch).not.toMatch(/generateCupRounds\(/);
    expect(cupBranch).not.toMatch(/schedule:/);
  });
  it('startMatches 의 컵 분기가 참석 팀 풀리그×회전 대진을 만든다', () => {
    expect(src).toMatch(/const startMatches = \(\) => \{\s*\n\s*if \(isCupSession\(state\)\)[\s\S]{0,900}buildCupDaySchedule\(/);
  });
  it('시트 연동 두 버튼·활동선수 전체는 컵에서 렌더되지 않는다', () => {
    expect(src).toMatch(/isCup \? \([\s\S]{0,400}CupAttendeePicker/);
    expect(src).toMatch(/isCup \? \([\s\S]{0,200}대회 팀<\/button>/);
  });
  it('팀 수 세그먼트는 컵에서 비활성', () => {
    expect(src).toMatch(/segBtn\(teamCount === n, isCup\)/);
  });
  it('팀명 편집·재배치는 컵에서 막힌다', () => {
    expect(src).toMatch(/draftMode === "snake" && !isCup[\s\S]{0,120}재배치/);
    expect(src).toMatch(/isCup \? \(\s*<span[^>]*>\{teamNames\[tIdx\]\}<\/span>/);
  });
  it('컵 판별에 draftMode 를 쓰지 않는다', () => {
    expect(src).not.toMatch(/draftMode === ['"]cup['"]/);
  });
  // 최종 리뷰 C1: draftMode 는 RTDB 를 왕복하지 않아 복원 기기에서 'snake' 로 드리프트한다.
  // goToTeamBuild 가 draftMode 로만 분기하면 그 기기의 CTA 가 대회 팀을 스네이크 드래프트로 갈아엎는다.
  it('goToTeamBuild 는 컵에서 선행 반환한다(draftMode 드리프트 방어)', () => {
    expect(src).toMatch(/const goToTeamBuild = \(\) => \{\s*\n(\s*\/\/[^\n]*\n)*\s*if \(isCupSession\(state\)\)/);
  });
  // 최종 리뷰 C2: 경기 중 `팀 수정` 이 컵 팀명을 팀XX 로 재계산하면
  // EXIT_TEAM_EDIT_SAVE 의 nameMap 이 이미 확정된 allEvents·completedMatches 팀명까지 덮어쓴다.
  it('경기 중 팀 수정은 컵에서 팀명을 재계산하지 않는다', () => {
    const fnBody = (name) => {
      const start = src.indexOf(`const ${name} = (`);
      expect(start).toBeGreaterThan(-1);
      const end = src.indexOf('\n  const ', start + 1);
      return src.slice(start, end === -1 ? src.length : end);
    };
    for (const name of ['addPlayersToTeam', 'freeRemovePlayer']) {
      const body = fnBody(name);
      expect(body).toMatch(/makeTeamName\(/);
      expect(body).toMatch(/!isCupSession\(state\)[\s\S]{0,300}makeTeamName\(/);
    }
  });
});
