const mongoose = require('mongoose');
const Category = require('../models/Category');
require('dotenv').config();

const escapeRegex = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const connectDB = async () => {
    if (!process.env.MONGO_URI) {
        throw new Error('MONGO_URI is missing in the .env file.');
    }

    const connection = await mongoose.connect(process.env.MONGO_URI, {
        dbName: process.env.MONGO_DB_NAME || 'sugarbliss',
        serverSelectionTimeoutMS: 5000,
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

    // Convert legacy category names into shared category documents and link products by ObjectId.
    const legacyProducts = await products.find({ category: { $type: 'string' } }, { projection: { _id: 1, category: 1 } }).toArray();
    const categoryIds = new Map();
    for (const product of legacyProducts) {
        const name = String(product.category || '').trim() || 'Other';
        const key = name.toLocaleLowerCase();
        let categoryId = categoryIds.get(key);
        if (!categoryId) {
            let category = await Category.findOne({ name: new RegExp(`^${escapeRegex(name)}$`, 'i') });
            if (!category) category = await Category.create({ name });
            categoryId = category._id;
            categoryIds.set(key, categoryId);
        }
        await products.updateOne({ _id: product._id, category: product.category }, { $set: { category: categoryId } });
    }
    if (legacyProducts.length) console.log(`Migrated ${legacyProducts.length} product category link(s).`);
};

module.exports = connectDB;
