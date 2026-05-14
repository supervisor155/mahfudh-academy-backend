const WINDOW_MS = 10_000;
const MAX_EVENTS_PER_WINDOW = 100;
const MAX_VIOLATIONS = 4;
const MAX_MESSAGE_CHARS = 2000;
const auditService = require('../modules/audit/audit.service');
const {
  upsertSocketBan,
  notifyOwnersSecurityAlert,
  enforceChatRestrictionIfNeeded,
  createSecurityTicket,
} = require('../modules/security/security.service');

function getSocketIp(socket) {
  return socket.handshake?.address || socket.conn?.remoteAddress || 'unknown';
}

const MESSAGE_EVENTS = new Set([
  'chat:send',
  'chat:dm:send',
  'session:chat:send',
]);

module.exports = function attachSocketTrafficGuard(socket) {
  const eventTimes = [];
  let violations = 0;

  socket.use((packet, next) => {
    const [eventName, payload] = packet;
    const now = Date.now();
    while (eventTimes.length && now - eventTimes[0] > WINDOW_MS) {
      eventTimes.shift();
    }

    eventTimes.push(now);
    if (eventTimes.length > MAX_EVENTS_PER_WINDOW) {
      violations += 1;
      auditService.log({
        actor_id: socket.user?.id || null,
        action: 'socket_rate_limited',
        target_table: 'sockets',
        target_id: null,
        metadata: { event: eventName || 'unknown', violations, user_id: socket.user?.id || null },
      });
      socket.emit('system:rate_limited', { message: 'Too many realtime events. Slow down and retry.' });
      if (violations >= MAX_VIOLATIONS) {
        upsertSocketBan({
          userId: socket.user?.id || null,
          ipAddress: getSocketIp(socket),
          reason: 'event_flood',
          violations,
        }).catch(() => null);
        enforceChatRestrictionIfNeeded({
          userId: socket.user?.id || null,
          ipAddress: getSocketIp(socket),
          triggerReason: 'event_flood',
        }).catch(() => null);
        createSecurityTicket({
          actorId: socket.user?.id || null,
          category: 'socket_abuse_ban',
          severity: 'high',
          title: 'Temporary socket ban triggered by event flood',
          details: { user_id: socket.user?.id || null, ip: getSocketIp(socket), violations },
        }).catch(() => null);
        notifyOwnersSecurityAlert({
          message: 'Socket abuse protection triggered a temporary ban.',
          payload: {
            user_id: socket.user?.id || null,
            ip: getSocketIp(socket),
            reason: 'event_flood',
            violations,
          },
          type: 'security_socket_ban',
        }).catch(() => null);
        socket.disconnect(true);
      }
      return next(new Error('rate_limit_exceeded'));
    }

    if (MESSAGE_EVENTS.has(eventName)) {
      const text = String(payload?.message || '');
      if (text.length > MAX_MESSAGE_CHARS) {
        violations += 1;
        auditService.log({
          actor_id: socket.user?.id || null,
          action: 'socket_rate_limited',
          target_table: 'sockets',
          target_id: null,
          metadata: { event: eventName, reason: 'message_too_long', length: text.length, violations, user_id: socket.user?.id || null },
        });
        socket.emit('system:invalid_payload', { message: 'Message too long.' });
        if (violations >= MAX_VIOLATIONS) {
          upsertSocketBan({
            userId: socket.user?.id || null,
            ipAddress: getSocketIp(socket),
            reason: 'oversized_message_payload',
            violations,
          }).catch(() => null);
          enforceChatRestrictionIfNeeded({
            userId: socket.user?.id || null,
            ipAddress: getSocketIp(socket),
            triggerReason: 'oversized_message_payload',
          }).catch(() => null);
          createSecurityTicket({
            actorId: socket.user?.id || null,
            category: 'socket_abuse_ban',
            severity: 'high',
            title: 'Temporary socket ban triggered by oversized message payload abuse',
            details: { user_id: socket.user?.id || null, ip: getSocketIp(socket), violations, length: text.length },
          }).catch(() => null);
          notifyOwnersSecurityAlert({
            message: 'Socket abuse protection blocked repeated oversized messages.',
            payload: {
              user_id: socket.user?.id || null,
              ip: getSocketIp(socket),
              reason: 'oversized_message_payload',
              violations,
            },
            type: 'security_socket_ban',
          }).catch(() => null);
          socket.disconnect(true);
        }
        return next(new Error('message_too_long'));
      }
    }

    return next();
  });
};
