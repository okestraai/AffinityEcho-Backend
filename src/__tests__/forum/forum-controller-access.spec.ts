import {
  GUARDS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import { ForumController } from '../../modules/forum/controllers/forum.controller';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { PERMISSION_KEY } from '../../common/decorators/require-permission.decorator';

const permissionOf = (handler: unknown) =>
  Reflect.getMetadata(PERMISSION_KEY, handler as object);

describe('ForumController access', () => {
  const proto = ForumController.prototype as any;

  it.each([
    ['createForum', 'forums:create'],
    ['updateForum', 'forums:update'],
    ['deleteForum', 'forums:delete'],
  ])('%s needs the admin permission %s', (method, permission) => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, proto[method]) ?? [];
    expect(guards).toContain(PermissionGuard);
    expect(permissionOf(proto[method])).toBe(permission);
  });

  it('has no forum setup route open to the public', () => {
    const paths = Object.getOwnPropertyNames(proto)
      .filter(
        (name) => typeof proto[name] === 'function' && name !== 'constructor',
      )
      .filter(
        (name) =>
          Reflect.getMetadata(METHOD_METADATA, proto[name]) !== undefined,
      )
      .map((name) => Reflect.getMetadata(PATH_METADATA, proto[name]));
    expect(paths.some((p: string) => String(p).includes('bootstrap'))).toBe(
      false,
    );
    expect(proto.bootstrapFoundationForums).toBeUndefined();
  });
});
