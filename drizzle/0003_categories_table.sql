-- ============================================================
-- Categories become a first-class table (Option 2).
-- offerings.category / creator_profiles.category: enum -> text FK.
-- ============================================================

-- 1. Reference table + seed the 3 existing categories
CREATE TABLE categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  slug text NOT NULL UNIQUE,
  display_label text NOT NULL,
  sort_order integer NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

INSERT INTO categories (slug, display_label, sort_order) VALUES
  ('casual_talk', 'Casual Talk', 1),
  ('asmr',         'ASMR',        2),
  ('music',        'Music',       3);

-- 2. Drop the search_tsv triggers that reference `category` in their
--    UPDATE OF column list (they block the type change). Recreated in step 5.
DROP TRIGGER IF EXISTS offerings_search_tsv_trigger ON offerings;
DROP TRIGGER IF EXISTS creator_profiles_search_tsv_trigger ON creator_profiles;

-- 3. Convert enum columns to text + FK (BEFORE dropping the enum)
ALTER TABLE offerings
  ALTER COLUMN category TYPE text USING category::text;
ALTER TABLE offerings
  ADD CONSTRAINT offerings_category_slug_fk
  FOREIGN KEY (category) REFERENCES categories(slug) ON DELETE RESTRICT;

ALTER TABLE creator_profiles
  ALTER COLUMN category TYPE text USING category::text;
ALTER TABLE creator_profiles
  ADD CONSTRAINT creator_profiles_category_slug_fk
  FOREIGN KEY (category) REFERENCES categories(slug) ON DELETE RESTRICT;

-- 4. Enum is now referenced by zero columns -> safe to drop
DROP TYPE category;

-- 5. Recreate the two search_tsv triggers (functions unchanged; column is now text)
CREATE TRIGGER creator_profiles_search_tsv_trigger
AFTER INSERT OR UPDATE OF bio, category
ON creator_profiles
FOR EACH ROW
EXECUTE FUNCTION creator_profiles_search_tsv_trigger_fn();

CREATE TRIGGER offerings_search_tsv_trigger
AFTER INSERT OR UPDATE OF title, category, is_active, deleted_at
OR DELETE
ON offerings
FOR EACH ROW
EXECUTE FUNCTION offerings_search_tsv_trigger_fn();

-- 6. Step 14 per-category review reaction tags (DB, not hardcoded)
CREATE TABLE category_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  category_slug text NOT NULL REFERENCES categories(slug) ON DELETE CASCADE,
  tag_label text NOT NULL,
  sort_order integer NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX idx_category_tags_slug ON category_tags (category_slug, sort_order);

INSERT INTO category_tags (category_slug, tag_label, sort_order) VALUES
  ('casual_talk', 'Great conversationalist', 1),
  ('casual_talk', 'Easy to talk to',        2),
  ('casual_talk', 'Made me laugh',          3),
  ('casual_talk', 'Very genuine',           4),
  ('casual_talk', 'Interesting topics',     5),
  ('casual_talk', 'Good listener',          6),
  ('asmr',        'Incredibly relaxing',    1),
  ('asmr',        'Great voice',            2),
  ('asmr',        'Felt personal',          3),
  ('asmr',        'Very creative',          4),
  ('asmr',        'Perfect pacing',         5),
  ('asmr',        'Helped me sleep',        6),
  ('music',       'Clear explanations',     1),
  ('music',       'Patient teacher',        2),
  ('music',       'Pushed me to improve',   3),
  ('music',       'Good energy',            4),
  ('music',       'Well prepared',          5),
  ('music',       'Fun session',            6);
