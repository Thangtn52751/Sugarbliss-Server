// Lấy mã ID sản phẩm từ URL (Ví dụ: ?id=650a1b2c)
const urlParams = new URLSearchParams(window.location.search);
const currentProductId = urlParams.get('id');
const API_BASE_URL = 'http://localhost:3000';

document.addEventListener('DOMContentLoaded', () => {
    if (!currentProductId) {
        document.getElementById('product-title-price').innerText = "Lỗi: URL thiếu ID sản phẩm!";
        return;
    }
    fetchProductDetail();
    fetchRelatedProducts();
});

// Hàm xử lý đổi ảnh Thumbnail
function changeImage(src) {
    document.getElementById('main-product-image').src = src;
}

// Hàm xử lý số lượng
function updateQty(change) {
    const input = document.getElementById('qty-input');
    let newVal = parseInt(input.value) + change;
    if (newVal >= 1) input.value = newVal;
}

// 1. GỌI API LẤY CHI TIẾT SẢN PHẨM TỪ DATABASE
async function fetchProductDetail() {
    try {
        const token = localStorage.getItem("sugarBlissToken");
        const headers = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;

        // Gọi API với ID lấy từ thanh địa chỉ
        const response = await fetch(`${API_BASE_URL}/api/products/${currentProductId}`, { headers });
        
        if (!response.ok) {
            throw new Error("Không tìm thấy sản phẩm trong Database");
        }

        const data = await response.json();
        const product = data.product || data.data || data; // Tương thích nhiều cấu trúc JSON

        // Format giá tiền Việt Nam
        const priceStr = product.price ? new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(product.price) : "Liên hệ";
        
        // Đổ dữ liệu vào các thẻ HTML đã được đánh dấu ID
        document.getElementById('product-title-price').innerText = `${product.name} - ${priceStr}`;
        
        const imgUrl = product.image || "/assets/images/cake1.png";
        document.getElementById('main-product-image').src = imgUrl.startsWith('/') ? `${API_BASE_URL}${imgUrl}` : imgUrl;
        
        document.getElementById('product-desc').innerText = product.description || "Chưa có mô tả cho sản phẩm này.";
        document.getElementById('product-weight').innerText = product.weightGram ? `${product.weightGram}g` : "Đang cập nhật";
        document.getElementById('product-exp').innerText = product.shelfLifeDays ? `${product.shelfLifeDays} days` : "Đang cập nhật";
        
        if (product.ingredients && Array.isArray(product.ingredients)) {
            document.getElementById('product-ingredients').innerText = product.ingredients.join(', ');
        } else {
            document.getElementById('product-ingredients').innerText = "Đang cập nhật";
        }

    } catch (error) {
        console.error("Lỗi:", error);
        document.getElementById('product-title-price').innerText = "Lỗi kết nối dữ liệu: " + error.message;
    }
}

// 2. GỌI API LẤY SẢN PHẨM GỢI Ý
async function fetchRelatedProducts() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/products?limit=5`);
        if (!response.ok) return;

        const data = await response.json();
        const products = Array.isArray(data.products) ? data.products : data;
        
        // Lọc bỏ sản phẩm hiện tại và chỉ lấy 5 cái đầu tiên
        const related = products.filter(p => (p._id || p.id) !== currentProductId).slice(0, 5);
        
        const container = document.getElementById('related-products');
        container.innerHTML = related.map(item => {
            const itemId = item._id || item.id;
            const itemImg = item.image || "/assets/images/cake2.png";
            const fullImg = itemImg.startsWith('/') ? `${API_BASE_URL}${itemImg}` : itemImg;
            
            return `
                <div class="related-card" style="cursor:pointer;" onclick="window.location.href='/pages/product-detail.html?id=${itemId}'">
                    <img src="${fullImg}" alt="${item.name}">
                    <h4>${item.name}</h4>
                </div>
            `;
        }).join('');
    } catch (error) {
        console.error("Lỗi tải sản phẩm gợi ý:", error);
    }
}

// 3. XỬ LÝ ĐẶT HÀNG TỪ TRANG CHI TIẾT
async function createOrderFromDetail() {
    const token = localStorage.getItem("sugarBlissToken");
    if (!token) {
        alert("Vui lòng đăng nhập để mua hàng!");
        window.location.href = "/login";
        return;
    }

    const qty = document.getElementById('qty-input').value;
    
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

        if (!response.ok) throw new Error("Lỗi khi tạo đơn hàng");
        alert(`Đặt hàng thành công ${qty} sản phẩm!`);
    } catch (error) {
        alert("Không thể đặt hàng: " + error.message);
    }
}