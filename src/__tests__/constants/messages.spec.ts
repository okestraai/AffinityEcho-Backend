import { MSG } from '../../common/constants/messages';

describe('MSG constants', () => {
  it('should export all top-level categories', () => {
    expect(MSG.AUTH).toBeDefined();
    expect(MSG.USER).toBeDefined();
    expect(MSG.FEED).toBeDefined();
    expect(MSG.FORUM).toBeDefined();
    expect(MSG.NOOK).toBeDefined();
    expect(MSG.MESSAGING).toBeDefined();
    expect(MSG.MENTORSHIP).toBeDefined();
    expect(MSG.REFERRAL).toBeDefined();
    expect(MSG.NOTIFICATION).toBeDefined();
    expect(MSG.FOLLOW).toBeDefined();
    expect(MSG.ENCRYPTION).toBeDefined();
    expect(MSG.COMPANY).toBeDefined();
    expect(MSG.ADMIN).toBeDefined();
    expect(MSG.REPORT).toBeDefined();
    expect(MSG.GENERIC).toBeDefined();
  });

  it('should have non-empty string values for AUTH', () => {
    Object.values(MSG.AUTH).forEach((val) => {
      expect(typeof val).toBe('string');
      expect(val.length).toBeGreaterThan(0);
    });
  });

  it('should have non-empty string values for USER', () => {
    Object.values(MSG.USER).forEach((val) => {
      expect(typeof val).toBe('string');
      expect(val.length).toBeGreaterThan(0);
    });
  });

  it('should have non-empty string values for FEED', () => {
    Object.values(MSG.FEED).forEach((val) => {
      expect(typeof val).toBe('string');
      expect(val.length).toBeGreaterThan(0);
    });
  });

  it('should have non-empty string values for FORUM', () => {
    Object.values(MSG.FORUM).forEach((val) => {
      expect(typeof val).toBe('string');
      expect(val.length).toBeGreaterThan(0);
    });
  });

  it('should have non-empty string values for NOOK', () => {
    Object.values(MSG.NOOK).forEach((val) => {
      expect(typeof val).toBe('string');
      expect(val.length).toBeGreaterThan(0);
    });
  });

  it('should have non-empty string values for MESSAGING', () => {
    Object.values(MSG.MESSAGING).forEach((val) => {
      expect(typeof val).toBe('string');
      expect(val.length).toBeGreaterThan(0);
    });
  });

  it('should have non-empty string values for MENTORSHIP', () => {
    Object.values(MSG.MENTORSHIP).forEach((val) => {
      expect(typeof val).toBe('string');
      expect(val.length).toBeGreaterThan(0);
    });
  });

  it('should have non-empty string values for REFERRAL', () => {
    Object.values(MSG.REFERRAL).forEach((val) => {
      expect(typeof val).toBe('string');
      expect(val.length).toBeGreaterThan(0);
    });
  });

  it('should have non-empty string values for NOTIFICATION', () => {
    Object.values(MSG.NOTIFICATION).forEach((val) => {
      expect(typeof val).toBe('string');
      expect(val.length).toBeGreaterThan(0);
    });
  });

  it('should have non-empty string values for GENERIC', () => {
    Object.values(MSG.GENERIC).forEach((val) => {
      expect(typeof val).toBe('string');
      expect(val.length).toBeGreaterThan(0);
    });
  });

  it('should have all expected keys in AUTH', () => {
    expect(MSG.AUTH.NO_TOKEN).toBeDefined();
    expect(MSG.AUTH.INVALID_TOKEN).toBeDefined();
    expect(MSG.AUTH.TOKEN_EXPIRED).toBeDefined();
    expect(MSG.AUTH.LOGGED_OUT).toBeDefined();
    expect(MSG.AUTH.OTP_SENT).toBeDefined();
  });
});
