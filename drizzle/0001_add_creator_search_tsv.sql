ALTER TABLE creator_profiles
ADD COLUMN IF NOT EXISTS search_tsv tsvector;

CREATE INDEX IF NOT EXISTS idx_creator_profiles_search_tsv
ON creator_profiles
USING GIN (search_tsv);
