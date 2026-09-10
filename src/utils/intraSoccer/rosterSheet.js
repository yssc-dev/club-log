// 빅마스터FC 참석명단 시트(팀별 열: 1행 팀 이름, 아래 참석자) 읽기. 스펙 §13.2.
// sheetService 의 비공개 헬퍼를 export 하지 않기 위해 CSV 한 줄 파서를 여기서 최소 구현(따옴표·쉼표).
import { stripNameDecorations } from '../../services/appSync';
import AuthUtil from '../../services/authUtil';
import { getSettings } from '../../config/settings';
import { SHEET_CONFIG } from '../../config/constants';

function parseCsvLine(line) {
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

const cleanName = (s) => stripNameDecorations((s || '').trim()).trim();

export function parseIntraRosterCsv(text) {
  const rows = String(text || '').split(/\r?\n/).map(parseCsvLine);
  const nonEmpty = (cells) => cells.some(c => c !== '');
  const hIdx = rows.findIndex(nonEmpty);
  if (hIdx < 0) throw new Error('팀 열 없음');
  // 헤더 행에서 값이 있는 셀 = 팀. 열 인덱스를 기억해 아래 행에서 같은 열을 읽는다.
  const cols = [];
  rows[hIdx].forEach((c, i) => { const name = cleanName(c); if (name) cols.push({ i, name }); });
  if (cols.length === 0) throw new Error('팀 열 없음');
  const names = cols.map(c => c.name);
  const dup = names.find((n, i) => names.indexOf(n) !== i);
  if (dup) throw new Error(`팀 이름 중복: ${dup}`);
  if (names.includes('휴식')) throw new Error('팀 이름으로 "휴식"은 쓸 수 없습니다(휴식 라운드와 구분 불가)');

  const teams = cols.map(c => ({ name: c.name, players: [] }));
  const warnings = [];
  const owner = new Map(); // 이름 → 먼저 나온 팀
  for (let r = hIdx + 1; r < rows.length; r++) {
    const cells = rows[r];
    cols.forEach((c, ti) => {
      const name = cleanName(cells[c.i]);
      if (!name) return;
      if (teams[ti].players.includes(name)) { warnings.push(`${c.name} 열에 ${name} 중복`); return; }
      if (owner.has(name)) { warnings.push(`${name}이(가) ${owner.get(name)}·${c.name} 두 열에 있음 — ${owner.get(name)} 소속으로 처리`); return; }
      owner.set(name, c.name);
      teams[ti].players.push(name);
    });
  }
  return { teams, attendees: teams.flatMap(t => t.players), warnings };
}

// 팀 설정의 attendanceSheet 를 읽는다 — 하버FC fetchAttendanceData 와 같은 URL 메커니즘(gviz CSV, 40행 이하라 절단 무관).
export async function fetchIntraRoster() {
  const team = AuthUtil.getStored()?.team;
  const s = getSettings(team);
  if (!s.attendanceSheet) throw new Error('참석명단 시트 미설정');
  const resp = await fetch(SHEET_CONFIG.csvUrlBySheet(s.sheetId, s.attendanceSheet));
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return parseIntraRosterCsv(await resp.text());
}
