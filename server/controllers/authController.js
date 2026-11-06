const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { dbGet, dbRun, dbAll } = require('../config/db');
const { JWT_SECRET } = require('../middleware/auth');

exports.login = async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ success: false, error: 'Ingrese usuario y contraseña.' });
    }

    const cleanUsername = username.trim().toLowerCase();
    const cleanPassword = typeof password === 'string' ? password.trim() : String(password);

    const user = await dbGet(`SELECT * FROM users WHERE username = ?`, [cleanUsername]);
    if (!user) {
      return res.status(401).json({ success: false, error: 'Usuario o contraseña incorrectos.' });
    }

    let isMatch = await bcrypt.compare(cleanPassword, user.password_hash);
    if (!isMatch && typeof password === 'string') {
      isMatch = await bcrypt.compare(password, user.password_hash);
    }

    if (!isMatch) {
      return res.status(401).json({ success: false, error: 'Usuario o contraseña incorrectos.' });
    }

    const tokenPayload = {
      id: user.id,
      username: user.username,
      role: user.role,
      full_name: user.full_name,
      store_id: user.store_id || 1,
    };

    const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: '7d' });

    return res.json({
      success: true,
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        full_name: user.full_name,
        store_id: user.store_id || 1,
      },
    });
  } catch (err) {
    console.error('Error in login:', err);
    return res.status(500).json({ success: false, error: 'Error interno en el servidor.' });
  }
};

exports.getProfile = async (req, res) => {
  try {
    const user = await dbGet(`SELECT id, username, role, full_name, store_id, created_at FROM users WHERE id = ?`, [req.user.id]);
    if (!user) {
      return res.status(404).json({ success: false, error: 'Usuario no encontrado.' });
    }
    return res.json({ success: true, user });
  } catch (err) {
    console.error('Error fetching profile:', err);
    return res.status(500).json({ success: false, error: 'Error al obtener perfil.' });
  }
};

exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ success: false, error: 'Complete la contraseña actual y la nueva.' });
    }

    const user = await dbGet(`SELECT * FROM users WHERE id = ?`, [req.user.id]);
    const isMatch = await bcrypt.compare(currentPassword, user.password_hash);

    if (!isMatch) {
      return res.status(400).json({ success: false, error: 'La contraseña actual no es correcta.' });
    }

    const newHash = await bcrypt.hash(newPassword, 10);
    await dbRun(`UPDATE users SET password_hash = ? WHERE id = ?`, [newHash, req.user.id]);

    return res.json({ success: true, message: 'Contraseña actualizada correctamente.' });
  } catch (err) {
    console.error('Error changing password:', err);
    return res.status(500).json({ success: false, error: 'Error al cambiar contraseña.' });
  }
};

exports.getUsers = async (req, res) => {
  try {
    const allUsers = await dbAll(`SELECT id, username, role, full_name, created_at FROM users ORDER BY id ASC`);
    const users = allUsers.filter(u => u.username !== 'vendedora').slice(0, 2);
    return res.json({ success: true, users });
  } catch (err) {
    console.error('Error fetching users:', err);
    return res.status(500).json({ success: false, error: 'Error al obtener lista de usuarios.' });
  }
};

exports.adminResetPassword = async (req, res) => {
  try {
    const { id } = req.params;
    const { newPassword, username, full_name } = req.body;

    const targetUser = await dbGet(`SELECT * FROM users WHERE id = ?`, [id]);
    if (!targetUser) {
      return res.status(404).json({ success: false, error: 'Usuario no encontrado.' });
    }

    let updatedUsername = targetUser.username;
    if (username && username.trim()) {
      const cleanUser = username.trim().toLowerCase();
      // Verificar que el nuevo nombre de usuario no esté tomado por otra cuenta
      const existing = await dbGet(`SELECT id FROM users WHERE username = ? AND id != ?`, [cleanUser, id]);
      if (existing) {
        return res.status(400).json({ success: false, error: `El usuario "${cleanUser}" ya está en uso por otra cuenta. Elija otro.` });
      }
      updatedUsername = cleanUser;
    }

    let updatedFullName = targetUser.full_name;
    if (full_name && full_name.trim()) {
      updatedFullName = full_name.trim();
    }

    let newHash = targetUser.password_hash;
    if (newPassword && typeof newPassword === 'string' && newPassword.trim().length > 0) {
      if (newPassword.trim().length < 4) {
        return res.status(400).json({ success: false, error: 'La nueva contraseña debe tener al menos 4 caracteres.' });
      }
      newHash = await bcrypt.hash(newPassword.trim(), 10);
    }

    await dbRun(
      `UPDATE users SET username = ?, full_name = ?, password_hash = ? WHERE id = ?`,
      [updatedUsername, updatedFullName, newHash, id]
    );

    try {
      const { exportSnapshot } = require('../config/snapshotSync');
      await exportSnapshot(dbAll);
    } catch (e) {
      console.error('Snapshot export error:', e);
    }

    return res.json({
      success: true,
      message: `Cuenta "${updatedFullName}" (${updatedUsername}) actualizada con éxito.`
    });
  } catch (err) {
    console.error('Error in adminResetPassword:', err);
    return res.status(500).json({ success: false, error: 'Error al actualizar usuario: ' + (err.message || String(err)) });
  }
};
