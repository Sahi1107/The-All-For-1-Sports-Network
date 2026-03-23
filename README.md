# All For 1 — Athlete Social Network

A professional social network for athletes, coaches, and scouts. Users sign up with a role and sport, build networks, share highlight videos, form teams, register for tournaments, and view rankings.

**Initial sports:** Basketball, Football, Cricket

---

## Tech Stack

| Layer        | Technology                                                       |
| ------------ | ---------------------------------------------------------------- |
| Frontend     | React 19 + Vite + TypeScript + Tailwind CSS v4 + React Router 7 |
| State        | TanStack Query v5, React Context (auth)                         |
| Backend      | Node.js + Express + TypeScript                                  |
| Database     | PostgreSQL + Prisma ORM                                         |
| Auth         | JWT (access + refresh tokens) + bcrypt                          |
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
│   └── src/
│       ├── index.ts             # HTTP server + Socket.IO setup (join/leave_conversation events)
│       ├── app.ts               # Express app, CORS, route registration
│       ├── config/
│       │   ├── env.ts           # Env variable loader
│       │   ├── db.ts            # Prisma client singleton
│       │   ├── cloudinary.ts    # Cloudinary config
│       │   └── socket.ts        # Shared Socket.IO instance (initIO / getIO) — avoids circular deps
│       ├── middleware/
│       │   ├── auth.ts          # JWT verification middleware
│       │   ├── roles.ts         # RBAC middleware (requireRole)
│       │   └── upload.ts        # Multer config (video + image, memory storage)
│       ├── routes/
│       │   ├── auth.routes.ts        # ✅ register, login, refresh, me
│       │   ├── user.routes.ts        # ✅ search/filter users, get profile, update profile (avatar upload)
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
    ├── index.html
    └── src/
        ├── main.tsx
        ├── App.tsx              # ✅ Router with protected/public routes
        ├── index.css            # Tailwind v4 @theme (dark UI: primary, dark-light, dark-lighter, gray-custom, accent)
        ├── api/
        │   └── client.ts       # ✅ Axios instance, JWT interceptor, auto-refresh
        ├── contexts/
        │   └── AuthContext.tsx  # ✅ login, register, logout, updateUser, user state
        ├── layouts/
        │   └── MainLayout.tsx  # ✅ Sidebar nav (role-aware), user section, logout
        └── pages/
            ├── Login.tsx          # ✅ Email/password form
            ├── Register.tsx       # ✅ 3-step: info → role → sport
            ├── Home.tsx           # ✅ Personalized feed with highlight video cards
            ├── Explore.tsx        # ✅ Search + filters (role, sport), user cards grid
            ├── Profile.tsx        # ✅ Full profile view (bio, highlights, teams, rankings, follow/connect)
            ├── EditProfile.tsx    # ✅ Profile edit form with avatar upload + sport-specific positions
            ├── Highlights.tsx     # ✅ Video grid, upload modal with progress bar, delete
            ├── Teams.tsx          # ✅ All/Mine tabs, create modal, join/leave, roster view
            ├── Tournaments.tsx    # ✅ Sport filter chips, tournament cards, detail modal, team registration
            ├── Rankings.tsx       # ✅ Leaderboard table with medal badges, sport/tournament/category filters
            ├── Announcements.tsx  # ✅ Announcement feed, create modal (coach/scout/admin), delete
            ├── Messages.tsx       # ✅ Conversation sidebar + real-time chat (Socket.IO)
            ├── Notifications.tsx  # ✅ Notification list, type icons, mark read, mark all read
            └── AdminDashboard.tsx # ✅ Users tab (table, PATCH verify/role, delete), Stats tab (8 cards + sport breakdown)
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
- Full monorepo setup (npm workspaces, concurrently for single `npm run dev`)
- PostgreSQL installed locally and running (via Homebrew, `postgresql@16`)
- `allfor1` database created with `postgres` superuser
- `npx prisma db push` completed — all 19 tables created
- Server running on port 3001 (changed from 5000 — macOS AirPlay Receiver occupies 5000)
- Client running on port 5173 with Vite proxy to 3001
- End-to-end API tested: registration + login returning JWT tokens

#### Backend (all 12 route files complete)
- Auth system with JWT access + refresh tokens, bcrypt, RBAC middleware
- User profiles with Cloudinary avatar upload (Multer memory storage → upload_stream)
- Follow/connection system with notification triggers
- Highlight uploads to Cloudinary (sport auto-fetched from user record)
- Personalized feed
- Teams (create, roster, join/leave)
- Tournaments (admin CRUD, team registration, match results, per-sport player stats)
- Rule-based ranking engine (sport-specific weighted scoring)
- Announcements (coach/scout/admin, optional sport + type)
- Notifications (real-time via Socket.IO)
- Direct messaging with Socket.IO rooms (`join_conversation` / `leave_conversation`)
- Admin dashboard API (user management PATCH, platform stats)
- Shared Socket.IO instance pattern (`config/socket.ts`) to avoid circular dependencies

#### Frontend (all 14 pages complete)
- Login, Register (3-step flow: info → role → sport)
- AuthContext + Axios interceptor with auto token refresh
- MainLayout with role-aware sidebar navigation
- Home (personalized highlight feed)
- Explore (search + role/sport filters, user cards)
- Profile (bio, highlights grid, teams, rankings, follow/connect buttons)
- EditProfile (avatar upload, sport-specific position dropdown)
- Highlights (video grid, upload modal with progress bar, delete)
- Teams (All/Mine tabs, create modal, join/leave, roster)
- Tournaments (sport filter chips, cards, detail modal, team registration)
- Rankings (leaderboard table, medal emojis, sport/tournament/category filters)
- Announcements (feed, create modal for coach/scout/admin, delete)
- Messages (conversation sidebar + real-time Socket.IO chat)
- Notifications (type icons, mark read, mark all read)
- AdminDashboard (Users tab with inline role/verify/delete; Stats tab with 8 cards + sport breakdown)

---

### ⬜ REMAINING

#### Required Before Full Functionality
- **Cloudinary credentials** — Add real values to `server/.env`:
  ```
  CLOUDINARY_CLOUD_NAME="your-actual-cloud-name"
  CLOUDINARY_API_KEY="your-actual-api-key"
  CLOUDINARY_API_SECRET="your-actual-api-secret"
  ```
  Without these, highlight video uploads and avatar photo uploads will fail (all other features work).

#### Nice-to-Have / Future
- **Seed data** — Script to populate demo users, teams, tournaments, highlights, rankings for local testing
- **Admin tournament creation UI** — Form in AdminDashboard to create tournaments from the frontend
- **Match result entry UI** — Admin form to input match scores and per-player stats (triggers ranking recalculation)
- **Bracket / schedule view** — Visual tournament bracket or match schedule in the Tournaments detail modal
- **Infinite scroll** on Home feed and Highlights grid (currently loads a fixed page)
- **Video player component** — Inline playback with controls (currently links to Cloudinary URL)
- **Profile ranking badges** — Show rank badges (🥇🥈🥉) on profile cards in Explore
- **Push to production** — Deploy server (Railway / Render) + client (Vercel / Netlify), set production env vars
- **Email verification** — Send email on register to verify address
- **Password reset** — Forgot password flow

---

## How to Run

### Prerequisites
- Node.js 18+
- PostgreSQL running locally (installed via `brew install postgresql@16`)
- Cloudinary account (for video/image uploads — app runs without it but uploads will fail)

### Setup
```bash
# Clone and install all dependencies
npm install          # from root (installs both server + client via workspaces)

# Configure environment
# Edit server/.env — PostgreSQL URL is pre-configured for local postgres user
# Add your Cloudinary credentials (CLOUDINARY_CLOUD_NAME, API_KEY, API_SECRET)

# Push database schema (creates all tables)
cd server && npx prisma db push
```

### Development
```bash
# From root — starts both server and client concurrently
npm run dev

# Or individually:
# Terminal 1 — Server (port 3001)
cd server && npm run dev

# Terminal 2 — Client (port 5173)
cd client && npm run dev
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
CLOUDINARY_CLOUD_NAME="your-cloud-name"       # ← needs real value for uploads
CLOUDINARY_API_KEY="your-api-key"              # ← needs real value for uploads
CLOUDINARY_API_SECRET="your-api-secret"        # ← needs real value for uploads
```

---

## Known Notes

- **Port 3001** is used instead of 5000 because macOS AirPlay Receiver occupies port 5000 by default.
- **Socket.IO** shared instance lives in `server/src/config/socket.ts` to avoid circular dependency between `index.ts` and `message.routes.ts`.
- **Avatar uploads** use Multer memory storage + Cloudinary `upload_stream` (not disk storage) so no temp files are written.
- **Highlight sport** is automatically pulled from the uploading user's profile — not required in the upload form.
- **Announcement type** defaults to `GENERAL` in the schema — frontend can omit it.
- **Admin routes** use `PATCH` (not `PUT`) for verify and role changes.
# The-All-For-1-Sports-Network
