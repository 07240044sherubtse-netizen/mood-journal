// routes/admin.js - URLs for the super admin dashboard. Only maps URLs to controllers.
// requireAdmin answers 403 for anybody whose role is not 'superadmin'.
const express = require('express');
const adminController = require('../controllers/adminController');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

router.get('/', requireAuth, requireAdmin, adminController.showAdmin);

// Account actions. POST only, so a link or a picture can never do this by accident.
router.post('/users/:id/deactivate', requireAuth, requireAdmin, adminController.deactivateUser);
router.post('/users/:id/reactivate', requireAuth, requireAdmin, adminController.reactivateUser);
router.post('/users/:id/verify', requireAuth, requireAdmin, adminController.verifyUser);

module.exports = router;
