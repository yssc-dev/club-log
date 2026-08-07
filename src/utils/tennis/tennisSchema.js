// 테니스 시트 스키마 단일 소스. Apps Script(apps-script/Code.js)의
// TENNIS_MATCH_HEADERS / TENNIS_PLAYER_GAME_HEADERS 와 순서가 1:1로 일치해야 한다.
// 컬럼을 바꾸면 양쪽을 함께 고칠 것.

export const TENNIS_SPORT = '테니스';

// 약한 등급 → 강한 등급 순.
export const GRADES = ['초보자', '동배', '은배', '금배'];
export const GRADE_RANK = GRADES.reduce((acc, g, i) => { acc[g] = i; return acc; }, {});

export const LEAGUE_BK = '흑기사';
export const LEAGUE_BR = '흑장미';

export const COMPETITION_SINGLES = '길로틴';
export const COMPETITION_DOUBLES = '투몽';
export const COMPETITION_NONE = '미반영';

export const TENNIS_MATCH_COLUMNS = [
  'team', 'sport', 'season', 'date', 'game_id',
  'round_idx', 'court_id', 'match_idx', 'match_id',
  'format', 'best_of',
  'side_a_json', 'side_b_json',
  'sets_json', 'sets_a', 'sets_b', 'games_a', 'games_b', 'winner',
  'league', 'input_time',
];

export const TENNIS_PLAYER_GAME_COLUMNS = [
  'team', 'sport', 'season', 'date', 'game_id', 'match_id', 'round_idx', 'court_id',
  'player', 'is_guest', 'side', 'format', 'best_of',
  'partner', 'opponents_json', 'result',
  'sets_won', 'sets_lost', 'games_won', 'games_lost',
  'tb_played', 'tb_won', 'aces', 'double_faults',
  'bagels_taken', 'bagels_given',
  'grade_at_date', 'league', 'input_time',
];
