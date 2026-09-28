/**
 * Cau hinh ZaloPay.
 *
 * Mac dinh su dung bo credential SANDBOX cong khai cua ZaloPay (chi de thu nghiem,
 * KHONG dung cho production). Co the ghi de bang bien moi truong trong file .env:
 *   ZALOPAY_APP_ID, ZALOPAY_KEY1, ZALOPAY_KEY2,
 *   ZALOPAY_CREATE_ENDPOINT, ZALOPAY_QUERY_ENDPOINT,
 *   ZALOPAY_CALLBACK_URL, ZALOPAY_REDIRECT_URL
 *
 * Tai lieu: https://docs.zalopay.vn/v2/
 */
const ZALOPAY_CONFIG = {
    // Bo credential sandbox demo cong khai cua ZaloPay
    appId: process.env.ZALOPAY_APP_ID || '2553',
    key1: process.env.ZALOPAY_KEY1 || 'PcY4iZIKFCIdgZvA6ueMcMHHUbRLYjPL',
    key2: process.env.ZALOPAY_KEY2 || 'kLtgPl8HHhfvMuDHPwKfgfsY4Ydm9eIz',

    // Endpoint sandbox
    createEndpoint: process.env.ZALOPAY_CREATE_ENDPOINT || 'https://sb-openapi.zalopay.vn/v2/create',
    queryEndpoint: process.env.ZALOPAY_QUERY_ENDPOINT || 'https://sb-openapi.zalopay.vn/v2/query',

    // URL ZaloPay goi nguoc ve server sau khi thanh toan (server-to-server IPN).
    // Khi test local phai la URL cong khai (vd ngrok): https://xxxx.ngrok-free.app/api/payments/zalopay/callback
    callbackUrl: process.env.ZALOPAY_CALLBACK_URL || '',

    // URL frontend ma nguoi dung duoc chuyen ve sau khi thanh toan xong.
    redirectUrl: process.env.ZALOPAY_REDIRECT_URL || 'http://localhost:8080/pages/payment-result.html',
};

module.exports = ZALOPAY_CONFIG;
