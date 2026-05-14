const db = require('../../db');

exports.getUserByEmail = async (email) => {
  const { rows } = await db.query(
    'SELECT * FROM users WHERE email = $1 AND deleted_at IS NULL',
    [email]
  );
  return rows[0];
};

exports.getUserByPhone = async (phoneNumber) => {
  const { rows } = await db.query(
    'SELECT * FROM users WHERE phone_number = $1 AND deleted_at IS NULL',
    [phoneNumber]
  );
  return rows[0];
};

exports.getLoginGuard = async ({ email, ip }) => {
  const { rows } = await db.query(
    `SELECT email, ip_address, failed_count, lock_until, last_failed_at
     FROM login_security_events
     WHERE email = $1 AND ip_address = $2
     LIMIT 1`,
    [email, ip]
  );
  return rows[0];
};

exports.recordFailedLogin = async ({ email, ip, maxFailures, lockMinutes }) => {
  const { rows } = await db.query(
    `INSERT INTO login_security_events (email, ip_address, failed_count, last_failed_at, lock_until)
     VALUES ($1, $2, 1, NOW(), NULL)
     ON CONFLICT (email, ip_address)
     DO UPDATE SET
       failed_count = login_security_events.failed_count + 1,
       last_failed_at = NOW(),
       lock_until = CASE
         WHEN (login_security_events.failed_count + 1) >= $3
         THEN NOW() + make_interval(mins => $4::int)
         ELSE login_security_events.lock_until
       END,
       updated_at = NOW()
     RETURNING email, ip_address, failed_count, lock_until, last_failed_at`,
    [email, ip, maxFailures, lockMinutes]
  );
  return rows[0];
};

exports.clearLoginGuard = async ({ email, ip }) => {
  await db.query(
    `DELETE FROM login_security_events
     WHERE email = $1 AND ip_address = $2`,
    [email, ip]
  );
};

exports.getLoginGuardStats = async () => {
  const [{ rows: lockedRows }, { rows: trackedRows }] = await Promise.all([
    db.query(
      `SELECT COUNT(*)::int AS total
       FROM login_security_events
       WHERE lock_until IS NOT NULL AND lock_until > NOW()`
    ),
    db.query(
      `SELECT COUNT(*)::int AS total
       FROM login_security_events`
    ),
  ]);

  return {
    locked_now: lockedRows[0]?.total || 0,
    tracked_entries: trackedRows[0]?.total || 0,
  };
};

exports.getRecentSecurityEvents = async ({ hours = 24, limit = 50 } = {}) => {
  const { rows } = await db.query(
    `SELECT id, action, target_table, target_id, metadata, created_at, actor_id
     FROM audit_logs
     WHERE action IN ('rate_limit_hit', 'socket_rate_limited', 'login_failed', 'login_locked', 'security_ticket')
       AND created_at >= NOW() - ($1::int * INTERVAL '1 hour')
     ORDER BY created_at DESC
     LIMIT $2`,
    [hours, limit]
  );
  return rows;
};

exports.getOpenSecurityTickets = async ({ limit = 20 } = {}) => {
  const { rows } = await db.query(
    `SELECT id, action, target_table, target_id, metadata, created_at, actor_id
     FROM audit_logs
     WHERE action = 'security_ticket'
       AND COALESCE(metadata->>'status', 'open') = 'open'
     ORDER BY created_at DESC
     LIMIT $1`,
    [limit]
  );
  return rows;
};

exports.createUser = async ({ email, password_hash, name, role, phone_number = null, google_sub = null }) => {
  const { rows } = await db.query(
    `INSERT INTO users (email, password_hash, name, role, phone_number, google_sub)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [email, password_hash, name, role, phone_number, google_sub]
  );
  return rows[0];
};

exports.createOtpChallenge = async ({ channel, target, purpose, codeHash, expiresAt, metadata = {} }) => {
  const { rows } = await db.query(
    `INSERT INTO otp_challenges (channel, target, purpose, code_hash, expires_at, metadata)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, channel, target, purpose, expires_at, attempts, created_at`,
    [channel, target, purpose, codeHash, expiresAt, JSON.stringify(metadata)]
  );
  return rows[0];
};

exports.getLatestActiveOtpChallenge = async ({ channel, target, purpose }) => {
  const { rows } = await db.query(
    `SELECT id, channel, target, purpose, code_hash, expires_at, attempts, created_at
     FROM otp_challenges
     WHERE channel = $1
       AND target = $2
       AND purpose = $3
       AND consumed_at IS NULL
       AND expires_at > NOW()
     ORDER BY created_at DESC
     LIMIT 1`,
    [channel, target, purpose]
  );
  return rows[0];
};

exports.countRecentOtpChallenges = async ({ channel, target, purpose, seconds = 60 }) => {
  const { rows } = await db.query(
    `SELECT COUNT(*)::int AS total
     FROM otp_challenges
     WHERE channel = $1
       AND target = $2
       AND purpose = $3
       AND created_at >= NOW() - ($4::int * INTERVAL '1 second')`,
    [channel, target, purpose, seconds]
  );
  return rows[0]?.total || 0;
};

exports.incrementOtpAttempt = async (challengeId) => {
  const { rows } = await db.query(
    `UPDATE otp_challenges
     SET attempts = attempts + 1
     WHERE id = $1
     RETURNING id, attempts`,
    [challengeId]
  );
  return rows[0];
};

exports.consumeOtpChallenge = async (challengeId) => {
  await db.query(
    `UPDATE otp_challenges
     SET consumed_at = NOW()
     WHERE id = $1`,
    [challengeId]
  );
};

exports.getUserById = async (id) => {
  const { rows } = await db.query(
    'SELECT id, name, email, role, deleted_at, session_version FROM users WHERE id = $1',
    [id]
  );
  return rows[0];
};

exports.bumpUserSessionVersion = async (userId) => {
  const { rows } = await db.query(
    `UPDATE users
     SET session_version = session_version + 1, updated_at = NOW()
     WHERE id = $1
     RETURNING id, session_version`,
    [userId]
  );
  return rows[0];
};

exports.createRefreshToken = async ({ userId, tokenHash, expiresAt, userAgent, ipAddress }) => {
  const { rows } = await db.query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at, user_agent, ip_address)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, user_id, token_hash, issued_at, expires_at, revoked_at, replaced_by`,
    [userId, tokenHash, expiresAt, userAgent || null, ipAddress || null]
  );
  return rows[0];
};

exports.getActiveRefreshTokenByHash = async (tokenHash) => {
  const { rows } = await db.query(
    `SELECT *
     FROM refresh_tokens
     WHERE token_hash = $1
       AND revoked_at IS NULL
       AND expires_at > NOW()
     LIMIT 1`,
    [tokenHash]
  );
  return rows[0];
};

exports.revokeRefreshToken = async ({ tokenHash, replacedBy = null }) => {
  const { rows } = await db.query(
    `UPDATE refresh_tokens
     SET revoked_at = NOW(), replaced_by = COALESCE($2, replaced_by)
     WHERE token_hash = $1 AND revoked_at IS NULL
     RETURNING id, user_id`,
    [tokenHash, replacedBy]
  );
  return rows[0];
};

exports.revokeAllRefreshTokensForUser = async (userId) => {
  await db.query(
    `UPDATE refresh_tokens
     SET revoked_at = NOW()
     WHERE user_id = $1 AND revoked_at IS NULL`,
    [userId]
  );
};

exports.getUserPasswordHash = async (id) => {
  const { rows } = await db.query(
    'SELECT id, password_hash FROM users WHERE id = $1 AND deleted_at IS NULL LIMIT 1',
    [id]
  );
  return rows[0];
};

exports.updateUserRole = async (userId, role) => {
  const { rows } = await db.query(
    `UPDATE users
     SET role = $1, updated_at = NOW()
     WHERE id = $2 AND deleted_at IS NULL
     RETURNING id, name, email, role, created_at`,
    [role, userId]
  );
  return rows[0];
};

exports.softDeleteUser = async (userId) => {
  const { rows } = await db.query(
    `UPDATE users
     SET deleted_at = NOW(), updated_at = NOW()
     WHERE id = $1 AND deleted_at IS NULL
     RETURNING id, name, email, role`,
    [userId]
  );
  return rows[0];
};

exports.getFeaturePermissions = async (userId) => {
  const { rows } = await db.query(
    `SELECT feature_key, can_access, updated_at
     FROM user_feature_permissions
     WHERE user_id = $1
     ORDER BY feature_key ASC`,
    [userId]
  );
  return rows;
};

exports.upsertFeaturePermissions = async (userId, permissions, updatedBy) => {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    const results = [];
    for (const p of permissions) {
      const { rows } = await client.query(
        `INSERT INTO user_feature_permissions (user_id, feature_key, can_access, updated_by)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (user_id, feature_key)
         DO UPDATE SET can_access = EXCLUDED.can_access, updated_by = EXCLUDED.updated_by, updated_at = NOW()
         RETURNING feature_key, can_access, updated_at`,
        [userId, p.feature_key, !!p.can_access, updatedBy]
      );
      results.push(rows[0]);
    }

    await client.query('COMMIT');
    return results;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

exports.createWipeBackupSnapshot = async ({ ownerId, reason }) => {
  const countTables = [
    'classes',
    'class_members',
    'videos',
    'reels',
    'assignments',
    'announcements',
    'attachments',
    'live_sessions',
    'notes',
    'direct_messages',
    'class_chat_messages',
    'audit_logs',
  ];

  const counts = {};
  for (const table of countTables) {
    const { rows } = await db.query(`SELECT COUNT(*)::int AS total FROM ${table}`);
    counts[table] = rows[0]?.total || 0;
  }

  const { rows: usersPreview } = await db.query(
    `SELECT id, name, email, role
     FROM users
     WHERE deleted_at IS NULL
     ORDER BY id ASC
     LIMIT 50`
  );
  const { rows: classesPreview } = await db.query(
    `SELECT id, name, created_by, created_at
     FROM classes
     WHERE deleted_at IS NULL
     ORDER BY id ASC
     LIMIT 50`
  );

  const snapshot = {
    generated_at: new Date().toISOString(),
    reason,
    counts,
    users_preview: usersPreview,
    classes_preview: classesPreview,
  };

  const { rows } = await db.query(
    `INSERT INTO platform_wipe_backups (created_by, reason, snapshot)
     VALUES ($1, $2, $3)
     RETURNING id, created_at, snapshot`,
    [ownerId, reason, JSON.stringify(snapshot)]
  );

  return rows[0];
};

exports.createWipeRequest = async ({ ownerId, tokenHash, reason, backupId, executeAfter, expiresAt }) => {
  const { rows } = await db.query(
    `INSERT INTO owner_wipe_requests (owner_id, token_hash, reason, backup_id, execute_after, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, owner_id, reason, backup_id, execute_after, expires_at, status, created_at`,
    [ownerId, tokenHash, reason, backupId, executeAfter, expiresAt]
  );
  return rows[0];
};

exports.getWipeRequestById = async (requestId, ownerId) => {
  const { rows } = await db.query(
    `SELECT *
     FROM owner_wipe_requests
     WHERE id = $1 AND owner_id = $2
     LIMIT 1`,
    [requestId, ownerId]
  );
  return rows[0];
};

exports.markWipeRequestCompleted = async (requestId) => {
  await db.query(
    `UPDATE owner_wipe_requests
     SET status = 'completed', used_at = NOW()
     WHERE id = $1`,
    [requestId]
  );
};

exports.listOwnerActions = async ({ limit = 100, offset = 0 }) => {
  const { rows } = await db.query(
    `SELECT al.id, al.action, al.target_table, al.target_id, al.metadata, al.created_at,
            u.name AS actor_name, u.email AS actor_email
     FROM audit_logs al
     LEFT JOIN users u ON u.id = al.actor_id
     WHERE al.action IN ('role_change', 'permissions_update', 'delete', 'platform_wipe_prepare', 'platform_wipe')
       AND (u.role = 'owner' OR al.action IN ('platform_wipe_prepare', 'platform_wipe'))
     ORDER BY al.created_at DESC
     LIMIT $1 OFFSET $2`,
    [Number(limit), Number(offset)]
  );

  return rows;
};

exports.wipePlatformData = async ({ ownerId, keepOtherOwners = true }) => {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    await client.query('DELETE FROM notifications WHERE true');
    await client.query('DELETE FROM note_feedback WHERE true');
    await client.query('DELETE FROM notes WHERE true');
    await client.query('DELETE FROM live_session_participants WHERE true');
    await client.query('DELETE FROM live_sessions WHERE true');
    await client.query('DELETE FROM assignment_submissions WHERE true');
    await client.query('DELETE FROM assignments WHERE true');
    await client.query('DELETE FROM announcements WHERE true');
    await client.query('DELETE FROM attachments WHERE true');
    await client.query('DELETE FROM modules WHERE true');
    await client.query('DELETE FROM video_views WHERE true');
    await client.query('DELETE FROM videos WHERE true');
    await client.query('DELETE FROM reel_views WHERE true');
    await client.query('DELETE FROM reels WHERE true');
    await client.query('DELETE FROM class_members WHERE true');
    await client.query('DELETE FROM class_access_requests WHERE true');
    await client.query('DELETE FROM class_chat_messages WHERE true');
    await client.query('DELETE FROM direct_messages WHERE true');
    await client.query('DELETE FROM classes WHERE true');
    await client.query('DELETE FROM user_feature_permissions WHERE true');

    if (keepOtherOwners) {
      await client.query(
        `UPDATE users
         SET deleted_at = NOW(), updated_at = NOW()
         WHERE id <> $1 AND role <> 'owner' AND deleted_at IS NULL`,
        [ownerId]
      );
    } else {
      await client.query(
        `UPDATE users
         SET deleted_at = NOW(), updated_at = NOW()
         WHERE id <> $1 AND deleted_at IS NULL`,
        [ownerId]
      );
    }

    await client.query('DELETE FROM audit_logs WHERE true');

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};
