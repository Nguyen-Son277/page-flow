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

`DEMO_MODE` **chỉ** điều khiển `pnpm demo:seed` (và bật trong cấu hình Playwright); mã trong `src/` không đọc biến này. Hành vi mô phỏng của giao diện theo cột `Page.demo` trong cơ sở dữ liệu, nên đặt `DEMO_MODE=false` **không** tắt chế độ demo của một Page đã tạo bằng seed. Muốn một Page ngừng mô phỏng, hãy kết nối Page thật hoặc xóa Page demo đó.

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

## Khả năng truy cập
- Mục đang chọn được thông báo cho trình đọc màn hình: điều hướng dùng `aria-current` (`page` cho khu vực chính, `true` cho bộ lọc và danh sách Page), nhóm chuyển nội dung dùng `role="tablist"` + `role="tab"` + `aria-selected` kèm `role="tabpanel"`, chế độ soạn tin dùng `aria-pressed`.
- Các vùng điều hướng có tên riêng ("Điều hướng nhanh", "Không gian chung", "Bộ lọc hội thoại", "Facebook Pages") nên không bị đọc trùng lặp.
- Ô tìm kiếm hội thoại không còn bọc nút xoá bên trong `<label>`; nút xoá là điều khiển riêng.
- `button`, `a`, `select` và checkbox đều có viền focus khi dùng bàn phím (`:focus-visible`).
- Đăng xuất luôn hỏi xác nhận trước khi kết thúc phiên.
- Mọi mã tiếng Anh của API hiển thị lên giao diện (quyết định AI, trạng thái kết nối Page, trạng thái tin nhắn, mã hành động trong nhật ký) được ánh xạ sang tiếng Việt tại [labels.ts](src/components/labels.ts); giá trị lạ được giữ nguyên để còn chẩn đoán.
- **Chưa có:** công cụ kiểm tra a11y tự động (axe) và baseline visual regression. Test tự động chỉ kiểm các thuộc tính ARIA nêu trên, không thay thế đánh giá của người dùng cuối.

## Kết nối Facebook thật
1. Triển khai web/worker trên máy chủ, dùng tên miền HTTPS công khai. Đặt `APP_URL` chính xác (không dấu `/` cuối). Không dùng localhost cho callback production.
2. Giữ `TOKEN_ENCRYPTION_KEY` (tạo bằng `openssl rand -hex 32`) trong secret manager hoặc môi trường máy chủ. Trong **Cài đặt → Thông tin kết nối Meta & AI**, quản trị viên nhập App ID, App Secret, Verify Token và Graph API version. Secret được mã hóa AES-256-GCM trong DB; để trống trường secret khi sửa sẽ giữ giá trị cũ. Không mất khóa gốc: mất khóa sẽ không giải mã được các secret đã lưu và token Page.
3. Xác định phiên bản Graph API đang được Meta hỗ trợ và nhập dạng `vXX.X` (thay `XX.X` bằng số phiên bản thật) trong Cài đặt. Không có phiên bản mặc định nhằm tránh vô tình dùng API lỗi thời.
4. Trong Meta App hiện có, cấu hình Messenger, Webhooks cho object Page, URL `https://ten-mien/api/meta/webhook`, verify token; callback OAuth `https://ten-mien/api/meta/callback`, tên miền và redirect URI hợp lệ. Trang **Cài đặt** chỉ hiển thị **Đã cấu hình** khi đủ App ID, App Secret, Verify Token và Graph version hợp lệ. Nếu còn trống, OAuth bị từ chối với thông báo chưa cấu hình Meta App — đây là trạng thái cấu hình, không phải lỗi xét duyệt App của Meta.
5. Xác minh quyền phù hợp với use case, dự kiến `pages_show_list`, `pages_messaging`, `pages_manage_metadata`; quyền/Advanced Access, Business Verification, App Review và chế độ Live phụ thuộc tài khoản/App. Đối chiếu tài liệu chính thức trước production: https://developers.facebook.com/docs/messenger-platform/ và https://developers.facebook.com/docs/messenger-platform/webhooks/ . Các đường dẫn Meta có thể chuyển sang cấu trúc documentation mới.
6. Trong Facebook Pages chọn **Kết nối Facebook**, cấp quyền với tài khoản có quyền Page, chọn đúng Page cần quản lý. Mỗi tài khoản quản trị khác có thể cấp thêm Page theo lượt kết nối. Ứng dụng không lưu mật khẩu Facebook.
7. Giữ `META_SEND_ENABLED=false` khi kiểm tra webhook nhận tin. Sau khi quyền và chính sách gửi được xác minh, bật biến này, khởi động lại web/worker, thử trả lời thủ công trên Page test. Hiện ứng dụng chỉ gửi `RESPONSE` trong 24 giờ kể từ tin khách, không triển khai nhãn HUMAN_AGENT/marketing để mở rộng cửa sổ.
8. Cấu hình AI, xuất bản và thử kiến thức từng Page, sau đó mới bật AI từng Page. Khi kết nối lại, AI Page được tắt để kiểm tra lại.
9. **Sức khỏe token:** worker định kỳ kiểm tra token của từng Page đã kết nối (`TOKEN_CHECK_HOURS`, mặc định 6 giờ; đặt `0` để tắt). Nếu Meta trả mã lỗi token/quyền (ví dụ 190, 102, 463, 10, 200), Page chuyển `ERROR`, AI bị tắt và `lastError` ghi lại chi tiết từ Meta. Lỗi mạng hoặc lỗi cấu hình không làm tắt AI. Token cũng bị phát hiện ngay khi gửi tin thất bại. Ứng dụng **không tự bật lại AI**: sau khi sửa quyền, hãy kết nối lại Page rồi bật AI theo cách thủ công.

Chỉ nhận tin từ khi webhook được đăng ký; chưa nhập đầy đủ lịch sử Messenger cũ. Tên khách ban đầu là định danh rút gọn PSID vì không mặc định có quyền lấy hồ sơ khách. Page thuộc những tài khoản khác nhau cùng nằm trong một không gian nội bộ, không phải SaaS đa doanh nghiệp.

## Kho kiến thức và AI
- Nhập nội dung/FAQ/bảng giá; tài liệu TXT, MD, CSV, DOCX, PDF có văn bản tối đa 8 MB, 100.000 ký tự. Word `.doc` cần chuyển DOCX; PDF scan chưa OCR.
- File được trích xuất ở tiến trình riêng giới hạn bộ nhớ/thời gian. Nhập URL chỉ đọc **một trang tĩnh công khai qua HTTPS** (không nhận `http:`), không crawl toàn website, không đọc trang cần đăng nhập/JavaScript.
- Nội dung vượt 100.000 ký tự bị **từ chối** ở cả hai đường (tệp và URL) kèm thông báo; ứng dụng không cắt âm thầm.
- Nhập nguồn tạo nháp. Chỉ nội dung đã xuất bản được AI dùng; sửa nháp không thay đổi phiên bản đã xuất bản.
- Trong **Cài đặt → Thông tin kết nối Meta & AI**, quản trị viên nhập URL/model/API key cho LLM và embedding. API tương thích OpenAI cần hỗ trợ JSON response; nhà cung cấp embedding cần hỗ trợ tham số dimensions. URL phải dùng HTTPS (chỉ cho phép localhost HTTP khi phát triển). Các biến `AI_*` trong môi trường vẫn được dùng làm fallback khi DB chưa có giá trị. Khi đổi embedding model/dimension/endpoint, xuất bản lại mọi nguồn để lập chỉ mục; ứng dụng không trộn chỉ mục khác cấu hình.
- Không cấu hình embedding thì dùng tìm kiếm từ khóa bảo thủ. Khi dùng embedding, cột vector **cố định 1536 chiều** (nhập `1536` trong Cài đặt) vì index HNSW của pgvector yêu cầu khai báo số chiều; đặt giá trị khác sẽ bị từ chối ngay bằng thông báo rõ ràng thay vì ghi/tìm sai. Đổi sang số chiều khác cần một migration `ALTER COLUMN "embedding" TYPE vector(N)` rồi chạy `pnpm db:reindex`.
- `pnpm db:reindex` lập chỉ mục lại toàn bộ nguồn tri thức (tách đoạn + tạo embedding + cập nhật chỉ mục). Dùng sau khi đổi model/endpoint embedding, sau khi đổi số chiều, hoặc khi migration vector báo còn dữ liệu sai số chiều. Nếu thiếu `AI_API_KEY`, script chỉ tạo lại đoạn văn bản và cảnh báo rằng chỉ mục vector không được tạo.
- **Lưu ý vận hành Prisma:** index HNSW không diễn đạt được trong `schema.prisma`, nên `prisma migrate diff` coi nó là khác biệt và `pnpm db:dev` (`migrate dev`) sẽ đề nghị `DROP INDEX "KnowledgeChunk_embedding_hnsw_idx"`. Không áp dụng đề nghị đó: dùng `pnpm db:migrate` (`migrate deploy`) cho mọi thay đổi schema. Nếu buộc phải dùng `migrate dev`, hãy xóa dòng `DROP INDEX` khỏi migration vừa sinh trước khi áp dụng.
- Không bảo đảm AI đúng tuyệt đối. Nguồn phải chính xác, không mâu thuẫn, cập nhật giá/chính sách kịp thời. Yêu cầu người thật/đơn hàng/tồn kho/thiếu căn cứ được chuyển nhân viên. Một số câu hỏi giá/chính sách được trích nguyên văn nguồn thay vì sinh tự do.
- Nội dung khách và các đoạn kiến thức liên quan gửi tới nhà cung cấp AI khi gọi dịch vụ; cần có chính sách dữ liệu phù hợp và thông báo cho khách/nhân viên. Chưa tích hợp đơn hàng hoặc tồn kho thời gian thực.

## Tiếp quản và độ tin cậy
- **Tiếp quản** dừng AI cuộc trò chuyện; **Bật lại AI** là thao tác chủ động. Gửi tay cũng chuyển trạng thái nhân viên.
- Nếu Meta đã nhận tin trước khi thao tác tiếp quản hoàn thành thì không thể thu hồi. Worker kiểm tra ranh giới gửi dưới khóa advisory của cơ sở dữ liệu trước khi gọi Meta; nếu một lượt AI đang gửi dở, **tiếp quản chờ lượt đó kết thúc (tối đa 20 giây, dài hơn timeout 15 giây của Meta)** rồi mới xác nhận. Quá 20 giây, tiếp quản vẫn tiếp tục để người thật không bị chặn, và lượt AI cũ có thể đã tới Meta. Lời gọi Meta không nằm trong transaction cơ sở dữ liệu nên không giữ kết nối/khóa trong lúc chờ mạng.
- Webhook được lưu PostgreSQL trước khi xác nhận; worker xử lý và chống tin trùng. Redis dùng tác vụ AI/cập nhật trực tiếp; polling worker khôi phục enqueue AI bị lỡ.
- Tin gửi có idempotency phía ứng dụng. Messenger không được giả định hỗ trợ khóa này: lỗi mạng không rõ kết quả hoặc worker dừng trong lúc gửi được đánh dấu `UNCERTAIN`, không tự gửi lại. Kiểm tra Facebook trước khi gửi một tin mới.
- Trình duyệt có SSE và tải lại dự phòng khi mất kết nối. Thông báo trình duyệt cần cấp quyền và chỉ hoạt động khi web còn mở. Không có push nền/service worker trong bản đầu.
- **Sự kiện webhook lỗi:** sau 5 lần thử, sự kiện chuyển `FAILED` và **AI của Page đó tạm dừng gửi** để không trả lời trên trạng thái cũ. Quản trị viên xử lý trong **Cài đặt → Sự kiện webhook lỗi**: *Phát lại* đưa sự kiện về hàng đợi cho worker thử lại (bộ đếm về 0), hoặc *Bỏ qua* (`IGNORED`) khi đã kiểm tra trên Facebook và chấp nhận mất sự kiện đó. Cả hai thao tác đều được ghi nhật ký. Gửi tin của nhân viên không bị chặn bởi sự kiện lỗi.
- **Tin gửi cần đối soát:** tin ở trạng thái `FAILED` (chắc chắn chưa tới Meta) hoặc `UNCERTAIN` (lỗi mạng, chưa rõ Meta đã nhận hay chưa) được liệt kê trong **Cài đặt → Tin gửi cần đối soát** kèm khách, Page, số lần thử và lỗi. Quản trị viên chọn *Gửi lại* (đưa về hàng đợi; có hộp xác nhận cảnh báo riêng cho `UNCERTAIN` vì tin có thể đã được gửi) hoặc *Bỏ qua* (`DISMISSED`, thôi tính vào số lỗi). Không có cơ chế tự gửi lại.

## Giới hạn tần suất và tài nguyên
Các giới hạn đều có giá trị mặc định hợp lý và chỉnh được bằng biến môi trường (đặt trong `.env`):

| Biến | Mặc định | Phạm vi |
|---|---|---|
| `LOGIN_IP_RATE_LIMIT` | 30 lần / 15 phút | Theo địa chỉ gọi tới, chặn dò mật khẩu rải nhiều tài khoản |
| (cố định) | 8 lần / 15 phút | Theo từng email hoặc tên đăng nhập |
| `AI_TEST_RATE_LIMIT` | 30 lần / 5 phút | Theo người dùng, cho sandbox `Thử phản hồi AI` (tốn tiền nhà cung cấp AI) |
| `SEND_RATE_LIMIT` | 60 lần / 5 phút | Theo người dùng, cho thao tác gửi tin thủ công |
| `SSE_MAX_CONNECTIONS` | 200 | Số kết nối SSE đồng thời **trên mỗi tiến trình web**; vượt giới hạn trả `503` |
| `TOKEN_CHECK_HOURS` | 6 | Khoảng cách giữa hai lần worker kiểm tra token của mỗi Page đã kết nối; `0` để tắt |

Bộ đếm nằm trong bảng `LoginAttempt` và được tăng bằng **một câu lệnh ghi nguyên tử**, nên nhiều yêu cầu đồng thời không thể vượt ngưỡng. Cửa sổ cố định: bắt đầu từ lần gọi đầu và tự đặt lại khi hết hạn; worker dọn các bản ghi hết hạn.

Địa chỉ gọi tới lấy từ `x-forwarded-for` (phần tử đầu) hoặc `x-real-ip`, có kiểm tra định dạng. **Giới hạn theo IP chỉ đáng tin khi reverse proxy của bạn tự ghi đè `x-forwarded-for`**; nếu không, người gọi có thể giả header. Khi không đọc được địa chỉ hợp lệ, ứng dụng dùng chung một nhóm `unknown`.

## Production
```bash
set -a; . ./.env; set +a
pnpm build
pnpm start
# chạy worker bằng process manager riêng, cwd phải là thư mục dự án
pnpm worker
```
Reverse proxy HTTPS phải giữ SSE (không buffering, timeout dài — số kết nối đồng thời bị giới hạn bởi `SSE_MAX_CONNECTIONS`), giới hạn request upload <=9 MB, và **tự ghi đè `x-forwarded-for`** để giới hạn theo IP trong ứng dụng có hiệu lực; không công khai cổng PostgreSQL/Redis. Production chạy CSP không có `'unsafe-eval'` (chỉ dev mới cần cho HMR). Đặt mật khẩu DB khác ví dụ, sao lưu DB và khóa mã hóa riêng. Worker chạy từ thư mục dự án, cần giữ `src/lib/extract-child.cjs` và các dependency trích xuất khi đóng gói. CSP cho phép tải font `Be Vietnam Pro` từ `fonts.googleapis.com`/`fonts.gstatic.com`; nếu máy chủ không có Internet, giao diện tự dùng font hệ thống, không ảnh hưởng chức năng.

`RETENTION_DAYS=0` mặc định giữ dữ liệu. Đặt >=7 chủ động để dọn hội thoại đã xử lý không hoạt động quá hạn, webhook đã xử lý và nhật ký cũ. Xóa nội bộ không xóa bản sao ở Meta/nhà cung cấp AI. Chuẩn bị trang chính sách quyền riêng tư, quy trình/xác nhận xóa dữ liệu và các URL Meta yêu cầu trước App Review; ứng dụng chưa tự công bố các trang pháp lý cho doanh nghiệp.

## Sao lưu và phục hồi
Sao lưu bằng `pg_dump` (định dạng custom, có nén):
```bash
docker compose exec -T postgres pg_dump -U pageflow -d pageflow -Fc > "pageflow-$(date +%F).dump"
```
Phục hồi thử vào một cơ sở dữ liệu **khác** trước khi bao giờ ghi đè production:
```bash
docker compose exec -T postgres dropdb  -U pageflow --if-exists pageflow_restore
docker compose exec -T postgres createdb -U pageflow pageflow_restore
docker compose exec -T postgres pg_restore -U pageflow -d pageflow_restore --no-owner < pageflow-2026-10-13.dump
docker compose exec -T postgres psql -U pageflow -d pageflow_restore -c 'select count(*) from "_prisma_migrations"'
```
- **`TOKEN_ENCRYPTION_KEY` không nằm trong bản dump.** Phải sao lưu khoá này riêng (secret manager); mất khoá nghĩa là mất toàn bộ token Page và phải kết nối lại từng Page.
- Nên sao lưu định kỳ, giữ nhiều bản, và **phục hồi thử định kỳ** chứ không chỉ tin rằng lệnh dump đã chạy xong.
- `RETENTION_DAYS >= 7` sẽ xoá dần hội thoại đã xử lý, webhook đã xong và nhật ký cũ — bản dump chỉ chứa dữ liệu còn lại tại thời điểm dump.

## Nghiệm thu trước khi vận hành
Ứng dụng **chưa từng chạy với Meta App hoặc nhà cung cấp AI thật**. Hãy chạy checklist này trên Page thật và ghi lại kết quả trước khi phục vụ khách hàng:

| # | Kiểm tra | Kỳ vọng |
|---|---|---|
| 1 | Đã đặt `META_*`, chạy `pnpm db:migrate` mới nhất, web + worker cùng chạy | Cài đặt hiển thị "Đã cấu hình"; log worker không lỗi |
| 2 | Kết nối một Page qua OAuth | Pages hiển thị "Đã kết nối"; AI mặc định tắt |
| 3 | Gửi tin thật từ một tài khoản Facebook khác | Hội thoại xuất hiện trong hộp thư, không cần tải lại trang |
| 4 | Tiếp quản rồi trả lời thủ công (đã bật `META_SEND_ENABLED=true`) | Khách nhận đúng **một** tin; không có tin trùng |
| 5 | Xuất bản tri thức, bật AI, hỏi câu có trong tri thức | AI trả lời đúng nguồn; câu ngoài phạm vi chuyển "Cần nhân viên" |
| 6 | Cấu hình AI thật (`AI_API_KEY`, `AI_CHAT_MODEL`, embedding) rồi hỏi lại | Câu trả lời có trích dẫn; kiểm tra chi phí thực tế |
| 7 | Thu hồi quyền Page trên Facebook rồi chờ vòng kiểm tra token (hoặc để khách nhắn) | Page chuyển "Lỗi kết nối", AI tắt, `lastError` nêu lý do |
| 8 | Tắt tiến trình web (chỉ để worker chạy) trong lúc khách nhắn | Tin vẫn được lưu và xử lý khi web bật lại |
| 9 | Ngắt kết nối Page rồi kết nối lại | Token cũ đã bị xoá; kết nối lại phải cấp quyền từ đầu |
| 10 | Trang chính sách quyền riêng tư và quy trình xoá dữ liệu | Meta App Review yêu cầu URL công khai — **nội dung pháp lý do bạn cung cấp**, ứng dụng không tự sinh |

## Kiểm thử
```bash
pnpm test # mặc định chỉ 7/31 ca chạy; phần còn lại cần DB kiểm thử (xem bên dưới)
pnpm exec tsc --noEmit --incremental false
pnpm build
```
Mặc định `pnpm test` **bỏ qua 63/83 ca** vì chúng cần PostgreSQL thật; 20 ca thuần hàm chạy (`tests/security.test.ts`, `tests/imports.test.ts`, `tests/labels.test.ts`). Dựng hạ tầng kiểm thử dùng-một-lần (cổng 55432/56379, tách khỏi DB dev):
```bash
docker compose --profile test up -d
DATABASE_URL=postgresql://pageflow:pageflow@localhost:55432/pageflow \
  pnpm exec prisma migrate deploy
```
Integration ghi dữ liệu `test-*` và xóa fixture. **Chỉ chạy trên DB kiểm thử riêng**, không dùng production:
```bash
DATABASE_URL=postgresql://pageflow:pageflow@localhost:55432/pageflow \
REDIS_URL=redis://localhost:56379 RUN_DB_TESTS=true pnpm test
```
`RUN_DB_TESTS=true` mở 81 ca. Hai ca còn lại trong `tests/setup.test.ts` **xóa toàn bộ tài khoản** nên phải bật thêm cờ riêng — đủ 83/83 ca:
```bash
DATABASE_URL=postgresql://pageflow:pageflow@localhost:55432/pageflow \
REDIS_URL=redis://localhost:56379 RUN_DB_TESTS=true RUN_SETUP_TESTS=true pnpm test
```
Kiểm thử Chrome (cần Chrome tại `/usr/bin/google-chrome`, hoặc đặt `CHROME_PATH`):
```bash
DATABASE_URL=postgresql://pageflow:pageflow@localhost:55432/pageflow \
REDIS_URL=redis://localhost:56379 RUN_DB_TESTS=true pnpm test:e2e
```
Playwright chạy `next start` trên bundle có sẵn — hãy `pnpm build` trước, nếu không nó kiểm thử bundle cũ. Dừng riêng hạ tầng kiểm thử (không đụng DB dev): `docker compose stop postgres-test redis-test`. Vì `postgres-test` lưu dữ liệu trên **tmpfs**, dữ liệu mất khi container dừng — sau khi `start` lại phải chạy lại bước `prisma migrate deploy` ở trên trước khi test.
Playwright tự chạy web tạm ở http://localhost:3300 và tắt khi xong, không thay thế ứng dụng khác. Ảnh kiểm thử lưu trong `artifacts/`.

Các test worker mock Meta/queue; test API dùng cookie mock. Không thay thế thử trình duyệt hoặc kiểm thử Meta thật. Cần tự nghiệm thu Page test: nhận tin, trả lời thủ công, AI, tiếp quản trong lúc tạo câu trả lời, mất quyền/token và lỗi kết nối trước khi vận hành.
