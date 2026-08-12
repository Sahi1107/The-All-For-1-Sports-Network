// AUTO-GENERATED from server/prisma/schema.prisma — do not edit by hand.
// Regenerate: npm run gen -w @af1/types   (guarded by enums.drift.test.ts)
/* eslint-disable */

export const RoleValues = ['ATHLETE', 'COACH', 'SCOUT', 'TEAM', 'AGENT', 'MEDIA', 'ADMIN', 'ORGANIZER'] as const;
export type Role = (typeof RoleValues)[number];

export const SportValues = ['BASKETBALL', 'FOOTBALL', 'CRICKET', 'FIELD_HOCKEY', 'BADMINTON', 'ATHLETICS', 'WRESTLING', 'BOXING', 'SHOOTING', 'WEIGHTLIFTING', 'ARCHERY', 'TENNIS', 'TABLE_TENNIS', 'RUGBY', 'SWIMMING', 'VOLLEYBALL'] as const;
export type Sport = (typeof SportValues)[number];

export const ConnectionStatusValues = ['PENDING', 'ACCEPTED', 'REJECTED'] as const;
export type ConnectionStatus = (typeof ConnectionStatusValues)[number];

export const TournamentStatusValues = ['UPCOMING', 'REGISTRATION_OPEN', 'REGISTRATION_CLOSED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'] as const;
export type TournamentStatus = (typeof TournamentStatusValues)[number];

export const TournamentFormatValues = ['TEAM', 'INDIVIDUAL', 'DOUBLES'] as const;
export type TournamentFormat = (typeof TournamentFormatValues)[number];

export const StatsSourceValues = ['TRACKER', 'MANUAL'] as const;
export type StatsSource = (typeof StatsSourceValues)[number];

export const MatchStatusValues = ['SCHEDULED', 'LIVE', 'COMPLETED'] as const;
export type MatchStatus = (typeof MatchStatusValues)[number];

export const TrackerBracketFormatValues = ['LEAGUE', 'KNOCKOUT', 'MIXED'] as const;
export type TrackerBracketFormat = (typeof TrackerBracketFormatValues)[number];

export const TrackerMatchStatusValues = ['SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'PUBLISHED'] as const;
export type TrackerMatchStatus = (typeof TrackerMatchStatusValues)[number];

export const TeamMemberRoleValues = ['CAPTAIN', 'PLAYER', 'COACH'] as const;
export type TeamMemberRole = (typeof TeamMemberRoleValues)[number];

export const TeamMemberStatusValues = ['PENDING', 'ACCEPTED', 'DECLINED'] as const;
export type TeamMemberStatus = (typeof TeamMemberStatusValues)[number];

export const AnnouncementTypeValues = ['TRIAL', 'TRAINING', 'GENERAL'] as const;
export type AnnouncementType = (typeof AnnouncementTypeValues)[number];

export const NotificationTypeValues = ['FOLLOW', 'CONNECTION_REQUEST', 'CONNECTION_ACCEPTED', 'TOURNAMENT_UPDATE', 'TEAM_INVITE', 'TEAM_JOIN_REQUEST', 'RANKING_UPDATE', 'HIGHLIGHT_VIEW', 'ANNOUNCEMENT', 'SYSTEM', 'LIKE', 'COMMENT', 'REPOST', 'MESSAGE', 'ENDORSEMENT', 'PROFILE_VIEW', 'PROFILE_VIEWS_WEEKLY', 'STATS_VERIFIED', 'RANKING_MILESTONE', 'MATCH_STARTING_SOON', 'MATCH_RESULT_PUBLISHED', 'REGISTRATION_OPEN', 'REGISTRATION_CLOSING', 'DRAW_PUBLISHED', 'FIXTURES_SCHEDULED', 'NEW_ATHLETE_MATCH'] as const;
export type NotificationType = (typeof NotificationTypeValues)[number];

export const DigestFrequencyValues = ['INSTANT', 'DAILY', 'WEEKLY', 'OFF'] as const;
export type DigestFrequency = (typeof DigestFrequencyValues)[number];

export const InviteKindValues = ['GENERAL', 'TEAMMATE', 'COACH', 'ATHLETE', 'TOURNAMENT'] as const;
export type InviteKind = (typeof InviteKindValues)[number];

export const PostTypeValues = ['TEXT', 'IMAGE', 'HIGHLIGHT', 'PERFORMANCE'] as const;
export type PostType = (typeof PostTypeValues)[number];

export const HandoverStatusValues = ['NONE', 'PENDING', 'CONSENTED'] as const;
export type HandoverStatus = (typeof HandoverStatusValues)[number];

export const GuardianConsentStatusValues = ['PENDING', 'CONSENTED'] as const;
export type GuardianConsentStatus = (typeof GuardianConsentStatusValues)[number];

export const GenderValues = ['MALE', 'FEMALE'] as const;
export type Gender = (typeof GenderValues)[number];

export const ClaimStatusValues = ['UNCLAIMED', 'CLAIMED'] as const;
export type ClaimStatus = (typeof ClaimStatusValues)[number];

export const ReportStatusValues = ['OPEN', 'REVIEWED', 'DISMISSED', 'ACTIONED'] as const;
export type ReportStatus = (typeof ReportStatusValues)[number];

export const ReportTargetTypeValues = ['USER', 'POST', 'COMMENT', 'MESSAGE'] as const;
export type ReportTargetType = (typeof ReportTargetTypeValues)[number];

export const ModerationActionTypeValues = ['SUSPEND', 'UNSUSPEND', 'CONTENT_REMOVED'] as const;
export type ModerationActionType = (typeof ModerationActionTypeValues)[number];

export const AppealKindValues = ['ACCOUNT_SUSPENSION', 'CONTENT_REMOVAL'] as const;
export type AppealKind = (typeof AppealKindValues)[number];

export const AppealStatusValues = ['PENDING', 'REVIEWING', 'GRANTED', 'DENIED'] as const;
export type AppealStatus = (typeof AppealStatusValues)[number];

export const OrganizerAuditActionValues = ['GRANTED', 'REVOKED'] as const;
export type OrganizerAuditAction = (typeof OrganizerAuditActionValues)[number];

export const ENUMS = {
  Role: RoleValues,
  Sport: SportValues,
  ConnectionStatus: ConnectionStatusValues,
  TournamentStatus: TournamentStatusValues,
  TournamentFormat: TournamentFormatValues,
  StatsSource: StatsSourceValues,
  MatchStatus: MatchStatusValues,
  TrackerBracketFormat: TrackerBracketFormatValues,
  TrackerMatchStatus: TrackerMatchStatusValues,
  TeamMemberRole: TeamMemberRoleValues,
  TeamMemberStatus: TeamMemberStatusValues,
  AnnouncementType: AnnouncementTypeValues,
  NotificationType: NotificationTypeValues,
  DigestFrequency: DigestFrequencyValues,
  InviteKind: InviteKindValues,
  PostType: PostTypeValues,
  HandoverStatus: HandoverStatusValues,
  GuardianConsentStatus: GuardianConsentStatusValues,
  Gender: GenderValues,
  ClaimStatus: ClaimStatusValues,
  ReportStatus: ReportStatusValues,
  ReportTargetType: ReportTargetTypeValues,
  ModerationActionType: ModerationActionTypeValues,
  AppealKind: AppealKindValues,
  AppealStatus: AppealStatusValues,
  OrganizerAuditAction: OrganizerAuditActionValues,
} as const;
