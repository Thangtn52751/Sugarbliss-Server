/**
 * Sugar Bliss - He thong da ngon ngu (i18n) nhe, thuan JavaScript.
 *
 * Cach dung:
 *  1. Nap file nay TRUOC shared-components.js trong moi trang.
 *  2. Danh dau phan tu can dich bang thuoc tinh:
 *       - data-i18n="key"            -> dich phan text ben trong
 *       - data-i18n-attr="placeholder:key,title:key2" -> dich thuoc tinh
 *  3. Goi window.SugarI18n.apply() sau khi DOM/thanh phan duoc render.
 *
 * Ngon ngu dang chon duoc luu trong localStorage voi khoa "sugarBlissLang".
 */
(function () {
    const STORAGE_KEY = "sugarBlissLang";
    const DEFAULT_LANG = "vi";
    const SUPPORTED = ["vi", "en"];

    // Tu dien dich. Them key moi o day khi mo rong sang trang khac.
    const dictionary = {
        "voucher.label": { vi: "Mã giảm giá", en: "Discount code" },
        "voucher.placeholder": { vi: "Nhập mã", en: "Enter code" },
        "voucher.apply": { vi: "Áp dụng", en: "Apply" },
        "voucher.remove": { vi: "Bỏ voucher", en: "Remove voucher" },
        "voucher.owned": { vi: "Voucher của tôi", en: "My vouchers" },
        "voucher.subtotal": { vi: "Tiền sản phẩm", en: "Subtotal" },
        "voucher.discount": { vi: "Giảm giá sản phẩm", en: "Product discount" },
        "voucher.delivery": { vi: "Phí giao hàng", en: "Delivery" },
        "voucher.total": { vi: "Tổng cộng", en: "Total" },
        // ----- Header / Navigation -----
        "nav.home": { vi: "Trang chủ", en: "Home" },
        "nav.about": { vi: "Về chúng tôi", en: "About Us" },
        "nav.menu": { vi: "Thực đơn", en: "Menu" },
        "nav.specialOrders": { vi: "Đặt hàng đặc biệt", en: "Special Orders" },
        "nav.contact": { vi: "Liên hệ", en: "Contact" },
        "header.search": { vi: "Tìm kiếm", en: "Search" },
        "header.cart": { vi: "Giỏ hàng", en: "Cart" },
        "header.account": { vi: "Tài khoản", en: "Account" },

        // ----- Footer -----
        "footer.tagline": { vi: "Trọn vẹn ngọt ngào trong từng miếng bánh.", en: "Crafting bliss in every single bite." },
        "footer.visitUs": { vi: "Ghé thăm chúng tôi", en: "Visit Us" },

        // ----- Trang About Us -----
        "about.heroEyebrow": { vi: "Tiệm bánh Sugar Bliss", en: "Sugar Bliss Bakery" },
        "about.heroTitle": { vi: "Ngọt ngào từ trái tim", en: "Sweetness from the heart" },
        "about.heroSubtitle": { vi: "Mỗi chiếc bánh là một câu chuyện yêu thương.", en: "Every cake tells a story of love." },
        "about.title": { vi: "Về chúng tôi", en: "About Us" },
        "about.intro": {
            vi: "Sugar Bliss là tiệm bánh ngọt mang đến những chiếc bánh tươi ngon, được làm thủ công mỗi ngày từ nguyên liệu chọn lọc. Chúng tôi tin rằng mỗi chiếc bánh đều có thể mang lại niềm vui và sự ngọt ngào cho cuộc sống.",
            en: "Sugar Bliss is a bakery that brings you fresh, delicious cakes handcrafted every day from carefully selected ingredients. We believe every cake can bring a little joy and sweetness to life."
        },
        "about.storyTag": { vi: "Câu chuyện của chúng tôi", en: "Our Story" },
        "about.storyTitle": { vi: "Bắt đầu từ một căn bếp nhỏ", en: "It started in a small kitchen" },
        "about.storyText": {
            vi: "Sugar Bliss ra đời từ niềm đam mê làm bánh của những người yêu thích sự ngọt ngào. Từ căn bếp nhỏ với vài chiếc khuôn bánh, chúng tôi dần chinh phục trái tim khách hàng bằng hương vị tươi mới và sự tận tâm. Đến hôm nay, Sugar Bliss tự hào đồng hành cùng hàng nghìn khoảnh khắc đáng nhớ của khách hàng.",
            en: "Sugar Bliss was born from a passion for baking shared by people who love all things sweet. From a small kitchen with just a few baking tins, we gradually won our customers' hearts with fresh flavors and genuine care. Today, Sugar Bliss is proud to be part of thousands of memorable moments."
        },
        "about.statCakes": { vi: "chiếc bánh đã trao gửi", en: "cakes delivered" },
        "about.statCustomers": { vi: "khách hàng hài lòng", en: "happy customers" },
        "about.statRating": { vi: "đánh giá trung bình", en: "average rating" },
        "about.statIngredients": { vi: "nguyên liệu chọn lọc", en: "selected ingredients" },
        "about.valuesTitle": { vi: "Vì sao chọn Sugar Bliss?", en: "Why choose Sugar Bliss?" },
        "about.value1Title": { vi: "Tươi mới mỗi ngày", en: "Fresh every day" },
        "about.value1Text": {
            vi: "Bánh được làm thủ công mỗi ngày, không chất bảo quản, luôn thơm ngon như mới ra lò.",
            en: "Cakes are handcrafted daily with no preservatives, always as fresh as straight from the oven."
        },
        "about.value2Title": { vi: "Tận tâm từng chi tiết", en: "Care in every detail" },
        "about.value2Text": {
            vi: "Nhận làm bánh theo yêu cầu, thiết kế riêng theo chủ đề và sở thích của bạn.",
            en: "We take custom orders, designed around your theme and personal taste."
        },
        "about.value3Title": { vi: "Giao đúng hẹn", en: "Delivered on time" },
        "about.value3Text": {
            vi: "Bánh đến tay bạn vẹn nguyên, đúng giờ, sẵn sàng cho mọi khoảnh khắc đặc biệt.",
            en: "Your cake arrives intact and on time, ready for every special moment."
        },
        "about.missionTag": { vi: "Sứ mệnh", en: "Mission" },
        "about.missionTitle": { vi: "Sứ mệnh của chúng tôi", en: "Our Mission" },
        "about.missionText": {
            vi: "Sứ mệnh của chúng tôi là mang đến những chiếc bánh chất lượng cao, an toàn và đẹp mắt, giúp mọi khoảnh khắc của bạn thêm trọn vẹn. Chúng tôi luôn đặt sự hài lòng của khách hàng lên hàng đầu.",
            en: "Our mission is to deliver high-quality, safe and beautiful cakes that make every moment of yours complete. Customer satisfaction always comes first."
        },
        "about.promiseTag": { vi: "Cam kết", en: "Promise" },
        "about.promiseTitle": { vi: "Cam kết của chúng tôi", en: "Our Promise" },
        "about.promiseText": {
            vi: "Chúng tôi cam kết sử dụng nguyên liệu tươi mới, quy trình chế biến sạch sẽ và giao hàng đúng hẹn. Sự tin tưởng của bạn là động lực để chúng tôi không ngừng hoàn thiện.",
            en: "We are committed to using fresh ingredients, a clean preparation process and on-time delivery. Your trust drives us to keep improving every day."
        },
        "about.ctaTitle": { vi: "Sẵn sàng nếm thử vị ngọt của Sugar Bliss?", en: "Ready to taste the sweetness of Sugar Bliss?" },
        "about.ctaSubtitle": {
            vi: "Khám phá thực đơn hoặc liên hệ để được tư vấn làm bánh theo yêu cầu.",
            en: "Explore our menu or reach out for custom cake advice."
        },
        "about.ctaMenu": { vi: "Xem thực đơn", en: "View Menu" },
        "about.ctaButton": { vi: "Liên hệ ngay", en: "Contact Us" },

        // ----- Trang chu (Home) -----
        "home.heroTitle": {
            vi: "Mang đến cho bạn món tráng miệng ngọt ngào trong từng miếng bánh",
            en: "Deliver You A Blissful Dessert in Every Bite"
        },
        "home.heroText": {
            vi: "Bánh ngọt, bánh nướng và những món đặt riêng được làm mới mỗi ngày với gam màu dịu nhẹ, vị ngọt thanh và một chút niềm vui trong từng chi tiết.",
            en: "Freshly baked cakes, pastries, and custom treats made with soft colors, gentle sweetness, and a little joy in every detail."
        },
        "home.aboutButton": { vi: "Về chúng tôi", en: "About Us" },
        "home.bestSellersPrefix": { vi: "Khám phá những", en: "Check Out Our" },
        "home.bestSellersHighlight": { vi: "món bán chạy nhất", en: "Best Sellers" },
        "home.productBerry": { vi: "Bánh sừng bò dâu", en: "Berry Croissants" },
        "home.productBirthday": { vi: "Bánh sinh nhật", en: "Birthday Cakes" },
        "home.productMacaron": { vi: "Bánh Macaron ngọt ngào", en: "Sweet Macarons" },
        "home.productParty": { vi: "Món tráng miệng tiệc", en: "Party Desserts" },
        "home.seeMore": { vi: "Xem thêm", en: "See More" },
        "home.specialTitle": { vi: "Đặt hàng đặc biệt", en: "Special Orders" },
        "home.specialText": {
            vi: "Bạn đang chuẩn bị cho một buổi sinh nhật, kỷ niệm hay một buổi tiệc ấm cúng? Hãy cho chúng tôi biết chủ đề, hương vị và màu sắc yêu thích của bạn, chúng tôi sẽ làm nên chiếc bánh dành riêng cho bạn.",
            en: "Planning a birthday, anniversary, or cozy celebration? Tell us your theme, flavors, and favorite colors, and we will craft a dessert made just for you."
        },
        "home.placeOrder": { vi: "Đặt hàng ngay", en: "Place An Order" },
        "home.feedbackTitle": { vi: "Phản hồi từ khách hàng", en: "Our Customers' Feedback" },
        "home.feedbackQuote": {
            vi: "Chiếc bánh thật đẹp, mềm xốp và ngọt vừa phải. Nó khiến bàn tiệc sinh nhật của chúng tôi trở nên thật đặc biệt.",
            en: "The cake was beautiful, fluffy, and perfectly sweet. It made our birthday table feel extra special."
        },

        // ----- Trang Lien he (Contact) -----
        "contact.title": { vi: "Hãy kết nối với chúng tôi", en: "Let’s Get In Touch" },
        "contact.intro1": {
            vi: "Chúng tôi luôn sẵn lòng lắng nghe bạn. Dù là thắc mắc về sản phẩm, góp ý hay một lời chào, hãy để lại lời nhắn và đội ngũ Sugar Bliss sẽ phản hồi bạn sớm nhất.",
            en: "Lorem ipsum dolor sit amet consectetur. Faucibus nulla dui ut nulla nec viverra enim luctus ut. Venenatis urna leo facilisi facilisi iaculis pellentesque at purus."
        },
        "contact.intro2": {
            vi: "Bạn cũng có thể ghé thăm cửa hàng của chúng tôi trong giờ mở cửa, hoặc gọi điện trực tiếp để được tư vấn về các đơn đặt hàng và dịch vụ. Chúng tôi rất mong được phục vụ bạn.",
            en: "Neque erat sit sed venenatis platea volutpat justo tristique. Sagittis sagittis magna tellus magna ridiculus parturient. Egestas tempor lobortis vitae amet facilisi diam nec metus imperdiet. At proin et enim fermentum. Erat blandit nibh cras consequat cras mauris. In eu turpis sed dolor sit dapibus magnis arcu dictum."
        },
        "contact.namePlaceholder": { vi: "Tên của bạn", en: "Your Name" },
        "contact.emailPlaceholder": { vi: "Email của bạn", en: "Your Email" },
        "contact.messagePlaceholder": { vi: "Lời nhắn của bạn", en: "Your Message" },
        "contact.submit": { vi: "Gửi", en: "Submit" },

        // ----- Trang Dat hang dac biet (Special Orders) -----
        "special.title": { vi: "Mẫu đặt hàng đặc biệt", en: "Special Order Form" },
        "special.subtitle": {
            vi: "Vui lòng điền vào mẫu dưới đây, đội ngũ của chúng tôi sẽ liên hệ lại với bạn trong vòng 24 giờ.",
            en: "Please fill out the form and someone from our team will get back to you within 24 hours."
        },
        "special.emailPlaceholder": { vi: "Email", en: "Email" },
        "special.phonePlaceholder": { vi: "Số điện thoại", en: "Phone Number" },
        "special.namePlaceholder": { vi: "Họ và tên", en: "Name" },
        "special.deliveryDefault": { vi: "Chọn hình thức nhận hàng", en: "Choose a delivery option" },
        "special.deliveryPickup": { vi: "Nhận tại cửa hàng", en: "Store Pickup" },
        "special.deliveryLocal": { vi: "Giao hàng nội thành", en: "Local Delivery" },
        "special.deliveryShipping": { vi: "Giao hàng toàn quốc", en: "Nationwide Shipping" },
        "special.address1Placeholder": { vi: "Địa chỉ 1", en: "Address 1" },
        "special.address2Placeholder": { vi: "Địa chỉ 2", en: "Address 2" },
        "special.cityPlaceholder": { vi: "Thành phố", en: "City" },
        "special.zipPlaceholder": { vi: "Mã bưu chính", en: "Zip Code" },
        "special.orderDetailsPlaceholder": { vi: "Chi tiết đơn hàng", en: "Order Details" },
        "special.submit": { vi: "Gửi", en: "Submit" },

        // ----- Trang Dang nhap (Login) -----
        "login.emailPlaceholder": { vi: "Email của bạn", en: "Your Email" },
        "login.passwordPlaceholder": { vi: "Mật khẩu của bạn", en: "Your Password" },
        "login.forgot": { vi: "Quên mật khẩu?", en: "Forgot Your Password?" },
        "login.submit": { vi: "Đăng nhập", en: "Submit" },
        "login.newHere": { vi: "Bạn mới biết đến chúng tôi?", en: "New here?" },
        "login.registerNow": { vi: "Đăng ký ngay", en: "Register Now" },

        // ----- Trang Dang ky (Register) -----
        "register.emailPlaceholder": { vi: "Email của bạn", en: "Your Email" },
        "register.passwordPlaceholder": { vi: "Mật khẩu của bạn", en: "Your Password" },
        "register.confirmPlaceholder": { vi: "Xác nhận mật khẩu", en: "Confirm Your Password" },
        "register.submit": { vi: "Đăng ký", en: "Submit" },
        "register.haveAccount": { vi: "Bạn đã có tài khoản?", en: "Already Have A Account?" },
        "register.loginNow": { vi: "Đăng nhập ngay", en: "Login Now" },

        // ----- Trang San pham / Thuc don (Products / Menu) -----
        "products.bannerTitle": { vi: "Khám phá các sản phẩm trực tuyến của chúng tôi", en: "Discover Our Online Products" },
        "products.loginPrompt": { vi: "Vui lòng đăng nhập để xem sản phẩm của chúng tôi.", en: "Please log in to view our products." },
        "products.loginNow": { vi: "Đăng nhập ngay", en: "Login Now" },
        "products.loading": { vi: "Đang tải sản phẩm...", en: "Loading products..." },
        "products.empty": { vi: "Hiện chưa có sản phẩm nào.", en: "No products are available yet." },
        "products.loadError": { vi: "Không thể tải sản phẩm.", en: "Cannot load products." },
        "products.loginAgain": { vi: "Đăng nhập lại", en: "Login Again" },
        "products.viewDetail": { vi: "Xem chi tiết", en: "View Detail" },
        "products.outOfStock": { vi: "Hết hàng", en: "Out of stock" },
        "products.unavailable": { vi: "Tạm ngừng bán", en: "Unavailable" },
        "products.addToCart": { vi: "Thêm vào giỏ", en: "Add To Cart" },
        "products.minPrice": { vi: "Giá từ (VND)", en: "Price from (VND)" },
        "products.maxPrice": { vi: "Giá đến (VND)", en: "Price to (VND)" },
        "products.sortLabel": { vi: "Sắp xếp", en: "Sort by" },
        "products.sortDefault": { vi: "Đề xuất", en: "Recommended" },
        "products.sortLowHigh": { vi: "Giá: Thấp đến cao", en: "Price: Low to high" },
        "products.sortHighLow": { vi: "Giá: Cao đến thấp", en: "Price: High to low" },
        "products.applyFilter": { vi: "Lọc giá", en: "Apply" },
        "products.clearFilter": { vi: "Xóa bộ lọc", en: "Clear filters" },
        "products.priceRangeError": { vi: "Giá từ không được lớn hơn giá đến.", en: "Price from must not exceed Price to." },
        "products.priceInputError": { vi: "Nhập giá VND nguyên và không âm.", en: "Enter a non-negative whole VND amount." },
        "products.resultCount": { vi: "{count} sản phẩm", en: "{count} products" },
        "products.resultCountOne": { vi: "{count} sản phẩm", en: "{count} product" },
        "products.noMatches": { vi: "Không có sản phẩm phù hợp bộ lọc.", en: "No products match these filters." },
        "products.allCategories": { vi: "Tất cả sản phẩm", en: "All products" },
        "products.loadMore": { vi: "Xem thêm", en: "Load more" },
        "products.retry": { vi: "Thử lại", en: "Try again" },
        "products.orderNow": { vi: "Đặt ngay", en: "Order Now" },
        "products.ordering": { vi: "Đang đặt...", en: "Ordering..." },
        "products.ordered": { vi: "Đã đặt", en: "Ordered" },
        "products.orderError": { vi: "Không thể tạo đơn hàng.", en: "Cannot create order." },
        "products.contactPrice": { vi: "Liên hệ để biết giá", en: "Contact for price" },
        "products.defaultName": { vi: "Sản phẩm Sugar Bliss", en: "Sugar Bliss Product" },
        "products.adding": { vi: "Đang thêm...", en: "Adding..." },
        "products.added": { vi: "Đã thêm", en: "Added" },

        // Ten danh muc pho bien (map san). Danh muc khac lay tu DB se giu nguyen.
        "category.Cookies": { vi: "Bánh quy", en: "Cookies" },
        "category.Cake": { vi: "Bánh kem", en: "Cake" },
        "category.Macaroons": { vi: "Bánh Macaron", en: "Macaroons" },
        "category.Waffles": { vi: "Bánh kẹp", en: "Waffles" },
        "category.Snacks": { vi: "Đồ ăn nhẹ", en: "Snacks" },
        "category.Beverages": { vi: "Đồ uống", en: "Beverages" },
        "category.Other": { vi: "Khác", en: "Other" },

        // ----- Quen mat khau (Forgot Password) -----
        "forgot.title": { vi: "Quên mật khẩu?", en: "Forgot Password?" },
        "forgot.subtitle": { vi: "Vui lòng nhập email của bạn để chúng tôi gửi mã xác thực.", en: "Please enter your email so we can send you a code." },
        "forgot.emailPlaceholder": { vi: "Email của bạn", en: "Your Email" },
        "forgot.submit": { vi: "Gửi", en: "Submit" },

        // ----- Xac thuc OTP (OTP Verification) -----
        "otp.title": { vi: "Nhập mã xác thực", en: "Enter Code" },
        "otp.subtitle": { vi: "Chúng tôi đã gửi mã xác thực gồm 6 chữ số đến email đã đăng ký của bạn.", en: "We sent a 6-digit verification code to your registered email address." },
        "otp.verify": { vi: "Xác thực mã", en: "Verify Code" },
        "otp.noCode": { vi: "Bạn chưa nhận được mã?", en: "Didn't receive the code?" },
        "otp.resend": { vi: "Gửi lại ngay", en: "Resend Now" },

        // ----- Mat khau moi (New Password) -----
        "newpass.title": { vi: "Mật khẩu mới", en: "New Password" },
        "newpass.subtitle": { vi: "Đặt mật khẩu mạnh để bảo vệ tài khoản Sugar Bliss của bạn.", en: "Set a strong password to secure your Sugar Bliss account." },
        "newpass.passwordPlaceholder": { vi: "Mật khẩu mới", en: "New Password" },
        "newpass.confirmPlaceholder": { vi: "Xác nhận mật khẩu", en: "Confirm Password" },
        "newpass.save": { vi: "Lưu & Tiếp tục", en: "Save & Continue" },

        // ----- Gio hang (Cart) -----
        "cart.title": { vi: "Giỏ hàng ngọt ngào của bạn", en: "Your Sweet Cart" },
        "cart.subtitle": { vi: "Xem lại lựa chọn bánh ngọt của bạn trước khi thanh toán.", en: "Review your delicious selection of treats before checkout." },
        "cart.continue": { vi: "← Tiếp tục xem các món tráng miệng", en: "← Continue browsing desserts" },
        "cart.summary": { vi: "Tóm tắt đơn hàng", en: "Order Summary" },
        "cart.deliveryMethod": { vi: "Phương thức giao hàng", en: "Delivery method" },
        "cart.subtotal": { vi: "Tạm tính", en: "Subtotal" },
        "cart.estimatedDelivery": { vi: "Phí giao hàng ước tính", en: "Estimated Delivery" },
        "cart.free": { vi: "Miễn phí", en: "Free" },
        "cart.total": { vi: "Tổng cộng", en: "Total" },
        "cart.checkout": { vi: "Tiến hành thanh toán", en: "Proceed To Checkout" },
        "cart.checkoutNote": { vi: "Thanh toán an toàn với thông tin tài khoản đã lưu của bạn.", en: "Secure checkout with your saved account details." },

        // ----- Lich su don hang (Order History) -----
        "orders.breadcrumb": { vi: "Bảng điều khiển tài khoản / Lịch sử", en: "Account Dashboard / History" },
        "orders.title": { vi: "Lịch sử đơn hàng", en: "Order History" },
        "orders.supportTitle": { vi: "Hỗ trợ tận tình", en: "Concierge Support" },
        "orders.supportText": { vi: "Bạn có thắc mắc về đơn hàng, đổi trả hay yêu cầu đặt riêng? Đội ngũ của chúng tôi luôn sẵn sàng hỗ trợ.", en: "Have questions about an order, return, or custom request? Our team is ready to help." },
        "orders.chatAdvisor": { vi: "Trò chuyện với tư vấn viên", en: "Chat with advisor" },
        "orders.searchPlaceholder": { vi: "Tìm đơn hàng theo tên món hoặc mã đơn", en: "Search orders by item or order number" },

        // ----- Trang ca nhan (Profile) -----
        "profile.personalDetails": { vi: "Thông tin cá nhân", en: "Personal Details" },
        "profile.personalSubtitle": { vi: "Cập nhật thông tin tài khoản và địa chỉ giao hàng của bạn.", en: "Update your account details and delivery address." },
        "profile.firstName": { vi: "Tên", en: "First Name" },
        "profile.lastName": { vi: "Họ", en: "Last Name" },
        "profile.email": { vi: "Địa chỉ email", en: "Email Address" },
        "profile.phone": { vi: "Số điện thoại", en: "Phone Number" },
        "profile.address": { vi: "Địa chỉ", en: "Address" },
        "profile.dob": { vi: "Ngày sinh", en: "Date of Birth" },
        "profile.save": { vi: "Lưu thay đổi", en: "Save Changes" },
        "profile.cancel": { vi: "Hủy", en: "Cancel" },
        "profile.recentOrders": { vi: "Đơn hàng gần đây", en: "Recent Orders" },
        "profile.viewAll": { vi: "Xem tất cả", en: "View All" },
        "profile.favorites": { vi: "Yêu thích của tôi", en: "My Favorites" },

        // ----- Chi tiet san pham (Product Detail) -----
        "detail.label": { vi: "Chi tiết sản phẩm", en: "Product Detail" },
        "detail.weight": { vi: "Khối lượng:", en: "Weight:" },
        "detail.exp": { vi: "Hạn sử dụng:", en: "Expiration date:" },
        "detail.ingredient": { vi: "Thành phần:", en: "Ingredient:" },
        "detail.description": { vi: "Mô tả", en: "Description" },
        "detail.favourites": { vi: "♥ Yêu thích", en: "♥ Favourites" },
        "detail.addToCart": { vi: "Thêm vào giỏ", en: "Add To Cart" },
        "detail.relatedTitle": { vi: "Sản phẩm bạn có thể thích", en: "Product you may like" },
        "detail.reviewsTitle": { vi: "Đánh giá của khách hàng", en: "Customer Reviews" },
        "detail.reviewsBasedOn": { vi: "Dựa trên 124 đánh giá", en: "Based on 124 reviews" },
        "detail.writeReview": { vi: "Viết đánh giá", en: "Write a Review" },
        "detail.rating": { vi: "Chạm vào sao để đánh giá:", en: "Tap a star to rate:" },
        "detail.submitReview": { vi: "Gửi đánh giá", en: "Submit Review" },
        "detail.reviewCount": { vi: "Dựa trên {count} đánh giá", en: "Based on {count} reviews" },
        "detail.reviewCountOne": { vi: "Dựa trên {count} đánh giá", en: "Based on {count} review" },
        "detail.reviewPhotos": { vi: "Ảnh (không bắt buộc)", en: "Photos (optional)" },
        "detail.reviewSending": { vi: "Đang gửi...", en: "Sending..." },
        "detail.reviewChecking": { vi: "Đang kiểm tra quyền đánh giá...", en: "Checking review eligibility..." },
        "detail.reviewLogin": { vi: "Đăng nhập để đánh giá sản phẩm này.", en: "Sign in to review this product." },
        "detail.reviewPurchaseRequired": { vi: "Bạn cần đặt hàng thành công sản phẩm này để đánh giá. Thanh toán online cần được xác nhận.", en: "Reviewing is available after a successful order for this product. Online payment must be confirmed." },
        "detail.reviewAlreadyReviewed": { vi: "Bạn đã đánh giá sản phẩm này.", en: "You have already reviewed this product." },
        "detail.reviewCheckError": { vi: "Không thể kiểm tra quyền đánh giá. Vui lòng thử lại.", en: "Cannot check review eligibility. Please try again." },
        "detail.reviewRetry": { vi: "Thử lại", en: "Try again" },
        "detail.reviewRemovePhoto": { vi: "Bỏ ảnh", en: "Remove photo" },
        "detail.reviewClearPhotos": { vi: "Bỏ tất cả ảnh", en: "Remove photos" },
        "detail.reviewPhotoError": { vi: "Chọn tối đa 5 ảnh JPG, PNG hoặc WebP, mỗi ảnh không quá 5 MB.", en: "Choose up to 5 JPG, PNG or WebP photos, each no larger than 5 MB." },
        "detail.reviewInputError": { vi: "Chọn số sao và viết đánh giá từ 1 đến 1000 ký tự.", en: "Select a rating and write a review of 1 to 1000 characters." },
        "detail.reviewSubmitError": { vi: "Không thể gửi đánh giá.", en: "Cannot submit review." },
        "detail.reviewRefreshError": { vi: "Đã lưu đánh giá nhưng chưa tải lại được danh sách. Vui lòng tải lại trang.", en: "Review saved, but the list could not be refreshed. Reload the page." },
        "detail.reviewThanks": { vi: "Cảm ơn bạn đã gửi đánh giá.", en: "Thank you for your review." },
        "detail.reviewDeleteConfirm": { vi: "Xóa đánh giá này?", en: "Delete this review?" },
        "detail.reviewDeleted": { vi: "Đã xóa đánh giá.", en: "Review deleted." },
        "detail.reviewDelete": { vi: "Xóa", en: "Delete" },
        "detail.reviewPhoto": { vi: "Ảnh đánh giá của khách hàng", en: "Customer review photo" },
        "detail.reviewEmpty": { vi: "Chưa có đánh giá nào.", en: "No reviews yet." },
        // Deep i18n - chi tiet san pham (dong / fallback)
        "detail.saved": { vi: "♥ Đã lưu", en: "♥ Saved" },
        "detail.favRemoving": { vi: "Đang bỏ...", en: "Removing..." },
        "detail.favSaving": { vi: "Đang lưu...", en: "Saving..." },
        "detail.daysUnit": { vi: "ngày", en: "days" },
        "detail.updating": { vi: "Đang cập nhật", en: "Updating" },
        "detail.descEmpty": { vi: "Chưa có mô tả cho sản phẩm này.", en: "No description for this product yet." },
        "detail.relatedEmpty": { vi: "Không có sản phẩm gợi ý nào.", en: "No suggested products." },
        "detail.adding": { vi: "Đang thêm...", en: "Adding..." },
        "detail.added": { vi: "Đã thêm vào giỏ", en: "Added to Cart" },
        "detail.errMissingId": { vi: "Lỗi: URL thiếu ID sản phẩm!", en: "Error: product ID missing from URL!" },
        "detail.errData": { vi: "Lỗi dữ liệu: ", en: "Data error: " },
        "detail.reviewsSubtitle": { vi: "Trải nghiệm và cảm nhận thật từ những tín đồ hảo ngọt.", en: "Real experiences and feedback from our sweet lovers" },
        "detail.reviewCountZero": { vi: "Dựa trên 0 đánh giá", en: "Based on 0 reviews" },
        "detail.reviewPlaceholder": { vi: "Chia sẻ cảm nhận của bạn về sản phẩm này...", en: "Write your thoughts about this product..." },
        "detail.reviewPhotoHint": { vi: "JPG, PNG hoặc WebP tối đa 5MB (tối đa 5 ảnh)", en: "JPG, PNG or WebP up to 5MB (Max 5)" },
        "detail.reviewModalAlt": { vi: "Ảnh đánh giá phóng to", en: "Enlarged review photo" },
        "detail.viewImage": { vi: "Xem ảnh {index} / {total}", en: "View image {index} of {total}" },

        // ----- Deep i18n: Header / Search / Chat (shared-components) -----
        "header.searchPlaceholder": { vi: "Tìm bánh và món ngọt", en: "Search cakes and treats" },
        "header.clearSearch": { vi: "Xóa tìm kiếm", en: "Clear search" },
        "header.home": { vi: "Trang chủ Sugar Bliss", en: "Sugar Bliss home" },
        "header.mainNav": { vi: "Điều hướng chính", en: "Main navigation" },
        "header.searchProducts": { vi: "Tìm sản phẩm", en: "Search products" },
        "header.suggestions": { vi: "Gợi ý sản phẩm", en: "Product suggestions" },
        "header.langSwitch": { vi: "Ngôn ngữ / Language", en: "Language / Ngôn ngữ" },
        "search.inStock": { vi: "Còn hàng", en: "In stock" },
        "search.treatFallback": { vi: "Món ngọt", en: "Treat" },
        "search.logIn": { vi: "đăng nhập", en: "log in" },
        "search.viewDetails": { vi: "Xem chi tiết", en: "View details" },
        "search.hint": { vi: "Nhập ít nhất 2 ký tự để tìm kiếm.", en: "Type at least 2 characters to search." },
        "search.searching": { vi: "Đang tìm sản phẩm...", en: "Searching products..." },
        "search.unavailable": { vi: "Tìm kiếm tạm thời không khả dụng. Vui lòng thử lại.", en: "Search is unavailable. Please try again." },
        "search.noMatches": { vi: "Không tìm thấy sản phẩm phù hợp.", en: "No matching products found." },
        "search.pleasePrefix": { vi: "Vui lòng ", en: "Please " },
        "search.toSearchSuffix": { vi: " để tìm sản phẩm.", en: " to search products." },
        "chat.inputPlaceholder": { vi: "Hỏi tôi bất cứ điều gì...", en: "Ask me anything..." },
        "chat.close": { vi: "Đóng trò chuyện", en: "Close chat" },
        "chat.open": { vi: "Mở Trợ lý AI", en: "Open AI Assistant" },
        "chat.inputAria": { vi: "Nhắn cho Trợ lý Sugar Bliss", en: "Message to Sugar Bliss Assistant" },
        "chat.greeting": { vi: "Chào bạn! Tôi có thể giúp bạn tìm chiếc bánh hoàn hảo hôm nay không?", en: "Hi! How can I help you find the perfect cake today?" },
        "chat.send": { vi: "Gửi", en: "Send" },
        "chat.viewDetails": { vi: "Xem chi tiết {name}", en: "View {name} details" },
        "chat.outOfStock": { vi: "Hết hàng", en: "Out of stock" },
        "chat.contactPrice": { vi: "Liên hệ để biết giá", en: "Contact for price" },
        "chat.defaultProduct": { vi: "Sản phẩm Sugar Bliss", en: "Sugar Bliss product" },
        "chat.loginPrompt": { vi: "Vui lòng đăng nhập để trò chuyện với Trợ lý Sugar Bliss.", en: "Please log in to chat with Sugar Bliss Assistant." },
        "chat.logIn": { vi: "Đăng nhập", en: "Log in" },
        "chat.errUnavailable": { vi: "Dịch vụ AI tạm thời không khả dụng. Vui lòng thử lại sau.", en: "The AI service is temporarily unavailable. Please try again later." },
        "chat.errAuth": { vi: "Dịch vụ AI không thể xác thực. Vui lòng liên hệ Sugar Bliss.", en: "The AI service could not authenticate. Please contact Sugar Bliss." },
        "chat.errTooMany": { vi: "Quá nhiều yêu cầu trò chuyện. Vui lòng chờ một lát rồi thử lại.", en: "Too many chat requests. Please wait a moment before trying again." },
        "chat.errTimeout": { vi: "Yêu cầu AI đã hết thời gian chờ. Vui lòng thử lại.", en: "The AI request timed out. Please try again." },
        "chat.errForbidden": { vi: "Tài khoản này không thể sử dụng trò chuyện. Vui lòng liên hệ Sugar Bliss.", en: "This account cannot use chat. Please contact Sugar Bliss." },
        "chat.errBadRequest": { vi: "Không thể gửi tin nhắn này. Vui lòng rút ngắn và thử lại.", en: "Unable to send this message. Please shorten it and try again." },

        // ----- Deep i18n: Gio hang (cart.js) -----
        "cart.emptyText": { vi: "Giỏ hàng của bạn đang trống.", en: "Your cart is empty." },
        "cart.emptyLink": { vi: "Xem các sản phẩm", en: "Browse our products" },
        "cart.qtyFor": { vi: "Số lượng cho {name}", en: "Quantity for {name}" },
        "cart.decrease": { vi: "Giảm số lượng", en: "Decrease quantity" },
        "cart.increase": { vi: "Tăng số lượng", en: "Increase quantity" },
        "cart.loading": { vi: "Đang tải giỏ hàng...", en: "Loading your cart..." },
        "cart.calculatedAtCheckout": { vi: "Tính khi thanh toán", en: "Calculated at checkout" },
        "cart.plusDelivery": { vi: " + phí giao hàng", en: " + delivery" },
        "cart.unavailable": { vi: "Không khả dụng", en: "Unavailable" },
        "cart.feeAtCheckout": { vi: "Phí tính khi thanh toán", en: "Fee at checkout" },
        "cart.weight": { vi: "Khối lượng", en: "Weight" },
        "cart.freshlyBaked": { vi: "Mới ra lò", en: "Freshly baked" },
        "cart.removeItem": { vi: "Xóa sản phẩm", en: "Remove item" },

        // ----- Deep i18n: Thanh toan (checkout.js/html) -----
        "checkout.chooseVoucher": { vi: "Chọn mã giảm giá", en: "Choose a voucher" },
        "checkout.emptyText": { vi: "Giỏ hàng của bạn đang trống.", en: "Your cart is empty." },
        "checkout.emptyLink": { vi: "Chọn một món ngọt", en: "Choose something sweet" },
        "checkout.addressPlaceholder": { vi: "Tìm địa chỉ giao hàng", en: "Search delivery address" },
        "checkout.notePlaceholder": { vi: "Điều gì giúp giao hàng thuận lợi hơn?", en: "Anything we should know for a smooth delivery?" },
        "checkout.noteLabel": { vi: "Ghi chú giao hàng", en: "Delivery note" },
        "checkout.phoneTitle": { vi: "Nhập số điện thoại Việt Nam, ví dụ 0901234567 hoặc +84901234567", en: "Enter a Vietnamese phone number such as 0901234567 or +84901234567" },
        "checkout.phoneError": { vi: "Nhập số hợp lệ, ví dụ 0901234567 hoặc +84901234567.", en: "Enter a valid number, for example 0901234567 or +84901234567." },
        "checkout.viewOrderHistory": { vi: "Xem lịch sử đơn hàng", en: "View order history" },
        "checkout.backToCart": { vi: "Quay lại giỏ hàng", en: "Back to your cart" },
        // Review / phuong thuc giao hang / thanh toan
        "checkout.treatFallback": { vi: "Món ngọt Sugar Bliss", en: "Sugar Bliss treat" },
        "checkout.weight": { vi: "Khối lượng", en: "Weight" },
        "checkout.qty": { vi: "SL {count}", en: "Qty {count}" },
        "checkout.freshlyBaked": { vi: "Mới nướng cho một ngày ngọt ngào hơn", en: "Freshly baked for a sweeter day" },
        "checkout.methodNameDefault": { vi: "Giao hàng tiêu chuẩn", en: "Standard Delivery" },
        "checkout.methodDescQuote": { vi: "Giao bởi Lalamove. Hãy lấy phí giao hàng trước khi đặt đơn.", en: "Delivered by Lalamove. Get your delivery fee before placing the order." },
        "checkout.methodDescPickup": { vi: "Nhận bánh tại cửa hàng.", en: "Collect your treats at the store." },
        "checkout.methodDescIncluded": { vi: "Phí giao hàng đã bao gồm trong tổng đơn.", en: "Delivery fee is included in your order total." },
        "checkout.payCod": { vi: "Thanh toán khi nhận hàng", en: "Cash on delivery" },
        "checkout.payAtStore": { vi: "Thanh toán tại cửa hàng", en: "Pay at store" },
        "checkout.payVisa": { vi: "Visa / thẻ quốc tế", en: "Visa / international card" },
        "checkout.sandbox": { vi: "Thử nghiệm", en: "Sandbox" },
        "checkout.optionUnavailable": { vi: "Không khả dụng", en: "Unavailable" },
        "checkout.optionSelected": { vi: "Đã chọn", en: "Selected" },
        // Voucher
        "checkout.cartEmpty": { vi: "Giỏ hàng của bạn đang trống.", en: "Your cart is empty." },
        "checkout.voucherChecking": { vi: "Đang kiểm tra...", en: "Checking..." },
        "checkout.voucherValidUntil": { vi: " | Hiệu lực đến {time}", en: " | Valid until {time}" },
        "checkout.voucherCannotApply": { vi: "Không thể áp dụng mã này.", en: "This voucher cannot be applied." },
        "checkout.voucherLoadError": { vi: "Không thể tải voucher của bạn.", en: "Unable to load your vouchers." },
        "checkout.recalcPayment": { vi: "Đang tính lại phí giao hàng cho phương thức thanh toán đã chọn...", en: "Recalculating delivery fee for the selected payment method..." },
        // Summary / fee buttons
        "checkout.calculatingFee": { vi: "Đang tính phí giao hàng...", en: "Calculating delivery fee..." },
        "checkout.selectAddress": { vi: "Chọn địa chỉ", en: "Select an address" },
        "checkout.free": { vi: "Miễn phí", en: "Free" },
        "checkout.retryFee": { vi: "Thử lấy phí lại", en: "Retry delivery fee" },
        "checkout.calculateFee": { vi: "Tính phí giao hàng", en: "Calculate delivery fee" },
        "checkout.placingOrder": { vi: "Đang đặt đơn hàng...", en: "Placing your order..." },
        "checkout.placeOrder": { vi: "Đặt hàng", en: "Place order" },
        "checkout.continuePayment": { vi: "Tiếp tục thanh toán", en: "Continue to payment" },
        "checkout.methodUnavailable": { vi: "Phương thức giao hàng này hiện không khả dụng. Vui lòng quay lại giỏ hàng để chọn phương thức khác.", en: "This delivery method is currently unavailable. Please return to your cart to choose another method." },
        // Address status
        "checkout.selectVerified": { vi: "Chọn địa chỉ đã xác minh để tính phí giao hàng.", en: "Select a verified address to calculate delivery." },
        "checkout.noAddressMatch": { vi: "Không tìm thấy địa chỉ phù hợp. Thử thêm quận/huyện hoặc thành phố.", en: "No matching address found. Try adding the district or city." },
        "checkout.selectFromSuggestions": { vi: "Chọn một địa chỉ từ danh sách gợi ý.", en: "Select an address from the suggestions." },
        "checkout.typeThreeChars": { vi: "Nhập ít nhất 3 ký tự, sau đó chọn một địa chỉ đã xác minh.", en: "Type at least 3 characters, then select a verified address." },
        "checkout.searchingAddresses": { vi: "Đang tìm địa chỉ...", en: "Searching addresses..." },
        "checkout.addressSelected": { vi: "Đã chọn địa chỉ giao hàng đã xác minh.", en: "Verified delivery address selected." },
        "checkout.detailsChanged": { vi: "Thông tin giao hàng đã thay đổi. Đang tính lại phí giao hàng...", en: "Delivery details changed. Recalculating the delivery fee..." },
        "checkout.savedCheckContact": { vi: "Đã tìm thấy địa chỉ đã lưu. Kiểm tra tên người nhận và số điện thoại để tính phí giao hàng.", en: "Saved address found. Check the recipient name and phone number to calculate delivery." },
        "checkout.enterValidContact": { vi: "Nhập thông tin liên hệ giao hàng hợp lệ để tính phí.", en: "Enter valid delivery contact details to calculate the fee." },
        "checkout.verifyingSaved": { vi: "Đang xác minh địa chỉ giao hàng đã lưu của bạn...", en: "Verifying your saved delivery address..." },
        "checkout.enterThreeChars": { vi: "Nhập ít nhất 3 ký tự của địa chỉ giao hàng.", en: "Enter at least 3 characters of the delivery address." },
        "checkout.enterAddressFirst": { vi: "Nhập địa chỉ giao hàng trước khi tính phí.", en: "Enter a delivery address before calculating the fee." },
        "checkout.verifyingAddress": { vi: "Đang xác minh địa chỉ giao hàng...", en: "Verifying delivery address..." },
        "checkout.selectVerifiedSuggestion": { vi: "Chọn một địa chỉ đã xác minh từ danh sách gợi ý.", en: "Select a verified address from the suggestions." },
        "checkout.selectVerifiedBefore": { vi: "Chọn địa chỉ đã xác minh trước khi tính phí giao hàng.", en: "Select a verified address before calculating delivery." },
        // Quote status
        "checkout.calculatingYourFee": { vi: "Đang tính phí giao hàng của bạn...", en: "Calculating your delivery fee..." },
        "checkout.feeExpiredNew": { vi: "Phí giao hàng này đã hết hạn. Vui lòng lấy phí mới.", en: "This delivery fee has expired. Please request a new fee." },
        "checkout.feeConfirmedUntil": { vi: "Phí giao hàng được giữ đến {time}.", en: "Delivery fee confirmed until {time}." },
        "checkout.feeExpired": { vi: "Phí giao hàng của bạn đã hết hạn.", en: "Your delivery fee has expired." },
        "checkout.feeExpiredContinue": { vi: "Phí giao hàng của bạn đã hết hạn. Lấy phí mới để tiếp tục.", en: "Your delivery fee has expired. Get an updated fee to continue." },
        "checkout.selectWaitFee": { vi: "Chọn địa chỉ đã xác minh và chờ phí giao hàng trước khi đặt đơn.", en: "Select a verified address and wait for the delivery fee before placing your order." },
        "checkout.httpsRequired": { vi: "Mở trang thanh toán qua HTTPS hoặc localhost để dùng thanh toán trực tuyến thử nghiệm.", en: "Open checkout over HTTPS or localhost to use sandbox online payment." },
        "checkout.allowSession": { vi: "Vui lòng cho phép lưu phiên của trang này trước khi đặt đơn để khôi phục được thanh toán nếu mất kết nối.", en: "Please allow this site's session storage before placing an order so your checkout can be recovered if the connection drops." },
        // Order confirmation / result
        "checkout.orderNoNumber": { vi: "Đơn đã được gửi nhưng không đọc được mã đơn. Vui lòng kiểm tra lại yêu cầu này.", en: "Your checkout was submitted, but its order number could not be read. Check the same request again." },
        "checkout.subtotal": { vi: "Tạm tính", en: "Subtotal" },
        "checkout.discount": { vi: "Giảm giá", en: "Discount" },
        "checkout.delivery": { vi: "Giao hàng", en: "Delivery" },
        "checkout.total": { vi: "Tổng cộng", en: "Total" },
        "checkout.shipTo": { vi: "Giao đến", en: "Ship to" },
        "checkout.recipient": { vi: "Người nhận", en: "Recipient" },
        "checkout.note": { vi: "Ghi chú", en: "Note" },
        "checkout.storePickup": { vi: "Nhận tại cửa hàng", en: "Store Pickup" },
        "checkout.pickupEmail": { vi: "Chúng tôi sẽ gửi email khi đơn của bạn sẵn sàng để nhận.", en: "We will email you when your order is ready to collect." },
        "checkout.methodStandard": { vi: "Giao hàng tiêu chuẩn", en: "Standard Delivery" },
        "checkout.methodExpress": { vi: "Giao hàng nhanh", en: "Express Delivery" },
        "checkout.methodDelivery": { vi: "Giao hàng", en: "Delivery" },
        "checkout.shipCreating": { vi: "Đang xác nhận giao hàng", en: "Confirming delivery" },
        "checkout.shipUnknown": { vi: "Chờ xác nhận giao hàng", en: "Awaiting delivery confirmation" },
        "checkout.shipFailed": { vi: "Việc đặt giao hàng cần xử lý", en: "Delivery booking needs attention" },
        "checkout.shipAssigning": { vi: "Đang tìm tài xế", en: "Finding a driver" },
        "checkout.shipOngoing": { vi: "Đã có tài xế", en: "Driver assigned" },
        "checkout.shipPickedUp": { vi: "Đang giao", en: "On the way" },
        "checkout.shipCompleted": { vi: "Đã giao", en: "Delivered" },
        "checkout.shipCanceled": { vi: "Đã hủy giao hàng", en: "Delivery cancelled" },
        "checkout.shipRejected": { vi: "Không có tài xế", en: "No driver available" },
        "checkout.shipExpired": { vi: "Giao hàng hết hạn", en: "Delivery expired" },
        "checkout.trackDelivery": { vi: "Theo dõi giao hàng", en: "Track delivery" },
        "checkout.customerFallback": { vi: "bạn", en: "friend" },
        "checkout.statusCancelled": { vi: "Đơn đã hủy", en: "Order cancelled" },
        "checkout.statusPending": { vi: "Đã lưu đơn · Cần xác nhận giao hàng", en: "Order saved · Delivery needs confirmation" },
        "checkout.statusConfirmed": { vi: "Đơn đã xác nhận", en: "Order confirmed" },
        "checkout.titleCancelled": { vi: "Đơn hàng này đã bị hủy.", en: "This order has been cancelled." },
        "checkout.titlePending": { vi: "Đơn hàng của bạn đã được lưu.", en: "Your order is saved." },
        "checkout.titleConfirmed": { vi: "Cảm ơn, {name} — đơn đã được xác nhận.", en: "Thanks, {name} — it's confirmed." },
        "checkout.descCancelled": { vi: "Xem chi tiết đơn hàng bên dưới hoặc quay lại thực đơn.", en: "View your order details below or return to the menu." },
        "checkout.descPending": { vi: "Đơn của bạn đã được ghi nhận. Việc giao hàng vẫn đang được xác nhận; kiểm tra trạng thái bên dưới hoặc liên hệ cửa hàng.", en: "Your order is recorded. Delivery is still being confirmed; check its status below or contact the store." },
        "checkout.descOnline": { vi: "Đã nhận thanh toán qua {method}. Không cần thanh toán tiền mặt.", en: "Payment received via {method}. No cash payment is due." },
        "checkout.descPickup": { vi: "Bánh của bạn đã có trong danh sách của chúng tôi. Thanh toán tại cửa hàng khi bạn đến nhận.", en: "Your treats are on our list. Pay at the store when you collect your order." },
        "checkout.descCod": { vi: "Những món ngọt của bạn đã có trong danh sách. Thanh toán tiền mặt khi nhận hàng.", en: "Your sweet treats are on our list. Pay cash when you receive your order." },
        "checkout.orderLabel": { vi: "Đơn", en: "Order" },
        "checkout.continueShopping": { vi: "Tiếp tục mua sắm", en: "Continue shopping" },
        "checkout.viewOrders": { vi: "Xem đơn hàng", en: "View orders" },
        "checkout.whatNext": { vi: "Các bước tiếp theo", en: "What happens next" },
        "checkout.blissOnWay": { vi: "Một chút ngọt ngào đang trên đường đến", en: "A little bliss is on its way" },
        "checkout.checkDeliveryStatus": { vi: "Kiểm tra trạng thái giao hàng", en: "Check delivery status" },
        "checkout.wePrepare": { vi: "Chúng tôi chuẩn bị đơn hàng của bạn", en: "We prepare your order" },
        "checkout.useRefreshBelow": { vi: "Dùng nút Làm mới giao hàng bên dưới để xem trạng thái mới nhất của đơn này.", en: "Use Refresh delivery below to check the latest status of this order." },
        "checkout.pickupEmailReady": { vi: "Chúng tôi sẽ gửi email khi bánh của bạn sẵn sàng để nhận.", en: "We will email you when your treats are ready to collect." },
        "checkout.storeConfirm": { vi: "Cửa hàng sẽ xác nhận và chuẩn bị bánh để giao cho bạn.", en: "The store will confirm and prepare your treats for delivery." },
        "checkout.browseOrders": { vi: "Xem các đơn hàng của bạn", en: "Browse your orders" },
        "checkout.paidOnline": { vi: "Đã thanh toán trực tuyến", en: "Paid online" },
        "checkout.ordersInclude": { vi: "Lịch sử đơn hàng của bạn gồm đơn mới nhất và chi tiết giao hàng.", en: "Your order history includes the latest order and delivery details." },
        "checkout.paidVia": { vi: "{amount} đã thanh toán qua {method}.", en: "{amount} paid via {method}." },
        "checkout.haveReady": { vi: "Chuẩn bị sẵn {amount} khi bạn nhận hàng.", en: "Have {amount} ready when you receive your order." },
        "checkout.methodWord": { vi: "Phương thức", en: "Method" },
        "checkout.deliveryNumber": { vi: "Mã giao hàng", en: "Delivery" },
        "checkout.orderDetails": { vi: "Chi tiết đơn hàng", en: "Order details" },
        "checkout.paymentMethodWord": { vi: "Phương thức thanh toán", en: "Payment method" },
        "checkout.paid": { vi: "Đã thanh toán", en: "Paid" },
        "checkout.pending": { vi: "Chờ xử lý", en: "Pending" },
        "checkout.payOnReceive": { vi: "Thanh toán khi bạn nhận hàng", en: "Pay when you receive your order" },
        // Failed payment
        "checkout.failed": { vi: "Thất bại", en: "Failed" },
        "checkout.payAfterClosed": { vi: "Thanh toán đến sau khi phiên thanh toán này đã đóng. Liên hệ cửa hàng để được hoàn tiền.", en: "Payment arrived after this checkout closed. Contact the store for a refund." },
        "checkout.payNotCompleted": { vi: "Thanh toán chưa hoàn tất. Đơn hàng này sẽ không được chuẩn bị hoặc gửi đi.", en: "Payment was not completed. This order will not be prepared or dispatched." },
        "checkout.payNeedsReview": { vi: "Thanh toán của bạn cần được xem xét.", en: "Your payment needs review." },
        "checkout.payFailed": { vi: "Thanh toán thất bại.", en: "Payment failed." },
        "checkout.contactStore": { vi: "Liên hệ cửa hàng", en: "Contact the store" },
        "checkout.yourItems": { vi: "Các món của bạn", en: "Your items" },
        "checkout.orderSummary": { vi: "Tóm tắt đơn hàng", en: "Order summary" },
        "checkout.refundNeeded": { vi: "Đã nhận thanh toán. Cần hỗ trợ hoàn tiền; đừng thanh toán lại.", en: "Payment received. Refund assistance is required; do not pay again." },
        "checkout.noPaymentDue": { vi: "Không cần thanh toán cho đơn hàng thất bại này.", en: "No payment is due for this failed order." },
        "checkout.checkPaymentStatus": { vi: "Kiểm tra trạng thái thanh toán", en: "Check payment status" },
        // Pending payment
        "checkout.sandboxPayment": { vi: "Thanh toán thử nghiệm", en: "Sandbox payment" },
        "checkout.awaitingPayment": { vi: "Đang chờ thanh toán", en: "Awaiting payment" },
        "checkout.paymentSummary": { vi: "Tóm tắt thanh toán", en: "Payment summary" },
        "checkout.paymentWindowEnds": { vi: "Cửa sổ thanh toán kết thúc lúc {time}.", en: "Payment window ends at {time}." },
        "checkout.awaitingGateway": { vi: "Đang chờ cổng thanh toán xác nhận.", en: "Awaiting gateway confirmation." },
        "checkout.continueTo": { vi: "Tiếp tục đến {method}", en: "Continue to {method}" },
        "checkout.refreshPayment": { vi: "Làm mới thanh toán", en: "Refresh payment" },
        "checkout.refreshDelivery": { vi: "Làm mới giao hàng", en: "Refresh delivery" },
        "checkout.invalidPaymentUrl": { vi: "URL thanh toán thử nghiệm không hợp lệ. Hãy làm mới trạng thái thanh toán.", en: "The sandbox payment URL is invalid. Refresh payment status." },
        // Failure / error card
        "checkout.confirmationNeeded": { vi: "Cần xác nhận", en: "Confirmation needed" },
        "checkout.checkoutIncomplete": { vi: "Thanh toán chưa hoàn tất", en: "Checkout incomplete" },
        "checkout.checkingOrder": { vi: "Chúng tôi đang kiểm tra đơn hàng của bạn.", en: "We're checking your order." },
        "checkout.couldNotPlace": { vi: "Chúng tôi không thể đặt đơn hàng của bạn.", en: "We couldn't place your order." },
        "checkout.orderReview": { vi: "Xem lại đơn hàng của bạn", en: "Your order review" },
        "checkout.checkYourOrder": { vi: "Kiểm tra đơn hàng của bạn", en: "Check your order" },
        "checkout.letsTryAgain": { vi: "Hãy thử lại", en: "Let's try again" },
        "checkout.confirmInterrupted": { vi: "Việc xác nhận bị gián đoạn. Kiểm tra yêu cầu thanh toán này hoặc lịch sử đơn hàng trước khi bắt đầu đơn mới.", en: "The confirmation was interrupted. Check this checkout request or your order history before starting another order." },
        "checkout.reviewTryAgain": { vi: "Xem lại địa chỉ và phí giao hàng của bạn, rồi thử đặt lại đơn hàng.", en: "Review your address and delivery fee, then try placing your order again." },
        "checkout.checkOrderAgain": { vi: "Kiểm tra lại đơn hàng này", en: "Check this order again" },
        "checkout.returnToCheckout": { vi: "Quay lại thanh toán", en: "Return to checkout" },
        "checkout.needHand": { vi: "Cần hỗ trợ?", en: "Need a hand?" },
        "checkout.storeCanHelp": { vi: "Cửa hàng của chúng tôi có thể hỗ trợ về đơn hàng hoặc thông tin giao hàng của bạn.", en: "Our store can help with your order or delivery details." },
        "checkout.connectionInterrupted": { vi: "Kết nối bị gián đoạn. Chúng tôi không thể xác nhận phản hồi từ máy chủ.", en: "Connection interrupted. We could not confirm the server response." },

        // ----- Deep i18n: Lich su don hang (order-history.js) -----
        "orders.loading": { vi: "Đang tải đơn hàng...", en: "Loading orders..." },
        "orders.cancelling": { vi: "Đang hủy...", en: "Cancelling..." },
        "orders.cancelOrder": { vi: "Hủy đơn hàng", en: "Cancel Order" },
        "orders.empty": { vi: "Bạn chưa có đơn hàng nào.", en: "You have no orders yet." },
        "orders.noMatch": { vi: "Không có đơn hàng phù hợp với tìm kiếm.", en: "No orders match your search." },
        "orders.viewDetails": { vi: "Xem chi tiết đơn hàng", en: "View order details" },
        "orders.hideDetails": { vi: "Ẩn chi tiết đơn hàng", en: "Hide order details" },
        "orders.placed": { vi: "Đặt ngày", en: "Order placed" },
        "orders.total": { vi: "Tổng cộng", en: "Total" },
        "orders.orderNo": { vi: "Mã đơn", en: "Order no." },
        "orders.recipient": { vi: "Người nhận", en: "Recipient" },
        "orders.deliveryAddress": { vi: "Địa chỉ giao hàng", en: "Delivery address" },
        "orders.deliveryMethod": { vi: "Phương thức giao hàng", en: "Delivery method" },
        "orders.payment": { vi: "Thanh toán", en: "Payment" },
        "orders.lalamoveDelivery": { vi: "Giao hàng Lalamove", en: "Lalamove delivery" },
        "orders.deliveryNumber": { vi: "Mã vận đơn", en: "Delivery number" },
        "orders.notProvided": { vi: "Chưa cung cấp", en: "Not provided" },
        "orders.awaitingConfirmation": { vi: "Chờ xác nhận", en: "Awaiting confirmation" },
        "orders.quantity": { vi: "Số lượng", en: "Quantity" },
        "orders.downloadInvoice": { vi: "Tải hóa đơn", en: "Download invoice" },
        "orders.continuePayment": { vi: "Tiếp tục thanh toán", en: "Continue payment" },
        "orders.refreshPayment": { vi: "Làm mới thanh toán", en: "Refresh payment" },
        "orders.refreshDelivery": { vi: "Làm mới giao hàng", en: "Refresh delivery" },
        "orders.trackDelivery": { vi: "Theo dõi giao hàng", en: "Track delivery" },
        "orders.summary": { vi: "Hiển thị {start}-{end} trong {total} đơn hàng", en: "Showing {start}-{end} of {total} orders" },
        "orders.cancelConfirm": { vi: "Hủy đơn hàng này? Số lượng đã giữ sẽ được hoàn lại.", en: "Cancel this order? Reserved stock will be restored." },
        "orders.updating": { vi: "Đang cập nhật", en: "Updating" },
        "orders.pending": { vi: "Chờ xử lý", en: "Pending" },
        // Trang thai don hang (hien thi; logic van dua tren gia tri goc)
        "orders.statusInProgress": { vi: "Đang xử lý", en: "In Progress" },
        "orders.statusDelivered": { vi: "Đã giao", en: "Delivered" },
        "orders.statusFailed": { vi: "Thất bại", en: "Failed" },
        "orders.statusCancelled": { vi: "Đã hủy", en: "Cancelled" },
        // Phuong thuc giao hang
        "orders.methodStandard": { vi: "Giao hàng tiêu chuẩn", en: "Standard Delivery" },
        "orders.methodExpress": { vi: "Giao hàng nhanh", en: "Express Delivery" },
        "orders.methodPickup": { vi: "Nhận tại cửa hàng", en: "Store Pickup" },
        "orders.methodLalamove": { vi: "Lalamove (Thử nghiệm)", en: "Lalamove (Sandbox)" },
        // Trang thai giao hang Lalamove
        "orders.shipCreating": { vi: "Đang xác nhận giao hàng", en: "Confirming Delivery" },
        "orders.shipUnknown": { vi: "Chờ xác nhận", en: "Awaiting Confirmation" },
        "orders.shipFailed": { vi: "Đặt giao hàng thất bại", en: "Booking Failed" },
        "orders.shipAssigning": { vi: "Đang tìm tài xế", en: "Finding a Driver" },
        "orders.shipOngoing": { vi: "Đã có tài xế", en: "Driver Assigned" },
        "orders.shipPickedUp": { vi: "Đang giao", en: "On the Way" },
        "orders.shipCompleted": { vi: "Đã giao", en: "Delivered" },
        "orders.shipCanceled": { vi: "Đã hủy giao hàng", en: "Delivery Canceled" },
        "orders.shipRejected": { vi: "Không có tài xế", en: "No Driver Available" },
        "orders.shipExpired": { vi: "Giao hàng hết hạn", en: "Delivery Expired" },

        // ----- Deep i18n: Trang ca nhan (profile.js) -----
        "profile.loadingOrders": { vi: "Đang tải đơn hàng...", en: "Loading orders..." },
        "profile.noOrders": { vi: "Chưa có đơn hàng nào.", en: "No orders yet." },
        "profile.noFavorites": { vi: "Chưa có sản phẩm yêu thích.", en: "No favorites yet." },
        "profile.viewFavorite": { vi: "Xem chi tiết {name}", en: "View {name} detail" },
        "profile.orderedOn": { vi: "Đặt ngày {date}", en: "Ordered on {date}" },
        "profile.customerName": { vi: "Khách hàng Sugar Bliss", en: "Sugar Bliss Customer" },
        "profile.updated": { vi: "Cập nhật hồ sơ thành công.", en: "Profile updated successfully." },
        "profile.uploadingAvatar": { vi: "Đang tải ảnh đại diện...", en: "Uploading avatar..." },
        "profile.avatarUpdated": { vi: "Cập nhật ảnh đại diện thành công.", en: "Avatar updated successfully." },
        "profile.statusInProgress": { vi: "Đang xử lý", en: "In Progress" },
        "profile.statusDelivered": { vi: "Đã giao", en: "Delivered" },
        "profile.statusCancelled": { vi: "Đã hủy", en: "Cancelled" },
        "profile.statusFailed": { vi: "Thất bại", en: "Failed" },

        // ----- Menu tai khoan (profile dropdown tren header) -----
        "menu.profile": { vi: "Hồ sơ", en: "Profile" },
        "menu.orderHistory": { vi: "Lịch sử đơn hàng", en: "Order History" },
        "menu.yourCart": { vi: "Giỏ hàng", en: "Your Cart" },
        "menu.settings": { vi: "Cài đặt", en: "Settings" },
        "menu.logout": { vi: "Đăng xuất", en: "Logout" },

        // ----- Trang Cai dat (Settings) -----
        "settings.title": { vi: "Cài đặt", en: "Settings" },
        "settings.subtitle": {
            vi: "Quản lý tùy chọn tài khoản và trải nghiệm của bạn tại Sugar Bliss.",
            en: "Manage your account preferences and your Sugar Bliss experience."
        },
        "settings.langSection": { vi: "Ngôn ngữ & Hiển thị", en: "Language & Display" },
        "settings.langLabel": { vi: "Ngôn ngữ", en: "Language" },
        "settings.langDesc": {
            vi: "Chọn ngôn ngữ hiển thị cho toàn bộ trang web.",
            en: "Choose the display language for the whole website."
        },
        "settings.langVietnamese": { vi: "Tiếng Việt", en: "Vietnamese" },
        "settings.langEnglish": { vi: "Tiếng Anh", en: "English" },

        "settings.accountSection": { vi: "Tài khoản", en: "Account" },
        "settings.editProfile": { vi: "Chỉnh sửa hồ sơ", en: "Edit Profile" },
        "settings.editProfileDesc": {
            vi: "Cập nhật tên, số điện thoại và địa chỉ giao hàng.",
            en: "Update your name, phone number and delivery address."
        },
        "settings.changePassword": { vi: "Đổi mật khẩu", en: "Change Password" },
        "settings.changePasswordDesc": {
            vi: "Đặt lại mật khẩu để bảo vệ tài khoản của bạn.",
            en: "Reset your password to keep your account secure."
        },

        "settings.notifSection": { vi: "Thông báo", en: "Notifications" },
        "settings.notifOrder": { vi: "Email xác nhận đơn hàng", en: "Order confirmation emails" },
        "settings.notifOrderDesc": {
            vi: "Nhận email mỗi khi đơn hàng của bạn được tạo hoặc cập nhật.",
            en: "Receive an email whenever your order is placed or updated."
        },
        "settings.notifPromo": { vi: "Email ưu đãi & khuyến mãi", en: "Promotions & offers emails" },
        "settings.notifPromoDesc": {
            vi: "Nhận thông tin về bánh mới, ưu đãi và sự kiện đặc biệt.",
            en: "Get updates about new treats, offers and special events."
        },

        "settings.otherSection": { vi: "Khác", en: "Other" },
        "settings.aboutUs": { vi: "Về chúng tôi", en: "About Us" },
        "settings.contact": { vi: "Liên hệ", en: "Contact" },
        "settings.logout": { vi: "Đăng xuất", en: "Logout" },
        "settings.saved": { vi: "Đã lưu cài đặt.", en: "Settings saved." },
        "settings.manage": { vi: "Quản lý", en: "Manage" },

        // ----- Nhan chung -----
        "common.langLabel": { vi: "VI", en: "EN" },
        "common.sending": { vi: "Đang gửi...", en: "Sending..." },
        "common.pleaseWait": { vi: "Vui lòng đợi...", en: "Please wait..." },
        "common.optional": { vi: "(không bắt buộc)", en: "(optional)" },
        "contact.loginToSubmit": { vi: "Đăng nhập để gửi", en: "Login to Submit" }
    };

    function getLang() {
        const stored = localStorage.getItem(STORAGE_KEY);
        return SUPPORTED.includes(stored) ? stored : DEFAULT_LANG;
    }

    function setLang(lang) {
        if (!SUPPORTED.includes(lang)) {
            return;
        }
        localStorage.setItem(STORAGE_KEY, lang);
        document.documentElement.setAttribute("lang", lang);
        apply();
        // Bao cho cac thanh phan khac biet ngon ngu vua doi
        window.dispatchEvent(new CustomEvent("sugarbliss:lang-changed", { detail: { lang } }));
    }

    function toggleLang() {
        setLang(getLang() === "vi" ? "en" : "vi");
    }

    function translate(key, lang) {
        const entry = dictionary[key];
        if (!entry) {
            return null;
        }
        return entry[lang || getLang()] ?? entry[DEFAULT_LANG] ?? null;
    }

    // Quet toan bo DOM va thay text/thuoc tinh theo ngon ngu hien tai.
    function apply(root) {
        const lang = getLang();
        const scope = root || document;

        // Dich phan text ben trong
        scope.querySelectorAll("[data-i18n]").forEach((el) => {
            const key = el.getAttribute("data-i18n");
            const value = translate(key, lang);
            if (value !== null) {
                el.textContent = value;
            }
        });

        // Dich cac thuoc tinh (placeholder, title, aria-label...)
        scope.querySelectorAll("[data-i18n-attr]").forEach((el) => {
            const pairs = el.getAttribute("data-i18n-attr").split(",");
            pairs.forEach((pair) => {
                const [attr, key] = pair.split(":").map((s) => s.trim());
                const value = translate(key, lang);
                if (attr && value !== null) {
                    el.setAttribute(attr, value);
                }
            });
        });

        document.documentElement.setAttribute("lang", lang);
    }

    // Ap dung ngay khi DOM san sang (cho noi dung tinh trong HTML)
    document.addEventListener("DOMContentLoaded", () => apply());

    // Dich ten danh muc: neu co ban dich trong tu dien thi dung, khong thi giu nguyen (vi la du lieu tu DB).
    function translateCategory(name, lang) {
        const value = translate("category." + name, lang);
        return value !== null ? value : name;
    }

    // Xuat API ra global de header/footer va cac trang dung
    window.SugarI18n = {
        apply,
        getLang,
        setLang,
        toggleLang,
        translate,
        translateCategory,
        supported: SUPPORTED
    };
})();
