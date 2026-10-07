const ADMIN_API_BASE_URL = window.SugarBlissApi.baseUrl;
const PAGE_SIZE = 6;
const STATUSES = ["Pending", "Reviewing", "Quoted", "Approved", "Completed", "Cancelled"];
const DELIVERY_LABELS = {
    pickup: "Store Pickup",
    "local-delivery": "Local Delivery",
    shipping: "Nationwide Shipping"
};

let allRequests = [];
let filteredRequests = [];
let currentPage = 1;
let currentStatus = "";
let currentSearch = "";
let searchTimer;
let requestController;
let openRequestId = "";

document.addEventListener("DOMContentLoaded", () => {
    if (!requireAdmin()) {
        return;
    }

    document.querySelector("[data-status-filters]")?.addEventListener("click", handleStatusFilter);
    document.querySelector("[data-admin-search]")?.addEventListener("input", handleSearch);
    document.querySelector("[data-admin-list]")?.addEventListener("click", handleListClick);
    document.querySelector("[data-admin-list]")?.addEventListener("submit", handleSave);
    document.querySelector("[data-admin-previous]")?.addEventListener("click", () => changePage(-1));
    document.querySelector("[data-admin-next]")?.addEventListener("click", () => changePage(1));
    loadSpecialOrders();
});

function requireAdmin() {
    const token = localStorage.getItem("sugarBlissToken");
    const user = readCachedUser();

    if (!token) {
        window.location.href = "/login";
        return false;
    }

    if (user?.role && user.role !== "admin") {
        window.location.href = "/home";
        return false;
    }

    return true;
}

async function loadSpecialOrders() {
    const token = localStorage.getItem("sugarBlissToken");
    const state = document.querySelector("[data-admin-state]");

    if (!token) {
        window.location.href = "/login";
        return;
    }

    state.hidden = false;
    state.classList.remove("is-error");
    state.textContent = "Loading special orders...";

    requestController?.abort();
    requestController = new AbortController();

    try {
        const params = new URLSearchParams({ page: "1", limit: "100" });
        if (currentStatus) {
            params.set("status", currentStatus);
        }

        const response = await fetch(`${ADMIN_API_BASE_URL}/api/special-orders?${params}`, {
            headers: { Authorization: `Bearer ${token}` },
            signal: requestController.signal
        });
        const data = await response.json().catch(() => ({}));

        if (response.status === 401) {
            clearSessionAndLogin();
            return;
        }

        if (response.status === 403) {
            window.location.href = "/home";
            return;
        }

        if (!response.ok) {
            throw new Error(data.message || "Cannot load special orders.");
        }

        allRequests = Array.isArray(data.specialOrders) ? data.specialOrders : [];
        applyFilters();
    } catch (error) {
        if (error.name === "AbortError") {
            return;
        }

        state.hidden = false;
        state.classList.add("is-error");
        state.textContent = error.message || "Cannot connect to server.";
    }
}

function handleStatusFilter(event) {
    const button = event.target.closest("[data-status-filter]");

    if (!button) {
        return;
    }

    currentStatus = button.dataset.statusFilter || "";
    currentPage = 1;
    document.querySelectorAll("[data-status-filter]").forEach((item) => {
        item.classList.toggle("is-active", item === button);
    });
    loadSpecialOrders();
}

function handleSearch(event) {
    const query = event.target.value.trim().toLowerCase();

    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => {
        currentSearch = query;
        currentPage = 1;
        applyFilters();
    }, 250);
}

function applyFilters() {
    filteredRequests = allRequests.filter((request) => {
        if (!currentSearch) {
            return true;
        }

        const haystack = [
            request.requestNumber,
            request.name,
            request.email,
            request.phone,
            request.orderDetails,
            request.city
        ].join(" ").toLowerCase();

        return haystack.includes(currentSearch);
    });

    renderList();
}

function renderList() {
    const list = document.querySelector("[data-admin-list]");
    const state = document.querySelector("[data-admin-state]");
    const pagination = document.querySelector("[data-admin-pagination]");
    const pageCount = Math.max(Math.ceil(filteredRequests.length / PAGE_SIZE), 1);

    currentPage = Math.min(currentPage, pageCount);

    if (filteredRequests.length === 0) {
        list.replaceChildren();
        state.hidden = false;
        state.classList.remove("is-error");
        state.textContent = currentSearch || currentStatus
            ? "No special orders match this filter."
            : "No special order requests yet.";
        pagination.hidden = true;
        return;
    }

    const start = (currentPage - 1) * PAGE_SIZE;
    const pageItems = filteredRequests.slice(start, start + PAGE_SIZE);

    state.hidden = true;
    list.innerHTML = pageItems.map(renderCard).join("");
    pagination.hidden = false;
    document.querySelector("[data-admin-summary]").textContent =
        `Showing ${start + 1}-${Math.min(start + PAGE_SIZE, filteredRequests.length)} of ${filteredRequests.length} requests`;
    document.querySelector("[data-admin-page]").textContent = `${currentPage} / ${pageCount}`;
    document.querySelector("[data-admin-previous]").disabled = currentPage === 1;
    document.querySelector("[data-admin-next]").disabled = currentPage === pageCount;
}

function renderCard(request) {
    const id = String(request._id || "");
    const isOpen = id === openRequestId;
    const preview = String(request.orderDetails || "").slice(0, 140);
    const previewSuffix = String(request.orderDetails || "").length > 140 ? "..." : "";

    return `
        <article class="admin-card" data-request-card="${escapeHtml(id)}">
            <header class="admin-card-head">
                <div class="admin-meta"><span>Request</span><strong>${escapeHtml(request.requestNumber || id)}</strong></div>
                <div class="admin-meta"><span>Customer</span><strong>${escapeHtml(request.name || "Unknown")}</strong></div>
                <div class="admin-meta"><span>Submitted</span><strong>${escapeHtml(formatDate(request.createdAt))}</strong></div>
                <span class="admin-status ${getStatusClass(request.status)}">${escapeHtml(request.status || "Pending")}</span>
            </header>
            <div class="admin-card-preview">
                <p>${escapeHtml(preview)}${previewSuffix}</p>
            </div>
            <div class="admin-details" data-request-details ${isOpen ? "" : "hidden"}>
                ${isOpen ? renderDetails(request) : ""}
            </div>
            <footer class="admin-card-actions">
                <button class="admin-text-button" type="button" data-view-request="${escapeHtml(id)}" aria-expanded="${isOpen}">
                    ${isOpen ? "Hide details" : "View and update"}
                </button>
            </footer>
        </article>
    `;
}

function renderDetails(request) {
    const id = String(request._id || "");
    const address = [request.address1, request.address2, request.city, request.zipCode].filter(Boolean).join(", ") || "Not required for pickup";

    return `
        <div class="admin-details-grid">
            <div><span>Email</span><p>${escapeHtml(request.email || "—")}</p></div>
            <div><span>Phone</span><p>${escapeHtml(request.phone || "—")}</p></div>
            <div><span>Delivery</span><p>${escapeHtml(DELIVERY_LABELS[request.deliveryOption] || request.deliveryOption || "—")}</p></div>
            <div><span>Updated</span><p>${escapeHtml(formatDate(request.updatedAt))}</p></div>
            <div class="is-wide"><span>Address</span><p>${escapeHtml(address)}</p></div>
            <div class="is-wide"><span>Order details</span><p>${escapeHtml(request.orderDetails || "—")}</p></div>
        </div>
        <form class="admin-edit" data-update-form="${escapeHtml(id)}">
            <label>
                <span>Status</span>
                <select name="status" required>
                    ${STATUSES.map((status) => `
                        <option value="${status}" ${request.status === status ? "selected" : ""}>${status}</option>
                    `).join("")}
                </select>
            </label>
            <label>
                <span>Admin note</span>
                <textarea name="adminNote" maxlength="1000" placeholder="Internal note for the team">${escapeHtml(request.adminNote || "")}</textarea>
            </label>
            <div class="admin-edit-actions">
                <button class="admin-save-button" type="submit">Save changes</button>
                <p class="admin-edit-message" data-update-message></p>
            </div>
        </form>
    `;
}

async function handleListClick(event) {
    const button = event.target.closest("[data-view-request]");

    if (!button) {
        return;
    }

    const requestId = button.dataset.viewRequest;
    openRequestId = openRequestId === requestId ? "" : requestId;

    if (!openRequestId) {
        renderList();
        return;
    }

    const request = await fetchRequestById(requestId);
    if (request) {
        const index = allRequests.findIndex((item) => String(item._id) === requestId);
        if (index >= 0) {
            allRequests[index] = request;
        }
        applyFilters();
    } else {
        renderList();
    }
}

async function fetchRequestById(id) {
    const token = localStorage.getItem("sugarBlissToken");

    try {
        const response = await fetch(`${ADMIN_API_BASE_URL}/api/special-orders/${id}`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        const data = await response.json().catch(() => ({}));

        if (response.status === 401) {
            clearSessionAndLogin();
            return null;
        }

        if (!response.ok) {
            throw new Error(data.message || "Cannot load request details.");
        }

        return data;
    } catch (error) {
        console.error("Cannot load special order details.", error);
        return allRequests.find((item) => String(item._id) === id) || null;
    }
}

async function handleSave(event) {
    const form = event.target.closest("[data-update-form]");

    if (!form) {
        return;
    }

    event.preventDefault();

    const requestId = form.dataset.updateForm;
    const token = localStorage.getItem("sugarBlissToken");
    const submitButton = form.querySelector(".admin-save-button");
    const message = form.querySelector("[data-update-message]");
    const formData = new FormData(form);
    const payload = {
        status: String(formData.get("status") || "").trim(),
        adminNote: String(formData.get("adminNote") || "").trim()
    };

    submitButton.disabled = true;
    submitButton.textContent = "Saving...";
    message.textContent = "";
    message.className = "admin-edit-message";

    try {
        const response = await fetch(`${ADMIN_API_BASE_URL}/api/special-orders/${requestId}`, {
            method: "PATCH",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`
            },
            body: JSON.stringify(payload)
        });
        const data = await response.json().catch(() => ({}));

        if (response.status === 401) {
            clearSessionAndLogin();
            return;
        }

        if (!response.ok) {
            throw new Error(data.message || "Cannot update this request.");
        }

        const index = allRequests.findIndex((item) => String(item._id) === requestId);
        if (index >= 0) {
            allRequests[index] = data;
        }

        openRequestId = requestId;
        applyFilters();

        const updatedForm = document.querySelector(`[data-update-form="${requestId}"]`);
        const updatedMessage = updatedForm?.querySelector("[data-update-message]");
        if (updatedMessage) {
            updatedMessage.textContent = "Changes saved.";
            updatedMessage.classList.add("is-success");
        }
    } catch (error) {
        message.textContent = error.message || "Cannot connect to server.";
        message.classList.add("is-error");
        submitButton.disabled = false;
        submitButton.textContent = "Save changes";
    }
}

function changePage(change) {
    const pageCount = Math.max(Math.ceil(filteredRequests.length / PAGE_SIZE), 1);
    const nextPage = currentPage + change;

    if (nextPage < 1 || nextPage > pageCount) {
        return;
    }

    currentPage = nextPage;
    openRequestId = "";
    renderList();
    document.querySelector(".admin-main")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function getStatusClass(status) {
    const classes = {
        Reviewing: "is-reviewing",
        Quoted: "is-quoted",
        Approved: "is-approved",
        Completed: "is-completed",
        Cancelled: "is-cancelled"
    };

    return classes[status] || "is-pending";
}

function formatDate(value) {
    if (!value) {
        return "Updating";
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return "Updating";
    }

    return new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "2-digit",
        year: "numeric"
    }).format(date);
}

function readCachedUser() {
    try {
        return JSON.parse(localStorage.getItem("sugarBlissUser") || "null");
    } catch (error) {
        return null;
    }
}

function clearSessionAndLogin() {
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
