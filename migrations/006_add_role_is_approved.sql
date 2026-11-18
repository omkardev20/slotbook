-- Consultant approval is separate from email proof.
-- Customers do not need this flag. A consultant stays 0 until an admin approves.
ALTER TABLE user_roles
  ADD COLUMN is_approved INTEGER NOT NULL DEFAULT 0 CHECK (is_approved IN (0, 1));

-- The seeded demo consultant is already public, so the service list keeps working.
UPDATE user_roles
SET is_approved = 1
WHERE user_id = '11111111-1111-4111-8111-111111111111'
  AND role = 'consultant';
