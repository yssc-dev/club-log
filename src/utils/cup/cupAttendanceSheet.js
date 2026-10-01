// src/utils/cup/cupAttendanceSheet.js
// 컵 경기일 참석자 시트 연동(2026-10-01 사용자 요청): PC 에서 전용 탭(기본 "컵참석", 1행 팀명·아래 참석자 이름)에
// 참석자를 적어 두면 참석자 단계의 "시트 연동" 버튼 한 번으로 칩이 켜지고 꺼진다.
// 규칙: 대회 명단(세션 팀)에 있는 이름은 어느 열에 있든 참석(원소속 팀 유지). 명단 밖 이름은 열 머리글이
// 대회 팀명과 같을 때만 그 팀에 당일 추가하고, 아니면 "배치 못 함"으로 보고한다. 시트에 없는 팀원은 불참.
// React·firebase 의존 없음.
import { cleanPlayerName, normalizeTeamName } from './cupEntity';

/**
 * @param {{ teams: string[][], teamNames: string[], columns: Array<{ header: string, names: string[] }> }} input
 *   teams/teamNames = 세션의 현재 팀(이미 당일 추가된 인원 포함), columns = parseCupAttendanceGrid 결과
 * @returns {{ empty: boolean, attendees: string[], teams: string[][], summary: {
 *   present: number, absent: string[], guestsAdded: Array<{ name: string, team: string }>, unplaced: string[], unknownHeaders: string[] } }}
 */
export function applyCupSheetAttendance({ teams = [], teamNames = [], columns = [] }) {
  const baseTeams = teams.map(t => [...(t || [])]);
  const rosterTeam = new Map();                       // 이름 → 팀 index(첫 소속)
  baseTeams.forEach((t, i) => t.forEach(p => { const n = cleanPlayerName(p); if (n && !rosterTeam.has(n)) rosterTeam.set(n, i); }));
  const teamIdxOf = (header) => {
    const h = normalizeTeamName(header);
    if (!h) return -1;
    return teamNames.findIndex(tn => normalizeTeamName(tn) === h);
  };

  const present = new Set();
  const guestsAdded = [];
  const unplaced = [];
  const unknownHeaders = [];
  const newTeams = baseTeams.map(t => [...t]);
  let anyName = false;

  for (const col of columns) {
    const idx = teamIdxOf(col?.header);
    const header = String(col?.header ?? '').trim();
    if (idx === -1 && header) unknownHeaders.push(header);
    for (const raw of col?.names || []) {
      const n = cleanPlayerName(raw);
      if (!n) continue;
      anyName = true;
      if (rosterTeam.has(n)) { present.add(n); continue; }
      if (idx >= 0) {
        if (!present.has(n)) {
          newTeams[idx].push(n);
          rosterTeam.set(n, idx);          // 같은 이름이 다른 열에 또 나와도 한 번만
          guestsAdded.push({ name: n, team: teamNames[idx] });
          present.add(n);
        }
        continue;
      }
      if (!unplaced.includes(n)) unplaced.push(n);
    }
  }

  if (!anyName) {
    return { empty: true, attendees: [], teams: baseTeams, summary: { present: 0, absent: [], guestsAdded: [], unplaced, unknownHeaders } };
  }

  // 참석자 순서 = 세션 팀 순서(명단 순) → 당일 추가(팀 순)
  const attendees = [];
  newTeams.forEach(t => t.forEach(p => { const n = cleanPlayerName(p); if (present.has(n) && !attendees.includes(n)) attendees.push(n); }));
  const rosterNames = [];
  baseTeams.forEach(t => t.forEach(p => { const n = cleanPlayerName(p); if (n && !rosterNames.includes(n)) rosterNames.push(n); }));
  const absent = rosterNames.filter(n => !present.has(n));
  const presentRoster = rosterNames.length - absent.length;

  return { empty: false, attendees, teams: newTeams, summary: { present: presentRoster, absent, guestsAdded, unplaced, unknownHeaders } };
}

// alert 용 요약. 없는 항목의 줄은 생략한다.
export function formatCupSheetSummary(result, sheetName) {
  const s = result?.summary || {};
  const lines = [`시트 '${sheetName}' 반영`, `참석 ${s.present || 0}명 · 불참 ${(s.absent || []).length}명`];
  if ((s.guestsAdded || []).length > 0) lines.push(`당일 추가 ${s.guestsAdded.length}명: ${s.guestsAdded.map(g => `${g.name}(${g.team})`).join(', ')}`);
  if ((s.unplaced || []).length > 0) lines.push(`배치 못 함 ${s.unplaced.length}명: ${s.unplaced.join(', ')} — 열 머리글이 대회 팀명이 아니라 어느 팀인지 알 수 없음`);
  if ((s.unknownHeaders || []).length > 0) lines.push(`대회 팀명이 아닌 열: ${s.unknownHeaders.map(h => `'${h}'`).join(', ')}`);
  return lines.join('\n');
}
