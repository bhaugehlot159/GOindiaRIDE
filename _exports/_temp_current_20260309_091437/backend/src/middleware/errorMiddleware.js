function notFoundHandler(req, res) {
  return res.status(404).json({ message: 'Route not found' });
}

function errorHandler(err, req, res, next) {
  if (res.headersSent) {
    return next(err);
  }

  const statusCode = Number(err.statusCode || err.status || 500);
  const isProd = process.env.NODE_ENV === 'production';
  const message = isProd ? 'Something went wrong' : (err.message || 'Unexpected error');

  return res.status(statusCode).json({
    message,
    code: err.code || 'ERR_GENERIC'
  });
}

module.exports = {
  notFoundHandler,
  errorHandler
};
