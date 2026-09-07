const sensitiveKeys = ['password', 'token', 'authorization'];

const sanitizeValue = (value) => {
    if (!value || typeof value !== 'object') {
        return value;
    }

    if (Array.isArray(value)) {
        return value.map(sanitizeValue);
    }

    return Object.fromEntries(
        Object.entries(value).map(([key, item]) => {
            const isSensitive = sensitiveKeys.some((sensitiveKey) =>
                key.toLowerCase().includes(sensitiveKey)
            );

            return [key, isSensitive ? '[hidden]' : sanitizeValue(item)];
        })
    );
};

const requestLogger = (req, res, next) => {
    const startedAt = Date.now();
    const startedTime = new Date().toISOString();

    console.log(`[${startedTime}] --> ${req.method} ${req.originalUrl}`);

    res.on('finish', () => {
        const durationMs = Date.now() - startedAt;
        const query = Object.keys(req.query || {}).length
            ? ` query=${JSON.stringify(sanitizeValue(req.query))}`
            : '';
        const body = Object.keys(req.body || {}).length
            ? ` body=${JSON.stringify(sanitizeValue(req.body))}`
            : '';

        console.log(
            `[${new Date().toISOString()}] <-- ${req.method} ${req.originalUrl} ${res.statusCode} ${durationMs}ms${query}${body}`
        );
    });

    next();
};

module.exports = requestLogger;
