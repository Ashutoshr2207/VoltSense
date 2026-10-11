const express = require('express');
const authRoutes = require('./authRoutes');
const userRoutes = require('./userRoutes');
const vehicleRoutes = require('./vehicleRoutes');
const datasetRoutes = require('./datasetRoutes');
const predictionRoutes = require('./predictionRoutes');
const notificationRoutes = require('./notificationRoutes');
const chargingRoutes = require('./chargingRoutes');
const healthRoutes = require('./healthRoutes');
const rateLimit = require('express-rate-limit');

const limiter = (windowMs, max) => (process.env.NODE_ENV === 'test'
  ? (req, res, next) => next()
  : rateLimit({ windowMs, max, standardHeaders: true, legacyHeaders: false,
      message: { success: false, error: { code: 'RATE_LIMITED', message: 'Too many requests. Please try again shortly.' } } }));

const anomalyRoutes = require('./anomalyRoutes');

const router = express.Router();

router.use('/health', healthRoutes);
router.use('/auth', limiter(15 * 60 * 1000, 50), authRoutes);
router.use('/users', userRoutes);
router.use('/vehicles', vehicleRoutes);
router.use('/vehicles', anomalyRoutes);
router.use('/datasets', datasetRoutes);
router.use('/predictions', predictionRoutes);
router.use('/notifications', notificationRoutes);
router.use('/charging-stations', limiter(60 * 1000, 30), chargingRoutes);

module.exports = router;
