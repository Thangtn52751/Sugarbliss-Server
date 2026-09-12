document.addEventListener('DOMContentLoaded', () => {
    fetchProducts();
});

async function fetchProducts() {
    try {
        const response = await fetch('http://localhost:3000/api/products');
        
        if (!response.ok) {
            throw new Error(`Lỗi kết nối API: ${response.status}`);
        }
        
        const data = await response.json();
        renderProducts(data);
    } catch (error) {
        console.error("Lỗi khi tải dữ liệu từ API:", error);
        document.getElementById('products-container').innerHTML = 
            '<p style="text-align: center; color: red;">Không thể tải danh sách sản phẩm. Vui lòng kiểm tra lại Server Node.js.</p>';
    }
}

function renderProducts(products) {
    const container = document.getElementById('products-container');
    container.innerHTML = '';

    // Gom nhóm sản phẩm theo tên danh mục (category)
    const grouped = products.reduce((acc, product) => {
        // Đảm bảo có giá trị category, nếu thiếu thì cho vào "Khác"
        const cat = product.category || "Other"; 
        if (!acc[cat]) acc[cat] = [];
        acc[cat].push(product);
        return acc;
    }, {});

    // Render từng nhóm ra HTML
    for (const [category, items] of Object.entries(grouped)) {
        const section = document.createElement('div');
        section.className = 'category-section';
        section.id = category.toLowerCase();

        const itemsHTML = items.map(item => {
            // MongoDB thường dùng _id thay vì id, ta bắt cả 2 trường hợp
            const productId = item._id || item.id; 
            // Đảm bảo đường dẫn ảnh hợp lệ
            const imageSrc = item.image || "/assets/images/cake1.png"; 
            
            return `
                <div class="product-card">
                    <img src="${imageSrc}" alt="${item.name}">
                    <h3>${item.name}</h3>
                    <button class="btn-order" onclick="addToCart('${productId}')">Order Now</button>
                </div>
            `;
        }).join('');

        section.innerHTML = `
            <h2>${category}</h2>
            <div class="products-grid-layout">
                ${itemsHTML}
            </div>
        `;
        
        container.appendChild(section);
    }
}

function addToCart(productId) {
    alert("Thêm sản phẩm thành công! ID = " + productId);
}