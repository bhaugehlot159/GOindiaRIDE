function write(level, message, meta = {}) {
  const entry = JSON.stringify({
    time: new Date().toISOString(),
    level,
    message,
    ...meta
  });

  if (level === 'error') {
    process.stderr.write(`${entry}\n`);
  } else {
    process.stdout.write(`${entry}\n`);
  }
}

module.exports = {
  info: (message, meta) => write('info', message, meta),
  warn: (message, meta) => write('warn', message, meta),
  error: (message, meta) => write('error', message, meta)
};
