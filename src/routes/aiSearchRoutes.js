const express = require('express');
const router = express.Router();
const { aiSearch } = require('../controllers/aiSearchController');

// Public — buyers don't need to be logged in to search
router.post('/search/ai', aiSearch);

module.exports = router;
