const express = require('express');
const { authenticate } = require('../middleware/authMiddleware');

const router = express.Router();

router.get('/profile', authenticate, async (req, res) => {
  return res.json({ message: 'Authenticated user route access granted', user: req.user });
});

module.exports = router;
