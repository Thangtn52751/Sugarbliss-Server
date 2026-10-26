const express = require('express');
const asyncHandler = require('express-async-handler');
const Category = require('../models/Category');
const Product = require('../models/Product');
const { protect, admin } = require('../middleware/authMiddleware');

const router = express.Router();
router.use(protect);

router.get('/', asyncHandler(async (req, res) => {
    res.json(await Category.find().sort({ name: 1 }).lean());
}));

router.post('/', admin, asyncHandler(async (req, res) => {
    const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
    if (!name || name.length > 80) {
        res.status(400);
        throw new Error('Category name is required and must be 80 characters or fewer.');
    }
    const category = await Category.create({ name });
    res.status(201).json(category);
}));

router.put('/:id', admin, asyncHandler(async (req, res) => {
    const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
    if (!name || name.length > 80) {
        res.status(400);
        throw new Error('Category name is required and must be 80 characters or fewer.');
    }
    const category = await Category.findById(req.params.id);
    if (!category) { res.status(404); throw new Error('Category not found.'); }
    category.name = name;
    await category.save();
    res.json(category);
}));

router.delete('/:id', admin, asyncHandler(async (req, res) => {
    const category = await Category.findById(req.params.id);
    if (!category) { res.status(404); throw new Error('Category not found.'); }
    if (await Product.exists({ category: category._id })) {
        res.status(409);
        throw new Error('Reassign products before deleting this category.');
    }
    await category.deleteOne();
    res.json({ message: 'Category deleted successfully.' });
}));

module.exports = router;
