const fs = require('fs');
const path = require('path');
const multer = require('multer');

const uploadRoot = path.join(__dirname, '..', 'uploads');

const ensureUploadDir = (folder) => {
    const dir = path.join(uploadRoot, folder);
    fs.mkdirSync(dir, { recursive: true });
    return dir;
};

const storage = multer.diskStorage({
    destination(req, file, cb) {
        const folder = file.fieldname === 'avatar' ? 'avatars' : 'products';
        cb(null, ensureUploadDir(folder));
    },
    filename(req, file, cb) {
        const ext = path.extname(file.originalname).toLowerCase();
        const safeName = path
            .basename(file.originalname, ext)
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/(^-|-$)+/g, '');

        cb(null, `${file.fieldname}-${safeName || 'image'}-${Date.now()}${ext}`);
    },
});

const fileFilter = (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
        return cb(new Error('Chi chap nhan file anh'));
    }

    cb(null, true);
};

const upload = multer({
    storage,
    fileFilter,
    limits: {
        fileSize: 5 * 1024 * 1024,
    },
});

module.exports = upload;
