# All For 1 — Athlete Social Network

A professional social network for athletes, coaches, and scouts. Users sign up with a role and sport, build networks, share highlight videos, form teams, register for tournaments, and view rankings. The platform is fully cross-platform with a responsive Web application and native iOS & Android applications.

**Initial sports:** Basketball, Football, Cricket

---

## Tech Stack

| Layer        | Technology                                                       |
| ------------ | ---------------------------------------------------------------- |
| Frontend     | React 19 + Vite + TypeScript + Tailwind CSS v4 + React Router 7 |
| Mobile       | Capacitor (Native iOS & Android compilation)                    |
| State        | TanStack Query v5, React Context (auth)                         |
| Backend      | Node.js + Express + TypeScript                                  |
| Database     | PostgreSQL + Prisma ORM                                         |
| Security & Logs| Helmet, Express Rate Limit, Winston Logging, Zod Validation     |
| Auth & Push  | JWT (access + refresh tokens), bcrypt, Firebase / Firebase Admin|
| Real-time    | Socket.IO                                                       |
| File Storage | Cloudinary (video highlights + profile images)                  |
| Monorepo     | npm workspaces + concurrently                                   |

---

## Project Structure

```
The_AllFor1_Network/
├── package.json                 # Root workspace config + concurrently dev script
├── .gitignore
├── README.md
├── server/
│   ├── package.json
│   ├── tsconfig.json
│   ├── .env                     # DB url, JWT secrets, Cloudinary keys (PORT=3001)
│   ├── prisma/
│   │   └── schema.prisma        # COMPLETE database schema (all models)
│   ├── scripts/                 # Admin scripts (e.g. create-admin.ts)
│   └── src/
│       ├── index.ts             # HTTP server + Socket.IO setup (join/leave_conversation events)
│       ├── app.ts               # Express app, CORS, security, route registration
│       ├── config/
│       │   ├── env.ts           # Env variable loader
│       │   ├── db.ts            # Prisma client singleton
│       │   ├── cloudinary.ts    # Cloudinary config
│       │   └── socket.ts        # Shared Socket.IO instance (initIO / getIO)
│       ├── middleware/
│       │   ├── auth.ts          # JWT verification middleware
│       │   ├── rateLimiter.ts   # Rate limiting & brute force protection
│       │   ├── roles.ts         # RBAC middleware (requireRole)
│       │   └── upload.ts        # Multer config (video + image, memory storage)
│       ├── routes/
│       │   ├── auth.routes.ts        # ✅ register, login, refresh, me
│       │   ├── user.routes.ts        # ✅ search/filter users, get profile, update profile
│       │   ├── connection.routes.ts  # ✅ follow/unfollow, connection requests, followers/following
│       │   ├── highlight.routes.ts   # ✅ upload to Cloudinary, list, get by user, delete
│       │   ├── feed.routes.ts        # ✅ personalized feed (followed users + same sport)
│       │   ├── team.routes.ts        # ✅ create, list, detail, join, leave, remove member
│       │   ├── tournament.routes.ts  # ✅ CRUD, register team, create match, update results + stats
│       │   ├── ranking.routes.ts     # ✅ get rankings, calculate (weighted scoring per sport)
│       │   ├── announcement.routes.ts# ✅ create (coach/scout/admin), list, delete
│       │   ├── notification.routes.ts# ✅ list, mark read, mark all read
│       │   ├── message.routes.ts     # ✅ conversations CRUD, send/get messages (Socket.IO emit)
│       │   └── admin.routes.ts       # ✅ user management (PATCH verify/role), delete, platform stats
│       └── utils/
│           └── jwt.ts           # Token generation + verification
└── client/
    ├── package.json
    ├── tsconfig.json
    ├── vite.config.ts           # Tailwind v4 plugin, API proxy → :3001
    ├── capacitor.config.ts      # Capacitor config for native builds
    ├── android/                 # Android native app project files
    ├── ios/                     # iOS native app project files
    ├── index.html
    └── src/
        ├── main.tsx
        ├── App.tsx              # ✅ Router with protected/public routes
        ├── index.css            # Tailwind v4 @theme (dark UI)
        ├── api/                 # ✅ Axios instance, JWT interceptor, auto-refresh
        ├── contexts/            # ✅ AuthContext for multi-step onboarding & state management
        ├── layouts/             # ✅ Sidebar nav (role-aware), user section, logout
        └── pages/               # ✅ Pages for Login, Register, Home, Explore, Profile, EditProfile, Highlights, Teams, Tournaments, Rankings, Announcements, Messages, Notifications, AdminDashboard
```

---

## Database Schema (Prisma — PostgreSQL)

### Enums
- **Role:** ATHLETE, COACH, SCOUT, ADMIN
- **Sport:** BASKETBALL, FOOTBALL, CRICKET
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
| Team                 | Teams with captain, sport, description                                      |
| TeamMember           | Users belonging to teams (captain/player)                                   |
| Tournament           | Tournaments created by admins (city field)                                  |
| TournamentTeam       | Team registrations for tournaments                                          |
| TournamentTeamMember | Individual players in tournament team entries                               |
| Match                | Matches within tournaments (home vs away scores, round, status)             |
| BasketballStats      | Per-match basketball stats (points, rebounds, assists, steals, blocks, etc.)|
| FootballStats        | Per-match football stats (goals, assists, tackles, saves, etc.)             |
| CricketStats         | Per-match cricket stats (runs, wickets, strike rate, economy, etc.)         |
| PlayerRanking        | Tournament-specific player rankings (sport, rank, score, category)          |
| Announcement         | Coach/scout/admin announcements (trial, training, general) — sport optional |
| Notification         | User notifications with type and read status                                |
| Conversation         | DM conversation container                                                   |
| ConversationMember   | Users in a conversation (joined as `members` in queries)                    |
| Message              | Individual messages in conversations                                        |

---

## API Endpoints

### Auth (`/api/auth`)
- `POST /register` — Create account (name, email, password, role, sport)
- `POST /login` — Login, returns JWT access + refresh tokens
- `POST /refresh` — Refresh access token
- `GET /me` — Get current user (requires auth)

### Users (`/api/users`)
- `GET /` — Search/filter users (role, sport, search, location, pagination)
- `GET /:id` — Get user profile with highlights, teams, rankings, follow/connection status
- `PUT /profile` — Update own profile (multipart/form-data, supports avatar image upload)

### Connections (`/api/connections`)
- `POST /follow/:userId` — Follow user (creates notification)
- `DELETE /unfollow/:userId` — Unfollow user
- `POST /request/:userId` — Send connection request (creates notification)
- `PUT /:id/accept` — Accept connection request
- `PUT /:id/reject` — Reject connection request
- `GET /followers` — List followers
- `GET /following` — List following
- `GET /requests` — List pending incoming requests

### Highlights (`/api/highlights`)
- `POST /` — Upload video to Cloudinary + save metadata (sport auto-set from user profile)
- `GET /` — List highlights (filter by sport, user, tournament)
- `GET /user/:userId` — Get highlights for a specific user
- `GET /:id` — Get single highlight (increments views)
- `DELETE /:id` — Delete own highlight

### Feed (`/api/feed`)
- `GET /` — Personalized feed (highlights from followed users + same sport)

### Teams (`/api/teams`)
- `POST /` — Create team (user becomes captain; sport auto-set from user profile)
- `GET /` — List/search teams (supports `?mine=true`)
- `GET /:id` — Team detail with roster + tournament registrations
- `POST /:id/join` — Join team as player
- `DELETE /:id/leave` — Leave team
- `DELETE /:id/members/:userId` — Remove member (captain only)

### Tournaments (`/api/tournaments`)
- `POST /` — Create tournament (admin only)
- `GET /` — List tournaments (filter by sport, status)
- `GET /:id` — Tournament detail with registered teams, matches, rankings
- `PUT /:id` — Update tournament (admin only)
- `POST /:id/register` — Register team by teamId (captain only)
- `POST /:id/matches` — Create match (admin only)
- `PUT /matches/:matchId/result` — Update match result + enter player stats (admin only)

### Rankings (`/api/rankings`)
- `GET /` — Get rankings (filter by sport, tournament, category, region)
- `POST /calculate/:tournamentId` — Trigger ranking calculation (admin only)
  - **Basketball:** points(25%) + rebounds(15%) + assists(20%) + steals(10%) + blocks(10%) + efficiency(20%)
  - **Football:** goals(30%) + assists(20%) + passes(15%) + tackles(15%) + saves(20%)
  - **Cricket:** runs(25%) + wickets(25%) + strike_rate(15%) + economy(15%) + catches(10%) + extras(10%)

### Announcements (`/api/announcements`)
- `POST /` — Create announcement (coach/scout/admin only; type defaults to GENERAL)
- `GET /` — List announcements (filter by sport, type; paginated)
- `DELETE /:id` — Delete own announcement (or any if ADMIN)

### Notifications (`/api/notifications`)
- `GET /` — List notifications (with unread count)
- `PUT /:id/read` — Mark single as read
- `PUT /read-all` — Mark all as read

### Messages (`/api/messages`)
- `GET /conversations` — List conversations (with last message, other member info)
- `POST /conversations` — Create or get existing conversation (`{ userId }`)
- `GET /conversations/:id` — Get messages in conversation
- `POST /conversations/:id` — Send message (emits via Socket.IO to `conversation:{id}` room)

### Admin (`/api/admin`)
- `GET /users` — List all users with filters + pagination
- `PATCH /users/:id/verify` — Toggle verified status (`{ verified: boolean }`)
- `PATCH /users/:id/role` — Change user role (`{ role }`)
- `DELETE /users/:id` — Delete user
- `GET /stats` — Platform statistics (`{ stats: { totalUsers, athletes, coaches, scouts, verifiedUsers, highlights, teams, tournaments, bySport } }`)

---

## What's Done vs. What's Left

### ✅ DONE

#### Infrastructure
- Full monorepo setup (npm workspaces, concurrently for single `npm run dev`).
- PostgreSQL installed locally and running; full schema tracking with Prisma.
- Mobile App support implemented via Capacitor (iOS & Android compilation ready).
- E2E API tests completed for key workflows like registration, login, and profile fetching.
- Added comprehensive logging (`winston`) and server security (`helmet`, `express-rate-limit`).

#### Backend
- Auth system with JWT access + refresh tokens, bcrypt, RBAC middleware.
- Firebase integration initialized.
- User profiles with Cloudinary avatar upload.
- Follow/connection system with notification triggers.
- Highlight uploads to Cloudinary (sport auto-fetched from user record).
- Personalized feed.
- Teams (create, roster, join/leave).
- Tournaments (admin CRUD, team registration, match results, per-sport player stats).
- Rule-based ranking engine (sport-specific weighted scoring).
- Announcements (coach/scout/admin, optional sport + type).
- Notifications (real-time via Socket.IO).
- Direct messaging with Socket.IO rooms.
- Admin dashboard API (user management PATCH, platform stats).

#### Frontend & Mobile
- Cross-platform codebase functional on Web, iOS, and Android formats.
- Complete Multi-step onboarding flow (Login, Register: info → role → sport).
- AuthContext + Axios interceptor with auto token refresh.
- MainLayout with role-aware sidebar navigation.
- Home (personalized highlight feed) and Explore sections working smoothly.
- Full capabilities built out across Profile editing, Video highlights uploads, Teams creation, and Tournament participation.
- Live chat capabilities built relying on Socket.IO websockets.

---

### ⬜ REMAINING / PLANNED

#### Required Before Public Launch
- **Cloudinary credentials** — Ensure production `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` are stored securely in cloud-hosted env.
- **Firebase credentials** — Inject realtime Firebase Auth service accounts where needed natively.
- **Build & Deploy Process** — Complete server (Railway / Render) + client (Vercel / Netlify / App Store / Google Play) environment setups.

#### Advanced Features (In Progress & Future)
- **AI-Enhanced Basketball Rankings** — Implementing incremental learning algorithms, player clustering for archetype detection, anomaly detection for breakout performers, and trending analytics over time.
- **Video player component** — Inline playback with controls rather than direct Cloudinary URLs.
- **Admin Match result UI** — Forms to input match scores and per-player stats which triggers ranking recalculations.
- **Email verification** — Complete the `nodemailer` SMTP setup to verify accounts robustly on registration.
- **Password reset** — Complete forgot password flow relying on emails.

---

## How to Run

### Prerequisites
- Node.js 18+
- PostgreSQL running locally (installed via `brew install postgresql@16`)
- Cloudinary account (for video/image uploads)

### Setup
```bash
# Clone and install all dependencies
npm install          # from root (installs both server + client via workspaces)

# Configure environment
# Edit server/.env to use PostgreSQL URL and Cloudinary API configuration
# Ensure Firebase credentials exist if using push notification/auth features.

# Push database schema (creates all tables)
cd server && npx prisma db push
```

### Development (Web)
```bash
# From root — starts both server and client concurrently
npm run dev

# Or individually:
# Terminal 1 — Server (port 3001)
cd server && npm run dev

# Terminal 2 — Client (port 5173)
cd client && npm run dev
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
- Health check: http://localhost:3001/api/health
- Vite proxies `/api` and `/socket.io` to the backend automatically

---

## Environment Variables (`server/.env`)

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/allfor1?schema=public"
PORT=3001
JWT_ACCESS_SECRET="your-access-secret-change-in-production"
JWT_REFRESH_SECRET="your-refresh-secret-change-in-production"
JWT_ACCESS_EXPIRY="15m"
JWT_REFRESH_EXPIRY="7d"
CLIENT_URL="http://localhost:5173"
CLOUDINARY_CLOUD_NAME="your-cloud-name"       
CLOUDINARY_API_KEY="your-api-key"              
CLOUDINARY_API_SECRET="your-api-secret"        
```

---

## Known Notes

- **Port 3001** is used instead of 5000 because macOS AirPlay Receiver occupies port 5000 by default.
- **Socket.IO** shared instance lives in `server/src/config/socket.ts` to avoid circular dependency between `index.ts` and `message.routes.ts`.
- **Avatar uploads** use Multer memory storage + Cloudinary `upload_stream` (not disk storage) so no temp files are written.
- **Rate limiting** is enabled on particular routes using `express-rate-limit` to prevent brute force.
- **Highlight sport** is automatically pulled from the uploading user's profile.
