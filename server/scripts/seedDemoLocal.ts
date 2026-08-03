/**
 * LOCAL-ONLY demo seed for the visual audit. Creates emulator auth users + a rich
 * dataset (athletes, tournament, teams, matches, stats, rankings, posts, messages,
 * notifications) so authenticated screens render with real-looking content.
 *
 * SAFETY: refuses to run unless DATABASE_URL points at localhost AND the Firebase
 * Auth emulator is configured. Never touches prod. Untracked; delete after use.
 */
import { PrismaClient, Role, Sport, Gender } from '@prisma/client';

const DB = process.env.DATABASE_URL ?? '';
if (!DB.includes('localhost') && !DB.includes('127.0.0.1')) {
  console.error('REFUSING: DATABASE_URL is not localhost.'); process.exit(1);
}
if (!process.env.FIREBASE_AUTH_EMULATOR_HOST) {
  console.error('REFUSING: FIREBASE_AUTH_EMULATOR_HOST not set (emulator only).'); process.exit(1);
}
const prisma = new PrismaClient();
const EMU = `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-api-key`;
const PASSWORD = 'AuditDemo1!';

async function emulatorUser(email: string): Promise<string> {
  const res = await fetch(EMU, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD, returnSecureToken: true }),
  });
  const d: any = await res.json();
  if (!d.localId) throw new Error(`emulator signUp failed for ${email}: ${JSON.stringify(d)}`);
  return d.localId as string;
}

const ATHLETES = [
  ['Aarav Naik', 'Point Guard', 'Panjim, Goa', 22, 'Quick hands, quicker first step. State-level PG chasing a pro contract.'],
  ['Rohan Fernandes', 'Shooting Guard', 'Margao, Goa', 20, 'Catch-and-shoot specialist. 38% from deep last season.'],
  ['Kabir Shetty', 'Small Forward', 'Mapusa, Goa', 24, 'Two-way wing. Defence wins games.'],
  ['Ishaan Kamat', 'Power Forward', 'Panjim, Goa', 23, 'Rim-runner and glass-cleaner.'],
  ['Vivaan Dsouza', 'Center', 'Vasco, Goa', 25, 'Paint protector. Career-high 18 boards.'],
  ['Advait Prabhu', 'Point Guard', 'Ponda, Goa', 19, 'Floor general with a coach\'s brain.'],
  ['Reyansh Pillai', 'Shooting Guard', 'Calangute, Goa', 21, 'Microwave scorer off the bench.'],
  ['Arjun Menezes', 'Small Forward', 'Panjim, Goa', 22, 'Slasher. Lives at the free-throw line.'],
  ['Dhruv Sawant', 'Power Forward', 'Margao, Goa', 26, 'Stretch four, corner-three merchant.'],
  ['Krish Gaonkar', 'Center', 'Bicholim, Goa', 24, 'Old-school post footwork.'],
  ['Aditya Verlekar', 'Point Guard', 'Panjim, Goa', 20, 'Pass-first. Assists over everything.'],
  ['Neel Borkar', 'Shooting Guard', 'Mapusa, Goa', 23, 'Three-and-D. Never skips a closeout.'],
] as const;

const TEAMS = ['Panjim Panthers', 'Margao Mavericks', 'Mapusa Titans', 'Vasco Vipers'];

async function main() {
  console.log('Seeding local demo data…');

  // ── Users ──────────────────────────────────────────────────────────────────
  const athleteIds: string[] = [];
  for (let i = 0; i < ATHLETES.length; i++) {
    const [name, position, location, age, bio] = ATHLETES[i];
    const email = `demo.athlete${i + 1}@local.test`;
    const uid = await emulatorUser(email);
    const u = await prisma.user.create({
      data: {
        firebaseUid: uid, email, name, role: Role.ATHLETE, sport: Sport.BASKETBALL,
        gender: Gender.MALE, position, location, city: location.split(',')[0], state: 'Goa',
        age, bio, verified: i < 5, discoverable: true,
      },
      select: { id: true },
    });
    athleteIds.push(u.id);
  }
  const [me, ...others] = athleteIds; // demo.athlete1 is the main login

  const scoutUid = await emulatorUser('demo.scout@local.test');
  const scout = await prisma.user.create({
    data: {
      firebaseUid: scoutUid, email: 'demo.scout@local.test', name: 'Sunil Rane', role: Role.SCOUT,
      sport: Sport.BASKETBALL, location: 'Panjim, Goa', bio: 'Scout — West Zone. Looking for guards with motor.',
      verified: true, discoverable: true,
    }, select: { id: true },
  });

  const adminUid = await emulatorUser('demo.admin@local.test');
  const admin = await prisma.user.create({
    data: {
      firebaseUid: adminUid, email: 'demo.admin@local.test', name: 'AF1 Ops', role: Role.ADMIN,
      verified: true, discoverable: false,
    }, select: { id: true },
  });

  // ── Tournament + teams + rosters ───────────────────────────────────────────
  const t = await prisma.tournament.create({
    data: {
      name: 'Goa Invitational Basketball Cup 2026', sport: Sport.BASKETBALL,
      category: 'Open', genderCategory: 'Men', format: 'TEAM', status: 'IN_PROGRESS',
      description: 'Eight days of 5v5 basketball across Goa\'s top clubs. Group stage into a four-team knockout.',
      venue: 'Don Bosco Oratory', city: 'Panjim',
      startDate: new Date('2026-07-27'), endDate: new Date('2026-08-05'),
      prizePool: 50000, entryFee: 1500, maxTeams: 8, minRosterSize: 5, maxRosterSize: 12,
      createdById: admin.id,
    }, select: { id: true, sport: true },
  });

  const teamIds: string[] = [];
  const now = new Date();
  for (let ti = 0; ti < TEAMS.length; ti++) {
    const roster = athleteIds.slice(ti * 3, ti * 3 + 3); // 3 per team from our 12
    const team = await prisma.team.create({
      data: { name: TEAMS[ti], sport: t.sport, captainId: roster[0], tournamentId: t.id },
      select: { id: true },
    });
    teamIds.push(team.id);
    await prisma.teamMember.createMany({
      data: roster.map((uid2, i) => ({
        teamId: team.id, userId: uid2, role: i === 0 ? 'CAPTAIN' as const : 'PLAYER' as const,
        status: 'ACCEPTED' as const, respondedAt: now,
      })),
    });
    await prisma.tournamentTeam.create({ data: { tournamentId: t.id, teamId: team.id } });
  }

  // ── Matches: 4 completed + 2 scheduled, with per-player stats ──────────────
  const results = [
    [0, 1, 78, 71, 'Group A'], [2, 3, 65, 80, 'Group A'],
    [0, 2, 84, 62, 'Group B'], [1, 3, 69, 74, 'Group B'],
  ] as const;
  const completedMatchIds: string[] = [];
  for (const [h, a, hs, as_, round] of results) {
    const m = await prisma.match.create({
      data: {
        tournamentId: t.id, homeTeamId: teamIds[h], awayTeamId: teamIds[a],
        homeScore: hs, awayScore: as_, round, status: 'COMPLETED',
        matchDate: new Date(Date.now() - (5 - completedMatchIds.length) * 86400000),
        court: 'Court 1',
      }, select: { id: true },
    });
    completedMatchIds.push(m.id);
    const players = [...athleteIds.slice(h * 3, h * 3 + 3), ...athleteIds.slice(a * 3, a * 3 + 3)];
    await prisma.basketballStats.createMany({
      data: players.map((uid2, i) => ({
        matchId: m.id, userId: uid2, tournamentId: t.id,
        points: 8 + ((i * 7) % 21), rebounds: 2 + (i % 9), offRebounds: 1 + (i % 3), defRebounds: 1 + (i % 6),
        assists: 1 + ((i * 3) % 8), steals: i % 4, blocks: i % 3,
        twoPointers: 2 + (i % 5), threePointers: i % 4, freeThrows: 1 + (i % 4),
        turnovers: i % 4, personalFouls: 1 + (i % 4), minutesPlayed: 22 + (i % 14),
      })),
    });
  }
  await prisma.match.create({
    data: {
      tournamentId: t.id, homeTeamId: teamIds[0], awayTeamId: teamIds[3], round: 'Semi-final',
      matchDate: new Date(Date.now() + 86400000), status: 'SCHEDULED', court: 'Court 1',
    },
  });
  await prisma.match.create({
    data: {
      tournamentId: t.id, homeTeamId: teamIds[1], awayTeamId: teamIds[2], round: 'Semi-final',
      matchDate: new Date(Date.now() + 86400000 * 2), status: 'SCHEDULED', court: 'Court 2',
    },
  });

  // ── Rankings ───────────────────────────────────────────────────────────────
  await prisma.playerRanking.createMany({
    data: athleteIds.map((uid2, i) => ({
      userId: uid2, tournamentId: t.id, sport: Sport.BASKETBALL,
      rank: i + 1, score: Math.round((92 - i * 4.7) * 10) / 10, category: 'Men',
    })),
  });

  // ── Posts (feed content, incl. a Performance card shape) ───────────────────
  const texts = [
    'Back-to-back wins. Group stage done, semis on Saturday. Panjim stand up 🏀',
    'Shot 5/7 from deep tonight. The corner three is a layup if you do the work.',
    '6am court. Empty gym. This is where seasons are made.',
    'Big shout to coach D for the defensive scheme tonight — held them to 62.',
    'First triple-double of my career. More to come.',
    'Recovery day. Ice bath, film, sleep. The boring stuff is the job.',
  ];
  for (let i = 0; i < texts.length; i++) {
    await prisma.post.create({
      data: {
        userId: athleteIds[i % athleteIds.length], type: 'TEXT', content: texts[i],
        sport: Sport.BASKETBALL, createdAt: new Date(Date.now() - i * 7_200_000),
      },
    });
  }
  await prisma.post.create({
    data: {
      userId: me, type: 'PERFORMANCE', sport: Sport.BASKETBALL,
      content: '23 PTS · 7 AST vs Margao Mavericks',
      performance: {
        eyebrow: 'Goa Invitational Cup 2026', statValue: '23', statLabel: 'points',
        rating: 87.4, ratingDelta: +3.2, context: 'W 78–71 vs Margao Mavericks',
      },
      createdAt: new Date(Date.now() - 3_600_000),
    },
  });

  // ── Social graph + notifications + messages ────────────────────────────────
  for (const other of others.slice(0, 6)) {
    await prisma.follow.create({ data: { followerId: other, followingId: me } });
  }
  await prisma.follow.create({ data: { followerId: me, followingId: others[0] } });
  await prisma.connection.create({ data: { senderId: others[0], receiverId: me, status: 'ACCEPTED' } });
  await prisma.connection.create({ data: { senderId: scout.id, receiverId: me, status: 'ACCEPTED' } });
  await prisma.connection.create({ data: { senderId: others[3], receiverId: me, status: 'PENDING' } });

  const notif = [
    { type: 'FOLLOW', title: 'New follower', message: 'Rohan Fernandes started following you' },
    { type: 'CONNECTION_ACCEPTED', title: 'Connection accepted', message: 'Sunil Rane accepted your connection request' },
    { type: 'RANKING_UPDATE', title: 'Ranking update', message: 'You moved up to #1 in Goa Invitational Cup — Men' },
    { type: 'TOURNAMENT_UPDATE', title: 'Semi-final scheduled', message: 'Panjim Panthers vs Vasco Vipers — Sat 7:00 PM, Court 1' },
  ] as const;
  for (let i = 0; i < notif.length; i++) {
    await prisma.notification.create({
      data: { userId: me, type: notif[i].type, title: notif[i].title, message: notif[i].message,
        read: i > 1, createdAt: new Date(Date.now() - i * 5_400_000) },
    });
  }

  const conv = await prisma.conversation.create({
    data: { members: { create: [{ userId: me }, { userId: scout.id }] } }, select: { id: true },
  });
  const msgs = [
    [scout.id, 'Aarav — watched your group-stage games. That pick-and-roll read in the 4th was senior-level.'],
    [me, 'Appreciate that! We drilled that set all month.'],
    [scout.id, 'Semis on Saturday? I\'ll be courtside. Would love 10 minutes with you after.'],
    [me, 'Absolutely — see you there.'],
  ] as const;
  for (let i = 0; i < msgs.length; i++) {
    await prisma.message.create({
      data: { conversationId: conv.id, senderId: msgs[i][0], content: msgs[i][1],
        createdAt: new Date(Date.now() - (msgs.length - i) * 1_800_000) },
    });
  }

  console.log('DONE. Logins (password AuditDemo1!):');
  console.log('  athlete  demo.athlete1@local.test  (Aarav Naik — rank #1, posts, messages)');
  console.log('  admin    demo.admin@local.test');
  console.log(`  tournament: ${t.id}`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
