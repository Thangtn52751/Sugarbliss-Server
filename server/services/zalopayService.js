/**
 * ZaloPay service - dong goi giao tiep voi cong thanh toan ZaloPay (sandbox).
 *
 * Tham khao dac ta API v2: https://docs.zalopay.vn/v2/
 * Cac ham chinh:
 *   - createPayment(order): tao giao dich, tra ve { order_url, app_trans_id, raw }
 *   - verifyCallback(dataStr, reqMac): xac thuc chu ky callback bang key2
 *   - queryOrderStatus(appTransId): tra cuu trang thai giao dich
 */
const crypto = require('crypto');
const config = require('../config/zalopay');

// Tao app_trans_id theo dinh dang bat buoc cua ZaloPay: yymmdd_<chuoi duy nhat>
function buildAppTransId(orderNumber) {
    const now = new Date();
    const yy = String(now.getFullYear()).slice(-2);
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    // orderNumber dang SB-<ts>-<rand>, bo dau '-' cho gon
    const suffix = String(orderNumber).replace(/-/g, '').slice(-20);
    return `${yy}${mm}${dd}_${suffix}`;
}

function hmacSha256(key, data) {
    return crypto.createHmac('sha256', key).update(data).digest('hex');
}

/**
 * Tao giao dich thanh toan tren ZaloPay.
 * @param {Object} order - document Order cua Mongoose
 * @returns {Promise<{orderUrl: string, appTransId: string, raw: object}>}
 */
async function createPayment(order) {
    const appTransId = buildAppTransId(order.orderNumber);
    const appTime = Date.now();
    const amount = Math.round(Number(order.total));

    // embed_data: du lieu di kem, chua redirecturl de ZaloPay chuyen nguoi dung ve sau khi thanh toan
    const embedData = {
        redirecturl: config.redirectUrl,
        orderNumber: order.orderNumber,
    };

    // items: danh sach san pham (ZaloPay yeu cau la chuoi JSON)
    const items = (order.items || []).map((it) => ({
        itemid: String(it.product || ''),
        itemname: it.name,
        itemprice: it.price,
        itemquantity: it.quantity,
    }));

    const params = {
        app_id: Number(config.appId),
        app_trans_id: appTransId,
        app_user: String(order.user),
        app_time: appTime,
        item: JSON.stringify(items),
        embed_data: JSON.stringify(embedData),
        amount,
        description: `Sugar Bliss - Thanh toan don hang ${order.orderNumber}`,
        bank_code: '',
    };

    // Neu co callback URL cong khai (ngrok/production) thi gui len de ZaloPay goi IPN
    if (config.callbackUrl) {
        params.callback_url = config.callbackUrl;
    }

    // MAC theo dac ta create: app_id|app_trans_id|app_user|amount|app_time|embed_data|item  (ky bang key1)
    const macData = [
        params.app_id,
        params.app_trans_id,
        params.app_user,
        params.amount,
        params.app_time,
        params.embed_data,
        params.item,
    ].join('|');
    params.mac = hmacSha256(config.key1, macData);

    const response = await fetch(config.createEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(params).toString(),
    });

    const result = await response.json();

    // return_code === 1 nghia la tao giao dich thanh cong
    if (result.return_code !== 1 || !result.order_url) {
        const error = new Error(result.return_message || result.sub_return_message || 'Cannot create ZaloPay transaction.');
        error.statusCode = 502;
        error.zalopay = result;
        throw error;
    }

    return {
        orderUrl: result.order_url,
        appTransId,
        raw: result,
    };
}

/**
 * Xac thuc chu ky callback tu ZaloPay bang key2.
 * @param {string} dataStr - truong `data` (chuoi JSON) trong body callback
 * @param {string} reqMac - truong `mac` trong body callback
 * @returns {boolean}
 */
function verifyCallback(dataStr, reqMac) {
    const expectedMac = hmacSha256(config.key2, dataStr);
    // So sanh an toan chong timing attack
    const a = Buffer.from(expectedMac);
    const b = Buffer.from(String(reqMac || ''));
    return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * Tra cuu trang thai giao dich (dung de reconcile khi khong co callback).
 * @param {string} appTransId
 * @returns {Promise<object>} ket qua tho tu ZaloPay (return_code: 1=thanh cong, 2=that bai, 3=dang xu ly)
 */
async function queryOrderStatus(appTransId) {
    // MAC theo dac ta query: app_id|app_trans_id|key1  (ky bang key1)
    const macData = `${config.appId}|${appTransId}|${config.key1}`;
    const params = {
        app_id: Number(config.appId),
        app_trans_id: appTransId,
        mac: hmacSha256(config.key1, macData),
    };

    const response = await fetch(config.queryEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(params).toString(),
    });

    return response.json();
}

module.exports = {
    buildAppTransId,
    createPayment,
    verifyCallback,
    queryOrderStatus,
};
