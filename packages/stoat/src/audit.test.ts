/** What an audit log member edit changed (m4.7-plan.md task 8, shapes from m4.7-results.md task 1). */
import { describe, expect, it } from 'vitest';
import { mapAuditEntry, memberChanges } from './map/audit.ts';

describe('memberChanges', () => {
  it('reads server mute, deafen and a timeout', () => {
    expect(memberChanges({ can_publish: true, can_receive: true }, { can_publish: false, can_receive: false })).toEqual([{ kind: 'mute', on: true }, { kind: 'deafen', on: true }]);
    expect(memberChanges({}, { timeout: '2026-10-18T18:00:00Z' })).toEqual([{ kind: 'timeout', until: '2026-10-18T18:00:00Z' }]);
  });

  it('tells roles given from roles taken', () => {
    expect(memberChanges({ roles: ['A', 'B'] }, { roles: ['B', 'C'] })).toEqual([{ kind: 'roles', added: ['C'], removed: ['A'] }]);
  });

  it('reads a nickname set and one removed', () => {
    expect(memberChanges({}, { nickname: 'Pikku' })).toEqual([{ kind: 'nickname', to: 'Pikku' }]);
    expect(memberChanges({ nickname: 'Pikku' }, {})).toEqual([{ kind: 'nickname' }]);
  });

  it('keeps an edit with nothing recorded, such as a timeout’s end, as no changes', () => {
    expect(memberChanges({}, {})).toEqual([]);
  });
});

describe('mapAuditEntry', () => {
  it('decodes a reason Concord percent-encoded', () => {
    const e = mapAuditEntry({ _id: 'E', server: 'S', user: 'U', target: 'T', reason: '%C3%84l%C3%A4 %E2%80%94 ok', action: { type: 'MemberKick', user: 'T' } });
    expect(e).toEqual({ id: 'E', user: 'U', target: 'T', reason: 'Älä — ok', action: { type: 'MemberKick', user: 'T' } });
  });
});
