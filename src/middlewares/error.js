// 404 handler
function notFound(req, res, next) {
  res.status(404).json({
    error: 'Not Found',
    path: req.originalUrl,
  });
}

// Centralized error handler
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const status = err.status || err.statusCode || 500;
  const payload = {
    error: status >= 500 ? 'Internal Server Error' : err.message || 'Error',
  };

  if (process.env.NODE_ENV !== 'production') {
    payload.details = err.details || undefined;
    payload.stack = err.stack;
  }

  // Basic logging
  // You can replace this with a proper logger later
  // Only log stack in non-production to avoid noisy logs
  if (status >= 500) {
    console.error(err);
  }

  res.status(status).json(payload);
}

module.exports = { notFound, errorHandler };

