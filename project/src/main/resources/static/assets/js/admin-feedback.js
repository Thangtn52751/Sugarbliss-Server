document.addEventListener('DOMContentLoaded', async () => {
    const admin = window.SugarBlissAdmin;
    if (!await admin.ready) return;

    const list = document.querySelector('[data-feedback-list]');
    const paginationNode = document.querySelector('[data-feedback-pagination]');
    let currentPage = 1;
    const statuses = ['New', 'In Progress', 'Resolved', 'Closed'];

    function escapeHtml(value) {
        return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
    }

    async function loadFeedback(page = currentPage) {
        currentPage = page;
        list.innerHTML = '<div class="admin-panel feedback-empty">Loading feedback...</div>';
        try {
            const response = await admin.request(`/api/contact?page=${currentPage}&limit=20`);
            const messages = response?.contactMessages || [];
            const pagination = response?.pagination || { total: messages.length, pages: 1, page: currentPage };
            if (!messages.length) {
                list.innerHTML = '<div class="admin-panel feedback-empty">No feedback messages yet.</div>';
                paginationNode.hidden = true;
                return;
            }

            list.innerHTML = messages.map(message => `
                <article class="admin-panel feedback-card" data-feedback-id="${escapeHtml(message._id)}">
                    <div class="feedback-heading">
                        <div><span class="feedback-ticket">${escapeHtml(message.ticketNumber)}</span><h2>${escapeHtml(message.name)}</h2></div>
                        <time>${escapeHtml(new Date(message.createdAt).toLocaleString())}</time>
                    </div>
                    <a class="feedback-email" href="mailto:${escapeHtml(message.email)}">${escapeHtml(message.email)}</a>
                    <p class="feedback-message">${escapeHtml(message.message)}</p>
                    <div class="feedback-controls">
                        <label>Status <select data-feedback-status>${statuses.map(status => `<option value="${status}" ${message.status === status ? 'selected' : ''}>${status}</option>`).join('')}</select></label>
                        <label class="feedback-note-label">Admin note <textarea data-feedback-note rows="2" maxlength="1000" placeholder="Internal note">${escapeHtml(message.adminNote || '')}</textarea></label>
                        <button type="button" class="feedback-save" data-feedback-save>Save</button>
                    </div>
                </article>`).join('');

            paginationNode.hidden = pagination.pages <= 1;
            paginationNode.innerHTML = `<span>${pagination.total} messages · Page ${pagination.page} of ${pagination.pages}</span><div class="feedback-page-controls"><button type="button" data-feedback-page="${pagination.page - 1}" ${pagination.page <= 1 ? 'disabled' : ''}>Previous</button><button type="button" data-feedback-page="${pagination.page + 1}" ${pagination.page >= pagination.pages ? 'disabled' : ''}>Next</button></div>`;
        } catch (error) {
            list.innerHTML = `<div class="admin-panel feedback-empty error">${escapeHtml(error.message)}</div>`;
            paginationNode.hidden = true;
        }
    }

    document.querySelector('[data-feedback-refresh]').addEventListener('click', () => loadFeedback());
    paginationNode.addEventListener('click', event => {
        const button = event.target.closest('[data-feedback-page]');
        if (button && !button.disabled) loadFeedback(Number(button.dataset.feedbackPage));
    });
    list.addEventListener('click', async event => {
        const button = event.target.closest('[data-feedback-save]');
        if (!button) return;
        const card = button.closest('[data-feedback-id]');
        button.disabled = true;
        button.textContent = 'Saving...';
        try {
            await admin.request(`/api/contact/${encodeURIComponent(card.dataset.feedbackId)}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    status: card.querySelector('[data-feedback-status]').value,
                    adminNote: card.querySelector('[data-feedback-note]').value,
                }),
            });
            button.textContent = 'Saved';
        } catch (error) {
            alert(`Could not save feedback: ${error.message}`);
            button.disabled = false;
            button.textContent = 'Save';
        }
    });
    list.addEventListener('input', event => {
        const card = event.target.closest('[data-feedback-id]');
        if (!card) return;
        const button = card.querySelector('[data-feedback-save]');
        button.disabled = false;
        button.textContent = 'Save';
    });

    await loadFeedback();
});
