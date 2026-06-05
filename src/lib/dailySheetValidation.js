// Client-side validation for the daily production sheet.
//
// Mirrors the dashboard's hard/warn rules (timberloop-dashboard
// src/lib/dailySheetFields.ts → validate) so biochar-os and the dashboard
// block/allow exactly the same values. HARD issues block the save with a
// friendly message before any DB write (the DB CHECK constraints added in
// the physical_range_checks migration are the structural backstop); WARN
// issues are surfaced but never block — matching the dashboard, which lets
// you save an end>start or an out-of-range temperature.
//
// Keep this in lockstep with the dashboard rules. If one side changes a
// threshold or a hard/warn severity, change the other too.

// Treat '' / null / undefined as "not entered" — those skip validation.
function entered(v) {
  return v !== '' && v !== null && v !== undefined
}

export function validateDailySheet(values) {
  const issues = []

  const moisture = values.feedstock_moisture_pct
  if (entered(moisture) && (Number(moisture) < 0 || Number(moisture) > 100)) {
    issues.push({
      field: 'feedstock_moisture_pct',
      severity: 'hard',
      message: 'Moisture must be between 0 and 100%.',
    })
  }

  const nonNeg = [
    ['feedstock_start_weight_t', 'Start weight'],
    ['feedstock_end_weight_t', 'End weight'],
    ['runtime_hours', 'Runtime'],
    ['downtime_hours', 'Downtime'],
    ['diesel_litres', 'Diesel'],
    ['avg_pyrolysis_temp_c', 'Avg pyrolysis temp'],
    ['max_pyrolysis_temp_c', 'Max pyrolysis temp'],
    ['avg_exhaust_temp_c', 'Avg exhaust temp'],
    ['thermal_output_kwh', 'Thermal output'],
  ]
  for (const [field, label] of nonNeg) {
    const v = values[field]
    if (entered(v) && Number(v) < 0) {
      issues.push({ field, severity: 'hard', message: `${label} cannot be negative.` })
    }
  }

  const start = values.feedstock_start_weight_t
  const end = values.feedstock_end_weight_t
  if (entered(start) && entered(end) && Number(end) > Number(start)) {
    issues.push({
      field: 'feedstock_end_weight_t',
      severity: 'warn',
      message: 'End weight is greater than start weight.',
    })
  }

  for (const f of ['avg_pyrolysis_temp_c', 'max_pyrolysis_temp_c', 'avg_exhaust_temp_c']) {
    const v = values[f]
    if (entered(v) && Number(v) > 1000) {
      issues.push({
        field: f,
        severity: 'warn',
        message: 'Temperature above 1000 °C — well outside typical pyrolysis range.',
      })
    }
  }

  return issues
}

// Bulk-bag validation mirrors the dashboard's bag-edit hard rules and the
// bulk_bags CHECK constraints (moisture 0–100, non-negative wet weight /
// volume). Field keys are indexed (`bag_<i>_<field>`) so the caller can map
// an issue back to a specific bag row.
export function validateBags(bags) {
  const issues = []
  bags.forEach((b, i) => {
    const label = b.bulk_bag_id || `Bag ${i + 1}`
    if (entered(b.moisture_pct) && (Number(b.moisture_pct) < 0 || Number(b.moisture_pct) > 100)) {
      issues.push({ field: `bag_${i}_moisture`, severity: 'hard', message: `${label}: moisture must be between 0 and 100%.` })
    }
    if (entered(b.wet_weight_kg) && Number(b.wet_weight_kg) < 0) {
      issues.push({ field: `bag_${i}_wet`, severity: 'hard', message: `${label}: wet weight cannot be negative.` })
    }
    if (entered(b.volume_m3) && Number(b.volume_m3) < 0) {
      issues.push({ field: `bag_${i}_vol`, severity: 'hard', message: `${label}: volume cannot be negative.` })
    }
  })
  return issues
}

export function hasHardIssue(issues) {
  return issues.some((i) => i.severity === 'hard')
}
