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

    const products = connection.connection.collection('products');
    const migrationResult = await products.updateMany(
        {
            image: { $type: 'string', $ne: '' },
            $or: [
                { images: { $exists: false } },
                { images: { $size: 0 } },
            ],
        },
        [{ $set: { images: ['$image'] } }, { $unset: 'image' }],
    );

    if (migrationResult.modifiedCount > 0) {
        console.log(`Migrated ${migrationResult.modifiedCount} product image(s) to the images array.`);
    }
};

module.exports = connectDB;
