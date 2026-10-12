const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const multer = require('multer');
const { reviewError } = require('../services/productReviews');

const directory = path.join(__dirname, '..', 'uploads', 'reviews');
const extensions = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const parse = multer({
    storage: multer.memoryStorage(),
    limits: { files: 5, fileSize: 5 * 1024 * 1024, fields: 2, fieldSize: 4096, parts: 8 },
    fileFilter(req, file, callback) {
        callback(extensions[file.mimetype] ? null : reviewError('Review photos must be JPG, PNG or WebP.'), Boolean(extensions[file.mimetype]));
    },
}).array('images', 5);

function upload(req, res, next) {
    parse(req, res, error => next(error ? reviewError(error.message, 400, 'REVIEW_UPLOAD_ERROR') : undefined));
}

function validImage(file) {
    const bytes = file.buffer;
    if (!bytes?.length) return false;
    if (file.mimetype === 'image/png') return bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    if (file.mimetype === 'image/jpeg') return bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
    return file.mimetype === 'image/webp' && bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
}

async function remove(images = []) {
    for (const image of images) {
        if (!/^\/uploads\/reviews\/[a-f\d-]{36}\.(jpg|png|webp)$/.test(image)) continue;
        try { await fs.unlink(path.join(directory, path.basename(image))); }
        catch (error) { if (error.code !== 'ENOENT') console.error('Cannot remove review photo:', error.code); }
    }
}

async function store(files = []) {
    if (files.some(file => !validImage(file))) throw reviewError('One or more review photos are not valid JPG, PNG or WebP files.', 400, 'REVIEW_UPLOAD_ERROR');
    const images = [];
    if (!files.length) return images;
    await fs.mkdir(directory, { recursive: true });
    try {
        for (const file of files) {
            const filename = `${randomUUID()}.${extensions[file.mimetype]}`;
            images.push(`/uploads/reviews/${filename}`);
            await fs.writeFile(path.join(directory, filename), file.buffer, { flag: 'wx' });
        }
        return images;
    } catch (error) { await remove(images); throw error; }
}

module.exports = { upload, store, remove };
