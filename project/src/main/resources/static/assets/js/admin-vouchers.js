(async function initializeVouchers() {
    'use strict';
    const admin = window.SugarBlissAdmin;
    if (!await admin.ready) return;
    const $ = (selector) => document.querySelector(selector);
    const form = $('[data-voucher-form]');
    const dialog = $('[data-voucher-dialog]');
    const state = { vouchers: [], page: 1, selected: new Set(), busy: false, recipientTimer: null, recipientVersion: 0 };
    const escape = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[char]);
    const money = (amount) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(amount);
    const date = (value) => value ? new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '';

    function status(voucher) {
        if (!voucher.active || !voucher.expiresAt) return 'Inactive';
        if (voucher.expiresAt && Date.parse(voucher.expiresAt) <= Date.now()) return 'Expired';
        if (voucher.startsAt && Date.parse(voucher.startsAt) > Date.now()) return 'Upcoming';
        if (voucher.usageLimit > 0 && voucher.usedCount >= voucher.usageLimit) return 'Exhausted';
        return 'Active';
    }

    function feedback(message, success = false, target = '[data-admin-voucher-status]') {
        const node = $(target);
        node.textContent = message;
        node.hidden = !message;
        node.classList.toggle('is-success', success);
    }

    function render() {
        const search = $('[data-voucher-search]').value.trim().toLowerCase();
        const filter = $('[data-voucher-filter]').value;
        const matches = state.vouchers.filter((voucher) => `${voucher.code} ${voucher.description}`.toLowerCase().includes(search) && (!filter || status(voucher) === filter));
        const pages = Math.max(1, Math.ceil(matches.length / 10));
        state.page = Math.min(state.page, pages);
        const rows = matches.slice((state.page - 1) * 10, state.page * 10);
        $('[data-voucher-rows]').innerHTML = rows.map((voucher) => {
            const current = status(voucher);
            return `<tr><td><strong>${escape(voucher.code)}</strong><small>${escape(voucher.description)}</small>${voucher.autoAssignOnRegister ? '<small>New accounts</small>' : ''}</td>
                <td>${voucher.type === 'percent' ? `${voucher.value}%` : money(voucher.value)}${voucher.type === 'percent' && voucher.maxDiscount > 0 ? `<small>Up to ${money(voucher.maxDiscount)}</small>` : ''}</td>
                <td>${money(voucher.minOrder)}</td><td>${voucher.usedCount} / ${voucher.usageLimit || 'Unlimited'}</td>
                <td>${voucher.startsAt ? escape(date(voucher.startsAt)) : 'Available immediately'}<small>${voucher.expiresAt ? `Until ${escape(date(voucher.expiresAt))}` : 'Expiry missing'}</small></td>
                <td><span class="voucher-state ${current === 'Active' ? '' : ['Expired', 'Inactive'].includes(current) ? 'is-expired' : 'is-unavailable'}">${current}</span></td>
                <td><button type="button" class="voucher-delete" data-delete-voucher="${escape(voucher.id)}" ${state.busy ? 'disabled' : ''}>Delete</button></td></tr>`;
        }).join('') || '<tr><td colspan="7">No vouchers found.</td></tr>';
        $('[data-voucher-summary]').textContent = `${matches.length} voucher${matches.length === 1 ? '' : 's'}`;
        $('[data-voucher-page-label]').textContent = `Page ${state.page} of ${pages}`;
        $('[data-voucher-prev]').disabled = state.page <= 1;
        $('[data-voucher-next]').disabled = state.page >= pages;
    }

    async function load() {
        const result = await admin.request('/api/vouchers');
        if (!result) return;
        state.vouchers = result;
        $('[data-voucher-retry]').hidden = true;
        render();
    }

    async function loadRecipients() {
        const version = ++state.recipientVersion;
        try {
            const users = await admin.request(`/api/vouchers/recipients?q=${encodeURIComponent($('[data-recipient-search]').value.trim())}`);
            if (!users || version !== state.recipientVersion) return;
            $('[data-recipient-list]').innerHTML = users.map((user) => `<label class="voucher-recipient"><input type="checkbox" value="${escape(user.id)}" ${state.selected.has(user.id) ? 'checked' : ''}>
                <span>${escape(user.name)}<small>${escape(user.email)}</small></span><small>${user.voucherCount} vouchers</small></label>`).join('') || '<p>No users found.</p>';
        } catch (error) { feedback(error.message, false, dialog.open ? '[data-voucher-form-error]' : '[data-admin-voucher-status]'); }
    }

    function updateType() {
        const percent = form.elements.type.value === 'percent';
        $('[data-value-label]').textContent = percent ? 'Percentage' : 'Discount amount (VND)';
        form.elements.value.min = percent ? '0.01' : '1';
        form.elements.value.step = percent ? '0.01' : '1';
        if (percent) form.elements.value.max = '100';
        else form.elements.value.removeAttribute('max');
        $('[data-max-discount-label]').hidden = !percent;
    }

    function close() {
        if (!state.busy) dialog.close();
    }

    $('[data-add-voucher]').addEventListener('click', () => {
        form.reset();
        state.selected.clear();
        $('[data-selected-count]').textContent = '0 selected';
        $('[data-recipient-search]').value = '';
        $('[data-recipient-picker]').hidden = false;
        feedback('', false, '[data-voucher-form-error]');
        updateType();
        dialog.showModal();
        loadRecipients();
    });
    $('[data-close-voucher]').addEventListener('click', close);
    $('[data-cancel-voucher]').addEventListener('click', close);
    dialog.addEventListener('cancel', (event) => { if (state.busy) event.preventDefault(); });
    form.elements.type.addEventListener('change', updateType);
    $('[data-recipient-list]').addEventListener('change', (event) => {
        if (event.target.type !== 'checkbox') return;
        if (event.target.checked) state.selected.add(event.target.value);
        else state.selected.delete(event.target.value);
        $('[data-selected-count]').textContent = `${state.selected.size} selected`;
    });
    $('[data-recipient-search]').addEventListener('input', () => {
        ++state.recipientVersion;
        window.clearTimeout(state.recipientTimer);
        state.recipientTimer = window.setTimeout(loadRecipients, 250);
    });
    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (state.busy || !form.reportValidity()) return;
        const autoAssignOnRegister = form.elements.autoAssignOnRegister.checked;
        if (!state.selected.size && !autoAssignOnRegister) {
            feedback('Select at least one user.', false, '[data-voucher-form-error]');
            return;
        }
        const value = (name) => form.elements[name].value;
        const data = { code: value('code').trim().toUpperCase(), description: value('description').trim(), type: value('type'),
            value: Number(value('value')), minOrder: Number(value('minOrder')), maxDiscount: value('type') === 'percent' ? Number(value('maxDiscount')) : 0,
            usageLimit: Number(value('usageLimit')), active: form.elements.active.checked,
            autoAssignOnRegister,
            startsAt: value('startsAt') ? new Date(value('startsAt')).toISOString() : null,
            expiresAt: value('expiresAt') ? new Date(value('expiresAt')).toISOString() : null,
            userIds: [...state.selected] };
        state.busy = true;
        $('.voucher-fields').disabled = true;
        $('[data-save-voucher]').disabled = true;
        $('[data-save-voucher]').textContent = 'Creating...';
        feedback('', false, '[data-voucher-form-error]');
        try {
            const result = await admin.request('/api/vouchers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
            if (!result) return;
            dialog.close();
            const assigned = result.assignedUserCount ? ` Assigned to ${result.assignedUserCount} user${result.assignedUserCount === 1 ? '' : 's'}.` : '';
            feedback(`${result.code} created.${assigned}${result.autoAssignOnRegister ? ' Enabled for new accounts.' : ''}`, true);
            await load();
        } catch (error) { feedback(error.message, false, dialog.open ? '[data-voucher-form-error]' : '[data-admin-voucher-status]'); }
        finally {
            state.busy = false;
            $('.voucher-fields').disabled = false;
            $('[data-save-voucher]').disabled = false;
            $('[data-save-voucher]').textContent = 'Create voucher';
            render();
        }
    });
    $('[data-voucher-rows]').addEventListener('click', async (event) => {
        const button = event.target.closest('[data-delete-voucher]');
        if (!button || state.busy) return;
        const voucher = state.vouchers.find((item) => item.id === button.dataset.deleteVoucher);
        if (!voucher || !window.confirm(`Delete ${voucher.code} from all users?`)) return;
        state.busy = true;
        render();
        try {
            const result = await admin.request(`/api/vouchers/${encodeURIComponent(voucher.id)}`, { method: 'DELETE' });
            if (!result) return;
            state.vouchers = state.vouchers.filter((item) => item.id !== voucher.id);
            feedback(`${voucher.code} deleted.`, true);
        } catch (error) { feedback(error.message); }
        finally { state.busy = false; render(); }
    });
    for (const selector of ['[data-voucher-search]', '[data-voucher-filter]']) {
        $(selector).addEventListener(selector.includes('search') ? 'input' : 'change', () => { state.page = 1; render(); });
    }
    $('[data-voucher-prev]').addEventListener('click', () => { --state.page; render(); });
    $('[data-voucher-next]').addEventListener('click', () => { ++state.page; render(); });
    $('[data-voucher-retry]').addEventListener('click', async () => {
        $('[data-voucher-retry]').disabled = true;
        try { await load(); feedback(''); }
        catch (error) { feedback(error.message); }
        finally { $('[data-voucher-retry]').disabled = false; }
    });
    try { await load(); } catch (error) {
        feedback(error.message);
        $('[data-voucher-summary]').textContent = 'Unavailable';
        $('[data-voucher-rows]').innerHTML = '<tr><td colspan="7">Unable to load vouchers.</td></tr>';
        $('[data-voucher-retry]').hidden = false;
    }
}());
