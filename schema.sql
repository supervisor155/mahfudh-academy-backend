-- ============================================================
-- Quran E-Learning Platform — Full Schema
-- Single source of truth. Drop & recreate to reset.
-- ============================================================

-- Users
CREATE TABLE IF NOT EXISTS users (
    id            SERIAL PRIMARY KEY,
    email         VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    name          VARCHAR(255) NOT NULL,
    role          VARCHAR(20)  NOT NULL CHECK (role IN ('owner', 'manager', 'teacher', 'student')),
    deleted_at    TIMESTAMP,
    created_at    TIMESTAMP DEFAULT NOW(),
    updated_at    TIMESTAMP DEFAULT NOW()
);

-- Classes
CREATE TABLE IF NOT EXISTS classes (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(255) NOT NULL,
    description TEXT,
    created_by  INTEGER REFERENCES users(id),
    is_private  BOOLEAN DEFAULT FALSE,
    invite_code VARCHAR(16) UNIQUE,
    deleted_at  TIMESTAMP,
    created_at  TIMESTAMP DEFAULT NOW(),
    updated_at  TIMESTAMP DEFAULT NOW()
);

-- Class Members
CREATE TABLE IF NOT EXISTS class_members (
    id       SERIAL PRIMARY KEY,
    class_id INTEGER REFERENCES classes(id) ON DELETE CASCADE,
    user_id  INTEGER REFERENCES users(id)   ON DELETE CASCADE,
    role     VARCHAR(20) NOT NULL CHECK (role IN ('manager', 'teacher', 'student')),
    joined_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(class_id, user_id)
);

-- Curriculum Modules (class sections / syllabus)
CREATE TABLE IF NOT EXISTS modules (
    id         SERIAL PRIMARY KEY,
    class_id   INTEGER REFERENCES classes(id) ON DELETE CASCADE,
    title      VARCHAR(255) NOT NULL,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Videos (Lesson Videos)
CREATE TABLE IF NOT EXISTS videos (
    id          SERIAL PRIMARY KEY,
    class_id    INTEGER REFERENCES classes(id)  ON DELETE CASCADE,
    module_id   INTEGER REFERENCES modules(id)  ON DELETE SET NULL,
    title       VARCHAR(255) NOT NULL,
    url         TEXT NOT NULL,
    uploaded_by INTEGER REFERENCES users(id),
    deleted_at  TIMESTAMP,
    created_at  TIMESTAMP DEFAULT NOW()
);

-- Video Views & Progress
CREATE TABLE IF NOT EXISTS video_views (
    id                  SERIAL PRIMARY KEY,
    video_id            INTEGER REFERENCES videos(id) ON DELETE CASCADE,
    user_id             INTEGER REFERENCES users(id)  ON DELETE CASCADE,
    progress_percentage NUMERIC(5,2) DEFAULT 0,
    is_completed        BOOLEAN DEFAULT FALSE,
    viewed_at           TIMESTAMP DEFAULT NOW(),
    UNIQUE(video_id, user_id)
);

-- Reels (Short Videos)
CREATE TABLE IF NOT EXISTS reels (
    id          SERIAL PRIMARY KEY,
    class_id    INTEGER REFERENCES classes(id)  ON DELETE CASCADE,
    module_id   INTEGER REFERENCES modules(id)  ON DELETE SET NULL,
    title       VARCHAR(255),
    url         TEXT NOT NULL,
    uploaded_by INTEGER REFERENCES users(id),
    deleted_at  TIMESTAMP,
    created_at  TIMESTAMP DEFAULT NOW()
);

-- Reel Views
CREATE TABLE IF NOT EXISTS reel_views (
    id                SERIAL PRIMARY KEY,
    reel_id           INTEGER REFERENCES reels(id) ON DELETE CASCADE,
    user_id           INTEGER REFERENCES users(id) ON DELETE CASCADE,
    viewed_at         TIMESTAMP DEFAULT NOW(),
    timestamp_seconds INTEGER,
    UNIQUE(reel_id, user_id)
);

-- Live Sessions (custom Socket.io signaling — no external SFU)
CREATE TABLE IF NOT EXISTS live_sessions (
    id         SERIAL PRIMARY KEY,
    class_id   INTEGER REFERENCES classes(id) ON DELETE CASCADE,
    created_by INTEGER REFERENCES users(id),
    metadata   JSONB,           -- stores room_id + resilience_config
    started_at TIMESTAMP,
    ended_at   TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Live Session Participants
CREATE TABLE IF NOT EXISTS live_session_participants (
    id         SERIAL PRIMARY KEY,
    session_id INTEGER REFERENCES live_sessions(id) ON DELETE CASCADE,
    user_id    INTEGER REFERENCES users(id)         ON DELETE CASCADE,
    joined_at  TIMESTAMP DEFAULT NOW(),
    left_at    TIMESTAMP
);

-- Smart Muṣḥaf Notes
CREATE TABLE IF NOT EXISTS notes (
    id              SERIAL PRIMARY KEY,
    user_id         INTEGER REFERENCES users(id)   ON DELETE CASCADE,
    ayah_id         VARCHAR(32) NOT NULL,           -- e.g. "2:255"
    note            JSONB NOT NULL,
    type            VARCHAR(32) NOT NULL DEFAULT 'text'
                        CHECK (type IN ('text', 'voice', 'highlight', 'bookmark', 'tajweed_correction')),
    tags            TEXT[]   DEFAULT '{}',
    color           VARCHAR(16),                    -- hex, e.g. '#FFD700'
    page_ref        SMALLINT CHECK (page_ref BETWEEN 1 AND 604),
    surah_id        SMALLINT CHECK (surah_id BETWEEN 1 AND 114),
    word_range      JSONB,                          -- { "start": 1, "end": 5 }
    is_pinned       BOOLEAN NOT NULL DEFAULT FALSE,
    is_archived     BOOLEAN NOT NULL DEFAULT FALSE,
    deleted_at      TIMESTAMP,
    shared_class_id INTEGER REFERENCES classes(id) ON DELETE SET NULL,
    created_at      TIMESTAMP DEFAULT NOW(),
    updated_at      TIMESTAMP DEFAULT NOW()
);

-- Teacher Feedback on Student Notes
CREATE TABLE IF NOT EXISTS note_feedback (
    id         SERIAL PRIMARY KEY,
    note_id    INTEGER REFERENCES notes(id) ON DELETE CASCADE,
    teacher_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    comment    TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Persisted Notifications
CREATE TABLE IF NOT EXISTS notifications (
    id         SERIAL PRIMARY KEY,
    user_id    INTEGER REFERENCES users(id) ON DELETE CASCADE,
    type       VARCHAR(64) NOT NULL,
    message    TEXT,
    payload    JSONB DEFAULT '{}',
    is_read    BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Attachments (PDFs, syllabuses, extra materials)
CREATE TABLE IF NOT EXISTS attachments (
    id          SERIAL PRIMARY KEY,
    class_id    INTEGER REFERENCES classes(id) ON DELETE CASCADE,
    uploaded_by INTEGER REFERENCES users(id),
    filename    VARCHAR(255) NOT NULL,
    url         TEXT NOT NULL,
    mime_type   VARCHAR(100),
    size_bytes  INTEGER,
    created_at  TIMESTAMP DEFAULT NOW()
);

-- Audit Logs
CREATE TABLE IF NOT EXISTS audit_logs (
    id           SERIAL PRIMARY KEY,
    actor_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
    action       VARCHAR(128) NOT NULL,
    target_table VARCHAR(64),
    target_id    INTEGER,
    metadata     JSONB DEFAULT '{}',
    created_at   TIMESTAMP DEFAULT NOW()
);

-- ─── Indexes ───────────────────────────────────────────────────────────────

-- Core lookups
CREATE INDEX IF NOT EXISTS idx_class_members_class_id           ON class_members(class_id);
CREATE INDEX IF NOT EXISTS idx_class_members_user_id            ON class_members(user_id);
CREATE INDEX IF NOT EXISTS idx_videos_class_id                  ON videos(class_id);
CREATE INDEX IF NOT EXISTS idx_reels_class_id                   ON reels(class_id);
CREATE INDEX IF NOT EXISTS idx_modules_class_id                 ON modules(class_id);
CREATE INDEX IF NOT EXISTS idx_live_sessions_class_id           ON live_sessions(class_id);
CREATE INDEX IF NOT EXISTS idx_live_session_participants_sid    ON live_session_participants(session_id);

-- Soft deletes (partial indexes — only active rows)
CREATE INDEX IF NOT EXISTS idx_users_active    ON users(deleted_at)    WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_classes_active  ON classes(deleted_at)  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_videos_active   ON videos(deleted_at)   WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_reels_active    ON reels(deleted_at)    WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_notes_active    ON notes(deleted_at)    WHERE deleted_at IS NULL;

-- Notifications
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_unread  ON notifications(user_id, is_read) WHERE is_read = FALSE;

-- Class Access Requests (non-members asking to join)
CREATE TABLE IF NOT EXISTS class_access_requests (
    id           SERIAL PRIMARY KEY,
    class_id     INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    user_id      INTEGER NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
    status       VARCHAR(20) NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending', 'approved', 'declined')),
    resolved_at  TIMESTAMP,
    created_at   TIMESTAMP DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_access_requests_unique
    ON class_access_requests (class_id, user_id)
    WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_access_requests_class ON class_access_requests(class_id, status);

-- Attachments & Audit
CREATE INDEX IF NOT EXISTS idx_attachments_class_id ON attachments(class_id);
CREATE INDEX IF NOT EXISTS idx_audit_actor_id        ON audit_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_target          ON audit_logs(target_table, target_id);

-- Smart Muṣḥaf Notes
CREATE INDEX IF NOT EXISTS idx_notes_user_id    ON notes(user_id);
CREATE INDEX IF NOT EXISTS idx_notes_ayah_id    ON notes(ayah_id);
CREATE INDEX IF NOT EXISTS idx_notes_surah_id   ON notes(surah_id);
CREATE INDEX IF NOT EXISTS idx_notes_type       ON notes(type);
CREATE INDEX IF NOT EXISTS idx_notes_pinned     ON notes(user_id, is_pinned)  WHERE is_pinned = TRUE;
CREATE INDEX IF NOT EXISTS idx_notes_archived   ON notes(user_id, is_archived);
CREATE INDEX IF NOT EXISTS idx_notes_shared     ON notes(shared_class_id)     WHERE shared_class_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_notes_tags       ON notes USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_notes_fts        ON notes USING GIN(to_tsvector('arabic', note::text));
CREATE INDEX IF NOT EXISTS idx_note_feedback    ON note_feedback(note_id);

-- Quran cache tables
CREATE TABLE IF NOT EXISTS quran_surahs (
    number                    SMALLINT PRIMARY KEY CHECK (number BETWEEN 1 AND 114),
    name                      VARCHAR(255) NOT NULL,
    english_name              VARCHAR(255) NOT NULL,
    english_name_translation  VARCHAR(255),
    revelation_type           VARCHAR(32),
    number_of_ayahs           SMALLINT NOT NULL,
    created_at                TIMESTAMP DEFAULT NOW(),
    updated_at                TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS quran_ayahs (
    id             BIGSERIAL PRIMARY KEY,
    global_number  INTEGER UNIQUE,
    surah_number   SMALLINT NOT NULL REFERENCES quran_surahs(number) ON DELETE CASCADE,
    ayah_number    SMALLINT NOT NULL,
    text           TEXT NOT NULL,
    page           SMALLINT,
    juz            SMALLINT,
    hizb_quarter   SMALLINT,
    sajdah         BOOLEAN DEFAULT FALSE,
    bismillah      BOOLEAN DEFAULT FALSE,
    created_at     TIMESTAMP DEFAULT NOW(),
    updated_at     TIMESTAMP DEFAULT NOW(),
    UNIQUE(surah_number, ayah_number)
);

CREATE INDEX IF NOT EXISTS idx_quran_ayahs_surah_number ON quran_ayahs(surah_number, ayah_number);
CREATE INDEX IF NOT EXISTS idx_quran_ayahs_page         ON quran_ayahs(page, surah_number, ayah_number);
CREATE INDEX IF NOT EXISTS idx_quran_ayahs_juz          ON quran_ayahs(juz, surah_number, ayah_number);

-- Direct messages (global inbox)
CREATE TABLE IF NOT EXISTS direct_messages (
    id         BIGSERIAL PRIMARY KEY,
    from_user  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    to_user    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    message    TEXT NOT NULL,
    is_read    BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dm_pair_time
    ON direct_messages (LEAST(from_user, to_user), GREATEST(from_user, to_user), created_at DESC);
CREATE INDEX IF NOT EXISTS idx_dm_to_user_unread
    ON direct_messages (to_user, is_read, created_at DESC);

-- Class chat history
CREATE TABLE IF NOT EXISTS class_chat_messages (
    id         BIGSERIAL PRIMARY KEY,
    class_id   INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    message    TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_class_chat_messages_class_time
    ON class_chat_messages (class_id, created_at DESC);

-- Owner-managed feature access grants
CREATE TABLE IF NOT EXISTS user_feature_permissions (
    id          BIGSERIAL PRIMARY KEY,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    feature_key VARCHAR(64) NOT NULL,
    can_access  BOOLEAN NOT NULL DEFAULT TRUE,
    updated_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
    updated_at  TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id, feature_key)
);

CREATE INDEX IF NOT EXISTS idx_user_feature_permissions_user
    ON user_feature_permissions (user_id);
CREATE INDEX IF NOT EXISTS idx_user_feature_permissions_feature
    ON user_feature_permissions (feature_key);

-- Wipe safety snapshots and two-step requests
CREATE TABLE IF NOT EXISTS platform_wipe_backups (
    id         BIGSERIAL PRIMARY KEY,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    reason     TEXT NOT NULL,
    snapshot   JSONB NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

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

CREATE INDEX IF NOT EXISTS idx_owner_wipe_requests_owner
    ON owner_wipe_requests (owner_id, status);
CREATE INDEX IF NOT EXISTS idx_owner_wipe_requests_window
    ON owner_wipe_requests (execute_after, expires_at);
