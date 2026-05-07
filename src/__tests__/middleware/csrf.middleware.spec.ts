import { CsrfMiddleware } from '../../common/middlewares/csrf.middleware';

describe('CsrfMiddleware', () => {
  let middleware: CsrfMiddleware;
  let mockRes: any;
  let mockNext: jest.Mock;

  beforeEach(() => {
    middleware = new CsrfMiddleware();
    mockNext = jest.fn();
    mockRes = {
      cookie: jest.fn(),
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
  });

  it('should skip GET requests', () => {
    const req = { method: 'GET', headers: {}, cookies: {} } as any;
    middleware.use(req, mockRes, mockNext);
    expect(mockNext).toHaveBeenCalled();
  });

  it('should skip HEAD requests', () => {
    const req = { method: 'HEAD', headers: {}, cookies: {} } as any;
    middleware.use(req, mockRes, mockNext);
    expect(mockNext).toHaveBeenCalled();
  });

  it('should skip OPTIONS requests', () => {
    const req = { method: 'OPTIONS', headers: {}, cookies: {} } as any;
    middleware.use(req, mockRes, mockNext);
    expect(mockNext).toHaveBeenCalled();
  });

  it('should skip POST with Bearer token (mobile)', () => {
    const req = {
      method: 'POST',
      headers: { authorization: 'Bearer xyz' },
      cookies: {},
    } as any;
    middleware.use(req, mockRes, mockNext);
    expect(mockNext).toHaveBeenCalled();
  });

  it('should skip POST without CSRF cookie (non-web client)', () => {
    const req = { method: 'POST', headers: {}, cookies: {} } as any;
    middleware.use(req, mockRes, mockNext);
    expect(mockNext).toHaveBeenCalled();
  });

  it('should reject POST when CSRF cookie exists but header missing', () => {
    const req = {
      method: 'POST',
      headers: {},
      cookies: { 'XSRF-TOKEN': 'abc123' },
    } as any;
    middleware.use(req, mockRes, mockNext);
    expect(mockNext).not.toHaveBeenCalled();
    expect(mockRes.status).toHaveBeenCalledWith(403);
    expect(mockRes.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Invalid CSRF token' }),
    );
  });

  it('should reject POST when CSRF cookie and header mismatch', () => {
    const req = {
      method: 'POST',
      headers: { 'x-xsrf-token': 'wrong' },
      cookies: { 'XSRF-TOKEN': 'abc123' },
    } as any;
    middleware.use(req, mockRes, mockNext);
    expect(mockNext).not.toHaveBeenCalled();
    expect(mockRes.status).toHaveBeenCalledWith(403);
  });

  it('should allow POST when CSRF cookie and header match', () => {
    const req = {
      method: 'POST',
      headers: { 'x-xsrf-token': 'abc123' },
      cookies: { 'XSRF-TOKEN': 'abc123' },
    } as any;
    middleware.use(req, mockRes, mockNext);
    expect(mockNext).toHaveBeenCalled();
  });

  it('should set XSRF-TOKEN cookie for web clients on GET', () => {
    const req = {
      method: 'GET',
      headers: { origin: 'http://localhost:5173' },
      cookies: {},
    } as any;
    middleware.use(req, mockRes, mockNext);
    expect(mockRes.cookie).toHaveBeenCalledWith(
      'XSRF-TOKEN',
      expect.any(String),
      expect.objectContaining({ httpOnly: false }),
    );
  });

  it('should not set cookie if already has one', () => {
    const req = {
      method: 'GET',
      headers: { origin: 'http://localhost:5173' },
      cookies: { 'XSRF-TOKEN': 'existing' },
    } as any;
    middleware.use(req, mockRes, mockNext);
    expect(mockRes.cookie).not.toHaveBeenCalled();
  });

  it('should not set cookie for non-web clients', () => {
    const req = { method: 'GET', headers: {}, cookies: {} } as any;
    middleware.use(req, mockRes, mockNext);
    expect(mockRes.cookie).not.toHaveBeenCalled();
  });
});
