/**
 * Server-side canonical location reference for Radar.
 *
 * Profiles store location as one free-text string ("City, State, Country").
 * Radar's nearest-location fallback (exact city → state → region → country)
 * needs those parts structured and a region grouping for "nearby states".
 *
 * `region` uses six India macro-regions derived from the Ministry of Home
 * Affairs Zonal Councils (North-East treated as its own region). State spellings
 * match client/src/data/locationData.ts exactly so parsing lines up with what
 * registration stored. Tunable; a true state-adjacency map can replace the
 * macro-regions later without changing the parse/resolve interface.
 */

export type Region = 'North' | 'South' | 'East' | 'West' | 'Central' | 'Northeast';

/** India state / union territory → macro-region. Keys match stored spellings. */
export const INDIA_STATE_REGION: Record<string, Region> = {
  // North
  'Chandigarh': 'North',
  'Delhi': 'North',
  'Haryana': 'North',
  'Himachal Pradesh': 'North',
  'Jammu and Kashmir': 'North',
  'Ladakh': 'North',
  'Punjab': 'North',
  'Rajasthan': 'North',
  // Central
  'Chhattisgarh': 'Central',
  'Madhya Pradesh': 'Central',
  'Uttar Pradesh': 'Central',
  'Uttarakhand': 'Central',
  // East
  'Bihar': 'East',
  'Jharkhand': 'East',
  'Odisha': 'East',
  'West Bengal': 'East',
  // West
  'Dadra and Nagar Haveli and Daman and Diu': 'West',
  'Goa': 'West',
  'Gujarat': 'West',
  'Maharashtra': 'West',
  // South
  'Andaman and Nicobar Islands': 'South',
  'Andhra Pradesh': 'South',
  'Karnataka': 'South',
  'Kerala': 'South',
  'Lakshadweep': 'South',
  'Puducherry': 'South',
  'Tamil Nadu': 'South',
  'Telangana': 'South',
  // Northeast
  'Arunachal Pradesh': 'Northeast',
  'Assam': 'Northeast',
  'Manipur': 'Northeast',
  'Meghalaya': 'Northeast',
  'Mizoram': 'Northeast',
  'Nagaland': 'Northeast',
  'Sikkim': 'Northeast',
  'Tripura': 'Northeast',
};

/** Case-insensitive lookup of the region for a state (India only for now). */
export function resolveRegion(country: string | null | undefined, state: string | null | undefined): Region | null {
  if (!state) return null;
  if (country && country.trim().toLowerCase() !== 'india') return null;
  const target = state.trim().toLowerCase();
  for (const [name, region] of Object.entries(INDIA_STATE_REGION)) {
    if (name.toLowerCase() === target) return region;
  }
  return null;
}

export interface ParsedLocation {
  city: string | null;
  state: string | null;
  region: string | null;
  country: string | null;
  /** True when the state was recognized (so region resolved). Drives backfill review. */
  recognized: boolean;
}

/**
 * Parse a stored "City, State, Country" location string into structured parts.
 * Tolerant of the 2-part ("State, Country") and 1-part ("Country") forms
 * registration also produces, and of extra commas. Never throws.
 */
export function parseLocation(raw: string | null | undefined): ParsedLocation {
  const empty: ParsedLocation = { city: null, state: null, region: null, country: null, recognized: false };
  if (!raw || !raw.trim()) return empty;

  const parts = raw.split(',').map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return empty;

  let city: string | null = null;
  let state: string | null = null;
  let country: string | null = null;

  if (parts.length === 1) {
    country = parts[0];
  } else if (parts.length === 2) {
    [state, country] = parts;
  } else {
    // 3+ parts: last is country, second-to-last is state, the rest is the city.
    country = parts[parts.length - 1];
    state = parts[parts.length - 2];
    city = parts.slice(0, parts.length - 2).join(', ');
  }

  const region = resolveRegion(country, state);
  return { city, state, region, country, recognized: region !== null };
}
