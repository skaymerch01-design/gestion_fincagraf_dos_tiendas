const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const { dbAll, dbRun, dbGet } = require('../config/db');
const { exportSnapshot } = require('../config/snapshotSync');

function normalizeIsoDate(dateInput) {
  if (!dateInput) return new Date().toISOString().split('T')[0];
  const trimmed = String(dateInput).trim();
  if (/^\d{2}[\/\-]\d{2}[\/\-]\d{4}$/.test(trimmed)) {
    const parts = trimmed.split(/[\/\-]/);
    return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
  }
  return trimmed.split('T')[0];
}

exports.getBankEntries = async (req, res) => {
  try {
    const { status, bank_name, transaction_type, startDate, endDate } = req.query;
    let sql = `
      SELECT b.*, u.full_name as verified_by_name
      FROM bank_reconciliation b
      LEFT JOIN users u ON b.verified_by = u.id
      WHERE 1=1
    `;
    const params = [];

    if (startDate && endDate) {
      const normStart = normalizeIsoDate(startDate);
      const normEnd = normalizeIsoDate(endDate);
      const normEndWithTime = `${normEnd} 23:59:59`;
      sql += ` AND (
        (date(b.date) >= date(?) AND date(b.date) <= date(?))
        OR (b.date >= ? AND b.date <= ?)
      )`;
      params.push(normStart, normEnd, normStart, normEndWithTime);
    }

    if (status) {
      sql += ` AND b.status = ?`;
      params.push(status);
    }

    if (bank_name) {
      sql += ` AND b.bank_name = ?`;
      params.push(bank_name);
    }

    if (transaction_type) {
      sql += ` AND b.transaction_type = ?`;
      params.push(transaction_type);
    }

    if (req.query.storeId) {
      sql += ` AND (b.store_id = ? OR b.store_id IS NULL)`;
      params.push(parseInt(req.query.storeId, 10));
    }

    sql += ` ORDER BY b.id ASC`;

    const entries = await dbAll(sql, params);

    const formattedEntries = (entries || []).map(e => ({
      ...e,
      date: e.date ? (typeof e.date === 'string' ? e.date.split('T')[0] : new Date(e.date).toISOString().split('T')[0]) : null
    }));

    return res.json({
      success: true,
      entries: formattedEntries,
    });
  } catch (err) {
    console.error('Error fetching bank entries:', err);
    return res.status(500).json({ success: false, error: 'Error al obtener estado de cuenta bancario.' });
  }
};

function getBase64OrUrlFromFile(file) {
  if (!file) return null;
  try {
    if (file.path && fs.existsSync(file.path)) {
      const buffer = fs.readFileSync(file.path);
      const mime = file.mimetype || 'image/jpeg';
      return `data:${mime};base64,${buffer.toString('base64')}`;
    }
  } catch (err) {
    console.error('Error converting file to base64:', err);
  }
  // Fallback to relative URL
  const filePath = (file.path || '').replace(/\\/g, '/');
  const match = filePath.match(/\/(uploads|CAPTURAS_BANCO)\/(.+)$/i);
  if (match && match[2]) {
    return '/uploads/' + match[2];
  }
  return '/uploads/' + file.filename;
}

function getImageUrlFromFile(file) {
  return getBase64OrUrlFromFile(file);
}

exports.createBankEntry = async (req, res) => {
  try {
    const { bank_name, transaction_type, amount, reference_code, notes, audit_note, status, date } = req.body;

    if (!bank_name || !transaction_type || amount === undefined) {
      return res.status(400).json({ success: false, error: 'Tipo de pago, movimiento y monto son requeridos.' });
    }

    const numericAmount = parseFloat(amount || 0);

    let imageUrl = req.body.image_url || null;
    if (req.file) {
      imageUrl = getBase64OrUrlFromFile(req.file);
    }

    const entryDate = normalizeIsoDate(date);
    const initialStatus = status || 'PENDIENTE';

    const result = await dbRun(
      `INSERT INTO bank_reconciliation (date, bank_name, transaction_type, amount, reference_code, image_url, notes, audit_note, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        entryDate,
        bank_name.trim(),
        transaction_type,
        numericAmount,
        reference_code ? reference_code.trim() : null,
        imageUrl,
        notes || null,
        audit_note || '',
        initialStatus
      ]
    );

    const created = await dbGet(`SELECT * FROM bank_reconciliation WHERE id = ?`, [result.id]);
    const formattedCreated = created ? {
      ...created,
      date: created.date ? (typeof created.date === 'string' ? created.date.split('T')[0] : new Date(created.date).toISOString().split('T')[0]) : null
    } : null;
    exportSnapshot(dbAll).catch(err => console.error(err));

    return res.status(201).json({
      success: true,
      message: 'Movimiento bancario registrado exitosamente.',
      entry: formattedCreated,
    });
  } catch (err) {
    console.error('Error creating bank entry:', err);
    return res.status(500).json({ success: false, error: 'Error al registrar movimiento bancario.' });
  }
};

exports.createBatchBankEntries = async (req, res) => {
  try {
    const files = req.files || [];
    const dateStr = normalizeIsoDate(req.body.date_str);

    if (!files || files.length === 0) {
      return res.status(400).json({ success: false, error: 'No se recibieron imágenes.' });
    }

    const createdEntries = [];
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const imageUrl = getBase64OrUrlFromFile(f);
      const result = await dbRun(
        `INSERT INTO bank_reconciliation (date, bank_name, transaction_type, amount, image_url, status, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [dateStr, 'TRANSFERENCIA', 'INGRESO', 0.0, imageUrl, 'PENDIENTE', `Captura #${i + 1}`]
      );
      const entry = await dbGet(`SELECT * FROM bank_reconciliation WHERE id = ?`, [result.id]);
      createdEntries.push(entry);
    }

    exportSnapshot(dbAll).catch(err => console.error(err));

    return res.status(201).json({
      success: true,
      message: `${files.length} capturas subidas exitosamente.`,
      entries: createdEntries,
    });
  } catch (err) {
    console.error('Error batch uploading bank vouchers:', err);
    return res.status(500).json({ success: false, error: 'Error al subir lote de capturas.' });
  }
};

exports.replaceCaptureImage = async (req, res) => {
  try {
    const { old_image_url } = req.body;
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No se recibió ninguna imagen.' });
    }
    const newImageUrl = getBase64OrUrlFromFile(req.file);

    await dbRun(
      `UPDATE bank_reconciliation SET image_url = ? WHERE image_url = ?`,
      [newImageUrl, old_image_url]
    );

    exportSnapshot(dbAll).catch(err => console.error(err));
    return res.json({ success: true, message: 'Captura actualizada exitosamente.', new_image_url: newImageUrl });
  } catch (err) {
    console.error('Error replacing capture image:', err);
    return res.status(500).json({ success: false, error: 'Error al reemplazar imagen de captura.' });
  }
};

exports.deleteCapture = async (req, res) => {
  try {
    const { image_url } = req.body;
    if (!image_url) {
      return res.status(400).json({ success: false, error: 'image_url es requerido.' });
    }
    await dbRun(`DELETE FROM bank_reconciliation WHERE image_url = ?`, [image_url]);
    exportSnapshot(dbAll).catch(err => console.error(err));
    return res.json({ success: true, message: 'Captura y movimientos asociados eliminados.' });
  } catch (err) {
    console.error('Error deleting capture:', err);
    return res.status(500).json({ success: false, error: 'Error al eliminar la captura.' });
  }
};

exports.updateBankEntry = async (req, res) => {
  try {
    const { id } = req.params;
    const { bank_name, transaction_type, amount, reference_code, notes, audit_note, status, date } = req.body;

    const existing = await dbGet(`SELECT * FROM bank_reconciliation WHERE id = ?`, [id]);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Registro no encontrado.' });
    }

    let imageUrl = existing.image_url;
    if (req.file) {
      imageUrl = getImageUrlFromFile(req.file);
    }

    const numericAmount = amount !== undefined && amount !== null && amount !== '' ? parseFloat(amount) : existing.amount;
    const targetDate = (date && typeof date === 'string' && date.trim()) ? normalizeIsoDate(date) : (existing.date || new Date().toISOString().split('T')[0]);
    const targetNotes = notes !== undefined ? (notes !== null ? String(notes).trim() : null) : (existing.notes || null);
    const targetBankName = bank_name ? bank_name.trim() : (existing.bank_name || 'TRANSFERENCIA');
    const targetTxType = transaction_type || existing.transaction_type || 'INGRESO';
    const targetRefCode = reference_code !== undefined ? (reference_code !== null ? String(reference_code).trim() : null) : (existing.reference_code || null);
    const targetAuditNote = audit_note !== undefined ? (audit_note !== null ? String(audit_note).trim() : '') : (existing.audit_note || '');
    const targetStatus = status || existing.status || 'PENDIENTE';

    try {
      await dbRun(
        `UPDATE bank_reconciliation
         SET bank_name = ?, transaction_type = ?, amount = ?, reference_code = ?, image_url = ?, notes = ?, audit_note = ?, status = ?, date = ?
         WHERE id = ?`,
        [
          targetBankName,
          targetTxType,
          numericAmount,
          targetRefCode,
          imageUrl,
          targetNotes,
          targetAuditNote,
          targetStatus,
          targetDate,
          id
        ]
      );
    } catch (updateErr) {
      if (String(updateErr.message || '').includes('no such column: audit_note')) {
        try { await dbRun(`ALTER TABLE bank_reconciliation ADD COLUMN audit_note TEXT DEFAULT '';`); } catch (aErr) {}
        await dbRun(
          `UPDATE bank_reconciliation
           SET bank_name = ?, transaction_type = ?, amount = ?, reference_code = ?, image_url = ?, notes = ?, status = ?, date = ?
           WHERE id = ?`,
          [
            targetBankName,
            targetTxType,
            numericAmount,
            targetRefCode,
            imageUrl,
            targetNotes,
            targetStatus,
            targetDate,
            id
          ]
        );
      } else {
        throw updateErr;
      }
    }

    const updated = await dbGet(`SELECT * FROM bank_reconciliation WHERE id = ?`, [id]);
    const formattedUpdated = updated ? {
      ...updated,
      date: updated.date ? (typeof updated.date === 'string' ? updated.date.split('T')[0] : new Date(updated.date).toISOString().split('T')[0]) : null
    } : null;
    exportSnapshot(dbAll).catch(err => console.error('Snapshot export error:', err));

    return res.json({
      success: true,
      message: 'Movimiento bancario actualizado exitosamente.',
      entry: formattedUpdated,
    });
  } catch (err) {
    console.error('Error updating bank entry:', err);
    return res.status(500).json({ success: false, error: 'Error al actualizar movimiento bancario: ' + (err.message || String(err)) });
  }
};

exports.verifyBankEntry = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, audit_note } = req.body;

    await dbRun(
      `UPDATE bank_reconciliation SET status = ?, audit_note = ?, verified_by = ? WHERE id = ?`,
      [status || 'VERIFICADO', audit_note || '', req.user.id, id]
    );

    exportSnapshot(dbAll).catch(err => console.error(err));

    return res.json({ success: true, message: `Auditoría bancaria actualizada.` });
  } catch (err) {
    console.error('Error verifying bank entry:', err);
    return res.status(500).json({ success: false, error: 'Error al verificar movimiento.' });
  }
};

exports.toggleAnularBankEntry = async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await dbGet(`SELECT status FROM bank_reconciliation WHERE id = ?`, [id]);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Registro no encontrado.' });
    }

    const newStatus = existing.status === 'ANULADO' ? 'PENDIENTE' : 'ANULADO';

    await dbRun(`UPDATE bank_reconciliation SET status = ? WHERE id = ?`, [newStatus, id]);
    exportSnapshot(dbAll).catch(err => console.error(err));

    return res.json({ success: true, message: `Registro ${newStatus === 'ANULADO' ? 'anulado' : 'reactivado'} exitosamente.` });
  } catch (err) {
    console.error('Error toggling anular bank entry:', err);
    return res.status(500).json({ success: false, error: 'Error al anular movimiento.' });
  }
};

exports.deleteBankEntry = async (req, res) => {
  try {
    const { id } = req.params;
    const entry = await dbGet(`SELECT * FROM bank_reconciliation WHERE id = ?`, [id]);

    if (!entry) {
      return res.status(404).json({ success: false, error: 'Registro no encontrado.' });
    }

    await dbRun(`DELETE FROM bank_reconciliation WHERE id = ?`, [id]);
    exportSnapshot(dbAll).catch(err => console.error(err));

    return res.json({ success: true, message: 'Movimiento bancario eliminado.' });
  } catch (err) {
    console.error('Error deleting bank entry:', err);
    return res.status(500).json({ success: false, error: 'Error al eliminar movimiento.' });
  }
};

exports.downloadWeekImagesZip = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    let sql = `SELECT DISTINCT image_url FROM bank_reconciliation WHERE image_url IS NOT NULL AND status != 'ANULADO'`;
    const params = [];

    if (startDate && endDate) {
      const normStart = normalizeIsoDate(startDate);
      const normEnd = normalizeIsoDate(endDate);
      const normEndWithTime = `${normEnd} 23:59:59`;
      sql += ` AND (
        (date(date) >= date(?) AND date(date) <= date(?))
        OR (date >= ? AND date <= ?)
      )`;
      params.push(normStart, normEnd, normStart, normEndWithTime);
    }

    const rows = await dbAll(sql, params);
    const validImageUrls = rows.map(r => r.image_url).filter(Boolean);

    if (validImageUrls.length === 0) {
      return res.status(404).json({ success: false, error: 'No hay capturas registradas en la base de datos para esta semana.' });
    }

    const existingFiles = [];
    for (let i = 0; i < validImageUrls.length; i++) {
      const imgUrl = validImageUrls[i];
      if (imgUrl.startsWith('data:')) {
        const matches = imgUrl.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
        if (matches && matches[2]) {
          const ext = (matches[1] || '').includes('png') ? '.png' : '.jpg';
          existingFiles.push({
            buffer: Buffer.from(matches[2], 'base64'),
            name: `captura_${i + 1}${ext}`
          });
        }
      } else {
        const cleanPath = imgUrl.replace(/^\/uploads\//, '');
        const localFilePath = path.resolve(__dirname, '../../uploads', cleanPath);

        if (fs.existsSync(localFilePath)) {
          const baseName = path.basename(localFilePath);
          existingFiles.push({
            path: localFilePath,
            name: `captura_${i + 1}_${baseName}`
          });
        }
      }
    }

    if (existingFiles.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Las imágenes físicas no se encuentran en el almacenamiento del servidor. Vuelve a subir el lote de capturas para descargarlo.'
      });
    }

    const zipName = `capturas_bancarias_${startDate || 'todas'}_al_${endDate || 'actual'}.zip`;
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${zipName}"`);

    const { ZipArchive } = require('archiver');
    const archive = new ZipArchive({ zlib: { level: 9 } });

    archive.on('error', (err) => {
      console.error('Archive error:', err);
      if (!res.headersSent) res.status(500).json({ success: false, error: 'Error al empaquetar el archivo ZIP.' });
    });

    archive.pipe(res);

    for (const file of existingFiles) {
      if (file.buffer) {
        archive.append(file.buffer, { name: file.name });
      } else if (file.path) {
        archive.file(file.path, { name: file.name });
      }
    }

    await archive.finalize();
  } catch (err) {
    console.error('Error creating images zip:', err);
    if (!res.headersSent) {
      return res.status(500).json({ success: false, error: 'Error al generar archivo ZIP de capturas: ' + (err.message || String(err)) });
    }
  }
};
async (req, res) => {
  try {
    const { weekStart } = req.query;
    if (!weekStart) {
      return res.status(400).json({ success: false, error: 'weekStart es requerido' });
    }
    const normWeekStart = normalizeIsoDate(weekStart);
    const row = await dbGet('SELECT * FROM bank_weekly_openings WHERE week_start = ?', [normWeekStart]);
    return res.json({
      success: true,
      opening: row ? {
        week_start: row.week_start,
        opening_balance: Number(row.opening_balance || 0),
        notes: row.notes || ''
      } : {
        week_start: normWeekStart,
        opening_balance: 0,
        notes: ''
      }
    });
  } catch (err) {
    console.error('Error fetching weekly opening:', err);
    return res.status(500).json({ success: false, error: 'Error al obtener apertura de banco.' });
  }
}