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
    let existingImages = [];
    let previewUrls = [];
    let saving = false;

    function formError(message, id = 'product-form-error') {
        const node = document.getElementById(id);
        node.textContent = message;
        node.hidden = !message;
    }

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

    // 1. Tải danh sách sản phẩm (Kết nối GET /api/products & GET /api/products/search)
    async function loadProducts() {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding: 20px;">Loading data...</td></tr>';
        
        try {
            let url = '';
            if (searchQuery) {
                // Gọi Endpoint Tìm kiếm riêng trong hình: GET /api/products/search
                url = `/api/products/search?q=${encodeURIComponent(searchQuery)}&page=${currentPage}&limit=${currentLimit}`;
            } else {
                // Endpoint mặc định: GET /api/products
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
            const imgUrl = window.SugarBlissAdmin.assetUrl(p.images?.[0] || p.image || "/assets/images/cake1.png");
            const priceFmt = new Intl.NumberFormat("vi-VN").format(p.price || 0);
            const isActive = (p.status === 'active' || p.status === 'Active' || p.status === undefined);

            return `
                <tr>
                    <td><img src="${imgUrl}" class="product-img" alt="Product"></td>
                    <td class="product-name">${escapeHtml(p.name)}</td>
                    <td>${escapeHtml(p.category || 'Uncategorized')}</td>
                    <td class="price-text">đ${priceFmt}</td>
                    <td>${p.stock ?? 0} pcs</td>
                    <td><span class="status-badge ${isActive ? 'active' : 'inactive'}">${isActive ? 'Active' : 'Inactive'}</span></td>
                    <td class="action-btns">
                        <button class="btn-icon" title="Edit" onclick="openEditModal('${p._id || p.id}')">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                        </button>
                        <button class="btn-icon" title="Delete" style="color: var(--admin-accent);" onclick="deleteProduct('${p._id || p.id}')">
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

    // 4. Xóa sản phẩm (Kết nối DELETE /api/products/:id)
    window.deleteProduct = async (id) => {
        if (!confirm("Are you sure you want to delete this product?")) return;
        try {
            await window.SugarBlissAdmin.request(`/api/products/${id}`, { method: 'DELETE' });
            loadProducts();
        } catch (error) {
            alert("Delete failed: " + error.message);
        }
    };

    // 5. Mở Modal Thêm mới
    btnOpenAdd.addEventListener('click', () => {
        if (saving) return;
        productForm.reset();
        document.getElementById('prod-id').value = '';
        resetImages();
        formError('');
        modalTitle.innerText = "Add New Product";
        modal.hidden = false;
    });

    // 6. Mở Modal Chỉnh sửa (Kết nối GET /api/products/:id)
    window.openEditModal = async (id) => {
        if (saving) return;
        try {
            const data = await window.SugarBlissAdmin.request(`/api/products/${id}`);
            if (!data) return;
            const product = data.product || data;
            productForm.reset();

            document.getElementById('prod-id').value = product._id || product.id;
            document.getElementById('prod-name').value = product.name || '';
            document.getElementById('prod-description').value = product.description || '';
            document.getElementById('prod-category').value = product.category || '';
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

    // 7. Lưu Form (Kết nối POST /api/products hoặc PUT /api/products/:id)
    productForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (saving || !productForm.reportValidity()) return;
        const id = document.getElementById('prod-id').value;
        const payload = new FormData();
        for (const field of ['name', 'description', 'category', 'price', 'stock', 'status']) {
            payload.append(field, document.getElementById(`prod-${field}`).value);
        }
        Array.from(imageInput.files || []).forEach((file) => payload.append('images', file));
        setSaving(true);
        formError('');

        try {
            if (id) {
                // Sửa: PUT /api/products/:id
                const result = await window.SugarBlissAdmin.request(`/api/products/${id}`, {
                    method: 'PUT',
                    body: payload
                });
                if (!result) return;
            } else {
                // Thêm: POST /api/products
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

    // Đóng Modal
    btnCloseModal.addEventListener('click', closeModal);
    btnCancelModal.addEventListener('click', closeModal);

    // 8. Tim kiếm Debounce
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
});
