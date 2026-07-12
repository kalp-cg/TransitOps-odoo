const express = require('express');
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const { query }                    = require('../config/database');
const { authenticateJWT, authorizeRoles } = require('../middleware/auth');

const router = express.Router();

// ─── Upload Directory ───────────────────────────────────────────────────────
const UPLOAD_DIR = path.join(__dirname, '../../uploads/vehicle_documents');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// ─── Multer Storage ─────────────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename:    (_req, file,  cb) => {
    const stamp = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, stamp + path.extname(file.originalname));
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },         // 10 MB
  fileFilter: (_req, file, cb) => {
    const ok = ['.pdf','.jpg','.jpeg','.png','.doc','.docx'];
    if (ok.includes(path.extname(file.originalname).toLowerCase())) cb(null, true);
    else cb(new Error('Only PDF, image, or Word documents are allowed.'));
  }
});

// ─── Helper: compute status from expiry date ─────────────────────────────────
const getDocStatus = (expiryStr) => {
  const expiry = new Date(expiryStr);
  const today  = new Date(); today.setHours(0,0,0,0);
  const soon   = new Date(); soon.setDate(today.getDate() + 30); soon.setHours(23,59,59,999);
  if (expiry < today)  return 'EXPIRED';
  if (expiry <= soon)  return 'EXPIRING_SOON';
  return 'VALID';
};

// ─── Helper: safe file deletion ───────────────────────────────────────────────
const safeUnlink = (filePath) => {
  if (!filePath) return;
  const full = path.join(UPLOAD_DIR, path.basename(filePath));
  if (fs.existsSync(full)) { try { fs.unlinkSync(full); } catch(e) {} }
};

// ────────────────────────────────────────────────────────────────────────────
// 1. GET  /api/vehicles/documents/alerts  — expired / expiring docs (FLEET_MANAGER, SAFETY_OFFICER)
// ────────────────────────────────────────────────────────────────────────────
router.get('/documents/alerts', authenticateJWT, authorizeRoles('FLEET_MANAGER', 'SAFETY_OFFICER'), async (req, res, next) => {
  try {
    const result = await query(`
      SELECT d.*, v.registration_number, v.name AS vehicle_name
      FROM vehicle_documents d
      JOIN vehicles v ON d.vehicle_id = v.id
      ORDER BY d.expiry_date ASC
    `);
    const alerts = result.rows
      .map(doc => ({ ...doc, status: getDocStatus(doc.expiry_date) }))
      .filter(doc => doc.status !== 'VALID');
    res.json(alerts);
  } catch (err) { next(err); }
});

// ────────────────────────────────────────────────────────────────────────────
// 2. GET  /api/vehicles/:id/documents  — all docs for one vehicle
// ────────────────────────────────────────────────────────────────────────────
router.get('/:id/documents', authenticateJWT, async (req, res, next) => {
  if (req.user.role === 'DRIVER')
    return res.status(403).json({ error: 'Forbidden: Drivers cannot access vehicle documents.' });

  const vehicleId = parseInt(req.params.id);
  try {
    const result = await query(
      'SELECT * FROM vehicle_documents WHERE vehicle_id = $1 ORDER BY expiry_date ASC',
      [vehicleId]
    );
    res.json(result.rows.map(doc => ({ ...doc, status: getDocStatus(doc.expiry_date) })));
  } catch (err) { next(err); }
});

// ────────────────────────────────────────────────────────────────────────────
// 3. POST /api/vehicles/:id/documents  — upload new document (FLEET_MANAGER)
// ────────────────────────────────────────────────────────────────────────────
router.post('/:id/documents', authenticateJWT, authorizeRoles('FLEET_MANAGER'), upload.single('file'), async (req, res, next) => {
  const vehicleId = parseInt(req.params.id);
  const { document_type, document_number, issue_date, expiry_date } = req.body;

  if (!document_type || !document_number || !issue_date || !expiry_date) {
    if (req.file) safeUnlink(req.file.filename);
    return res.status(400).json({ error: 'Required: document_type, document_number, issue_date, expiry_date.' });
  }

  try {
    const veh = await query('SELECT id FROM vehicles WHERE id = $1', [vehicleId]);
    if (!veh.rows.length) {
      if (req.file) safeUnlink(req.file.filename);
      return res.status(404).json({ error: 'Vehicle not found.' });
    }

    const fileName = req.file ? req.file.originalname : null;
    const filePath = req.file ? `/uploads/vehicle_documents/${req.file.filename}` : null;

    const result = await query(`
      INSERT INTO vehicle_documents
        (vehicle_id, document_type, document_number, issue_date, expiry_date, file_name, file_path)
      VALUES ($1,$2,$3,$4,$5,$6,$7)
      RETURNING *
    `, [vehicleId, document_type, document_number, issue_date, expiry_date, fileName, filePath]);

    const doc = result.rows[0];
    res.status(201).json({ ...doc, status: getDocStatus(doc.expiry_date) });
  } catch (err) {
    if (req.file) safeUnlink(req.file.filename);
    next(err);
  }
});

// ────────────────────────────────────────────────────────────────────────────
// 4. PUT  /api/vehicles/:id/documents/:docId  — update metadata / replace file (FLEET_MANAGER)
// ────────────────────────────────────────────────────────────────────────────
router.put('/:id/documents/:docId', authenticateJWT, authorizeRoles('FLEET_MANAGER'), upload.single('file'), async (req, res, next) => {
  const vehicleId = parseInt(req.params.id);
  const docId     = parseInt(req.params.docId);
  const { document_type, document_number, issue_date, expiry_date } = req.body;

  try {
    const existing = await query(
      'SELECT * FROM vehicle_documents WHERE id = $1 AND vehicle_id = $2',
      [docId, vehicleId]
    );
    if (!existing.rows.length) {
      if (req.file) safeUnlink(req.file.filename);
      return res.status(404).json({ error: 'Document not found for this vehicle.' });
    }

    const old = existing.rows[0];
    const updates = {};
    if (document_type)   updates.document_type   = document_type;
    if (document_number) updates.document_number = document_number;
    if (issue_date)      updates.issue_date      = issue_date;
    if (expiry_date)     updates.expiry_date     = expiry_date;

    if (req.file) {
      safeUnlink(old.file_path);           // remove old file
      updates.file_name = req.file.originalname;
      updates.file_path = `/uploads/vehicle_documents/${req.file.filename}`;
    }

    const parts  = [];
    const values = [];
    let idx = 1;
    for (const [k, v] of Object.entries(updates)) {
      parts.push(`${k} = $${idx}`); values.push(v); idx++;
    }
    if (!parts.length) return res.status(400).json({ error: 'No fields to update.' });

    values.push(docId);
    const result = await query(`
      UPDATE vehicle_documents SET ${parts.join(', ')}, updated_at = NOW()
      WHERE id = $${idx} RETURNING *
    `, values);

    const doc = result.rows[0];
    res.json({ ...doc, status: getDocStatus(doc.expiry_date) });
  } catch (err) {
    if (req.file) safeUnlink(req.file.filename);
    next(err);
  }
});

// ────────────────────────────────────────────────────────────────────────────
// 5. DELETE /api/vehicles/:id/documents/:docId  — delete doc + file (FLEET_MANAGER)
// ────────────────────────────────────────────────────────────────────────────
router.delete('/:id/documents/:docId', authenticateJWT, authorizeRoles('FLEET_MANAGER'), async (req, res, next) => {
  const vehicleId = parseInt(req.params.id);
  const docId     = parseInt(req.params.docId);
  try {
    const docRes = await query(
      'SELECT * FROM vehicle_documents WHERE id = $1 AND vehicle_id = $2',
      [docId, vehicleId]
    );
    if (!docRes.rows.length)
      return res.status(404).json({ error: 'Document not found for this vehicle.' });

    await query('DELETE FROM vehicle_documents WHERE id = $1', [docId]);
    safeUnlink(docRes.rows[0].file_path);

    res.json({ message: 'Document deleted successfully.' });
  } catch (err) { next(err); }
});

// ────────────────────────────────────────────────────────────────────────────
// 6. GET  /api/vehicles/:id/documents/:docId/download  — stream file to client
// ────────────────────────────────────────────────────────────────────────────
router.get('/:id/documents/:docId/download', authenticateJWT, async (req, res, next) => {
  if (req.user.role === 'DRIVER')
    return res.status(403).json({ error: 'Forbidden: Drivers cannot download vehicle documents.' });

  const vehicleId = parseInt(req.params.id);
  const docId     = parseInt(req.params.docId);
  try {
    const docRes = await query(
      'SELECT * FROM vehicle_documents WHERE id = $1 AND vehicle_id = $2',
      [docId, vehicleId]
    );
    if (!docRes.rows.length)
      return res.status(404).json({ error: 'Document not found.' });

    const doc = docRes.rows[0];
    if (!doc.file_path)
      return res.status(400).json({ error: 'No file associated with this document.' });

    const fullPath = path.join(UPLOAD_DIR, path.basename(doc.file_path));

    // Create placeholder for seeded mock files
    if (!fs.existsSync(fullPath)) {
      fs.writeFileSync(fullPath,
        `TransitOps – Mock Vehicle Document\nVehicle ID: ${vehicleId}\nDocument: ${doc.document_type}\nNumber: ${doc.document_number}\nExpiry: ${doc.expiry_date}\n`
      );
    }

    res.download(fullPath, doc.file_name || path.basename(fullPath));
  } catch (err) { next(err); }
});

module.exports = router;
