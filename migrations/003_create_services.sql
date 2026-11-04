-- One row per offering a consultant sells, e.g. "30-minute intro call".
-- Money is an integer in minor units (paise): 149900 means ₹1,499.00.
-- Floats cannot represent money exactly, so they are never stored.
CREATE TABLE services (
  id               TEXT    PRIMARY KEY,
  consultant_id    TEXT    NOT NULL REFERENCES users (id),
  name             TEXT    NOT NULL,
  duration_minutes INTEGER NOT NULL CHECK (duration_minutes > 0),
  price_minor      INTEGER NOT NULL CHECK (price_minor >= 0),
  buffer_minutes   INTEGER NOT NULL DEFAULT 0 CHECK (buffer_minutes >= 0),
  -- 1 = bookable, 0 = archived. Archived rows stay; queries hide them.
  is_active        INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at       INTEGER NOT NULL,
  updated_at       INTEGER NOT NULL
) STRICT;

-- The first query is "services for this consultant", so the index matches it.
CREATE INDEX services_consultant_id_idx ON services (consultant_id);
