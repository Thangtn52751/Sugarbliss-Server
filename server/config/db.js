const mongoose = require('mongoose');
require('dotenv').config();

const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
    } catch (err) {
        console.error('❌ Lỗi kết nối DB:', err);
        process.exit(1);
    }
};

module.exports = connectDB;
