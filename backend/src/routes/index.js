const express = require('express');
const authRoutes = require('./authRoutes');
const userRoutes = require('./userRoutes');
const vehicleRoutes = require('./vehicleRoutes');
const datasetRoutes = require('./datasetRoutes');
const predictionRoutes = require('./predictionRoutes');
const notificationRoutes = require('./notificationRoutes');
const healthRoutes = require('./healthRoutes');

const router = express.Router();

router.use('/health', healthRoutes);
router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/vehicles', vehicleRoutes);
router.use('/datasets', datasetRoutes);
router.use('/predictions', predictionRoutes);
router.use('/notifications', notificationRoutes);

module.exports = router;
