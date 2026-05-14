const db = require('./index');

async function runMigrations() {
  await db.query(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS session_version INTEGER NOT NULL DEFAULT 0;
  `);

  await db.query(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_number VARCHAR(20);
  `);

  await db.query(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS google_sub VARCHAR(128);
  `);

  await db.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_phone_number_unique
      ON users(phone_number)
      WHERE phone_number IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_sub_unique
      ON users(google_sub)
      WHERE google_sub IS NOT NULL;
  `);

  // Class cover color
  await db.query(`
    ALTER TABLE classes ADD COLUMN IF NOT EXISTS cover_color VARCHAR(32) DEFAULT 'teal';
  `);

  await db.query(`
    ALTER TABLE classes ADD COLUMN IF NOT EXISTS is_private BOOLEAN DEFAULT FALSE;
  `);

  // Assignments
  await db.query(`
    CREATE TABLE IF NOT EXISTS assignments (
      id          SERIAL PRIMARY KEY,
      class_id    INTEGER REFERENCES classes(id) ON DELETE CASCADE,
      created_by  INTEGER REFERENCES users(id),
      title       VARCHAR(255) NOT NULL,
      description TEXT,
      due_date    TIMESTAMP,
      max_points  INTEGER DEFAULT 100,
      created_at  TIMESTAMP DEFAULT NOW(),
      updated_at  TIMESTAMP DEFAULT NOW()
    );
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS assignment_submissions (
      id            SERIAL PRIMARY KEY,
      assignment_id INTEGER REFERENCES assignments(id) ON DELETE CASCADE,
      student_id    INTEGER REFERENCES users(id) ON DELETE CASCADE,
      content       TEXT,
      file_url      TEXT,
      filename      VARCHAR(255),
      status        VARCHAR(20) DEFAULT 'submitted',
      grade         NUMERIC(5,2),
      feedback      TEXT,
      submitted_at  TIMESTAMP DEFAULT NOW(),
      graded_at     TIMESTAMP,
      UNIQUE(assignment_id, student_id)
    );
  `);

  // Announcements
  await db.query(`
    CREATE TABLE IF NOT EXISTS announcements (
      id         SERIAL PRIMARY KEY,
      class_id   INTEGER REFERENCES classes(id) ON DELETE CASCADE,
      created_by INTEGER REFERENCES users(id),
      title      VARCHAR(255) NOT NULL,
      body       TEXT NOT NULL,
      pinned     BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );
  `);

  // Indexes
  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_assignments_class_id      ON assignments(class_id);
    CREATE INDEX IF NOT EXISTS idx_submissions_assignment_id ON assignment_submissions(assignment_id);
    CREATE INDEX IF NOT EXISTS idx_announcements_class_id    ON announcements(class_id);
  `);

  // Chat persistence
  await db.query(`
    CREATE TABLE IF NOT EXISTS direct_messages (
      id         BIGSERIAL PRIMARY KEY,
      from_user  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      to_user    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      message    TEXT NOT NULL,
      is_read    BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS class_chat_messages (
      id         BIGSERIAL PRIMARY KEY,
      class_id   INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      message    TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_dm_pair_time
      ON direct_messages (LEAST(from_user, to_user), GREATEST(from_user, to_user), created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_dm_to_user_unread
      ON direct_messages (to_user, is_read, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_class_chat_messages_class_time
      ON class_chat_messages (class_id, created_at DESC);
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS user_feature_permissions (
      id          BIGSERIAL PRIMARY KEY,
      user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      feature_key VARCHAR(64) NOT NULL,
      can_access  BOOLEAN NOT NULL DEFAULT TRUE,
      updated_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
      updated_at  TIMESTAMP DEFAULT NOW(),
      UNIQUE(user_id, feature_key)
    );
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_user_feature_permissions_user
      ON user_feature_permissions (user_id);
    CREATE INDEX IF NOT EXISTS idx_user_feature_permissions_feature
      ON user_feature_permissions (feature_key);
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS platform_wipe_backups (
      id         BIGSERIAL PRIMARY KEY,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      reason     TEXT NOT NULL,
      snapshot   JSONB NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS owner_wipe_requests (
      id            BIGSERIAL PRIMARY KEY,
      owner_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash    VARCHAR(128) NOT NULL,
      reason        TEXT NOT NULL,
      backup_id     BIGINT REFERENCES platform_wipe_backups(id) ON DELETE SET NULL,
      execute_after TIMESTAMP NOT NULL,
      expires_at    TIMESTAMP NOT NULL,
      status        VARCHAR(20) NOT NULL DEFAULT 'pending',
      created_at    TIMESTAMP DEFAULT NOW(),
      used_at       TIMESTAMP
    );
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_owner_wipe_requests_owner
      ON owner_wipe_requests (owner_id, status);
    CREATE INDEX IF NOT EXISTS idx_owner_wipe_requests_window
      ON owner_wipe_requests (execute_after, expires_at);
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS login_security_events (
      id            BIGSERIAL PRIMARY KEY,
      email         VARCHAR(320) NOT NULL,
      ip_address    VARCHAR(64) NOT NULL,
      failed_count  INTEGER NOT NULL DEFAULT 0,
      last_failed_at TIMESTAMP,
      lock_until    TIMESTAMP,
      updated_at    TIMESTAMP DEFAULT NOW(),
      UNIQUE(email, ip_address)
    );
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_login_security_events_lock_until
      ON login_security_events (lock_until);
    CREATE INDEX IF NOT EXISTS idx_login_security_events_email
      ON login_security_events (email);
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS socket_security_bans (
      id           BIGSERIAL PRIMARY KEY,
      user_id      INTEGER REFERENCES users(id) ON DELETE CASCADE,
      ip_address   VARCHAR(64),
      reason       VARCHAR(128) NOT NULL,
      violations   INTEGER NOT NULL DEFAULT 1,
      banned_until TIMESTAMP NOT NULL,
      created_at   TIMESTAMP DEFAULT NOW(),
      updated_at   TIMESTAMP DEFAULT NOW(),
      UNIQUE(user_id, ip_address)
    );
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_socket_security_bans_until
      ON socket_security_bans (banned_until);
    CREATE INDEX IF NOT EXISTS idx_socket_security_bans_user
      ON socket_security_bans (user_id);
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS chat_security_restrictions (
      id          BIGSERIAL PRIMARY KEY,
      user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      reason      VARCHAR(128) NOT NULL,
      muted_until TIMESTAMP NOT NULL,
      created_at  TIMESTAMP DEFAULT NOW(),
      updated_at  TIMESTAMP DEFAULT NOW(),
      UNIQUE(user_id)
    );
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_chat_security_restrictions_until
      ON chat_security_restrictions (muted_until);
    CREATE INDEX IF NOT EXISTS idx_chat_security_restrictions_user
      ON chat_security_restrictions (user_id);
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS refresh_tokens (
      id          BIGSERIAL PRIMARY KEY,
      user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash  VARCHAR(128) NOT NULL,
      issued_at   TIMESTAMP NOT NULL DEFAULT NOW(),
      expires_at  TIMESTAMP NOT NULL,
      revoked_at  TIMESTAMP,
      replaced_by BIGINT REFERENCES refresh_tokens(id) ON DELETE SET NULL,
      user_agent  TEXT,
      ip_address  VARCHAR(64),
      UNIQUE(token_hash)
    );
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user
      ON refresh_tokens (user_id, revoked_at, expires_at);
    CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires
      ON refresh_tokens (expires_at);
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS otp_challenges (
      id         BIGSERIAL PRIMARY KEY,
      channel    VARCHAR(16) NOT NULL,
      target     VARCHAR(320) NOT NULL,
      purpose    VARCHAR(64) NOT NULL,
      code_hash  VARCHAR(128) NOT NULL,
      attempts   INTEGER NOT NULL DEFAULT 0,
      metadata   JSONB NOT NULL DEFAULT '{}'::jsonb,
      expires_at TIMESTAMP NOT NULL,
      consumed_at TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_otp_challenges_lookup
      ON otp_challenges (channel, target, purpose, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_otp_challenges_expiry
      ON otp_challenges (expires_at);
  `);

  console.log('✅ Migrations applied');
}

module.exports = runMigrations;
