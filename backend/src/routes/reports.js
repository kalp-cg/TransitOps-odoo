const express = require('express');
const { query } = require('../config/database');
const { authenticateJWT, authorizeRoles } = require('../middleware/auth');

const router = express.Router();

// Helper to format rows as a CSV string
const convertToCSV = (headers, rows) => {
  const headerLine = headers.join(',');
  const rowLines = rows.map(row => 
    headers.map(header => {
      const cellVal = row[header] !== undefined && row[header] !== null ? String(row[header]) : '';
      if (cellVal.includes(',') || cellVal.includes('"') || cellVal.includes('\n')) {
        return `"${cellVal.replace(/"/g, '""')}"`;
      }
      return cellVal;
    }).join(',')
  );
  return [headerLine, ...rowLines].join('\n');
};

// GET /api/reports/analytics - Compile operational stats with optional date filtering
router.get('/analytics', authenticateJWT, async (req, res, next) => {
  const { startDate, endDate } = req.query;

  try {
    const isFilter = startDate && endDate;
    const dateParams = isFilter ? [startDate, endDate] : [];

    // 1. Compile fuel efficiency by vehicle
    const fuelQuery = `
      SELECT v.id, v.registration_number, v.name, v.model,
             COALESCE(SUM(CASE WHEN t.status = 'COMPLETED' THEN t.planned_distance ELSE 0.0 END), 0.0) as total_distance_km,
             COALESCE(SUM(CASE WHEN t.status = 'COMPLETED' THEN t.fuel_consumed ELSE 0.0 END), 0.0) as total_fuel_liters
      FROM vehicles v
      LEFT JOIN trips t ON t.vehicle_id = v.id 
                       ${isFilter ? 'AND t.completed_at >= $1::timestamp AND t.completed_at <= $2::timestamp' : ''}
      GROUP BY v.id, v.registration_number, v.name, v.model
    `;
    const fuelEfficiencyRes = await query(fuelQuery, dateParams);

    const fuelEfficiency = fuelEfficiencyRes.rows.map(row => {
      const distance = parseFloat(row.total_distance_km);
      const fuel = parseFloat(row.total_fuel_liters);
      const efficiency = fuel > 0 ? parseFloat((distance / fuel).toFixed(2)) : 0.0;
      return {
        vehicleId: row.id,
        registrationNumber: row.registration_number,
        name: row.name,
        model: row.model,
        totalDistanceKm: distance,
        totalFuelLiters: fuel,
        efficiencyKmL: efficiency
      };
    });

    // 2. Operational Cost by Vehicle (Fuel + Maintenance costs)
    const costQuery = `
      SELECT v.id, v.registration_number, v.name,
             COALESCE((SELECT SUM(fuel_cost) FROM fuel_logs WHERE vehicle_id = v.id ${isFilter ? 'AND fuel_date >= $1::date AND fuel_date <= $2::date' : ''}), 0.0) as fuel_cost,
             COALESCE((SELECT SUM(maintenance_cost) FROM maintenance_logs WHERE vehicle_id = v.id ${isFilter ? 'AND start_date >= $1::date AND start_date <= $2::date' : ''}), 0.0) as maintenance_cost
      FROM vehicles v
    `;
    const costDetailsRes = await query(costQuery, dateParams);

    const operationalCost = costDetailsRes.rows.map(row => {
      const fuelCost = parseFloat(row.fuel_cost);
      const maintenanceCost = parseFloat(row.maintenance_cost);
      return {
        vehicleId: row.id,
        registrationNumber: row.registration_number,
        name: row.name,
        fuelCost,
        maintenanceCost,
        totalOperationalCost: parseFloat((fuelCost + maintenanceCost).toFixed(2))
      };
    });

    // 3. Vehicle ROI
    const roiQuery = `
      SELECT v.id, v.registration_number, v.name, v.acquisition_cost,
             COALESCE((SELECT SUM(revenue) FROM trips WHERE vehicle_id = v.id AND status = 'COMPLETED' ${isFilter ? 'AND completed_at >= $1::timestamp AND completed_at <= $2::timestamp' : ''}), 0.0) as revenue
      FROM vehicles v
    `;
    const roiRes = await query(roiQuery, dateParams);

    const vehicleROI = roiRes.rows.map(row => {
      const acquisitionCost = parseFloat(row.acquisition_cost);
      const revenue = parseFloat(row.revenue);

      const costItem = operationalCost.find(c => c.vehicleId === row.id);
      const totalCost = costItem ? costItem.totalOperationalCost : 0.0;
      const netProfit = revenue - totalCost;

      let roi = 0.0;
      if (acquisitionCost > 0) {
        roi = parseFloat((netProfit / acquisitionCost).toFixed(4));
      }

      return {
        vehicleId: row.id,
        registrationNumber: row.registration_number,
        name: row.name,
        acquisitionCost,
        revenue,
        operationalCost: totalCost,
        netProfit,
        roiPercentage: parseFloat((roi * 100).toFixed(2))
      };
    });

    // 4. Vehicle trip counts and total distance
    const tripQuery = `
      SELECT v.id, v.registration_number, v.name,
             COUNT(t.id) as total_trips
      FROM vehicles v
      LEFT JOIN trips t ON t.vehicle_id = v.id ${isFilter ? 'AND t.created_at >= $1::timestamp AND t.created_at <= $2::timestamp' : ''}
      GROUP BY v.id, v.registration_number, v.name
    `;
    const tripCountsRes = await query(tripQuery, dateParams);

    const tripCounts = tripCountsRes.rows.map(row => ({
      vehicleId: row.id,
      registrationNumber: row.registration_number,
      name: row.name,
      tripCount: parseInt(row.total_trips) || 0
    }));

    res.json({
      fuelEfficiency,
      operationalCost,
      vehicleROI,
      tripCounts
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/reports/export-csv - Generate downloadable CSV payload with optional date filtering
router.get('/export-csv', authenticateJWT, async (req, res, next) => {
  const { reportType, startDate, endDate } = req.query;

  try {
    const isFilter = startDate && endDate;
    const dateParams = isFilter ? [startDate, endDate] : [];

    const fuelQuery = `
      SELECT v.registration_number, v.name,
             COALESCE(SUM(CASE WHEN t.status = 'COMPLETED' THEN t.planned_distance ELSE 0.0 END), 0.0) as total_distance_km,
             COALESCE(SUM(CASE WHEN t.status = 'COMPLETED' THEN t.fuel_consumed ELSE 0.0 END), 0.0) as total_fuel_liters
      FROM vehicles v
      LEFT JOIN trips t ON t.vehicle_id = v.id 
                       ${isFilter ? 'AND t.completed_at >= $1::timestamp AND t.completed_at <= $2::timestamp' : ''}
      GROUP BY v.registration_number, v.name
    `;
    const fuelEfficiencyRes = await query(fuelQuery, dateParams);

    const costQuery = `
      SELECT v.registration_number, v.name,
             COALESCE((SELECT SUM(fuel_cost) FROM fuel_logs WHERE vehicle_id = v.id ${isFilter ? 'AND fuel_date >= $1::date AND fuel_date <= $2::date' : ''}), 0.0) as fuel_cost,
             COALESCE((SELECT SUM(maintenance_cost) FROM maintenance_logs WHERE vehicle_id = v.id ${isFilter ? 'AND start_date >= $1::date AND start_date <= $2::date' : ''}), 0.0) as maintenance_cost
      FROM vehicles v
    `;
    const costDetailsRes = await query(costQuery, dateParams);

    let csvContent = '';
    let filename = 'report.csv';

    if (reportType === 'fuel_efficiency') {
      filename = 'fuel_efficiency_report.csv';
      const rows = fuelEfficiencyRes.rows.map(row => {
        const distance = parseFloat(row.total_distance_km);
        const fuel = parseFloat(row.total_fuel_liters);
        const efficiency = fuel > 0 ? parseFloat((distance / fuel).toFixed(2)) : 0.0;
        return {
          'Registration Number': row.registration_number,
          'Vehicle Name': row.name,
          'Total Distance (KM)': distance,
          'Total Fuel Consumed (Liters)': fuel,
          'Fuel Efficiency (KM/L)': efficiency
        };
      });
      csvContent = convertToCSV(['Registration Number', 'Vehicle Name', 'Total Distance (KM)', 'Total Fuel Consumed (Liters)', 'Fuel Efficiency (KM/L)'], rows);
    } else if (reportType === 'operational_cost') {
      filename = 'operational_cost_report.csv';
      const rows = costDetailsRes.rows.map(row => {
        const fuelCost = parseFloat(row.fuel_cost);
        const maintCost = parseFloat(row.maintenance_cost);
        return {
          'Registration Number': row.registration_number,
          'Vehicle Name': row.name,
          'Fuel Cost ($)': fuelCost,
          'Maintenance Cost ($)': maintCost,
          'Total Operational Cost ($)': fuelCost + maintCost
        };
      });
      csvContent = convertToCSV(['Registration Number', 'Vehicle Name', 'Fuel Cost ($)', 'Maintenance Cost ($)', 'Total Operational Cost ($)'], rows);
    } else if (reportType === 'vehicle_roi') {
      filename = 'vehicle_roi_report.csv';
      const roiQuery = `
        SELECT v.id, v.registration_number, v.name, v.acquisition_cost,
               COALESCE((SELECT SUM(revenue) FROM trips WHERE vehicle_id = v.id AND status = 'COMPLETED' ${isFilter ? 'AND completed_at >= $1::timestamp AND completed_at <= $2::timestamp' : ''}), 0.0) as revenue
        FROM vehicles v
      `;
      const roiRes = await query(roiQuery, dateParams);

      const rows = roiRes.rows.map(row => {
        const acquisitionCost = parseFloat(row.acquisition_cost);
        const revenue = parseFloat(row.revenue);
        const costs = costDetailsRes.rows.find(c => c.name === row.name);
        const fuelCost = costs ? parseFloat(costs.fuel_cost) : 0.0;
        const maintCost = costs ? parseFloat(costs.maintenance_cost) : 0.0;
        const totalCost = fuelCost + maintCost;
        const netProfit = revenue - totalCost;
        const roi = acquisitionCost > 0 ? ((netProfit / acquisitionCost) * 100).toFixed(2) : '0.00';

        return {
          'Registration Number': row.registration_number,
          'Vehicle Name': row.name,
          'Acquisition Cost ($)': acquisitionCost,
          'Total Revenue ($)': revenue,
          'Total Cost ($)': totalCost,
          'Net Profit ($)': netProfit,
          'ROI (%)': roi
        };
      });
      csvContent = convertToCSV(['Registration Number', 'Vehicle Name', 'Acquisition Cost ($)', 'Total Revenue ($)', 'Total Cost ($)', 'Net Profit ($)', 'ROI (%)'], rows);
    } else {
      filename = 'fleet_utilization_report.csv';
      const fleetRes = await query('SELECT registration_number, name, type, current_odometer, status, region FROM vehicles');
      const rows = fleetRes.rows.map(row => ({
        'Registration Number': row.registration_number,
        'Vehicle Name': row.name,
        'Type': row.type,
        'Current Odometer': row.current_odometer,
        'Status': row.status,
        'Region': row.region
      }));
      csvContent = convertToCSV(['Registration Number', 'Vehicle Name', 'Type', 'Current Odometer', 'Status', 'Region'], rows);
    }

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.status(200).send(csvContent);
  } catch (error) {
    next(error);
  }
});

module.exports = router;

