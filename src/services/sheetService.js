import { SHEET_CONFIG } from '../config/constants';
import { getSettings } from '../config/settings';
import AuthUtil from './authUtil';
import { stripNameDecorations } from './appSync';

// 시트가 붙이는 이름 장식(100포인트 ★ 등)은 읽는 시점에 제거한다.
// 장식 붙은 이름이 앱에 들어오면 로그 기반 이름과 별개 선수로 갈라진다
// (분석 드롭다운 "정보영 ★ (0경기)", 파생 팀명 "팀보영 ★" 등).
function cleanName(s) {
  return stripNameDecorations((s || '').trim());
}

function parseCSVLine(line) {
  const fields = [];
  let inQuote = false, field = '';
  for (const ch of line) {
    if (ch === '"') { inQuote = !inQuote; }
    else if (ch === ',' && !inQuote) { fields.push(field.trim()); field = ''; }
    else { field += ch; }
  }
  fields.push(field.trim());
  return fields;
}

function parseNum(v) { return parseInt(v) || 0; }
function parseFloat2(v) { return parseFloat(v) || 0; }
function parseDelta(v) { if (!v || v === '-' || v === '') return 0; return parseInt(v) || 0; }

export function parseCSV(text) {
  const lines = text.split('\n');
  const players = [];
  for (let i = 3; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    const f = parseCSVLine(line);
    const name = cleanName(f[3]);
    if (!name) continue;
    players.push({
      ppg: parseFloat2(f[0]),           // A: 경기당 포인트
      rank: parseNum(f[1]),             // B: 순위
      backNum: f[2] ? parseNum(f[2]) || null : null, // C: 등번호
      name,                             // D: 이름
      games: parseNum(f[4]),            // E: 경기수
      goals: parseNum(f[5]),            // F: 골
      goalsDelta: parseDelta(f[6]),     // G: 골 변동
      assists: parseNum(f[7]),          // H: 어시스트
      assistsDelta: parseDelta(f[8]),   // I: 어시 변동
      ownGoals: parseNum(f[9]),         // J: 자책골
      ownGoalsDelta: parseDelta(f[10]), // K: 자책골 변동
      crova: parseNum(f[11]),           // L: 크로바
      goguma: parseNum(f[12]),          // M: 고구마
      point: parseNum(f[13]),           // N: 포인트 합계
      cleanSheets: parseNum(f[14]),     // O: 클린시트
      cleanSheetsDelta: parseDelta(f[15]), // P: 클린시트 변동
      keeperGames: parseNum(f[16]),     // Q: 키퍼 경기수
      conceded: parseNum(f[17]),        // R: 실점
      concededDelta: parseDelta(f[18]), // S: 실점 변동
      concededRate: parseFloat2(f[19]), // T: 실점률
    });
  }
  const seen = new Set();
  return players.filter(p => seen.has(p.name) ? false : (seen.add(p.name), true));
}

// 축구 대시보드 파싱
// 컬럼: 년식(0), 백넘버(1), 이름(2), 전체경기(3), 필드경기(4), 키퍼경기(5), 골(6), 어시(7), 클린시트(8), 포인트(9), 실점(10), 실점허용률(11), 자책골(12)
function parseSoccerCSV(text) {
  const lines = text.split('\n');
  const players = [];
  // 헤더 행 찾기 ("이름" 포함 행)
  let startRow = 3;
  for (let i = 0; i < Math.min(lines.length, 10); i++) {
    const f = parseCSVLine(lines[i]);
    if (f.some(cell => cell.trim() === '이름')) { startRow = i + 1; break; }
  }
  for (let i = startRow; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    const f = parseCSVLine(line);
    const name = cleanName(f[2]);
    if (!name || !/[가-힣]/.test(name)) continue;
    players.push({
      backNum: f[1] ? parseNum(f[1]) || null : null,
      name,
      games: parseNum(f[3]),
      goals: parseNum(f[6]),
      assists: parseNum(f[7]),
      ownGoals: parseNum(f[12]),
      point: parseNum(f[9]),
      cleanSheets: parseNum(f[8]),
      keeperGames: parseNum(f[5]),
      conceded: parseNum(f[10]),
      concededRate: parseFloat2(f[11]),
      // 풋살 전용 필드 호환용 기본값
      ppg: 0, rank: 0, goalsDelta: 0, assistsDelta: 0, ownGoalsDelta: 0,
      crova: 0, goguma: 0, cleanSheetsDelta: 0, concededDelta: 0,
    });
  }
  const seen = new Set();
  return players.filter(p => seen.has(p.name) ? false : (seen.add(p.name), true));
}

// 대시보드의 "vs 상대팀명" 표에서 상대팀명 + 경기수 추출 (경기수순 정렬)
export function parseSoccerOpponents(text) {
  if (!text) return [];
  const lines = text.split('\n');
  // "상대팀명" 포함 헤더 셀 탐지
  let hRow = -1, hCol = -1;
  for (let i = 0; i < lines.length; i++) {
    const f = parseCSVLine(lines[i]);
    const idx = f.findIndex(c => c.replace(/\s/g, '').includes('상대팀명'));
    if (idx >= 0) { hRow = i; hCol = idx; break; }
  }
  if (hRow < 0) return [];
  // 같은 헤더 행에서 "경기" 열 탐지 (hCol 이후), 없으면 hCol+1
  const hf = parseCSVLine(lines[hRow]);
  let gamesCol = -1;
  for (let c = hCol + 1; c < hf.length; c++) {
    if (hf[c].trim() === '경기') { gamesCol = c; break; }
  }
  if (gamesCol < 0) gamesCol = hCol + 1;
  const out = [];
  const seen = new Set();
  for (let i = hRow + 1; i < lines.length; i++) {
    const f = parseCSVLine(lines[i]);
    const name = (f[hCol] || '').trim();
    if (!name) break;                  // 상대팀 열이 비면 표 끝
    // 같은 열 아래에 있는 다른 섹션(예: "상대팀별 다득점 TOP5") 만나면 표 끝으로 간주
    if (name.includes('다득점') || name.includes('상대팀별') || name.toUpperCase().includes('TOP')) break;
    if (name.includes('상대팀명') || name === '상대팀') continue; // 헤더/라벨 셀 스킵
    if (seen.has(name)) continue;
    seen.add(name);
    out.push({ name, games: parseInt(f[gamesCol]) || 0 });
  }
  return out.sort((a, b) => b.games - a.games);
}

export async function fetchSheetData() {
  const auth = AuthUtil.getStored();
  const team = auth?.team;
  const mode = auth?.mode;
  const s = getSettings(team);
  if (!s.dashboardSheet) throw new Error("대시보드 시트 미설정");
  const resp = await fetch(SHEET_CONFIG.csvUrlBySheet(s.sheetId, s.dashboardSheet));
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const text = await resp.text();
  const players = mode === "축구" ? parseSoccerCSV(text) : parseCSV(text);
  if (players.length === 0) throw new Error("선수 데이터 없음");
  // 키퍼 섹션 파싱 (col 21~24, row 4+, row3=헤더 "선수명")
  const lines = text.split('\n');
  const keepers = [];
  for (let i = 4; i < lines.length; i++) {
    const f = parseCSVLine(lines[i]);
    const name = cleanName(f[21]);
    if (!name || name === '선수명') continue;
    keepers.push({
      name,
      avgConceded: parseFloat2(f[22]),  // 평균 실점/경기
      totalConceded: parseNum(f[23]),   // 누적 실점
      keeperGames: parseNum(f[24]),     // 키퍼 경기수
    });
  }

  const opponents = mode === "축구" ? parseSoccerOpponents(text) : [];

  return { lastUpdated: new Date().toISOString().slice(0, 10), players, keepers, opponents, seasonCrova: {}, seasonGoguma: {} };
}

export async function fetchAttendanceData() {
  const auth2 = AuthUtil.getStored();
  const team2 = auth2?.team;
  const mode2 = auth2?.mode;
  const s2 = getSettings(team2);
  if (!s2.attendanceSheet) throw new Error("참석명단 시트 미설정");
  const resp = await fetch(SHEET_CONFIG.csvUrlBySheet(s2.sheetId, s2.attendanceSheet));
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const text = await resp.text();

  // 축구: 이름 컬럼(B)에서 선수명만 추출
  if (mode2 === "축구") {
    const lines = text.split('\n');
    const attendees = [];
    let startRow = 0;
    for (let i = 0; i < Math.min(lines.length, 10); i++) {
      const f = parseCSVLine(lines[i]);
      if (f.some(cell => cell.trim() === '이름')) { startRow = i + 1; break; }
    }
    for (let i = startRow; i < lines.length; i++) {
      const f = parseCSVLine(lines[i]);
      const name = cleanName(f[1]);
      if (!name || !/^[가-힣]{2,5}$/.test(name)) break; // 빈 행 만나면 중단
      attendees.push(name);
    }
    return { attendees, teamCount: 0, prebuiltTeams: [], prebuiltTeamNames: [] };
  }
  return parseAttendanceGrid(text);
}

// 참석명단 시트(풋살)의 시드 그리드 파싱. 테스트를 위해 분리 export.
export function parseAttendanceGrid(text) {
  const lines = text.split('\n');

  // CSV 구조 (참석명단 시트):
  // 시드 라벨 칼럼(시드 라벨 "1번 시드"~"8번 시드")이 어디 있는지 동적으로 탐지
  //  - 과거: F열(col 5)
  //  - 현재: G열(col 6) — 시트 한 칸 시프트되어 H~M열(col 7~12)이 팀 칼럼
  // 팀 칼럼은 시드 라벨 칼럼 + 1 부터 최대 6칼럼.
  const prebuiltTeams = [];
  const prebuiltTeamNames = [];
  const allAttendees = [];

  // Step 1: "1번 시드" 라벨 행 + 칼럼 동시에 탐지 (col 4~7 = E~H 범위)
  let seedStartRow = -1;
  let seedLabelCol = -1;
  for (let row = 0; row < Math.min(lines.length, 10); row++) {
    const f = parseCSVLine(lines[row]);
    for (let col = 4; col <= 7; col++) {
      const label = (f[col] || '').trim().replace(/\s/g, '');
      if (label.includes('1번') && label.includes('시드')) {
        seedStartRow = row;
        seedLabelCol = col;
        break;
      }
    }
    if (seedStartRow >= 0) break;
  }

  // 시드 라벨 못 찾으면 → 팀명 헤더 행 + col 6 가정 (legacy fallback)
  let headerRow = -1;
  if (seedStartRow < 0) {
    for (let row = 0; row < Math.min(lines.length, 5); row++) {
      const f = parseCSVLine(lines[row]);
      for (let col = 6; col <= 12; col++) {
        const cell = (f[col] || '').trim();
        if (cell && cell.startsWith('팀')) { headerRow = row; break; }
      }
      if (headerRow >= 0) break;
    }
    if (headerRow >= 0) {
      seedStartRow = headerRow + 1;
      seedLabelCol = 5; // legacy 가정
    }
  }

  // 둘 다 못 찾으면 → fallback: 팀 칼럼 추정 영역에 한글 이름 3개 이상 있는 첫 행
  if (seedStartRow < 0) {
    for (let row = 0; row < Math.min(lines.length, 5); row++) {
      const f = parseCSVLine(lines[row]);
      let nameCount = 0;
      for (let col = 6; col <= 12; col++) {
        const cell = cleanName(f[col]);
        if (cell && /^[가-힣]{2,4}$/.test(cell)) nameCount++;
      }
      if (nameCount >= 3) { seedStartRow = row; seedLabelCol = 5; break; }
    }
  }

  if (seedStartRow < 0) return { attendees: [], teamCount: 0, prebuiltTeams: [], prebuiltTeamNames: [] };

  // Step 2: 팀 칼럼 범위 = 시드 라벨 칼럼 + 1 부터 최대 6칼럼
  const teamColStart = seedLabelCol + 1;
  const teamColEnd = teamColStart + 5;

  // Step 3: 팀 컬럼 + 팀명 파싱
  // ★ gviz CSV 특성: 시트 1행(팀명)과 2행(1번시드)이 "팀승훈 조승훈" 형태로 합쳐질 수 있음
  const teamCols = [];
  const firstDataFields = parseCSVLine(lines[seedStartRow]);

  for (let col = teamColStart; col <= teamColEnd; col++) {
    const raw = cleanName(firstDataFields[col]);
    if (!raw || raw.length < 2) continue;

    let teamName = '';
    let captain = '';

    if (raw.startsWith('팀')) {
      // "팀승훈 조승훈" → 팀명과 캡틴이 합쳐진 경우
      const parts = raw.split(/\s+/);
      teamName = parts[0];  // "팀승훈"
      captain = parts[1] || '';  // "조승훈"
    } else {
      // 팀명 없이 선수명만 있는 경우 → 이름에서 팀명 생성
      captain = raw;
      const gn = raw.length >= 3 ? raw.slice(-2) : raw;
      teamName = '팀' + gn;
    }

    teamCols.push({ col, teamName, captain });
  }

  if (teamCols.length === 0) return { attendees: [], teamCount: 0, prebuiltTeams: [], prebuiltTeamNames: [] };

  // Step 4: 각 팀 선수 구성
  for (const tc of teamCols) {
    const members = [];

    // 1번 시드(캡틴)가 있으면 먼저 추가
    if (tc.captain) {
      members.push(tc.captain);
      if (!allAttendees.includes(tc.captain)) allAttendees.push(tc.captain);
    }

    // seedStartRow+1부터 나머지 시드 읽기 (2번 시드~)
    for (let row = seedStartRow + 1; row <= seedStartRow + 7; row++) {
      if (row >= lines.length) break;
      const f = parseCSVLine(lines[row]);
      const name = cleanName(f[tc.col]);
      if (name && !members.includes(name)) {
        members.push(name);
        if (!allAttendees.includes(name)) allAttendees.push(name);
      }
    }

    if (members.length > 0) {
      prebuiltTeams.push(members);
      prebuiltTeamNames.push(tc.teamName);
    }
  }

  return {
    attendees: allAttendees,
    teamCount: prebuiltTeams.length,
    prebuiltTeams,
    prebuiltTeamNames,
  };
}
