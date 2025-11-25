import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ForumController } from './controllers/forum.controller';
import { ForumService } from './services/forum.service';
import { TopicService } from './services/topic.service';
import { CommentService } from './services/comment.service';

@Module({
  imports: [ConfigModule], // Add ConfigModule if your services need ConfigService
  controllers: [ForumController],
  providers: [ForumService, TopicService, CommentService],
  exports: [ForumService, TopicService, CommentService],
})
export class ForumModule {}
