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
        "about.title": { vi: "Về chúng tôi", en: "About Us" },
        "about.intro": {
            vi: "Sugar Bliss là tiệm bánh ngọt mang đến những chiếc bánh tươi ngon, được làm thủ công mỗi ngày từ những nguyên liệu chọn lọc. Chúng tôi tin rằng mỗi chiếc bánh đều có thể mang lại niềm vui và sự ngọt ngào cho cuộc sống.",
            en: "Lorem ipsum dolor sit amet consectetur. Sagittis quis molestie id. Cras quis tempus elit tellus lacinia nibh commodo senectus id semper. Nulla ornare ut purus pellentesque magna convallis a cras."
        },
        "about.missionTitle": { vi: "Sứ mệnh của chúng tôi", en: "Our Mission" },
        "about.missionText": {
            vi: "Sứ mệnh của chúng tôi là mang đến những chiếc bánh chất lượng cao, an toàn và đẹp mắt, giúp mọi khoảnh khắc của bạn thêm trọn vẹn. Chúng tôi luôn đặt sự hài lòng của khách hàng lên hàng đầu.",
            en: "Lorem ipsum dolor sit amet consectetur. Sagittis quis lorem neque fermentum sit. Nullam habitant orci varius turpis vel nisl suspendisse. Sit et odio lacus sit hendrerit cras enim rhoncus."
        },
        "about.promiseTitle": { vi: "Cam kết của chúng tôi", en: "Our Promise" },
        "about.promiseText": {
            vi: "Chúng tôi cam kết sử dụng nguyên liệu tươi mới, quy trình chế biến sạch sẽ và giao hàng đúng hẹn. Sự tin tưởng của bạn là động lực để chúng tôi không ngừng hoàn thiện.",
            en: "Lorem ipsum dolor sit amet consectetur. Sagittis quis lorem neque fermentum sit. Nullam habitant orci varius turpis vel nisl suspendisse. Sit et odio lacus sit hendrerit cras enim rhoncus."
        },
        "about.ctaTitle": { vi: "Bạn muốn biết thêm về chúng tôi?", en: "Want To Know More About Us?" },
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
        "products.orderNow": { vi: "Đặt ngay", en: "Order Now" },
        "products.ordering": { vi: "Đang đặt...", en: "Ordering..." },
        "products.ordered": { vi: "Đã đặt", en: "Ordered" },
        "products.orderError": { vi: "Không thể tạo đơn hàng.", en: "Cannot create order." },
        "products.contactPrice": { vi: "Liên hệ để biết giá", en: "Contact for price" },
        "products.defaultName": { vi: "Sản phẩm Sugar Bliss", en: "Sugar Bliss Product" },

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
        "detail.rating": { vi: "Xếp hạng", en: "Rating" },
        "detail.submitReview": { vi: "Gửi đánh giá", en: "Submit Review" },

        // ----- Voucher / Ma giam gia (trang Checkout) -----
        "voucher.label": { vi: "Mã giảm giá", en: "Discount code" },
        "voucher.placeholder": { vi: "Nhập mã (vd SUGAR10)", en: "Enter code (e.g. SUGAR10)" },
        "voucher.apply": { vi: "Áp dụng", en: "Apply" },
        "voucher.subtotal": { vi: "Tạm tính", en: "Subtotal" },
        "voucher.discount": { vi: "Giảm giá", en: "Discount" },
        "voucher.delivery": { vi: "Phí giao hàng", en: "Delivery" },
        "voucher.total": { vi: "Tổng cộng", en: "Total" },

        // ----- Nhan chung -----
        "common.langLabel": { vi: "VI", en: "EN" }
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
