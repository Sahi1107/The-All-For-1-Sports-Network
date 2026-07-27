import type { NotificationType, DigestFrequency } from '@prisma/client';

// ─────────────────────────────────────────────────────────────────────────────
// Notification catalog — the single source of truth for every notification type:
// its copy (in-app + email), its sensible default channels, and its anti-spam
// behaviour. The dispatcher and the preferences UI both read from here, so
// adding a type is a one-entry change and defaults stay consistent.
// ─────────────────────────────────────────────────────────────────────────────

export type NotifCategory = 'social' | 'profile' | 'competition' | 'team' | 'system';

/** Data a trigger passes; the catalog renders copy from it (no strings in triggers). */
export interface NotifCtx {
  actorName?: string;   // person who caused it
  count?: number;       // for collapsed "N people …"
  entityName?: string;  // post preview / team / tournament / match label
  extra?: string;       // ranking position, stat line, "6:30 PM · Court 2", etc.
}

export interface NotifMeta {
  category: NotifCategory;
  label: string;                 // row label in settings
  description: string;           // help text in settings
  defaultInApp: boolean;
  defaultEmail: boolean;
  defaultDigest: DigestFrequency;
  collapsible: boolean;          // collapse repeats into one "N …" row
  collapseWindowMins: number;    // cap on how old a row we'll collapse into
  configurable: boolean;         // false ⇒ user can't disable (account/security)
  title: (c: NotifCtx) => string;
  body: (c: NotifCtx) => string;
  collapsedBody?: (c: NotifCtx) => string; // count > 1
  emailSubject: (c: NotifCtx) => string;
}

const others = (c: NotifCtx) => (c.count && c.count > 2 ? `${c.count - 1} others` : '1 other');

export const CATALOG: Record<NotificationType, NotifMeta> = {
  // ── Social ──────────────────────────────────────────────────────────────
  FOLLOW: {
    category: 'social', label: 'New followers', description: 'When someone follows you',
    defaultInApp: true, defaultEmail: false, defaultDigest: 'DAILY',
    collapsible: true, collapseWindowMins: 1440, configurable: true,
    title: () => 'New follower',
    body: (c) => `${c.actorName} started following you`,
    collapsedBody: (c) => `${c.actorName} and ${others(c)} started following you`,
    emailSubject: (c) => `${c.actorName} started following you`,
  },
  CONNECTION_REQUEST: {
    category: 'social', label: 'Connection requests', description: 'When someone wants to connect',
    defaultInApp: true, defaultEmail: true, defaultDigest: 'INSTANT',
    collapsible: false, collapseWindowMins: 0, configurable: true,
    title: () => 'Connection request',
    body: (c) => `${c.actorName} wants to connect`,
    emailSubject: (c) => `${c.actorName} wants to connect on All For 1`,
  },
  CONNECTION_ACCEPTED: {
    category: 'social', label: 'Connections accepted', description: 'When someone accepts your request',
    defaultInApp: true, defaultEmail: false, defaultDigest: 'INSTANT',
    collapsible: false, collapseWindowMins: 0, configurable: true,
    title: () => 'Connection accepted',
    body: (c) => `${c.actorName} accepted your connection request`,
    emailSubject: (c) => `${c.actorName} is now connected with you`,
  },
  LIKE: {
    category: 'social', label: 'Post likes', description: 'When someone likes your post',
    defaultInApp: true, defaultEmail: false, defaultDigest: 'OFF',
    collapsible: true, collapseWindowMins: 1440, configurable: true,
    title: () => 'New like',
    body: (c) => `${c.actorName} liked your post`,
    collapsedBody: (c) => `${c.actorName} and ${others(c)} liked your post`,
    emailSubject: (c) => `${c.actorName} liked your post`,
  },
  COMMENT: {
    category: 'social', label: 'Comments', description: 'When someone comments on your post',
    defaultInApp: true, defaultEmail: false, defaultDigest: 'DAILY',
    collapsible: true, collapseWindowMins: 1440, configurable: true,
    title: () => 'New comment',
    body: (c) => `${c.actorName} commented on your post`,
    collapsedBody: (c) => `${c.actorName} and ${others(c)} commented on your post`,
    emailSubject: (c) => `${c.actorName} commented on your post`,
  },
  REPOST: {
    category: 'social', label: 'Reposts', description: 'When someone reposts your post',
    defaultInApp: true, defaultEmail: false, defaultDigest: 'OFF',
    collapsible: true, collapseWindowMins: 1440, configurable: true,
    title: () => 'New repost',
    body: (c) => `${c.actorName} reposted your post`,
    collapsedBody: (c) => `${c.actorName} and ${others(c)} reposted your post`,
    emailSubject: (c) => `${c.actorName} reposted your post`,
  },
  MESSAGE: {
    category: 'social', label: 'Messages', description: 'When you receive a direct message',
    defaultInApp: true, defaultEmail: false, defaultDigest: 'INSTANT',
    collapsible: true, collapseWindowMins: 120, configurable: true,
    title: () => 'New message',
    body: (c) => `${c.actorName} sent you a message`,
    collapsedBody: (c) => `${c.actorName} sent you ${c.count} messages`,
    emailSubject: (c) => `${c.actorName} sent you a message`,
  },

  // ── Profile / recognition ────────────────────────────────────────────────
  PROFILE_VIEW: {
    category: 'profile', label: 'Profile views', description: 'When a scout or coach views your profile',
    defaultInApp: true, defaultEmail: false, defaultDigest: 'OFF',
    collapsible: true, collapseWindowMins: 10080, configurable: true,
    title: () => 'Profile view',
    body: (c) => `A ${c.extra ?? 'scout'} viewed your profile`,
    collapsedBody: (c) => `${c.count} scouts and coaches viewed your profile`,
    emailSubject: () => 'Someone viewed your profile',
  },
  PROFILE_VIEWS_WEEKLY: {
    category: 'profile', label: 'Weekly profile-views digest', description: 'A weekly summary of who viewed your profile',
    // Generated by the weekly cron itself, so it emails immediately when created.
    defaultInApp: true, defaultEmail: true, defaultDigest: 'INSTANT',
    collapsible: false, collapseWindowMins: 0, configurable: true,
    title: () => 'Your week on All For 1',
    body: (c) => `Your profile got ${c.count} views this week`,
    emailSubject: (c) => `You got ${c.count} profile views this week`,
  },
  HIGHLIGHT_VIEW: {
    category: 'profile', label: 'Highlight views', description: 'When your highlights reach view milestones',
    defaultInApp: true, defaultEmail: false, defaultDigest: 'OFF',
    collapsible: true, collapseWindowMins: 10080, configurable: true,
    title: () => 'Highlight views',
    body: (c) => `Your highlight reached ${c.extra ?? 'a new milestone'}`,
    emailSubject: () => 'Your highlights are getting noticed',
  },
  ENDORSEMENT: {
    category: 'profile', label: 'Endorsements', description: 'When a coach endorses you',
    defaultInApp: true, defaultEmail: true, defaultDigest: 'INSTANT',
    collapsible: false, collapseWindowMins: 0, configurable: true,
    title: () => 'New endorsement',
    body: (c) => `${c.actorName} endorsed you`,
    emailSubject: (c) => `${c.actorName} endorsed you on All For 1`,
  },
  STATS_VERIFIED: {
    category: 'profile', label: 'Stats verified', description: 'When your stats are verified or your Performance Card updates',
    defaultInApp: true, defaultEmail: true, defaultDigest: 'INSTANT',
    collapsible: false, collapseWindowMins: 0, configurable: true,
    title: () => 'Stats verified',
    body: (c) => c.extra ?? 'Your stats were verified and your Performance Card updated',
    emailSubject: () => 'Your stats were verified',
  },

  // ── Competition ──────────────────────────────────────────────────────────
  RANKING_UPDATE: {
    category: 'competition', label: 'Ranking changes', description: 'When your ranking changes',
    defaultInApp: true, defaultEmail: false, defaultDigest: 'WEEKLY',
    collapsible: false, collapseWindowMins: 0, configurable: true,
    title: () => 'Ranking updated',
    body: (c) => c.extra ?? 'Your ranking changed',
    emailSubject: () => 'Your ranking changed',
  },
  RANKING_MILESTONE: {
    category: 'competition', label: 'Ranking milestones', description: "When you enter a top-N or hit a milestone",
    defaultInApp: true, defaultEmail: true, defaultDigest: 'INSTANT',
    collapsible: false, collapseWindowMins: 0, configurable: true,
    title: () => 'Ranking milestone',
    body: (c) => c.extra ?? 'You reached a new ranking milestone',
    emailSubject: (c) => c.extra ?? 'You hit a ranking milestone',
  },
  MATCH_STARTING_SOON: {
    category: 'competition', label: 'Match starting soon', description: 'A reminder before your match',
    defaultInApp: true, defaultEmail: true, defaultDigest: 'INSTANT',
    collapsible: false, collapseWindowMins: 0, configurable: true,
    title: () => 'Match starting soon',
    body: (c) => `${c.entityName ?? 'Your match'} starts soon${c.extra ? ` · ${c.extra}` : ''}`,
    emailSubject: (c) => `${c.entityName ?? 'Your match'} starts soon`,
  },
  MATCH_RESULT_PUBLISHED: {
    category: 'competition', label: 'Match results', description: 'When your match result and stats are published',
    defaultInApp: true, defaultEmail: true, defaultDigest: 'INSTANT',
    collapsible: false, collapseWindowMins: 0, configurable: true,
    title: () => 'Match result published',
    body: (c) => `Results are in for ${c.entityName ?? 'your match'}${c.extra ? ` — ${c.extra}` : ''}`,
    emailSubject: (c) => `Your ${c.entityName ?? 'match'} result is live`,
  },
  REGISTRATION_OPEN: {
    category: 'competition', label: 'Registration opened', description: "When a tournament you're eligible for opens registration",
    defaultInApp: true, defaultEmail: true, defaultDigest: 'INSTANT',
    collapsible: false, collapseWindowMins: 0, configurable: true,
    title: () => 'Registration open',
    body: (c) => `${c.entityName ?? 'A tournament'} you're eligible for opened registration`,
    emailSubject: (c) => `Registration is open for ${c.entityName ?? 'a tournament'}`,
  },
  REGISTRATION_CLOSING: {
    category: 'competition', label: 'Registration closing', description: 'When registration for a tournament closes soon',
    defaultInApp: true, defaultEmail: true, defaultDigest: 'INSTANT',
    collapsible: false, collapseWindowMins: 0, configurable: true,
    title: () => 'Registration closing soon',
    body: (c) => `Registration for ${c.entityName ?? 'a tournament'} closes soon${c.extra ? ` · ${c.extra}` : ''}`,
    emailSubject: (c) => `Last chance: ${c.entityName ?? 'tournament'} registration closes soon`,
  },
  DRAW_PUBLISHED: {
    category: 'competition', label: 'Draw published', description: 'When a tournament draw/bracket is published',
    defaultInApp: true, defaultEmail: true, defaultDigest: 'INSTANT',
    collapsible: false, collapseWindowMins: 0, configurable: true,
    title: () => 'Draw published',
    body: (c) => `The draw for ${c.entityName ?? 'your tournament'} is out${c.extra ? ` — ${c.extra}` : ''}`,
    emailSubject: (c) => `The ${c.entityName ?? 'tournament'} draw is published`,
  },
  FIXTURES_SCHEDULED: {
    category: 'competition', label: 'Fixtures scheduled', description: 'When your fixtures are scheduled',
    defaultInApp: true, defaultEmail: true, defaultDigest: 'INSTANT',
    collapsible: false, collapseWindowMins: 0, configurable: true,
    title: () => 'Fixtures scheduled',
    body: (c) => `${c.entityName ?? 'Your'} fixtures were scheduled${c.extra ? ` · next: ${c.extra}` : ''}`,
    emailSubject: (c) => `${c.entityName ?? 'Your'} fixtures are scheduled`,
  },
  TOURNAMENT_UPDATE: {
    category: 'competition', label: 'Tournament updates', description: 'General updates for tournaments you follow',
    defaultInApp: true, defaultEmail: false, defaultDigest: 'DAILY',
    collapsible: false, collapseWindowMins: 0, configurable: true,
    title: () => 'Tournament update',
    body: (c) => c.extra ?? `${c.entityName ?? 'A tournament'} has an update`,
    emailSubject: (c) => `Update: ${c.entityName ?? 'your tournament'}`,
  },

  // ── Team ─────────────────────────────────────────────────────────────────
  TEAM_INVITE: {
    category: 'team', label: 'Team invites', description: 'When a team invites you',
    defaultInApp: true, defaultEmail: true, defaultDigest: 'INSTANT',
    collapsible: false, collapseWindowMins: 0, configurable: true,
    title: () => 'Team invite',
    body: (c) => `${c.entityName ?? 'A team'} invited you to join`,
    emailSubject: (c) => `${c.entityName ?? 'A team'} invited you on All For 1`,
  },
  TEAM_JOIN_REQUEST: {
    category: 'team', label: 'Join requests', description: 'When someone asks to join your team',
    defaultInApp: true, defaultEmail: true, defaultDigest: 'INSTANT',
    collapsible: false, collapseWindowMins: 0, configurable: true,
    title: () => 'Join request',
    body: (c) => `${c.actorName} asked to join ${c.entityName ?? 'your team'}`,
    emailSubject: (c) => `${c.actorName} wants to join ${c.entityName ?? 'your team'}`,
  },

  // ── Scout-facing ─────────────────────────────────────────────────────────
  NEW_ATHLETE_MATCH: {
    category: 'profile', label: 'Matching athletes joined', description: 'When an athlete matching your interests joins (scouts/coaches)',
    defaultInApp: true, defaultEmail: false, defaultDigest: 'DAILY',
    collapsible: true, collapseWindowMins: 1440, configurable: true,
    title: () => 'New athlete match',
    body: (c) => `${c.actorName}, ${c.extra ?? 'a new athlete'} matching your interests, just joined`,
    collapsedBody: (c) => `${c.count} new athletes matching your interests joined`,
    emailSubject: () => 'New athletes matching your interests',
  },

  // ── System (mandatory) ───────────────────────────────────────────────────
  ANNOUNCEMENT: {
    category: 'system', label: 'Announcements', description: 'Platform announcements',
    defaultInApp: true, defaultEmail: false, defaultDigest: 'INSTANT',
    collapsible: false, collapseWindowMins: 0, configurable: true,
    title: (c) => c.entityName ?? 'Announcement',
    body: (c) => c.extra ?? 'There is a new announcement',
    emailSubject: (c) => c.entityName ?? 'A new announcement from All For 1',
  },
  SYSTEM: {
    category: 'system', label: 'Account & security', description: 'Important account and security notices (always on)',
    defaultInApp: true, defaultEmail: true, defaultDigest: 'INSTANT',
    collapsible: false, collapseWindowMins: 0, configurable: false,
    title: () => 'Account notice',
    body: (c) => c.extra ?? 'There is an update to your account',
    emailSubject: (c) => c.extra ?? 'An update to your All For 1 account',
  },
};

/** Render the in-app title/message for a notification (handles collapsed count). */
export function renderCopy(type: NotificationType, ctx: NotifCtx): { title: string; message: string } {
  const meta = CATALOG[type];
  const collapsed = (ctx.count ?? 1) > 1 && meta.collapsedBody;
  return {
    title: meta.title(ctx),
    message: collapsed ? meta.collapsedBody!(ctx) : meta.body(ctx),
  };
}

/** Serializable per-type metadata for the settings screen (no render fns). */
export interface PreferenceMeta {
  type: NotificationType;
  category: NotifCategory;
  label: string;
  description: string;
  configurable: boolean;
  collapsible: boolean;
  default: { inApp: boolean; email: boolean; digest: DigestFrequency };
}

export function preferenceMeta(): PreferenceMeta[] {
  return (Object.keys(CATALOG) as NotificationType[]).map((type) => {
    const m = CATALOG[type];
    return {
      type, category: m.category, label: m.label, description: m.description,
      configurable: m.configurable, collapsible: m.collapsible,
      default: { inApp: m.defaultInApp, email: m.defaultEmail, digest: m.defaultDigest },
    };
  });
}

/** Categories in display order for the settings screen. */
export const CATEGORY_ORDER: NotifCategory[] = ['profile', 'competition', 'team', 'social', 'system'];
export const CATEGORY_LABELS: Record<NotifCategory, string> = {
  profile: 'Profile & recognition',
  competition: 'Competition',
  team: 'Teams',
  social: 'Social',
  system: 'System',
};
