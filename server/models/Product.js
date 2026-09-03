const mongoose = require('mongoose');

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
    image: {
        type: String,
        required: true,
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
}, {
    timestamps: true,
});

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
