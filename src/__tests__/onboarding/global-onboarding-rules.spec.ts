import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { OnboardingDataDto } from '../../modules/auth/dto/onboarding.dto';
import { UnifiedProfileEditDto } from '../../modules/user/dto/unified-profile-edit.dto';
import { AdminCompaniesController } from '../../modules/companies/admin-companies.controller';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { PERMISSION_KEY } from '../../common/decorators/require-permission.decorator';
import { sameCountryBonus } from '../../modules/mentorship/services/mentorship-discover.service';
import {
  splitEthnicities,
  titleCaseWords,
} from '../../common/constants/onboarding-options';

const errorsFor = async (body: Record<string, unknown>) =>
  (
    await validate(
      plainToInstance(OnboardingDataDto, {
        firstName: 'A',
        lastName: 'B',
        ...body,
      }),
    )
  ).map((e) => e.property);

describe('onboarding field rules', () => {
  it('accepts sign-ups with no country, so older apps keep working', async () => {
    expect(await errorsFor({})).toEqual([]);
  });

  it('accepts a lower-case country code and refuses a made-up one', async () => {
    expect(await errorsFor({ country: 'gb' })).toEqual([]);
    expect(await errorsFor({ country: 'XX' })).toContain('country');
  });

  it('accepts the new life stages', async () => {
    for (const careerLevel of [
      'Not currently working',
      'Self-employed',
      'Prefer not to say',
    ]) {
      expect(await errorsFor({ careerLevel })).toEqual([]);
    }
  });

  it('allows up to 5 ethnicities with no commas', async () => {
    expect(await errorsFor({ ethnicities: ['Caribbean', 'White'] })).toEqual(
      [],
    );
    expect(
      await errorsFor({ ethnicities: ['a', 'b', 'c', 'd', 'e', 'f'] }),
    ).toContain('ethnicities');
    expect(await errorsFor({ ethnicities: ['Black, African'] })).toContain(
      'ethnicities',
    );
  });

  it('needs a school only for students', async () => {
    expect(await errorsFor({ isStudent: false })).toEqual([]);
    expect(await errorsFor({ isStudent: true })).toContain('school');
    expect(await errorsFor({ isStudent: true, school: 'Unilag' })).toEqual([]);
  });

  it('limits the graduation year to this year up to 8 years ahead', async () => {
    const year = new Date().getFullYear();
    expect(await errorsFor({ expectedGradYear: year + 8 })).toEqual([]);
    expect(await errorsFor({ expectedGradYear: year - 1 })).toContain(
      'expectedGradYear',
    );
    expect(await errorsFor({ expectedGradYear: year + 9 })).toContain(
      'expectedGradYear',
    );
  });

  it('checks the country in Edit Profile too', async () => {
    const dto = plainToInstance(UnifiedProfileEditDto, {
      basic: { country_code: 'ZZ' },
    });
    expect((await validate(dto)).map((e) => e.property)).toContain('basic');
  });
});

describe('onboarding helpers', () => {
  it('reads older single answers as a list of one', () => {
    expect(splitEthnicities('Black/African American')).toEqual([
      'Black/African American',
    ]);
    expect(splitEthnicities('South Asian, White')).toEqual([
      'South Asian',
      'White',
    ]);
    expect(splitEthnicities(null)).toEqual([]);
  });

  it('capitalises each word but keeps the rest as typed', () => {
    expect(titleCaseWords('  university of  lagos ')).toBe(
      'University Of Lagos',
    );
    expect(titleCaseWords('MIT')).toBe('MIT');
  });
});

describe('mentorship country bonus', () => {
  it('adds points for the same country and never takes any away', () => {
    expect(
      sameCountryBonus({ country_code: 'NG' }, { country_code: 'NG' }),
    ).toBe(5);
    expect(
      sameCountryBonus({ country_code: 'NG' }, { country_code: 'GB' }),
    ).toBe(0);
    expect(
      sameCountryBonus({ country_code: null }, { country_code: 'GB' }),
    ).toBe(0);
  });
});

describe('AdminCompaniesController access', () => {
  const proto = AdminCompaniesController.prototype as any;

  it('needs the permission guard on every route', () => {
    expect(
      Reflect.getMetadata(GUARDS_METADATA, AdminCompaniesController),
    ).toContain(PermissionGuard);
  });

  it.each([
    ['list', 'forums:view'],
    ['suggestions', 'forums:view'],
    ['add', 'forums:create'],
    ['setActive', 'forums:update'],
  ])('%s needs %s', (method, permission) => {
    expect(Reflect.getMetadata(PERMISSION_KEY, proto[method])).toBe(permission);
  });
});
