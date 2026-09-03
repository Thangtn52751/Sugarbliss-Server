const express = require('express');
const asyncHandler = require('express-async-handler');
const Product = require('../models/Product');
const upload = require('../config/upload');
const { protect, admin } = require('../middleware/authMiddleware');

const router = express.Router();

const normalizeList = (value) => {
    if (!value) {
        return [];
    }

    if (Array.isArray(value)) {
        return value.map((item) => String(item).trim()).filter(Boolean);
    }

    return String(value)
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
};

const getProductPayload = (body, file) => {
    const payload = {
        name: body.name,
        description: body.description,
        price: body.price,
        image: file ? `/uploads/products/${file.filename}` : body.image,
        category: body.category,
        stock: body.stock,
        weightGram: body.weightGram,
        shelfLifeDays: body.shelfLifeDays,
        featured: body.featured,
        status: body.status,
    };

    if (body.ingredients !== undefined) {
        payload.ingredients = normalizeList(body.ingredients);
    }

    if (body.allergens !== undefined) {
        payload.allergens = normalizeList(body.allergens);
    }

    Object.keys(payload).forEach((key) => {
        if (payload[key] === undefined || payload[key] === '') {
            delete payload[key];
        }
    });

    return payload;
};

router.get('/', asyncHandler(async (req, res) => {
    const {
        category,
        status = 'active',
        featured,
        search,
        page = 1,
        limit = 12,
    } = req.query;

    const filter = {};

    if (category) {
        filter.category = category;
    }

    if (status !== 'all') {
        filter.status = status;
    }

    if (featured !== undefined) {
        filter.featured = featured === 'true';
    }

    if (search) {
        filter.$or = [
            { name: { $regex: search, $options: 'i' } },
            { description: { $regex: search, $options: 'i' } },
            { category: { $regex: search, $options: 'i' } },
        ];
    }

    const currentPage = Math.max(Number(page), 1);
    const perPage = Math.min(Math.max(Number(limit), 1), 100);

    const [products, total] = await Promise.all([
        Product.find(filter)
            .sort({ featured: -1, createdAt: -1 })
            .skip((currentPage - 1) * perPage)
            .limit(perPage),
        Product.countDocuments(filter),
    ]);

    res.json({
        products,
        pagination: {
            total,
            page: currentPage,
            limit: perPage,
            pages: Math.ceil(total / perPage),
        },
    });
}));

router.get('/:id', asyncHandler(async (req, res) => {
    const product = await Product.findById(req.params.id);

    if (!product) {
        res.status(404);
        throw new Error('Khong tim thay san pham');
    }

    res.json(product);
}));

router.post('/', protect, admin, upload.single('image'), asyncHandler(async (req, res) => {
    const product = await Product.create(getProductPayload(req.body, req.file));
    res.status(201).json(product);
}));

router.put('/:id', protect, admin, upload.single('image'), asyncHandler(async (req, res) => {
    const product = await Product.findById(req.params.id);

    if (!product) {
        res.status(404);
        throw new Error('Khong tim thay san pham');
    }

    Object.assign(product, getProductPayload(req.body, req.file));
    const updatedProduct = await product.save();

    res.json(updatedProduct);
}));

router.delete('/:id', protect, admin, asyncHandler(async (req, res) => {
    const product = await Product.findById(req.params.id);

    if (!product) {
        res.status(404);
        throw new Error('Khong tim thay san pham');
    }

    await product.deleteOne();
    res.json({ message: 'Da xoa san pham' });
}));

module.exports = router;
