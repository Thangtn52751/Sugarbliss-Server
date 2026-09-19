const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    rating: {
        type: Number,
        required: true,
        min: 1,
        max: 5,
    },
    comment: {
        type: String,
        required: true,
        trim: true,
        maxlength: 1000,
    },
}, {
    timestamps: true,
});

const productSchema = new mongoose.Schema({
    name: {
        type: String,
        trim: true,
        required: true,
    },
    slug: {
        type: String,
        lowercase: true,
        trim: true,
        unique: true,
    },
    description: {
        type: String,
        trim: true,
        required: true,
    },
    price: {
        type: Number,
        required: true,
        min: 0,
    },
    images: {
        type: [{
            type: String,
            trim: true,
        }],
        validate: {
            validator: (images) => Array.isArray(images) && images.length > 0,
            message: 'At least one product image is required.',
        },
    },
    category: {
        type: String,
        trim: true,
        required: true,
    },
    stock: {
        type: Number,
        default: 0,
        min: 0,
    },
    ingredients: [{
        type: String,
        trim: true,
    }],
    allergens: [{
        type: String,
        trim: true,
    }],
    weightGram: {
        type: Number,
        min: 0,
    },
    shelfLifeDays: {
        type: Number,
        min: 0,
    },
    featured: {
        type: Boolean,
        default: false,
    },
    status: {
        type: String,
        enum: ['active', 'inactive', 'out-of-stock'],
        default: 'active',
    },
    reviews: [reviewSchema],
    ratingAverage: {
        type: Number,
        default: 0,
        min: 0,
        max: 5,
    },
    reviewCount: {
        type: Number,
        default: 0,
        min: 0,
    },
}, {
    timestamps: true,
});

productSchema.methods.updateReviewSummary = function updateReviewSummary() {
    this.reviewCount = this.reviews.length;
    this.ratingAverage = this.reviewCount
        ? Number((this.reviews.reduce((total, review) => total + review.rating, 0) / this.reviewCount).toFixed(1))
        : 0;
};

productSchema.pre('validate', function createSlug(next) {
    if (this.isModified('name') || !this.slug) {
        this.slug = this.name
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/(^-|-$)+/g, '');
    }

    next();
});

module.exports = mongoose.model('Product', productSchema);
