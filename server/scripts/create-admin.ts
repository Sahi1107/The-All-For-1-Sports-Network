/**
 * One-time bootstrap script to create the first admin account.
 * Creates both a Firebase Auth user (for login + token issuance) and a
 * Prisma user (for app data), then sets Firebase custom claims.
 *
 * Usage:
 *   cd server
 *   npx ts-node --project tsconfig.json scripts/create-admin.ts \
 *     --email admin@example.com \
 *     --name "Admin Name" \
 *     --password "SecurePass1"
 *
 * If any flag is omitted the script prompts interactively.
 */

import dotenv from 'dotenv';
dotenv.config();

import prisma from '../src/config/db';
import admin from '../src/config/firebaseAdmin';
import readline from 'readline';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getArg(flag: string): string | undefined {
  const args = process.argv.slice(2);
  const idx  = args.indexOf(flag);
  return idx !== -1 ? args[idx + 1]?.trim() : undefined;
}

function ask(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => { rl.close(); resolve(answer.trim()); });
  });
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n── All For 1 · Create Admin Account ─────────────────────\n');

  const email    = getArg('--email')    ?? await ask('Email: ');
  const name     = getArg('--name')     ?? await ask('Full name: ');
  const password = getArg('--password') ?? await ask('Password (min 8 chars, upper + lower + digit): ');

  if (!email || !name || !password) {
    console.error('\nAll fields are required.\n');
    process.exit(1);
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    console.error('\nInvalid email address.\n');
    process.exit(1);
  }

  // Check Prisma first
  const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (existing) {
    console.error(`\nA Prisma user with that email already exists (role: ${existing.role}).\n`);
    process.exit(1);
  }

  // 1. Create Firebase Auth user (emailVerified = true, no verification step)
  console.log('Creating Firebase Auth user…');
  let firebaseUser: admin.auth.UserRecord;
  try {
    firebaseUser = await admin.auth().createUser({
      email:         email.toLowerCase(),
      password,
      displayName:   name,
      emailVerified: true,
    });
  } catch (err: any) {
    if (err?.code === 'auth/email-already-exists') {
      console.error('\nFirebase already has an account with that email.\n');
      process.exit(1);
    }
    throw err;
  }

  // 2. Create Prisma user
  console.log('Creating Prisma user…');
  const prismaUser = await prisma.user.create({
    data: {
      firebaseUid: firebaseUser.uid,
      email:       email.toLowerCase(),
      name,
      role:        'ADMIN',
      sport:       'BASKETBALL',
      verified:    true,
    },
    select: { id: true, email: true, name: true, role: true, createdAt: true },
  });

  // 3. Set custom claims
  await admin.auth().setCustomUserClaims(firebaseUser.uid, {
    userId: prismaUser.id,
    role:   'ADMIN',
  });

  console.log('\nAdmin account created successfully:');
  console.log(`  Prisma ID:   ${prismaUser.id}`);
  console.log(`  Firebase UID:${firebaseUser.uid}`);
  console.log(`  Email:       ${prismaUser.email}`);
  console.log(`  Name:        ${prismaUser.name}`);
  console.log(`  Role:        ${prismaUser.role}`);
  console.log('\nThis admin can now sign in at /login.\n');
}

main()
  .catch((err: unknown) => {
    console.error('\nUnexpected error:', err instanceof Error ? err.message : err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
