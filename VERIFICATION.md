# Kết quả kiểm thử PageFlow

## Đã xác minh trên môi trường cục bộ
- Prisma schema hợp lệ, generate client thành công.
- Migration tạo bảng + pgvector và các migration độ tin cậy đã áp dụng thành công vào PostgreSQL kiểm thử riêng.
- TypeScript strict check đạt.
- Next.js production build đạt, đủ route web/API.
- Vitest: 31/31 ca đạt trên PostgreSQL kiểm thử. Nền tảng hiện có: hash/mã hóa/chữ ký webhook, cửa sổ gửi và phiên AI, chặn IP nội bộ, nhập TXT/tệp giả, phân trang 121 hội thoại, quyền Page, nguồn nháp/xuất bản, AI lặp đồng thời, webhook lặp/echo, hủy gửi cũ, lỗi gửi chưa rõ, cập nhật kiến thức, tin đến trễ chưa đọc, CSRF/session, API đăng nhập/tiếp quản/idempotency.
- 12 ca mới về tài khoản: chuẩn hóa/từ chối tên đăng nhập, trùng tên khác hoa-thường, đăng nhập bằng tên hoặc email, chặn sai nguồn gửi, giới hạn số lần thử, đổi tên hiển thị/tên đăng nhập, đổi mật khẩu (giữ phiên hiện tại, đăng xuất thiết bị khác, từ chối mật khẩu hiện tại sai và mật khẩu trùng), đặt lại mật khẩu thành viên, chặn xóa chính mình và quản trị viên cuối cùng, giữ hội thoại/tin nhắn khi xóa thành viên, và **tạo quản trị viên đầu tiên**: chỉ tạo được khi chưa có người dùng, từ chối lần sau, **3 yêu cầu đồng thời chỉ tạo đúng 1 tài khoản**.
- Playwright với Google Chrome: 6 luồng E2E đạt — 2 luồng tài khoản (đăng nhập bằng tên ngắn → đổi tên đăng nhập và mật khẩu → đăng nhập lại bằng thông tin mới; trang tạo đầu tiên đóng khi đã có tài khoản) và 4 luồng hộp thư/giao diện sáng-tối. Ảnh ở `artifacts/`.

## Tài khoản đã kiểm tra trên máy dev (cổng 3001)
- Migration thêm tên đăng nhập đã áp dụng; tài khoản cũ `admin@example.com` tự nhận tên đăng nhập `admin`.
- Đăng nhập bằng `admin` hoạt động; mục Tài khoản hiển thị đúng tên/email, lưu hồ sơ thành công, có ô mật khẩu để tự đổi.
- Cài đặt → Thành viên hiển thị `@admin` và nút Đặt lại mật khẩu; không có nút Xóa cho chính mình.
- Không có yêu cầu lỗi hay lỗi console; điện thoại 390px không cuộn ngang.
- **Chưa đổi mật khẩu của tài khoản dev**: bạn tự đổi trong mục Tài khoản để không bị mất quyền truy cập.

## Sự cố trang đăng nhập không nhận CSS (đã sửa)
- Triệu chứng: http://localhost:3001/login trả HTML nhưng CSS và các chunk JavaScript của Next trả **404**, trình duyệt từ chối áp dụng CSS vì MIME `text/plain`; log dev báo thiếu module.
- Nguyên nhân: production build ghi vào `.next` trùng thư mục kết quả mà server dev đang dùng.
- Cách sửa: dev dùng `.next-dev`, production dùng `.next` (đặt trong [next.config.ts](<next.config.ts>)); thêm `.next-dev` vào `.gitignore` và tsconfig; bổ sung icon ứng dụng để hết 404 `/favicon.ico`; CSP cho phép font `Be Vietnam Pro` nên font đúng được áp dụng.
- Bằng chứng sau sửa: CSS trả `200 text/css` (đủ quy tắc `.login-page`), JS trả `200 application/javascript`, trang đăng nhập là lưới hai cột đúng thiết kế, không còn yêu cầu lỗi hay lỗi console; chạy `pnpm build` trong lúc dev đang chạy xong, tài nguyên dev **vẫn 200**; kiểm tra riêng bản production (`next start` cổng tạm) cũng trả CSS `200 text/css`; `pnpm exec tsc --noEmit` đạt.
- Đã kiểm tra thêm: đổi sáng/tối trên trang đăng nhập, đăng nhập và tải 9 hội thoại trong hộp thư, không cuộn ngang ở 390px.

## Giao diện sáng / tối đã xác minh
- Lần đầu theo cài đặt hệ điều hành (kiểm thử với hệ điều hành ở chế độ tối); có nút đổi ở thanh trên cùng và trang đăng nhập.
- Đổi tức thời; tải lại vẫn giữ lựa chọn; tab thứ hai đồng bộ theo; khi trình duyệt chặn lưu trữ vẫn đổi được trong phiên.
- Nền chính (body, danh sách hội thoại, bảng, ô nhập) đều đục, không bị trong suốt ở cả hai chế độ. Giao diện sáng giữ nguyên màu gốc.
- Kiểm tra tương phản chữ/nền tự động trên hộp thư, tri thức, Pages, cài đặt và trang đăng nhập: chế độ tối không có chữ nào dưới ngưỡng 2.6 và không tệ hơn chế độ sáng.
- Kiểm tra desktop 1440px và điện thoại 390px: không cuộn ngang, không lỗi runtime JavaScript.
- Chưa xác minh: hành vi trên trình duyệt cũ không hỗ trợ `color-mix` (khi đó màu Page dùng nền dự phòng, chữ vẫn đủ tương phản) và kiểm tra bằng mắt người dùng trên mọi độ phân giải.

## Chưa được xác minh bằng dịch vụ thật
- OAuth, quyền/xét duyệt, đăng ký webhook và gửi/nhận Messenger trên Meta App/Page của doanh nghiệp.
- Model chat/embedding, chất lượng AI thực tế và chi phí; test dùng demo trích xuất, Meta/queue mock trong integration.
- Tải sản xuất, mọi race/crash phân tán, khôi phục backup, tác vụ pháp lý/xóa dữ liệu của Meta.
- Tất cả dạng PDF/DOCX/website; có giới hạn và xử lý lỗi nhưng cần kiểm thử thêm với tài liệu doanh nghiệp.

## Giới hạn vận hành
- Chỉ Messenger Page, không bình luận/Instagram/WhatsApp.
- Không có thông báo push khi trình duyệt đã đóng.
- Chưa OCR, nhập lịch sử cũ, CRM, đơn hàng/tồn kho thời gian thực.
- Tin đã được Meta chấp nhận không thể thu hồi khi tiếp quản. Lỗi mạng không rõ kết quả không được tự gửi lại.
- AI không có bảo đảm tuyệt đối đúng. Cần kiểm tra bộ câu hỏi của từng Page và giữ nguồn chính xác.
- Nếu sự kiện webhook FAILED chưa xử lý được, AI của Page được chặn gửi để tránh trả lời trên trạng thái cũ; cần kiểm tra hàng đợi/lỗi trong cơ sở dữ liệu. Chưa có nút phát lại webhook thủ công trong giao diện.
- Read/delivery có thể thiếu nếu receipt đến trước khi ID tin gửi được lưu; hiện không triển khai kho đối soát receipt sớm.

Không coi bản demo hoặc các bài test mock là chứng nhận Facebook production thành công. Trước vận hành: theo checklist trong README, kiểm thử Page thật và đặt chính sách dữ liệu phù hợp.
