import { CompanyVerificationController } from '../../modules/user/controllers/company-verification.controller';

function makeRes() {
  const res: any = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  res.redirect = jest.fn(() => res);
  return res;
}

function makeReq(accept: string) {
  return { accepts: (types: string[]) => (accept.includes('json') && !accept.includes('html') ? 'json' : types[0]) } as any;
}

describe('CompanyVerificationController.confirmVerification', () => {
  const ok = { success: true, message: 'Verified', redirectUrl: 'https://app.test.com/verify-company?status=success' };
  const expired = {
    success: false,
    reason: 'expired',
    message: 'Expired',
    redirectUrl: 'https://app.test.com/verify-company?status=error&reason=expired',
  };

  it('answers JSON to the app and the website', async () => {
    const service = { confirmVerification: jest.fn().mockResolvedValue(ok) };
    const res = makeRes();
    await new CompanyVerificationController(service as any).confirmVerification('t', makeReq('application/json, text/plain, */*'), res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ success: true, reason: undefined, message: 'Verified' });
    expect(res.redirect).not.toHaveBeenCalled();
  });

  it('answers 400 with the reason when the link has expired', async () => {
    const service = { confirmVerification: jest.fn().mockResolvedValue(expired) };
    const res = makeRes();
    await new CompanyVerificationController(service as any).confirmVerification('t', makeReq('application/json'), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: false, reason: 'expired' }));
  });

  it('sends a browser opening an old email link to the result page', async () => {
    const service = { confirmVerification: jest.fn().mockResolvedValue(ok) };
    const res = makeRes();
    await new CompanyVerificationController(service as any).confirmVerification('t', makeReq('text/html,application/xhtml+xml'), res);
    expect(res.redirect).toHaveBeenCalledWith(ok.redirectUrl);
  });
});
