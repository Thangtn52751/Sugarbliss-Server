/**
 * Trang ket qua thanh toan ZaloPay.
 * ZaloPay redirect ve day kem query: ?apptransid=...&status=...
 * KHONG tin status tren URL - goi API status cua server de xac nhan that.
 */
const RESULT_API_BASE_URL = window.SugarBlissApi.baseUrl;

document.addEventListener("DOMContentLoaded", () => {
    resolvePaymentResult();
});

function getQueryParam(name) {
    return new URLSearchParams(window.location.search).get(name);
}

async function resolvePaymentResult() {
    const token = localStorage.getItem("sugarBlissToken");
    if (!token) {
        window.location.href = "/login";
        return;
    }

    // ZaloPay tra ve apptransid (chu thuong). Ho tro ca appTransId phong khi khac.
    const appTransId = getQueryParam("apptransid") || getQueryParam("appTransId");

    if (!appTransId) {
        renderResult("failed", "Missing transaction information", "We could not find the transaction reference.");
        return;
    }

    // Callback co the chua kip xu ly -> thu lai vai lan
    let status = "Pending";
    let orderNumber = "";

    for (let attempt = 0; attempt < 5; attempt += 1) {
        try {
            const response = await fetch(
                `${RESULT_API_BASE_URL}/api/payments/zalopay/status/${encodeURIComponent(appTransId)}`,
                { headers: { Authorization: `Bearer ${token}` } }
            );
            const data = await response.json();

            if (response.status === 401) {
                window.location.href = "/login";
                return;
            }

            if (response.ok) {
                status = data.paymentStatus;
                orderNumber = data.orderNumber || "";
                if (status === "Paid" || status === "Failed") {
                    break;
                }
            }
        } catch (error) {
            // bo qua, thu lai
        }

        // cho 1.5s roi thu lai
        await new Promise((resolve) => setTimeout(resolve, 1500));
    }

    if (status === "Paid") {
        renderResult("success", "Payment Successful!", "Thank you! Your ZaloPay payment has been confirmed.", orderNumber);
    } else if (status === "Failed") {
        renderResult("failed", "Payment Failed", "Your payment was not completed. Please try again.", orderNumber);
    } else {
        renderResult("pending", "Payment Pending", "We haven't received confirmation yet. It may take a moment - check My Orders later.", orderNumber);
    }
}

function renderResult(type, title, message, orderNumber) {
    const icon = document.querySelector("[data-result-icon]");
    const titleEl = document.querySelector("[data-result-title]");
    const messageEl = document.querySelector("[data-result-message]");
    const orderEl = document.querySelector("[data-result-order]");

    const icons = { success: "✓", pending: "⏳", failed: "✕" };

    icon.className = `result-icon ${type}`;
    icon.textContent = icons[type] || "⏳";
    titleEl.textContent = title;
    messageEl.textContent = message;

    if (orderNumber) {
        orderEl.hidden = false;
        orderEl.textContent = `Order: ${orderNumber}`;
    }
}
