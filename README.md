# QR Hub

Danh bạ QR chuyển khoản tĩnh, gồm QR cá nhân và QR nhóm. HTML, CSS và JavaScript thuần; dữ liệu trong `data.json`, ảnh gốc trong `images/`. Không cần build, package runtime hoặc CDN.

## Chạy và triển khai

```sh
python3 -m http.server 8765
```

Mở `http://localhost:8765/` hoặc `http://localhost:8765/index.html`. Dùng HTTP server thay vì mở bằng `file://`, vì ứng dụng tải JSON bằng `fetch`.

Deploy `index.html`, `style.css`, `app.js`, `data.json` và `images/` lên static hosting. Hoạt động tại root hoặc thư mục con, không cần SPA rewrite. Nên dùng HTTPS để Clipboard API hoạt động; khi API không khả dụng/bị từ chối, ứng dụng thử clipboard fallback và báo lỗi nếu vẫn thất bại. Link chia sẻ lấy domain/path hiện tại; link localhost chỉ dùng trên máy đang chạy server.

## Dữ liệu và deep link

Mỗi mục có `id` cố định, ví dụ `qr-...`, được lưu trong JSON. Giữ nguyên ID khi sửa tên hoặc sắp xếp; khi thêm QR, cấp một ID duy nhất mới. Không dùng vị trí mảng hoặc số tài khoản làm ID. Không chuyển số tài khoản thành số vì sẽ mất số 0 đầu.

- `?qr=<id>` mở modal sau khi dữ liệu tải xong, tìm trong toàn bộ danh bạ.
- Mở từ danh sách dùng `pushState`; Back đóng và Forward mở lại modal.
- Đóng bằng X, Đóng, Escape hoặc backdrop chỉ quay Back khi entry do chính phiên tài liệu tạo và có base URL tương ứng. Sau reload hoặc truy cập trực tiếp, dùng `replaceState` xóa `qr`, tránh rời website.
- `popstate` đọc lại URL mà không tạo entry mới. Đổi QR khi modal đang mở thay entry hiện tại.
- ID rỗng, không tồn tại, sai encoding, query `qr` lặp hoặc ID trùng trong dữ liệu đều không mở modal; chỉ loại bỏ `qr`, giữ query khác và hash. Card của dữ liệu trùng/mất ID vẫn hiển thị và copy được, nhưng không mở link mơ hồ.
- Tải dữ liệu thất bại giữ URL để nút Thử lại có thể mở đúng QR sau khi phục hồi.
- Tìm kiếm bỏ dấu, không phân biệt hoa/thường và khoảng trắng. Search và ngân hàng được giữ khi đổi tab. Link nhóm tự chọn tab nhóm mà không xóa bộ lọc.

## Giao diện và accessibility

Design tokens nằm đầu `style.css`: nền sáng `#f5f7fb`, surface trắng, chữ navy `#17243c`, chữ phụ `#58667b`, xanh chủ đạo `#2451d5`; spacing 4/8px, radius 10/16/24px, chuyển động 160ms. Font hệ thống hỗ trợ tiếng Việt, SVG inline không cần tải thư viện icon.

Đã dùng CLI của skill UI/UX Pro Max để nghiên cứu minimalism, banking palette, search/filter, focus và responsive. Chọn Minimalism & Swiss Style, nền sáng từ nhóm Banking/Traditional Finance; giữ xanh dương nhận diện thay palette vàng/tím tối và bố cục marketing do lần tìm kiếm ban đầu đề xuất. Các gợi ý marketing không phù hợp với danh bạ này nên không áp dụng.

Grid 1/2/3/4 cột theo viewport; chips wrap để không giấu ngân hàng. Modal desktop hai cột và mobile một cột có cuộn. Ảnh dùng `object-fit: contain`, không sửa ảnh hoặc nội dung QR. Native dialog khóa nền, bổ sung vòng Tab/Shift+Tab, trả focus và giữ scroll; tabs hỗ trợ phím mũi tên/Home/End; thông báo có live region; có reduced motion.

## Kiểm thử

Chạy server trước, sau đó dùng Node với Playwright và Google Chrome đã cài:

```sh
node tests/browser.cjs
```

Có thể đặt `NODE_PATH` tới bộ Playwright có sẵn trên máy; không cần thêm dependency cho ứng dụng. `QR_TEST_URL` đổi server đích; `QR_TEST_OUTPUT` đổi nơi lưu screenshot và `results.json` (mặc định `/tmp/qr-hub-checks`). Test dùng clipboard thật của trình duyệt headless và tải ảnh vào thư mục tạm.

Bộ kiểm thử bao gồm đối chiếu dữ liệu với Git HEAD, toàn bộ 13 QR, byte download, clipboard/share, search/filter/tabs, deep link/reload/Back/Forward, query/hash lỗi, focus/scroll, chín chiều rộng 320–1920px, landscape, text lớn, dữ liệu chậm/lỗi/trùng ID và ảnh lỗi. Fixture lỗi chỉ được intercept trong test, không sửa dữ liệu thật.

Kết quả lần triển khai redesign: 286 assertions đạt trên Chrome headless, không có runtime error hoặc asset error trong luồng bình thường. Kiểm tra bổ sung tại `/qr-hub/index.html` xác nhận deep link và đóng modal giữ pathname, query khác và hash. Đã sửa vòng focus bàn phím được phát hiện trong lần chạy đầu.

Kiểm tra cú pháp và whitespace:

```sh
node --check app.js
git diff --check
```

Giới hạn: kiểm thử tự động bằng Chrome desktop với viewport mô phỏng; chưa kiểm chứng Safari/Firefox, thiết bị thật, screen reader, quét bằng ứng dụng ngân hàng hoặc domain production. Đây không phải chứng nhận WCAG toàn diện. Ảnh QR gốc được giữ nguyên, nên chất lượng quét vẫn phụ thuộc ảnh nguồn và thiết bị.
