require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const connectDB = require('./config/db');
const productRoutes = require('./routes/productRoutes');
const userRoutes = require('./routes/userRoutes');

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

connectDB()
    .then(() => console.log('Ket noi MongoDB thanh cong!'))
    .catch((err) => {
        console.error('Loi ket noi MongoDB:', err);
        process.exit(1);
    });

app.get('/', (req, res) => {
    res.json({
        message: 'SugarBliss API dang chay!',
        endpoints: {
            products: '/api/products',
            users: '/api/users',
        },
    });
});

app.use('/api/products', productRoutes);
app.use('/api/users', userRoutes);

app.use((req, res) => {
    res.status(404).json({ message: 'Khong tim thay API' });
});

app.use((err, req, res, next) => {
    const statusCode = res.statusCode === 200 ? 500 : res.statusCode;
    res.status(statusCode).json({
        message: err.message || 'Loi server',
        stack: process.env.NODE_ENV === 'production' ? undefined : err.stack,
    });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Server chay tai http://localhost:${PORT}`);
});
