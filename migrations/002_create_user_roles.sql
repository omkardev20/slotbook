-- A user can hold more than one role (a consultant can also book others),
-- so roles are rows here instead of one column on users.
CREATE TABLE user_roles (
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  role    TEXT NOT NULL CHECK (role IN ('customer', 'consultant', 'admin')),
  -- The pair is the key: same user + same role cannot be inserted twice.
  PRIMARY KEY (user_id, role)
) STRICT;
