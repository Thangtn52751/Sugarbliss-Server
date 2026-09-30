const ORDER_API_BASE_URL = window.SugarBlissApi.baseUrl;
const ORDERS_PER_PAGE = 4;
const DELIVERY_SYNC_INTERVAL_MS = 30000;
const TERMINAL_DELIVERY_STATUSES = new Set(["COMPLETED", "CANCELED", "REJECTED", "EXPIRED", "FAILED"]);
let allOrders = [];
let filteredOrders = [];
let currentOrderPage = 1;
let currentSearchQuery = "";
let orderSearchTimer;
let orderRequestController;
let deliverySyncTimer;
let deliverySyncing = false;

document.addEventListener("DOMContentLoaded", () => {
    document.querySelector("[data-order-search]")?.addEventListener("input", handleOrderSearch);
    document.querySelector("[data-order-list]")?.addEventListener("click", handleOrderAction);
    document.querySelector("[data-order-previous]")?.addEventListener("click", () => changeOrderPage(-1));
    document.querySelector("[data-order-next]")?.addEventListener("click", () => changeOrderPage(1));
    document.addEventListener("visibilitychange", () => {
        if (document.hidden) window.clearTimeout(deliverySyncTimer);
        else scheduleDeliverySync(0);
    });
    window.addEventListener("pagehide", () => window.clearTimeout(deliverySyncTimer));
    loadOrderHistory();
});

async function loadOrderHistory(searchQuery = "") {
    const token = localStorage.getItem("sugarBlissToken");
    const state = document.querySelector("[data-order-state]");

    if (!token) {
        window.location.href = "/login";
        return;
    }

    state.hidden = false;
    state.classList.remove("is-error");
    state.textContent = "Loading orders...";

    orderRequestController?.abort();
    orderRequestController = new AbortController();
    currentSearchQuery = searchQuery;

    try {
        const queryString = searchQuery ? `?search=${encodeURIComponent(searchQuery)}` : "";
        const response = await fetch(`${ORDER_API_BASE_URL}/api/orders/my${queryString}`, {
            headers: {
                Authorization: `Bearer ${token}`
            },
            signal: orderRequestController.signal
        });
        const data = await response.json();

        if (response.status === 401) {
            clearSessionAndLogin();
            return;
        }

        if (!response.ok) {
            throw new Error(data.message || "Cannot load order history.");
        }

        allOrders = Array.isArray(data) ? data : [];
        filteredOrders = [...allOrders];
        currentOrderPage = 1;
        renderOrderHistory();
        scheduleDeliverySync(500);
    } catch (error) {
        if (error.name === "AbortError") {
            return;
        }

        state.hidden = false;
        state.classList.add("is-error");
        state.textContent = error.message;
    }
}

function handleOrderSearch(event) {
    const query = event.target.value.trim().toLowerCase();

    window.clearTimeout(orderSearchTimer);
    orderSearchTimer = window.setTimeout(() => loadOrderHistory(query), 350);
}

function renderOrderHistory() {
    const list = document.querySelector("[data-order-list]");
    const state = document.querySelector("[data-order-state]");
    const pagination = document.querySelector("[data-order-pagination]");
    const pageCount = Math.max(Math.ceil(filteredOrders.length / ORDERS_PER_PAGE), 1);

    currentOrderPage = Math.min(currentOrderPage, pageCount);

    if (filteredOrders.length === 0) {
        list.replaceChildren();
        state.hidden = false;
        state.classList.remove("is-error");
        state.textContent = currentSearchQuery ? "No orders match your search." : "You have no orders yet.";
        pagination.hidden = true;
        return;
    }

    const start = (currentOrderPage - 1) * ORDERS_PER_PAGE;
    const pageOrders = filteredOrders.slice(start, start + ORDERS_PER_PAGE);

    state.hidden = true;
    list.innerHTML = pageOrders.map(renderOrderCard).join("");
    pagination.hidden = false;
    document.querySelector("[data-order-summary]").textContent = `Showing ${start + 1}-${Math.min(start + ORDERS_PER_PAGE, filteredOrders.length)} of ${filteredOrders.length} orders`;
    document.querySelector("[data-order-page]").textContent = `${currentOrderPage} / ${pageCount}`;
    document.querySelector("[data-order-previous]").disabled = currentOrderPage === 1;
    document.querySelector("[data-order-next]").disabled = currentOrderPage === pageCount;
}

function renderOrderCard(order) {
    const orderId = String(order.id || order._id || "");
    const items = Array.isArray(order.items) ? order.items : [];
    const safeId = escapeHtml(orderId);
    const displayStatus = getOrderDisplayStatus(order);

    return `
        <article class="order-card" data-order-card="${safeId}">
            <header class="order-card-head">
                <div class="order-meta"><span>Order placed</span><strong>${escapeHtml(order.orderedOn || "Updating")}</strong></div>
                <div class="order-meta"><span>Total</span><strong>${formatVnd(order.total)}</strong></div>
                <div class="order-meta"><span>Order no.</span><strong>${escapeHtml(order.orderNumber || orderId)}</strong></div>
                <span class="history-status ${getStatusClass(order)}">${escapeHtml(displayStatus)}</span>
            </header>

            <div class="order-items">
                ${items.length ? items.map(renderOrderItem).join("") : renderLegacyOrderItem(order)}
            </div>

            <div class="order-details" data-order-details hidden>
                <div><span>Recipient</span><p>${escapeHtml(order.shippingAddress?.recipientName || "Not provided")}</p></div>
                <div><span>Delivery address</span><p>${escapeHtml(order.shippingAddress?.address || "Not provided")}</p></div>
                <div><span>Delivery method</span><p>${escapeHtml(formatDeliveryMethod(order.deliveryMethod))}</p></div>
                <div><span>Payment</span><p>${escapeHtml(order.paymentMethod || "COD")} / ${escapeHtml(order.paymentStatus || "Pending")}</p></div>
                ${order.shippingProvider === "lalamove" ? `
                    <div><span>Lalamove delivery</span><p>${escapeHtml(formatShippingStatus(order.shippingStatus))}</p></div>
                    <div><span>Delivery number</span><p>${escapeHtml(order.shippingOrderId || "Awaiting confirmation")}</p></div>
                ` : ""}
            </div>
            ${order.shippingError ? `<p class="delivery-issue" role="status">${escapeHtml(order.shippingError)}</p>` : ""}

            <footer class="order-card-actions">
                <button class="order-text-button" type="button" data-view-order="${safeId}" aria-expanded="false">View order details</button>
                <button class="order-text-button" type="button" data-download-order="${safeId}">Download invoice</button>
                ${canSyncDelivery(order) ? `<button class="order-text-button" type="button" data-refresh-shipping="${safeId}">Refresh delivery</button>` : ""}
                ${renderTrackingLink(order.shippingTrackingUrl)}
                ${order.status === "In Progress" ? `<button class="order-cancel-button" type="button" data-cancel-order="${safeId}">Cancel Order</button>` : ""}
            </footer>
        </article>
    `;
}

function renderOrderItem(item) {
    return `
        <div class="order-item-row">
            <img src="${escapeHtml(resolveOrderImage(item.image))}" alt="${escapeHtml(item.name || "Sugar Bliss product")}">
            <div class="order-item-info">
                <h3>${escapeHtml(item.name || "Sugar Bliss Product")}</h3>
                <p>Quantity: ${escapeHtml(item.quantity || 1)}</p>
            </div>
            <strong class="order-item-price">${formatVnd(item.lineTotal ?? Number(item.price || 0) * Number(item.quantity || 1))}</strong>
        </div>
    `;
}

function renderLegacyOrderItem(order) {
    return `
        <div class="order-item-row">
            <img src="/assets/images/cake2.png" alt="${escapeHtml(order.productName || "Sugar Bliss product")}">
            <div class="order-item-info"><h3>${escapeHtml(order.productName || "Sugar Bliss Product")}</h3><p>Quantity: 1</p></div>
            <strong class="order-item-price">${formatVnd(order.total)}</strong>
        </div>
    `;
}

function handleOrderAction(event) {
    const detailButton = event.target.closest("[data-view-order]");
    const downloadButton = event.target.closest("[data-download-order]");
    const cancelButton = event.target.closest("[data-cancel-order]");
    const refreshButton = event.target.closest("[data-refresh-shipping]");

    if (refreshButton) {
        refreshDelivery(refreshButton.dataset.refreshShipping, refreshButton);
    } else if (detailButton) {
        toggleOrderDetails(detailButton);
    } else if (downloadButton) {
        downloadInvoice(downloadButton.dataset.downloadOrder);
    } else if (cancelButton) {
        cancelOrder(cancelButton.dataset.cancelOrder, cancelButton);
    }
}

function toggleOrderDetails(button) {
    const details = button.closest("[data-order-card]")?.querySelector("[data-order-details]");

    if (!details) {
        return;
    }

    const isOpening = details.hidden;
    details.hidden = !isOpening;
    button.setAttribute("aria-expanded", String(isOpening));
    button.textContent = isOpening ? "Hide order details" : "View order details";
}

async function cancelOrder(orderId, button) {
    const token = localStorage.getItem("sugarBlissToken");

    if (!window.confirm("Cancel this order? Reserved stock will be restored.")) {
        return;
    }

    button.disabled = true;
    button.textContent = "Cancelling...";

    try {
        const response = await fetch(`${ORDER_API_BASE_URL}/api/orders/${orderId}/cancel`, {
            method: "PATCH",
            headers: {
                Authorization: `Bearer ${token}`
            }
        });
        const data = await response.json();

        if (response.status === 401) {
            clearSessionAndLogin();
            return;
        }

        if (!response.ok) {
            throw new Error(data.message || "Cannot cancel this order.");
        }

        allOrders = allOrders.map((order) => String(order.id || order._id) === String(orderId) ? data : order);
        filteredOrders = [...allOrders];
        renderOrderHistory();
    } catch (error) {
        alert(error.message);
        button.disabled = false;
        button.textContent = "Cancel Order";
    }
}

function downloadInvoice(orderId) {
    const order = allOrders.find((item) => String(item.id || item._id) === String(orderId));

    if (!order) {
        return;
    }

    const itemLines = (order.items || []).map((item) => `${item.name} x${item.quantity} - ${formatVnd(item.lineTotal)}`);
    const invoice = [
        "SUGAR BLISS ORDER INVOICE",
        `Order: ${order.orderNumber || orderId}`,
        `Placed: ${order.orderedOn || ""}`,
        `Status: ${order.status || ""}`,
        "",
        ...itemLines,
        "",
        `Subtotal: ${formatVnd(order.subtotal)}`,
        `Delivery method: ${formatDeliveryMethod(order.deliveryMethod)}`,
        `Shipping: ${formatVnd(order.shippingFee)}`,
        `Total: ${formatVnd(order.total)}`,
        `Payment: ${order.paymentMethod || "COD"} / ${order.paymentStatus || "Pending"}`
    ].join("\n");
    const blobUrl = URL.createObjectURL(new Blob([invoice], { type: "text/plain;charset=utf-8" }));
    const link = document.createElement("a");

    link.href = blobUrl;
    link.download = `${order.orderNumber || orderId}-invoice.txt`;
    link.click();
    URL.revokeObjectURL(blobUrl);
}

function formatDeliveryMethod(method) {
    const labels = {
        standard: "Standard Delivery",
        express: "Express Delivery",
        pickup: "Store Pickup",
        lalamove: "Lalamove (Sandbox)"
    };

    return labels[method] || method || labels.standard;
}

function formatShippingStatus(status) {
    return ({ CREATING: "Confirming Delivery", UNKNOWN: "Awaiting Confirmation",
        FAILED: "Booking Failed", ASSIGNING_DRIVER: "Finding a Driver",
        ON_GOING: "Driver Assigned", PICKED_UP: "On the Way", COMPLETED: "Delivered",
        CANCELED: "Delivery Canceled", REJECTED: "No Driver Available",
        EXPIRED: "Delivery Expired" })[status] || status || "Awaiting Confirmation";
}

function renderTrackingLink(value) {
    try {
        const url = new URL(value);
        if (url.protocol !== "https:" || !["share.lalamove.com", "share.sandbox.lalamove.com"].includes(url.hostname)) return "";
        return `<a class="order-text-button" href="${escapeHtml(url.href)}" target="_blank" rel="noopener noreferrer">Track delivery</a>`;
    } catch { return ""; }
}

async function refreshDelivery(orderId, button) {
    button.disabled = true;
    try {
        mergeDeliveryUpdates([await requestDeliveryUpdate(orderId)]);
        renderOrderHistory();
        scheduleDeliverySync();
    } catch (error) {
        if (error.status === 401) { clearSessionAndLogin(); return; }
        alert(error.message);
        button.disabled = false;
    }
}

async function requestDeliveryUpdate(orderId) {
    const response = await fetch(`${ORDER_API_BASE_URL}/api/orders/${encodeURIComponent(orderId)}/shipping/refresh`, {
        method: "POST",
        headers: { Authorization: `Bearer ${localStorage.getItem("sugarBlissToken")}` }
    });
    const data = await response.json();
    if (!response.ok) {
        const error = new Error(data.message || "Cannot refresh delivery.");
        error.status = response.status;
        throw error;
    }
    return data;
}

function canSyncDelivery(order) {
    return order.shippingProvider === "lalamove" && Boolean(order.shippingOrderId) &&
        order.status !== "Cancelled" && !TERMINAL_DELIVERY_STATUSES.has(order.shippingStatus);
}

function visibleSyncableOrders() {
    const start = (currentOrderPage - 1) * ORDERS_PER_PAGE;
    return filteredOrders.slice(start, start + ORDERS_PER_PAGE).filter(canSyncDelivery);
}

function mergeDeliveryUpdates(updates) {
    const byId = new Map(updates.map((order) => [String(order.id || order._id), order]));
    allOrders = allOrders.map((order) => byId.get(String(order.id || order._id)) || order);
    filteredOrders = [...allOrders];
}

function scheduleDeliverySync(delay = DELIVERY_SYNC_INTERVAL_MS) {
    window.clearTimeout(deliverySyncTimer);
    if (document.hidden || !localStorage.getItem("sugarBlissToken") || !visibleSyncableOrders().length) return;
    deliverySyncTimer = window.setTimeout(syncVisibleDeliveries, delay);
}

async function syncVisibleDeliveries() {
    if (deliverySyncing || document.hidden) return;
    const orders = visibleSyncableOrders();
    if (!orders.length) return;
    deliverySyncing = true;
    const updates = [];
    try {
        for (const order of orders) {
            try {
                updates.push(await requestDeliveryUpdate(String(order.id || order._id)));
            } catch (error) {
                if (error.status === 401) { clearSessionAndLogin(); return; }
            }
        }
        if (updates.length) {
            mergeDeliveryUpdates(updates);
            renderOrderHistory();
        }
    } finally {
        deliverySyncing = false;
        scheduleDeliverySync();
    }
}

function changeOrderPage(change) {
    const pageCount = Math.max(Math.ceil(filteredOrders.length / ORDERS_PER_PAGE), 1);
    const nextPage = currentOrderPage + change;

    if (nextPage < 1 || nextPage > pageCount) {
        return;
    }

    currentOrderPage = nextPage;
    renderOrderHistory();
    scheduleDeliverySync(500);
    document.querySelector(".order-history-main")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function getOrderDisplayStatus(order) {
    if (order.displayStatus) return order.displayStatus;
    if (order.shippingProvider === "lalamove") return formatShippingStatus(order.shippingStatus);
    return order.status || "In Progress";
}

function getStatusClass(order) {
    const status = getOrderDisplayStatus(order);
    const tone = order.displayStatusTone || (status === "Delivered" ? "delivered"
        : status.includes("Cancel") ? "cancelled" : "progress");
    return tone === "delivered" ? "is-delivered" : tone === "cancelled" ? "is-cancelled" : "is-progress";
}

function resolveOrderImage(image) {
    if (!image) {
        return "/assets/images/cake2.png";
    }

    if (image.startsWith("/uploads")) {
        return `${ORDER_API_BASE_URL}${image}`;
    }

    return image;
}

function formatVnd(value) {
    return new Intl.NumberFormat("vi-VN", {
        style: "currency",
        currency: "VND",
        maximumFractionDigits: 0
    }).format(Number(value) || 0);
}

function clearSessionAndLogin() {
    window.clearTimeout(deliverySyncTimer);
    localStorage.removeItem("sugarBlissToken");
    localStorage.removeItem("sugarBlissUser");
    window.location.href = "/login";
}

function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}
