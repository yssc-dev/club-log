// 분석탭 렌더 스모크 — build/vitest가 못 잡는 렌더 크래시(TDZ, undefined 접근) 방어.
// 2026-07-03 지표 개편(레이더 null 축, 클러치, 라이벌, attackLift, 어시효율, MVP) 경로 커버.
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { ThemeProvider } from '../../../../hooks/useTheme';
import PersonalAnalysisTab from '../PersonalAnalysisTab';
import AwardsTab from '../AwardsTab';
import GoldenTrioView from '../GoldenTrioView';
import RivalryView from '../RivalryView';
import SynergyMatrixTab from '../SynergyMatrixTab';

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (q) => ({ matches: false, media: q, onchange: null, addListener(){}, removeListener(){}, addEventListener(){}, removeEventListener(){}, dispatchEvent(){} }),
});

// 합성 풋살 데이터: 2세션, A·B vs C·D 로테이션, GK 일부 기록
const matchLogs = [
  { date: '2026-06-04', match_id: 'R1_C1', our_members_json: '["A","B"]', opponent_members_json: '["C","D"]', our_score: 2, opponent_score: 1, our_gk: 'B', opponent_gk: 'D', round_idx: 1 },
  { date: '2026-06-04', match_id: 'R2_C1', our_members_json: '["A","C"]', opponent_members_json: '["B","D"]', our_score: 1, opponent_score: 1, our_gk: 'A', opponent_gk: 'D', round_idx: 2 },
  { date: '2026-06-04', match_id: 'R3_C1', our_members_json: '["A","D"]', opponent_members_json: '["B","C"]', our_score: 0, opponent_score: 2, our_gk: 'D', opponent_gk: 'B', round_idx: 3 },
  { date: '2026-06-11', match_id: 'R1_C1', our_members_json: '["A","B"]', opponent_members_json: '["C","D"]', our_score: 3, opponent_score: 0, our_gk: 'B', opponent_gk: 'C', round_idx: 1 },
  { date: '2026-06-11', match_id: 'R2_C1', our_members_json: '["C","A"]', opponent_members_json: '["D","B"]', our_score: 1, opponent_score: 0, our_gk: 'C', opponent_gk: 'B', round_idx: 2 },
];
const eventLogs = [
  { event_type: 'goal', player: 'A', related_player: 'B', date: '2026-06-04', match_id: 'R1_C1', input_time: '2026-06-04 20:01:00.000' },
  { event_type: 'goal', player: 'C', related_player: '', date: '2026-06-04', match_id: 'R1_C1', input_time: '2026-06-04 20:05:00.000' },
  { event_type: 'goal', player: 'A', related_player: '', date: '2026-06-04', match_id: 'R1_C1', input_time: '2026-06-04 20:08:00.000' },
  { event_type: 'goal', player: 'A', related_player: 'C', date: '2026-06-04', match_id: 'R2_C1', input_time: '2026-06-04 20:20:00.000' },
  { event_type: 'goal', player: 'B', related_player: '', date: '2026-06-04', match_id: 'R2_C1', input_time: '2026-06-04 20:22:00.000' },
  { event_type: 'goal', player: 'B', related_player: '', date: '2026-06-04', match_id: 'R3_C1', input_time: '2026-06-04 20:31:00.000' },
  { event_type: 'goal', player: 'C', related_player: '', date: '2026-06-04', match_id: 'R3_C1', input_time: '2026-06-04 20:33:00.000' },
  { event_type: 'goal', player: 'A', related_player: 'B', date: '2026-06-11', match_id: 'R1_C1', input_time: '2026-06-11 20:01:00.000' },
  { event_type: 'goal', player: 'A', related_player: '', date: '2026-06-11', match_id: 'R1_C1', input_time: '2026-06-11 20:03:00.000' },
  { event_type: 'goal', player: 'B', related_player: 'A', date: '2026-06-11', match_id: 'R1_C1', input_time: '2026-06-11 20:07:00.000' },
  { event_type: 'goal', player: 'C', related_player: '', date: '2026-06-11', match_id: 'R2_C1', input_time: '2026-06-11 20:15:00.000' },
];
const playerGameLogs = [
  { player: 'A', date: '2026-06-04', goals: 3, assists: 1, keeper_games: 1, conceded: 1, cleansheets: 0, owngoals: 0, rank_score: 3 },
  { player: 'B', date: '2026-06-04', goals: 2, assists: 1, keeper_games: 1, conceded: 1, cleansheets: 0, owngoals: 0, rank_score: 2 },
  { player: 'C', date: '2026-06-04', goals: 2, assists: 1, keeper_games: 0, conceded: 0, cleansheets: 0, owngoals: 0, rank_score: 1 },
  { player: 'D', date: '2026-06-04', goals: 0, assists: 0, keeper_games: 2, conceded: 2, cleansheets: 0, owngoals: 0, rank_score: 1 },
  { player: 'A', date: '2026-06-11', goals: 2, assists: 1, keeper_games: 0, conceded: 0, cleansheets: 0, owngoals: 0, rank_score: 3 },
  { player: 'B', date: '2026-06-11', goals: 1, assists: 1, keeper_games: 2, conceded: 0, cleansheets: 1, owngoals: 0, rank_score: 2 },
  { player: 'C', date: '2026-06-11', goals: 1, assists: 0, keeper_games: 1, conceded: 1, cleansheets: 0, owngoals: 0, rank_score: 2 },
];
const members = [{ name: 'A' }, { name: 'B' }, { name: 'C' }, { name: 'D' }];

const wrap = (comp, props) => renderToStaticMarkup(
  createElement(ThemeProvider, null, createElement(comp, props))
);
const C = {
  accent: '#0f0', black: '#000', white: '#fff', gray: '#888', grayDark: '#666', grayDarker: '#333',
  card: '#111', cardLight: '#222', bg: '#000', borderColor: '#444', green: '#2c5', red: '#e44', orange: '#f80',
};

describe('분석탭 렌더 스모크 (지표 개편 경로)', () => {
  it('PersonalAnalysisTab: 풋살 — 레이더/관여율/PR 렌더, NaN 없음', () => {
    const html = wrap(PersonalAnalysisTab, { playerGameLogs, matchLogs, eventLogs, members, C, authUserName: 'A' });
    expect(html).toContain('팀 득점 관여율');
    expect(html).toContain('랭크점수');
    expect(html).not.toContain('NaN');
  });

  it('PersonalAnalysisTab: 축구 모드 — 라운드 분포 숨김', () => {
    const html = wrap(PersonalAnalysisTab, { playerGameLogs, matchLogs, eventLogs, members, C, authUserName: 'A', isSoccer: true });
    expect(html).not.toContain('라운드 분포');
    expect(html).not.toContain('NaN');
  });

  it('PersonalAnalysisTab: 축구 상대팀별 성적 — 경기당 포인트를 함께 표기', () => {
    // A는 터틀파크 상대 2경기에서 2골 1어시(모두 정식 기록) → 3P / 2경기 = 1.5
    const soccerMatches = [
      { date: '2026-06-10', match_id: '1', game_id: 's_1', opponent_team_name: '터틀파크', our_members_json: '["A","B"]', our_score: 2, opponent_score: 0 },
      { date: '2026-06-17', match_id: '1', game_id: 's_2', opponent_team_name: '터틀파크', our_members_json: '["A","B"]', our_score: 1, opponent_score: 1 },
    ];
    const soccerEvents = [
      { event_type: 'goal', player: 'A', related_player: '', date: '2026-06-10', match_id: '1' },
      { event_type: 'goal', player: 'A', related_player: '', date: '2026-06-10', match_id: '1' },
      { event_type: 'goal', player: 'B', related_player: 'A', date: '2026-06-17', match_id: '1' },
    ];
    const html = wrap(PersonalAnalysisTab, {
      playerGameLogs: [], matchLogs: soccerMatches, eventLogs: soccerEvents,
      members: [{ name: 'A' }, { name: 'B' }], C, authUserName: 'A', isSoccer: true,
    });
    expect(html).toContain('상대팀별 성적');
    expect(html).toContain('1.5P');
    expect(html).not.toContain('NaN');
  });

  it('AwardsTab: 해트트릭/일일MVP/종합포인트/전체 옵션 렌더, 불꽃·클러치 없음', () => {
    const html = wrap(AwardsTab, { playerGameLogs, matchLogs, eventLogs, C });
    expect(html).toContain('해트트릭');
    expect(html).toContain('일일 MVP');
    expect(html).toContain('종합포인트');
    expect(html).toContain('전체');
    expect(html).not.toContain('불꽃');
    expect(html).not.toContain('클러치');
    expect(html).not.toContain('NaN');
  });

  // 크로바(MVP)·고구마(꼴지)는 마스터FC 풋살 커스텀이라 축구엔 개념이 없고,
  // buildRawPlayerGamesFromSoccer가 축구 PG에 crova:0/goguma:0을 박아 합산에도 안 들어간다.
  // 자책골은 축구에도 있지만 용어가 다르다 — 축구는 '자책'(SoccerApp 개인기록 헤더), 풋살은 '역주행'.
  it('AwardsTab: 축구 모드 — 라벨에서 크로바/고구마/역주행을 안 쓴다', () => {
    const html = wrap(AwardsTab, { playerGameLogs, matchLogs, eventLogs, C, isSoccer: true });
    expect(html).not.toContain('크로바');
    expect(html).not.toContain('고구마');
    expect(html).not.toContain('역주행');
    expect(html).toContain('종합포인트 (골+어시+클린+자책)');
  });

  it('AwardsTab: 풋살 모드 — 크로바/고구마/역주행 라벨 유지', () => {
    const html = wrap(AwardsTab, { playerGameLogs, matchLogs, eventLogs, C });
    expect(html).toContain('종합포인트 (골+어시+클린+크로바+고구마+역주행)');
  });

  it('AwardsTab: 축구 모드 — 라운드 흐름 숨김', () => {
    const html = wrap(AwardsTab, { playerGameLogs, matchLogs, eventLogs, C, isSoccer: true });
    expect(html).not.toContain('라운드 흐름');
  });

  it('GoldenTrioView: 공격 케미 병기 렌더', () => {
    const html = wrap(GoldenTrioView, { matchLogs: [...matchLogs, ...matchLogs.map(m => ({ ...m, date: m.date.replace('2026-06', '2026-07') }))], C });
    expect(html).not.toContain('NaN');
  });

  it('RivalryView: 천적/맛집 렌더', () => {
    const html = wrap(RivalryView, { matchLogs, C });
    expect(html).toContain('천적');
    expect(html).not.toContain('NaN');
  });

  it('SynergyMatrixTab: 매트릭스 렌더', () => {
    const html = wrap(SynergyMatrixTab, { matchLogs, C });
    expect(html).not.toContain('NaN');
  });
});
