const express = require('express');
const { requireAuth } = require('../middleware/authMiddleware');
const { detectAnomalies, getProfile, VEHICLE_PROFILES } = require('../services/anomalyService');
const Dataset = require('../models/Dataset');
const Vehicle = require('../models/Vehicle');
const ApiResponse = require('../utils/apiResponse');
const ApiError = require('../utils/apiError');
const { validateVehicleId } = require('../validators/vehicleValidator');

const router = express.Router();

/**
 * GET /api/vehicles/:vehicleId/anomalies
 * Retrieves detected anomalies and telemetry health profile status
 */
router.get('/:vehicleId/anomalies', requireAuth, validateVehicleId, async (req, res, next) => {
  try {
    const vehicle = await Vehicle.findById(req.params.vehicleId);
    if (!vehicle) {
      throw ApiError.notFound('Vehicle not found');
    }

    if (vehicle.userId.toString() !== req.userId) {
      throw ApiError.forbidden('You do not have permission to access anomalies for this vehicle');
    }

    const profileId = 'generic_reference';
    const profile = getProfile(profileId);

    // Find the latest dataset that has anomaly analysis records
    const latestDataset = await Dataset.findOne({
      vehicleId: req.params.vehicleId,
      userId: req.userId,
      anomalies: { $ne: null },
    }).sort({ uploadedAt: -1 });

    let anomalyData = latestDataset && latestDataset.anomalies ? latestDataset.anomalies : null;

    if (latestDataset && latestDataset.storage?.rawUrl && (!anomalyData || profileId !== anomalyData.profileId)) {
      try {
        const csvParserService = require('../services/csvParserService');
        const buffer = await require('../services/storageService').readRaw(latestDataset.storage, vehicle.id);
        {
          const parsed = csvParserService.parseBuffer(buffer, { profileId });
          if (parsed && parsed.anomalies) {
            anomalyData = parsed.anomalies;
          }
        }
      } catch (e) {
        // Fallback to stored anomalies
      }
    }

    if (!anomalyData) {
      anomalyData = {
        profileId: profile.id,
        profileName: profile.displayName,
        totalRecordsAnalyzed: 0,
        unresolvedCount: 0,
        overallStatus: 'normal',
        severitySummary: { low: 0, medium: 0, high: 0, critical: 0 },
        groupedAnomalies: [],
        anomalies: [],
      };
    }

    return ApiResponse.success(res, {
      profile,
      availableProfiles: Object.values(VEHICLE_PROFILES).map((p) => ({
        id: p.id,
        displayName: p.displayName,
        voltageLimits: p.voltageLimits,
        tempLimitsC: p.tempLimitsC,
      })),
      datasetId: latestDataset ? latestDataset._id : null,
      datasetName: latestDataset ? latestDataset.originalFileName : null,
      analyzedAt: latestDataset ? latestDataset.uploadedAt : null,
      anomalyReport: anomalyData,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
