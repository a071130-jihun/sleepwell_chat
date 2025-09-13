const http = require('http');
const app = require('./app');
const config = require('./config/env');

const server = http.createServer(app);

const port = config.port;

server.listen(port, () => {
  console.log(`[server] Listening on port ${port} (${config.nodeEnv})`);
});

// Graceful shutdown hooks
const shutdown = (signal) => {
  console.log(`[server] Received ${signal}, shutting down...`);
  server.close(() => {
    console.log('[server] Closed HTTP server');
    process.exit(0);
  });
  // Force exit after 5s
  setTimeout(() => process.exit(1), 5000).unref();
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// Safety net for unhandled errors
process.on('unhandledRejection', (err) => {
  console.error('[server] Unhandled Rejection:', err);
});
process.on('uncaughtException', (err) => {
  console.error('[server] Uncaught Exception:', err);
});

