# PageFlow — hộp thư Facebook Page tập trung

Ứng dụng nội bộ tiếng Việt: quản lý nhiều Page, đọc/trả lời Messenger tại một nơi, tiếp quản AI, kho kiến thức riêng và kết nối Meta App chính thức. **Mã tích hợp không đồng nghĩa App đã được Meta duyệt; không bật production trước khi kiểm thử Page thật.**

## Yêu cầu
Node.js 22+, pnpm 11+, Docker (hoặc PostgreSQL 16 có extension pgvector và Redis 7). Web và worker cần chạy cùng cấu hình cơ sở dữ liệu/Redis. Không dùng Next.js static export.

## Chạy demo
```bash
pnpm install
cp .env.example .env
# Chỉnh các biến trong .env. Không commit .env.
docker compose up -d
pnpm db:generate
pnpm db:migrate
```
Tạo quản trị viên — **cách khuyến nghị:** mở web rồi làm theo trang tự tạo tài khoản (chỉ hiện khi máy chủ chưa có người dùng nào):
```bash
set -a; . ./.env; set +a
pnpm dev   # mở http://localhost:3000 — trang /setup hiện ra và tự đăng nhập sau khi tạo
```
Cách dòng lệnh khi máy chủ không mở web được (mật khẩu tối thiểu 12 ký tự; tránh lưu mật khẩu thật vào shell history):
```bash
set -a; . ./.env; set +a
read -r -p 'Email admin: ' ADMIN_EMAIL
read -r -s -p 'Mật khẩu: ' ADMIN_PASSWORD; echo
export ADMIN_EMAIL ADMIN_PASSWORD
pnpm admin:create
unset ADMIN_PASSWORD
pnpm demo:seed
```
Chạy hai terminal, mỗi terminal nạp `.env` trước:
```bash
set -a; . ./.env; set +a
pnpm dev
```
```bash
set -a; . ./.env; set +a
pnpm worker
```
Mở http://localhost:3000, đăng nhập admin đã tạo. Demo có 3 Page, 9 khách và kiến thức đã xuất bản; AI mặc định tắt. Trong Facebook Pages bật AI demo, rồi vào hội thoại AI và chọn mô phỏng tin khách. Không có khóa AI, demo chỉ trích nguyên văn kiến thức, không giả lập dịch vụ AI thật. Tiếp quản → gửi thủ công → bật lại AI để thử luồng.

`tsx` không tự đọc `.env`; vì vậy lệnh worker/admin/seed phải nạp môi trường như trên. Next.js tự đọc `.env`. `.env` trong ví dụ chỉ dùng giá trị đơn giản tương thích shell.

Dev và production dùng **hai thư mục kết quả riêng**: `pnpm dev` ghi vào `.next-dev`, `pnpm build`/`pnpm start` dùng `.next`. Nhờ vậy có thể chạy build production ngay trong lúc server dev đang chạy mà không làm hỏng CSS/JavaScript đang phục vụ tại cổng dev. Nếu từng gặp trang mất CSS hoặc lỗi thiếu module sau khi build, hãy khởi động lại `pnpm dev` (hoặc xóa `.next-dev`) rồi tải lại trang; không cần xóa `.next`.

## Tài khoản và đăng nhập
- **Tài khoản đầu tiên:** khi cơ sở dữ liệu chưa có người dùng nào, mở web sẽ vào `/setup` để tạo quản trị viên (tên, email, **tên đăng nhập ngắn**, mật khẩu) và tự đăng nhập. Sau khi đã có tài khoản, trang này từ chối tạo thêm — chỉ quản trị viên thêm thành viên trong **Cài đặt → Thành viên**.
- **Đăng nhập** bằng tên đăng nhập ngắn (ví dụ `admin`) hoặc email, đều được. Tên đăng nhập không phân biệt hoa/thường và phải duy nhất.
- **Mục Tài khoản** (mọi vai trò) để đổi tên hiển thị, tên đăng nhập và mật khẩu của chính mình. Đổi mật khẩu sẽ đăng xuất mọi thiết bị khác nhưng giữ phiên đang dùng; có nút đăng xuất các thiết bị khác.
- **Quản trị viên** có thể thêm thành viên (kèm tên đăng nhập), đặt lại mật khẩu tạm cho một thành viên (thành viên đó bị đăng xuất mọi thiết bị) và xóa thành viên. Không thể xóa chính mình hoặc quản trị viên cuối cùng; hội thoại và tin nhắn vẫn được giữ.
- **Quên mật khẩu:** ứng dụng không gửi email. Quản trị viên đặt lại trong Cài đặt → Thành viên, hoặc trên máy chủ:
```bash
set -a; . ./.env; set +a
read -r -p 'Email hoặc tên đăng nhập: ' ADMIN_EMAIL
read -r -s -p 'Mật khẩu mới: ' ADMIN_PASSWORD; echo
export ADMIN_EMAIL ADMIN_PASSWORD
pnpm admin:reset
unset ADMIN_PASSWORD
```
Lệnh này đặt lại mật khẩu (và tên đăng nhập nếu có `ADMIN_USERNAME`) rồi đăng xuất mọi phiên của tài khoản đó. Mật khẩu được băm bằng scrypt và không bao giờ ghi vào log.

## Giao diện sáng / tối
- Nút mặt trăng/mặt trời ở thanh trên cùng (và ở góc phải trang đăng nhập) đổi ngay giữa giao diện sáng và tối.
- Lần đầu truy cập, giao diện theo cài đặt sáng/tối của hệ điều hành. Khi bạn tự chọn, lựa chọn được lưu trong trình duyệt và giữ sau khi tải lại, đăng nhập/đăng xuất; các tab đang mở cũng đổi theo.
- Lựa chọn theo **từng trình duyệt/thiết bị**, không lưu trên máy chủ, nên mỗi nhân viên tự chọn giao diện của mình. Nếu trình duyệt chặn lưu trữ, nút vẫn đổi được trong phiên hiện tại.
- Chế độ tối dùng tông navy; màu thương hiệu, nút chính và trang đăng nhập được giữ nguyên thiết kế. Màu riêng của từng Page tự hòa theo nền nên vẫn đọc được ở cả hai chế độ.

## Kết nối Facebook thật
1. Triển khai web/worker trên máy chủ, dùng tên miền HTTPS công khai. Đặt `APP_URL` chính xác (không dấu `/` cuối). Không dùng localhost cho callback production.
2. Tạo khóa mã hóa `openssl rand -hex 32` và verify token ngẫu nhiên; lưu `TOKEN_ENCRYPTION_KEY`, `META_VERIFY_TOKEN` cùng `META_APP_ID`, `META_APP_SECRET` trong secret manager hoặc `.env` bảo mật. Không nhập khóa vào chat, source code hoặc trình duyệt. Mất khóa mã hóa sẽ cần kết nối lại các Page.
3. Xác định phiên bản Graph API đang được Meta hỗ trợ, đặt `META_GRAPH_VERSION=vXX.X`. Không có phiên bản mặc định nhằm tránh vô tình dùng API lỗi thời.
4. Trong Meta App hiện có, cấu hình Messenger, Webhooks cho object Page, URL `https://ten-mien/api/meta/webhook`, verify token; callback OAuth `https://ten-mien/api/meta/callback`, tên miền và redirect URI hợp lệ.
5. Xác minh quyền phù hợp với use case, dự kiến `pages_show_list`, `pages_messaging`, `pages_manage_metadata`; quyền/Advanced Access, Business Verification, App Review và chế độ Live phụ thuộc tài khoản/App. Đối chiếu tài liệu chính thức trước production: https://developers.facebook.com/docs/messenger-platform/ và https://developers.facebook.com/docs/messenger-platform/webhooks/ . Các đường dẫn Meta có thể chuyển sang cấu trúc documentation mới.
6. Trong Facebook Pages chọn **Kết nối Facebook**, cấp quyền với tài khoản có quyền Page, chọn đúng Page cần quản lý. Mỗi tài khoản quản trị khác có thể cấp thêm Page theo lượt kết nối. Ứng dụng không lưu mật khẩu Facebook.
7. Giữ `META_SEND_ENABLED=false` khi kiểm tra webhook nhận tin. Sau khi quyền và chính sách gửi được xác minh, bật biến này, khởi động lại web/worker, thử trả lời thủ công trên Page test. Hiện ứng dụng chỉ gửi `RESPONSE` trong 24 giờ kể từ tin khách, không triển khai nhãn HUMAN_AGENT/marketing để mở rộng cửa sổ.
8. Cấu hình AI, xuất bản và thử kiến thức từng Page, sau đó mới bật AI từng Page. Khi kết nối lại, AI Page được tắt để kiểm tra lại.

Chỉ nhận tin từ khi webhook được đăng ký; chưa nhập đầy đủ lịch sử Messenger cũ. Tên khách ban đầu là định danh rút gọn PSID vì không mặc định có quyền lấy hồ sơ khách. Page thuộc những tài khoản khác nhau cùng nằm trong một không gian nội bộ, không phải SaaS đa doanh nghiệp.

## Kho kiến thức và AI
- Nhập nội dung/FAQ/bảng giá; tài liệu TXT, DOCX, PDF có văn bản tối đa 8 MB, 100.000 ký tự. Word `.doc` cần chuyển DOCX; PDF scan chưa OCR.
- File được trích xuất ở tiến trình riêng giới hạn bộ nhớ/thời gian. Nhập URL chỉ đọc một trang tĩnh công khai, không crawl toàn website, không đọc trang cần đăng nhập/JavaScript.
- Nhập nguồn tạo nháp. Chỉ nội dung đã xuất bản được AI dùng; sửa nháp không thay đổi phiên bản đã xuất bản.
- `AI_BASE_URL`, `AI_API_KEY`, `AI_CHAT_MODEL`: API chat tương thích OpenAI hỗ trợ JSON response. Nếu dùng semantic retrieval, thêm `AI_EMBEDDING_MODEL`, `AI_EMBEDDING_DIMENSIONS`. Nhà cung cấp phải hỗ trợ tham số dimensions; có thể dùng provider khác cho chat qua adapter sau này. Khi đổi embedding model/dimension/endpoint, xuất bản lại mọi nguồn để lập chỉ mục; ứng dụng không trộn chỉ mục khác cấu hình.
- Không cấu hình embedding thì dùng tìm kiếm từ khóa bảo thủ. Chỉ mục vector hiện tìm chính xác, chưa có ANN index cố định kích thước; cân nhắc thêm index khi quy mô tăng.
- Không bảo đảm AI đúng tuyệt đối. Nguồn phải chính xác, không mâu thuẫn, cập nhật giá/chính sách kịp thời. Yêu cầu người thật/đơn hàng/tồn kho/thiếu căn cứ được chuyển nhân viên. Một số câu hỏi giá/chính sách được trích nguyên văn nguồn thay vì sinh tự do.
- Nội dung khách và các đoạn kiến thức liên quan gửi tới nhà cung cấp AI khi gọi dịch vụ; cần có chính sách dữ liệu phù hợp và thông báo cho khách/nhân viên. Chưa tích hợp đơn hàng hoặc tồn kho thời gian thực.

## Tiếp quản và độ tin cậy
- **Tiếp quản** dừng AI cuộc trò chuyện; **Bật lại AI** là thao tác chủ động. Gửi tay cũng chuyển trạng thái nhân viên.
- Nếu Meta đã nhận tin trước khi thao tác tiếp quản hoàn thành thì không thể thu hồi. Worker khóa ranh giới gửi để không gửi lượt AI cũ sau khi đã xác nhận tiếp quản.
- Webhook được lưu PostgreSQL trước khi xác nhận; worker xử lý và chống tin trùng. Redis dùng tác vụ AI/cập nhật trực tiếp; polling worker khôi phục enqueue AI bị lỡ.
- Tin gửi có idempotency phía ứng dụng. Messenger không được giả định hỗ trợ khóa này: lỗi mạng không rõ kết quả hoặc worker dừng trong lúc gửi được đánh dấu `UNCERTAIN`, không tự gửi lại. Kiểm tra Facebook trước khi gửi một tin mới.
- Trình duyệt có SSE và tải lại dự phòng khi mất kết nối. Thông báo trình duyệt cần cấp quyền và chỉ hoạt động khi web còn mở. Không có push nền/service worker trong bản đầu.

## Production
```bash
set -a; . ./.env; set +a
pnpm build
pnpm start
# chạy worker bằng process manager riêng, cwd phải là thư mục dự án
pnpm worker
```
Reverse proxy HTTPS phải giữ SSE (không buffering, timeout dài), giới hạn request upload <=9 MB, giới hạn tần suất đăng nhập/API theo IP; không công khai cổng PostgreSQL/Redis. Đặt mật khẩu DB khác ví dụ, sao lưu DB và khóa mã hóa riêng. Worker chạy từ thư mục dự án, cần giữ `src/lib/extract-child.cjs` và các dependency trích xuất khi đóng gói. CSP cho phép tải font `Be Vietnam Pro` từ `fonts.googleapis.com`/`fonts.gstatic.com`; nếu máy chủ không có Internet, giao diện tự dùng font hệ thống, không ảnh hưởng chức năng.

`RETENTION_DAYS=0` mặc định giữ dữ liệu. Đặt >=7 chủ động để dọn hội thoại đã xử lý không hoạt động quá hạn, webhook đã xử lý và nhật ký cũ. Xóa nội bộ không xóa bản sao ở Meta/nhà cung cấp AI. Chuẩn bị trang chính sách quyền riêng tư, quy trình/xác nhận xóa dữ liệu và các URL Meta yêu cầu trước App Review; ứng dụng chưa tự công bố các trang pháp lý cho doanh nghiệp.

## Kiểm thử
```bash
pnpm test # unit; integration skipped unless explicitly enabled
pnpm exec tsc --noEmit --incremental false
pnpm build
```
Integration ghi dữ liệu `test-*` và xóa fixture. **Chỉ chạy trên DB kiểm thử riêng**, không dùng production:
```bash
DATABASE_URL=postgresql://pageflow:pageflow@localhost:55432/pageflow \
REDIS_URL=redis://localhost:56379 RUN_DB_TESTS=true pnpm test
```
Kiểm thử Chrome (cần Chrome tại `/usr/bin/google-chrome`, hoặc đặt `CHROME_PATH`):
```bash
DATABASE_URL=postgresql://pageflow:pageflow@localhost:55432/pageflow \
REDIS_URL=redis://localhost:56379 RUN_DB_TESTS=true pnpm test:e2e
```
Playwright tự chạy web tạm ở http://localhost:3300 và tắt khi xong, không thay thế ứng dụng khác. Ảnh kiểm thử lưu trong `artifacts/`.

Các test worker mock Meta/queue; test API dùng cookie mock. Không thay thế thử trình duyệt hoặc kiểm thử Meta thật. Cần tự nghiệm thu Page test: nhận tin, trả lời thủ công, AI, tiếp quản trong lúc tạo câu trả lời, mất quyền/token và lỗi kết nối trước khi vận hành.
