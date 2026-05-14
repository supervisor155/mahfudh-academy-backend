const auditService = require('../modules/audit/audit.service');

/**
 * Audit log middleware factory.
 * Wraps res.json to capture the response and log after it is sent.
 *
 * Usage:
 *   router.delete('/:id', auth, roles('manager'), auditLog('DELETE_CLASS', 'classes'), ctrl.deleteClass);
 */
module.exports = (action, target_table) => (req, res, next) => {
  const originalJson = res.json.bind(res);

  res.json = (body) => {
    const target_id = req.params.id ? parseInt(req.params.id) : (body?.id ?? null);
    auditService.log({
      actor_id:     req.user?.id,
      action,
      target_table,
      target_id,
      metadata: {
        method: req.method,
        path:   req.originalUrl,
        status: res.statusCode,
      },
    });
    return originalJson(body);
  };

  next();
};
