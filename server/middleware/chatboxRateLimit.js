const requestWindows = new Map();

const readLimit = () => {
    const parsed = Number.parseInt(process.env.CHATBOX_RATE_LIMIT_PER_MINUTE, 10);
    return Number.isFinite(parsed) ? Math.min(Math.max(parsed, 1), 60) : 10;
};

const chatboxRateLimit = (req, res, next) => {
    const now = Date.now();
    const windowMs = 60000;
    const key = String(req.user._id);
    const current = requestWindows.get(key);
    const bucket = !current || now - current.startedAt >= windowMs
        ? { startedAt: now, count: 0 }
        : current;
    const limit = readLimit();

    if (bucket.count >= limit) {
        const retryAfterSeconds = Math.max(Math.ceil((windowMs - (now - bucket.startedAt)) / 1000), 1);
        res.set('Retry-After', String(retryAfterSeconds));
        res.status(429);

        const error = new Error('Too many AI chat requests. Please wait a moment and try again.');
        error.code = 'CHAT_RATE_LIMITED';
        return next(error);
    }

    bucket.count += 1;
    requestWindows.set(key, bucket);

    if (requestWindows.size > 1000) {
        for (const [requestKey, value] of requestWindows) {
            if (now - value.startedAt >= windowMs) requestWindows.delete(requestKey);
        }
    }

    return next();
};

module.exports = chatboxRateLimit;
