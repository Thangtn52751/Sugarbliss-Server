param(
    [string]$OutputDirectory = (Join-Path (Get-Location) 'docs/diagrams')
)

$ErrorActionPreference = 'Stop'
$script:document = New-Object System.Xml.XmlDocument
$file = $document.CreateElement('mxfile')
$file.SetAttribute('host', 'app.diagrams.net')
$file.SetAttribute('agent', 'SugarBliss use-case documentation')
$file.SetAttribute('version', '24.7.17')
$file.SetAttribute('type', 'device')
[void]$document.AppendChild($file)
$script:pageIndex = 0
$script:edgeIndex = 0
$script:root = $null

function Add-Cell {
    param([string]$Id, [string]$Value, [string]$Style, [double]$X, [double]$Y, [double]$Width, [double]$Height)
    $cell = $document.CreateElement('mxCell')
    foreach ($entry in @{ id = $Id; value = $Value; style = $Style; vertex = '1'; parent = '1' }.GetEnumerator()) {
        $cell.SetAttribute($entry.Key, [string]$entry.Value)
    }
    $geometry = $document.CreateElement('mxGeometry')
    foreach ($entry in @{ x = $X; y = $Y; width = $Width; height = $Height; 'as' = 'geometry' }.GetEnumerator()) {
        $geometry.SetAttribute($entry.Key, [string]$entry.Value)
    }
    [void]$cell.AppendChild($geometry)
    [void]$root.AppendChild($cell)
}

function Add-Text {
    param([string]$Id, [string]$Value, [double]$X, [double]$Y, [double]$Width, [double]$Height = 46, [int]$Size = 16)
    Add-Cell $Id $Value "text;html=0;whiteSpace=wrap;align=left;verticalAlign=middle;fontFamily=Arial;fontSize=$Size;fontColor=#334155;spacing=0;" $X $Y $Width $Height
}

function Start-Page {
    param([string]$Name, [string]$Title, [string]$Subtitle, [string]$Rules)
    $script:pageIndex++
    $diagram = $document.CreateElement('diagram')
    $diagram.SetAttribute('id', "sugarbliss-use-case-$pageIndex")
    $diagram.SetAttribute('name', ('{0:00} - {1}' -f $pageIndex, $Name))
    $model = $document.CreateElement('mxGraphModel')
    foreach ($entry in @{ dx = '1800'; dy = '1420'; grid = '1'; gridSize = '10'; guides = '1'; tooltips = '1'; connect = '1'; arrows = '1'; fold = '1'; page = '1'; pageScale = '1'; pageWidth = '1800'; pageHeight = '1420'; math = '0'; shadow = '0'; background = '#FFFFFF' }.GetEnumerator()) {
        $model.SetAttribute($entry.Key, [string]$entry.Value)
    }
    $script:root = $document.CreateElement('root')
    $zero = $document.CreateElement('mxCell'); $zero.SetAttribute('id', '0')
    $one = $document.CreateElement('mxCell'); $one.SetAttribute('id', '1'); $one.SetAttribute('parent', '0')
    [void]$root.AppendChild($zero); [void]$root.AppendChild($one)
    [void]$model.AppendChild($root); [void]$diagram.AppendChild($model); [void]$file.AppendChild($diagram)
    Add-Text 'title' "SUGAR BLISS | $Title" 40 20 1720 52 28
    Add-Text 'subtitle' $Subtitle 40 76 1720 50 16
    Add-Cell 'system' 'Hệ thống SugarBliss' 'rounded=0;whiteSpace=wrap;html=0;fillColor=#FFFFFF;strokeColor=#94A3B8;strokeWidth=1.5;align=left;verticalAlign=top;spacingLeft=22;spacingTop=15;fontSize=19;fontStyle=1;fontColor=#334155;fontFamily=Arial;connectable=0;' 250 150 1300 1120
    Add-Text 'rules' $Rules 270 1290 1270 64 15
    Add-Text 'legend' 'Nét liền: liên kết actor. «include»: hành vi bắt buộc; mũi tên trỏ tới use case được dùng. «extend»: hành vi có điều kiện; mũi tên trỏ tới use case cơ sở.' 40 1370 1720 32 13
}

function Add-Actor {
    param([string]$Id, [string]$Label, [double]$X, [double]$Y, [switch]$External)
    $color = if ($External) { '#237260' } else { '#334155' }
    Add-Cell $Id $Label "shape=umlActor;verticalLabelPosition=bottom;verticalAlign=top;html=0;whiteSpace=wrap;fillColor=#FFFFFF;strokeColor=$color;fontColor=$color;fontFamily=Arial;fontSize=16;spacingTop=8;labelWidth=180;" $X $Y 60 108
}

function Add-UseCase {
    param([string]$Id, [string]$Label, [double]$X, [double]$Y, [string]$Color = '#FFF0F4')
    Add-Cell $Id "$Id`n$Label" "ellipse;whiteSpace=wrap;html=0;fillColor=$Color;strokeColor=#A95D73;fontColor=#242B35;fontSize=16;fontFamily=Arial;spacing=12;align=center;verticalAlign=middle;" $X $Y 300 88
}

function Add-Note {
    param([string]$Id, [string]$Label, [double]$X, [double]$Y, [double]$Width = 420, [double]$Height = 100)
    Add-Cell $Id $Label 'shape=note;whiteSpace=wrap;html=0;fillColor=#FFF9DB;strokeColor=#B79A46;fontColor=#554A2E;fontFamily=Arial;fontSize=15;align=left;verticalAlign=middle;spacing=14;size=18;' $X $Y $Width $Height
}

function Add-Link {
    param([string]$From, [string]$To, [string]$Kind = 'association', [string]$Condition = '', [string]$Anchors = '', [array]$Points = @())
    $script:edgeIndex++
    $cell = $document.CreateElement('mxCell')
    $label = switch ($Kind) {
        'include' { '«include»' }
        'extend' { '«extend»' }
        default { '' }
    }
    if ($Condition) { $label += "`n[$Condition]" }
    $arrow = if ($Kind -eq 'association') { 'endArrow=none;' } else { 'dashed=1;dashPattern=7 4;endArrow=open;endFill=0;' }
    foreach ($entry in @{ id = "edge-$edgeIndex"; value = $label; edge = '1'; parent = '1'; source = $From; target = $To; style = "edgeStyle=none;rounded=0;html=0;strokeColor=#64748B;strokeWidth=1.3;fontColor=#475569;fontSize=13;fontFamily=Arial;labelBackgroundColor=#FFFFFF;$arrow$Anchors" }.GetEnumerator()) {
        $cell.SetAttribute($entry.Key, [string]$entry.Value)
    }
    $geometry = $document.CreateElement('mxGeometry')
    $geometry.SetAttribute('relative', '1'); $geometry.SetAttribute('as', 'geometry')
    if ($Points.Count) {
        $array = $document.CreateElement('Array'); $array.SetAttribute('as', 'points')
        foreach ($point in $Points) {
            $node = $document.CreateElement('mxPoint')
            $node.SetAttribute('x', [string]$point[0]); $node.SetAttribute('y', [string]$point[1])
            [void]$array.AppendChild($node)
        }
        [void]$geometry.AppendChild($array)
    }
    [void]$cell.AppendChild($geometry); [void]$root.AppendChild($cell)
}

$leftActor = 'exitX=1;exitY=0.5;entryX=0;entryY=0.5;'
$rightActor = 'exitX=0;exitY=0.5;entryX=1;entryY=0.5;'
$leftToRight = 'exitX=1;exitY=0.5;entryX=0;entryY=0.5;'
$rightToLeft = 'exitX=0;exitY=0.5;entryX=1;entryY=0.5;'

Start-Page 'Tổng quan' 'USE CASE TỔNG QUAN' 'Phạm vi: chức năng hiện có trong frontend và server. Các trang 02–08 phân rã theo nghiệp vụ.' 'Khách vãng lai: đăng ký/đăng nhập, quên mật khẩu và gửi yêu cầu công khai. API sản phẩm, giỏ hàng, đơn hàng và chat AI hiện yêu cầu đăng nhập. Admin được xác thực quyền tại server.'
Add-Actor 'guest' 'Khách vãng lai' 70 200
Add-Actor 'customer' 'Khách hàng' 70 820
Add-Actor 'admin' 'Quản trị viên' 1660 650
$overviewCustomer = @(
    @('OV-C01', 'Tài khoản & khôi phục mật khẩu', 210),
    @('OV-C02', 'Hồ sơ, yêu thích & voucher sở hữu', 355),
    @('OV-C03', 'Tra cứu, đánh giá & AI sản phẩm', 500),
    @('OV-C04', 'Giỏ hàng & đặt hàng', 645),
    @('OV-C05', 'Thanh toán & giao nhận', 790),
    @('OV-C06', 'Lịch sử & theo dõi đơn hàng', 935),
    @('OV-C07', 'Gửi đơn đặc biệt / liên hệ', 1080)
)
foreach ($item in $overviewCustomer) {
    Add-UseCase $item[0] $item[1] 350 $item[2]
    Add-Link 'customer' $item[0] -Anchors $leftActor
}
Add-Link 'guest' 'OV-C01' -Anchors $leftActor
Add-Link 'guest' 'OV-C07' -Anchors $leftActor
$overviewAdmin = @(
    @('OV-A01', 'Xem thống kê dashboard', 210),
    @('OV-A02', 'Quản lý sản phẩm & tồn kho', 355),
    @('OV-A03', 'Quản lý đơn hàng & đơn pickup', 500),
    @('OV-A04', 'Quản lý khách hàng', 645),
    @('OV-A05', 'Quản lý & cấp voucher', 790),
    @('OV-A06', 'Xử lý yêu cầu đặt bánh riêng', 935),
    @('OV-A07', 'Xử lý liên hệ / đánh giá qua API', 1080)
)
foreach ($item in $overviewAdmin) {
    Add-UseCase $item[0] $item[1] 1100 $item[2] '#EEF5FF'
    Add-Link 'admin' $item[0] -Anchors $rightActor
}
Add-Note 'overview-note' "Tác nhân dịch vụ ngoài:`nGeocoding (Mapbox/Photon), Lalamove, ZaloPay sandbox, SMTP, Gemini.`nChi tiết tại trang 02, 03, 05, 06, 08." 730 570 300 180

Start-Page 'Tài khoản' 'TÀI KHOẢN & HỒ SƠ' 'Đăng ký, đăng nhập, OTP, cập nhật hồ sơ và cấp voucher tự động cho tài khoản mới.' 'Đăng xuất xoá phiên phía trình duyệt. Quên mật khẩu dùng OTP hợp lệ trước khi đặt mật khẩu mới. Voucher tự cấp chỉ được gán khi chiến dịch còn hiệu lực; không mặc định cấp cho tài khoản đã tồn tại.'
Add-Actor 'guest' 'Khách vãng lai' 70 350
Add-Actor 'member' "Người dùng đã đăng nhập`n(customer / admin)" 70 930
Add-Actor 'smtp' "«dịch vụ ngoài»`nMáy chủ email SMTP" 1660 460 -External
Add-UseCase 'ACC-01' 'Đăng ký tài khoản' 350 210
Add-UseCase 'ACC-02' 'Đăng nhập' 350 390
Add-UseCase 'ACC-03' 'Khôi phục mật khẩu' 350 570
Add-UseCase 'ACC-04' 'Xem / cập nhật hồ sơ' 350 900
Add-UseCase 'ACC-05' 'Đăng xuất' 350 1100
Add-UseCase 'ACC-06' 'Gán voucher tài khoản mới' 1050 210 '#F0F8F4'
Add-UseCase 'ACC-07' 'Gửi OTP qua email' 1050 470 '#F0F8F4'
Add-UseCase 'ACC-08' 'Xác minh OTP' 1050 640 '#F0F8F4'
Add-UseCase 'ACC-09' 'Đặt mật khẩu mới' 1050 810 '#F0F8F4'
Add-UseCase 'ACC-10' 'Đổi ảnh đại diện' 1050 1030 '#F0F8F4'
Add-UseCase 'ACC-11' 'Xem voucher sở hữu & số lượng' 1050 1155 '#FFF0F4'
foreach ($id in @('ACC-01', 'ACC-02', 'ACC-03')) { Add-Link 'guest' $id -Anchors $leftActor }
foreach ($id in @('ACC-04', 'ACC-05')) { Add-Link 'member' $id -Anchors $leftActor }
Add-Link 'ACC-06' 'ACC-01' 'extend' 'chiến dịch đang hiệu lực' $rightToLeft
foreach ($id in @('ACC-07', 'ACC-08', 'ACC-09')) { Add-Link 'ACC-03' $id 'include' -Anchors $leftToRight }
Add-Link 'ACC-10' 'ACC-04' 'extend' 'chọn đổi avatar' $rightToLeft
Add-Link 'smtp' 'ACC-07' -Anchors $rightActor
Add-Link 'member' 'ACC-11' -Anchors $leftActor -Points @(@(210, 1240), @(990, 1240))

Start-Page 'Sản phẩm & AI' 'SẢN PHẨM, YÊU THÍCH, ĐÁNH GIÁ & AI' 'Các use case trên trang này hiện yêu cầu tài khoản hợp lệ theo middleware bảo vệ API.' 'Đăng/sửa đánh giá: cần đơn của chính khách chứa sản phẩm, trạng thái In Progress/Delivered và COD hợp lệ hoặc online đã Paid. Xoá đánh giá chỉ yêu cầu quyền sở hữu (admin có quyền xử lý qua API). Tối đa 5 ảnh/đánh giá.'
Add-Actor 'customer' 'Khách hàng' 70 610
Add-Actor 'gemini' "«dịch vụ ngoài»`nGemini AI" 1660 1080 -External
Add-UseCase 'CAT-01' 'Xem danh sách sản phẩm' 350 210
Add-UseCase 'CAT-02' 'Xem chi tiết sản phẩm' 350 425
Add-UseCase 'CAT-03' 'Xem / thêm / bỏ yêu thích' 350 640
Add-UseCase 'CAT-04' 'Đăng / sửa đánh giá' 350 855
Add-UseCase 'CAT-05' 'Chat AI tư vấn sản phẩm' 350 1110
Add-UseCase 'CAT-06' 'Tìm kiếm & gợi ý sản phẩm' 1050 210 '#F0F8F4'
Add-UseCase 'CAT-07' 'Lọc danh mục, khoảng giá; sắp xếp giá' 1050 425 '#F0F8F4'
Add-UseCase 'CAT-08' 'Kiểm tra điều kiện đã mua' 1050 730 '#F0F8F4'
Add-UseCase 'CAT-09' 'Đính kèm ảnh đánh giá' 1050 900 '#F0F8F4'
Add-UseCase 'CAT-10' 'Xoá đánh giá của mình' 1050 1110 '#FFF0F4'
foreach ($id in @('CAT-01', 'CAT-02', 'CAT-03', 'CAT-04', 'CAT-05')) { Add-Link 'customer' $id -Anchors $leftActor }
Add-Link 'CAT-06' 'CAT-01' 'extend' 'nhập từ khoá' $rightToLeft
Add-Link 'CAT-07' 'CAT-01' 'extend' 'chọn bộ lọc' $rightToLeft
Add-Link 'CAT-04' 'CAT-08' 'include' -Anchors $leftToRight
Add-Link 'CAT-09' 'CAT-04' 'extend' 'chọn ảnh' $rightToLeft
Add-Link 'customer' 'CAT-10' -Anchors $leftActor -Points @(@(210, 1230), @(990, 1230), @(990, 1154))
Add-Link 'gemini' 'CAT-05' -Anchors $rightActor -Points @(@(1590, 1250), @(700, 1250), @(700, 1154))
Add-Note 'catalog-note' "Chi tiết sản phẩm hiển thị ảnh theo bản ghi, cân nặng (g), hạn dùng (ngày), thành phần, tồn kho và đánh giá.`nAI có thể trả gợi ý dạng thẻ dẫn vào chi tiết." 730 540 670 105

Start-Page 'Giỏ hàng & Checkout' 'GIỎ HÀNG & ĐẶT HÀNG' 'Giá, số lượng, voucher và tổng tiền được kiểm tra lại tại backend; không tin số tiền gửi từ trình duyệt.' 'Đơn mới trừ tồn kho theo số lượng mua; checkout trùng được chống tạo lặp. Voucher chỉ giảm tiền sản phẩm, không giảm phí giao hàng. Phương thức giao / nhận và COD / online được chọn trước khi đặt đơn.'
Add-Actor 'customer' 'Khách hàng' 70 640
Add-UseCase 'CART-01' 'Xem / thêm sản phẩm vào giỏ' 350 240
Add-UseCase 'CART-02' 'Đặt hàng' 350 650
Add-UseCase 'CART-03' 'Áp dụng voucher sở hữu' 350 1010
Add-UseCase 'CART-04' 'Đổi số lượng trong giỏ' 1050 210 '#F0F8F4'
Add-UseCase 'CART-05' 'Xoá sản phẩm / xoá giỏ' 1050 390 '#F0F8F4'
Add-UseCase 'CART-06' 'Kiểm tra giá, tồn kho & tính tổng' 1050 600 '#F0F8F4'
Add-UseCase 'CART-07' 'Trừ tồn kho theo số lượng' 1050 810 '#F0F8F4'
Add-UseCase 'CART-08' 'Kiểm tra sở hữu, hạn & điều kiện voucher' 1050 1040 '#F0F8F4'
foreach ($id in @('CART-01', 'CART-02', 'CART-03')) { Add-Link 'customer' $id -Anchors $leftActor }
Add-Link 'CART-04' 'CART-01' 'extend' 'chọn cập nhật' $rightToLeft
Add-Link 'CART-05' 'CART-01' 'extend' 'chọn xoá' $rightToLeft
Add-Link 'CART-02' 'CART-06' 'include' -Anchors $leftToRight
Add-Link 'CART-02' 'CART-07' 'include' -Anchors $leftToRight
Add-Link 'CART-03' 'CART-02' 'extend' 'chọn mã voucher' 'exitX=0.5;exitY=0;entryX=0.5;entryY=1;'
Add-Link 'CART-03' 'CART-08' 'include' -Anchors $leftToRight
Add-Note 'cart-note' "Bước chọn giao nhận / thanh toán:`n• Store Pickup: miễn phí, ẩn trường địa chỉ.`n• Giao Lalamove: phải có báo giá hợp lệ.`n• Express: phí cố định theo cấu hình.`n• COD hoặc ZaloPay / Visa sandbox.`nChi tiết tích hợp tại trang 05." 730 1140 690 115

Start-Page 'Giao hàng & thanh toán' 'GIAO HÀNG & THANH TOÁN' 'Luồng Lalamove và thanh toán online là phần có điều kiện của checkout, không phải thao tác áp dụng cho mọi đơn.' 'Khách không nhập toạ độ. Với Lalamove, chỉ cho đặt đơn khi địa chỉ đã xác minh và có báo giá hợp lệ. Online chỉ được công nhận Paid sau callback/query đã xác minh; đóng trình duyệt không tự chứng minh thanh toán thất bại.'
Add-Actor 'customer' 'Khách hàng' 70 640
Add-Actor 'geocoding' "«dịch vụ ngoài»`nGeocoding`nMapbox / Photon" 1660 210 -External
Add-Actor 'lalamove' "«dịch vụ ngoài»`nLalamove" 1660 650 -External
Add-Actor 'gateway' "«dịch vụ ngoài»`nZaloPay sandbox`n(ví / thẻ quốc tế)" 1660 1030 -External
Add-UseCase 'SHIP-01' 'Lấy phí giao Lalamove' 350 300
Add-UseCase 'SHIP-02' 'Đặt chuyến giao Lalamove' 350 700
Add-UseCase 'PAY-01' 'Thanh toán ZaloPay / Visa' 350 1090
Add-UseCase 'SHIP-03' 'Tìm địa chỉ & geocode tự động' 1050 210 '#F0F8F4'
Add-UseCase 'SHIP-04' 'Lấy quotation theo toạ độ nội bộ' 1050 420 '#F0F8F4'
Add-UseCase 'PAY-02' 'Mở phiên thanh toán tại cổng' 1050 930 '#F0F8F4'
Add-UseCase 'PAY-03' 'Xác minh kết quả thanh toán' 1050 1140 '#F0F8F4'
Add-Link 'customer' 'SHIP-01' -Anchors $leftActor
Add-Link 'customer' 'PAY-01' -Anchors $leftActor
Add-Link 'SHIP-01' 'SHIP-03' 'include' -Anchors $leftToRight
Add-Link 'SHIP-01' 'SHIP-04' 'include' -Anchors $leftToRight
Add-Link 'geocoding' 'SHIP-03' -Anchors $rightActor
Add-Link 'lalamove' 'SHIP-04' -Anchors $rightActor
Add-Link 'lalamove' 'SHIP-02' -Anchors $rightActor
Add-Link 'PAY-01' 'PAY-02' 'include' -Anchors $leftToRight
Add-Link 'PAY-01' 'PAY-03' 'include' -Anchors $leftToRight
Add-Link 'gateway' 'PAY-02' -Anchors $rightActor
Add-Link 'gateway' 'PAY-03' -Anchors $rightActor
Add-Note 'dispatch-note' "Điều kiện đặt chuyến:`nĐơn đã tạo và dùng Lalamove; COD hoặc online đã xác minh Paid. Không đặt chuyến hai lần khi callback/query lặp." 920 550 500 120
Add-Note 'cod-note' "COD không mở cổng online.`nVisa dùng luồng thẻ quốc tế của ZaloPay sandbox, không phải một Visa API độc lập." 350 860 300 125

Start-Page 'Đơn hàng & giao nhận' 'LỊCH SỬ ĐƠN HÀNG & XỬ LÝ GIAO NHẬN' 'Khách hàng chỉ truy cập đơn của mình. Admin có thể tra cứu các đơn và cập nhật tiến độ Store Pickup theo quy tắc.' 'Store Pickup: PREPARING → READY_FOR_PICKUP → COLLECTED; COD cần xác nhận đã thu tiền khi nhận bánh. Lalamove không cho admin đổi trạng thái thủ công. Huỷ đơn và hoàn tồn kho chịu điều kiện backend; không hỗ trợ hoàn tiền online tự động.'
Add-Actor 'customer' 'Khách hàng' 70 640
Add-Actor 'admin' 'Quản trị viên' 1660 270
Add-Actor 'lalamove' "«dịch vụ ngoài»`nLalamove" 1660 800 -External
Add-Actor 'smtp' "«dịch vụ ngoài»`nEmail SMTP" 1660 1100 -External
Add-UseCase 'ORD-01' 'Xem / tìm kiếm lịch sử đơn' 350 210
Add-UseCase 'ORD-02' 'Xem chi tiết / trạng thái đơn' 350 420
Add-UseCase 'ORD-03' 'Tải hoá đơn dạng văn bản' 350 630
Add-UseCase 'ORD-04' 'Huỷ đơn đủ điều kiện' 350 840
Add-UseCase 'ORD-05' 'Tiếp tục / kiểm tra thanh toán' 350 1080
Add-UseCase 'ORD-A01' 'Tra cứu / xem chi tiết mọi đơn' 1050 210 '#EEF5FF'
Add-UseCase 'ORD-A02' 'Cập nhật tiến độ đơn pickup' 1050 460 '#EEF5FF'
Add-UseCase 'ORD-A03' 'Đồng bộ / xem tracking Lalamove' 1050 800 '#EEF5FF'
Add-UseCase 'ORD-A04' 'Gửi email bánh sẵn sàng' 1050 1100 '#F0F8F4'
foreach ($id in @('ORD-01', 'ORD-02', 'ORD-03', 'ORD-04', 'ORD-05')) { Add-Link 'customer' $id -Anchors $leftActor }
foreach ($id in @('ORD-A01', 'ORD-A02', 'ORD-A03')) { Add-Link 'admin' $id -Anchors $rightActor }
Add-Link 'customer' 'ORD-A03' -Anchors $leftActor -Points @(@(210, 1215), @(970, 1215), @(970, 844))
Add-Link 'lalamove' 'ORD-A03' -Anchors $rightActor
Add-Link 'ORD-A04' 'ORD-A02' 'extend' 'vừa chuyển READY_FOR_PICKUP' 'exitX=1;exitY=0.5;entryX=1;entryY=0.5;' -Points @(@(1475, 1144), @(1475, 504))
Add-Link 'smtp' 'ORD-A04' -Anchors $rightActor
Add-Note 'order-note' "Thanh toán bỏ dở / hết hạn:`nJob đối soát chỉ ghi Failed khi xác nhận chưa thanh toán. Lỗi mạng / chờ xác minh không tự chuyển Failed." 730 575 690 130

Start-Page 'Admin - Danh mục & voucher' 'ADMIN: THỐNG KÊ, SẢN PHẨM, KHÁCH HÀNG & VOUCHER' 'Các use case quản trị yêu cầu protect + admin phía server; không dựa riêng vào role lưu trên trình duyệt.' 'Sản phẩm lưu ảnh dạng mảng, cân nặng, hạn dùng, thành phần và tồn kho. Voucher có ngày hết hạn, chỉ giảm tiền sản phẩm; không có sửa giá trị voucher tổng quát. Admin không được tự khoá mình hoặc khoá tài khoản admin khác.'
Add-Actor 'admin' 'Quản trị viên' 70 640
Add-UseCase 'ADM-01' 'Xem dashboard thống kê thực' 350 210 '#EEF5FF'
Add-UseCase 'ADM-02' 'Xem / tìm sản phẩm quản trị' 350 480 '#EEF5FF'
Add-UseCase 'ADM-03' 'Xem / tìm / lọc khách hàng' 350 800 '#EEF5FF'
Add-UseCase 'ADM-04' 'Xem danh sách voucher' 350 1100 '#EEF5FF'
Add-UseCase 'ADM-05' 'Thêm / sửa sản phẩm & upload ảnh' 1050 370 '#F0F8F4'
Add-UseCase 'ADM-06' 'Xoá sản phẩm' 1050 580 '#F0F8F4'
Add-UseCase 'ADM-07' 'Khoá / mở khoá khách hàng' 1050 800 '#F0F8F4'
Add-UseCase 'ADM-08' 'Tạo voucher & chọn user nhận' 1050 1000 '#F0F8F4'
Add-UseCase 'ADM-09' 'Bật / tắt / xoá voucher' 1050 1170 '#F0F8F4'
foreach ($id in @('ADM-01', 'ADM-02', 'ADM-03', 'ADM-04')) { Add-Link 'admin' $id -Anchors $leftActor }
Add-Link 'ADM-05' 'ADM-02' 'extend' 'chọn thêm / sửa' $rightToLeft
Add-Link 'ADM-06' 'ADM-02' 'extend' 'chọn xoá' $rightToLeft
Add-Link 'ADM-07' 'ADM-03' 'extend' 'chọn đổi trạng thái' $rightToLeft
Add-Link 'ADM-08' 'ADM-04' 'extend' 'chọn tạo mới' $rightToLeft
Add-Link 'ADM-09' 'ADM-04' 'extend' 'chọn hành động' $rightToLeft
Add-Note 'dashboard-note' "Dashboard: doanh thu, số đơn, khách hàng, sản phẩm; biểu đồ doanh số, sản phẩm bán chạy, đơn gần đây. Dữ liệu lấy từ DB." 950 190 490 110
Add-Note 'admin-note' "Tuỳ chọn voucher mới:`nGán user cụ thể và/hoặc tự cấp cho tài khoản đăng ký sau này. Điều kiện ngày dùng và giới hạn lượt được backend kiểm tra lại." 350 600 300 130

Start-Page 'Đơn đặc biệt & liên hệ' 'ĐƠN ĐẶC BIỆT & LIÊN HỆ HỖ TRỢ' 'Hai form gửi yêu cầu là API công khai. Chức năng đọc/xử lý yêu cầu chỉ dành cho admin.' 'Đơn đặt bánh riêng được lưu dưới dạng yêu cầu, không tự tạo Order thanh toán hay chuyến Lalamove. Email xác nhận/nhắc admin phụ thuộc SMTP. Contact admin và xử lý đánh giá admin hiện có API, chưa có màn quản trị riêng.'
Add-Actor 'sender' "Người gửi yêu cầu`n(chưa / đã đăng nhập)" 70 600
Add-Actor 'admin' 'Quản trị viên' 1660 480
Add-Actor 'smtp' "«dịch vụ ngoài»`nEmail SMTP" 1660 1110 -External
Add-UseCase 'REQ-01' 'Gửi yêu cầu đặt bánh riêng' 350 300
Add-UseCase 'REQ-02' 'Gửi lời nhắn liên hệ' 350 800
Add-UseCase 'REQ-03' 'Tra cứu / lọc đơn đặc biệt' 1050 210 '#EEF5FF'
Add-UseCase 'REQ-04' 'Cập nhật trạng thái & ghi chú yêu cầu' 1050 440 '#F0F8F4'
Add-UseCase 'REQ-05' 'Tra cứu liên hệ (API admin)' 1050 710 '#EEF5FF'
Add-UseCase 'REQ-06' 'Cập nhật liên hệ (API admin)' 1050 940 '#F0F8F4'
Add-UseCase 'REQ-07' 'Gửi email xác nhận & thông báo admin' 730 1150 '#F0F8F4'
Add-Link 'sender' 'REQ-01' -Anchors $leftActor
Add-Link 'sender' 'REQ-02' -Anchors $leftActor
Add-Link 'admin' 'REQ-03' -Anchors $rightActor
Add-Link 'admin' 'REQ-05' -Anchors $rightActor
Add-Link 'REQ-04' 'REQ-03' 'extend' 'chọn xử lý' 'exitX=0.5;exitY=0;entryX=0.5;entryY=1;'
Add-Link 'REQ-06' 'REQ-05' 'extend' 'chọn xử lý' 'exitX=0.5;exitY=0;entryX=0.5;entryY=1;'
Add-Link 'REQ-01' 'REQ-07' 'include' -Anchors 'exitX=1;exitY=0.5;entryX=0.25;entryY=0;' -Points @(@(930, 344), @(930, 1100), @(805, 1100))
Add-Link 'REQ-02' 'REQ-07' 'include' -Anchors 'exitX=1;exitY=0.5;entryX=0;entryY=0.5;' -Points @(@(680, 844), @(680, 1194))
Add-Link 'smtp' 'REQ-07' -Anchors $rightActor
Add-Note 'request-note' "Đặt bánh riêng: tên, email, điện thoại, hình thức nhận, chi tiết yêu cầu; địa chỉ bắt buộc khi chọn giao.`nLiên hệ: tên, email, lời nhắn; email gửi khách xác nhận đang chờ xử lý." 350 480 540 160

[void][System.IO.Directory]::CreateDirectory($OutputDirectory)
$outputPath = Join-Path $OutputDirectory 'SugarBliss-Use-Cases.drawio'
$settings = New-Object System.Xml.XmlWriterSettings
$settings.Encoding = New-Object System.Text.UTF8Encoding($false)
$settings.Indent = $true
$writer = [System.Xml.XmlWriter]::Create($outputPath, $settings)
try { $document.Save($writer) } finally { $writer.Dispose() }
$verified = New-Object System.Xml.XmlDocument
$verified.Load($outputPath)
foreach ($page in $verified.mxfile.diagram) {
    $cells = @($page.mxGraphModel.root.mxCell)
    $ids = @{}
    foreach ($cell in $cells) {
        if ($ids.ContainsKey($cell.id)) { throw "Duplicate cell ID $($cell.id) in $($page.name)" }
        $ids[$cell.id] = $true
    }
    foreach ($edge in @($cells | Where-Object { $_.edge -eq '1' })) {
        if (!$ids.ContainsKey($edge.source) -or !$ids.ContainsKey($edge.target)) { throw "Broken link $($edge.id)" }
    }
}
Write-Output "Created $outputPath ($($verified.mxfile.diagram.Count) pages)."
