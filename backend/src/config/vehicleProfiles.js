/**
 * Generic reference limits for VoltSense telemetry anomaly screening.
 *
 * IMPORTANT: these are NOT manufacturer or vehicle-specific limits and are NOT verified
 * against any real battery datasheet. They are generic Li-ion screening thresholds used only
 * to flag readings worth investigating. Vehicle-specific profiles (previous "Profile A-D")
 * were fabricated and have been removed. Current limits are intentionally null because no
 * applicable generic limit can be justified; current is therefore not flagged as a fault.
 */
const VEHICLE_PROFILES = {
  generic_reference: {
    id: 'generic_reference',
    displayName: 'Generic Li-ion reference limits (not vehicle-specific)',
    nominalPackVoltageV: null,
    voltageLimits: {
      minCellV: 2.8,
      maxCellV: 4.25,
      minPackV: null,
      maxPackV: null,
      maxSpreadV: 0.15,
    },
    tempLimitsC: {
      minOperating: -20,
      maxOperating: 55,
      warningHigh: 45,
      criticalHigh: 60,
      maxSpreadC: 8.0,
    },
    currentLimitsA: {
      maxDischargeA: null,
      maxChargeA: null,
    },
    socLimits: {
      minOperationalPct: 5,
      maxOperationalPct: 100,
    },
  },
};

function getProfile() {
  return VEHICLE_PROFILES.generic_reference;
}

module.exports = {
  VEHICLE_PROFILES,
  getProfile,
};
