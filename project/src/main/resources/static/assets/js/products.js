const API_BASE_URL = window.SugarBlissApi.baseUrl;
const preferredCategories = ["Cookies", "Waffles", "Macaroons", "Snacks", "Beverages"];
const productFilters = { minPrice: '', maxPrice: '', sort: 'default', category: '' };
let availableProductCategories = [];
let productFilterTimer = null;
let productsRequestVersion = 0;
let loadedProducts = [];
let productsPagination = { page: 0, pages: 0, total: 0 };
let productsLoading = false;

function t(key, fallback) {
    if (window.SugarI18n) {
        const value = window.SugarI18n.translate(key);
        if (value !== null) {
            return value;
        }
    }
    return fallback;
}

function tCategory(name) {
    return window.SugarI18n ? window.SugarI18n.translateCategory(name) : name;
}

function productCategoryName(product) {
    return typeof product?.category === 'string' ? product.category : product?.category?.name || '';
}

document.addEventListener("DOMContentLoaded", () => {
    document.querySelector('[data-product-filters]')?.addEventListener('submit', event => { event.preventDefault(); applyProductFilters(); });
    document.getElementById('products-sort')?.addEventListener('change', () => applyProductFilters());
    ['products-min-price', 'products-max-price'].forEach(id => {
        document.getElementById(id)?.addEventListener('input', () => {
            window.clearTimeout(productFilterTimer);
            productFilterTimer = window.setTimeout(() => applyProductFilters(productFilters.category, false), 350);
        });
    });
    document.querySelector('[data-category-list]')?.addEventListener('click', event => {
        const button = event.target.closest('[data-product-category]');
        if (button && !button.disabled) applyProductFilters(button.dataset.productCategory);
    });
    document.querySelector('[data-clear-product-filters]')?.addEventListener('click', () => {
        document.querySelector('[data-product-filters]').reset();
        window.clearTimeout(productFilterTimer);
        Object.assign(productFilters, { minPrice: '', maxPrice: '', sort: 'default', category: '' });
        filterFeedback();
        fetchProducts();
    });
    document.querySelector('[data-products-more]')?.addEventListener('click', () => fetchProducts(true));
    fetchProducts();
});

// Ve lai danh sach san pham khi nguoi dung doi ngon ngu
window.addEventListener("sugarbliss:lang-changed", () => {
    fetchProducts();
});

function filterFeedback(message = '') {
    const node = document.querySelector('[data-product-filter-error]');
    if (node) { node.textContent = message; node.hidden = !message; }
}

function applyProductFilters(category = productFilters.category, reportValidity = true) {
    window.clearTimeout(productFilterTimer);
    const form = document.querySelector('[data-product-filters]');
    if (!form) return;
    if (!(reportValidity ? form.reportValidity() : form.checkValidity())) {
        filterFeedback(t('products.priceInputError', 'Enter a non-negative whole VND amount.'));
        return;
    }
    const rawMinPrice = document.getElementById('products-min-price').value.trim();
    const rawMaxPrice = document.getElementById('products-max-price').value.trim();
    if ([rawMinPrice, rawMaxPrice].some(value => value !== '' && (!Number.isSafeInteger(Number(value)) || Number(value) < 0))) {
        filterFeedback(t('products.priceInputError', 'Enter a non-negative whole VND amount.'));
        return;
    }
    const minPrice = rawMinPrice === '' ? '' : String(Number(rawMinPrice));
    const maxPrice = rawMaxPrice === '' ? '' : String(Number(rawMaxPrice));
    if (minPrice && maxPrice && Number(minPrice) > Number(maxPrice)) {
        filterFeedback(t('products.priceRangeError', 'Price from must not exceed Price to.'));
        return;
    }
    Object.assign(productFilters, { minPrice, maxPrice, sort: document.getElementById('products-sort').value, category });
    filterFeedback();
    fetchProducts();
}

function syncProductsPagination() {
    const more = document.querySelector('[data-products-more]');
    if (more) {
        more.hidden = productsPagination.page >= productsPagination.pages || !loadedProducts.length;
        more.disabled = productsLoading;
        more.textContent = productsLoading ? t('products.loading', 'Loading products...') : t('products.loadMore', 'Load more');
    }
    const count = document.querySelector('[data-products-result-count]');
    if (count) count.textContent = productsLoading ? t('products.loading', 'Loading products...')
        : t(productsPagination.total === 1 ? 'products.resultCountOne' : 'products.resultCount',
            productsPagination.total === 1 ? '{count} product' : '{count} products').replace('{count}', String(productsPagination.total));
}

function renderProductCategories() {
    const list = document.querySelector('[data-category-list]');
    if (!list) return;
    const categories = [...new Set([...availableProductCategories, ...(productFilters.category ? [productFilters.category] : [])])];
    const ordered = getOrderedCategories(Object.fromEntries(categories.map(category => [category, []])));
    list.hidden = false;
    list.innerHTML = ['', ...ordered].map(category => `<li><button type="button" class="products-category-button" data-product-category="${escapeHtml(category)}" aria-pressed="${category === productFilters.category}">${escapeHtml(category ? tCategory(category) : t('products.allCategories', 'All products'))}</button></li>`).join('');
}

async function fetchProducts(append = false) {
    const container = document.querySelector("[data-products-container]");
    const categoryList = document.querySelector("[data-category-list]");
    const token = localStorage.getItem("sugarBlissToken");

    if (!container || !categoryList) {
        return;
    }
    if (append && (productsLoading || productsPagination.page >= productsPagination.pages)) return;
    const version = ++productsRequestVersion;
    const page = append ? productsPagination.page + 1 : 1;
    renderProductCategories();

    if (!token) {
        container.innerHTML = `
            <div class="products-state">
                <p>${escapeHtml(t("products.loginPrompt", "Please log in to view our products."))}</p>
                <a href="/login">${escapeHtml(t("products.loginNow", "Login Now"))}</a>
            </div>
        `;
        categoryList.innerHTML = "";
        loadedProducts = [];
        productsPagination = { page: 0, pages: 0, total: 0 };
        productsLoading = false;
        syncProductsPagination();
        return;
    }

    productsLoading = true;
    filterFeedback();
    if (!append) {
        loadedProducts = [];
        productsPagination = { page: 0, pages: 0, total: 0 };
        container.innerHTML = `<div class="products-state"><p>${escapeHtml(t("products.loading", "Loading products..."))}</p></div>`;
    }
    container.setAttribute('aria-busy', 'true');
    syncProductsPagination();

    try {
        const query = new URLSearchParams({ status: 'all', limit: '100', page: String(page), sort: productFilters.sort });
        if (productFilters.minPrice !== '') query.set('minPrice', productFilters.minPrice);
        if (productFilters.maxPrice !== '') query.set('maxPrice', productFilters.maxPrice);
        if (productFilters.category !== '') query.set('category', productFilters.category);
        const productsResponse = await fetch(`${API_BASE_URL}/api/products?${query}`, {
            headers: {
                Authorization: `Bearer ${token}`
            }
        });

        const productsData = await productsResponse.json();
        if (version !== productsRequestVersion) return;

        if (!productsResponse.ok) {
            throw Object.assign(new Error(productsData.message || t("products.loadError", "Cannot load products.")), { status: productsResponse.status });
        }

        const incoming = Array.isArray(productsData.products) ? productsData.products : [];
        if (Array.isArray(productsData.categories)) {
            availableProductCategories = productsData.categories.filter(category => typeof category === 'string' && category.trim());
        } else if (!availableProductCategories.length) {
            availableProductCategories = [...new Set(incoming.map(productCategoryName).filter(Boolean))];
        }
        loadedProducts = append ? [...new Map([...loadedProducts, ...incoming].map(product => [String(product._id || product.id), product])).values()] : incoming;
        productsPagination = { page, pages: Number(productsData.pagination?.pages) || 1,
            total: Number(productsData.pagination?.total) || loadedProducts.length };
        renderProducts(loadedProducts);
    } catch (error) {
        if (version !== productsRequestVersion) return;
        if (append) filterFeedback(error.message);
        else container.innerHTML = `
            <div class="products-state is-error">
                <p>${escapeHtml(error.message)}</p>
                ${error.status === 401 ? `<a href="/login">${escapeHtml(t('products.loginAgain', 'Login Again'))}</a>` : `<button class="products-filter-reset" type="button" data-retry-products>${escapeHtml(t('products.retry', 'Try again'))}</button>`}
            </div>
        `;
        container.addEventListener('click', handleProductActionClick);
    } finally {
        if (version === productsRequestVersion) {
            productsLoading = false;
            container.setAttribute('aria-busy', 'false');
            syncProductsPagination();
        }
    }
}

function renderProducts(products) {
    const container = document.querySelector("[data-products-container]");
    const sortedByPrice = productFilters.sort !== 'default';
    renderProductCategories();
    document.querySelector('.products-layout')?.classList.toggle('is-price-sorted', sortedByPrice);
    if (products.length === 0) {
        container.innerHTML = `
            <div class="products-state">
                <p>${escapeHtml(productFilters.category !== '' || productFilters.minPrice !== '' || productFilters.maxPrice !== '' ? t('products.noMatches', 'No products match these filters.') : t("products.empty", "No products are available yet."))}</p>
            </div>
        `;
        return;
    }

    if (sortedByPrice) {
        container.innerHTML = `<div class="products-grid-layout">${products.map(renderProductCard).join('')}</div>`;
        container.addEventListener('click', handleProductActionClick);
        return;
    }

    const groupedProducts = groupProductsByCategory(products);
    const orderedCategories = getOrderedCategories(groupedProducts);

    container.innerHTML = orderedCategories
        .map((category) => renderCategorySection(category, groupedProducts[category]))
        .join("");

    container.addEventListener("click", handleProductActionClick);
}

function groupProductsByCategory(products) {
    return products.reduce((groups, product) => {
        const category = productCategoryName(product) || "Other";

        if (!groups[category]) {
            groups[category] = [];
        }

        groups[category].push(product);
        return groups;
    }, Object.create(null));
}

function getOrderedCategories(groupedProducts) {
    const categories = Object.keys(groupedProducts);
    const preferred = preferredCategories.filter((category) => categories.includes(category));
    const remaining = categories
        .filter((category) => !preferredCategories.includes(category))
        .sort((first, second) => first.localeCompare(second));

    return [...preferred, ...remaining];
}

function renderCategorySection(category, products) {
    return `
        <section class="category-section" id="${toSectionId(category)}">
            <h2>${escapeHtml(tCategory(category))}</h2>
            <div class="products-grid-layout">
                ${products.map(renderProductCard).join("")}
            </div>
        </section>
    `;
}

function renderProductCard(product) {
    const productId = product._id || product.id || "";
    const imageSrc = resolveImageUrl(product.images?.[0] || product.image);
    const price = formatPrice(product.price);
    const stock = Number(product.stock);
    const isUnavailable = product.status !== "active" || !Number.isSafeInteger(stock) || stock <= 0;
    const unavailableLabel = product.status === "out-of-stock" || product.status === "active" && stock <= 0
        ? t("products.outOfStock", "Out of stock") : t("products.unavailable", "Unavailable");

    return `
        <article class="product-card${isUnavailable ? ' is-unavailable' : ''}" ${isUnavailable ? 'aria-disabled="true"' : ''}>
            <button class="product-image-button" type="button" data-image-detail-id="${escapeHtml(productId)}" aria-label="View ${escapeHtml(product.name || "Sugar Bliss product")} detail" ${isUnavailable ? 'disabled' : ''}>
                <img src="${escapeHtml(imageSrc)}" alt="${escapeHtml(product.name || "Sugar Bliss product")}">
                ${isUnavailable ? `<span class="product-stock-badge">${escapeHtml(unavailableLabel)}</span>` : ''}
            </button>
       
            <h3>${escapeHtml(product.name || t("products.defaultName", "Sugar Bliss Product"))}</h3>
            <p class="product-price">${price}</p>
            <div class="product-actions">
                <button class="btn-detail" type="button" data-detail-id="${escapeHtml(productId)}" ${isUnavailable ? 'disabled' : ''}>${escapeHtml(t('products.viewDetail', 'View Detail'))}</button>
                <button class="btn-add-cart" type="button" data-add-cart-id="${escapeHtml(productId)}" ${isUnavailable ? "disabled" : ""}>
                    ${escapeHtml(isUnavailable ? unavailableLabel : t('products.addToCart', 'Add To Cart'))}
                </button>
            </div>
        </article>
    `;
}

function handleProductActionClick(event) {
    if (event.target.closest('[data-retry-products]')) { fetchProducts(); return; }
    const imageButton = event.target.closest("[data-image-detail-id]");
    if (imageButton) {
        if (imageButton.disabled) return;
        window.location.href = `/pages/product-detail.html?id=${imageButton.dataset.imageDetailId}`;
        return;
    }

    const detailButton = event.target.closest("[data-detail-id]");
    if (detailButton) {
        if (detailButton.disabled) return;
        window.location.href = `/pages/product-detail.html?id=${detailButton.dataset.detailId}`;
        return;
    }

    const addCartButton = event.target.closest("[data-add-cart-id]");
    if (addCartButton && !addCartButton.disabled) {
        addProductToCart(addCartButton.dataset.addCartId, addCartButton);
    }
}

async function addProductToCart(productId, button) {
    if (!button || button.disabled) return;
    const token = localStorage.getItem("sugarBlissToken");

    if (!token) {
        window.location.href = "/login";
        return;
    }

    const originalText = button.textContent.trim();
    button.disabled = true;
    button.textContent = "Adding...";

    try {
        const response = await fetch(`${API_BASE_URL}/api/users/me/cart/${productId}`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`
            },
            body: JSON.stringify({ quantity: 1 })
        });

        if (response.status === 401) {
            localStorage.removeItem("sugarBlissToken");
            localStorage.removeItem("sugarBlissUser");
            window.location.href = "/login";
            return;
        }

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || "Cannot add this product to your cart.");
        }

        window.dispatchEvent(new CustomEvent("sugarbliss:cart-updated", {
            detail: { count: Array.isArray(data) ? data.length : 0 }
        }));

        button.textContent = "Added";
        window.setTimeout(() => {
            button.textContent = originalText;
            button.disabled = false;
        }, 1200);
    } catch (error) {
        alert(error.message);
        button.textContent = originalText;
        button.disabled = false;
    }
}

function resolveImageUrl(image) {
    if (!image) {
        return "/assets/images/cake2.png";
    }

    if (image.startsWith("http://") || image.startsWith("https://")) {
        return image;
    }

    if (image.startsWith("/uploads")) {
        return `${API_BASE_URL}${image}`;
    }

    return image;
}

function formatPrice(price) {
    const value = Number(price);

    if (!Number.isFinite(value)) {
        return t("products.contactPrice", "Contact for price");
    }

    return new Intl.NumberFormat("vi-VN", {
        style: "currency",
        currency: "VND",
        maximumFractionDigits: 0
    }).format(value);
}

function toSectionId(category) {
    return category
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)+/g, "");
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}
