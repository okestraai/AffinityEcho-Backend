import { GUARDS_METADATA } from '@nestjs/common/constants';
import { NookMembersController } from '../../modules/nooks/controllers/nook-members.controller';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { PERMISSION_KEY } from '../../common/decorators/require-permission.decorator';

// Nooks are anonymous, so only admins may list who is in one.
describe('NookMembersController access', () => {
  it('needs the admin permission nooks:view to list members', () => {
    const handler = NookMembersController.prototype.getMembers;
    expect(Reflect.getMetadata(GUARDS_METADATA, handler) ?? []).toContain(
      PermissionGuard,
    );
    expect(Reflect.getMetadata(PERMISSION_KEY, handler)).toBe('nooks:view');
  });
});
