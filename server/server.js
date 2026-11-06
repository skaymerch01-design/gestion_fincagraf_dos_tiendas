const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

dotenv.config();

const apiRoutes = require('./routes/api');

const app = express();
const PORT = process.env.PORT || 5000;

// Enable CORS and JSON parsing with high limit for voucher base64 images
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
// Serve uploaded voucher images statically (directly from Google Drive folder or fallback)
const defaultDriveDir = 'G:\\Mi unidad\\CAPTURAS_BANCO';
const localUploadsDir = path.resolve(__dirname, '../uploads');
const uploadsDir = fs.existsSync(defaultDriveDir) ? defaultDriveDir : localUploadsDir;

app.use('/uploads', (req, res, next) => {
  express.static(uploadsDir)(req, res, () => {
    const requestedFile = path.basename(req.path);
    if (!requestedFile || requestedFile === '/') return next();

    function findFileInDir(dir) {
      if (!fs.existsSync(dir)) return null;
      try {
        const items = fs.readdirSync(dir);
        for (const item of items) {
          const fullPath = path.join(dir, item);
          const stat = fs.statSync(fullPath);
          if (stat.isDirectory()) {
            const found = findFileInDir(fullPath);
            if (found) return found;
          } else if (item.toLowerCase() === requestedFile.toLowerCase()) {
            return fullPath;
          }
        }
      } catch (e) {}
      return null;
    }

    const foundFile = findFileInDir(uploadsDir);
    if (foundFile) {
      return res.sendFile(foundFile);
    }
    next();
  });
});

// API Routes
app.use('/api', apiRoutes);

// Serve static frontend in production if built
const clientDist = path.resolve(__dirname, '../client/dist');
app.use(express.static(clientDist));

app.get(/.*/, (req, res) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ success: false, error: 'Ruta API no encontrada.' });
  }
  const indexHtml = path.join(clientDist, 'index.html');
  if (require('fs').existsSync(indexHtml)) {
    res.sendFile(indexHtml);
  } else {
    res.send(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>Gestión Fincagraf - Servidor Backend Activo</title>
          <style>
            body { font-family: system-ui, sans-serif; padding: 40px; background: #0f172a; color: #f8fafc; text-align: center; }
            .card { background: #1e293b; padding: 30px; border-radius: 12px; max-width: 600px; margin: 0 auto; box-shadow: 0 4px 20px rgba(0,0,0,0.3); }
            h1 { color: #38bdf8; }
            code { background: #334155; padding: 4px 8px; border-radius: 4px; color: #a5f3fc; }
          </style>
        </head>
        <body>
          <div class="card">
            <h1>Gestión Fincagraf Backend API</h1>
            <p>El servidor Backend está ejecutándose correctamente en el puerto <code>${PORT}</code>.</p>
            <p>Para ver la interfaz gráfica de usuario, ejecute el cliente React Vite en desarrollo o cree el build de producción.</p>
          </div>
        </body>
      </html>
    `);
  }
});

app.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(`🚀 SERVIDOR GESTIÓN FINCAGRAF ACTIVO EN PUERTO: ${PORT}`);
  console.log(`🌐 Acceso API: http://localhost:${PORT}/api`);
  console.log(`=======================================================`);
});
