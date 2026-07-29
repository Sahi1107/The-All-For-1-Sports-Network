import nodemailer from 'nodemailer';
import { env } from '../config/env';
import logger from '../utils/logger';
import {
  emailShell, emailParagraph, emailButton, emailCredBox, emailNote, emailList, escapeHtml,
} from './emailLayout';

// ─── Transactional email service ─────────────────────────────────────────────
//
// Every app-sent email renders through the shared branded layout (emailLayout.ts)
// so they can't drift apart. The transport is built from SMTP_* env vars; when
// those are unconfigured the service logs instead of throwing so local/dev never
// breaks. (Firebase-sent verification/password-reset are handled separately, in
// server/src/routes/auth email helpers, so they use this layout too.)

const smtpConfigured = !!(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS);

/** Single client origin for building links (CLIENT_URL may be a comma list). */
const clientOrigin = Array.isArray(env.CLIENT_URL) ? env.CLIENT_URL[0] : env.CLIENT_URL;
/** Public app URL shown in onboarding copy. */
const APP_URL = 'https://allfor1.pro';
const managePrefsUrl = `${clientOrigin}/settings/notifications`;

const transport = smtpConfigured
  ? nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465, // SMTPS on 465, STARTTLS otherwise
      auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
    })
  : null;

interface SendOptions {
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
  headers?: Record<string, string>;
}

async function sendMail({ to, subject, html, text, replyTo, headers }: SendOptions): Promise<void> {
  if (!transport) {
    // A missing transport in production is a real misconfiguration — throw so callers
    // log a genuine failure instead of a false "sent". Dev/local stays a silent no-op.
    if (env.NODE_ENV === 'production') {
      throw new Error('email.not_configured: SMTP is not configured in production');
    }
    logger.warn('email.not_configured', { to, subject, text });
    return;
  }
  await transport.sendMail({ from: env.SMTP_FROM, to, subject, html, text, ...(replyTo && { replyTo }), ...(headers && { headers }) });
}

interface Built { subject: string; html: string; text: string }

// Shared building blocks reused across the credential emails.
const credentialsNote = 'For your security, you’ll be asked to set a new password the first time you log in.';

// ─── Guardian consent form (profile handover) ────────────────────────────────

export function composeGuardianConsent(
  { athleteName, consentUrl }: { athleteName: string; consentUrl: string },
): Built {
  const n = escapeHtml(athleteName);
  const subject = `Consent requested: hand over ${athleteName}'s All For 1 account`;
  const text =
    `A request has been made to hand over the All For 1 account for ${athleteName}, ` +
    `which you currently manage as a parent or academy.\n\n` +
    `If you consent, ${athleteName} will be able to set their own email address and ` +
    `password and take full control of the account.\n\n` +
    `Review and accept the consent form here:\n${consentUrl}\n\n` +
    `If you did not expect this request, you can safely ignore this email — ` +
    `nothing will change unless you accept.`;
  const html = emailShell({
    preheader: `Consent requested to hand over ${athleteName}'s account`,
    heading: 'Profile handover consent',
    contentHtml:
      emailParagraph(`A request has been made to hand over the All For 1 account for <strong style="color:#fff">${n}</strong>, which you currently manage as a parent or academy.`) +
      emailParagraph(`If you consent, ${n} will be able to set their own email address and password and take full control of the account.`) +
      emailButton('Review & accept consent form', consentUrl) +
      emailNote('If you did not expect this request, you can safely ignore this email — nothing will change unless you accept.'),
  });
  return { subject, html, text };
}

export async function sendGuardianConsentEmail(
  to: string, args: { athleteName: string; consentUrl: string },
): Promise<void> {
  const { subject, html, text } = composeGuardianConsent(args);
  await sendMail({ to, subject, html, text });
}

// ─── Bulk-provision welcome (temp password) ──────────────────────────────────

export function composeTempPasswordWelcome(
  user: { email: string; name: string }, tempPassword: string, tournamentName: string, teamName?: string,
): Built {
  const subject = `You're registered for ${tournamentName} — your All For 1 login`;
  const teamLine = teamName ? ` with team ${teamName}` : '';
  const text =
    `Hi ${user.name},\n\n` +
    `An organizer has registered you for ${tournamentName}${teamLine} on All For 1 and created an account for you.\n\n` +
    `Log in at ${clientOrigin}/login with:\n` +
    `  Email: ${user.email}\n` +
    `  Temporary password: ${tempPassword}\n\n` +
    credentialsNote;
  const html = emailShell({
    preheader: `Your All For 1 login for ${tournamentName}`,
    heading: 'Welcome to All For 1',
    contentHtml:
      emailParagraph(`Hi ${escapeHtml(user.name)}, an organizer has registered you for <strong style="color:#fff">${escapeHtml(tournamentName)}</strong>${teamName ? ` with team <strong style="color:#fff">${escapeHtml(teamName)}</strong>` : ''} and created an account for you.`) +
      emailCredBox([
        { label: 'Email', value: user.email },
        { label: 'Temporary password', value: tempPassword, mono: true },
      ]) +
      emailButton('Log in', `${clientOrigin}/login`) +
      emailNote(credentialsNote),
  });
  return { subject, html, text };
}

export async function sendTempPasswordWelcome(
  user: { email: string; name: string }, tempPassword: string, tournamentName: string, teamName?: string,
): Promise<void> {
  const { subject, html, text } = composeTempPasswordWelcome(user, tempPassword, tournamentName, teamName);
  await sendMail({ to: user.email, subject, html, text });
}

// ─── Tournament-organiser welcome (temp password, scoped access) ─────────────

export function composeOrganizerWelcome(
  user: { email: string; name: string }, tempPassword: string, tournamentName: string, manageUrl: string,
): Built {
  const subject = `You're an organiser for ${tournamentName} — your All For 1 login`;
  const text =
    `Hi ${user.name},\n\n` +
    `You've been given organiser access for ${tournamentName} on All For 1. As an organiser you can manage ` +
    `this tournament — teams and players, the draw and schedule, live scoring and results. Your access is ` +
    `limited to this tournament only.\n\n` +
    `Log in at ${clientOrigin}/login with:\n` +
    `  Email: ${user.email}\n` +
    `  Temporary password: ${tempPassword}\n\n` +
    `${credentialsNote}\n\n` +
    `Manage the tournament: ${manageUrl}`;
  const html = emailShell({
    preheader: `You're an organiser for ${tournamentName}`,
    heading: 'You’re an organiser on All For 1',
    contentHtml:
      emailParagraph(`Hi ${escapeHtml(user.name)}, you've been given <strong style="color:#fff">organiser access</strong> for <strong style="color:#fff">${escapeHtml(tournamentName)}</strong>. You can manage this tournament — teams and players, the draw and schedule, live scoring and results. Your access is limited to <strong style="color:#fff">this tournament only</strong>.`) +
      emailCredBox([
        { label: 'Email', value: user.email },
        { label: 'Temporary password', value: tempPassword, mono: true },
      ]) +
      emailButton('Log in', `${clientOrigin}/login`) +
      emailNote(`${credentialsNote} Then <a href="${escapeHtml(manageUrl)}" style="color:#dbff5a;text-decoration:underline;">manage your tournament</a>.`),
  });
  return { subject, html, text };
}

export async function sendOrganizerWelcome(
  user: { email: string; name: string }, tempPassword: string, tournamentName: string, manageUrl: string,
): Promise<void> {
  const { subject, html, text } = composeOrganizerWelcome(user, tempPassword, tournamentName, manageUrl);
  await sendMail({ to: user.email, subject, html, text });
}

// ─── Admin-created athlete: age-aware welcome ────────────────────────────────

export function composeAthleteWelcome({
  athleteName, loginEmail, tempPassword, forGuardian,
}: { athleteName: string; loginEmail: string; tempPassword: string; forGuardian: boolean }): Built {
  const who = forGuardian ? `${athleteName}'s` : 'your';
  const subject = forGuardian
    ? `${athleteName}'s All For 1 account — get started`
    : `Welcome to All For 1 — make your sports journey visible`;

  const steps = [
    `Log in at ${clientOrigin}/login`,
    'Reset the temporary password',
    `Complete ${who} profile`,
    `View ${who} Performance Card`,
  ];
  const stepsHtml = [
    `Log in at <a href="${clientOrigin}/login" style="color:#dbff5a;text-decoration:underline;">${clientOrigin}/login</a>`,
    'Reset the temporary password',
    `Complete ${escapeHtml(who)} profile`,
    `View ${escapeHtml(who)} Performance Card`,
  ];
  const creds = `Log in with:\n  Email: ${loginEmail}\n  Temporary password: ${tempPassword}`;
  const startedText = 'Getting started:\n' + steps.map((s, i) => `  ${i + 1}. ${s}`).join('\n');
  const security = 'For security, you’ll be asked to set a new password on first login.';
  const credBox = emailCredBox([
    { label: 'Email', value: loginEmail },
    { label: 'Temporary password', value: tempPassword, mono: true },
  ]);

  if (forGuardian) {
    const greeting = `You're set up to manage ${athleteName}'s account on All For 1.`;
    return {
      subject,
      text: `${greeting}\n\nAll For 1 is the network where athletes build a profile, share highlights, join teams, and get discovered.\n\n${creds}\n\n${startedText}\n\nThe app: ${APP_URL}\n\n${security}`,
      html: emailShell({
        preheader: `Get started managing ${athleteName}'s account`,
        heading: greeting,
        contentHtml:
          emailParagraph('All For 1 is the network where athletes build a profile, share highlights, join teams, and get discovered.') +
          credBox +
          emailParagraph('<strong style="color:#fff">Getting started</strong>') +
          emailList(stepsHtml, true) +
          emailButton('Log in', `${clientOrigin}/login`) +
          emailNote(`The app: <a href="${APP_URL}" style="color:#dbff5a;text-decoration:underline;">${APP_URL}</a><br/>${security}`),
      }),
    };
  }

  // 13+ athlete welcome — "make your sports journey visible"
  const perks = [
    '<strong style="color:#fff">Build your Performance Card</strong> — one shareable page for your stats, highlights, and achievements',
    '<strong style="color:#fff">Get discovered</strong> — scouts, coaches, and academies find athletes directly on All For 1',
    '<strong style="color:#fff">Let your highlights do the talking</strong> — upload your best moments for the world to see',
    '<strong style="color:#fff">Compete and climb</strong> — join tournaments, represent teams, and rise up the rankings',
  ];
  return {
    subject,
    text:
      `Welcome to All For 1, ${athleteName} — this is where your game gets seen.\n\n` +
      `All For 1 is the home for your sports journey. Build a standout athlete profile, showcase your best highlights, track your stats, and put your talent in front of the scouts, coaches, and academies who are looking for players like you.\n\n` +
      `What you can do here:\n  • Build your Performance Card\n  • Get discovered\n  • Let your highlights do the talking\n  • Compete and climb\n\n` +
      `${creds}\n\n${startedText}\n\nMake your sports journey visible. The app: ${APP_URL}\n\n${security}`,
    html: emailShell({
      preheader: 'This is where your game gets seen.',
      heading: `Welcome to All For 1, ${athleteName}`,
      contentHtml:
        emailParagraph('<span style="color:#dbff5a;font-weight:600;">This is where your game gets seen.</span>') +
        emailParagraph('All For 1 is the home for your sports journey. Build a standout athlete profile, showcase your best highlights, track your stats, and put your talent in front of the scouts, coaches, and academies who are looking for players like you.') +
        emailParagraph('<strong style="color:#fff">What you can do here</strong>') +
        emailList(perks) +
        credBox +
        emailParagraph('<strong style="color:#fff">Getting started</strong>') +
        emailList(stepsHtml, true) +
        emailButton('Log in & get started', `${clientOrigin}/login`) +
        emailNote(`<span style="color:#dbff5a;font-weight:600;">Make your sports journey visible.</span><br/>The app: <a href="${APP_URL}" style="color:#dbff5a;text-decoration:underline;">${APP_URL}</a> · ${security}`),
    }),
  };
}

export async function sendAthleteWelcome(args: {
  to: string; athleteName: string; loginEmail: string; tempPassword: string; forGuardian: boolean;
}): Promise<void> {
  const { subject, html, text } = composeAthleteWelcome(args);
  await sendMail({ to: args.to, subject, html, text });
}

// ─── Admin-created under-13: guardian consent before activation ───────────────

export function composeGuardianConsentInvite(
  { athleteName, consentUrl }: { athleteName: string; consentUrl: string },
): Built {
  const n = escapeHtml(athleteName);
  const subject = `Consent needed to activate ${athleteName}'s All For 1 account`;
  const text =
    `An organizer has created an All For 1 account for ${athleteName}, who is under 13.\n\n` +
    `Because ${athleteName} is under 13, this account is private and cannot be used until you, as the parent or guardian, consent. Nothing is visible and no login is issued until you accept.\n\n` +
    `Review and give consent here:\n${consentUrl}\n\n` +
    `Once you consent, you'll receive the login details to manage ${athleteName}'s account.\n\n` +
    `If you did not expect this, you can ignore this email — the account stays inactive.`;
  const html = emailShell({
    preheader: `Consent needed to activate ${athleteName}'s account`,
    heading: 'Consent needed to activate an account',
    contentHtml:
      emailParagraph(`An organizer has created an All For 1 account for <strong style="color:#fff">${n}</strong>, who is under 13.`) +
      emailParagraph(`Because ${n} is under 13, the account is <strong style="color:#fff">private and inactive</strong> until you, as the parent or guardian, consent. Nothing is visible and no login is issued until you accept.`) +
      emailButton('Review & give consent', consentUrl) +
      emailParagraph(`Once you consent, you'll receive the login details to manage ${n}'s account.`) +
      emailNote('If you did not expect this, you can ignore this email — the account stays inactive.'),
  });
  return { subject, html, text };
}

export async function sendGuardianConsentInvite(args: {
  to: string; athleteName: string; consentUrl: string;
}): Promise<void> {
  const { subject, html, text } = composeGuardianConsentInvite(args);
  await sendMail({ to: args.to, subject, html, text });
}

// ─── In-app support / contact request ────────────────────────────────────────

export function composeSupportConfirmation(fromName: string, message: string): Built {
  const safeMsg = escapeHtml(message).replace(/\n/g, '<br>');
  return {
    subject: 'We received your message — All For 1 Support',
    text: `Hi ${fromName},\n\nThanks for reaching out — we've received your message and will get back to you soon.\n\nYour message:\n"${message}"\n\n— The All For 1 team`,
    html: emailShell({
      preheader: 'Thanks for reaching out — we’ll get back to you soon.',
      heading: 'We got your message',
      contentHtml:
        emailParagraph(`Hi ${escapeHtml(fromName)}, thanks for reaching out — we've received your message and will get back to you soon.`) +
        `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:2px 0 8px;"><tr><td style="border-left:3px solid #242424;padding:2px 0 2px 14px;font-family:'Archivo','Inter',Arial,sans-serif;font-size:14px;line-height:1.6;color:#8a8a8a;">${safeMsg}</td></tr></table>` +
        emailNote('— The All For 1 team'),
    }),
  };
}

/**
 * Forward an in-app support/contact request to the support inbox (reply-to the
 * user) and send the user a branded confirmation copy.
 */
export async function sendSupportRequest({
  fromName, fromEmail, userId, category, subject, message,
}: {
  fromName: string; fromEmail: string; userId: string; category: string; subject: string; message: string;
}): Promise<void> {
  const safeMsg = escapeHtml(message).replace(/\n/g, '<br>');
  const meta = `From: ${fromName} <${fromEmail}> (user ${userId})\nCategory: ${category}`;

  // 1) Internal forward to the support inbox — plain and functional (staff-facing).
  await sendMail({
    to: env.SUPPORT_EMAIL,
    replyTo: fromEmail,
    subject: `[Support · ${category}] ${subject}`,
    text: `${meta}\n\n${message}`,
    html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#111">
        <p style="color:#666;font-size:13px;white-space:pre-line">${escapeHtml(meta)}</p>
        <hr style="border:none;border-top:1px solid #eee;margin:16px 0">
        <p>${safeMsg}</p>
      </div>`,
  });

  // 2) Branded confirmation to the user.
  const c = composeSupportConfirmation(fromName, message);
  await sendMail({ to: fromEmail, subject: c.subject, html: c.html, text: c.text });
}

// ─── Activity notification emails (branded, dark + lime) ──────────────────────

export interface NotificationEmailOptions {
  to: string;
  recipientName: string;
  subject: string;
  heading: string;
  body: string;
  ctaUrl: string;
  ctaLabel: string;
  unsubscribeUrl: string;    // unsubscribe from THIS type
  unsubscribeAllUrl: string; // unsubscribe from all activity emails
  category: string;          // "Endorsements", "Match results", …
}

export function composeNotificationEmail(o: NotificationEmailOptions): Built {
  const html = emailShell({
    preheader: o.body.slice(0, 140),
    heading: o.heading,
    contentHtml:
      emailParagraph(escapeHtml(o.body)) +
      emailButton(`${o.ctaLabel} →`, o.ctaUrl),
    footerNote: `You're receiving this because your <strong style="color:#8a8a8a;">${escapeHtml(o.category)}</strong> email notifications are on.`,
    footerLinks: [
      { label: 'Manage preferences', url: managePrefsUrl },
      { label: 'Turn off these', url: o.unsubscribeUrl },
      { label: 'Unsubscribe from all', url: o.unsubscribeAllUrl },
    ],
  });
  const text =
    `${o.heading}\n\n${o.body}\n\n${o.ctaLabel}: ${o.ctaUrl}\n\n` +
    `— You're receiving this because your ${o.category} email notifications are on.\n` +
    `Manage preferences: ${managePrefsUrl}\nUnsubscribe from these: ${o.unsubscribeUrl}\nUnsubscribe from all: ${o.unsubscribeAllUrl}`;
  return { subject: o.subject, html, text };
}

export async function sendNotificationEmail(o: NotificationEmailOptions): Promise<void> {
  const { subject, html, text } = composeNotificationEmail(o);
  await sendMail({ to: o.to, subject, html, text, headers: { 'List-Unsubscribe': `<${o.unsubscribeAllUrl}>` } });
}

export interface DigestItem { title: string; body: string; url: string }

export function composeDigestEmail(o: {
  subject: string; heading: string; intro: string;
  items: DigestItem[]; ctaUrl: string; unsubscribeAllUrl: string; managed: string;
}): Built {
  const font = "'Archivo','Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";
  const rows = o.items.map((it) => `
    <tr><td style="padding:12px 0;border-bottom:1px solid #1c1c1c;">
      <a href="${escapeHtml(it.url)}" style="font-family:${font};font-weight:600;font-size:14px;color:#ffffff;text-decoration:none;">${escapeHtml(it.title)}</a>
      <div style="font-family:${font};font-size:13px;color:#c9c9c9;margin-top:2px;">${escapeHtml(it.body)}</div>
    </td></tr>`).join('');
  const html = emailShell({
    preheader: o.intro,
    heading: o.heading,
    contentHtml:
      emailParagraph(escapeHtml(o.intro)) +
      `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 8px;">${rows}</table>` +
      emailButton('Open All For 1 →', o.ctaUrl),
    footerNote: escapeHtml(o.managed),
    footerLinks: [
      { label: 'Manage', url: managePrefsUrl },
      { label: 'Unsubscribe from all', url: o.unsubscribeAllUrl },
    ],
  });
  const text = `${o.heading}\n${o.intro}\n\n` + o.items.map((it) => `• ${it.title} — ${it.body}\n  ${it.url}`).join('\n') +
    `\n\nManage: ${managePrefsUrl}\nUnsubscribe from all: ${o.unsubscribeAllUrl}`;
  return { subject: o.subject, html, text };
}

export async function sendDigestEmail(o: {
  to: string; subject: string; heading: string; intro: string;
  items: DigestItem[]; ctaUrl: string; unsubscribeAllUrl: string; managed: string;
}): Promise<void> {
  const { subject, html, text } = composeDigestEmail(o);
  await sendMail({ to: o.to, subject, html, text, headers: { 'List-Unsubscribe': `<${o.unsubscribeAllUrl}>` } });
}

// ─── Password reset + email verification (branded; sent by us, not Firebase) ──
// The action links are generated server-side (Firebase admin generate*Link) so
// these first-impression emails use our layout instead of Firebase's default.

export function composePasswordReset(name: string | null, resetUrl: string): Built {
  const hi = name ? `Hi ${name}, ` : '';
  return {
    subject: 'Reset your All For 1 password',
    text: `${name ? `Hi ${name},\n\n` : ''}We received a request to reset your All For 1 password.\n\nReset it here:\n${resetUrl}\n\nThis link expires in 1 hour. If you didn't request this, you can safely ignore this email — your password won't change.`,
    html: emailShell({
      preheader: 'Reset your All For 1 password',
      heading: 'Reset your password',
      contentHtml:
        emailParagraph(`${hi}we received a request to reset your All For 1 password. Click below to choose a new one.`) +
        emailButton('Reset password', resetUrl) +
        emailNote('This link expires in 1 hour. If you didn’t request this, you can safely ignore this email — your password won’t change.'),
    }),
  };
}

export function composeEmailVerification(name: string | null, verifyUrl: string): Built {
  const hi = name ? `Hi ${name}, ` : '';
  return {
    subject: 'Verify your email — All For 1',
    text: `${name ? `Hi ${name},\n\n` : ''}Welcome to All For 1. Confirm your email address to activate your account.\n\nVerify here:\n${verifyUrl}\n\nIf you didn't create an All For 1 account, you can safely ignore this email.`,
    html: emailShell({
      preheader: 'Confirm your email to activate your All For 1 account',
      heading: 'Verify your email',
      contentHtml:
        emailParagraph(`${hi}welcome to All For 1. Confirm your email address to activate your account and get started.`) +
        emailButton('Verify email', verifyUrl) +
        emailNote('If you didn’t create an All For 1 account, you can safely ignore this email.'),
    }),
  };
}

export async function sendPasswordResetEmail(to: string, name: string | null, resetUrl: string): Promise<void> {
  const { subject, html, text } = composePasswordReset(name, resetUrl);
  await sendMail({ to, subject, html, text });
}

export async function sendEmailVerification(to: string, name: string | null, verifyUrl: string): Promise<void> {
  const { subject, html, text } = composeEmailVerification(name, verifyUrl);
  await sendMail({ to, subject, html, text });
}

// ─── Render harness (dev/verify only) ────────────────────────────────────────
// Every template built with sample data, so they can be rendered + eyeballed
// (scripts/renderEmails) without sending anything.
export function renderSampleEmails(): Array<{ name: string; subject: string; html: string; text: string }> {
  const s = (name: string, b: Built) => ({ name, subject: b.subject, html: b.html, text: b.text });
  const tourn = 'Don Bosco Invitational 2026';
  return [
    s('01-athlete-welcome-13plus', composeAthleteWelcome({ athleteName: 'Priya Rao', loginEmail: 'priya@example.com', tempPassword: 'Xk7-mQ2p-Rt9w', forGuardian: false })),
    s('02-temp-password-welcome', composeTempPasswordWelcome({ email: 'aarav@example.com', name: 'Aarav Khan' }, 'Xk7-mQ2p-Rt9w', tourn, 'Ballers United')),
    s('03-organiser-welcome', composeOrganizerWelcome({ email: 'coach@donbosco.edu', name: 'Coach D’Souza' }, 'Xk7-mQ2p-Rt9w', tourn, 'https://allfor1.pro/tournaments/abc123/manage')),
    s('04-athlete-welcome-guardian', composeAthleteWelcome({ athleteName: 'Ishaan (age 11)', loginEmail: 'parent@example.com', tempPassword: 'Xk7-mQ2p-Rt9w', forGuardian: true })),
    s('05-guardian-consent-invite', composeGuardianConsentInvite({ athleteName: 'Ishaan Verma', consentUrl: 'https://allfor1.pro/guardian-consent?token=demo' })),
    s('06-guardian-handover', composeGuardianConsent({ athleteName: 'Ishaan Verma', consentUrl: 'https://allfor1.pro/handover/consent?token=demo' })),
    s('07-email-verification', composeEmailVerification('Priya Rao', 'https://allfor1.pro/verify?token=demo')),
    s('08-password-reset', composePasswordReset('Priya Rao', 'https://allfor1.pro/reset?token=demo')),
    s('09-support-confirmation', composeSupportConfirmation('Priya Rao', 'Hi, I can’t upload my highlight video — it stops at 80%. Can you help?')),
    s('10-notification', composeNotificationEmail({ to: 'x', recipientName: 'Priya', subject: 'Your match result is live', heading: 'Your match result is live', body: 'Ballers United 58–52 Hoops Academy. You posted 18 points, 7 rebounds and 4 assists — it’s on your Performance Card now.', ctaUrl: 'https://allfor1.pro/profile/demo', ctaLabel: 'View your Performance Card', unsubscribeUrl: 'https://allfor1.pro/unsubscribe?t=match', unsubscribeAllUrl: 'https://allfor1.pro/unsubscribe?t=all', category: 'Match results' })),
    s('11-digest', composeDigestEmail({ subject: 'Your week on All For 1', heading: 'Your week on All For 1', intro: '3 things happened while you were away.', items: [
      { title: 'Coach D’Souza endorsed you', body: 'For “Court vision”', url: 'https://allfor1.pro/profile/demo' },
      { title: '2 new profile views', body: 'From scouts in Mumbai', url: 'https://allfor1.pro/profile/demo' },
      { title: 'Don Bosco Invitational fixtures are out', body: 'Your first game is Saturday', url: 'https://allfor1.pro/tournaments/demo' },
    ], ctaUrl: 'https://allfor1.pro/home', unsubscribeAllUrl: 'https://allfor1.pro/unsubscribe?t=all', managed: 'Your weekly digest.' })),
  ];
}
