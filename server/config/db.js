const mongoose = require('mongoose');
require('dotenv').config();

const connectDB = async () => {
    if (!process.env.MONGO_URI) {
        throw new Error('MONGO_URI is missing in the .env file.');
    }

    const connection = await mongoose.connect(process.env.MONGO_URI, {
        dbName: process.env.MONGO_DB_NAME || 'sugarbliss',
    });

    console.log(`MongoDB database: ${connection.connection.name}`);
};

module.exports = connectDB;
