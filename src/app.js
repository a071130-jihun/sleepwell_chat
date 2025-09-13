const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

const config = require('./config/env');
const routes = require('./routes');
const { notFound, errorHandler } = require('./middlewares/error');

const app = express();

// Security headers
app.use(helmet());

// Body parsing
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// CORS configuration
const allowAll = config.corsOrigins.includes('*');
const corsOptions = {
  origin: (origin, callback) => {
    if (!origin) return callback(null, true); // Mobile apps / curl have no origin
    if (allowAll || config.corsOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error('CORS not allowed for this origin'));
  },
  credentials: true,
};
app.use(cors(corsOptions));

// HTTP request logging
app.use(morgan(config.nodeEnv === 'production' ? 'combined' : 'dev'));

// Mount routes
app.use('/api/v1', routes);

// Health root for quick checks
app.get('/', (_req, res) => {
  res.json({ name: 'sleepwell_back', status: 'ok' });
});

// Error handling
app.use(notFound);
app.use(errorHandler);

module.exports = app;

