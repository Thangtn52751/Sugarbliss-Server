const express = require('express');
const asyncHandler = require('express-async-handler');
const Product = require('../models/Product');
const upload = require('../config/upload');
const { protect, admin } = require('../middleware/authMiddleware');

const router = express.Router();

router.use(protect);

const normalizeList = (value) => {
    if (!value) {
        return [];
    }

    if (Array.isArray(value)) {
        return value.map((item) => String(item).trim()).filter(Boolean);
    }

    const stringValue = String(value).trim();

    if (stringValue.startsWith('[')) {
        try {
            const parsedValue = JSON.parse(stringValue);

            if (Array.isArray(parsedValue)) {
                return parsedValue.map((item) => String(item).trim()).filter(Boolean);
            }
        } catch (error) {
            // Fall back to comma-separated values.
        }
    }

    return stringValue
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
};

const getUploadedImages = (files = {}) => [
    ...(files.images || []),
    ...(files.image || []),
].map((file) => `/uploads/products/${file.filename}`);

const getProductPayload = (body, files) => {
    const uploadedImages = getUploadedImages(files);
    const submittedImages = normalizeList(body.images !== undefined ? body.images : body.image);
    const payload = {
        name: body.name,
        description: body.description,
        price: body.price,
        images: uploadedImages.length ? uploadedImages : submittedImages,
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
        if (payload[key] === undefined || payload[key] === '' || (key === 'images' && payload[key].length === 0)) {
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
            .select('-reviews')
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
    const product = await Product.findById(req.params.id)
        .populate('reviews.user', 'name avatar');

    if (!product) {
        res.status(404);
        throw new Error('Product not found.');
    }

    res.json(product);
}));

const productImageUpload = upload.fields([
    { name: 'images', maxCount: 10 },
    { name: 'image', maxCount: 1 },
]);

router.post('/', admin, productImageUpload, asyncHandler(async (req, res) => {
    const product = await Product.create(getProductPayload(req.body, req.files));
    res.status(201).json(product);
}));

router.put('/:id', admin, productImageUpload, asyncHandler(async (req, res) => {
    const product = await Product.findById(req.params.id);

    if (!product) {
        res.status(404);
        throw new Error('Product not found.');
    }

    Object.assign(product, getProductPayload(req.body, req.files));
    const updatedProduct = await product.save();

    res.json(updatedProduct);
}));

router.post('/:id/reviews', asyncHandler(async (req, res) => {
    const rating = Number(req.body.rating);
    const comment = String(req.body.comment || '').trim();

    if (!Number.isInteger(rating) || rating < 1 || rating > 5 || !comment) {
        res.status(400);
        throw new Error('Rating must be an integer from 1 to 5 and comment is required.');
    }

    const product = await Product.findById(req.params.id);

    if (!product) {
        res.status(404);
        throw new Error('Product not found.');
    }

    const alreadyReviewed = product.reviews.some((review) => review.user.equals(req.user._id));

    if (alreadyReviewed) {
        res.status(400);
        throw new Error('You have already reviewed this product.');
    }

    product.reviews.push({ user: req.user._id, rating, comment });
    product.updateReviewSummary();
    await product.save();

    await product.populate('reviews.user', 'name avatar');
    res.status(201).json(product.reviews.at(-1));
}));

router.put('/:id/reviews/:reviewId', asyncHandler(async (req, res) => {
    const product = await Product.findById(req.params.id);

    if (!product) {
        res.status(404);
        throw new Error('Product not found.');
    }

    const review = product.reviews.id(req.params.reviewId);

    if (!review) {
        res.status(404);
        throw new Error('Review not found.');
    }

    if (!review.user.equals(req.user._id) && req.user.role !== 'admin') {
        res.status(403);
        throw new Error('You can only edit your own review.');
    }

    if (req.body.rating !== undefined) {
        const rating = Number(req.body.rating);

        if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
            res.status(400);
            throw new Error('Rating must be an integer from 1 to 5.');
        }

        review.rating = rating;
    }

    if (req.body.comment !== undefined) {
        const comment = String(req.body.comment).trim();

        if (!comment) {
            res.status(400);
            throw new Error('Comment cannot be empty.');
        }

        review.comment = comment;
    }

    product.updateReviewSummary();
    await product.save();
    await product.populate('reviews.user', 'name avatar');

    res.json(product.reviews.id(req.params.reviewId));
}));

router.delete('/:id/reviews/:reviewId', asyncHandler(async (req, res) => {
    const product = await Product.findById(req.params.id);

    if (!product) {
        res.status(404);
        throw new Error('Product not found.');
    }

    const review = product.reviews.id(req.params.reviewId);

    if (!review) {
        res.status(404);
        throw new Error('Review not found.');
    }

    if (!review.user.equals(req.user._id) && req.user.role !== 'admin') {
        res.status(403);
        throw new Error('You can only delete your own review.');
    }

    review.deleteOne();
    product.updateReviewSummary();
    await product.save();

    res.json({ message: 'Review deleted successfully.' });
}));

router.delete('/:id', admin, asyncHandler(async (req, res) => {
    const product = await Product.findById(req.params.id);

    if (!product) {
        res.status(404);
        throw new Error('Product not found.');
    }

    await product.deleteOne();
    res.json({ message: 'Product deleted successfully.' });
}));

module.exports = router;
