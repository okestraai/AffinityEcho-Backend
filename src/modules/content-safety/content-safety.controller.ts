import {
  Controller,
  Post,
  Param,
  Body,
  Req,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ContentSafetyService } from './content-safety.service';
import { FlagContentDto } from './dto/flag-content.dto';

const VALID_TYPES = ['post', 'comment', 'topic', 'nook', 'nook_message'];

// Strip type prefix from IDs (e.g. "post_uuid" → "uuid", "topic_uuid" → "uuid")
function stripIdPrefix(id: string): string {
  const match = id.match(/^(?:post|comment|topic|nook|nook_message)_(.+)$/);
  return match ? match[1] : id;
}

@ApiTags('Content Safety')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('content')
export class ContentSafetyController {
  constructor(private readonly contentSafetyService: ContentSafetyService) {}

  @Post(':type/:id/flag')
  @ApiOperation({ summary: 'Flag content for review' })
  @ApiParam({
    name: 'type',
    enum: ['post', 'comment', 'topic', 'nook', 'nook_message'],
  })
  @ApiParam({ name: 'id', description: 'Content UUID' })
  flagContent(
    @Req() req: any,
    @Param('type') type: string,
    @Param('id') id: string,
    @Body() dto: FlagContentDto,
  ) {
    if (!VALID_TYPES.includes(type)) {
      throw new BadRequestException(
        `Invalid content type. Must be one of: ${VALID_TYPES.join(', ')}`,
      );
    }
    const cleanId = stripIdPrefix(id);
    return this.contentSafetyService.flagContent(
      req.user.sub,
      type,
      cleanId,
      dto,
    );
  }

  @Post(':type/:id/hide')
  @ApiOperation({ summary: 'Hide content from your feed' })
  @ApiParam({
    name: 'type',
    enum: ['post', 'comment', 'topic', 'nook', 'nook_message'],
  })
  @ApiParam({ name: 'id', description: 'Content UUID' })
  hideContent(
    @Req() req: any,
    @Param('type') type: string,
    @Param('id') id: string,
  ) {
    if (!VALID_TYPES.includes(type)) {
      throw new BadRequestException(
        `Invalid content type. Must be one of: ${VALID_TYPES.join(', ')}`,
      );
    }
    const cleanId = stripIdPrefix(id);
    return this.contentSafetyService.hideContent(req.user.sub, type, cleanId);
  }
}
