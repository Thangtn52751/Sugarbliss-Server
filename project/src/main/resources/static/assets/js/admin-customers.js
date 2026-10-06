(async function initializeCustomers() {
    'use strict';
    const admin = window.SugarBlissAdmin;
    if (!await admin.ready) return;

    const $ = (selector) => document.querySelector(selector);
    const PAGE_SIZE = 10;
    const state = { customers: [], page: 1, busy: false, searchTimer: null };

    const escape = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[char]);
    const money = (amount) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(Number(amount) || 0);
    const date = (value) => value ? new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium' }).format(new Date(value)) : '-';
    const initials = (name) => String(name || '?').trim().split(/\s+/).slice(0, 2).map((part) => part[0] || '').join('').toUpperCase() || '?';

    function feedback(message, success = false) {
        const node = $('[data-customer-status-message]');
        node.textContent = message;
        node.hidden = !message;
        node.classList.toggle('is-success', success);
    }

    function matchedCustomers() {
        const search = $('[data-customer-search]').value.trim().toLowerCase();
        const status = $('[data-customer-status]').value;
        const role = $('[data-customer-role]').value;
        return state.customers.filter((customer) => {
            const haystack = `${customer.name} ${customer.email} ${customer.phone}`.toLowerCase();
            if (search && !haystack.includes(search)) return false;
            if (status === 'active' && !customer.isActive) return false;
            if (status === 'disabled' && customer.isActive) return false;
            if (role && customer.role !== role) return false;
            return true;
        });
    }

    function renderStats() {
        const total = state.customers.length;
        const active = state.customers.filter((customer) => customer.isActive).length;
        const admins = state.customers.filter((customer) => customer.role === 'admin').length;
        $('[data-stat-total]').textContent = total;
        $('[data-stat-active]').textContent = active;
        $('[data-stat-disabled]').textContent = total - active;
        $('[data-stat-admins]').textContent = admins;
    }

    function render() {
        const matches = matchedCustomers();
        const pages = Math.max(1, Math.ceil(matches.length / PAGE_SIZE));
        state.page = Math.min(state.page, pages);
        const rows = matches.slice((state.page - 1) * PAGE_SIZE, state.page * PAGE_SIZE);

        $('[data-customer-rows]').innerHTML = rows.map((customer) => {
            const avatarUrl = admin.assetUrl(customer.avatar);
            const avatar = avatarUrl
                ? `<span class="customer-avatar"><img src="${escape(avatarUrl)}" alt=""></span>`
                : `<span class="customer-avatar is-text">${escape(initials(customer.name))}</span>`;
            const isAdmin = customer.role === 'admin';
            const toggleLabel = customer.isActive ? 'Disable' : 'Enable';
            const toggleButton = isAdmin
                ? '<span class="customer-role-tag">Admin</span>'
                : `<button type="button" class="customer-toggle${customer.isActive ? '' : ' is-enable'}" data-toggle-customer="${escape(customer.id)}" ${state.busy ? 'disabled' : ''}>${toggleLabel}</button>`;
            return `<tr${customer.isActive ? '' : ' class="is-disabled"'}>
                <td><div class="customer-identity">${avatar}<div><strong>${escape(customer.name)}</strong><small>${isAdmin ? 'Administrator' : 'Customer'}</small></div></div></td>
                <td>${escape(customer.email)}<small>${escape(customer.phone || 'No phone')}</small></td>
                <td>${customer.orderCount}</td>
                <td class="customer-amount">${money(customer.totalSpent)}</td>
                <td>${customer.voucherCount}</td>
                <td>${escape(date(customer.joinedOn))}</td>
                <td><span class="customer-state ${customer.isActive ? 'is-active' : 'is-disabled'}">${customer.isActive ? 'Active' : 'Disabled'}</span></td>
                <td class="customer-actions"><button type="button" class="customer-link" data-view-customer="${escape(customer.id)}">View</button>${toggleButton}</td>
            </tr>`;
        }).join('') || '<tr><td colspan="8">No customers found.</td></tr>';

        $('[data-customer-summary]').textContent = `${matches.length} customer${matches.length === 1 ? '' : 's'}`;
        $('[data-customer-page-label]').textContent = `Page ${state.page} of ${pages}`;
        $('[data-customer-prev]').disabled = state.page <= 1;
        $('[data-customer-next]').disabled = state.page >= pages;
    }

    async function load() {
        const result = await admin.request('/api/users/admin/customers');
        if (!result) return;
        state.customers = result.customers || [];
        $('[data-customer-retry]').hidden = true;
        renderStats();
        render();
    }

    async function toggleStatus(id) {
        const customer = state.customers.find((item) => item.id === id);
        if (!customer || state.busy) return;
        const nextActive = !customer.isActive;
        const verb = nextActive ? 'enable' : 'disable';
        if (!window.confirm(`Are you sure you want to ${verb} ${customer.name}'s account?`)) return;

        state.busy = true;
        render();
        try {
            const result = await admin.request(`/api/users/admin/customers/${encodeURIComponent(id)}/status`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ isActive: nextActive }),
            });
            if (!result) return;
            customer.isActive = result.customer.isActive;
            feedback(`${customer.name} is now ${customer.isActive ? 'active' : 'disabled'}.`, true);
        } catch (error) {
            feedback(error.message);
        } finally {
            state.busy = false;
            renderStats();
            render();
        }
    }

    async function viewCustomer(id) {
        const dialog = $('[data-customer-dialog]');
        const detail = $('[data-customer-detail]');
        detail.innerHTML = '<p class="admin-empty-state">Loading detail...</p>';
        dialog.showModal();
        try {
            const result = await admin.request(`/api/users/admin/customers/${encodeURIComponent(id)}`);
            if (!result) return;
            const customer = result.customer;
            const orders = result.recentOrders || [];
            const avatarUrl = admin.assetUrl(customer.avatar);
            const avatar = avatarUrl
                ? `<span class="customer-detail-avatar"><img src="${escape(avatarUrl)}" alt=""></span>`
                : `<span class="customer-detail-avatar is-text">${escape(initials(customer.name))}</span>`;
            const orderRows = orders.map((order) => `<tr>
                <td><strong>${escape(order.orderNumber)}</strong><small>${escape(order.orderedOn)}</small></td>
                <td><span class="admin-order-status" data-tone="${escape(order.displayStatusTone || '')}" data-code="${escape(order.displayStatusCode || '')}">${escape(order.displayStatus || order.status)}</span></td>
                <td class="customer-amount">${money(order.total)}</td>
            </tr>`).join('') || '<tr><td colspan="3" class="admin-empty-state">No orders yet.</td></tr>';

            detail.innerHTML = `
                <div class="customer-detail-head">
                    ${avatar}
                    <div>
                        <strong>${escape(customer.name)}</strong>
                        <small>${escape(customer.email)}</small>
                        <span class="customer-state ${customer.isActive ? 'is-active' : 'is-disabled'}">${customer.isActive ? 'Active' : 'Disabled'}</span>
                        ${customer.role === 'admin' ? '<span class="customer-role-tag">Admin</span>' : ''}
                    </div>
                </div>
                <dl class="customer-detail-grid">
                    <div><dt>Phone</dt><dd>${escape(customer.phone || '-')}</dd></div>
                    <div><dt>Address</dt><dd>${escape(customer.address || '-')}</dd></div>
                    <div><dt>Joined</dt><dd>${escape(date(customer.joinedOn))}</dd></div>
                    <div><dt>Vouchers</dt><dd>${customer.voucherCount}</dd></div>
                    <div><dt>Total orders</dt><dd>${customer.orderCount}</dd></div>
                    <div><dt>Total spent</dt><dd>${money(customer.totalSpent)}</dd></div>
                </dl>
                <h3 class="customer-detail-subtitle">Recent orders</h3>
                <div class="admin-table-scroll">
                    <table class="customer-detail-orders">
                        <thead><tr><th>Order</th><th>Status</th><th>Total</th></tr></thead>
                        <tbody>${orderRows}</tbody>
                    </table>
                </div>`;
        } catch (error) {
            detail.innerHTML = `<p class="customer-feedback">${escape(error.message)}</p>`;
        }
    }

    // Event wiring
    $('[data-customer-rows]').addEventListener('click', (event) => {
        const toggle = event.target.closest('[data-toggle-customer]');
        if (toggle) { toggleStatus(toggle.dataset.toggleCustomer); return; }
        const view = event.target.closest('[data-view-customer]');
        if (view) viewCustomer(view.dataset.viewCustomer);
    });
    $('[data-close-customer]').addEventListener('click', () => $('[data-customer-dialog]').close());
    for (const selector of ['[data-customer-search]', '[data-customer-status]', '[data-customer-role]']) {
        const event = selector.includes('search') ? 'input' : 'change';
        $(selector).addEventListener(event, () => {
            if (event === 'input') {
                window.clearTimeout(state.searchTimer);
                state.searchTimer = window.setTimeout(() => { state.page = 1; render(); }, 200);
            } else {
                state.page = 1;
                render();
            }
        });
    }
    $('[data-customer-prev]').addEventListener('click', () => { --state.page; render(); });
    $('[data-customer-next]').addEventListener('click', () => { ++state.page; render(); });
    $('[data-customer-retry]').addEventListener('click', async () => {
        $('[data-customer-retry]').disabled = true;
        try { await load(); feedback(''); }
        catch (error) { feedback(error.message); }
        finally { $('[data-customer-retry]').disabled = false; }
    });

    try {
        await load();
    } catch (error) {
        feedback(error.message);
        $('[data-customer-summary]').textContent = 'Unavailable';
        $('[data-customer-rows]').innerHTML = '<tr><td colspan="8">Unable to load customers.</td></tr>';
        $('[data-customer-retry]').hidden = false;
    }
}());
