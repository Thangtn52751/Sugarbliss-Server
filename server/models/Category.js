const mongoose = require('mongoose');

const categorySchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true, maxlength: 80 },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
}, { timestamps: true });

categorySchema.pre('validate', function createSlug(next) {
    if (this.isModified('name') || !this.slug) {
        this.slug = this.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
    }
    next();
});

module.exports = mongoose.model('Category', categorySchema);
