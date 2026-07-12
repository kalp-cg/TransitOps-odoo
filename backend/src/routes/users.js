const express = require('express');
const bcrypt = require('bcryptjs');
const { query } = require('../config/database');
const { authenticateJWT, authorizeRoles } = require('../middleware/auth');
const { sendWelcomeEmail } = require('../utils/email');

const router = express.Router();

// GET /api/users - List users with search, filter, sort (FLEET_MANAGER only)
router.get('/', authenticateJWT, authorizeRoles('FLEET_MANAGER'), async (req, res, next) => {
  const { search, role, sort, order } = req.query;

  let queryText = 'SELECT id, name, email, role, status, driver_id, created_at FROM users WHERE 1=1';
  const queryParams = [];
  let idx = 1;

  if (search) {
    queryText += ` AND (name ILIKE $${idx} OR email ILIKE $${idx})`;
    queryParams.push(`%${search}%`);
    idx++;
  }

  if (role) {
    queryText += ` AND role = $${idx}`;
    queryParams.push(role);
    idx++;
  }

  // Fleet Managers cannot see ADMIN users — must apply before ORDER BY
  if (req.user.role === 'FLEET_MANAGER') {
    queryText += ` AND role <> 'ADMIN'`;
  }

  const allowedSort = { id: 'id', name: 'name', email: 'email', role: 'role', created_at: 'created_at' };
  const sortCol = allowedSort[sort] || 'id';
  const sortOrder = order === 'ASC' ? 'ASC' : 'DESC';
  queryText += ` ORDER BY ${sortCol} ${sortOrder}`;

  try {
    const result = await query(queryText, queryParams);
    res.json(result.rows);
  } catch (error) {
    next(error);
  }
});

// POST /api/users - Create a new user (FLEET_MANAGER only)
router.post('/', authenticateJWT, authorizeRoles('FLEET_MANAGER'), async (req, res, next) => {
  const { name, email, password, role, status, driver_id } = req.body;

  if (!name || !email || !password || !role) {
    return res.status(400).json({ error: 'Required fields: name, email, password, role.' });
  }

  // Fleet Managers cannot create ADMIN users
  if (req.user.role === 'FLEET_MANAGER' && role === 'ADMIN') {
    return res.status(403).json({ error: 'Forbidden: Fleet Managers cannot create Admin users.' });
  }


  try {
    // Check unique email
    const exists = await query('SELECT id FROM users WHERE email = $1', [email]);
    if (exists.rows.length > 0) {
      return res.status(400).json({ error: 'User with this email already exists.' });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const userStatus = status || 'ACTIVE';
    const linkedDriverId = (role === 'DRIVER' && driver_id) ? driver_id : null;
    const insertQuery = `
      INSERT INTO users (name, email, password_hash, role, status, driver_id)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, name, email, role, status, driver_id, created_at
    `;
    const result = await query(insertQuery, [name, email, passwordHash, role, userStatus, linkedDriverId]);
    const newUser = result.rows[0];

    // Fire welcome email — non-blocking so a mail failure never breaks the API response
    sendWelcomeEmail(newUser, password).catch(err =>
      console.error('[SMTP] Welcome email failed for', email, err.message)
    );

    res.status(201).json(newUser);
  } catch (error) {
    next(error);
  }
});

// PUT /api/users/:id - Update user details (FLEET_MANAGER only)
router.put('/:id', authenticateJWT, authorizeRoles('FLEET_MANAGER'), async (req, res, next) => {
  const userId = parseInt(req.params.id);
  const { name, email, password, role, status, driver_id } = req.body;

  try {
    const exists = await query('SELECT id, role FROM users WHERE id = $1', [userId]);
    if (exists.rows.length === 0) {
      return res.status(404).json({ error: 'User not found.' });
    }

    // Fleet Managers cannot edit ADMIN users or promote anyone to ADMIN
    if (req.user.role === 'FLEET_MANAGER') {
      if (exists.rows[0].role === 'ADMIN') {
        return res.status(403).json({ error: 'Forbidden: Fleet Managers cannot edit Admin users.' });
      }
      if (role === 'ADMIN') {
        return res.status(403).json({ error: 'Forbidden: Fleet Managers cannot assign the Admin role.' });
      }
    }

    if (email) {
      const emailExists = await query('SELECT id FROM users WHERE email = $1 AND id <> $2', [email, userId]);
      if (emailExists.rows.length > 0) {
        return res.status(400).json({ error: 'User with this email already exists.' });
      }
    }

    const fields = { name, email, role, status };
    // Include driver_id if provided (set to null explicitly allowed)
    if (driver_id !== undefined) fields.driver_id = driver_id || null;

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

    if (password) {
      const salt = await bcrypt.genSalt(10);
      const passwordHash = await bcrypt.hash(password, salt);
      queryParts.push(`password_hash = $${idx}`);
      values.push(passwordHash);
      idx++;
    }

    if (queryParts.length === 0) {
      return res.status(400).json({ error: 'No fields to update.' });
    }

    values.push(userId);
    const updateQuery = `
      UPDATE users
      SET ${queryParts.join(', ')}, updated_at = NOW()
      WHERE id = $${idx}
      RETURNING id, name, email, role, status, driver_id, created_at
    `;

    const result = await query(updateQuery, values);
    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

// DELETE /api/users/:id - Delete a user (FLEET_MANAGER only)
router.delete('/:id', authenticateJWT, authorizeRoles('FLEET_MANAGER'), async (req, res, next) => {
  const userId = parseInt(req.params.id);

  try {
    const exists = await query('SELECT id, role FROM users WHERE id = $1', [userId]);
    if (exists.rows.length === 0) {
      return res.status(404).json({ error: 'User not found.' });
    }

    // Fleet Managers cannot delete ADMIN users
    if (req.user.role === 'FLEET_MANAGER' && exists.rows[0].role === 'ADMIN') {
      return res.status(403).json({ error: 'Forbidden: Fleet Managers cannot delete Admin users.' });
    }

    // Prevent user from self-deleting
    if (req.user.userId === userId) {
      return res.status(400).json({ error: 'Self-deletion is not allowed.' });
    }

    await query('DELETE FROM users WHERE id = $1', [userId]);
    res.json({ message: 'User deleted successfully.' });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
