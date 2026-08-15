import { useState } from 'react';
import { buildTennisPlayerGameRows } from '../../utils/tennis/tennisRowBuilders';

const VIEWS = ['개인', '페어'];

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

// 오늘 경기의 선수별 기록. buildTennisPlayerGameRows가 단일 진실 소스 — 새 집계 로직을 추가하지 않는다.
//
// 개인 표는 단식·복식을 합산한다. 경기 중에 궁금한 건 "오늘 내가 어땠나"이지
// 형식별 비교가 아니고, 형식별 비교는 시즌 단위여야 의미가 있어 분석 탭 소관이다.
// 다만 서브 기회 수가 형식마다 다르므로(단식은 두 게임마다, 복식은 네 게임마다 내 서브)
// 에이스·DF를 합산해 놓으면 복식을 많이 친 사람이 서브가 약해 보인다.
// 필터로 가르는 대신 `단·복` 칸으로 판 수 구성을 함께 보여 그 착시를 막는다.
export default function TennisPlayerStatsModal({ team, state, roster, C, styles: s }) {
  const [view, setView] = useState('개인');
  const memberSet = new Set(state.attendees || []);   // 전송 경로와 동일 기준(참석자=회원)
  const gradeByPlayer = Object.fromEntries(roster.map(m => [m.name, m.grade]));

  const allRows = buildTennisPlayerGameRows({ team, state, inputTime: '', memberSet, gradeByPlayer });

  const playerMap = {};
  for (const row of allRows) {
    if (!playerMap[row.player]) {
      playerMap[row.player] = {
        wins: 0, losses: 0,
        singles: 0, doubles: 0,
        setsDiff: 0, gamesDiff: 0,
        aces: 0, df: 0,
        tbPlayed: 0, tbWon: 0,
        bagels: 0,
      };
    }
    const p = playerMap[row.player];
    if (row.result === '승') p.wins++;
    else p.losses++;
    if (row.format === '복식') p.doubles++;
    else p.singles++;
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

  const viewRow = (
    <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
      {VIEWS.map(v => (
        <button key={v} onClick={() => setView(v)} style={s.chip(v === view)}>{v}</button>
      ))}
    </div>
  );

  const empty = (msg) => (
    <div style={{ color: C.gray, textAlign: 'center', padding: 20 }}>{msg}</div>
  );

  if (view === '페어') {
    const pairs = buildPairs(allRows);
    return (
      <div style={{ overflowX: 'auto' }}>
        {viewRow}
        {pairs.length === 0 ? empty('완료된 복식 경기가 없습니다.') : (
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

  return (
    <div style={{ overflowX: 'auto' }}>
      {viewRow}
      {players.length === 0 ? empty('완료된 경기 기록이 없습니다.') : (
        <>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 380 }}>
            <thead>
              <tr>
                {['선수', '승-패', '단·복', '세트Δ', '게임Δ', '에이스', 'DF', 'TB', '베이글'].map(h => (
                  <th key={h} style={s.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {players.map(([name, p]) => (
                <tr key={name}>
                  <td style={s.td(true)}>{name}</td>
                  <td style={s.td()}>{p.wins}-{p.losses}</td>
                  <td style={{ ...s.td(), color: C.gray, fontSize: 11 }}>{p.singles}·{p.doubles}</td>
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
          <div style={{ fontSize: 11, color: C.gray, marginTop: 10, lineHeight: 1.5 }}>
            `단·복`은 오늘 뛴 단식·복식 판 수입니다.
            복식은 서브 차례가 네 게임마다 오므로 에이스·DF가 단식보다 적게 나옵니다.
          </div>
        </>
      )}
    </div>
  );
}
