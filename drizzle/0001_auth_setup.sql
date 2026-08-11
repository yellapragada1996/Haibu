-- ============================================================
-- Auth wiring: tie public.users to Supabase auth.users
-- Run this AFTER the Drizzle migration, BEFORE any user signups.
-- ============================================================

-- 1. FK: public.users.id MUST reference auth.users.id
--    ON DELETE RESTRICT — a user with bookings/moderation history
--    cannot be silently hard-deleted from auth.users. See GDPR note
--    in src/db/schema.ts (anonymization flow needed for v1.1+).
ALTER TABLE public.users
  ADD CONSTRAINT fk_users_auth
  FOREIGN KEY (id) REFERENCES auth.users (id)
  ON DELETE RESTRICT
  ON UPDATE CASCADE;

-- 2. Trigger: on every new auth.user, create the matching public.users row.
--    Timezone defaults to 'UTC'; the client updates it after first login
--    via Intl.DateTimeFormat().resolvedOptions().timeZone.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.users (id, email, display_name, timezone)
  VALUES (
    new.id,
    new.email,
    COALESCE(
      new.raw_user_meta_data->>'display_name',
      split_part(new.email, '@', 1)
    ),
    'UTC'
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();
