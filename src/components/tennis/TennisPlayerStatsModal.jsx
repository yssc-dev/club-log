import { useState } from 'react';
import { buildTennisPlayerGameRows } from '../../utils/tennis/tennisRowBuilders';

const FORMATS = ['전체', '단식', '복식', '페어'];

// 복식 페어 집계. 스펙 4.5의 복식 순위 규칙(조합 승패 → 세트 득실)과 같은 축이다.
//
// 주의: 한 복식 판은 편마다 행이 2개(성언-파트너 다빈 / 다빈-파트너 성언) 생기고
// 둘이 같은 결과를 서술한다. 그대로 세면 한 판이 두 번 잡히므로 match_id로 중복을 걷어낸다.
function buildPairs(rows) {
  const pairMap = {};
  const seen = new Set();
  for (const r of rows) {
    if (r.format !== '복식' || !r.partner) continue;
    const key = [r.player, r.partner].sort((a, b) => a.localeCompare(b, 'ko')).join(' · ');
    const dedupeKey = `${key}|${r.game_id || ''}|${r.match_id}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    if (!pairMap[key]) pairMap[key] = { wins: 0, losses: 0, setsDiff: 0, gamesDiff: 0 };
    const p = pairMap[key];
    if (r.result === '승') p.wins++;
    else p.losses++;
    p.setsDiff  += (r.sets_won  || 0) - (r.sets_lost  || 0);
    p.gamesDiff += (r.games_won || 0) - (r.games_lost || 0);
  }
  return Object.entries(pairMap).sort((a, b) =>
    b[1].wins - a[1].wins
    || b[1].setsDiff - a[1].setsDiff
    || a[0].localeCompare(b[0], 'ko'));
}

// 오늘 경기의 선수별 누적 기록.
// buildTennisPlayerGameRows가 단일 진실 소스 — 새 집계 로직을 추가하지 않는다.
// 단식/복식은 클럽에서 다른 리그(길로틴/투몽)로 운영되고 랭킹도 단식만 반영하므로
// 합쳐서 보면 의미가 흐려진다 — 필터로 나눠 본다.
export default function TennisPlayerStatsModal({ team, state, roster, C, styles: s }) {
  const [format, setFormat] = useState('전체');
  const memberSet = new Set(roster.map(m => m.name));
  const gradeByPlayer = Object.fromEntries(roster.map(m => [m.name, m.grade]));

  const allRows = buildTennisPlayerGameRows({ team, state, inputTime: '', memberSet, gradeByPlayer });
  const pgRows = format === '전체' ? allRows : allRows.filter(r => r.format === format);

  // 선수별 집계
  const playerMap = {};
  for (const row of pgRows) {
    if (!playerMap[row.player]) {
      playerMap[row.player] = {
        wins: 0, losses: 0,
        setsDiff: 0, gamesDiff: 0,
        aces: 0, df: 0,
        tbPlayed: 0, tbWon: 0,
        bagels: 0,
      };
    }
    const p = playerMap[row.player];
    if (row.result === '승') p.wins++;
    else p.losses++;
    p.setsDiff  += (row.sets_won   || 0) - (row.sets_lost   || 0);
    p.gamesDiff += (row.games_won  || 0) - (row.games_lost  || 0);
    p.aces      += row.aces          || 0;
    p.df        += row.double_faults || 0;
    p.tbPlayed  += row.tb_played     || 0;
    p.tbWon     += row.tb_won        || 0;
    p.bagels    += row.bagels_given  || 0;   // 내가 상대에게 베이글을 준 횟수(성취)
  }

  const players = Object.entries(playerMap).sort(([a], [b]) => a.localeCompare(b, 'ko'));
  const fmt = (n) => (n > 0 ? `+${n}` : String(n));

  const filterRow = (
    <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
      {FORMATS.map(f => (
        <button key={f} onClick={() => setFormat(f)} style={s.chip(f === format)}>{f}</button>
      ))}
    </div>
  );

  if (format === '페어') {
    const pairs = buildPairs(allRows);
    return (
      <div style={{ overflowX: 'auto' }}>
        {filterRow}
        {pairs.length === 0 ? (
          <div style={{ color: C.gray, textAlign: 'center', padding: 20 }}>완료된 복식 경기가 없습니다.</div>
        ) : (
          <>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 320 }}>
              <thead>
                <tr>{['조합', '승-패', '세트Δ', '게임Δ'].map(h => <th key={h} style={s.th}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {pairs.map(([name, p]) => (
                  <tr key={name}>
                    <td style={s.td(true)}>{name}</td>
                    <td style={s.td()}>{p.wins}-{p.losses}</td>
                    <td style={s.td(p.setsDiff > 0)}>{fmt(p.setsDiff)}</td>
                    <td style={s.td(p.gamesDiff > 0)}>{fmt(p.gamesDiff)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ fontSize: 11, color: C.gray, marginTop: 10, lineHeight: 1.5 }}>
              승 → 세트 득실 순. 오늘 하루치이므로 표본이 적습니다 —
              시즌 단위 케미는 시트에 쌓인 뒤 분석 탭에서 봅니다.
            </div>
          </>
        )}
      </div>
    );
  }

  if (players.length === 0) {
    return (
      <div>
        {filterRow}
        <div style={{ color: C.gray, textAlign: 'center', padding: 20 }}>
          {format === '전체' ? '완료된 경기 기록이 없습니다.' : `완료된 ${format} 경기가 없습니다.`}
        </div>
      </div>
    );
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      {filterRow}
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 360 }}>
        <thead>
          <tr>
            {['선수', '승-패', '세트Δ', '게임Δ', '에이스', 'DF', 'TB', '베이글'].map(h => (
              <th key={h} style={s.th}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {players.map(([name, p]) => (
            <tr key={name}>
              <td style={s.td(true)}>{name}</td>
              <td style={s.td()}>{p.wins}-{p.losses}</td>
              <td style={s.td(p.setsDiff > 0)}>{fmt(p.setsDiff)}</td>
              <td style={s.td(p.gamesDiff > 0)}>{fmt(p.gamesDiff)}</td>
              <td style={s.td(p.aces > 0)}>{p.aces || '—'}</td>
              <td style={{ ...s.td(), color: p.df > 0 ? C.red : C.gray }}>{p.df || '—'}</td>
              <td style={s.td()}>{p.tbWon}/{p.tbPlayed}</td>
              <td style={s.td(p.bagels > 0)}>{p.bagels || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
