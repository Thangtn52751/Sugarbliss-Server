(async function initializeOrders() {
    'use strict';
    const admin = window.SugarBlissAdmin;
    if (!await admin.ready) return;
    const $ = (selector) => document.querySelector(selector);
    const dialog = $('[data-order-dialog]');
    const form = $('[data-pickup-form]');
    const state = { page: 1, pages: 1, orders: [], detail: null, listVersion: 0, detailVersion: 0, busy: false, timer: null, searchTimer: null };
    const escape = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[char]);
    const money = (amount) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(amount || 0);
    const date = (value) => new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value));
    const badge = (status) => `<span class="admin-order-status" data-tone="${escape(status.tone)}" data-code="${escape(status.code)}">${escape(status.label)}</span>`;

    function feedback(message, success = false, selector = '[data-orders-feedback]') {
        const node = $(selector); node.textContent = message; node.hidden = !message; node.classList.toggle('is-success', success);
    }

    async function load() {
        const version = ++state.listVersion;
        const params = new URLSearchParams({ page: state.page, limit: 6, timezoneOffset: -new Date().getTimezoneOffset() });
        for (const [name, selector] of [['search', '[data-orders-search]'], ['status', '[data-orders-status]'], ['month', '[data-orders-month]']]) {
            const value = $(selector).value.trim(); if (value) params.set(name, value);
        }
        $('[data-clear-filters]').hidden = !['search', 'status', 'month'].some((key) => params.has(key));
        $('[data-orders-table]').setAttribute('aria-busy', 'true');
        try {
            const data = await admin.request(`/api/admin/orders?${params}`);
            if (!data || version !== state.listVersion) return;
            state.orders = data.orders; state.page = data.page; state.pages = data.pages;
            $('[data-orders-rows]').innerHTML = data.orders.map((order) => `<tr>
                <td>${escape(order.orderNumber)}</td><td>${escape(order.customer.name)}</td><td>${escape(order.itemsSummary)}</td>
                <td class="orders-amount">${money(order.total)}</td><td>${escape(date(order.orderedOn))}</td>
                <td>${badge(order.status)}<small>${escape(order.deliveryLabel)}</small></td>
                <td class="orders-actions"><button type="button" class="orders-secondary" data-order-id="${escape(order.id)}">Details</button></td></tr>`).join('') || '<tr><td colspan="7" class="orders-empty">No orders found.</td></tr>';
            const first = data.total ? (data.page - 1) * data.limit + 1 : 0;
            $('[data-orders-pagination-info]').textContent = `Showing ${first}-${first ? first + data.orders.length - 1 : 0} of ${data.total} orders`;
            const pages = Array.from({ length: Math.min(5, data.pages) }, (_, index) => Math.max(1, Math.min(data.page - 2, data.pages - 4)) + index);
            $('[data-orders-pages]').innerHTML = `<button type="button" class="orders-page-button" data-page="${data.page - 1}" ${data.page <= 1 ? 'disabled' : ''} title="Previous page" aria-label="Previous page">&lsaquo;</button>` +
                pages.map((page) => `<button type="button" class="orders-page-button" data-page="${page}" ${page === data.page ? 'aria-current="page"' : ''}>${page}</button>`).join('') +
                `<button type="button" class="orders-page-button" data-page="${data.page + 1}" ${data.page >= data.pages ? 'disabled' : ''} title="Next page" aria-label="Next page">&rsaquo;</button>`;
            feedback(''); $('[data-orders-retry]').hidden = true;
        } catch (error) {
            if (version !== state.listVersion) return;
            state.orders = []; $('[data-orders-rows]').innerHTML = '<tr><td colspan="7" class="orders-empty">Unable to load orders.</td></tr>';
            $('[data-orders-pages]').innerHTML = ''; $('[data-orders-pagination-info]').textContent = '';
            feedback(error.message); $('[data-orders-retry]').hidden = false;
        } finally { if (version === state.listVersion) $('[data-orders-table]').setAttribute('aria-busy', 'false'); }
    }

    function scheduleDetailRefresh() {
        window.clearTimeout(state.timer);
        if (dialog.open && state.detail?.providerManaged && !state.detail.status.terminal && !state.busy) {
            state.timer = window.setTimeout(() => fetchDetail(state.detail.id, false), 15000);
        }
    }

    function cashConfirmation() {
        const action = state.detail?.pickupActions.find((item) => item.value === form.elements.pickupStatus.value);
        const required = Boolean(action?.requiresCashConfirmation);
        $('[data-cash-confirmation]').hidden = !required; form.elements.cashReceived.required = required;
    }

    function renderDetail(order) {
        state.detail = order;
        $('[data-order-title]').textContent = order.orderNumber;
        const tracking = String(order.trackingUrl || '');
        const safeTracking = /^https:\/\/(?:share\.lalamove\.com|share\.sandbox\.lalamove\.com)\//.test(tracking);
        $('[data-order-details]').innerHTML = `<div class="orders-detail-meta">${badge(order.status)}<span>${escape(order.deliveryLabel)}</span><span>${escape(date(order.orderedOn))}</span></div>
            <ul class="orders-detail-items">${order.items.map((item) => {
                const image = admin.assetUrl(item.image || '/assets/icons/ic_product.png');
                return `<li><img class="orders-detail-image" src="${escape(image)}" alt=""><span class="orders-detail-item-copy"><strong>${escape(item.name)}</strong><small>Qty ${item.quantity} &middot; ${money(item.price)}</small></span><strong>${money(item.lineTotal)}</strong></li>`;
            }).join('')}</ul>
            <div class="orders-detail-grid"><section class="orders-recipient"><h3>${order.deliveryMethod === 'pickup' ? 'Pickup contact' : 'Recipient'}</h3>
                <p>${escape(order.recipient.name)}</p><p>${escape(order.customer.email)}</p><p>${escape(order.recipient.phone)}</p>
                ${order.deliveryMethod !== 'pickup' ? `<p>${escape(order.recipient.address)}</p>` : ''}${order.recipient.note ? `<p>${escape(order.recipient.note)}</p>` : ''}
                <p>${escape(order.paymentMethod)} &middot; ${escape(order.paymentStatus)}</p></section>
            <dl class="orders-totals"><div><dt>Subtotal</dt><dd>${money(order.subtotal)}</dd></div><div><dt>Delivery</dt><dd>${money(order.shippingFee)}</dd></div>
                <div><dt>Discount${order.voucherCode ? ` (${escape(order.voucherCode)})` : ''}</dt><dd>${order.discount ? '-' : ''}${money(order.discount)}</dd></div>
                <div class="orders-grand-total"><dt>Total</dt><dd>${money(order.total)}</dd></div></dl></div>
            ${order.providerManaged ? `<p class="orders-provider-info">Lalamove &middot; ${escape(order.shippingStatus || 'Awaiting confirmation')}${order.shippingOrderId ? `<br>${escape(order.shippingOrderId)}` : ''}${order.shippingError ? `<br>${escape(order.shippingError)}` : ''}</p>` : ''}`;
        form.hidden = !order.pickupActions.length;
        form.elements.pickupStatus.innerHTML = order.pickupActions.map((action) => `<option value="${escape(action.value)}">${escape(action.label)}</option>`).join('');
        form.elements.pickupStatus.value = order.pickupActions[0]?.value || '';
        form.elements.cashReceived.checked = false; cashConfirmation();
        $('[data-refresh-delivery]').hidden = !order.providerManaged || !order.shippingOrderId || order.status.terminal;
        $('[data-track-delivery]').hidden = !safeTracking;
        $('[data-track-delivery]').href = safeTracking ? tracking : '';
        $('[data-retry-detail]').hidden = true;
        scheduleDetailRefresh();
    }

    async function fetchDetail(id, foreground = true) {
        const version = ++state.detailVersion;
        try {
            const order = await admin.request(`/api/admin/orders/${encodeURIComponent(id)}`);
            if (!order || !dialog.open || version !== state.detailVersion) return;
            renderDetail(order); feedback('', false, '[data-order-feedback]');
            if (!foreground) await load();
        } catch (error) {
            if (!dialog.open || version !== state.detailVersion) return;
            feedback(error.message, false, '[data-order-feedback]'); $('[data-retry-detail]').hidden = false;
            scheduleDetailRefresh();
        }
    }

    function openDetail(id) {
        ++state.detailVersion; window.clearTimeout(state.timer); state.detail = { id, pickupActions: [] };
        $('[data-order-title]').textContent = 'Order details'; $('[data-order-details]').textContent = 'Loading...';
        form.hidden = true;
        for (const selector of ['[data-refresh-delivery]', '[data-track-delivery]', '[data-retry-detail]']) $(selector).hidden = true;
        feedback('', false, '[data-order-feedback]'); dialog.showModal(); fetchDetail(id);
    }
    function closeDetail() { if (!state.busy) dialog.close(); }
    dialog.addEventListener('close', () => { ++state.detailVersion; window.clearTimeout(state.timer); state.detail = null; });
    dialog.addEventListener('cancel', (event) => { if (state.busy) event.preventDefault(); });
    $('[data-close-order]').addEventListener('click', closeDetail);
    $('[data-dismiss-order]').addEventListener('click', closeDetail);
    $('[data-retry-detail]').addEventListener('click', () => { if (state.detail && !state.busy) fetchDetail(state.detail.id); });
    form.elements.pickupStatus.addEventListener('change', cashConfirmation);

    async function mutate(path, options, success) {
        if (state.busy || !state.detail) return;
        state.busy = true; ++state.detailVersion; window.clearTimeout(state.timer);
        for (const selector of ['[data-save-pickup]', '[data-refresh-delivery]', '[data-close-order]', '[data-dismiss-order]', '[data-retry-detail]', '[data-pickup-status]']) $(selector).disabled = true;
        feedback('', false, '[data-order-feedback]');
        try {
            const order = await admin.request(path, options);
            if (!order) return;
            renderDetail(order); feedback(success, true, '[data-order-feedback]'); await load();
        } catch (error) {
            await fetchDetail(state.detail.id); feedback(error.message, false, '[data-order-feedback]');
        } finally {
            state.busy = false;
            for (const selector of ['[data-save-pickup]', '[data-refresh-delivery]', '[data-close-order]', '[data-dismiss-order]', '[data-retry-detail]', '[data-pickup-status]']) $(selector).disabled = false;
            scheduleDetailRefresh();
        }
    }
    form.addEventListener('submit', (event) => {
        event.preventDefault();
        if (!form.reportValidity() || !state.detail?.pickupActions.length || state.detail.providerManaged) return;
        const data = { pickupStatus: form.elements.pickupStatus.value, cashReceived: form.elements.cashReceived.checked };
        mutate(`/api/admin/orders/${encodeURIComponent(state.detail.id)}/pickup-status`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }, 'Pickup status updated.');
    });
    $('[data-refresh-delivery]').addEventListener('click', () => {
        if (state.detail?.providerManaged) mutate(`/api/admin/orders/${encodeURIComponent(state.detail.id)}/shipping/refresh`, { method: 'POST' }, 'Delivery status refreshed.');
    });
    $('[data-orders-rows]').addEventListener('click', (event) => {
        const button = event.target.closest('[data-order-id]'); if (button && !state.busy) openDetail(button.dataset.orderId);
    });
    $('[data-orders-pages]').addEventListener('click', (event) => {
        const button = event.target.closest('[data-page]'); if (!button || button.disabled) return;
        const page = Number(button.dataset.page); if (page >= 1 && page <= state.pages) { state.page = page; load(); }
    });
    $('[data-orders-search]').addEventListener('input', () => {
        ++state.listVersion; window.clearTimeout(state.searchTimer); state.searchTimer = window.setTimeout(() => { state.page = 1; load(); }, 300);
    });
    for (const selector of ['[data-orders-status]', '[data-orders-month]']) $(selector).addEventListener('change', () => { window.clearTimeout(state.searchTimer); state.page = 1; load(); });
    $('[data-clear-filters]').addEventListener('click', () => {
        window.clearTimeout(state.searchTimer); for (const selector of ['[data-orders-search]', '[data-orders-status]', '[data-orders-month]']) $(selector).value = '';
        state.page = 1; load();
    });
    $('[data-orders-retry]').addEventListener('click', load);
    await load();
}());
