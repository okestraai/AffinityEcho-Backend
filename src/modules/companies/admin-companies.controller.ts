import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CompaniesService } from './companies.service';
import { AddCompanyDto, SetCompanyActiveDto } from './dto/company.dto';

// Company spaces are forum spaces, so the forum permissions apply.
@ApiTags('Admin - Companies')
@ApiBearerAuth('access-token')
@Controller('admin/companies')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class AdminCompaniesController {
  constructor(private readonly companies: CompaniesService) {}

  @Get()
  @RequirePermission('forums:view')
  @ApiOperation({ summary: 'Every company on the list, including hidden ones' })
  list() {
    return this.companies.listForAdmin();
  }

  @Get('suggestions')
  @RequirePermission('forums:view')
  @ApiOperation({ summary: 'Typed companies shared by 5 or more members' })
  suggestions() {
    return this.companies.suggestions();
  }

  @Post()
  @RequirePermission('forums:create')
  @ApiOperation({
    summary: 'Add a company, create its forums and move members who typed it',
  })
  add(@Body() dto: AddCompanyDto, @CurrentUser() user: { userId: string }) {
    return this.companies.addCompany(dto.name, user.userId);
  }

  @Patch(':companyId')
  @RequirePermission('forums:update')
  @ApiOperation({ summary: 'Show or hide a company in onboarding' })
  setActive(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Body() dto: SetCompanyActiveDto,
  ) {
    return this.companies.setActive(companyId, dto.is_active);
  }
}
