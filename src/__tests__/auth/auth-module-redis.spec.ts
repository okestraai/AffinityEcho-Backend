import { MODULE_METADATA } from '@nestjs/common/constants';
import { AuthModule } from '../../modules/auth/auth.module';
import { RedisService } from '../../common/services/redis.service';

// Without Redis here, email codes and wrong-code counts live in one server's memory only.
describe('AuthModule', () => {
  it('provides Redis to the auth service', () => {
    const providers =
      Reflect.getMetadata(MODULE_METADATA.PROVIDERS, AuthModule) ?? [];
    expect(providers).toContain(RedisService);
  });
});
