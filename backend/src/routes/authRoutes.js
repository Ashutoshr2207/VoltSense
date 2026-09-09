const express = require('express');
const { register, login, getMe, logout } = require('../controllers/authController');
const { validateRegister, validateLogin } = require('../validators/authValidator');
const { requireAuth } = require('../middleware/authMiddleware');

const router = express.Router();

router.post('/register', validateRegister, register);
router.post('/login', validateLogin, login);
router.get('/me', requireAuth, getMe);
router.post('/logout', requireAuth, logout);

module.exports = router;
