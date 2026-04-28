# All For 1 — Athlete Social Network

A professional social network for athletes, coaches, and scouts. Users sign up with a role and sport, build networks, share highlight videos, form teams, register for tournaments, and view rankings. The platform is fully cross-platform with a responsive Web application and native iOS & Android applications.

**Sports supported (13):**
- *Head-to-head (team or 1v1):* Basketball, Football, Cricket, Field Hockey, Badminton, Tennis, Table Tennis, Wrestling, Boxing
- *Individual scoring:* Athletics, Weightlifting, Shooting, Archery

---

## Tech Stack

| Layer        | Technology                                                       |
| ------------ | ---------------------------------------------------------------- |
| Frontend     | React 19 + Vite + TypeScript + Tailwind CSS v4 + React Router 7 |
| Mobile       | Capacitor (Native iOS & Android compilation)                    |
| State        | TanStack Query v5, React Context (auth)                         |
| Backend      | Node.js + Express + TypeScript                                  |
| Database     | PostgreSQL + Prisma ORM                                         |
| Security     | Helmet, Rate Limit, Bot Protection, Zod Validation              |
| Auth & Comms | JWT (access + refresh), Email Verification/Reset (Nodemailer)   |
| Real-time    | Socket.IO, Firebase (Push & Auth integrations)                  |
| File Storage | Cloudinary (video highlights + profile images)                  |
| Monorepo     | npm workspaces + concurrently                                   |

---

## Project Structure

```
The_AllFor1_Network/
├── package.json                 # Root workspace config + concurrently dev script
├── server/
│   ├── package.json
│   ├── .env                     # DB url, JWT secrets, Cloudinary keys (PORT=3001)
│   ├── prisma/
│   │   └── schema.prisma        # COMPLETE database schema (all models)
│   └── src/
│       ├── index.ts             # HTTP server + Socket.IO setup (join/leave events)
│       ├── app.ts               # Express app, CORS, security, route registration
│       ├── config/              # db.ts, env.ts, firebaseAdmin.ts, socket.ts, cloudinary.ts
│       ├── middleware/          # auth.ts, botProtection.ts, security.ts, validate.ts, ...
│       ├── routes/              # Express API endpoints
│       │   ├── admin.routes.ts, auth.routes.ts, user.routes.ts, connection.routes.ts
│       │   ├── feed.routes.ts, highlight.routes.ts, message.routes.ts, notification.routes.ts
│       │   ├── post.routes.ts, ranking.routes.ts, team.routes.ts, tournament.routes.ts
│       │   └── announcement.routes.ts
│       ├── utils/               # crypto.ts, logger.ts, jwt.ts 
│       └── validation/          # Zod schemas for user, team, tournaments, auth, admin, etc.
└── client/
    ├── package.json
    ├── vite.config.ts           # Tailwind v4 plugin, API proxy → :3001
    ├── capacitor.config.ts      # Capacitor config for native mobile builds
    ├── android/                 # Android native app project files
    ├── ios/                     # iOS native app project files
    └── src/
        ├── App.tsx              # Router with protected/public routes + Email flows
        ├── api/                 # Axios instance, JWT interceptor, auto-refresh
        ├── components/          # Reusable UI elements (e.g. CreatePostModal.tsx)
        ├── config/              # Firebase client initiation
        ├── contexts/            # AuthContext (multi-step onboarding & state)
        ├── layouts/             # Sidebar nav (role-aware), user section, logout
        └── pages/               # Login, Register, Home, Explore, Profile, Highlights, Teams, Tournaments, Rankings, Announcements, Messages, Notifications, AdminDashboard + Forgot/Reset Password, Verify Email
```

---

## Database Schema (Prisma — PostgreSQL)

### Enums
- **Role:** ATHLETE, COACH, SCOUT, ADMIN
- **Sport:** BASKETBALL, FOOTBALL, CRICKET, FIELD_HOCKEY, BADMINTON, ATHLETICS, WRESTLING, BOXING, SHOOTING, WEIGHTLIFTING, ARCHERY, TENNIS, TABLE_TENNIS
- **ConnectionStatus:** PENDING, ACCEPTED, REJECTED
- **TournamentStatus:** UPCOMING, REGISTRATION_OPEN, REGISTRATION_CLOSED, IN_PROGRESS, COMPLETED, CANCELLED
- **MatchStatus:** SCHEDULED, LIVE, COMPLETED
- **TeamMemberRole:** CAPTAIN, PLAYER
- **AnnouncementType:** TRIAL, TRAINING, GENERAL (default: GENERAL)
- **NotificationType:** FOLLOW, CONNECTION_REQUEST, CONNECTION_ACCEPTED, TOURNAMENT_UPDATE, TEAM_INVITE, TEAM_JOIN_REQUEST, RANKING_UPDATE, HIGHLIGHT_VIEW, ANNOUNCEMENT, SYSTEM

### Models
| Model                | Purpose                                                                     |
| -------------------- | --------------------------------------------------------------------------- |
| User                 | Base user with role, sport, profile fields (bio, location, age, height)     |
| Follow               | Who follows whom (unique follower+following pair)                           |
| Connection           | Connection requests between users (with status)                             |
| Highlight            | Video highlights linked to user + optional tournament + tournamentLocation  |
| Post                 | Custom text and media social feed posts attached to users                   |
| Team                 | Teams with captain, sport, description                                      |
| TeamMember           | Users belonging to teams (captain/player)                                   |
| Tournament           | Tournaments created by admins (city field)                                  |
| TournamentTeam       | Team registrations for tournaments                                          |
| TournamentTeamMember | Individual players in tournament team entries                               |
| Match                | Matches within tournaments. Home/away teams are optional — individual-sport events (athletics, weightlifting, shooting, archery) leave them null and record results in the per-sport stats tables. |
| BasketballStats      | Per-match basketball stats (points, rebounds, assists, steals, blocks, etc.)|
| FootballStats        | Per-match football stats (goals, assists, tackles, saves, etc.)             |
| CricketStats         | Per-match cricket stats (runs, wickets, strike rate, economy, etc.)         |
| WeightliftingStats   | Per-event weightlifting result (weight class, snatch, clean & jerk, total, rank) |
| AthleticsStats       | Per-event athletics result (event from `ATHLETICS_EVENTS`, result in seconds or metres, wind, rank, notes) |
| ShootingStats        | Per-event shooting result (event/discipline, score, inner-tens tiebreaker, rank) |
| ArcheryStats         | Per-event archery result (distance, score, tens, X-count tiebreaker, rank)  |
| PlayerRanking        | Tournament-specific player rankings (sport, rank, score, category)          |
| Announcement         | Coach/scout/admin announcements (trial, training, general) — sport optional |
| Notification         | User notifications with type and read status                                |
| Conversation         | DM conversation container                                                   |
| ConversationMember   | Users in a conversation (joined as `members` in queries)                    |
| Message              | Individual messages in conversations                                        |

---

## API Endpoints Summary

- **Auth** (`/api/auth`): Register, login, refresh tokens, get current user (`/me`). Includes email verification and password reset flows.
- **Users** (`/api/users`): Search/filter users, fetch profiles, update profiles (supports avatars).
- **Posts & Feed** (`/api/post`, `/api/feed`): Create posts and consume personalized feeds (followed users + same sport + logic).
- **Connections** (`/api/connections`): Follow/unfollow, send/accept/reject connection requests, view lists.
- **Highlights** (`/api/highlights`): Upload video highlights via Cloudinary, view across tournaments, filter by player.
- **Teams** (`/api/teams`): Create, manage, join, and view the roster for your sports teams.
- **Tournaments** (`/api/tournaments`): Admin-controlled tournament brackets, team registration, and tracking match results + player stats. 
- **Rankings** (`/api/rankings`): Weighted score calculation algorithms based on accumulated per-match stats. Schema-ready for all seven sports with stats tables (Basketball, Football, Cricket, Weightlifting, Athletics, Shooting, Archery); ranking-rule wiring for the four individual sports is part of the in-progress AI-Enhanced Rankings work.
- **Announcements** (`/api/announcements`): Dedicated broadcast feed for Coach/Scout/Admins types.
- **Notifications** (`/api/notifications`): Real-time user statuses managed via Socket.io.
- **Messages** (`/api/messages`): Direct messaging utilizing Socket.io rooms.
- **Administration** (`/api/admin`): General user management, verified statuses, overall platform aggregations & statistics.

---

## What's Done vs. What's Left

### ✅ DONE

#### Infrastructure & Mobile
- Full monorepo setup (npm workspaces, concurrently for single `npm run dev`).
- PostgreSQL installed locally and running; full schema tracking with Prisma.
- Mobile App support implemented via Capacitor (iOS & Android compilation ready via Native IDEs).
- E2E API tests completed for key workflows like registration, login, and profile fetching.

#### Backend
- Advanced Security: `helmet`, bot protection algorithms, comprehensive `winston` traffic logs, and full schema boundary checks using `Zod` validation middleware.
- Full Email Lifecycle Setup: Accounts generate email links via `Nodemailer` for user-verification and forgotten-password reset scenarios cleanly encoded utilizing cryptographic algorithms (`crypto.ts`).
- Auth system with JWT access + refresh tokens, bcrypt, RBAC middleware.
- User profiles with Cloudinary avatar upload.
- Fully baked Feed structures relying on Connections, Posts, and Highlight sharing functionalities.
- Teams and Tournament participation flows.
- Automated statistics computation for the Platform Rankings table relying on dynamic rules.
- Real-time Notifications & Live Messaging streams using pure Socket.IO implementations.

#### Frontend & UI
- Cross-platform codebase functional on Web, iOS, and Android formats utilizing Tailwind CSS.
- Complete Multi-step onboarding flow (Login, Register: info → role → sport).
- Email UI capabilities: "Verify Email", "Forgot Password", and "Reset Password" built into distinct interactive Pages.
- Dynamic layouts tailored specifically exactly to user Roles (Admin dashboards distinct from regular Athlete usage).
- Complete capabilities for managing user highlights, organizing teams, viewing sports tournaments, and participating in global rankings.

---

### ⬜ REMAINING / PLANNED

#### Required Before Public Launch
- **Cloudinary credentials** — Ensure production keys are stored securely in a cloud-hosted environment to support Cloudinary API ingestion properly at scale.
- **Build & Deploy Process** — Deploy production services to cloud host (Vercel/Render/Railway) alongside production postgres environment.

#### Advanced Features (In Progress & Future)
- **AI-Enhanced Rankings** — The underlying tracking for data accumulation is complete. Next tasks involve: implementing incremental learning algorithms to continuously improve scoring rules, adding player clustering capabilities for tracking unique athlete archetypes, and spotting statistical outlier performances automatically using ML anomaly detection logic.
- **Video player component** — Moving away from direct string uploads in Cloudinary into an inline playback UI featuring functional Web video controls.
- **Admin Match result UI Form** — Create frontend forms that allow organizers to efficiently append single-match scoring inputs, accelerating the global tournament ranking calculators immediately upon completion.

---

## How to Run

### Prerequisites
- Node.js 18+
- PostgreSQL running locally (installed via `brew install postgresql@16`)
- Cloudinary account (for video/image uploads)

### Setup
```bash
# Clone and install all dependencies
npm install

# Edit server/.env to use your correct PostgreSQL URL, Cloudinary API configuration, and SMTP setup details.

# Generate tables
cd server && npx prisma db push
```

### Development (Web)
```bash
# From root — starts both server and client concurrently
npm run dev
```

### Development (Mobile Apps)
```bash
cd client
npm run build
npx cap sync       # Copies web assets to native mobile project folders
npx cap open ios   # Opens Xcode to build and run iOS app
npx cap open android # Opens Android Studio to build and run Android app
```

### Ports
- Frontend: http://localhost:5173
- Backend API: http://localhost:3001
- API routes: http://localhost:3001/api/*
- Vite proxies `/api` and `/socket.io` to the backend automatically

