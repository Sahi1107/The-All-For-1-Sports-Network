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

export const CreatePostBody = z.object({
  type:    z.enum(['TEXT', 'IMAGE', 'HIGHLIGHT'], {
    error: 'type must be TEXT, IMAGE, or HIGHLIGHT',
  }),
  content: optStr(2000, 'Content'),
  title:   optStr(100,  'Title'),
  commentsDisabled: z.preprocess((v) => v === 'true' || v === true, z.boolean()).optional(),
  // Set by the direct-to-GCS highlight flow: the video is uploaded straight to
  // GCS and only its object key is sent here (instead of multipart bytes).
  videoKey: VideoKey.optional(),
});

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
