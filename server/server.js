require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const connectDB = require('./config/db');
const productRoutes = require('./routes/productRoutes');
const userRoutes = require('./routes/userRoutes');
const orderRoutes = require('./routes/orderRoutes');
const specialOrderRoutes = require('./routes/specialOrderRoutes');
const contactRoutes = require('./routes/contactRoutes');
const requestLogger = require('./middleware/requestLogger');

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(requestLogger);
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

connectDB()
    .then(() => console.log('MongoDB connected successfully!'))
    .catch((err) => {
        console.error('MongoDB connection error:', err);
        process.exit(1);
    });

app.get('/', (req, res) => {
    res.json({
        message: 'SugarBliss API is running!',
        endpoints: {
            products: '/api/products',
            users: '/api/users',
            orders: '/api/orders',
            specialOrders: '/api/special-orders',
            contact: '/api/contact',
        },
    });
});

app.use('/api/products', productRoutes);
app.use('/api/users', userRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/special-orders', specialOrderRoutes);
app.use('/api/contact', contactRoutes);

app.use((req, res) => {
    res.status(404).json({ message: 'API not found' });
});

app.use((err, req, res, next) => {
    let statusCode = err.statusCode || (res.statusCode === 200 ? 500 : res.statusCode);

    if (err.name === 'ValidationError' || err.name === 'CastError') {
        statusCode = 400;
    }

    if (err.code === 11000) {
        statusCode = 409;
    }

    res.status(statusCode).json({
        message: err.message || 'Server error',
        stack: process.env.NODE_ENV === 'production' ? undefined : err.stack,
    });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
