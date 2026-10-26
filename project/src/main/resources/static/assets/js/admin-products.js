document.addEventListener('DOMContentLoaded', async () => {
    const adminUser = await window.SugarBlissAdmin.ready;
    if (!adminUser) return;

    let currentPage = 1;
    let currentLimit = 6;
    let searchQuery = "";

    const tbody = document.getElementById('product-table-body');
    const paginationInfo = document.getElementById('pagination-info');
    const paginationControls = document.getElementById('pagination-controls');
    const searchInput = document.getElementById('search-input');

    // Modal elements
    const modal = document.getElementById('product-modal');
    const modalTitle = document.getElementById('modal-title');
    const productForm = document.getElementById('product-form');
    const btnOpenAdd = document.getElementById('btn-open-add-modal');
    const btnCloseModal = document.getElementById('btn-close-modal');
    const btnCancelModal = document.getElementById('btn-cancel-modal');
    const imageInput = document.getElementById('prod-image');
    const imagePreviews = document.getElementById('product-image-previews');
    const clearImages = document.getElementById('btn-clear-product-images');
    const saveButton = productForm.querySelector('.btn-save');
    const categorySelect = document.getElementById('prod-category');
    const addCategoryButton = document.getElementById('btn-add-category');
    const categoryTableBody = document.getElementById('category-table-body');
    const pageTitle = document.querySelector('[data-page-title]');
    const pageSubtitle = document.querySelector('[data-page-subtitle]');
    let activeTab = 'products';

    // Modal Detail elements
    const detailModal = document.getElementById('product-detail-modal');
    const detailContent = document.getElementById('detail-popup-content');
    const btnCloseDetailModal = document.getElementById('btn-close-detail-modal');
    const btnCloseDetailBottom = document.getElementById('btn-close-detail-bottom');

    let existingImages = [];
    let previewUrls = [];
    let saving = false;

    function formError(message, id = 'product-form-error') {
        const node = document.getElementById(id);
        node.textContent = message;
        node.hidden = !message;
    }

    const categoryName = category => typeof category === 'string' ? category : category?.name || '';

    async function loadCategories(selectedId = '') {
        const categories = await window.SugarBlissAdmin.request('/api/categories');
        const items = Array.isArray(categories) ? categories : [];
        categorySelect.innerHTML = '<option value="">Select a category</option>' + items
            .map(category => `<option value="${escapeHtml(category._id)}">${escapeHtml(category.name)}</option>`).join('');
        if (selectedId) categorySelect.value = selectedId;
    }

    addCategoryButton.addEventListener('click', async () => {
        const name = prompt('New category name:');
        if (!name?.trim()) return;
        try {
            const category = await window.SugarBlissAdmin.request('/api/categories', {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: name.trim() }),
            });
            await loadCategories(category?._id);
        } catch (error) { formError(error.message); }
    });

    async function loadCategoryTab() {
        categoryTableBody.innerHTML = '<tr><td colspan="3" class="admin-tab-empty">Loading categories...</td></tr>';
        try {
            const categories = await window.SugarBlissAdmin.request('/api/categories');
            const items = Array.isArray(categories) ? categories : [];
            if (!items.length) {
                categoryTableBody.innerHTML = '<tr><td colspan="3" class="admin-tab-empty">No categories found.</td></tr>';
                return;
            }
            categoryTableBody.innerHTML = items.map(category => `
                <tr>
                    <td class="product-name">${escapeHtml(category.name)}</td>
                    <td>${escapeHtml(category.slug || '')}</td>
                    <td class="action-btns">
                        <button type="button" class="category-row-action" data-category-action="rename" data-category-id="${escapeHtml(category._id)}" data-category-name="${escapeHtml(category.name)}">Rename</button>
                        <button type="button" class="category-row-action danger" data-category-action="delete" data-category-id="${escapeHtml(category._id)}">Delete</button>
                    </td>
                </tr>`).join('');
        } catch (error) {
            categoryTableBody.innerHTML = `<tr><td colspan="3" class="admin-tab-empty error">${escapeHtml(error.message)}</td></tr>`;
        }
    }

    async function createCategory() {
        const name = prompt('New category name:');
        if (!name?.trim()) return;
        try {
            await window.SugarBlissAdmin.request('/api/categories', {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: name.trim() }),
            });
            await loadCategoryTab();
            await loadCategories();
        } catch (error) { alert(`Could not create category: ${error.message}`); }
    }

    document.getElementById('btn-open-category-create').addEventListener('click', createCategory);
    categoryTableBody.addEventListener('click', async event => {
        const button = event.target.closest('[data-category-action]');
        if (!button) return;
        const { categoryAction, categoryId, categoryName: oldName } = button.dataset;
        try {
            if (categoryAction === 'rename') {
                const name = prompt('Category name:', oldName);
                if (!name?.trim() || name.trim() === oldName) return;
                await window.SugarBlissAdmin.request(`/api/categories/${encodeURIComponent(categoryId)}`, {
                    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: name.trim() }),
                });
            } else if (categoryAction === 'delete') {
                if (!confirm('Delete this category? Categories assigned to products cannot be deleted.')) return;
                await window.SugarBlissAdmin.request(`/api/categories/${encodeURIComponent(categoryId)}`, { method: 'DELETE' });
            } else return;
            await loadCategoryTab();
            await loadCategories();
        } catch (error) { alert(`Category update failed: ${error.message}`); }
    });

    document.querySelectorAll('[data-admin-tab]').forEach(tab => tab.addEventListener('click', () => {
        activeTab = tab.dataset.adminTab;
        document.querySelectorAll('[data-admin-tab]').forEach(item => {
            const selected = item === tab;
            item.classList.toggle('active', selected);
            item.setAttribute('aria-selected', String(selected));
        });
        document.querySelectorAll('[data-admin-panel]').forEach(panel => { panel.hidden = panel.dataset.adminPanel !== activeTab; });
        document.querySelectorAll('[data-product-action]').forEach(node => { node.hidden = activeTab !== 'products'; });
        document.querySelectorAll('[data-category-action]').forEach(node => { node.hidden = activeTab !== 'categories'; });
        pageTitle.textContent = activeTab === 'products' ? 'Products' : 'Categories';
        pageSubtitle.textContent = activeTab === 'products'
            ? 'Manage your blissful dessert menu and stock availability'
            : 'Create and manage product categories';
        if (activeTab === 'categories') loadCategoryTab();
    }));

    function releasePreviewUrls() {
        previewUrls.forEach((url) => URL.revokeObjectURL(url));
        previewUrls = [];
    }

    function renderImagePreviews() {
        releasePreviewUrls();
        const files = Array.from(imageInput.files || []);
        const images = files.length ? files.map((file) => {
            const url = URL.createObjectURL(file);
            previewUrls.push(url);
            return { url, label: file.name };
        }) : existingImages.map((image, index) => ({ url: window.SugarBlissAdmin.assetUrl(image), label: `Image ${index + 1}` }));
        imagePreviews.innerHTML = images.map(({ url, label }) => `<figure class="product-image-preview"><img src="${escapeHtml(url)}" alt="${escapeHtml(label)}"><figcaption title="${escapeHtml(label)}">${escapeHtml(label)}</figcaption></figure>`).join('');
        imagePreviews.hidden = !images.length;
        clearImages.hidden = !files.length && !imageInput.validity.customError;
    }

    function resetImages(images = []) {
        existingImages = images;
        imageInput.value = '';
        imageInput.setCustomValidity('');
        imageInput.required = !images.length;
        formError('', 'product-image-error');
        renderImagePreviews();
    }

    imageInput.addEventListener('change', () => {
        const files = Array.from(imageInput.files || []);
        let error = '';
        if (files.length > 10) error = 'Select at most 10 product images.';
        else if (files.some((file) => !['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type))) error = 'Select JPG, PNG, WebP or GIF images.';
        else if (files.some((file) => file.size > 5 * 1024 * 1024)) error = 'Each image must be 5 MB or smaller.';
        else if (files.some((file) => file.size === 0)) error = 'Images cannot be empty.';
        if (error) imageInput.value = '';
        imageInput.setCustomValidity(error);
        formError(error, 'product-image-error');
        renderImagePreviews();
    });
    clearImages.addEventListener('click', () => resetImages(existingImages));

    function closeModal() {
        if (saving) return;
        modal.hidden = true;
        releasePreviewUrls();
    }

    function setSaving(value) {
        saving = value;
        productForm.setAttribute('aria-busy', String(value));
        productForm.querySelectorAll('input, select, textarea, button').forEach((node) => { node.disabled = value; });
        btnCloseModal.disabled = value;
        saveButton.textContent = value ? 'Saving...' : 'Save Product';
    }

    // 1. Tải danh sách sản phẩm
    async function loadProducts() {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding: 20px;">Loading data...</td></tr>';
        
        try {
            let url = '';
            if (searchQuery) {
                url = `/api/products/search?q=${encodeURIComponent(searchQuery)}&page=${currentPage}&limit=${currentLimit}`;
            } else {
                url = `/api/products?status=all&page=${currentPage}&limit=${currentLimit}`;
            }

            const data = await window.SugarBlissAdmin.request(url);
            if (!data) return;

            const products = Array.isArray(data) ? data : (data.products || data.data || []);
            const totalItems = data.total || products.length;

            renderTable(products);
            renderPagination(totalItems, products.length);

        } catch (error) {
            console.error(error);
            tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color: var(--admin-accent); padding: 20px;">${error.message}</td></tr>`;
        }
    }

    // 2. Render bảng dữ liệu
    function renderTable(products) {
        if (!products || products.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding: 20px;">No products found.</td></tr>';
            return;
        }

        tbody.innerHTML = products.map(p => {
            const id = p._id || p.id;
            const imgUrl = window.SugarBlissAdmin.assetUrl(p.images?.[0] || p.image || "/assets/images/cake1.png");
            const priceFmt = new Intl.NumberFormat("vi-VN").format(p.price || 0);
            const isActive = (p.status === 'active' || p.status === 'Active' || p.status === undefined);

            return `
                <tr>
                    <td><img src="${imgUrl}" class="product-img" alt="Product" style="cursor: pointer;" onclick="window.openDetailModal('${id}')"></td>
                    <td class="product-name" style="cursor: pointer;" onclick="window.openDetailModal('${id}')">${escapeHtml(p.name)}</td>
                    <td>${escapeHtml(categoryName(p.category) || 'Uncategorized')}</td>
                    <td class="price-text">đ${priceFmt}</td>
                    <td>${p.stock ?? 0} pcs</td>
                    <td><span class="status-badge ${isActive ? 'active' : 'inactive'}">${isActive ? 'Active' : 'Inactive'}</span></td>
                    <td class="action-btns">
                        <button class="btn-icon" title="View Detail" onclick="window.openDetailModal('${id}')">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                        </button>
                        <button class="btn-icon" title="Edit" onclick="window.openEditModal('${id}')">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                        </button>
                        <button class="btn-icon" title="Delete" style="color: var(--admin-accent);" onclick="window.deleteProduct('${id}')">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                        </button>
                    </td>
                </tr>
            `;
        }).join('');
    }

    // 3. Phân trang
    function renderPagination(totalItems, currentCount) {
        const totalPages = Math.ceil(totalItems / currentLimit) || 1;
        const startItem = (currentPage - 1) * currentLimit + 1;
        const endItem = startItem + currentCount - 1;
        
        paginationInfo.innerText = `Showing ${currentCount === 0 ? 0 : startItem}-${endItem} of ${totalItems} items`;

        let html = `<button class="page-btn" ${currentPage === 1 ? 'disabled' : ''} onclick="changePage(${currentPage - 1})"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"></polyline></svg></button>`;
        for (let i = 1; i <= totalPages; i++) {
            html += `<button class="page-btn ${i === currentPage ? 'active' : ''}" onclick="changePage(${i})">${i}</button>`;
        }
        html += `<button class="page-btn" ${currentPage === totalPages ? 'disabled' : ''} onclick="changePage(${currentPage + 1})"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"></polyline></svg></button>`;
        
        paginationControls.innerHTML = html;
    }

    window.changePage = (page) => {
        currentPage = page;
        loadProducts();
    };

    // 4. Mở Popup Xem Chi Tiết (Tự động bóc tách đúng data từ Backend)
    window.openDetailModal = async (id) => {
        try {
            detailContent.innerHTML = '<div style="text-align: center; padding: 30px; color: var(--admin-muted);">Loading detail...</div>';
            detailModal.hidden = false;

            const data = await window.SugarBlissAdmin.request(`/api/products/${id}`);
            if (!data) {
                detailContent.innerHTML = '<div style="text-align: center; color: var(--admin-accent); padding: 20px;">Không có dữ liệu trả về từ server.</div>';
                return;
            }

            // Bóc tách linh hoạt mọi kiểu trả về từ Backend
            const p = data.product || data.data || data.result || data;

            if (!p || typeof p !== 'object') {
                detailContent.innerHTML = '<div style="text-align: center; color: var(--admin-accent); padding: 20px;">Dữ liệu sản phẩm không hợp lệ.</div>';
                return;
            }

            renderDetailPopup(p);
        } catch (error) {
            console.error("Detail Error:", error);
            detailContent.innerHTML = `<div style="text-align: center; color: var(--admin-accent); padding: 20px;">Lỗi: ${escapeHtml(error.message)}</div>`;
        }
    };

    function renderDetailPopup(p) {
        const images = Array.isArray(p.images) && p.images.length > 0 
            ? p.images.filter(Boolean) 
            : (p.image ? [p.image] : []);
        
        const mainImgUrl = window.SugarBlissAdmin.assetUrl(images[0] || "/assets/images/cake1.png");
        const priceFmt = new Intl.NumberFormat("vi-VN").format(p.price || 0);
        const isActive = (p.status === 'active' || p.status === 'Active' || p.status === undefined);
        const ingredients = Array.isArray(p.ingredients) ? p.ingredients.join(', ') || 'N/A' : (p.ingredients || 'N/A');
        const ratingVal = p.rating || p.averageRating || 0;
        const reviewCount = Array.isArray(p.reviews) ? p.reviews.length : 0;

        detailContent.innerHTML = `
            <div class="detail-popup-grid">
                <div class="detail-popup-media">
                    <img id="detail-main-img" src="${escapeHtml(mainImgUrl)}" class="detail-popup-main-img" alt="Product Image">
                    ${images.length > 1 ? `
                        <div class="detail-popup-thumbs">
                            ${images.map((img, idx) => `
                                <img src="${escapeHtml(window.SugarBlissAdmin.assetUrl(img))}" class="detail-thumb ${idx === 0 ? 'active' : ''}" onclick="window.changeDetailMainImg(this, '${escapeHtml(window.SugarBlissAdmin.assetUrl(img))}')" alt="Thumb ${idx + 1}">
                            `).join('')}
                        </div>
                    ` : ''}
                </div>
                <div class="detail-popup-info">
                    <div class="detail-popup-badge-row">
                        <span class="status-badge ${isActive ? 'active' : 'inactive'}">${escapeHtml(p.status || (isActive ? 'Active' : 'Inactive'))}</span>
                        <span class="detail-category-tag">${escapeHtml(categoryName(p.category) || 'Uncategorized')}</span>
                    </div>
                    <h2 class="detail-popup-title">${escapeHtml(p.name || 'Untitled Product')}</h2>
                    <div class="detail-popup-price">đ${priceFmt}</div>
                    
                    <div class="detail-popup-specs">
                        <div class="spec-item"><strong>ID:</strong> <span>${escapeHtml(p._id || p.id || 'N/A')}</span></div>
                        <div class="spec-item"><strong>Stock:</strong> <span>${p.stock ?? 0} pcs</span></div>
                        <div class="spec-item"><strong>Weight:</strong> <span>${p.weightGram != null ? p.weightGram + 'g' : 'N/A'}</span></div>
                        <div class="spec-item"><strong>Shelf Life:</strong> <span>${p.shelfLifeDays != null ? p.shelfLifeDays + ' days' : 'N/A'}</span></div>
                        <div class="spec-item"><strong>Rating:</strong> <span>★ ${ratingVal} (${reviewCount} reviews)</span></div>
                        <div class="spec-item"><strong>Ingredients:</strong> <span>${escapeHtml(ingredients)}</span></div>
                    </div>

                    <div class="detail-popup-desc">
                        <strong>Description:</strong>
                        <p>${escapeHtml(p.description || 'No description available.')}</p>
                    </div>
                </div>
            </div>
        `;
    }

    window.changeDetailMainImg = (thumbEl, url) => {
        const mainImg = document.getElementById('detail-main-img');
        if (mainImg) mainImg.src = url;
        const thumbs = thumbEl.parentElement.querySelectorAll('.detail-thumb');
        thumbs.forEach(t => t.classList.remove('active'));
        thumbEl.classList.add('active');
    };

    function closeDetailModal() {
        detailModal.hidden = true;
    }

    btnCloseDetailModal?.addEventListener('click', closeDetailModal);
    btnCloseDetailBottom?.addEventListener('click', closeDetailModal);
    detailModal?.addEventListener('click', (e) => {
        if (e.target === detailModal) closeDetailModal();
    });

    // 5. Xóa sản phẩm
    window.deleteProduct = async (id) => {
        if (!confirm("Are you sure you want to delete this product?")) return;
        try {
            await window.SugarBlissAdmin.request(`/api/products/${id}`, { method: 'DELETE' });
            loadProducts();
        } catch (error) {
            alert("Delete failed: " + error.message);
        }
    };

    // 6. Mở Modal Thêm mới
    btnOpenAdd.addEventListener('click', () => {
        if (saving) return;
        productForm.reset();
        document.getElementById('prod-id').value = '';
        resetImages();
        formError('');
        modalTitle.innerText = "Add New Product";
        modal.hidden = false;
    });

    // 7. Mở Modal Chỉnh sửa
    window.openEditModal = async (id) => {
        if (saving) return;
        try {
            const data = await window.SugarBlissAdmin.request(`/api/products/${id}`);
            if (!data) return;
            const product = data.product || data.data || data.result || data;
            productForm.reset();

            document.getElementById('prod-id').value = product._id || product.id;
            document.getElementById('prod-name').value = product.name || '';
            document.getElementById('prod-description').value = product.description || '';
            document.getElementById('prod-weightGram').value = product.weightGram ?? '';
            document.getElementById('prod-shelfLifeDays').value = product.shelfLifeDays ?? '';
            document.getElementById('prod-ingredients').value = Array.isArray(product.ingredients) ? product.ingredients.join(', ') : (product.ingredients || '');
            await loadCategories(product.category?._id || product.category || '');
            document.getElementById('prod-price').value = product.price || 0;
            document.getElementById('prod-stock').value = product.stock || 0;
            document.getElementById('prod-status').value = product.status || 'active';
            resetImages(Array.isArray(product.images) ? product.images.filter(Boolean) : (product.image ? [product.image] : []));
            formError('');

            modalTitle.innerText = "Edit Product";
            modal.hidden = false;
        } catch (error) {
            alert("Failed to fetch product details: " + error.message);
        }
    };

    // 8. Lưu Form
    productForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (saving || !productForm.reportValidity()) return;
        const id = document.getElementById('prod-id').value;
        const payload = new FormData();
        for (const field of ['name', 'description', 'price', 'stock', 'status', 'weightGram', 'shelfLifeDays']) {
            payload.append(field, document.getElementById(`prod-${field}`).value);
        }
        payload.append('categoryId', categorySelect.value);
        const ingredients = document.getElementById('prod-ingredients').value.split(/[,\r\n]+/).map(value => value.trim()).filter(Boolean);
        payload.append('ingredients', JSON.stringify(ingredients));
        Array.from(imageInput.files || []).forEach((file) => payload.append('images', file));
        setSaving(true);
        formError('');

        try {
            if (id) {
                const result = await window.SugarBlissAdmin.request(`/api/products/${id}`, {
                    method: 'PUT',
                    body: payload
                });
                if (!result) return;
            } else {
                const result = await window.SugarBlissAdmin.request(`/api/products`, {
                    method: 'POST',
                    body: payload
                });
                if (!result) return;
            }
            modal.hidden = true;
            releasePreviewUrls();
            loadProducts();
        } catch (error) {
            formError(error.message);
        } finally { setSaving(false); }
    });

    btnCloseModal.addEventListener('click', closeModal);
    btnCancelModal.addEventListener('click', closeModal);

    // 9. Tìm kiếm Debounce
    let typingTimer;
    searchInput.addEventListener('input', (e) => {
        clearTimeout(typingTimer);
        searchQuery = e.target.value.trim();
        typingTimer = setTimeout(() => {
            currentPage = 1;
            loadProducts();
        }, 400);
    });

    function escapeHtml(value) {
        return String(value || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
    }

    loadProducts();
    loadCategories();
});
