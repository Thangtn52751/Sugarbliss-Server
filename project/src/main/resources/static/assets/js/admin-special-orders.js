(async function initializeSpecialOrders() {
    "use strict";

    const admin = window.SugarBlissAdmin;
    if (!await admin.ready) {
        return;
    }

    const PAGE_SIZE = 6;
    const STATUSES = ["Pending", "Reviewing", "Quoted", "Approved", "Completed", "Cancelled"];
    const DELIVERY_LABELS = {
        pickup: "Store Pickup",
        "local-delivery": "Local Delivery",
        shipping: "Nationwide Shipping"
    };

    const $ = (selector) => document.querySelector(selector);
    const dialog = $("[data-so-dialog]");
    const form = $("[data-so-form]");
    const state = { page: 1, pages: 1, items: [], allItems: [], detail: null, searchTimer: null };

    const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
    }[char]));

    const formatDate = (value) => {
        if (!value) {
            return "Updating";
        }
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) {
            return "Updating";
        }
        return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(date);
    };

    const statusTone = (status) => String(status || "pending").toLowerCase();

    const badge = (status) => `<span class="admin-order-status" data-tone="${escape(statusTone(status))}">${escape(status || "Pending")}</span>`;

    function feedback(message, success = false, selector = "[data-so-feedback]") {
        const node = $(selector);
        node.textContent = message;
        node.hidden = !message;
        node.classList.toggle("is-success", success);
    }

    function applyFilters() {
        const query = $("[data-so-search]").value.trim().toLowerCase();
        const filtered = state.allItems.filter((item) => {
            if (!query) {
                return true;
            }
            return [
                item.requestNumber,
                item.name,
                item.email,
                item.phone,
                item.orderDetails,
                item.city
            ].join(" ").toLowerCase().includes(query);
        });

        state.pages = Math.max(Math.ceil(filtered.length / PAGE_SIZE), 1);
        state.page = Math.min(state.page, state.pages);
        const start = (state.page - 1) * PAGE_SIZE;
        state.items = filtered.slice(start, start + PAGE_SIZE);
        renderTable(filtered.length, start);
    }

    function renderTable(total, start) {
        $("[data-so-clear]").hidden = !$("[data-so-search]").value.trim() && !$("[data-so-status]").value;
        $("[data-so-rows]").innerHTML = state.items.map((item) => `<tr>
            <td>${escape(item.requestNumber || item._id)}</td>
            <td>${escape(item.name || "Unknown")}<small>${escape(item.email || "")}</small></td>
            <td>${escape(DELIVERY_LABELS[item.deliveryOption] || item.deliveryOption || "—")}</td>
            <td>${escape(formatDate(item.createdAt))}</td>
            <td>${badge(item.status)}</td>
            <td class="orders-actions"><button type="button" class="orders-secondary" data-so-id="${escape(item._id)}">Details</button></td>
        </tr>`).join("") || '<tr><td colspan="6" class="orders-empty">No special orders found.</td></tr>';

        const shown = state.items.length;
        $("[data-so-pagination-info]").textContent = total
            ? `Showing ${start + 1}-${start + shown} of ${total} requests`
            : "Showing 0 of 0 requests";

        const pages = Array.from({ length: state.pages }, (_, index) => index + 1)
            .slice(Math.max(0, state.page - 3), Math.max(0, state.page - 3) + Math.min(5, state.pages));
        $("[data-so-pages]").innerHTML =
            `<button type="button" class="orders-page-button" data-page="${state.page - 1}" ${state.page <= 1 ? "disabled" : ""} title="Previous page" aria-label="Previous page">&lsaquo;</button>` +
            pages.map((page) => `<button type="button" class="orders-page-button" data-page="${page}" ${page === state.page ? 'aria-current="page"' : ""}>${page}</button>`).join("") +
            `<button type="button" class="orders-page-button" data-page="${state.page + 1}" ${state.page >= state.pages ? "disabled" : ""} title="Next page" aria-label="Next page">&rsaquo;</button>`;
    }

    async function load() {
        $("[data-so-table]").setAttribute("aria-busy", "true");
        $("[data-so-retry]").hidden = true;
        try {
            const params = new URLSearchParams({ page: "1", limit: "100" });
            const status = $("[data-so-status]").value;
            if (status) {
                params.set("status", status);
            }
            const data = await admin.request(`/api/special-orders?${params}`);
            if (!data) {
                return;
            }
            state.allItems = Array.isArray(data.specialOrders) ? data.specialOrders : [];
            state.page = 1;
            feedback("");
            applyFilters();
        } catch (error) {
            state.allItems = [];
            state.items = [];
            $("[data-so-rows]").innerHTML = '<tr><td colspan="6" class="orders-empty">Unable to load special orders.</td></tr>';
            $("[data-so-pages]").innerHTML = "";
            $("[data-so-pagination-info]").textContent = "";
            feedback(error.message);
            $("[data-so-retry]").hidden = false;
        } finally {
            $("[data-so-table]").setAttribute("aria-busy", "false");
        }
    }

    function renderDetails(request) {
        const address = [request.address1, request.address2, request.city, request.zipCode].filter(Boolean).join(", ") || "Not required for pickup";
        $("[data-so-title]").textContent = request.requestNumber || "Special order";
        $("[data-so-details]").innerHTML = `
            <div class="orders-detail-meta">${badge(request.status)}<span>${escape(DELIVERY_LABELS[request.deliveryOption] || request.deliveryOption || "—")}</span><span>${escape(formatDate(request.createdAt))}</span></div>
            <div class="so-details-grid">
                <div><span>Customer</span><p>${escape(request.name || "—")}</p></div>
                <div><span>Email</span><p>${escape(request.email || "—")}</p></div>
                <div><span>Phone</span><p>${escape(request.phone || "—")}</p></div>
                <div><span>Updated</span><p>${escape(formatDate(request.updatedAt))}</p></div>
                <div class="is-wide"><span>Address</span><p>${escape(address)}</p></div>
                <div class="is-wide"><span>Order details</span><p>${escape(request.orderDetails || "—")}</p></div>
            </div>
        `;
        $("[data-so-edit-status]").innerHTML = STATUSES.map((status) =>
            `<option value="${status}" ${request.status === status ? "selected" : ""}>${status}</option>`
        ).join("");
        $("[data-so-edit-note]").value = request.adminNote || "";
        feedback("", false, "[data-so-detail-feedback]");
    }

    async function openDetails(id) {
        try {
            const request = await admin.request(`/api/special-orders/${id}`);
            if (!request) {
                return;
            }
            state.detail = request;
            renderDetails(request);
            if (!dialog.open) {
                dialog.showModal();
            }
        } catch (error) {
            feedback(error.message);
        }
    }

    $("[data-so-search]").addEventListener("input", () => {
        window.clearTimeout(state.searchTimer);
        state.searchTimer = window.setTimeout(() => {
            state.page = 1;
            applyFilters();
        }, 250);
    });
    $("[data-so-status]").addEventListener("change", () => {
        state.page = 1;
        load();
    });
    $("[data-so-clear]").addEventListener("click", () => {
        $("[data-so-search]").value = "";
        $("[data-so-status]").value = "";
        state.page = 1;
        load();
    });
    $("[data-so-retry]").addEventListener("click", load);
    $("[data-so-pages]").addEventListener("click", (event) => {
        const button = event.target.closest("[data-page]");
        const page = Number(button?.dataset.page);
        if (!button || Number.isNaN(page) || page < 1 || page > state.pages) {
            return;
        }
        state.page = page;
        applyFilters();
    });
    $("[data-so-rows]").addEventListener("click", (event) => {
        const button = event.target.closest("[data-so-id]");
        if (button) {
            openDetails(button.dataset.soId);
        }
    });
    $("[data-so-close]").addEventListener("click", () => dialog.close());
    $("[data-so-dismiss]").addEventListener("click", () => dialog.close());

    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        if (!state.detail?._id) {
            return;
        }
        const saveButton = $("[data-so-save]");
        saveButton.disabled = true;
        saveButton.textContent = "Saving...";
        try {
            const updated = await admin.request(`/api/special-orders/${state.detail._id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    status: form.elements.status.value,
                    adminNote: form.elements.adminNote.value.trim()
                })
            });
            if (!updated) {
                return;
            }
            state.detail = updated;
            const index = state.allItems.findIndex((item) => String(item._id) === String(updated._id));
            if (index >= 0) {
                state.allItems[index] = updated;
            }
            applyFilters();
            renderDetails(updated);
            feedback("Changes saved.", true, "[data-so-detail-feedback]");
        } catch (error) {
            feedback(error.message, false, "[data-so-detail-feedback]");
        } finally {
            saveButton.disabled = false;
            saveButton.textContent = "Save changes";
        }
    });

    load();
}());
