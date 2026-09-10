import { inviteStatusOf } from './invite-status';

describe('inviteStatusOf', () => {
  it('NOT_INVITED when there is no account', () => {
    expect(inviteStatusOf(null, null)).toBe('NOT_INVITED');
  });
  it('INVITED when userId is set and the patient never opened the app', () => {
    expect(inviteStatusOf('u1', null)).toBe('INVITED');
  });
  it('ACTIVE after firstAppLoginAt', () => {
    expect(inviteStatusOf('u1', new Date('2026-09-01'))).toBe('ACTIVE');
  });
});
