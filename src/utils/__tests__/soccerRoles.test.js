// 역할(영상촬영·주심·부심) 순수 함수 테스트.
// 핵심 계약: RTDB 가 빈 배열을 저장하지 않아 어떤 모양으로 와도(undefined / 키 누락 /
// 객체화 {0:'김A'}) readRoles 는 항상 같은 모양을 돌려준다.
import { describe, it, expect } from 'vitest';
import { readRoles, serializeRoles, parseRoles, emptyRoles } from '../soccerRoles';

describe('emptyRoles', () => {
  it('정규형 빈 값을 돌려주고, 호출마다 새 객체다', () => {
    expect(emptyRoles()).toEqual({ camera: [], referee: '', assistants: [] });
    const a = emptyRoles();
    a.camera.push('X');
    expect(emptyRoles().camera).toEqual([]);
  });
});

describe('readRoles', () => {
  it('roles 없는 경기 → 전원 공석', () => {
    expect(readRoles({ matchIdx: 0 })).toEqual({ camera: [], referee: '', assistants: [] });
  });

  it('match 자체가 null/undefined → 전원 공석 (크래시 금지)', () => {
    expect(readRoles(null)).toEqual({ camera: [], referee: '', assistants: [] });
    expect(readRoles(undefined)).toEqual({ camera: [], referee: '', assistants: [] });
  });

  it('RTDB 빈배열 누락 모양({referee}만 도착) → 배열 복원', () => {
    expect(readRoles({ roles: { referee: '박C' } }))
      .toEqual({ camera: [], referee: '박C', assistants: [] });
  });

  it('RTDB 객체화 모양({0:"김A",1:"이B"}) → 배열 복원 (순서 보존)', () => {
    expect(readRoles({ roles: { camera: { 0: '김A', 1: '이B' }, assistants: { 0: '최D' } } }))
      .toEqual({ camera: ['김A', '이B'], referee: '', assistants: ['최D'] });
  });

  it('정상 모양은 그대로', () => {
    const roles = { camera: ['김A'], referee: '박C', assistants: ['최D', '정E'] };
    expect(readRoles({ roles })).toEqual(roles);
  });

  it('falsy 원소(빈 문자열·null)는 걸러낸다', () => {
    expect(readRoles({ roles: { camera: ['김A', '', null], assistants: [] } }))
      .toEqual({ camera: ['김A'], referee: '', assistants: [] });
  });

  it('referee 가 비문자열이면 공석으로 본다', () => {
    expect(readRoles({ roles: { referee: null } }).referee).toBe('');
    expect(readRoles({ roles: { referee: 0 } }).referee).toBe('');
  });

  it('부심은 2명으로 잘라낸다 (상한 방어)', () => {
    expect(readRoles({ roles: { assistants: ['a', 'b', 'c'] } }).assistants).toEqual(['a', 'b']);
  });

  it('반환 배열을 수정해도 원본 match 가 오염되지 않는다', () => {
    const match = { roles: { camera: ['김A'], referee: '', assistants: [] } };
    readRoles(match).camera.push('침입');
    expect(match.roles.camera).toEqual(['김A']);
  });
});

describe('serializeRoles', () => {
  it('전원 공석 → 빈 문자열 (시트에 JSON 도배 방지)', () => {
    expect(serializeRoles({ camera: [], referee: '', assistants: [] })).toBe('');
    expect(serializeRoles(null)).toBe('');
  });

  it('하나라도 있으면 JSON', () => {
    const out = serializeRoles({ camera: ['김A'], referee: '', assistants: [] });
    expect(JSON.parse(out)).toEqual({ camera: ['김A'], referee: '', assistants: [] });
  });

  it('주심만 있어도 JSON', () => {
    expect(JSON.parse(serializeRoles({ camera: [], referee: '박C', assistants: [] })))
      .toEqual({ camera: [], referee: '박C', assistants: [] });
  });
});

describe('parseRoles', () => {
  it('빈값 → 전원 공석', () => {
    expect(parseRoles('')).toEqual({ camera: [], referee: '', assistants: [] });
    expect(parseRoles(null)).toEqual({ camera: [], referee: '', assistants: [] });
    expect(parseRoles(undefined)).toEqual({ camera: [], referee: '', assistants: [] });
  });

  it('깨진 JSON → 전원 공석 (크래시 금지)', () => {
    expect(parseRoles('{nope')).toEqual({ camera: [], referee: '', assistants: [] });
  });

  it('배열 JSON 같은 엉뚱한 타입 → 전원 공석', () => {
    expect(parseRoles('["김A"]')).toEqual({ camera: [], referee: '', assistants: [] });
  });

  it('정상 JSON → 정규형', () => {
    expect(parseRoles('{"camera":["김A","이B"],"referee":"박C","assistants":["최D"]}'))
      .toEqual({ camera: ['김A', '이B'], referee: '박C', assistants: ['최D'] });
  });

  it('serializeRoles 와 왕복한다', () => {
    const roles = { camera: ['김A'], referee: '박C', assistants: ['최D', '정E'] };
    expect(parseRoles(serializeRoles(roles))).toEqual(roles);
  });
});
