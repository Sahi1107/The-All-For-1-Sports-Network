/**
 * Seed script — bulk-create login-capable MOCK basketball profiles for testing
 * tournament registration, social features, and the stat tracker.
 *
 * Each mock profile is a real, fully-functional account:
 *   1. a Firebase Auth user (emailVerified, with a known password → can log in)
 *   2. a Prisma `User` row (the app data)
 *   3. Firebase custom claims ({ userId, role }) so the API authorizes it
 *
 * This mirrors scripts/create-admin.ts, just in bulk. It creates a batch of
 * ATHLETE profiles plus one COACH (so you can test coach-driven team
 * registration). It does NOT create teams or tournaments — assemble those
 * through the UI as part of your test.
 *
 * ─── Usage ──────────────────────────────────────────────────────────────────
 *   cd server
 *
 *   # Create 10 athletes + 1 coach (defaults)
 *   npx ts-node --project tsconfig.json scripts/seed-mock-profiles.ts
 *
 *   # Custom count / prefix / password
 *   npx ts-node --project tsconfig.json scripts/seed-mock-profiles.ts \
 *     --count 16 --coaches 2 --prefix mock --password "TestPass1" --city "Mumbai"
 *
 *   # Remove everything this script created (matches by email prefix)
 *   npx ts-node --project tsconfig.json scripts/seed-mock-profiles.ts --cleanup
 *
 * All mock accounts use the email pattern  {prefix}{n}@{domain}  e.g.
 *   mock-athlete-01@allfor1.test , mock-coach-01@allfor1.test
 * so they're easy to spot and to clean up. Default password: MockPass1
 *
 * Re-running is safe (idempotent): existing accounts are skipped, not duplicated.
 */

import dotenv from 'dotenv';
dotenv.config();

import prisma from '../src/config/db';
import admin from '../src/config/firebaseAdmin';

// ─── Args ─────────────────────────────────────────────────────────────────────

function getArg(flag: string): string | undefined {
  const args = process.argv.slice(2);
  const idx  = args.indexOf(flag);
  return idx !== -1 ? args[idx + 1]?.trim() : undefined;
}
function hasFlag(flag: string): boolean {
  return process.argv.slice(2).includes(flag);
}

const COUNT    = parseInt(getArg('--count')   ?? '10', 10);   // athlete profiles
const COACHES  = parseInt(getArg('--coaches') ?? '1', 10);    // coach profiles
const PREFIX   = getArg('--prefix')   ?? 'mock';
const DOMAIN   = getArg('--domain')   ?? 'allfor1.test';
const PASSWORD = getArg('--password') ?? 'MockPass1';
const CITY     = getArg('--city')     ?? 'Bengaluru';
const CLEANUP  = hasFlag('--cleanup');

const SPORT = 'BASKETBALL' as const;

// Sample data for a touch of realism in the seeded profiles.
const FIRST_NAMES = [
  'Arjun', 'Riya', 'Kabir', 'Ananya', 'Vivaan', 'Diya', 'Aarav', 'Isha',
  'Rohan', 'Meera', 'Karan', 'Tara', 'Dev', 'Sara', 'Nikhil', 'Aisha',
  'Yash', 'Naina', 'Aditya', 'Zoya',
];
const LAST_NAMES = [
  'Sharma', 'Patel', 'Reddy', 'Khan', 'Mehta', 'Nair', 'Gupta', 'Singh',
  'Iyer', 'Bose', 'Kapoor', 'Das', 'Rao', 'Joshi', 'Verma', 'Pillai',
];
const POSITIONS = ['Guard', 'Forward', 'Center'];
const HEIGHTS   = ['175 cm', '180 cm', '185 cm', '190 cm', '195 cm', '200 cm'];

function pick<T>(arr: T[], i: number): T {
  return arr[i % arr.length];
}
function pad(n: number): string {
  return String(n).padStart(2, '0');
}

// ─── Create one profile (Firebase + Prisma + claims) ───────────────────────────

async function createProfile(opts: {
  email: string;
  name: string;
  role: 'ATHLETE' | 'COACH';
  gender: 'MALE' | 'FEMALE';
  position?: string;
  height?: string;
  age?: number;
}): Promise<'created' | 'skipped'> {
  const email = opts.email.toLowerCase();

  // Idempotency: skip if a Prisma user already exists for this email.
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`  • skip   ${email} (already exists)`);
    return 'skipped';
  }

  // 1. Firebase Auth user — reuse if Firebase already has it (partial prior run).
  let firebaseUser: admin.auth.UserRecord;
  try {
    firebaseUser = await admin.auth().createUser({
      email,
      password:      PASSWORD,
      displayName:   opts.name,
      emailVerified: true,
    });
  } catch (err: any) {
    if (err?.code === 'auth/email-already-exists') {
      firebaseUser = await admin.auth().getUserByEmail(email);
    } else {
      throw err;
    }
  }

  // 2. Prisma user
  const prismaUser = await prisma.user.create({
    data: {
      firebaseUid: firebaseUser.uid,
      email,
      name:        opts.name,
      role:        opts.role,
      sport:       SPORT,
      gender:      opts.gender,
      position:    opts.position ?? null,
      height:      opts.height ?? null,
      age:         opts.age ?? null,
      location:    CITY,
      bio:         `Mock ${opts.role.toLowerCase()} profile for testing.`,
      verified:    true,
    },
    select: { id: true, email: true, role: true },
  });

  // 3. Custom claims
  await admin.auth().setCustomUserClaims(firebaseUser.uid, {
    userId: prismaUser.id,
    role:   opts.role,
  });

  console.log(`  ✓ create ${email}  (${opts.role})`);
  return 'created';
}

// ─── Cleanup: delete everything this script created ────────────────────────────

async function cleanup() {
  console.log(`\nCleaning up mock profiles with email prefix "${PREFIX}-" @${DOMAIN} …\n`);

  const users = await prisma.user.findMany({
    where: { email: { startsWith: `${PREFIX}-`, endsWith: `@${DOMAIN}` } },
    select: { id: true, email: true, firebaseUid: true },
  });

  if (users.length === 0) {
    console.log('  Nothing to clean up.');
    return;
  }

  for (const u of users) {
    // Firebase first (best-effort), then Prisma row.
    if (u.firebaseUid) {
      try { await admin.auth().deleteUser(u.firebaseUid); }
      catch (err: any) {
        if (err?.code !== 'auth/user-not-found') {
          console.warn(`  ! firebase delete failed for ${u.email}: ${err?.code ?? err}`);
        }
      }
    }
    await prisma.user.delete({ where: { id: u.id } });
    console.log(`  ✗ deleted ${u.email}`);
  }

  console.log(`\nRemoved ${users.length} mock profile(s).`);
}

// ─── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n── All For 1 · Seed Mock Profiles ───────────────────────\n');

  if (CLEANUP) {
    await cleanup();
    return;
  }

  if (!Number.isInteger(COUNT) || COUNT < 0 || !Number.isInteger(COACHES) || COACHES < 0) {
    console.error('--count and --coaches must be non-negative integers.');
    process.exit(1);
  }

  console.log(`Creating ${COUNT} athlete(s) + ${COACHES} coach(es)`);
  console.log(`Sport: ${SPORT}   City: ${CITY}   Password: ${PASSWORD}\n`);

  let created = 0;
  let skipped = 0;

  // Athletes
  for (let i = 1; i <= COUNT; i++) {
    const first  = pick(FIRST_NAMES, i - 1);
    const last   = pick(LAST_NAMES, i - 1);
    const gender = i % 2 === 0 ? 'FEMALE' : 'MALE';
    const res = await createProfile({
      email:    `${PREFIX}-athlete-${pad(i)}@${DOMAIN}`,
      name:     `${first} ${last}`,
      role:     'ATHLETE',
      gender,
      position: pick(POSITIONS, i - 1),
      height:   pick(HEIGHTS, i - 1),
      age:      16 + (i % 12), // 16–27
    });
    res === 'created' ? created++ : skipped++;
  }

  // Coaches
  for (let i = 1; i <= COACHES; i++) {
    const first = pick(FIRST_NAMES, i + 6);
    const last  = pick(LAST_NAMES, i + 3);
    const res = await createProfile({
      email:  `${PREFIX}-coach-${pad(i)}@${DOMAIN}`,
      name:   `Coach ${first} ${last}`,
      role:   'COACH',
      gender: i % 2 === 0 ? 'FEMALE' : 'MALE',
      age:    35 + i,
    });
    res === 'created' ? created++ : skipped++;
  }

  console.log('\n─────────────────────────────────────────────────────────');
  console.log(`Done. Created ${created}, skipped ${skipped}.`);
  console.log('\nLog in at /login with any of these emails and the password above.');
  console.log(`  Athletes: ${PREFIX}-athlete-01@${DOMAIN} … ${PREFIX}-athlete-${pad(COUNT)}@${DOMAIN}`);
  if (COACHES > 0) {
    console.log(`  Coach(es): ${PREFIX}-coach-01@${DOMAIN} … ${PREFIX}-coach-${pad(COACHES)}@${DOMAIN}`);
  }
  console.log(`\nTo remove them all later:  npx ts-node --project tsconfig.json scripts/seed-mock-profiles.ts --cleanup\n`);
}

main()
  .catch((err: unknown) => {
    console.error('\nUnexpected error:', err instanceof Error ? err.message : err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
