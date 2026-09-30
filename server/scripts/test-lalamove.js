const lalamove = require('../services/lalamove');

async function main() {
    if (process.argv.includes('--debug')) process.env.LALAMOVE_DEBUG = 'true';
    if (process.argv.includes('--quote')) {
        const { shippingAddress } = require('../postman/lalamove-hanoi-quote.json');
        const result = await lalamove.getQuotation(lalamove.normalizeAddress(shippingAddress));
        console.log(JSON.stringify({ success: true, quotationId: result.quotationId,
            fee: result.fee, currency: 'VND', expiresAt: result.expiresAt, stopIds: result.stopIds }, null, 2));
        return;
    }
    const result = await lalamove.testLalamoveConnection();
    if (result.success) result.cities = result.cities.map(({ name, locode, services }) => ({ name, locode,
        services: services?.map(({ key, description }) => ({ key, description })) }));
    console.log(JSON.stringify(result, null, 2));
    if (!result.success) process.exitCode = 1;
}

main().catch((error) => {
    console.error(JSON.stringify({ success: false, error: { code: error.code, message: error.message, ...error.details } }, null, 2));
    process.exitCode = 1;
});
