import multer from 'multer';
import type { Response } from 'express';
import logger from '../utils/logger';

// ─── Storage ──────────────────────────────────────────────────────────────────

// Keep files in memory — they are streamed directly to Cloudinary and never
// written to disk, so there is no path-traversal or filename-injection risk.
const storage = multer.memoryStorage();

// ─── Magic-byte tables ────────────────────────────────────────────────────────
//
// Extension-only checks are trivially bypassed by renaming a file.
// We read the first bytes of the actual file content to confirm the real type.
// Reference: https://en.wikipedia.org/wiki/List_of_file_signatures

interface MagicCheck {
  offset: number;
  bytes:  number[];
}

const IMAGE_MAGIC: Record<string, MagicCheck[]> = {
  '.jpg':  [{ offset: 0, bytes: [0xFF, 0xD8, 0xFF] }],
  '.jpeg': [{ offset: 0, bytes: [0xFF, 0xD8, 0xFF] }],
  '.png':  [{ offset: 0, bytes: [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A] }],
  '.webp': [
    { offset: 0, bytes: [0x52, 0x49, 0x46, 0x46] }, // "RIFF"
    { offset: 8, bytes: [0x57, 0x45, 0x42, 0x50] }, // "WEBP"
  ],
};

const VIDEO_MAGIC: Record<string, MagicCheck[]> = {
  '.mp4':  [{ offset: 4, bytes: [0x66, 0x74, 0x79, 0x70] }], // "ftyp"
  '.mov':  [{ offset: 4, bytes: [0x66, 0x74, 0x79, 0x70] }], // "ftyp" (mp4 family)
  '.webm': [{ offset: 0, bytes: [0x1A, 0x45, 0xDF, 0xA3] }],
  '.mkv':  [{ offset: 0, bytes: [0x1A, 0x45, 0xDF, 0xA3] }],
  '.avi':  [
    { offset: 0, bytes: [0x52, 0x49, 0x46, 0x46] }, // "RIFF"
    { offset: 8, bytes: [0x41, 0x56, 0x49, 0x20] }, // "AVI "
  ],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function matchesMagic(buf: Buffer, checks: MagicCheck[]): boolean {
  return checks.every(({ offset, bytes }) => {
    if (buf.length < offset + bytes.length) return false;
    return bytes.every((b, i) => buf[offset + i] === b);
  });
}

function detectExt(buf: Buffer, table: Record<string, MagicCheck[]>): string | null {
  for (const [ext, checks] of Object.entries(table)) {
    if (matchesMagic(buf, checks)) return ext;
  }
  return null;
}

// ─── Post-upload validators ───────────────────────────────────────────────────
//
// Call these at the top of route handlers after multer has buffered the file.
// Return true if the file is valid, false if a 400 has already been sent.

export function validateImageBytes(file: Express.Multer.File, res: Response): boolean {
  const allowed   = new Set(['.jpg', '.jpeg', '.png', '.webp']);
  const claimedExt = file.originalname.toLowerCase().replace(/.*(\.[^.]+)$/, '$1');

  if (!allowed.has(claimedExt)) {
    res.status(400).json({ error: 'Only JPEG, PNG, and WebP images are allowed' });
    return false;
  }

  const detected = detectExt(file.buffer, IMAGE_MAGIC);
  if (!detected) {
    logger.warn('upload.invalid_magic', { claimed: claimedExt, mime: file.mimetype });
    res.status(400).json({ error: 'File content does not match a supported image format' });
    return false;
  }

  // JPEG variants (.jpg / .jpeg) both map to the same magic signature
  const jpegFamily = new Set(['.jpg', '.jpeg']);
  const ok =
    (jpegFamily.has(claimedExt) && jpegFamily.has(detected)) ||
    claimedExt === detected;

  if (!ok) {
    logger.warn('upload.ext_spoofed', { claimed: claimedExt, detected });
    res.status(400).json({ error: 'File extension does not match file content' });
    return false;
  }

  return true;
}

export function validateVideoBytes(file: Express.Multer.File, res: Response): boolean {
  const allowed    = new Set(['.mp4', '.mov', '.avi', '.mkv', '.webm']);
  const claimedExt = file.originalname.toLowerCase().replace(/.*(\.[^.]+)$/, '$1');

  if (!allowed.has(claimedExt)) {
    res.status(400).json({ error: 'Only MP4, MOV, AVI, MKV, and WebM videos are allowed' });
    return false;
  }

  const detected = detectExt(file.buffer, VIDEO_MAGIC);
  if (!detected) {
    logger.warn('upload.invalid_magic', { claimed: claimedExt, mime: file.mimetype });
    res.status(400).json({ error: 'File content does not match a supported video format' });
    return false;
  }

  // MP4 and MOV share the "ftyp" box — either extension is valid for both
  const mp4Family = new Set(['.mp4', '.mov']);
  const ok =
    (mp4Family.has(claimedExt) && mp4Family.has(detected)) ||
    claimedExt === detected;

  if (!ok) {
    logger.warn('upload.ext_spoofed', { claimed: claimedExt, detected });
    res.status(400).json({ error: 'File extension does not match file content' });
    return false;
  }

  return true;
}

// ─── Multer instances ─────────────────────────────────────────────────────────

export const uploadVideo = multer({
  storage,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100 MB
    files:    1,                  // one file per request
    fields:   10,                 // cap non-file form fields
  },
  fileFilter: (_req, file, cb) => {
    // First line of defence: reject non-video MIME types before buffering the whole file.
    const allowed = new Set([
      'video/mp4', 'video/quicktime', 'video/x-msvideo',
      'video/x-matroska', 'video/webm',
      'application/octet-stream', // some browsers send this generically
    ]);
    if (!allowed.has(file.mimetype)) {
      cb(new Error('Invalid file type — only video files are accepted'));
      return;
    }
    cb(null, true);
  },
});

export const uploadImage = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5 MB
    files:    1,
    fields:   10,
  },
  fileFilter: (_req, file, cb) => {
    const allowed = new Set([
      'image/jpeg', 'image/png', 'image/webp',
      'application/octet-stream',
    ]);
    if (!allowed.has(file.mimetype)) {
      cb(new Error('Invalid file type — only JPEG, PNG, and WebP images are accepted'));
      return;
    }
    cb(null, true);
  },
});
