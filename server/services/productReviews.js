const Product = require('../models/Product');
const Order = require('../models/Order');

const reviewError = (message, statusCode = 400, code = 'REVIEW_INVALID_INPUT') =>
    Object.assign(new Error(message), { statusCode, code });

async function hasSuccessfulOrder(productId, userId) {
    return Boolean(await Order.exists({
        user: userId,
        status: { $in: ['In Progress', 'Delivered'] },
        $and: [
            { $or: [{ items: { $elemMatch: { product: productId, quantity: { $gt: 0 } } } }, {
                $and: [{ product: productId }, { $or: [{ items: { $exists: false } }, { items: { $size: 0 } }] }],
            }] },
            { $or: [{ paymentStatus: 'Paid' }, { paymentMethod: 'COD', paymentStatus: 'Pending' }] },
        ],
    }));
}

async function requirePurchase(productId, userId) {
    if (!await hasSuccessfulOrder(productId, userId)) {
        throw reviewError('Place a successful order for this product before reviewing it. Online payments must be confirmed.', 403, 'REVIEW_PURCHASE_REQUIRED');
    }
}

async function eligibility(product, userId) {
    if (product.reviews.some(review => String(review.user?._id || review.user) === String(userId))) {
        return { canReview: false, reason: 'ALREADY_REVIEWED' };
    }
    return await hasSuccessfulOrder(product._id, userId)
        ? { canReview: true, reason: null }
        : { canReview: false, reason: 'PURCHASE_REQUIRED' };
}

function reviewInput(body = {}, partial = false) {
    if (!body || Array.isArray(body) || Object.keys(body).some(key => !['rating', 'comment'].includes(key))) {
        throw reviewError('Only rating, comment and uploaded image files are accepted.');
    }
    const input = {};
    if (!partial || body.rating !== undefined) {
        if (!['string', 'number'].includes(typeof body.rating) || !/^[1-5]$/.test(String(body.rating))) {
            throw reviewError('Rating must be an integer from 1 to 5.');
        }
        input.rating = Number(body.rating);
    }
    if (!partial || body.comment !== undefined) {
        if (typeof body.comment !== 'string' || !body.comment.trim() || body.comment.trim().length > 1000) {
            throw reviewError('Write a review of 1 to 1000 characters.');
        }
        input.comment = body.comment.trim();
    }
    return input;
}

// Change the embedded reviews and their summary together, without saving stale stock or losing other reviewers.
async function updateReviews(filter, expression) {
    return Product.findOneAndUpdate(filter, [
        { $set: { reviews: expression } },
        { $set: { reviewCount: { $size: '$reviews' }, ratingAverage: { $round: [{ $ifNull: [{ $avg: '$reviews.rating' }, 0] }, 1] } } },
    ], { new: true });
}

module.exports = { eligibility, requirePurchase, reviewInput, updateReviews, reviewError };
