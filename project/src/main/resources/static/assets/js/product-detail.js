const urlParams = new URLSearchParams(window.location.search);
const currentProductId = urlParams.get('id');

const API_BASE_URL = window.SugarBlissApi ? window.SugarBlissApi.baseUrl : 'http://localhost:3000';
let isCurrentProductFavorite = false;
let selectedRating = 0;

document.addEventListener('DOMContentLoaded', () => {
    if (!currentProductId) {
        document.getElementById('product-title-price').innerText = "Lỗi: URL thiếu ID sản phẩm!";
        return;
    }
    
    const favoriteButton = document.getElementById('favorite-detail-button');
    favoriteButton?.addEventListener('click', toggleFavoriteDetail);

    const submitReviewBtn = document.getElementById('btn-submit-review');
    submitReviewBtn?.addEventListener('click', submitReview);

    setupStarRating();
    fetchProductDetail();
    fetchRelatedProducts();
    loadFavoriteState();
    checkReviewEligibility();
});

/* --- CHỌN SAO ĐÁNH GIÁ --- */
function setupStarRating() {
    const stars = document.querySelectorAll('#write-stars span');
    stars.forEach(star => {
        star.addEventListener('click', () => {
            selectedRating = parseInt(star.getAttribute('data-value'));
            updateStarDisplay(selectedRating);
        });
    });
}

function updateStarDisplay(rating) {
    const stars = document.querySelectorAll('#write-stars span');
    stars.forEach(star => {
        const val = parseInt(star.getAttribute('data-value'));
        if (val <= rating) {
            star.classList.add('active');
        } else {
            star.classList.remove('active');
        }
    });
}

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

        const reviews = product.reviews || [];
        renderReviewsSummary(reviews, product.rating || product.averageRating);
        renderReviews(reviews);

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
    const token = localStorage.getItem("sugarBlissToken");
    if (!token) {
        window.location.href = "/login";
        return;
    }

    const qtyInput = document.getElementById('qty-input');
    const qty = qtyInput ? qtyInput.value : 1;
    const originalText = button.textContent;

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
        
        checkReviewEligibility();
        
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

/* --- XỬ LÝ ĐÁNH GIÁ (REVIEWS API) --- */
async function checkReviewEligibility() {
    const reviewBtn = document.querySelector('.btn-submit-review');
    if (!reviewBtn) return;

    const token = localStorage.getItem("sugarBlissToken");
    if (!token) {
        disableReviewButton(reviewBtn, "Vui lòng đăng nhập để đánh giá");
        return;
    }

    try {
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

/* POST /api/products/:id/reviews */
async function submitReview() {
    const token = localStorage.getItem("sugarBlissToken");
    if (!token) {
        window.location.href = "/login";
        return;
    }

    const commentInput = document.getElementById('review-comment');
    const comment = commentInput ? commentInput.value.trim() : "";

    if (selectedRating === 0) {
        alert("Vui lòng chọn số sao đánh giá!");
        return;
    }
    if (!comment) {
        alert("Vui lòng nhập nội dung đánh giá!");
        return;
    }

    const submitBtn = document.getElementById('btn-submit-review');
    if (submitBtn) submitBtn.disabled = true;

    try {
        const response = await fetch(`${API_BASE_URL}/api/products/${currentProductId}/reviews`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                rating: selectedRating,
                comment: comment
            })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || "Gửi đánh giá thất bại.");
        }

        alert("Cảm ơn bạn đã gửi đánh giá!");
        if (commentInput) commentInput.value = "";
        selectedRating = 0;
        updateStarDisplay(0);

        fetchProductDetail();
    } catch (error) {
        alert(error.message);
    } finally {
        if (submitBtn) submitBtn.disabled = false;
    }
}

/* DELETE /api/products/:id/reviews/:reviewId */
async function deleteReview(reviewId) {
    if (!confirm("Bạn có chắc chắn muốn xóa đánh giá này?")) return;

    const token = localStorage.getItem("sugarBlissToken");
    if (!token) return;

    try {
        const response = await fetch(`${API_BASE_URL}/api/products/${currentProductId}/reviews/${reviewId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.message || "Xóa đánh giá thất bại.");
        }

        alert("Đã xóa đánh giá thành công!");
        fetchProductDetail();
    } catch (error) {
        alert(error.message);
    }
}
window.deleteReview = deleteReview;

function renderReviewsSummary(reviews = [], avgRating = 0) {
    const scoreEl = document.getElementById('summary-score');
    const countEl = document.getElementById('summary-count');

    const count = reviews.length;
    let calculatedAvg = avgRating;

    if (count > 0 && !avgRating) {
        const sum = reviews.reduce((acc, r) => acc + (r.rating || 0), 0);
        calculatedAvg = (sum / count).toFixed(1);
    } else if (typeof calculatedAvg === 'number') {
        calculatedAvg = calculatedAvg.toFixed(1);
    } else if (!calculatedAvg) {
        calculatedAvg = "0.0";
    }

    if (scoreEl) scoreEl.innerText = `${calculatedAvg}/5.0`;
    if (countEl) countEl.innerText = `Based on ${count} reviews`;
}

function renderReviews(reviews = []) {
    const reviewsList = document.getElementById('product-reviews-list');
    if (!reviewsList) return;

    if (!Array.isArray(reviews) || reviews.length === 0) {
        reviewsList.innerHTML = '<p style="color: #7c7377; text-align: center; padding: 20px;">Chưa có đánh giá nào cho sản phẩm này.</p>';
        return;
    }

    let currentUser = null;
    try {
        const userStr = localStorage.getItem("sugarBlissUser");
        if (userStr) currentUser = JSON.parse(userStr);
    } catch (e) {
        console.error("Lỗi đọc dữ liệu người dùng:", e);
    }

    reviewsList.innerHTML = reviews.map(review => {
        const reviewId = review._id || review.id;
        const userName = review.name || review.username || (review.user && (review.user.name || review.user.username)) || "Customer";
        const userInitial = userName.charAt(0).toUpperCase();
        const ratingVal = review.rating || 5;
        const ratingStars = '★'.repeat(ratingVal) + '☆'.repeat(5 - ratingVal);
        const commentText = review.comment || review.reviewText || "";

        const reviewUserId = review.user?._id || review.user || review.userId;
        const currentUserId = currentUser?._id || currentUser?.id;
        const isMyReview = currentUserId && reviewUserId && String(currentUserId) === String(reviewUserId);

        return `
            <div class="review-card">
                <div class="review-header">
                    <div class="review-user">
                        <div class="review-avatar">${userInitial}</div>
                        <div class="review-name">${escapeHtml(userName)}</div>
                    </div>
                    <div style="display: flex; align-items: center; gap: 15px;">
                        <div class="review-stars">${ratingStars}</div>
                        ${isMyReview ? `<button class="btn-delete-review" onclick="window.deleteReview('${reviewId}')">Xóa</button>` : ''}
                    </div>
                </div>
                <p class="review-text">${escapeHtml(commentText)}</p>
            </div>
        `;
    }).join('');
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}