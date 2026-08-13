// Public-artifact eligibility for athlete OG cards + share pages. MUST match the
// public SSR gate: a real, discoverable, adult athlete only. Anything else gets a
// brand-only fallback that leaks no data. Pure + exported so it's unit-tested.

export interface OgAthlete {
  role: string;
  discoverable?: boolean | null;
  guardianManaged?: boolean | null;
  age?: number | null;
}

export function athleteCardEligible(u: OgAthlete | null | undefined): boolean {
  return !!u
    && u.role === 'ATHLETE'
    && u.discoverable === true
    && !u.guardianManaged
    && (u.age == null || u.age >= 13);
}

/** "City, State, Country" → State only (never the city — privacy). */
export function stateOnly(location?: string | null): string | null {
  if (!location) return null;
  const parts = location.split(',').map((p) => p.trim()).filter(Boolean);
  return parts.length >= 3 ? parts[parts.length - 2] : parts[0] ?? null;
}
