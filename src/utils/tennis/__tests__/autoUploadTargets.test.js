import { describe, it, expect } from 'vitest';
import {
  classifyAutoTarget, selectAutoTargets,
  ACTION_UPLOAD_ARCHIVE, ACTION_ARCHIVE_ONLY, ACTION_SKIP,
  resolveWithArchiveState,
} from '../autoUploadTargets';

const st = (over) => ({ sport: '테니스', phase: 'summary', gameFinalized: false, ...over });

describe('classifyAutoTarget', () => {
  it('마감 눌러 요약에 온 미전송 경기 → 업로드+아카이브', () => {
    expect(classifyAutoTarget(st())).toBe(ACTION_UPLOAD_ARCHIVE);
  });

  it('이미 전송된 경기 → 아카이브만', () => {
    expect(classifyAutoTarget(st({ phase: 'done', gameFinalized: true }))).toBe(ACTION_ARCHIVE_ONLY);
  });

  it('시작만 하고 버린 경기(setup)는 건드리지 않는다', () => {
    expect(classifyAutoTarget(st({ phase: 'setup' }))).toBe(ACTION_SKIP);
  });

  it('진행 중(playing)은 라운드가 다 확정됐어도 건드리지 않는다', () => {
    expect(classifyAutoTarget(st({ phase: 'playing', confirmedRounds: { 1: true } }))).toBe(ACTION_SKIP);
  });

  it('풋살 경기는 phase가 summary여도 배제한다', () => {
    expect(classifyAutoTarget(st({ sport: '풋살' }))).toBe(ACTION_SKIP);
  });

  it('sport가 없는 레거시 state도 배제한다', () => {
    expect(classifyAutoTarget(st({ sport: undefined }))).toBe(ACTION_SKIP);
  });

  it('null state는 배제한다', () => {
    expect(classifyAutoTarget(null)).toBe(ACTION_SKIP);
  });
});

describe('selectAutoTargets', () => {
  it('skip을 걸러내고 action을 붙여 돌려준다', () => {
    const out = selectAutoTargets([
      { gameId: 'g1', state: st() },
      { gameId: 'g2', state: st({ phase: 'setup' }) },
      { gameId: 'g3', state: st({ phase: 'done', gameFinalized: true }) },
    ]);
    expect(out.map(x => [x.gameId, x.action])).toEqual([
      ['g1', ACTION_UPLOAD_ARCHIVE],
      ['g3', ACTION_ARCHIVE_ONLY],
    ]);
  });

  it('빈 입력에도 안전하다', () => {
    expect(selectAutoTargets(undefined)).toEqual([]);
  });
});

describe('resolveWithArchiveState — 부활한 경기 중복 업로드 차단', () => {
  it('이미 아카이브된 경기가 되살아나면 업로드를 건너뛰고 정리만 한다', () => {
    expect(resolveWithArchiveState(ACTION_UPLOAD_ARCHIVE, true)).toBe(ACTION_ARCHIVE_ONLY);
  });

  it('아카이브 기록이 없으면 정상 업로드한다', () => {
    expect(resolveWithArchiveState(ACTION_UPLOAD_ARCHIVE, false)).toBe(ACTION_UPLOAD_ARCHIVE);
  });

  it('archive_only는 아카이브 기록 유무와 무관하게 그대로다', () => {
    expect(resolveWithArchiveState(ACTION_ARCHIVE_ONLY, true)).toBe(ACTION_ARCHIVE_ONLY);
    expect(resolveWithArchiveState(ACTION_ARCHIVE_ONLY, false)).toBe(ACTION_ARCHIVE_ONLY);
  });
});
