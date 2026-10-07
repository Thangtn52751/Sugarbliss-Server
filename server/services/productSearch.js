const Product = require('../models/Product');

const MIN_QUERY_LENGTH = 2;
const MAX_QUERY_LENGTH = 80;
const DEFAULT_LIMIT = 6;
const MAX_LIMIT = 10;
const CANDIDATE_LIMIT = 40;

const fail = (message, statusCode = 400, code = 'INVALID_SEARCH_QUERY') => {
    const error = new Error(message);
    error.statusCode = statusCode;
    error.code = code;
    return error;
};

const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const foldText = (value) => String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

const normalizeQuery = (value) => {
    const query = String(value || '').replace(/\s+/g, ' ').trim();

    if (query.length < MIN_QUERY_LENGTH) {
        throw fail(`Search query must contain at least ${MIN_QUERY_LENGTH} characters.`);
    }

    if (query.length > MAX_QUERY_LENGTH) {
        throw fail(`Search query must not exceed ${MAX_QUERY_LENGTH} characters.`);
    }

    return query;
};

const normalizeLimit = (value) => {
    const parsed = Number.parseInt(value, 10);

    if (!Number.isFinite(parsed)) {
        return DEFAULT_LIMIT;
    }

    return Math.min(Math.max(parsed, 1), MAX_LIMIT);
};

const relevanceScore = (product, foldedQuery) => {
    const name = foldText(product.name);
    const category = foldText(product.category);

    if (name === foldedQuery) return 0;
    if (name.startsWith(foldedQuery)) return 1;
    if (name.includes(foldedQuery)) return 2;
    if (category.startsWith(foldedQuery)) return 3;
    if (category.includes(foldedQuery)) return 4;
    return 5;
};

const toSuggestion = (product) => ({
    id: String(product._id),
    name: product.name,
    price: Number(product.price),
    image: Array.isArray(product.images) ? product.images[0] || '' : '',
    category: product.category,
    inStock: Number(product.stock) > 0,
});

const searchProducts = async (queryValue, limitValue) => {
    const query = normalizeQuery(queryValue);
    const limit = normalizeLimit(limitValue);
    const pattern = new RegExp(escapeRegex(query), 'i');
    const products = await Product.find({
        status: 'active',
        $or: [
            { name: pattern },
            { category: pattern },
            { description: pattern },
        ],
    })
        .select('_id name price images category stock')
        .limit(CANDIDATE_LIMIT)
        .lean();
    const foldedQuery = foldText(query);

    return {
        query,
        suggestions: products
            .sort((left, right) => {
                const scoreDifference = relevanceScore(left, foldedQuery) - relevanceScore(right, foldedQuery);
                return scoreDifference || String(left.name).localeCompare(String(right.name));
            })
            .slice(0, limit)
            .map(toSuggestion),
    };
};

module.exports = {
    escapeRegex,
    normalizeLimit,
    normalizeQuery,
    searchProducts,
};
