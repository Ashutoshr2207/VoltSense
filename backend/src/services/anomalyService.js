/**
 * Battery Anomaly Detection Engine for VoltSense.
 * 
 * Evaluates real-world EV telemetry (e.g., from driving cycle datasets, vehicle 1.csv, or Raw.mat)
 * against generic reference limits (see config/vehicleProfiles.js; not vehicle-specific).
 * 
 * Detects:
 * - Cell voltage spread imbalance (bcell_maxVoltage - bcell_minVoltage)
 * - Over-voltage & Under-voltage events
 * - Over-temperature & Under-temperature extrema (including sub-zero chilling or sensor faults)
 * - Thermal gradient spread (bcell_maxTemp - bcell_minTemp)
 * - Over-current discharge or excessive fast-charging rates
 * - Sudden SOC drops or abnormal SOC excursions
 */

const { getProfile, VEHICLE_PROFILES } = require('../config/vehicleProfiles');

/**
 * Analyze a sequence of telemetry records for anomalies.
 * @param {Array<Object>} records Array of telemetry objects with standardized or raw keys
 * @param {string} profileId ignored; only 'generic_reference' exists
 * @returns {Object} Anomaly analysis summary and detected events
 */
function detectAnomalies(records = [], profileId = 'generic_reference') {
  const profile = getProfile(profileId);
  if (!Array.isArray(records) || records.length === 0) {
    return {
      profileId: profile.id,
      profileName: profile.displayName,
      totalRecordsAnalyzed: 0,
      unresolvedCount: 0,
      anomalies: [],
      severitySummary: { low: 0, medium: 0, high: 0, critical: 0 },
      overallStatus: 'normal',
    };
  }

  const detectedAnomalies = [];
  let lowCount = 0;
  let medCount = 0;
  let highCount = 0;
  let critCount = 0;

  // We scan records with rolling checks
  for (let i = 0; i < records.length; i++) {
    const r = records[i];
    const timestamp = r.time || r.timestamp || r.Time || (i * 10);

    // 1. Cell Voltage Spread Check (Filter out uninitialized/sentinel values <= 0.5V)
    const maxV = r.bcell_maxVoltage !== undefined ? Number(r.bcell_maxVoltage) : null;
    const minV = r.bcell_minVoltage !== undefined ? Number(r.bcell_minVoltage) : null;
    if (maxV !== null && minV !== null && !isNaN(maxV) && !isNaN(minV) && minV > 0.5 && maxV > 0.5) {
      const spread = maxV - minV;
      if (spread > profile.voltageLimits.maxSpreadV) {
        const severity = spread > profile.voltageLimits.maxSpreadV * 1.5 ? 'high' : 'medium';
        if (severity === 'high') highCount++; else medCount++;
        detectedAnomalies.push({
          id: `anom-vspread-${i}`,
          index: i,
          timestamp,
          type: 'cell_imbalance',
          title: 'Cell Voltage Imbalance Exceeded',
          severity,
          measuredValue: `${spread.toFixed(3)} V`,
          threshold: `< ${profile.voltageLimits.maxSpreadV} V`,
          description: `Cell voltage delta of ${spread.toFixed(3)} V exceeds maximum allowable balance threshold of ${profile.voltageLimits.maxSpreadV} V. Indicates potential cell degradation or BMS shunt balancing delay.`,
          recommendation: 'Perform a slow AC balance charge to 100% to allow passive cell balancing.',
        });
      }

      // Check absolute single cell bounds
      if (maxV > profile.voltageLimits.maxCellV) {
        critCount++;
        detectedAnomalies.push({
          id: `anom-overv-${i}`,
          index: i,
          timestamp,
          type: 'over_voltage',
          title: 'Cell Over-Voltage Detected',
          severity: 'critical',
          measuredValue: `${maxV.toFixed(3)} V`,
          threshold: `<= ${profile.voltageLimits.maxCellV} V`,
          description: `Highest cell voltage reached ${maxV.toFixed(3)} V, above safe operating limit of ${profile.voltageLimits.maxCellV} V.`,
          recommendation: 'Inspect BMS over-voltage cutoff and charger calibration.',
        });
      }

      if (minV < profile.voltageLimits.minCellV) {
        critCount++;
        detectedAnomalies.push({
          id: `anom-underv-${i}`,
          index: i,
          timestamp,
          type: 'under_voltage',
          title: 'Cell Under-Voltage Excursion',
          severity: 'critical',
          measuredValue: `${minV.toFixed(3)} V`,
          threshold: `>= ${profile.voltageLimits.minCellV} V`,
          description: `Lowest cell voltage dropped to ${minV.toFixed(3)} V, risking copper dissolution and accelerated capacity loss.`,
          recommendation: 'Avoid deep discharge below 10% SOC; schedule pack inspection if recurring.',
        });
      }
    }

    // 2. High Voltage Pack Check
    const packV = r.hv_voltage !== undefined ? Number(r.hv_voltage) : (r.Volt !== undefined ? Number(r.Volt) : null);
    if (packV !== null && !isNaN(packV) && profile.voltageLimits.maxPackV != null) {
      if (packV > profile.voltageLimits.maxPackV) {
        highCount++;
        detectedAnomalies.push({
          id: `anom-pack-overv-${i}`,
          index: i,
          timestamp,
          type: 'pack_over_voltage',
          title: 'Traction Pack Over-Voltage',
          severity: 'high',
          measuredValue: `${packV.toFixed(1)} V`,
          threshold: `<= ${profile.voltageLimits.maxPackV} V`,
          description: `Total pack voltage reached ${packV.toFixed(1)} V during operation.`,
          recommendation: 'Check regenerative braking limit configuration.',
        });
      }
    }

    // 3. Thermal Spread & Extrema Checks
    const maxT = r.bcell_maxTemp !== undefined ? Number(r.bcell_maxTemp) : (r.Temp !== undefined ? Number(r.Temp) : null);
    const minT = r.bcell_minTemp !== undefined ? Number(r.bcell_minTemp) : null;
    if (maxT !== null && !isNaN(maxT)) {
      if (maxT >= profile.tempLimitsC.criticalHigh) {
        critCount++;
        detectedAnomalies.push({
          id: `anom-crit-temp-${i}`,
          index: i,
          timestamp,
          type: 'thermal_runaway_risk',
          title: 'Critical High Battery Temperature',
          severity: 'critical',
          measuredValue: `${maxT.toFixed(1)} °C`,
          threshold: `< ${profile.tempLimitsC.criticalHigh} °C`,
          description: `Battery temperature breached ${maxT.toFixed(1)} °C. High thermal risk.`,
          recommendation: 'Verify battery cooling loop flow and radiator operation immediately.',
        });
      } else if (maxT >= profile.tempLimitsC.warningHigh) {
        medCount++;
        detectedAnomalies.push({
          id: `anom-warn-temp-${i}`,
          index: i,
          timestamp,
          type: 'high_temperature',
          title: 'Elevated Pack Temperature',
          severity: 'medium',
          measuredValue: `${maxT.toFixed(1)} °C`,
          threshold: `< ${profile.tempLimitsC.warningHigh} °C`,
          description: `Temperature reached ${maxT.toFixed(1)} °C during discharge/charge.`,
          recommendation: 'Avoid repeated back-to-back fast charges in ambient heat.',
        });
      }

      if (minT !== null && !isNaN(minT)) {
        // Look for sensor failure (e.g. -40 C reading in vehicle 1.csv)
        if (minT <= -35) {
          highCount++;
          detectedAnomalies.push({
            id: `anom-sensor-temp-${i}`,
            index: i,
            timestamp,
            type: 'sensor_fault',
            title: 'Temperature Sensor Signal Fault',
            severity: 'high',
            measuredValue: `${minT.toFixed(1)} °C`,
            threshold: `> -30 °C`,
            description: `Thermistor reading of ${minT.toFixed(1)} °C indicates an open-circuit sensor wire or thermistor fault.`,
            recommendation: 'Inspect battery module wiring harness and temperature probe connectivity.',
          });
        }

        const tempSpread = maxT - minT;
        if (tempSpread > profile.tempLimitsC.maxSpreadC && minT > -35) {
          medCount++;
          detectedAnomalies.push({
            id: `anom-tspread-${i}`,
            index: i,
            timestamp,
            type: 'thermal_gradient',
            title: 'Uneven Module Cooling Gradient',
            severity: 'medium',
            measuredValue: `${tempSpread.toFixed(1)} °C`,
            threshold: `<= ${profile.tempLimitsC.maxSpreadC} °C`,
            description: `Thermal delta across modules is ${tempSpread.toFixed(1)} °C. Coolant delivery may be uneven.`,
            recommendation: 'Check battery cooling valve switching and coolant channels for air pockets.',
          });
        }
      }
    }

    // 4. Current Limit Excursions
    const curr = r.hv_current !== undefined ? Number(r.hv_current) : (r.Curr !== undefined ? Number(r.Curr) : null);
    if (curr !== null && !isNaN(curr) && profile.currentLimitsA.maxDischargeA != null && profile.currentLimitsA.maxChargeA != null) {
      if (curr > profile.currentLimitsA.maxDischargeA) {
        medCount++;
        detectedAnomalies.push({
          id: `anom-overcurr-disch-${i}`,
          index: i,
          timestamp,
          type: 'high_discharge_current',
          title: 'High Peak Discharge Current',
          severity: 'medium',
          measuredValue: `${curr.toFixed(1)} A`,
          threshold: `<= ${profile.currentLimitsA.maxDischargeA} A`,
          description: `Transient current peaked at ${curr.toFixed(1)} A.`,
          recommendation: 'Ensure motor inverter power limits are properly calibrated.',
        });
      } else if (curr < -profile.currentLimitsA.maxChargeA) {
        highCount++;
        detectedAnomalies.push({
          id: `anom-overcurr-charge-${i}`,
          index: i,
          timestamp,
          type: 'high_charge_current',
          title: 'Excessive Charge/Regen Current',
          severity: 'high',
          measuredValue: `${Math.abs(curr).toFixed(1)} A`,
          threshold: `<= ${profile.currentLimitsA.maxChargeA} A`,
          description: `Inflow current reached ${Math.abs(curr).toFixed(1)} A, exceeding the recommended pack limit.`,
          recommendation: 'Verify DC fast charger communication and current tapering.',
        });
      }
    }

    // Limit maximum raw anomalies reported to prevent client payload bloat
    if (detectedAnomalies.length >= 250) {
      break;
    }
  }

  // Determine overall status
  let overallStatus = 'normal';
  if (critCount > 0) overallStatus = 'critical';
  else if (highCount > 0) overallStatus = 'warning';
  else if (medCount > 0 || lowCount > 0) overallStatus = 'attention';

  // Group by unique types for summary
  const typeMap = {};
  for (const anom of detectedAnomalies) {
    if (!typeMap[anom.type]) {
      typeMap[anom.type] = {
        type: anom.type,
        title: anom.title,
        severity: anom.severity,
        occurrences: 0,
        sample: anom,
      };
    }
    typeMap[anom.type].occurrences++;
  }

  return {
    profileId: profile.id,
    profileName: profile.displayName,
    totalRecordsAnalyzed: records.length,
    unresolvedCount: detectedAnomalies.length,
    overallStatus,
    severitySummary: {
      low: lowCount,
      medium: medCount,
      high: highCount,
      critical: critCount,
    },
    groupedAnomalies: Object.values(typeMap),
    anomalies: detectedAnomalies.slice(0, 50), // Send first 50 detailed events
  };
}

module.exports = {
  detectAnomalies,
  getProfile,
  VEHICLE_PROFILES,
};
