import { z } from 'zod';
import { reqStr, optStr, optUuid, PaginationQuery, SportEnum } from './common';

// ─── Post ─────────────────────────────────────────────────────────────────────

// A bare GCS object key produced by the direct-upload flow: posts/<uuid>.<ext>.
// Constrained so a client can only reference an object under the posts/ folder
// (never an arbitrary path), and the bytes are re-validated server-side anyway.
const VideoKey = z
  .string()
  .regex(/^posts\/[0-9a-f-]{36}\.(mp4|mov|avi|mkv|webm)$/i, {
    error: 'videoKey must be a posts/<uuid>.<ext> object key',
  });

// Stat payload for a PERFORMANCE post. The athlete enters these values; the big
// numeral + label render as a stat card in the feed instead of plain text.
export const PerformancePayload = z.object({
  statValue:   reqStr(12,  'Stat value'),      // "32"
  statLabel:   reqStr(16,  'Stat label'),      // "PTS"
  ratingDelta: optStr(16,  'Rating change'),   // "+2.1 rating"
  rating:      optStr(8,   'Rating'),          // "92.1"
  eyebrow:     optStr(40,  'Eyebrow'),         // "Season high"
  context:     optStr(120, 'Context'),         // "vs Bengaluru Hoops · Chennai Open · Apr 14"
});

export const CreatePostBody = z.object({
  type:    z.enum(['TEXT', 'IMAGE', 'HIGHLIGHT', 'PERFORMANCE'], {
    error: 'type must be TEXT, IMAGE, HIGHLIGHT, or PERFORMANCE',
  }),
  content: optStr(2000, 'Content'),
  title:   optStr(100,  'Title'),
  commentsDisabled: z.preprocess((v) => v === 'true' || v === true, z.boolean()).optional(),
  // Set by the direct-to-GCS highlight flow: the video is uploaded straight to
  // GCS and only its object key is sent here (instead of multipart bytes).
  videoKey: VideoKey.optional(),
  // Present only for PERFORMANCE posts. Accept a JSON string (multipart form) or
  // an already-parsed object (JSON body) and coerce to the payload shape.
  performance: z.preprocess(
    (v) => (typeof v === 'string' ? safeJson(v) : v),
    PerformancePayload.optional(),
  ),
});

function safeJson(s: string): unknown {
  try { return JSON.parse(s); } catch { return undefined; }
}

// Body for minting a direct-upload signed URL.
export const UploadUrlBody = z.object({
  filename:    reqStr(255, 'Filename'),
  contentType: reqStr(100, 'Content type'),
});

// ─── Highlight ────────────────────────────────────────────────────────────────

export const CreateHighlightBody = z.object({
  title:              reqStr(100, 'Title'),
  description:        optStr(500, 'Description'),
  tournamentId:       optUuid,
  tournamentLocation: optStr(100, 'Tournament location'),
});

export const HighlightListQuery = PaginationQuery.extend({
  sport:        SportEnum.optional(),
  userId:       z.string().uuid().optional(),
  tournamentId: z.string().uuid().optional(),
});
