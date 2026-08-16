ALTER TABLE creator_profiles
ADD COLUMN search_tsv tsvector;

CREATE INDEX idx_creator_profiles_search_tsv
ON creator_profiles
USING GIN (search_tsv);

CREATE OR REPLACE FUNCTION refresh_creator_search_tsv(p_creator_profile_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE creator_profiles cp
  SET search_tsv = (
    SELECT
      setweight(to_tsvector('english', coalesce(u.display_name, '')), 'A')
      ||
      setweight(
        to_tsvector(
          'english',
          coalesce(
            (
              SELECT string_agg(
                regexp_replace(o.title, '[^a-zA-Z0-9]+', ' ', 'g') || ' ' ||
                regexp_replace(o.category::text, '_', ' ', 'g'),
                ' '
              )
              FROM offerings o
              WHERE o.creator_id = cp.id
                AND o.is_active = true
                AND o.deleted_at IS NULL
            ),
            ''
          )
        ),
        'B'
      )
      ||
      setweight(to_tsvector('english', coalesce(cp.bio, '')), 'C')
      ||
      setweight(
        to_tsvector('english', regexp_replace(cp.category::text, '_', ' ', 'g')),
        'D'
      )
    FROM users u
    WHERE u.id = cp.user_id
  )
  WHERE cp.id = p_creator_profile_id;
END;
$$;

CREATE OR REPLACE FUNCTION creator_profiles_search_tsv_trigger_fn()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM refresh_creator_search_tsv(NEW.id);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION users_search_tsv_trigger_fn()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM refresh_creator_search_tsv(
    (SELECT id FROM creator_profiles WHERE user_id = NEW.id)
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION offerings_search_tsv_trigger_fn()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM refresh_creator_search_tsv(OLD.creator_id);
    RETURN OLD;
  ELSE
    PERFORM refresh_creator_search_tsv(NEW.creator_id);
    RETURN NEW;
  END IF;
END;
$$;

CREATE TRIGGER creator_profiles_search_tsv_trigger
AFTER INSERT OR UPDATE OF bio, category
ON creator_profiles
FOR EACH ROW
EXECUTE FUNCTION creator_profiles_search_tsv_trigger_fn();

CREATE TRIGGER users_search_tsv_trigger
AFTER INSERT OR UPDATE OF display_name
ON users
FOR EACH ROW
EXECUTE FUNCTION users_search_tsv_trigger_fn();

CREATE TRIGGER offerings_search_tsv_trigger
AFTER INSERT OR UPDATE OF title, category, is_active, deleted_at
OR DELETE
ON offerings
FOR EACH ROW
EXECUTE FUNCTION offerings_search_tsv_trigger_fn();

SELECT refresh_creator_search_tsv(id)
FROM creator_profiles;
