const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true,
    },
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true,
        match: [/^\S+@\S+\.\S+$/, 'Email khong hop le'],
    },
    password: {
        type: String,
        required: true,
        minlength: 6,
        select: false,
    },
    phone: {
        type: String,
        trim: true,
    },
    address: {
        type: String,
        trim: true,
    },
    avatar: {
        type: String,
        default: '',
    },
    role: {
        type: String,
        enum: ['customer', 'admin'],
        default: 'customer',
    },
    isActive: {
        type: Boolean,
        default: true,
    },
}, {
    timestamps: true,
});

userSchema.pre('save', async function hashPassword(next) {
    if (!this.isModified('password')) {
        return next();
    }

    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
});

userSchema.methods.matchPassword = function matchPassword(password) {
    return bcrypt.compare(password, this.password);
};

module.exports = mongoose.model('User', userSchema);
