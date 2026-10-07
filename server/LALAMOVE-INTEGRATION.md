# Lalamove v3 Sandbox — Hà Nội / Standard Delivery

Tài liệu vận hành cho bản tích hợp ngày 29/09/2026. API đích là `https://rest.sandbox.lalamove.com`, thị trường `VN`, dịch vụ `MOTORCYCLE`. Khóa luôn nằm trong `server/.env` hoặc biến môi trường của tiến trình; không đưa khóa vào mã frontend.

## A. Các file liên quan

| File | Nội dung |
| --- | --- |
| `config/lalamove.js` | Đọc cấu hình bằng đường dẫn tuyệt đối; kiểm tra sandbox, market, khóa và timeout. |
| `services/lalamove.js` | Request v3, HMAC, chuẩn hóa địa chỉ, báo giá, tạo/đọc/hủy vận đơn, kiểm tra kết nối, log debug. |
| `server.js` | Đọc đúng `server/.env`; đăng ký `/api/shipping`. |
| `routes/shippingRoutes.js` | Báo giá COD, test kết nối dành cho admin, webhook và liên kết lại vận đơn. |
| `config/deliveryMethods.js`, `routes/orderRoutes.js` | Standard Delivery dùng Lalamove; checkout chỉ nhận COD; lưu đơn rồi tạo vận đơn. |
| `models/ShippingQuote.js`, `models/Order.js`, `services/shipping.js` | Lưu báo giá, mã vận đơn và trạng thái; cập nhật qua webhook hoặc polling. |
| `scripts/test-lalamove.js`, `package.json` | Lệnh kiểm tra kết nối và báo giá. |
| `.env.example` | Danh sách cấu hình; không chứa khóa thật. |
| `postman/Lalamove-v3-Sandbox.postman_collection.json` | Gọi API trực tiếp, tự ký HMAC cho mỗi request. |
| `postman/Lalamove-v3-Sandbox.postman_environment.json` | Mẫu biến Postman, khóa để trống. |
| `postman/lalamove-hanoi-quote.json` | Địa chỉ người nhận mẫu tại Hà Nội dùng cho CLI. |
| `tests/lalamove.test.js`, `tests/lalamove-postman.test.js`, `tests/shipping-flow.test.js` | Kiểm tra authentication, request, Postman và vòng đời giao hàng bằng dữ liệu giả lập. |

Giao diện thêm bước checkout sau **Proceed To Checkout**: xem hàng, nhập/xác nhận địa chỉ, lấy phí Standard Delivery, chọn **Cash on delivery (COD)** rồi đặt hàng. Màn kết quả hiển thị thông tin đơn thực tế và trạng thái giao hàng. COD vẫn là thanh toán chờ thu; không hiển thị thông báo thẻ đã được thanh toán.

## B. Lỗi đã xử lý và giới hạn xác minh

- Cấu hình base URL và market trước đó không được sử dụng đầy đủ. Bản hiện tại đọc, chuẩn hóa và kiểm tra chúng; URL có thêm `/v3` sẽ bị từ chối để tránh ghép sai endpoint.
- `dotenv.config()` mặc định phụ thuộc thư mục chạy lệnh. Bản hiện tại đọc `server/.env` bằng đường dẫn tuyệt đối. Riêng module Lalamove chỉ nạp các biến `LALAMOVE_*` chưa tồn tại; biến process/container có ưu tiên cao hơn file.
- Lỗi HTTP/network trước đó thiếu chi tiết chẩn đoán. Bản hiện tại phân biệt configuration, authentication, validation, rate limit, provider, network và invalid response; giữ HTTP status, request ID và thông tin phản hồi đã che khóa.
- Công thức HMAC cũ **đã bao gồm timestamp và đúng dạng v3**. Không có bằng chứng để kết luận timeout/502 trước đây do sai chữ ký. Timeout không chứng minh API chưa nhận một lệnh tạo vận đơn.

Đã xác minh thật trong phiên sửa: `GET /v3/cities` trả **200**, có Hà Nội và `MOTORCYCLE`; `POST /v3/quotations` trả **201**, mã `3594989903710703744`, phí `12000 VND`, hết hạn `2026-09-29T05:12:52Z`. Đây là kết quả lịch sử, **không tái sử dụng mã báo giá này** và không coi đó là kết quả tạo vận đơn.

## C. Mã trước/sau ở phần quan trọng

Trước — nạp `.env` theo thư mục hiện hành:

```js
require('dotenv').config();
```

Sau — vị trí file độc lập với thư mục chạy:

```js
require('dotenv').config({
    path: require('node:path').join(__dirname, '.env'),
});
```

Module `config/lalamove.js` còn đọc chọn lọc `LALAMOVE_*` bằng `dotenv.parse`, chỉ gán nếu `process.env[key] === undefined`. Sau khi sửa `.env`, khởi động lại Node/nodemon; nếu chạy container hoặc IDE có biến riêng, sửa biến tại nguồn đó rồi tạo lại tiến trình. Không có lệnh Laravel config cache trong project Node này.

Phần ký HMAC giữ đúng công thức cũ; request builder hiện đóng gói và stringify body **một lần**:

```js
const timestamp = String(Date.now());
const body = data === undefined ? '' : JSON.stringify({ data });
const signature = crypto.createHmac('sha256', config.apiSecret)
    .update(`${timestamp}\r\n${method}\r\n${path}\r\n\r\n${body}`)
    .digest('hex');

const headers = {
    Authorization: `hmac ${config.apiKey}:${timestamp}:${signature}`,
    Market: config.market,
    'Request-ID': crypto.randomUUID(),
    'Content-Type': 'application/json',
};
// fetch nhận nguyên chuỗi body đã ký; GET không gửi body.
```

`path` là `/v3/cities`, `/v3/quotations` hoặc `/v3/orders`, không chứa origin. Timestamp tính bằng milliseconds, signature là hex chữ thường. Đây là HMAC gửi tới Lalamove; JWT Bearer của API SugarBliss vẫn dùng riêng cho đăng nhập người dùng/admin. [Chuẩn authentication chính thức](https://developers.lalamove.com/#authentication).

## D. Cách chạy và test lại

Điền cấu hình sau trong `server/.env`; các giá trị khóa là placeholder:

```dotenv
LALAMOVE_ENABLED=true
LALAMOVE_BASE_URL=https://rest.sandbox.lalamove.com
LALAMOVE_API_KEY=<sandbox-api-key>
LALAMOVE_API_SECRET=<sandbox-api-secret>
LALAMOVE_MARKET=VN
LALAMOVE_SERVICE_TYPE=MOTORCYCLE
LALAMOVE_TIMEOUT_MS=15000
LALAMOVE_DEBUG=false
LALAMOVE_COD_SPECIAL_REQUESTS=PURCHASE_SERVICE_CR,PURCHASE_SERVICE_1
LALAMOVE_PICKUP_NAME=Sugar Bliss - Hanoi Sandbox
LALAMOVE_PICKUP_PHONE=<so-dien-thoai-test-dang-+84>
LALAMOVE_PICKUP_ADDRESS=1 Trang Tien, Hoan Kiem, Ha Noi
LALAMOVE_PICKUP_LAT=21.0241
LALAMOVE_PICKUP_LNG=105.8577
```

Từ thư mục project:

```powershell
npm --prefix server run lalamove:check
npm --prefix server run lalamove:quote
npm --prefix server run lalamove:check -- --debug
npm --prefix server test
```

`lalamove:check` gọi `testLalamoveConnection()` → `GET /v3/cities`. Kết quả có `success: true` hoặc lỗi có `category`, mã lỗi, thông điệp và thông tin request. Lệnh thoát với mã khác 0 khi thất bại. `lalamove:quote` gọi báo giá cơ bản cho địa chỉ mẫu; lệnh này không tạo đơn mua hàng/vận đơn và không bật các special request COD như luồng checkout.

Backend đang chạy còn có `GET /api/shipping/lalamove/test-connection`, yêu cầu đăng nhập admin bằng JWT SugarBliss. Có thể test trong Postman với Bearer token của admin ở endpoint nội bộ này. Không dùng Bearer khi gọi domain Lalamove.

Khi `LALAMOVE_DEBUG=true`, console có endpoint, method, request ID, timestamp, request body, chữ ký đã che, status và response body. API key, secret và authorization được che. Body vẫn chứa địa chỉ/số điện thoại phục vụ chẩn đoán; chỉ bật debug lúc cần.

Để test trực tiếp bằng Postman:

1. Import cả collection và environment trong `postman/Lalamove-v3-Sandbox.*.json`; chọn environment vừa import.
2. Điền API key/secret vào **local values**, điền `TEST_PHONE` dạng `+84...`. Collection đặt **No Auth** vì script tự thêm HMAC; không thêm Bearer token.
3. Gửi **1. Test connection - Cities**; kiểm tra service và special request của Hanoi trong response.
4. Gửi **2. Hanoi quotation**; script tự lưu `quotationId`, `pickupStopId`, `dropoffStopId`.
5. Trong thời gian báo giá còn hiệu lực, gửi **3. Create sandbox delivery**; nhận và lưu `orderId`. Đây là vận đơn trực tiếp trên Lalamove, không tạo bản ghi mua hàng trong SugarBliss.
6. Dùng **4. Read delivery status** để kiểm chứng. Request **5. Cancel sandbox delivery** chỉ dùng khi muốn hủy; không chạy toàn bộ collection tự động nếu muốn giữ đơn để quan sát.

Script Postman thay biến trong body trước khi ký và gửi chính body đã ký. Không sao chép header Authorization cũ để dùng lại cho request khác.

Để tạo cả đơn SugarBliss và vận đơn: đăng nhập website → thêm bánh vào giỏ → **Proceed To Checkout** → nhập địa chỉ/tọa độ giao Hà Nội → lấy phí → xác nhận COD → **Place order**. Backend lấy giá hàng từ database và phí từ báo giá đã lưu. Nếu tạo vận đơn chưa xác nhận do timeout, kiểm tra đơn đã lưu và Partner Portal trước khi thử lại; API có route admin `/api/shipping/lalamove/orders/:id/reconcile` để liên kết mã đã xác minh.

## E. Request báo giá Hà Nội

Gửi `POST https://rest.sandbox.lalamove.com/v3/quotations` với các header do script/client ký:

```json
{
  "data": {
    "serviceType": "MOTORCYCLE",
    "language": "vi_VN",
    "stops": [
      {
        "address": "1 Trang Tien, Hoan Kiem, Ha Noi",
        "coordinates": { "lat": "21.0241", "lng": "105.8577" }
      },
      {
        "address": "24 Hai Ba Trung, Hoan Kiem, Ha Noi",
        "coordinates": { "lat": "21.0244", "lng": "105.8526" }
      }
    ]
  }
}
```

Payload cơ bản này đã nhận HTTP 201 trong kiểm tra thật nêu trên. Response mới cần có `data.quotationId`, hai `data.stops[].stopId`, `data.priceBreakdown.total`, currency `VND` và `expiresAt` còn hiệu lực. Phí có thể thay đổi giữa các lần gọi. [Quotations v3](https://developers.lalamove.com/#get-quotation).

Luồng checkout COD thêm vào `data`:

```json
"specialRequests": ["PURCHASE_SERVICE_CR", "PURCHASE_SERVICE_1"]
```

Các key này lấy từ cấu hình; kiểm tra lại bằng `/v3/cities` nếu Lalamove thay đổi danh mục. Chỉ dùng key được trả về cho đúng Hanoi/MOTORCYCLE. [City info](https://developers.lalamove.com/#get-city-info).

## COD và trạng thái giao hàng

`paymentMethod: COD` là phương thức thanh toán của đơn SugarBliss. Backend gửi tổng cần thu trong `recipients[].remarks` và `metadata` để tham chiếu. Tài liệu v3 công khai không mô tả trường riêng bảo đảm thu đúng tiền COD; metadata không phải xác nhận thu tiền. [Place order / DeliveryDetails](https://developers.lalamove.com/#place-order).

Với `PURCHASE_SERVICE_1`, giá trị hàng phải dưới `500000 VND`; thông báo ứng tiền chính thức của Lalamove Việt Nam nêu hạn mức dưới 500.000đ. Kiểm tra quy trình thu tiền với Lalamove trước khi chuyển luồng này sang production. [Thông báo dịch vụ ứng tiền](https://www.lalamove.com/vi-vn/purchaseservice-08-2023).

Webhook `/api/shipping/lalamove/webhook` và thao tác refresh trạng thái cho phép theo dõi `ASSIGNING_DRIVER`, `ON_GOING`, `PICKED_UP`, `COMPLETED`, `CANCELED`, `REJECTED`, `EXPIRED`. Trong sandbox, đổi trạng thái mô phỏng tại [Partner Portal](https://partnerportal.lalamove.com/) rồi refresh đơn để kiểm tra. `COMPLETED` xác nhận kết thúc giao hàng; `paymentStatus` không tự thành `Paid` và vẫn cần đối soát thu tiền riêng.
