const db = require('../../db');
const notificationsService = require('../notifications/notifications.service');

const DEFAULT_BAN_MINUTES = Number(process.env.SOCKET_BAN_MINUTES || 15);
const CHAT_RESTRICT_THRESHOLD = Number(process.env.CHAT_RESTRICT_THRESHOLD || 3);
const CHAT_RESTRICT_MINUTES = Number(process.env.CHAT_RESTRICT_MINUTES || 1440);

async function getOwnerIds() {
  const { rows } = await db.query(
    `SELECT id
     FROM users
     WHERE role = 'owner' AND deleted_at IS NULL`
  );
  return rows.map((r) => r.id);
}

async function notifyOwnersSecurityAlert({ message, payload = {}, type = 'security_alert' }) {
  const ownerIds = await getOwnerIds();
  if (!ownerIds.length) return 0;

  await Promise.all(
    ownerIds.map((ownerId) =>
      notificationsService
        .createNotification({
          user_id: ownerId,
          type,
          message,
          payload,
        })
        .catch(() => null)
    )
  );

  return ownerIds.length;
}

async function createSecurityTicket({
  actorId = null,
  category = 'security_incident',
  severity = 'high',
  title,
  details = {},
}) {
  const metadata = {
    category,
    severity,
    status: 'open',
    title: title || 'Security incident detected',
    details,
    created_at: new Date().toISOString(),
  };

  const { rows } = await db.query(
    `INSERT INTO audit_logs (actor_id, action, target_table, target_id, metadata)
     VALUES ($1, 'security_ticket', 'security_tickets', NULL, $2)
     RETURNING id, created_at, metadata`,
    [actorId, JSON.stringify(metadata)]
  );

  return rows[0];
}

async function listSecurityTickets({ status = 'all', limit = 50, offset = 0 } = {}) {
  const params = [];
  let where = `WHERE action = 'security_ticket'`;

  if (status && status !== 'all') {
    params.push(status);
    where += ` AND COALESCE(metadata->>'status', 'open') = $${params.length}`;
  }

  params.push(Number(limit), Number(offset));
  const { rows } = await db.query(
    `SELECT al.id, al.actor_id, al.action, al.target_table, al.target_id, al.metadata, al.created_at,
            u.name AS actor_name
     FROM audit_logs al
     LEFT JOIN users u ON u.id = al.actor_id
     ${where}
     ORDER BY al.created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  return rows;
}

async function updateSecurityTicketStatus({ ticketId, status, ownerId, note }) {
  const { rows } = await db.query(
    `SELECT id, metadata
     FROM audit_logs
     WHERE id = $1 AND action = 'security_ticket'
     LIMIT 1`,
    [ticketId]
  );

  const existing = rows[0];
  if (!existing) return null;

  const metadata = (existing.metadata && typeof existing.metadata === 'object') ? existing.metadata : {};
  const nextStatus = status || metadata.status || 'open';
  const nextMetadata = {
    ...metadata,
    status: nextStatus,
    status_updated_at: new Date().toISOString(),
    status_updated_by: ownerId,
  };

  if (note) nextMetadata.status_note = note;
  if (nextStatus === 'resolved') {
    nextMetadata.resolved_at = new Date().toISOString();
    nextMetadata.resolved_by = ownerId;
  }

  const { rows: updatedRows } = await db.query(
    `UPDATE audit_logs
     SET metadata = $1::jsonb
     WHERE id = $2
     RETURNING id, actor_id, action, target_table, target_id, metadata, created_at`,
    [JSON.stringify(nextMetadata), ticketId]
  );

  return updatedRows[0];
}

async function updateSecurityTicketDetails({
  ticketId,
  ownerId,
  status,
  note,
  assigneeId,
  dueAt,
  severity,
  tags,
}) {
  const { rows } = await db.query(
    `SELECT id, metadata
     FROM audit_logs
     WHERE id = $1 AND action = 'security_ticket'
     LIMIT 1`,
    [ticketId]
  );

  const existing = rows[0];
  if (!existing) return null;

  const metadata = (existing.metadata && typeof existing.metadata === 'object') ? existing.metadata : {};
  const nextStatus = status || metadata.status || 'open';
  const nextMetadata = {
    ...metadata,
    status: nextStatus,
    status_updated_at: new Date().toISOString(),
    status_updated_by: ownerId,
  };

  if (typeof note === 'string') nextMetadata.status_note = note || null;
  if (assigneeId === null) nextMetadata.assignee_id = null;
  else if (assigneeId !== undefined) nextMetadata.assignee_id = assigneeId;
  if (dueAt === null) nextMetadata.due_at = null;
  else if (dueAt !== undefined) nextMetadata.due_at = dueAt;
  if (severity) nextMetadata.severity = severity;
  if (Array.isArray(tags)) nextMetadata.tags = tags;

  if (nextStatus === 'resolved' && !nextMetadata.resolved_at) {
    nextMetadata.resolved_at = new Date().toISOString();
    nextMetadata.resolved_by = ownerId;
  }

  const { rows: updatedRows } = await db.query(
    `UPDATE audit_logs
     SET metadata = $1::jsonb
     WHERE id = $2
     RETURNING id, actor_id, action, target_table, target_id, metadata, created_at`,
    [JSON.stringify(nextMetadata), ticketId]
  );

  return updatedRows[0];
}

async function getActiveSocketBan({ userId, ipAddress }) {
  const { rows } = await db.query(
    `SELECT id, user_id, ip_address, reason, violations, banned_until
     FROM socket_security_bans
     WHERE (user_id = $1 OR ip_address = $2)
       AND banned_until > NOW()
     ORDER BY banned_until DESC
     LIMIT 1`,
    [userId || null, ipAddress || null]
  );

  return rows[0] || null;
}

async function upsertSocketBan({ userId, ipAddress, reason, violations, banMinutes = DEFAULT_BAN_MINUTES }) {
  const { rows } = await db.query(
    `INSERT INTO socket_security_bans (user_id, ip_address, reason, violations, banned_until, created_at, updated_at)
     VALUES ($1, $2, $3, $4, NOW() + make_interval(mins => $5::int), NOW(), NOW())
     ON CONFLICT (user_id, ip_address)
     DO UPDATE SET
       reason = EXCLUDED.reason,
       violations = EXCLUDED.violations,
       banned_until = EXCLUDED.banned_until,
       updated_at = NOW()
     RETURNING id, user_id, ip_address, reason, violations, banned_until`,
    [userId || null, ipAddress || null, reason, violations || 1, banMinutes]
  );

  return rows[0];
}

async function countRecentSocketBans({ userId, hours = 24 }) {
  if (!userId) return 0;
  const { rows } = await db.query(
    `SELECT COUNT(*)::int AS total
     FROM socket_security_bans
     WHERE user_id = $1
       AND created_at >= NOW() - ($2::int * INTERVAL '1 hour')`,
    [userId, hours]
  );
  return rows[0]?.total || 0;
}

async function upsertChatRestriction({ userId, reason, minutes = CHAT_RESTRICT_MINUTES }) {
  const { rows } = await db.query(
    `INSERT INTO chat_security_restrictions (user_id, reason, muted_until, created_at, updated_at)
     VALUES ($1, $2, NOW() + make_interval(mins => $3::int), NOW(), NOW())
     ON CONFLICT (user_id)
     DO UPDATE SET
       reason = EXCLUDED.reason,
       muted_until = EXCLUDED.muted_until,
       updated_at = NOW()
     RETURNING id, user_id, reason, muted_until`,
    [userId, reason, minutes]
  );
  return rows[0];
}

async function getActiveChatRestriction(userId) {
  if (!userId) return null;
  const { rows } = await db.query(
    `SELECT id, user_id, reason, muted_until
     FROM chat_security_restrictions
     WHERE user_id = $1 AND muted_until > NOW()
     LIMIT 1`,
    [userId]
  );
  return rows[0] || null;
}

async function enforceChatRestrictionIfNeeded({ userId, ipAddress, triggerReason }) {
  if (!userId) return null;

  const recentBanCount = await countRecentSocketBans({ userId, hours: 24 });
  if (recentBanCount < CHAT_RESTRICT_THRESHOLD) return null;

  const restriction = await upsertChatRestriction({
    userId,
    reason: triggerReason || 'repeat_socket_abuse',
    minutes: CHAT_RESTRICT_MINUTES,
  });

  await notifyOwnersSecurityAlert({
    message: 'Chat sending was temporarily disabled for a user due to repeated abuse signals.',
    payload: {
      user_id: userId,
      ip: ipAddress || null,
      reason: triggerReason || 'repeat_socket_abuse',
      muted_until: restriction?.muted_until || null,
      recent_bans_24h: recentBanCount,
    },
    type: 'security_chat_restriction',
  }).catch(() => null);

  await createSecurityTicket({
    actorId: userId,
    category: 'chat_abuse_auto_restriction',
    severity: 'high',
    title: 'Auto chat restriction applied after repeated socket abuse',
    details: {
      user_id: userId,
      ip: ipAddress || null,
      reason: triggerReason || 'repeat_socket_abuse',
      muted_until: restriction?.muted_until || null,
      recent_bans_24h: recentBanCount,
    },
  }).catch(() => null);

  return restriction;
}

async function getSocketBanStats() {
  const { rows } = await db.query(
    `SELECT
      (SELECT COUNT(*)::int FROM socket_security_bans WHERE banned_until > NOW()) AS active_bans,
      (SELECT COUNT(*)::int FROM chat_security_restrictions WHERE muted_until > NOW()) AS active_chat_restrictions`
  );
  return {
    active_bans: rows[0]?.active_bans || 0,
    active_chat_restrictions: rows[0]?.active_chat_restrictions || 0,
  };
}

async function cleanupSecurityArtifacts({
  lockoutRetentionDays = Number(process.env.SECURITY_LOCKOUT_RETENTION_DAYS || 30),
  noisyAuditRetentionDays = Number(process.env.SECURITY_AUDIT_RETENTION_DAYS || 90),
  banRetentionDays = Number(process.env.SECURITY_BAN_RETENTION_DAYS || 30),
  restrictionRetentionDays = Number(process.env.SECURITY_RESTRICTION_RETENTION_DAYS || 30),
} = {}) {
  const [{ rowCount: lockoutsCleared }, { rowCount: noisyAuditCleared }, { rowCount: bansCleared }, { rowCount: restrictionsCleared }] = await Promise.all([
    db.query(
      `DELETE FROM login_security_events
       WHERE (lock_until IS NULL AND last_failed_at < NOW() - ($1::int * INTERVAL '1 day'))
          OR (lock_until IS NOT NULL AND lock_until < NOW() - ($1::int * INTERVAL '1 day'))`,
      [lockoutRetentionDays]
    ),
    db.query(
      `DELETE FROM audit_logs
       WHERE action IN ('rate_limit_hit', 'socket_rate_limited', 'login_failed')
         AND created_at < NOW() - ($1::int * INTERVAL '1 day')`,
      [noisyAuditRetentionDays]
    ),
    db.query(
      `DELETE FROM socket_security_bans
       WHERE banned_until < NOW() - ($1::int * INTERVAL '1 day')`,
      [banRetentionDays]
    ),
    db.query(
      `DELETE FROM chat_security_restrictions
       WHERE muted_until < NOW() - ($1::int * INTERVAL '1 day')`,
      [restrictionRetentionDays]
    ),
  ]);

  return {
    lockoutsCleared,
    noisyAuditCleared,
    bansCleared,
    restrictionsCleared,
    runAt: new Date().toISOString(),
  };
}

function startSecurityMaintenanceJob() {
  const intervalMs = Number(process.env.SECURITY_CLEANUP_INTERVAL_MS || 6 * 60 * 60 * 1000);

  cleanupSecurityArtifacts().catch(() => null);
  const timer = setInterval(() => {
    cleanupSecurityArtifacts().catch(() => null);
  }, intervalMs);

  return timer;
}

module.exports = {
  notifyOwnersSecurityAlert,
  createSecurityTicket,
  listSecurityTickets,
  updateSecurityTicketStatus,
  updateSecurityTicketDetails,
  getActiveSocketBan,
  upsertSocketBan,
  getActiveChatRestriction,
  enforceChatRestrictionIfNeeded,
  getSocketBanStats,
  cleanupSecurityArtifacts,
  startSecurityMaintenanceJob,
};
