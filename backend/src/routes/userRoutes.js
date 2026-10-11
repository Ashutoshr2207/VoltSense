const express = require('express');
const { getProfile, updateProfile } = require('../controllers/userController');
const { validateUpdateUser } = require('../validators/userValidator');
const { requireAuth } = require('../middleware/authMiddleware');

const router = express.Router();

router.get('/me', requireAuth, getProfile);
router.patch('/me', requireAuth, validateUpdateUser, updateProfile);

module.exports = router;
