import api from './client';

// Shapes mirror the server: GET /users/:id → { user, isFollowing, connection,
// isBlocked }, and GET /users/:id/performance-card → PerformanceCardData.

export interface ProfileUser {
  id: string;
  name: string;
  avatar: string | null;
  banner: string | null;
  role: string;
  sport: string | null;
  gender: string | null;
  position: string | null;
  verified: boolean;
  guardianManaged: boolean;
  claimStatus: string | null;
  bio: string | null;
  location: string | null;
  age: number | null;
  height: string | null;
  contactEmail?: string | null;
  phone?: string | null;
  teamMemberships?: { team: { id: string; name: string; sport: string | null; logo?: string | null } }[];
  _count?: { followers: number; following: number; connections: number; highlights: number };
}

export interface Connection {
  status: 'PENDING' | 'ACCEPTED' | 'DECLINED';
  direction?: 'incoming' | 'outgoing';
}

export interface ProfileResponse {
  user: ProfileUser;
  isFollowing: boolean;
  connection: Connection | null;
  isBlocked: boolean;
}

export async function fetchProfile(id: string): Promise<ProfileResponse> {
  const res = await api.get(`/users/${id}`);
  return res.data as ProfileResponse;
}

// ── Performance Card ──────────────────────────────────────────────────────────

export interface MatchLine {
  matchId: string;
  tournamentId: string;
  matchDate: string;
  round: string | null;
  homeTeam: string;
  awayTeam: string;
  homeScore: number | null;
  awayScore: number | null;
  stats: Record<string, number>;
}

export interface PerformanceCardData {
  sport: string | null;
  isStatSport: boolean;
  career: { matches: number; totals: Record<string, number>; averages: Record<string, number> } | null;
  tournaments: { id: string; name: string; startDate: string; matches: number; totals: Record<string, number>; averages?: Record<string, number> }[];
  matchLines?: MatchLine[];
  competition: { tournament: { id: string; name: string; startDate: string }; team: { id: string; name: string }; teamMatches: number }[];
  rankings: { rank: number; score: number; category: string | null; tournament: { id: string; name: string } | null }[];
  endorsementCount: number;
  achievements: string[];
  athleticsEvents: string[];
}

export async function fetchPerformanceCard(id: string): Promise<PerformanceCardData> {
  const res = await api.get(`/users/${id}/performance-card`);
  return res.data as PerformanceCardData;
}
