const express = require('express');
const { listNearbyStations } = require('../controllers/chargingController');
const { requireAuth } = require('../middleware/authMiddleware');

const router = express.Router();

router.get('/', requireAuth, listNearbyStations);

module.exports = router;
