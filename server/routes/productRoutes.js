const express = require('express');
const asyncHandler = require('express-async-handler');
const Product = require('../models/Product');
const mongoose = require('mongoose');
const upload = require('../config/upload');
const reviewUpload = require('../config/reviewUpload');
const { eligibility, requirePurchase, reviewInput, updateReviews, reviewError } = require('../services/productReviews');
const { protect, admin } = require('../middleware/authMiddleware');
const { escapeRegex, searchProducts } = require('../services/productSearch');

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
        weightGram: body.weightGram === '' ? null : body.weightGram,
        shelfLifeDays: body.shelfLifeDays === '' ? null : body.shelfLifeDays,
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

const invalidCatalogFilter = message => Object.assign(new Error(message), { statusCode: 400, code: 'PRODUCT_FILTER_INVALID' });
const parsePrice = (value, label) => {
    if (value === undefined || value === '') return undefined;
    if (typeof value !== 'string' || !/^\d+$/.test(value.trim()) || !Number.isSafeInteger(Number(value))) {
        throw invalidCatalogFilter(`${label} must be a non-negative integer VND amount.`);
    }
    return Number(value);
};

router.get('/', asyncHandler(async (req, res) => {
    const {
        category,
        status = 'active',
        featured,
        search,
        page = 1,
        limit = 12,
        sort = 'default',
    } = req.query;

    const filter = {};
    if (category !== undefined && typeof category !== 'string') throw invalidCatalogFilter('Category must be a single category name.');
    const minPrice = parsePrice(req.query.minPrice, 'Minimum price');
    const maxPrice = parsePrice(req.query.maxPrice, 'Maximum price');
    if (minPrice !== undefined && maxPrice !== undefined && minPrice > maxPrice) {
        throw invalidCatalogFilter('Minimum price must not exceed maximum price.');
    }
    const sorting = {
        default: { featured: -1, createdAt: -1, _id: -1 },
        price_asc: { price: 1, _id: 1 },
        price_desc: { price: -1, _id: 1 },
    };
    if (typeof sort !== 'string' || !Object.hasOwn(sorting, sort)) throw invalidCatalogFilter('Sort must be default, price_asc or price_desc.');
    if (minPrice !== undefined || maxPrice !== undefined) {
        filter.price = { ...(minPrice !== undefined ? { $gte: minPrice } : {}), ...(maxPrice !== undefined ? { $lte: maxPrice } : {}) };
    }

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
        const searchPattern = new RegExp(escapeRegex(String(search).trim()), 'i');
        filter.$or = [
            { name: searchPattern },
            { description: searchPattern },
            { category: searchPattern },
        ];
    }

    if ([page, limit].some(value => !['string', 'number'].includes(typeof value) || !/^\d+$/.test(String(value)) ||
        !Number.isSafeInteger(Number(value)) || Number(value) < 1)) {
        throw invalidCatalogFilter('Page and limit must be positive integers.');
    }
    const currentPage = Number(page);
    const perPage = Math.min(Number(limit), 100);
    if (!Number.isSafeInteger((currentPage - 1) * perPage)) throw invalidCatalogFilter('Page is too large.');

    const categoryFilter = { ...filter };
    delete categoryFilter.category;
    delete categoryFilter.price;
    const [products, total, categories] = await Promise.all([
        Product.find(filter)
            .select('-reviews')
            .sort(sorting[sort])
            .skip((currentPage - 1) * perPage)
            .limit(perPage),
        Product.countDocuments(filter),
        Product.distinct('category', categoryFilter),
    ]);

    res.json({
        products,
        categories: categories.filter(category => typeof category === 'string' && category.trim()).sort((a, b) => a.localeCompare(b)),
        pagination: {
            total,
            page: currentPage,
            limit: perPage,
            pages: Math.ceil(total / perPage),
        },
    });
}));

router.get('/search', asyncHandler(async (req, res) => {
    const result = await searchProducts(req.query.q, req.query.limit);
    res.set('Cache-Control', 'private, no-store');
    res.json(result);
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

const loadReviewProduct = asyncHandler(async (req, res, next) => {
    if (!mongoose.isValidObjectId(req.params.id)) throw reviewError('Invalid product ID.');
    const product = await Product.findById(req.params.id);
    if (!product) throw reviewError('Product not found.', 404, 'REVIEW_PRODUCT_NOT_FOUND');
    req.reviewProduct = product;
    next();
});

const authorizeReviewOwner = asyncHandler(async (req, res, next) => {
    if (!mongoose.isValidObjectId(req.params.reviewId)) throw reviewError('Invalid review ID.');
    const review = req.reviewProduct.reviews.id(req.params.reviewId);
    if (!review) throw reviewError('Review not found.', 404, 'REVIEW_NOT_FOUND');
    if (!review.user.equals(req.user._id) && req.user.role !== 'admin') {
        throw reviewError('You can only change your own review.', 403, 'REVIEW_NOT_OWNER');
    }
    req.existingReview = review;
    next();
});

router.get('/:id/reviews/eligibility', loadReviewProduct, asyncHandler(async (req, res) => {
    res.set('Cache-Control', 'private, no-store');
    res.json(await eligibility(req.reviewProduct, req.user._id));
}));

router.post('/:id/reviews', loadReviewProduct, asyncHandler(async (req, res, next) => {
    const permission = await eligibility(req.reviewProduct, req.user._id);
    if (permission.reason === 'ALREADY_REVIEWED') throw reviewError('You have already reviewed this product.', 409, 'REVIEW_ALREADY_REVIEWED');
    await requirePurchase(req.reviewProduct._id, req.user._id);
    next();
}), reviewUpload.upload, asyncHandler(async (req, res) => {
    const input = reviewInput(req.body);
    await requirePurchase(req.reviewProduct._id, req.user._id);
    const images = await reviewUpload.store(req.files);
    let saved = false;
    try {
        const review = req.reviewProduct.reviews.create({ ...input, images, user: req.user._id, createdAt: new Date(), updatedAt: new Date() });
        await review.validate();
        const product = await updateReviews({ _id: req.reviewProduct._id, 'reviews.user': { $ne: req.user._id } },
            { $concatArrays: [{ $ifNull: ['$reviews', []] }, { $literal: [review.toObject()] }] });
        if (!product) throw reviewError('You have already reviewed this product or it is no longer available.', 409, 'REVIEW_ALREADY_REVIEWED');
        saved = true;
        await product.populate('reviews.user', 'name avatar');
        res.status(201).json(product.reviews.id(review._id));
    } finally { if (!saved) await reviewUpload.remove(images); }
}));

router.put('/:id/reviews/:reviewId', loadReviewProduct, authorizeReviewOwner, asyncHandler(async (req, res, next) => {
    if (req.user.role !== 'admin') await requirePurchase(req.reviewProduct._id, req.user._id);
    next();
}), reviewUpload.upload, asyncHandler(async (req, res) => {
    const input = reviewInput(req.body, true);
    if (req.user.role !== 'admin') await requirePurchase(req.reviewProduct._id, req.user._id);
    const images = await reviewUpload.store(req.files);
    let saved = false;
    try {
        const review = req.reviewProduct.reviews.create({ ...req.existingReview.toObject(), ...input,
            ...(images.length ? { images } : {}), updatedAt: new Date() });
        await review.validate();
        const product = await updateReviews({ _id: req.reviewProduct._id, reviews: { $elemMatch: {
            _id: review._id, updatedAt: req.existingReview.updatedAt || null, ...(req.user.role === 'admin' ? {} : { user: req.user._id }),
        } } }, { $map: { input: '$reviews', as: 'review', in: { $cond: [
            { $eq: ['$$review._id', review._id] }, { $literal: review.toObject() }, '$$review',
        ] } } });
        if (!product) throw reviewError('Review changed. Reload and try again.', 409, 'REVIEW_CHANGED');
        saved = true;
        if (images.length) await reviewUpload.remove(req.existingReview.images);
        await product.populate('reviews.user', 'name avatar');
        res.json(product.reviews.id(review._id));
    } finally { if (!saved) await reviewUpload.remove(images); }
}));

router.delete('/:id/reviews/:reviewId', loadReviewProduct, authorizeReviewOwner, asyncHandler(async (req, res) => {
    const review = req.existingReview;
    const product = await updateReviews({ _id: req.reviewProduct._id, reviews: { $elemMatch: {
        _id: review._id, updatedAt: review.updatedAt || null, ...(req.user.role === 'admin' ? {} : { user: req.user._id }),
    } } }, { $filter: { input: '$reviews', as: 'review', cond: { $ne: ['$$review._id', review._id] } } });
    if (!product) throw reviewError('Review changed. Reload and try again.', 409, 'REVIEW_CHANGED');
    await reviewUpload.remove(review.images);
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
