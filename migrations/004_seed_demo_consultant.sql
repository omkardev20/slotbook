-- Demo data so GET /consultants/:id/services returns something before login exists.
-- A later seed script should own this; a migration also runs in production.
INSERT INTO users (id, email, password_hash, name, created_at, updated_at)
VALUES (
  '11111111-1111-4111-8111-111111111111',
  'demo.consultant@slotbook.local',
  'seed-not-a-login',
  'Demo Consultant',
  1730000000000,
  1730000000000
);

INSERT INTO user_roles (user_id, role)
VALUES ('11111111-1111-4111-8111-111111111111', 'consultant');

INSERT INTO services (
  id, consultant_id, name, duration_minutes, price_minor, buffer_minutes, is_active, created_at, updated_at
) VALUES
  (
    '22222222-2222-4222-8222-222222222222',
    '11111111-1111-4111-8111-111111111111',
    'Intro call',
    30, 0, 10, 1,
    1730000000000, 1730000000000
  ),
  (
    '33333333-3333-4333-8333-333333333333',
    '11111111-1111-4111-8111-111111111111',
    'Strategy session',
    60, 149900, 15, 1,
    1730000000000, 1730000000000
  ),
  (
    '44444444-4444-4444-8444-444444444444',
    '11111111-1111-4111-8111-111111111111',
    'Retired package',
    45, 99000, 0, 0,
    1730000000000, 1730000000000
  );
