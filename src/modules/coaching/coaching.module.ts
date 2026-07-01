/**
 * CoachingModule — the standalone AI coaching agent.
 *
 * Self-contained: all coaching logic lives under this folder. It depends only
 * on shared infrastructure (ConfigModule for env, the existing EncryptionUtil
 * for field-level encryption, and the shared Azure Postgres pool via getPool).
 * It imports no other feature module, so it cannot regress existing features.
 */
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EncryptionUtil } from '../../common/utils/encryption.util';
import { CoachingController } from './coaching.controller';
import { CoachSessionService } from './services/coach-session.service';
import { CoachRepositoryService } from './services/coach-repository.service';
import { CoachLlmRouterService } from './services/coach-llm-router.service';
import { CoachSafetyService } from './services/coach-safety.service';
import { CoachSpeechService } from './services/coach-speech.service';
import { CoachProfileService } from './services/coach-profile.service';
import { CoachLearningService } from './services/coach-learning.service';
import { CoachLearningJobs } from './jobs/coach-learning.jobs';

@Module({
  imports: [ConfigModule],
  controllers: [CoachingController],
  providers: [
    EncryptionUtil,
    CoachRepositoryService,
    CoachLlmRouterService,
    CoachSafetyService,
    CoachSpeechService,
    CoachProfileService,
    CoachLearningService,
    CoachLearningJobs,
    CoachSessionService,
  ],
  exports: [CoachSessionService],
})
export class CoachingModule {}
