const urlParams = new URLSearchParams(window.location.search);
const currentProductId = urlParams.get('id');

const API_BASE_URL = window.SugarBlissApi ? window.SugarBlissApi.baseUrl : 'http://localhost:3000';
let isCurrentProductFavorite = false;
let currentProduct = null;
let addingToCart = false;

function productIsAvailable() {
    const stock = Number(currentProduct?.stock);
    return currentProduct?.status === 'active' && Number.isSafeInteger(stock) && stock > 0;
}

function syncProductAvailability() {
    const available = productIsAvailable();
    const stock = available ? Number(currentProduct.stock) : 0;
    const input = document.getElementById('qty-input');
    const button = document.querySelector('.detail-actions .btn-add-cart');
    const status = document.getElementById('product-availability');
    document.querySelector('.detail-container')?.classList.toggle('is-unavailable', Boolean(currentProduct) && !available);
    input.disabled = !available || addingToCart;
    input.max = String(Math.max(1, stock));
    input.value = String(Math.max(1, Math.min(Number(input.value) || 1, Math.max(1, stock))));
    document.querySelector('.quantity-selector button:first-child').disabled = !available || addingToCart || Number(input.value) <= 1;
    document.querySelector('.quantity-selector button:last-child').disabled = !available || addingToCart || Number(input.value) >= stock;
    button.disabled = !available || addingToCart;
    const soldOut = currentProduct?.status === 'out-of-stock' || currentProduct?.status === 'active' && Number(currentProduct.stock) <= 0;
    const key = available ? 'detail.addToCart' : soldOut ? 'products.outOfStock' : 'products.unavailable';
    const fallback = available ? 'Add To Cart' : soldOut ? 'Out of stock' : 'Unavailable';
    if (!addingToCart) {
        button.setAttribute('data-i18n', key);
        button.textContent = window.SugarI18n?.translate(key) || fallback;
    }
    status.hidden = !currentProduct || available;
    status.textContent = available ? '' : window.SugarI18n?.translate(key) || fallback;
}

window.addEventListener('sugarbliss:lang-changed', syncProductAvailability);

document.addEventListener('DOMContentLoaded', () => {
    if (!currentProductId) {
        document.getElementById('product-title-price').innerText = "Lỗi: URL thiếu ID sản phẩm!";
        return;
    }
    
    const favoriteButton = document.getElementById('favorite-detail-button');
    favoriteButton?.addEventListener('click', toggleFavoriteDetail);

    window.SugarBlissReviews?.init();
    fetchProductDetail();
    fetchRelatedProducts();
    loadFavoriteState();
});

/* --- TẢI YÊU THÍCH --- */
function updateFavoriteButton(isFavorite) {
    const button = document.getElementById('favorite-detail-button');
    if (!button) return;

    isCurrentProductFavorite = isFavorite;
    button.classList.toggle('is-saved', isFavorite);
    button.setAttribute('aria-pressed', String(isFavorite));
    button.textContent = isFavorite ? '\u2665 Saved' : '\u2661 Favourites';
}

async function loadFavoriteState() {
    const token = localStorage.getItem('sugarBlissToken');
    if (!token) {
        updateFavoriteButton(false);
        return;
    }

    try {
        const response = await fetch(`${API_BASE_URL}/api/users/me/favorites`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        
        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.message || 'Cannot load favorites.');
        }

        const data = await response.json();
        const favorites = Array.isArray(data) ? data : [];
        const isFavorite = favorites.some((product) => String(product._id || product.id) === String(currentProductId));
        updateFavoriteButton(isFavorite);
    } catch (error) {
        console.error('Cannot load favorite state:', error);
        updateFavoriteButton(false);
    }
}

async function toggleFavoriteDetail() {
    const token = localStorage.getItem('sugarBlissToken');
    const button = document.getElementById('favorite-detail-button');

    if (!token) {
        window.location.href = '/login';
        return;
    }

    const previousState = isCurrentProductFavorite;
    button.disabled = true;
    button.textContent = previousState ? 'Removing...' : 'Saving...';

    try {
        const response = await fetch(`${API_BASE_URL}/api/users/me/favorites/${currentProductId}`, {
            method: previousState ? 'DELETE' : 'POST',
            headers: { Authorization: `Bearer ${token}` }
        });
        
        if (response.status === 401) {
            localStorage.removeItem('sugarBlissToken');
            localStorage.removeItem('sugarBlissUser');
            window.location.href = '/login';
            return;
        }

        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.message || 'Cannot update favorites.');
        }

        updateFavoriteButton(!previousState);
    } catch (error) {
        updateFavoriteButton(previousState);
        alert(error.message);
    } finally {
        button.disabled = false;
    }
}

/* --- XỬ LÝ ẢNH & CHI TIẾT SẢN PHẨM --- */
function resolveProductImage(image) {
    if (!image) return '';
    return image.startsWith('/') ? `${API_BASE_URL}${image}` : image;
}

function renderProductImages(product) {
    const mainImage = document.getElementById('main-product-image');
    const thumbnailList = document.getElementById('product-thumbnail-list');
    const images = Array.isArray(product.images)
        ? product.images.filter((image) => typeof image === 'string' && image.trim())
        : (product.image ? [product.image] : []);

    thumbnailList.replaceChildren();

    if (images.length === 0) {
        mainImage.src = '/assets/images/cake1.png';
        mainImage.alt = `${product.name || 'Product'} image unavailable`;
        return;
    }

    const selectImage = (image, thumbnail) => {
        mainImage.src = resolveProductImage(image);
        mainImage.alt = product.name || 'Product image';

        thumbnailList.querySelectorAll('.product-thumbnail').forEach((item) => {
            item.classList.toggle('active', item === thumbnail);
            item.setAttribute('aria-selected', String(item === thumbnail));
        });
    };

    images.forEach((image, index) => {
        const thumbnail = document.createElement('button');
        const thumbnailImage = document.createElement('img');

        thumbnail.type = 'button';
        thumbnail.className = 'product-thumbnail';
        thumbnail.setAttribute('aria-label', `View image ${index + 1} of ${images.length}`);
        thumbnail.setAttribute('aria-selected', String(index === 0));
        thumbnailImage.src = resolveProductImage(image);
        thumbnailImage.alt = `${product.name || 'Product'} thumbnail ${index + 1}`;

        thumbnail.appendChild(thumbnailImage);
        thumbnail.addEventListener('click', () => selectImage(image, thumbnail));
        thumbnailList.appendChild(thumbnail);
    });

    selectImage(images[0], thumbnailList.firstElementChild);
}

function updateQty(change) {
    const input = document.getElementById('qty-input');
    if (input && !input.disabled && productIsAvailable() && !addingToCart) {
        const newVal = Number(input.value) + change;
        if (Number.isSafeInteger(newVal) && newVal >= 1 && newVal <= Number(currentProduct.stock)) input.value = String(newVal);
        syncProductAvailability();
    }
}

async function fetchProductDetail() {
    try {
        const token = localStorage.getItem("sugarBlissToken");
        const headers = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const response = await fetch(`${API_BASE_URL}/api/products/${currentProductId}`, { headers });
        
        if (!response.ok) throw new Error("Không tìm thấy sản phẩm trong Database");

        const data = await response.json();
        const product = data.product || data.data || data; 
        currentProduct = product;
        syncProductAvailability();

        const priceStr = product.price ? new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(product.price) : "Liên hệ";
        
        document.getElementById('product-title-price').innerText = `${product.name} - ${priceStr}`;
        
        renderProductImages(product);
        
        document.getElementById('product-desc').innerText = product.description || "Chưa có mô tả cho sản phẩm này.";
        document.getElementById('product-weight').innerText = product.weightGram != null ? `${product.weightGram}g` : "Đang cập nhật";
        document.getElementById('product-exp').innerText = product.shelfLifeDays != null ? `${product.shelfLifeDays} days` : "Đang cập nhật";
        
        if (Array.isArray(product.ingredients) && product.ingredients.length) {
            document.getElementById('product-ingredients').innerText = product.ingredients.join(', ');
        } else {
            document.getElementById('product-ingredients').innerText = "Đang cập nhật";
        }

        window.SugarBlissReviews?.render(product);

        const container = document.querySelector('.detail-container');
        if (container) container.classList.add('loaded');

    } catch (error) {
        console.error("Lỗi tải chi tiết:", error);
        document.getElementById('product-title-price').innerText = "Lỗi dữ liệu: " + error.message;
        const container = document.querySelector('.detail-container');
        if (container) container.classList.add('loaded');
    }
}

async function fetchRelatedProducts() {
    try {
        const token = localStorage.getItem("sugarBlissToken");
        const headers = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const response = await fetch(`${API_BASE_URL}/api/products?status=all&limit=20`, { headers });
        
        if (!response.ok) return;

        const data = await response.json();
        const products = Array.isArray(data.products) ? data.products : (Array.isArray(data) ? data : []);
        
        const related = products.filter(p => String(p._id || p.id) !== String(currentProductId)).slice(0, 5);
        
        const container = document.getElementById('related-products');
        if (!container) return;

        if (related.length === 0) {
            container.innerHTML = '<p style="grid-column: 1 / -1; text-align: center; color: #666; font-size: 16px;">Không có sản phẩm gợi ý nào.</p>';
            return;
        }

        container.innerHTML = related.map(item => {
            const itemId = item._id || item.id;
            const itemImg = item.images?.[0] || item.image || "/assets/images/cake2.png";
            const fullImg = itemImg.startsWith('/') ? `${API_BASE_URL}${itemImg}` : itemImg;
            const itemName = item.name || "Sugar Bliss Product";
            
            return `
                <div class="related-card" style="cursor: pointer;" onclick="window.location.href='/pages/product-detail.html?id=${itemId}'">
                    <img src="${fullImg}" alt="${escapeHtml(itemName)}" onerror="this.src='/assets/images/cake1.png'">
                    <h4>${escapeHtml(itemName)}</h4>
                </div>
            `;
        }).join('');
    } catch (error) {
        console.error("Lỗi tải sản phẩm gợi ý:", error);
    }
}

async function addProductToCart(button) {
    if (!button || button.disabled || addingToCart || !productIsAvailable()) return;
    const token = localStorage.getItem("sugarBlissToken");
    if (!token) {
        window.location.href = "/login";
        return;
    }

    const qtyInput = document.getElementById('qty-input');
    const qty = qtyInput ? qtyInput.value : 1;
    if (!Number.isSafeInteger(Number(qty)) || Number(qty) < 1 || Number(qty) > Number(currentProduct.stock)) return;
    let succeeded = false;
    addingToCart = true;
    syncProductAvailability();

    button.disabled = true;
    button.textContent = "Adding...";

    try {
        const response = await fetch(`${API_BASE_URL}/api/users/me/cart/${currentProductId}`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`
            },
            body: JSON.stringify({
                productId: currentProductId,
                quantity: Number(qty)
            })
        });

        if (response.status === 401) {
            localStorage.removeItem("sugarBlissToken");
            localStorage.removeItem("sugarBlissUser");
            window.location.href = "/login";
            return;
        }

        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.message || "Cannot add this product to your cart.");
        }
        
        const data = await response.json();
        window.dispatchEvent(new CustomEvent("sugarbliss:cart-updated", {
            detail: { count: Array.isArray(data) ? data.length : 0 }
        }));
        
        button.textContent = "Added to Cart";
        succeeded = true;
        
        window.setTimeout(() => {
            addingToCart = false;
            syncProductAvailability();
        }, 1200);
    } catch (error) {
        alert(error.message);
    } finally {
        if (!succeeded) {
            addingToCart = false;
            syncProductAvailability();
        }
    }
}


function escapeHtml(value) {
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}
