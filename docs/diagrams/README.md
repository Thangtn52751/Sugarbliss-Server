# SugarBliss - Sơ Đồ Use Case

File chính: [SugarBliss-Use-Cases.drawio](SugarBliss-Use-Cases.drawio).

Sơ đồ mô tả chức năng trong mã nguồn tại ngày 15/10/2026. File dùng XML draw.io
không nén; actor, use case, ghi chú và đường nối đều chỉnh sửa riêng được,
không phải một ảnh gắn vào canvas. Không chứa dữ liệu khách hàng, tài khoản,
token hoặc khoá tích hợp.

## Mở File

Mở draw.io / diagrams.net, chọn **File > Open From > Device** rồi chọn file
`SugarBliss-Use-Cases.drawio`. Với bản desktop, mở trực tiếp file `.drawio`.
Chuyển trang bằng các tab phía dưới canvas; trang đầu là bản tổng quan dùng cho
báo cáo, các trang sau là phân rã chi tiết. Có thể xuất PDF hoặc ảnh từ draw.io.

## Các Trang

| Trang | Nội dung | Tác nhân chính |
| --- | --- | --- |
| 01 | Tổng quan chức năng project | Khách vãng lai, khách hàng, admin |
| 02 | Đăng ký, đăng nhập, OTP, hồ sơ, avatar, voucher sở hữu | Người dùng, SMTP |
| 03 | Tra cứu/lọc/sắp xếp sản phẩm, yêu thích, đánh giá kèm ảnh, chat AI | Khách hàng, Gemini |
| 04 | Giỏ hàng, đặt hàng, tồn kho, kiểm tra và áp dụng voucher | Khách hàng |
| 05 | Geocoding, báo giá/đặt chuyến Lalamove, thanh toán sandbox | Khách hàng, Geocoding, Lalamove, ZaloPay |
| 06 | Lịch sử, chi tiết, hoá đơn, huỷ đơn, pickup và theo dõi giao hàng | Khách hàng, admin, Lalamove, SMTP |
| 07 | Dashboard, sản phẩm, khách hàng và quản lý voucher | Admin |
| 08 | Đặt bánh riêng, liên hệ, xử lý yêu cầu và email xác nhận | Người gửi yêu cầu, admin, SMTP |

## Cách Đọc

- Actor nằm ngoài khung **Hệ thống SugarBliss**; oval là use case trong hệ thống.
- Nét liền không mũi tên biểu diễn liên kết actor - use case, không phải thứ tự chạy.
- `«include»`: hành vi được thực hiện trong use case cơ sở; mũi tên trỏ tới hành vi được dùng.
- `«extend»`: hành vi bổ sung khi điều kiện trong ngoặc vuông đúng; mũi tên trỏ tới use case cơ sở.
- Ghi chú vàng ghi điều kiện nghiệp vụ và giới hạn thực tế, không phải use case.
- Trang tổng quan gom nhóm mục tiêu; mã `OV-*` không phải chức năng mới ngoài các trang chi tiết.
- Đăng nhập/quyền admin là tiền điều kiện của API được bảo vệ, không vẽ `include Đăng nhập` vào mọi thao tác.

## Phạm Vi Và Quy Tắc Thực Tế

- API sản phẩm, giỏ hàng, đơn hàng, đánh giá và chat AI hiện yêu cầu đăng nhập.
  API gửi đơn đặc biệt và gửi liên hệ là công khai.
- Hạn sử dụng sản phẩm là số ngày (`shelfLifeDays`), không phải một ngày hết hạn cố định.
- Đăng/sửa đánh giá yêu cầu đơn của người dùng chứa đúng sản phẩm, trạng thái
  `In Progress`/`Delivered`, với COD hợp lệ hoặc online đã xác minh `Paid`.
  Không yêu cầu phải giao xong nếu đã đặt COD thành công theo logic hiện tại.
- Voucher có sở hữu, hạn dùng và giới hạn sử dụng; chỉ giảm tiền sản phẩm.
  Admin được tạo, bật/tắt và xoá voucher, không có API sửa giá trị tổng quát.
- Store Pickup miễn phí và không nhập địa chỉ giao. Admin chỉ cập nhật tiến độ
  pickup hợp lệ theo `PREPARING -> READY_FOR_PICKUP -> COLLECTED`;
  chuyển sẵn sàng nhận gửi email. Lalamove/Express không được đổi trạng thái thủ công.
- Người dùng không nhập latitude/longitude. Backend geocode và lấy báo giá;
  đặt chuyến Lalamove chỉ sau khi có đơn và thoả điều kiện thanh toán.
- Visa/thẻ quốc tế dùng ZaloPay hosted sandbox cùng với phương thức ví;
  không tích hợp một Visa API riêng. Browser redirect không chứng minh đã trả tiền.
- Thanh toán bỏ dở chỉ thành `Failed` sau khi đối soát được kết quả chưa thanh toán;
  lỗi mạng không tự coi là thất bại. Hoàn tiền online tự động chưa được triển khai.
- Đơn đặc biệt là `SpecialOrder`, không tự chuyển thành đơn mua hàng `Order`.
- Admin xử lý Contact và chỉnh/xoá đánh giá có API nhưng chưa có màn admin riêng;
  ghi chú trong sơ đồ phân biệt rõ phần này với các màn đã có.
- Email, AI, geocoding, Lalamove và thanh toán hoạt động khi dịch vụ tương ứng
  được cấu hình; sơ đồ không khẳng định cấu hình hiện tại đang kết nối thành công.

## Đối Chiếu Mã Nguồn

| Nhóm use case | Nguồn chính |
| --- | --- |
| `ACC-*` | `server/routes/userRoutes.js`, `server/services/voucherService.js` |
| `CAT-*` | `server/routes/productRoutes.js`, `server/services/productReviews.js`, `server/routes/chatboxRoutes.js`, `server/services/chatbox.js` |
| `CART-*` | `server/routes/userRoutes.js`, `server/routes/orderRoutes.js`, `server/services/voucherService.js` |
| `SHIP-*` | `server/routes/deliveryRoutes.js`, `server/services/geocoding.js`, `server/services/deliveryQuote.js`, `server/services/shipping.js` |
| `PAY-*` | `server/routes/paymentRoutes.js`, `server/services/payments.js`, `server/services/zalopay.js` |
| `ORD-*` | `server/routes/orderRoutes.js`, `project/src/main/resources/static/assets/js/order-history.js` |
| `ORD-A*` | `server/routes/adminOrderRoutes.js`, `server/services/adminOrders.js`, `server/services/pickupNotifications.js` |
| `ADM-*` | `server/routes/adminDashboardRoutes.js`, `server/routes/productRoutes.js`, `server/routes/userRoutes.js`, `server/routes/voucherRoutes.js` |
| `REQ-*` | `server/routes/specialOrderRoutes.js`, `server/routes/contactRoutes.js` |

Các tài liệu nghiệp vụ bổ sung nằm trong `server/docs/`. Không thay đổi server,
frontend hoặc dữ liệu DB để tạo sơ đồ này.

## Tạo Lại File

Chạy từ thư mục gốc project bằng PowerShell; đọc rõ UTF-8 để giữ dấu tiếng Việt
trên Windows PowerShell 5.1:

```powershell
$source = [System.IO.File]::ReadAllText(
    (Join-Path (Get-Location) 'docs/diagrams/build-use-cases.ps1'),
    [System.Text.Encoding]::UTF8
)
& ([ScriptBlock]::Create($source)) -OutputDirectory (Join-Path (Get-Location) 'docs/diagrams')
```

Script chỉ ghi file sơ đồ trong thư mục đầu ra và kiểm tra XML, ID trùng,
đường nối thiếu đầu mút. Bản bàn giao cũng được render và duyệt qua cả 8 trang
bằng bộ viewer chính thức của draw.io, không gửi nội dung sơ đồ lên dịch vụ ngoài.
