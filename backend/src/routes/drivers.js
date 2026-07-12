const express = require('express');
const { query } = require('../config/database');
const { authenticateJWT, authorizeRoles } = require('../middleware/auth');

const router = express.Router();

// Helper to categorize license validity
const getLicenseValidityCategory = (expiryDateStr) => {
  const expiry = new Date(expiryDateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const thirtyDaysFromNow = new Date();
  thirtyDaysFromNow.setDate(today.getDate() + 30);
  thirtyDaysFromNow.setHours(23, 59, 59, 999);

  if (expiry < today) {
    return 'EXPIRED';
  } else if (expiry <= thirtyDaysFromNow) {
    return 'EXPIRING_SOON';
  } else {
    return 'VALID';
  }
};

// GET /api/drivers - List drivers with search and filtering
router.get('/', authenticateJWT, async (req, res, next) => {
  const { status, category, validity, search } = req.query;

  try {
    let queryText = 'SELECT * FROM drivers WHERE 1=1';
    const queryParams = [];
    let paramIndex = 1;

    if (status) {
      queryText += ` AND status = $${paramIndex}`;
      queryParams.push(status);
      paramIndex++;
    }

    if (category) {
      queryText += ` AND license_category = $${paramIndex}`;
      queryParams.push(category);
      paramIndex++;
    }

    if (search) {
      queryText += ` AND (name ILIKE $${paramIndex} OR license_number ILIKE $${paramIndex})`;
      queryParams.push(`%${search}%`);
      paramIndex++;
    }

    queryText += ' ORDER BY id DESC';

    const result = await query(queryText, queryParams);
    let drivers = result.rows.map(driver => ({
      ...driver,
      license_validity: getLicenseValidityCategory(driver.license_expiry_date)
    }));

    // Filter by validity client-side or in JS for easier date matching
    if (validity) {
      drivers = drivers.filter(d => d.license_validity === validity);
    }

    res.json(drivers);
  } catch (error) {
    next(error);
  }
});

// GET /api/drivers/:id - Driver details with trip history
router.get('/:id', authenticateJWT, async (req, res, next) => {
  const driverId = parseInt(req.params.id);

  try {
    const driverRes = await query('SELECT * FROM drivers WHERE id = $1', [driverId]);
    if (driverRes.rows.length === 0) {
      return res.status(404).json({ error: 'Driver not found.' });
    }
    const driver = driverRes.rows[0];
    driver.license_validity = getLicenseValidityCategory(driver.license_expiry_date);

    // Get trip history
    const tripsRes = await query(
      'SELECT t.*, v.registration_number as vehicle_reg FROM trips t LEFT JOIN vehicles v ON t.vehicle_id = v.id WHERE t.driver_id = $1 ORDER BY t.id DESC LIMIT 10',
      [driverId]
    );

    res.json({
      driver,
      trips: tripsRes.rows,
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/drivers - Create driver (SAFETY_OFFICER and FLEET_MANAGER allowed)
router.post('/', authenticateJWT, authorizeRoles('SAFETY_OFFICER', 'FLEET_MANAGER'), async (req, res, next) => {
  const { name, license_number, license_category, license_expiry_date, contact_number, safety_score } = req.body;

  if (!name || !license_number || !license_category || !license_expiry_date || !contact_number) {
    return res.status(400).json({ error: 'Required fields: name, license_number, license_category, license_expiry_date, contact_number.' });
  }

  try {
    // Unique license check
    const exists = await query('SELECT id FROM drivers WHERE license_number = $1', [license_number]);
    if (exists.rows.length > 0) {
      return res.status(400).json({ error: 'License Number must be unique.' });
    }

    const insertQuery = `
      INSERT INTO drivers (name, license_number, license_category, license_expiry_date, contact_number, safety_score, status)
      VALUES ($1, $2, $3, $4, $5, $6, 'AVAILABLE')
      RETURNING *
    `;
    const score = safety_score !== undefined ? parseInt(safety_score) : 100;
    const result = await query(insertQuery, [name, license_number, license_category, license_expiry_date, contact_number, score]);

    res.status(201).json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

// PUT /api/drivers/:id - Update driver (SAFETY_OFFICER and FLEET_MANAGER allowed)
router.put('/:id', authenticateJWT, authorizeRoles('SAFETY_OFFICER', 'FLEET_MANAGER'), async (req, res, next) => {
  const driverId = parseInt(req.params.id);
  const { name, license_number, license_category, license_expiry_date, contact_number, status } = req.body;

  try {
    const exists = await query('SELECT id FROM drivers WHERE id = $1', [driverId]);
    if (exists.rows.length === 0) {
      return res.status(404).json({ error: 'Driver not found.' });
    }

    if (license_number) {
      const licExists = await query('SELECT id FROM drivers WHERE license_number = $1 AND id <> $2', [license_number, driverId]);
      if (licExists.rows.length > 0) {
        return res.status(400).json({ error: 'License Number must be unique.' });
      }
    }

    const fields = { name, license_number, license_category, license_expiry_date, contact_number, status };
    const queryParts = [];
    const values = [];
    let idx = 1;

    for (const [key, val] of Object.entries(fields)) {
      if (val !== undefined) {
        queryParts.push(`${key} = $${idx}`);
        values.push(val);
        idx++;
      }
    }

    if (queryParts.length === 0) {
      return res.status(400).json({ error: 'No fields to update.' });
    }

    values.push(driverId);
    const updateQuery = `
      UPDATE drivers
      SET ${queryParts.join(', ')}, updated_at = NOW()
      WHERE id = $${idx}
      RETURNING *
    `;

    const result = await query(updateQuery, values);
    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

// PUT /api/drivers/:id/suspend - Suspend driver (SAFETY_OFFICER only)
router.put('/:id/suspend', authenticateJWT, authorizeRoles('SAFETY_OFFICER'), async (req, res, next) => {
  const driverId = parseInt(req.params.id);

  try {
    const exists = await query('SELECT id, status FROM drivers WHERE id = $1', [driverId]);
    if (exists.rows.length === 0) {
      return res.status(404).json({ error: 'Driver not found.' });
    }

    const result = await query(
      'UPDATE drivers SET status = \'SUSPENDED\', updated_at = NOW() WHERE id = $1 RETURNING *',
      [driverId]
    );

    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

// PUT /api/drivers/:id/unsuspend - Unsuspend driver (SAFETY_OFFICER only)
router.put('/:id/unsuspend', authenticateJWT, authorizeRoles('SAFETY_OFFICER'), async (req, res, next) => {
  const driverId = parseInt(req.params.id);

  try {
    const exists = await query('SELECT id, status FROM drivers WHERE id = $1', [driverId]);
    if (exists.rows.length === 0) {
      return res.status(404).json({ error: 'Driver not found.' });
    }

    const result = await query(
      'UPDATE drivers SET status = \'AVAILABLE\', updated_at = NOW() WHERE id = $1 RETURNING *',
      [driverId]
    );

    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

// PUT /api/drivers/:id/safety-score - Update driver safety score (SAFETY_OFFICER only)
router.put('/:id/safety-score', authenticateJWT, authorizeRoles('SAFETY_OFFICER'), async (req, res, next) => {
  const driverId = parseInt(req.params.id);
  const { safety_score } = req.body;

  if (safety_score === undefined || isNaN(safety_score) || safety_score < 0 || safety_score > 100) {
    return res.status(400).json({ error: 'Safety score must be a number between 0 and 100.' });
  }

  try {
    const exists = await query('SELECT id FROM drivers WHERE id = $1', [driverId]);
    if (exists.rows.length === 0) {
      return res.status(404).json({ error: 'Driver not found.' });
    }

    const result = await query(
      'UPDATE drivers SET safety_score = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
      [parseInt(safety_score), driverId]
    );

    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

// DELETE /api/drivers/:id - Delete driver (SAFETY_OFFICER and FLEET_MANAGER allowed)
router.delete('/:id', authenticateJWT, authorizeRoles('SAFETY_OFFICER', 'FLEET_MANAGER'), async (req, res, next) => {
  const driverId = parseInt(req.params.id);

  try {
    const exists = await query('SELECT id FROM drivers WHERE id = $1', [driverId]);
    if (exists.rows.length === 0) {
      return res.status(404).json({ error: 'Driver not found.' });
    }

    const refTrips = await query('SELECT id FROM trips WHERE driver_id = $1 LIMIT 1', [driverId]);
    if (refTrips.rows.length > 0) {
      return res.status(400).json({ error: 'Cannot delete driver because they are referenced in trips.' });
    }

    await query('DELETE FROM drivers WHERE id = $1', [driverId]);
    res.json({ message: 'Driver deleted successfully.' });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
