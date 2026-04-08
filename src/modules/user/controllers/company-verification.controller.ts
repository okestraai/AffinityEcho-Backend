import { Controller, Get, Param, Res } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Response } from 'express';
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
    @Res() res: Response,
  ) {
    const { redirectUrl } =
      await this.companyVerificationService.confirmVerification(token);
    return res.redirect(redirectUrl);
  }
}
