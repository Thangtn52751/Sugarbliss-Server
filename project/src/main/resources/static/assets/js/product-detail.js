const urlParams = new URLSearchParams(window.location.search);
const currentProductId = urlParams.get('id');
const API_BASE_URL = window.SugarBlissApi ? window.SugarBlissApi.baseUrl : 'http://localhost:3000';

document.addEventListener('DOMContentLoaded', () => {
    if (!currentProductId) {
        document.getElementById('product-title-price').innerText = "Lỗi: URL thiếu ID sản phẩm!";
        return;
    }
    
    fetchProductDetail();
    fetchRelatedProducts();
    renderReviews();
    checkReviewEligibility(); // Bổ sung: Kiểm tra xem user đã mua hàng chưa
});

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
    if (input) {
        let newVal = parseInt(input.value) + change;
        if (newVal >= 1) input.value = newVal;
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

        const priceStr = product.price ? new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(product.price) : "Liên hệ";
        
        document.getElementById('product-title-price').innerText = `${product.name} - ${priceStr}`;
        
        renderProductImages(product);
        
        document.getElementById('product-desc').innerText = product.description || "Chưa có mô tả cho sản phẩm này.";
        document.getElementById('product-weight').innerText = product.weightGram ? `${product.weightGram}g` : "Đang cập nhật";
        document.getElementById('product-exp').innerText = product.shelfLifeDays ? `${product.shelfLifeDays} days` : "Đang cập nhật";
        
        if (product.ingredients && Array.isArray(product.ingredients)) {
            document.getElementById('product-ingredients').innerText = product.ingredients.join(', ');
        } else {
            document.getElementById('product-ingredients').innerText = "Đang cập nhật";
        }

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

async function createOrderFromDetail() {
    const token = localStorage.getItem("sugarBlissToken");
    if (!token) {
        alert("Vui lòng đăng nhập để mua hàng!");
        window.location.href = "/login";
        return;
    }

    const qtyInput = document.getElementById('qty-input');
    const qty = qtyInput ? qtyInput.value : 1;
    
    try {
        const response = await fetch(`${API_BASE_URL}/api/orders`, {
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

        if (!response.ok) {
            const errData = await response.json();
            throw new Error(errData.message || "Lỗi khi tạo đơn hàng");
        }
        alert(`Đặt hàng thành công ${qty} sản phẩm!`);
        
        // Cập nhật lại nút review sau khi đặt hàng thành công
        checkReviewEligibility();
    } catch (error) {
        alert("Không thể đặt hàng: " + error.message);
    }
}

async function toggleFavoriteDetail() {
    const token = localStorage.getItem("sugarBlissToken");
    if (!token) {
        alert("Vui lòng đăng nhập để thêm vào yêu thích!");
        window.location.href = "/login";
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE_URL}/api/users/me/favorites/${currentProductId}`, {
            method: "POST",
            headers: { "Authorization": `Bearer ${token}` }
        });
        
        if (!response.ok) throw new Error("Sản phẩm đã có trong mục yêu thích hoặc có lỗi xảy ra");
        alert("Đã thêm vào danh sách yêu thích!");
    } catch (error) {
        alert(error.message);
    }
}

// BỔ SUNG: Kiểm tra xem user có được phép đánh giá hay không
async function checkReviewEligibility() {
    const reviewBtn = document.querySelector('.btn-submit-review');
    if (!reviewBtn) return;

    const token = localStorage.getItem("sugarBlissToken");
    if (!token) {
        disableReviewButton(reviewBtn, "Vui lòng đăng nhập để đánh giá");
        return;
    }

    try {
        // Lấy danh sách đơn hàng cá nhân
        const response = await fetch(`${API_BASE_URL}/api/users/me/orders`, {
            headers: { "Authorization": `Bearer ${token}` }
        });

        if (!response.ok) {
            disableReviewButton(reviewBtn, "Cần mua sản phẩm để đánh giá");
            return;
        }

        const data = await response.json();
        const orders = data.orders || data.data || data;
        let hasPurchased = false;

        // Quét lịch sử mua hàng tìm Product ID hiện tại
        if (Array.isArray(orders)) {
            hasPurchased = orders.some(order => {
                if (String(order.product || order.productId) === String(currentProductId)) return true;
                if (Array.isArray(order.items)) {
                    return order.items.some(item => String(item.product || item.productId || item._id) === String(currentProductId));
                }
                return false;
            });
        }

        if (!hasPurchased) {
            disableReviewButton(reviewBtn, "Bạn phải mua sản phẩm này để viết đánh giá");
        } else {
            // Đã mua hàng -> Bật lại nút
            reviewBtn.disabled = false;
            reviewBtn.title = "";
            reviewBtn.innerText = "Submit Review";
        }
    } catch (error) {
        console.error("Lỗi kiểm tra lịch sử mua hàng:", error);
        disableReviewButton(reviewBtn, "Lỗi kiểm tra quyền đánh giá");
    }
}

function disableReviewButton(btn, message) {
    btn.disabled = true;
    btn.title = message;
    btn.innerText = "Chưa mua hàng";
}

function renderReviews() {
    const reviewsList = document.getElementById('product-reviews-list');
    if (!reviewsList) return;

    const mockReviews = [
        {
            name: "Jane Doe",
            initial: "J",
            rating: "★★★★★",
            text: "The cheesecake was absolutely divine! Perfectly moist and the flavor was spot on. I'll definitely be ordering again."
        },
        {
            name: "Michael Smith",
            initial: "M",
            rating: "★★★★☆",
            text: "Great service and fresh ingredients. The delivery was a bit late but the product quality made up for it."
        }
    ];

    reviewsList.innerHTML = mockReviews.map(review => `
        <div class="review-card">
            <div class="review-header">
                <div class="review-user">
                    <div class="review-avatar">${review.initial}</div>
                    <div class="review-name">${review.name}</div>
                </div>
                <div class="review-stars">${review.rating}</div>
            </div>
            <p class="review-text">${review.text}</p>
        </div>
    `).join('');
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}