const express = require('express');
const asyncHandler = require('express-async-handler');
const { protect, admin } = require('../middleware/authMiddleware');
const orders = require('../services/adminOrders');

const router = express.Router();
router.use(protect, admin);
router.use((req, res, next) => { res.set('Cache-Control', 'private, no-store'); next(); });

router.get('/', asyncHandler(async (req, res) => res.json(await orders.listOrders(req.query))));
router.get('/:id', asyncHandler(async (req, res) => res.json(await orders.getOrder(req.params.id))));
router.patch('/:id/pickup-status', asyncHandler(async (req, res) => res.json(await orders.updatePickupStatus(req.params.id, req.body))));
router.post('/:id/shipping/refresh', asyncHandler(async (req, res) => res.json(await orders.refreshDelivery(req.params.id))));

module.exports = router;
