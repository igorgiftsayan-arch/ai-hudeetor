import {
  Body,
  Controller,
  Get,
  Inject,
  Patch,
  Put,
  Req,
  Res,
} from '@nestjs/common';
import { ApiCookieAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { CsrfService } from '../../identity/transport/csrf.service';
import { GetOnboardingUseCase } from '../application/get-onboarding.use-case';
import { SavePersonaPreferenceUseCase } from '../application/save-persona-preference.use-case';
import { SaveProfileSetupUseCase } from '../application/save-profile-setup.use-case';
import { profilesErrors } from '../domain/profiles-error';
// Request DTO values are required by Nest's emitted design:paramtypes metadata.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import {
  AiPreferenceRequestDto,
  AiPreferenceResourceDto,
  OnboardingResourceDto,
  UpdateProfileRequestDto,
  UserProfileResourceDto,
} from './profiles.dto';
import { PROFILES_OPTIONS, type ProfilesOptions } from './profiles.tokens';

const accessCookieName = 'atlas_access';
@ApiTags('profiles')
@ApiCookieAuth()
@Controller('users/me')
export class ProfilesController {
  constructor(
    @Inject(GetOnboardingUseCase)
    private readonly getOnboarding: GetOnboardingUseCase,
    @Inject(SaveProfileSetupUseCase)
    private readonly saveProfile: SaveProfileSetupUseCase,
    @Inject(SavePersonaPreferenceUseCase)
    private readonly savePreference: SavePersonaPreferenceUseCase,
    @Inject(PROFILES_OPTIONS) private readonly options: ProfilesOptions,
    @Inject(CsrfService) private readonly csrf: CsrfService,
  ) {}
  @Get('onboarding')
  @ApiOkResponse({ type: OnboardingResourceDto })
  async onboarding(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<OnboardingResourceDto> {
    const state = await this.getOnboarding.execute(this.accessToken(request));
    return {
      status: state.status,
      completedSteps: completedStepsFor(state.status),
      requiredSteps: ['legal', 'timezone', 'persona'],
      canComplete: false,
      aiWellnessNoticeVersion: this.options.aiWellnessNoticeVersion,
      csrfToken: this.csrf.generate(
        request,
        response,
        request.cookies?.atlas_refresh ?? '',
      ),
      profile: state.profile
        ? { ...state.profile, onboardingStatus: state.status }
        : undefined,
      aiPreference: state.preference
        ? { ...state.preference, onboardingStatus: state.status }
        : undefined,
    };
  }
  @Patch('profile')
  @ApiOkResponse({ type: UserProfileResourceDto })
  updateProfile(
    @Body() body: UpdateProfileRequestDto,
    @Req() request: Request,
  ): Promise<UserProfileResourceDto> {
    if (!isCanonicalIanaTimezone(body.timezone))
      throw profilesErrors.invalidTimezone();
    return this.saveProfile.execute({
      accessToken: this.accessToken(request),
      timezone: body.timezone,
      ...(Object.hasOwn(body, 'displayName')
        ? { displayName: body.displayName?.trim().normalize('NFC') ?? null }
        : {}),
      ...(Object.hasOwn(body, 'targetWeightKg')
        ? {
            targetWeightKg:
              body.targetWeightKg === null
                ? null
                : body.targetWeightKg?.toFixed(2),
          }
        : {}),
      wellnessNoticeVersion: body.consents?.[0]?.documentVersion,
    }).then((profile) => ({
      ...profile,
      targetWeightKg:
        profile.targetWeightKg === null ? null : Number(profile.targetWeightKg),
    }));
  }
  @Put('ai-preference')
  @ApiOkResponse({ type: AiPreferenceResourceDto })
  updatePreference(
    @Body() body: AiPreferenceRequestDto,
    @Req() request: Request,
  ): Promise<AiPreferenceResourceDto> {
    return this.savePreference.execute({
      accessToken: this.accessToken(request),
      ...body,
    });
  }
  private accessToken(request: Request): string {
    return request.cookies?.[accessCookieName] ?? '';
  }
}
function completedStepsFor(status: string): string[] {
  if (status === 'registered') return [];
  if (status === 'profileReady') return ['legal', 'timezone'];
  return ['legal', 'timezone', 'persona'];
}
function isCanonicalIanaTimezone(value: string): boolean {
  try {
    return Intl.supportedValuesOf('timeZone').includes(value);
  } catch {
    return false;
  }
}
