import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import PersonalSynergyChart, { splitSynergy } from '../PersonalSynergyChart';
import { C } from '../../../../config/constants';

// A·B는 늘 같은 팀에서 이기고, A·C는 늘 진다 → A 기준 B가 잘 맞고 C가 안 맞는다
const m = (i, our, opp, ourScore, oppScore) => ({
  date: `2026-06-${String(10 + i).padStart(2, '0')}`, match_id: `R${i}_C1`,
  our_members_json: JSON.stringify(our), opponent_members_json: JSON.stringify(opp),
  our_score: ourScore, opponent_score: oppScore,
});
const matchLogs = [
  ...Array.from({ length: 6 }, (_, i) => m(i, ['A', 'B'], ['C', 'D'], 3, 0)),
  ...Array.from({ length: 6 }, (_, i) => m(i + 10, ['A', 'C'], ['B', 'D'], 0, 3)),
];

const render = (props) => renderToStaticMarkup(
  createElement(PersonalSynergyChart, { matchLogs, C, authUserName: 'A', ...props }),
);

describe('splitSynergy', () => {
  const p = (partner, winRate, games = 9) => ({ partner, winRate, games, isLowSample: false });

  it('승률 높은 순 / 낮은 순으로 갈라준다', () => {
    const { best, worst } = splitSynergy([p('가', 0.9), p('나', 0.5), p('다', 0.1)], { topN: 1 });
    expect(best.map(x => x.partner)).toEqual(['가']);
    expect(worst.map(x => x.partner)).toEqual(['다']);
  });

  it('표본 부족 동료는 양쪽 모두에서 뺀다', () => {
    const rows = [p('가', 0.9), { ...p('나', 0.1), isLowSample: true }];
    const { best, worst } = splitSynergy(rows, { topN: 5 });
    expect(best.map(x => x.partner)).toEqual(['가']);
    expect(worst).toEqual([]); // '가'는 이미 best에 있으므로 중복 노출하지 않는다
  });

  it('자격 인원이 적으면 같은 사람이 양쪽에 겹치지 않는다', () => {
    const { best, worst } = splitSynergy([p('가', 0.9), p('나', 0.5), p('다', 0.1)], { topN: 5 });
    const overlap = best.filter(b => worst.some(w => w.partner === b.partner));
    expect(overlap).toEqual([]);
    expect(best.length + worst.length).toBe(3);
  });

  it('빈 입력은 빈 결과', () => {
    expect(splitSynergy([], { topN: 5 })).toEqual({ best: [], worst: [], eligible: 0 });
    expect(splitSynergy(null, { topN: 5 })).toEqual({ best: [], worst: [], eligible: 0 });
  });
});

describe('PersonalSynergyChart', () => {
  it('잘 맞는/안 맞는 동료를 좌우로 보여준다', () => {
    const html = render({});
    expect(html).toContain('잘 맞는');
    expect(html).toContain('안 맞는');
    expect(html).not.toContain('NaN');
  });

  it('승률과 함께 뛴 경기수를 찍는다', () => {
    const html = render({});
    expect(html).toContain('100%'); // A·B 6경기 전승
    expect(html).toContain('0%');   // A·C 6경기 전패
    expect(html).toContain('6경기');
  });

  // 합작 = 내 어시로 그가 넣은 골 + 내 골에 그가 어시한 골 (personalLink().total)
  it('합작 골 수를 경기수와 함께 n골/n경기로 찍는다', () => {
    const eventLogs = [
      // A 어시 → B 골 (2건)
      { event_type: 'goal', player: 'B', related_player: 'A', date: '2026-06-10', match_id: 'R0_C1' },
      { event_type: 'goal', player: 'B', related_player: 'A', date: '2026-06-11', match_id: 'R1_C1' },
      // B 어시 → A 골 (1건)
      { event_type: 'goal', player: 'A', related_player: 'B', date: '2026-06-12', match_id: 'R2_C1' },
      // 짝꿍 아닌 조합 — 합작에 안 들어가야 한다
      { event_type: 'goal', player: 'C', related_player: 'D', date: '2026-06-13', match_id: 'R3_C1' },
    ];
    const html = render({ eventLogs });
    expect(html).toContain('3골/6경기'); // A·B 합작 3골, 함께 6경기
  });

  it('합작이 없으면 0골로 표기', () => {
    const html = render({ eventLogs: [] });
    expect(html).toContain('0골/6경기');
  });

  it('선수 선택 드롭다운을 제공하고 기본값은 로그인 사용자', () => {
    const html = render({});
    expect(html).toContain('<select');
    expect(html).toContain('value="A"');
  });

  it('기준선으로 본인 전체 승률을 밝힌다', () => {
    expect(render({})).toContain('전체 승률');
  });

  it('기록이 없으면 안내문', () => {
    expect(render({ matchLogs: [] })).toContain('함께 뛴 기록이 없습니다');
  });
});
