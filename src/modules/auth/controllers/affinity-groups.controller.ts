import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../../../common/decorators/public.decorator';
import { AFFINITY_GROUPS } from '../../../common/constants/affinity-groups';

@ApiTags('Affinity Groups')
@Controller('affinity-groups')
export class AffinityGroupsController {
  @Public()
  @Get()
  @ApiOperation({
    summary: 'List affinity groups',
    description:
      'Canonical list of affinity groups (id, label, icon). Single source of truth so clients stop hardcoding the list.',
  })
  @ApiResponse({
    status: 200,
    description: 'Affinity groups retrieved successfully',
  })
  getAffinityGroups() {
    return { affinity_groups: AFFINITY_GROUPS };
  }
}
