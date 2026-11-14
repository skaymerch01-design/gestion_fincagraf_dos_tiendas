const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const os = require('os');

const { authenticateToken, requireRole } = require('../middleware/auth');

const localUploadsDir = path.resolve(__dirname, '../../uploads');

function getUploadDestination() {
  if (!fs.existsSync(localUploadsDir)) {
    fs.mkdirSync(localUploadsDir, { recursive: true });
  }
  return localUploadsDir;
}

function getWeekFolder(dateInput) {
  let d = dateInput ? new Date(dateInput) : new Date();
  if (isNaN(d.getTime())) d = new Date();

  const dayOfWeek = d.getDay();
  const diffToMon = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = new Date(d);
  monday.setDate(d.getDate() + diffToMon);

  const saturday = new Date(monday);
  saturday.setDate(monday.getDate() + 5);

  const formatD = (date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  return `SEMANA_${formatD(monday)}_AL_${formatD(saturday)}`;
}

// Multer Storage Configuration for Vouchers/Bank Images
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const baseDest = getUploadDestination();
    const reqDate = req.body.date_str || req.body.date || new Date();
    const subFolder = getWeekFolder(reqDate);
    const fullDest = path.join(baseDest, subFolder);

    if (!fs.existsSync(fullDest)) {
      fs.mkdirSync(fullDest, { recursive: true });
    }

    cb(null, fullDest);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, `voucher-${uniqueSuffix}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit per image
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Solo se permiten archivos de imagen (PNG, JPG, JPEG, WEBP).'));
    }
  },
});

// Dedicated Multer for Database Backups (.json, .db, .sqlite)
const backupUpload = multer({
  dest: os.tmpdir(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext === '.json' || ext === '.db' || ext === '.sqlite') {
      cb(null, true);
    } else {
      cb(new Error('Solo se permiten archivos de copia de seguridad (.json, .db).'));
    }
  },
});

// Controllers
const authController = require('../controllers/authController');
const dailySheetController = require('../controllers/dailySheetController');
const contractsController = require('../controllers/contractsController');
const expensesController = require('../controllers/expensesController');
const weeklyBalanceController = require('../controllers/weeklyBalanceController');
const paymentScheduleController = require('../controllers/paymentScheduleController');
const bankReconciliationController = require('../controllers/bankReconciliationController');
const sunatController = require('../controllers/sunatController');
const backupController = require('../controllers/backupController');
const staffLoansController = require('../controllers/staffLoansController');

// --- AUTH ROUTES ---
router.post('/auth/login', authController.login);
router.get('/auth/profile', authenticateToken, authController.getProfile);
router.post('/auth/change-password', authenticateToken, authController.changePassword);
router.get('/admin/users', authenticateToken, requireRole('administrador'), authController.getUsers);
router.post('/admin/users', authenticateToken, requireRole('administrador'), authController.createUser);
router.put('/admin/users/:id/reset-password', authenticateToken, requireRole('administrador'), authController.adminResetPassword);
router.delete('/admin/users/:id', authenticateToken, requireRole('administrador'), authController.deleteUser);

// --- DAILY SHEET & WEEKLY REPORT ---
router.get('/daily-sheet', authenticateToken, dailySheetController.getDailySheet);
router.get('/daily-sheet/next-contract-num', authenticateToken, dailySheetController.getNextContractNum);
router.get('/daily-sheet/contract-lookup/:contractNum', authenticateToken, dailySheetController.lookupContract);
router.get('/daily-sheet/search-contracts', authenticateToken, dailySheetController.searchContracts);
router.get('/daily-sheet/search-expenses', authenticateToken, dailySheetController.searchExpenses);
router.get('/daily-sheet/weekly-report', authenticateToken, dailySheetController.getWeeklyReport);
router.post('/daily-sheet/cash', authenticateToken, dailySheetController.updatePreviousCash);
router.post('/daily-sheet/income', authenticateToken, dailySheetController.addIncomeEntry);
router.put('/daily-sheet/income/:id', authenticateToken, dailySheetController.updateIncomeEntry);
router.put('/daily-sheet/income/:id/anular', authenticateToken, dailySheetController.toggleAnularIncomeEntry);
router.put('/daily-sheet/income/:id/finalize', authenticateToken, dailySheetController.markAsFinalizedIncomeEntry);
router.put('/daily-sheet/income/:id/entregado', authenticateToken, dailySheetController.markAsEntregadoIncomeEntry);
router.put('/daily-sheet/income/:id/cancelar', authenticateToken, dailySheetController.toggleCanceladoIncomeEntry);
router.put('/daily-sheet/income/:id/audit', authenticateToken, requireRole('administrador'), dailySheetController.auditIncomeEntry);
router.delete('/daily-sheet/income/:id', authenticateToken, dailySheetController.deleteIncomeEntry);
router.post('/daily-sheet/expense', authenticateToken, dailySheetController.addExpenseEntry);
router.put('/daily-sheet/expense/:id', authenticateToken, dailySheetController.updateExpenseEntry);
router.put('/daily-sheet/expense/:id/audit', authenticateToken, requireRole('administrador'), dailySheetController.auditExpenseEntry);
router.delete('/daily-sheet/expense/:id', authenticateToken, dailySheetController.deleteExpenseEntry);

// --- CONTRACTS ROUTES ---
router.post('/contracts', authenticateToken, contractsController.createContract);
router.get('/contracts', authenticateToken, contractsController.getContracts);
router.get('/contracts/stats', authenticateToken, contractsController.getGlobalBalanceStats);
router.get('/contracts/monthly-report', authenticateToken, contractsController.getMonthlyReport);
router.get('/contracts/annual-report', authenticateToken, contractsController.getAnnualReport);
router.get('/contracts/lookup-code/:code', authenticateToken, contractsController.lookupContractByCode);
router.get('/contracts/:id', authenticateToken, contractsController.getContractById);
router.put('/contracts/:id', authenticateToken, contractsController.updateContract);
router.put('/contracts/:id/order-status', authenticateToken, contractsController.updateOrderStatus);
router.put('/contracts/:id/liquidate', authenticateToken, requireRole('administrador'), contractsController.liquidateContract);
router.put('/contracts/:id/revert-liquidation', authenticateToken, requireRole('administrador'), contractsController.revertLiquidation);
router.put('/contracts/:id/anular', authenticateToken, contractsController.toggleAnularContract);
router.put('/contracts/:id/resolve-observation', authenticateToken, requireRole('administrador'), contractsController.resolveContractObservation);
router.get('/pending-observations', authenticateToken, contractsController.getPendingObservations);
router.post('/justify-observation', authenticateToken, contractsController.justifyObservation);
router.post('/resolve-observation', authenticateToken, requireRole('administrador'), contractsController.resolveAnyObservation);
router.post('/update-observation', authenticateToken, requireRole('administrador'), contractsController.updateObservation);
router.post('/reobserve-observation', authenticateToken, requireRole('administrador'), contractsController.reobserveObservation);
router.post('/delete-observation', authenticateToken, requireRole('administrador'), contractsController.deleteObservation);
router.post('/sticky-notes', authenticateToken, requireRole('administrador'), contractsController.createStickyNote);
router.delete('/contracts/:id', authenticateToken, requireRole('administrador'), contractsController.deleteContract);
router.post('/contracts/:id/payments', authenticateToken, contractsController.addContractPayment);
router.delete('/contracts/:id/payments/:paymentId', authenticateToken, contractsController.deleteContractPayment);

// --- EXPENSES ROUTES ---
router.post('/expenses', authenticateToken, expensesController.createExpense);
router.get('/expenses', authenticateToken, expensesController.getExpenses);
router.get('/expenses/non-contract', authenticateToken, expensesController.getNonContractExpenses);
router.delete('/expenses/:id', authenticateToken, requireRole('administrador'), expensesController.deleteExpense);

// --- TAB 1: BALANCE SEMANAL ---
router.get('/weekly-balance', authenticateToken, requireRole('administrador'), weeklyBalanceController.getWeeklyBalance);
router.post('/weekly-balance/adjustment', authenticateToken, requireRole('administrador'), weeklyBalanceController.addWeeklyAdjustment);

// --- TAB 2: GASTOS ADICIONALES ---
router.get('/admin/additional-expenses', authenticateToken, requireRole('administrador'), expensesController.getNonContractExpenses);

// --- TAB 3: CRONOGRAMA DE PAGOS ---
router.get('/payment-schedule', authenticateToken, requireRole('administrador'), paymentScheduleController.getPaymentSchedules);
router.get('/payment-schedule/alerts', authenticateToken, paymentScheduleController.getActiveAlerts);
router.post('/payment-schedule', authenticateToken, requireRole('administrador'), paymentScheduleController.createScheduledPayment);
router.put('/payment-schedule/:id/pay', authenticateToken, requireRole('administrador'), paymentScheduleController.markAsPaid);
router.delete('/payment-schedule/:id', authenticateToken, requireRole('administrador'), paymentScheduleController.deleteScheduledPayment);

// --- TAB 4: ESTADO DE CUENTA ---
router.get('/bank-reconciliation', authenticateToken, requireRole('administrador'), bankReconciliationController.getBankEntries);
router.get('/bank-reconciliation/opening', authenticateToken, requireRole('administrador'), bankReconciliationController.getWeeklyOpening);
router.post('/bank-reconciliation/opening', authenticateToken, requireRole('administrador'), bankReconciliationController.saveWeeklyOpening);
router.get('/bank-reconciliation/download-zip', authenticateToken, requireRole('administrador'), bankReconciliationController.downloadWeekImagesZip);
router.put('/bank-reconciliation/replace-image', authenticateToken, requireRole('administrador'), upload.single('voucher_image'), bankReconciliationController.replaceCaptureImage);
router.post('/bank-reconciliation/delete-capture', authenticateToken, requireRole('administrador'), bankReconciliationController.deleteCapture);
router.post('/bank-reconciliation', authenticateToken, requireRole('administrador'), upload.single('voucher_image'), bankReconciliationController.createBankEntry);
router.post('/bank-reconciliation/batch', authenticateToken, requireRole('administrador'), upload.array('voucher_images', 30), bankReconciliationController.createBatchBankEntries);
router.put('/bank-reconciliation/:id', authenticateToken, requireRole('administrador'), upload.single('voucher_image'), bankReconciliationController.updateBankEntry);
router.put('/bank-reconciliation/:id/anular', authenticateToken, requireRole('administrador'), bankReconciliationController.toggleAnularBankEntry);
router.put('/bank-reconciliation/:id/verify', authenticateToken, requireRole('administrador'), bankReconciliationController.verifyBankEntry);
router.delete('/bank-reconciliation/:id', authenticateToken, requireRole('administrador'), bankReconciliationController.deleteBankEntry);

// --- TAB 5: BALANCE GLOBAL ---
router.get('/admin/global-balance', authenticateToken, requireRole('administrador'), contractsController.getGlobalBalanceStats);

// --- TAB 6: SUNAT ---
router.get('/sunat/invoices', authenticateToken, requireRole('administrador'), sunatController.getSunatInvoices);
router.post('/sunat/invoices', authenticateToken, requireRole('administrador'), sunatController.createSunatInvoice);
router.put('/sunat/invoices/:id', authenticateToken, requireRole('administrador'), sunatController.updateSunatInvoice);
router.get('/sunat/stats', authenticateToken, requireRole('administrador'), sunatController.getSunatMonthlyStats);
router.delete('/sunat/invoices/:id', authenticateToken, requireRole('administrador'), sunatController.deleteSunatInvoice);

// --- TAB 6: PRESTAMOS PERSONALES ---
router.get('/staff-loans', authenticateToken, staffLoansController.getStaffLoans);
router.get('/staff-loans/:id', authenticateToken, staffLoansController.getStaffLoanById);
router.post('/staff-loans', authenticateToken, staffLoansController.createStaffLoan);
router.post('/staff-loans/:id/payments', authenticateToken, staffLoansController.addLoanPayment);
router.delete('/staff-loans/:id', authenticateToken, requireRole('administrador'), staffLoansController.deleteStaffLoan);

// --- BACKUPS & GOOGLE DRIVE CONFIG ---
router.get('/backup/status', authenticateToken, requireRole('administrador'), backupController.getBackupStatus);
router.post('/backup/config', authenticateToken, requireRole('administrador'), backupController.updateDriveConfig);
router.get('/backup/download', authenticateToken, requireRole('administrador'), backupController.downloadDatabaseBackup);
router.post(
  '/backup/restore',
  authenticateToken,
  requireRole('administrador'),
  (req, res, next) => {
    backupUpload.single('backup_file')(req, res, (err) => {
      if (err) {
        return res.status(400).json({ success: false, error: err.message });
      }
      next();
    });
  },
  backupController.restoreDatabaseBackup
);

module.exports = router;
