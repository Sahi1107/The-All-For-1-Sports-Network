-- One-time: drop Message.edited_at after removing the message-edit feature.
-- IF EXISTS makes this idempotent; remove the file + Dockerfile step in a
-- follow-up once every environment has applied the drop.
ALTER TABLE "Message" DROP COLUMN IF EXISTS "edited_at";
