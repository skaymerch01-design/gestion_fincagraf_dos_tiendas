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
    const users = await dbAll(`SELECT id, username, role, full_name, store_id, created_at FROM users ORDER BY id ASC`);
    return res.json({ success: true, users });
  } catch (err) {
    console.error('Error fetching users:', err);
    return res.status(500).json({ success: false, error: 'Error al obtener lista de usuarios.' });
  }
};

exports.createUser = async (req, res) => {
  try {
    const { username, password, full_name, role, store_id } = req.body;
    if (!username || !password || !full_name) {
      return res.status(400).json({ success: false, error: 'Complete nombre, usuario y contraseña.' });
    }
    const cleanUser = username.trim().toLowerCase();
    if (cleanUser.length < 3) {
      return res.status(400).json({ success: false, error: 'El usuario debe tener al menos 3 caracteres.' });
    }
    const existing = await dbGet(`SELECT id FROM users WHERE username = ?`, [cleanUser]);
    if (existing) {
      return res.status(400).json({ success: false, error: `El usuario "${cleanUser}" ya existe. Elija otro nombre de usuario.` });
    }
    if (password.trim().length < 4) {
      return res.status(400).json({ success: false, error: 'La contraseña debe tener al menos 4 caracteres.' });
    }
    const hash = await bcrypt.hash(password.trim(), 10);
    const userRole = role === 'administrador' ? 'administrador' : 'vendedora';
    const userStore = userRole === 'administrador' ? null : parseInt(store_id || 1, 10);

    const result = await dbRun(
      `INSERT INTO users (username, password_hash, role, full_name, store_id) VALUES (?, ?, ?, ?, ?)`,
      [cleanUser, hash, userRole, full_name.trim(), userStore]
    );

    try {
      const { exportSnapshot } = require('../config/snapshotSync');
      await exportSnapshot(dbAll);
    } catch (_) {}

    return res.status(201).json({
      success: true,
      message: `Usuario "${full_name.trim()}" (${cleanUser}) creado exitosamente para ${userRole === 'administrador' ? 'Administrador' : `Tienda ${userStore}`}.`,
      userId: result?.lastID || result?.id
    });
  } catch (err) {
    console.error('Error creating user:', err);
    return res.status(500).json({ success: false, error: 'Error al crear usuario: ' + (err.message || String(err)) });
  }
};

exports.adminResetPassword = async (req, res) => {
  try {
    const { id } = req.params;
    const { newPassword, username, full_name, store_id } = req.body;

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

    let updatedStoreId = targetUser.store_id;
    if (targetUser.role !== 'administrador' && store_id !== undefined) {
      updatedStoreId = store_id ? parseInt(store_id, 10) : targetUser.store_id;
    }

    let newHash = targetUser.password_hash;
    if (newPassword && typeof newPassword === 'string' && newPassword.trim().length > 0) {
      if (newPassword.trim().length < 4) {
        return res.status(400).json({ success: false, error: 'La nueva contraseña debe tener al menos 4 caracteres.' });
      }
      newHash = await bcrypt.hash(newPassword.trim(), 10);
    }

    await dbRun(
      `UPDATE users SET username = ?, full_name = ?, password_hash = ?, store_id = ? WHERE id = ?`,
      [updatedUsername, updatedFullName, newHash, updatedStoreId, id]
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

exports.deleteUser = async (req, res) => {
  try {
    const { id } = req.params;
    if (parseInt(id, 10) === parseInt(req.user.id, 10)) {
      return res.status(400).json({ success: false, error: 'No puede eliminar su propia cuenta de administrador en sesión.' });
    }
    const target = await dbGet(`SELECT * FROM users WHERE id = ?`, [id]);
    if (!target) return res.status(404).json({ success: false, error: 'Usuario no encontrado.' });
    await dbRun(`DELETE FROM users WHERE id = ?`, [id]);
    try {
      const { exportSnapshot } = require('../config/snapshotSync');
      await exportSnapshot(dbAll);
    } catch (_) {}
    return res.json({ success: true, message: `Usuario "${target.username}" eliminado con éxito.` });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Error al eliminar usuario: ' + err.message });
  }
};
