import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsString,
  IsTimeZone,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateMarathonDto {
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(120) name!: string;
  @ApiProperty() @IsDateString() startsOn!: string;
  @ApiProperty() @IsDateString() endsOn!: string;
  @ApiProperty() @IsTimeZone() timezone!: string;
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(120) teamName!: string;
}
export class JoinMarathonDto {
  @ApiProperty() @IsString() @IsNotEmpty() joinCode!: string;
}
export class OpenMarathonEnrollmentDto {
  @ApiProperty({ minimum: 1, maximum: 365 })
  @IsInt()
  @Min(1)
  @Max(365)
  durationDays!: number;
}
export class EmptyMarathonCommandDto {}
export class MarathonEnrollmentCreatedDto {
  @ApiProperty() marathonId!: string;
  @ApiProperty({ enum: ['enrollmentOpen'] }) status!: 'enrollmentOpen';
  @ApiProperty({ minimum: 1, maximum: 365 }) durationDays!: number;
  @ApiProperty() timezone!: string;
  @ApiProperty() membershipId!: string;
  @ApiProperty({ enum: ['captain'] }) role!: 'captain';
}
export class MarathonMembershipCreatedDto {
  @ApiProperty() membershipId!: string;
  @ApiProperty() marathonId!: string;
  @ApiProperty({ enum: ['captain', 'participant'] }) role!:
    'captain' | 'participant';
  @ApiProperty() createdAt!: string;
}
export class MarathonEnrollmentClosedDto {
  @ApiProperty() marathonId!: string;
  @ApiProperty({ enum: ['enrollmentClosed'] })
  status!: 'enrollmentClosed';
  @ApiProperty() enrollmentClosedAt!: string;
}
export class MarathonStartedDto {
  @ApiProperty() marathonId!: string;
  @ApiProperty({ enum: ['inProgress'] }) status!: 'inProgress';
  @ApiProperty() startsOn!: string;
  @ApiProperty() endsOn!: string;
  @ApiProperty() startedAt!: string;
}
export class MarathonLobbyMarathonDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty({
    enum: ['enrollmentOpen', 'enrollmentClosed', 'inProgress', 'completed'],
  })
  status!: 'enrollmentOpen' | 'enrollmentClosed' | 'inProgress' | 'completed';
  @ApiProperty({ minimum: 1, maximum: 365 }) durationDays!: number;
  @ApiProperty() timezone!: string;
  @ApiProperty({ type: String, nullable: true }) startsOn!: string | null;
  @ApiProperty({ type: String, nullable: true }) endsOn!: string | null;
  @ApiProperty() enrollmentOpenedAt!: string;
  @ApiProperty({ type: String, nullable: true })
  enrollmentClosedAt!: string | null;
  @ApiProperty({ type: String, nullable: true }) startedAt!: string | null;
  @ApiProperty({ type: String, nullable: true }) completedAt!: string | null;
}
export class MarathonEnrollmentSummaryDto {
  @ApiProperty() isOpen!: boolean;
  @ApiProperty({ minimum: 1 }) memberCount!: number;
}
export class MarathonLobbyMembershipDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: ['captain', 'participant'] }) role!:
    'captain' | 'participant';
}
export class MarathonLobbyDto {
  @ApiPropertyOptional({ type: MarathonLobbyMarathonDto, nullable: true })
  marathon!: MarathonLobbyMarathonDto | null;
  @ApiPropertyOptional({ type: MarathonEnrollmentSummaryDto, nullable: true })
  enrollment!: MarathonEnrollmentSummaryDto | null;
  @ApiPropertyOptional({ type: MarathonLobbyMembershipDto, nullable: true })
  currentMembership!: MarathonLobbyMembershipDto | null;
  @ApiProperty() canManage!: boolean;
  @ApiProperty() canOpenEnrollment!: boolean;
}
export class WellnessReportDto {
  @ApiProperty() @IsBoolean() morningShake!: boolean;
  @ApiProperty() @IsBoolean() physicalActivity!: boolean;
  @ApiProperty() @IsBoolean() waterTarget!: boolean;
  @ApiProperty() @IsBoolean() secondShake!: boolean;
  @ApiProperty() @IsBoolean() healthyDinner!: boolean;
  @ApiProperty() @IsBoolean() goodSleep!: boolean;
  @ApiProperty() @IsBoolean() noJunkFood!: boolean;
  @ApiProperty() @IsBoolean() noSmoking!: boolean;
}
export class CaptainTaskDto {
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(120) title!: string;
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  description!: string;
}
export class TaskCompletionDto {
  @ApiProperty() @IsBoolean() completed!: boolean;
}
export class ProviderConsentDto {
  @ApiProperty() @IsBoolean() accepted!: boolean;
  @ApiProperty() @IsString() @IsNotEmpty() documentVersion!: string;
}
export class TaskCompletionStatusDto {
  @ApiProperty({ enum: ['unknown', 'completed', 'notCompleted'] }) status!:
    'unknown' | 'completed' | 'notCompleted';
  @ApiProperty({ type: String, nullable: true }) updatedAt!: string | null;
}
export class CaptainTaskReadDto {
  @ApiProperty() id!: string;
  @ApiProperty() taskDate!: string;
  @ApiProperty() title!: string;
  @ApiProperty() description!: string;
  @ApiProperty({ type: TaskCompletionStatusDto })
  currentUserCompletion!: TaskCompletionStatusDto;
}
export class CaptainTaskResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() teamId!: string;
  @ApiProperty() taskDate!: string;
  @ApiProperty() title!: string;
  @ApiProperty() description!: string;
  @ApiProperty() updatedAt!: string;
}
export class TaskCompletionResponseDto {
  @ApiProperty() taskId!: string;
  @ApiProperty() membershipId!: string;
  @ApiProperty() completed!: boolean;
  @ApiProperty() updatedAt!: string;
}
export class MarathonSummaryDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() startsOn!: string;
  @ApiProperty() endsOn!: string;
  @ApiProperty() timezone!: string;
}
export class TeamSummaryDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
}
export class MembershipSummaryDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: ['captain', 'participant'] }) role!:
    'captain' | 'participant';
  @ApiProperty() isCurrentUser!: boolean;
}
export class CurrentMarathonDto {
  @ApiProperty({ type: MarathonSummaryDto }) marathon!: MarathonSummaryDto;
  @ApiProperty({ type: TeamSummaryDto }) team!: TeamSummaryDto;
  @ApiProperty({ type: MembershipSummaryDto })
  membership!: MembershipSummaryDto;
  @ApiProperty() displayDate!: string;
  @ApiProperty() reportDate!: string;
}
export class WellnessReportValuesDto extends WellnessReportDto {
  @ApiProperty() updatedAt!: string;
}
export class WellnessReportReadDto {
  @ApiProperty({ enum: ['notApplicable', 'unknown', 'reported'] }) status!:
    'notApplicable' | 'unknown' | 'reported';
  @ApiProperty() reportDate!: string;
  @ApiPropertyOptional({ type: WellnessReportValuesDto, nullable: true })
  report!: WellnessReportValuesDto | null;
}
export class WellnessReportSavedDto extends WellnessReportDto {
  @ApiProperty({ enum: ['reported'] }) status!: 'reported';
  @ApiProperty() reportDate!: string;
  @ApiProperty() markedCount!: number;
  @ApiProperty() updatedAt!: string;
}
export class MetricStatusDto {
  @ApiProperty({ enum: ['unknown', 'reported'] }) status!:
    'unknown' | 'reported';
  @ApiProperty({ type: Number, nullable: true }) dailyPercent!: number | null;
}
export class WellnessStatusDto {
  @ApiProperty({ enum: ['unknown', 'reported'] }) status!:
    'unknown' | 'reported';
  @ApiProperty({ type: Number, nullable: true }) markedCount!: number | null;
}
export class TaskStatusDto {
  @ApiProperty({
    enum: ['notAssigned', 'unknown', 'completed', 'notCompleted'],
  })
  status!: 'notAssigned' | 'unknown' | 'completed' | 'notCompleted';
}
export class TeamMemberTodayDto {
  @ApiProperty() membershipId!: string;
  @ApiProperty({ type: String, nullable: true }) displayName!: string | null;
  @ApiProperty({ enum: ['captain', 'participant'] }) role!:
    'captain' | 'participant';
  @ApiProperty() isCurrentUser!: boolean;
  @ApiProperty({ type: MetricStatusDto }) weight!: MetricStatusDto;
  @ApiProperty({ type: WellnessStatusDto }) wellness!: WellnessStatusDto;
  @ApiProperty({ type: TaskStatusDto }) captainTask!: TaskStatusDto;
}
export class PodiumMemberDto {
  @ApiProperty() membershipId!: string;
  @ApiProperty({ type: String, nullable: true }) displayName!: string | null;
  @ApiProperty({ enum: ['captain', 'participant'] }) role!:
    'captain' | 'participant';
  @ApiProperty() isCurrentUser!: boolean;
}
export class NumericPodiumPlaceDto {
  @ApiProperty({ minimum: 1, maximum: 3 }) place!: number;
  @ApiProperty() value!: number;
  @ApiProperty({ type: [PodiumMemberDto] }) members!: PodiumMemberDto[];
}
export class TaskPodiumPlaceDto {
  @ApiProperty({ minimum: 1, maximum: 1 }) place!: number;
  @ApiProperty({ enum: [true] }) value!: true;
  @ApiProperty({ type: [PodiumMemberDto] }) members!: PodiumMemberDto[];
}
export class PodiumsDto {
  @ApiProperty({ type: [NumericPodiumPlaceDto] })
  weight!: NumericPodiumPlaceDto[];
  @ApiProperty({ type: [NumericPodiumPlaceDto] })
  wellness!: NumericPodiumPlaceDto[];
  @ApiProperty({ type: [TaskPodiumPlaceDto] })
  captainTask!: TaskPodiumPlaceDto[];
}
export class TeamTodayDto {
  @ApiProperty() displayDate!: string;
  @ApiProperty() reportDate!: string;
  @ApiProperty({ type: TeamSummaryDto }) team!: TeamSummaryDto;
  @ApiProperty({ type: MembershipSummaryDto })
  currentMembership!: MembershipSummaryDto;
  @ApiPropertyOptional({ type: CaptainTaskReadDto, nullable: true })
  captainTask!: CaptainTaskReadDto | null;
  @ApiProperty({ type: [TeamMemberTodayDto] }) members!: TeamMemberTodayDto[];
  @ApiProperty({ type: PodiumsDto }) podiums!: PodiumsDto;
}
export class ProviderConsentMetadataDto {
  @ApiProperty({ enum: ['fake', 'genapi'] }) providerMode!: 'fake' | 'genapi';
  @ApiProperty() externalProviderEnabled!: boolean;
  @ApiProperty({ enum: ['fake', 'genapi'] }) foodProviderMode!:
    'fake' | 'genapi';
  @ApiProperty() foodExternalProviderEnabled!: boolean;
  @ApiProperty() documentVersion!: string;
  @ApiProperty() disclosure!: string;
  @ApiProperty() accepted!: boolean;
  @ApiProperty({ type: String, nullable: true }) acceptedAt!: string | null;
}
