import { Controller, Get, Param, Req, Res } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { CompanyVerificationService } from '../services/company-verification.service';

@ApiTags('Company Verification')
@Controller('user')
export class CompanyVerificationController {
  constructor(
    private readonly companyVerificationService: CompanyVerificationService,
  ) {}

  @Get('verify-company/:token')
  @ApiOperation({
    summary: 'Confirm company verification (clicked from email)',
  })
  async confirmVerification(
    @Param('token') token: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const outcome =
      await this.companyVerificationService.confirmVerification(token);
    // The app and the website ask for JSON; an old email link opened in a browser gets the page.
    if (req.accepts(['html', 'json']) === 'json') {
      const status = outcome.success
        ? 200
        : outcome.reason === 'server_error'
          ? 500
          : 400;
      return res.status(status).json({
        success: outcome.success,
        reason: outcome.reason,
        message: outcome.message,
      });
    }
    return res.redirect(outcome.redirectUrl);
  }
}
