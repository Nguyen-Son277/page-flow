ALTER TABLE "User" ADD COLUMN "username" TEXT;
-- Backfill existing accounts from the email local part so nobody loses access.
UPDATE "User" u SET "username" = c.candidate FROM (
  SELECT id, CASE WHEN length(cleaned) >= 3 THEN cleaned ELSE cleaned || 'user' END AS candidate FROM (
    SELECT id, left(regexp_replace(lower(split_part(email, '@', 1)), '[^a-z0-9._-]', '', 'g'), 24) AS cleaned FROM "User"
  ) raw
) c WHERE u.id = c.id;
-- Resolve collisions with a numeric suffix.
WITH ranked AS (
  SELECT id, "username", row_number() OVER (PARTITION BY "username" ORDER BY "createdAt", id) AS rn FROM "User"
)
UPDATE "User" u SET "username" = ranked."username" || ranked.rn::text FROM ranked WHERE u.id = ranked.id AND ranked.rn > 1;
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
