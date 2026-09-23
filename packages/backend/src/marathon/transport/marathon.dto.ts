import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsDateString,
  IsNotEmpty,
  IsString,
  IsTimeZone,
  MaxLength,
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
  @ApiProperty() documentVersion!: string;
  @ApiProperty() disclosure!: string;
  @ApiProperty() accepted!: boolean;
  @ApiProperty({ type: String, nullable: true }) acceptedAt!: string | null;
}
