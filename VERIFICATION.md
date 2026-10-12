# Kết quả kiểm thử PageFlow

> Mục "Đã xác minh trên môi trường cục bộ" dưới đây là bản ghi của **lần xác minh đầu tiên**. Số liệu mới nhất nằm ở các mục **Bổ sung** cuối file (hiện tại: 69 ca unit, 7 luồng Playwright).

## Đã xác minh trên môi trường cục bộ
- Prisma schema hợp lệ, generate client thành công.
- Migration tạo bảng + pgvector và các migration độ tin cậy đã áp dụng thành công vào PostgreSQL kiểm thử riêng.
- TypeScript strict check đạt.
- Next.js production build đạt, đủ route web/API.
- Vitest: 31/31 ca đạt trên PostgreSQL kiểm thử. Lệnh mặc định `pnpm test` chỉ chạy 7 ca; `RUN_DB_TESTS=true` mở 29 ca, và 2 ca xóa-tài-khoản trong `tests/setup.test.ts` cần thêm `RUN_SETUP_TESTS=true` (xem README mục Kiểm thử). Nền tảng hiện có: hash/mã hóa/chữ ký webhook, cửa sổ gửi và phiên AI, chặn IP nội bộ, nhập TXT/tệp giả, phân trang 121 hội thoại, quyền Page, nguồn nháp/xuất bản, AI lặp đồng thời, webhook lặp/echo, hủy gửi cũ, lỗi gửi chưa rõ, cập nhật kiến thức, tin đến trễ chưa đọc, CSRF/session, API đăng nhập/tiếp quản/idempotency.
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

## Bổ sung 2026-10-12 — xử lý sự kiện webhook lỗi, ranh giới gửi và index

Rà soát độc lập mã nguồn phát hiện ba vấn đề vận hành; đã sửa và kiểm chứng lại.

### Đã sửa
- **Sự kiện webhook `FAILED` chặn AI vĩnh viễn.** Trước đây sự kiện lỗi chặn mọi lượt AI của Page (`src/lib/outbound.ts`) nhưng không có cách xử lý nào. Nay có mục **Cài đặt → Sự kiện webhook lỗi**: *Phát lại* (đưa về `PENDING`, bộ đếm về 0 để worker thử lại) hoặc *Bỏ qua* (`IGNORED`, không còn chặn AI). Cả hai ghi nhật ký, chỉ quản trị viên, và dùng cập nhật có điều kiện trên `state` nên hai người không phát lại trùng được.
- **Lời gọi Meta nằm trong transaction cơ sở dữ liệu.** `sendMeta` (timeout 15 giây) trước đây chạy trong `$transaction` đang giữ advisory lock Page + hội thoại, ghim một kết nối và chặn tiếp quản tới 15 giây mỗi lần gửi. Nay `src/lib/outbound.ts` chia ba pha: kiểm tra ranh giới dưới khóa rồi commit, gọi Meta khi không giữ transaction/khóa, ghi kết quả trong transaction ngắn. Để giữ nguyên cam kết "tiếp quản rồi thì không còn lượt AI cũ", `waitForAiSends` cho tiếp quản chờ lượt AI đang gửi (tối đa 20 giây, dài hơn timeout 15 giây của Meta); quá hạn thì tiếp quản vẫn tiếp tục và README ghi rõ hệ quả.
- **Thiếu index cho hai vòng poll 1 giây.** Thêm `OutboundJob(state, nextAt)` và `WebhookEvent(state, createdAt)` trong migration `20261012154552_worker_poll_indexes`; đã áp dụng lên DB dev và DB kiểm thử.
- **Lỗi chuỗi thoát** ở `src/lib/ai.ts`: nhánh trích nguyên văn cho câu hỏi giá/chính sách in ra `\n` literal thay vì xuống dòng.
- **Tài liệu và hạ tầng kiểm thử:** `docker-compose.yml` thêm `postgres-test`/`redis-test` (profile `test`, dữ liệu tmpfs) đúng các cổng 55432/56379 mà README yêu cầu; README ghi rõ `RUN_DB_TESTS` chỉ mở 29/31 ca và `RUN_SETUP_TESTS` là cờ riêng cho 2 ca xóa-tài-khoản, kèm giải thích `DEMO_MODE` chỉ dùng cho seed.

### Đã chạy lại và xác minh
- `pnpm exec tsc --noEmit --incremental false`: đạt.
- `pnpm build`: đạt (18 route + 3 page).
- Vitest trên DB kiểm thử dựng mới bằng `docker compose --profile test up -d`: **36/36 ca đạt** (31 ca cũ + 5 ca mới trong `tests/maintenance.test.ts`). Lệnh mặc định `pnpm test` vẫn chỉ chạy 7 ca.
- 5 ca mới phủ: chờ lượt AI đang gửi; tiếp quản chỉ xác nhận sau khi lượt gửi kết thúc; sự kiện lỗi chặn AI rồi phát lại; bỏ qua sự kiện lỗi; phân quyền quản trị viên và ghi nhật ký cho hai thao tác.
- Playwright: **6/6 luồng đạt** trên DB kiểm thử mới, sau khi thay đổi trang Cài đặt.
- Kiểm tra thủ công trên trình duyệt thật: mục "Sự kiện webhook lỗi" hiển thị đúng Page, số lần thử, thông báo lỗi; bấm *Phát lại* đưa sự kiện khỏi danh sách và hiện thông báo thành công.

### Vẫn chưa xác minh
- Không thay đổi các mục "Chưa được xác minh bằng dịch vụ thật" và "Giới hạn vận hành" bên trên: OAuth/quyền/đăng ký webhook và gửi–nhận Messenger trên Meta App thật, model AI thật, tải sản xuất, sao lưu/phục hồi.
- Chưa xác minh hành vi chờ 20 giây của tiếp quản dưới tải thật khi Meta phản hồi chậm; chỉ kiểm chứng bằng test mô phỏng lượt gửi đang dở.

## Bổ sung 2026-10-12 (lần 2) — giới hạn tần suất, đối soát tin gửi, ranh giới lỗi

### Đã sửa
- **Race trong bộ đếm tần suất.** `enforceRateLimit` cũ đọc-rồi-ghi trong transaction nên nhiều yêu cầu đồng thời có thể vượt ngưỡng. Nay dùng **một câu lệnh ghi nguyên tử** (`INSERT … ON CONFLICT DO UPDATE … RETURNING`) trong `src/lib/rate-limit.ts`; `accounts.ts` re-export để không phá vỡ API cũ.
- **Thêm giới hạn cho endpoint đắt tiền:** login theo địa chỉ gọi tới (`LOGIN_IP_RATE_LIMIT`, mặc định 30/15 phút) bên cạnh giới hạn theo tên đăng nhập; sandbox AI (`AI_TEST_RATE_LIMIT`, 30/5 phút); gửi tin thủ công (`SEND_RATE_LIMIT`, 60/5 phút). Địa chỉ lấy từ `x-forwarded-for`/`x-real-ip` có kiểm tra định dạng, không hợp lệ thì gộp vào nhóm `unknown`.
- **Race khi tạo/xóa thành viên và đổi tên đăng nhập:** `createMember`, `updateOwnProfile` và `deleteMember` nay chạy trong transaction có advisory lock, nên hai thao tác đồng thời trả 409 rõ ràng thay vì lỗi unique-constraint, và hai quản trị viên không thể xóa nhau để còn 0 admin.
- **Giới hạn kết nối SSE:** `SSE_MAX_CONNECTIONS` (mặc định 200) trên mỗi tiến trình web; vượt giới hạn trả 503 trước khi mở subscriber Redis, bộ đếm được giải phóng trên mọi đường đóng (abort, cancel, lỗi Redis, mất phiên).
- **CSP:** production bỏ `'unsafe-eval'` (chỉ dev giữ cho HMR); `'unsafe-inline'` vẫn giữ.
- **Ranh giới lỗi toàn cục:** thêm `src/app/error.tsx` (nút *Thử lại*, không lộ stack), `src/app/not-found.tsx`, `src/app/loading.tsx`.
- **Đối soát tin gửi:** `src/lib/reconciliation.ts` + mục **Cài đặt → Tin gửi cần đối soát** để *Gửi lại* (có hộp xác nhận, cảnh báo riêng cho `UNCERTAIN`) hoặc *Bỏ qua* (`DISMISSED`) tin `FAILED`/`UNCERTAIN`, kèm nhật ký `send.retry`/`send.dismiss`.

### Đã chạy lại và xác minh
- `pnpm exec tsc --noEmit --incremental false`: đạt. `pnpm build`: đạt.
- Vitest trên DB kiểm thử dựng mới bằng `docker compose --profile test up -d`: **44/44 ca đạt** (31 ca gốc + 5 ca đợt trước + 8 ca mới: 4 ca giới hạn tần suất gồm **10 yêu cầu đồng thời với ngưỡng 5 → đúng 5 qua, 5 bị chặn**, 1 ca giới hạn SSE chứng minh bộ đếm được trả lại khi ngắt kết nối, 3 ca đối soát tin gửi).
- Playwright: **6/6 luồng đạt** trên bản production (CSP không `'unsafe-eval'` vẫn chạy đúng, gồm cả đăng nhập, hộp thư và giao diện sáng/tối).
- Kiểm tra trên trình duyệt thật: mục *Tin gửi cần đối soát* hiển thị đúng khách/Page/nội dung/trạng thái/số lần thử/lỗi; hộp xác nhận *Gửi lại* hiện cảnh báo phù hợp và sau khi xác nhận tin rời danh sách.

### Vẫn chưa xác minh
- Giới hạn tần suất chưa được thử tải thật; ngưỡng mặc định là lựa chọn hợp lý, không phải kết quả đo.
- Bộ đếm SSE là **theo tiến trình**: chạy nhiều instance thì giới hạn là per-instance, không phải toàn cụm (cần bộ đếm Redis nếu muốn giới hạn chung).
- CSP không `'unsafe-eval'` mới chỉ được kiểm chứng qua Playwright trên Chrome hiện có, chưa trên trình duyệt cũ/khác.
- Trạng thái `DISMISSED` của tin gửi chưa được Báo cáo/đối soát với Meta; đây là dấu nội bộ, không thay đổi gì trên Facebook.

## Bổ sung 2026-10-12 (lần 3) — sức khỏe token, nhập liệu, ANN index

### Đã sửa
- **Sức khỏe token/quyền:** thêm `src/lib/page-health.ts` và worker kiểm tra token định kỳ (`TOKEN_CHECK_HOURS`, mặc định 6 giờ, `0` để tắt). Chỉ mã lỗi token/quyền của Graph (`TOKEN_PERMISSION_CODES = 10, 102, 190, 200, 201, 203, 463, 467` trong `src/lib/meta.ts`) mới tắt AI và đánh dấu Page `ERROR`; lỗi mạng hoặc lỗi cấu hình **không** tắt AI. Thông điệp gốc của Meta được giữ lại (cắt 200 ký tự) để chẩn đoán. `processOutbound` dùng chung bộ phân loại này thay vì chỉ 190/200. Kết nối lại Page sẽ đặt lại mốc kiểm tra.
- **Nhập liệu:** nội dung vượt 100.000 ký tự bị **từ chối** ở cả đường tệp và đường URL (trước đây URL bị cắt âm thầm); chỉ nhận URL **HTTPS** (bỏ `http:`, và vì chỉ còn HTTPS nên cổng chỉ nhận `443`); `.md`/`.csv` được nhận như văn bản UTF-8, khớp với giao diện; thông báo lỗi liệt kê đúng định dạng hỗ trợ.
- **ANN index + ràng buộc số chiều:** cột `KnowledgeChunk.embedding` cố định `vector(1536)` với index HNSW cosine (`KnowledgeChunk_embedding_hnsw_idx`). `embed()`/`retrieve()` từ chối cấu hình `AI_EMBEDDING_DIMENSIONS` khác 1536 **trước khi** gọi nhà cung cấp, thay vì ghi/tìm sai. Thêm `pnpm db:reindex` để lập chỉ mục lại toàn bộ nguồn.

### Đã chạy lại và xác minh
- `pnpm exec tsc --noEmit --incremental false`: đạt. `pnpm build`: đạt.
- Vitest trên DB kiểm thử dựng mới: **64/64 ca đạt** (44 ca của hai đợt trước không hồi quy + 20 ca mới: 7 sức khỏe token, 8 nhập liệu, 5 vector). Chạy mặc định không cờ: 15 ca chạy, 49 bỏ qua.
- Playwright: **7/7** gồm 6 luồng gốc và 1 luồng tạm xác minh hộp thoại nhập trên trình duyệt thật (tải tệp `.md` thành công, URL `http://` bị từ chối với thông báo "Chỉ nhập URL HTTPS công khai"); spec tạm đã xoá sau khi chạy.
- **Guard của migration vector được chứng minh trên DB nháp:** với một chunk `vector_dims = 3`, migration dừng bằng thông báo hướng dẫn `pnpm db:reindex`, **dữ liệu còn nguyên và kiểu cột chưa đổi** (không thay đổi một phần). Sau khi sửa dữ liệu về 1536 chiều, migration chạy thành công: `ALTER TABLE`, `CREATE INDEX`, chunk cũ được giữ.
- `pnpm db:reindex` chạy thật trên DB kiểm thử: cảnh báo đúng khi thiếu khoá AI (chế độ từ khoá), in tiến độ, tạo chunk và cập nhật `publishedAt`.
- Ghi nhận một điểm đáng chú ý khi thực thi: `checkPageTokens()` phải chạy **trước** nhánh `return` của retention trong `sweep()`, vì `RETENTION_DAYS=0` (mặc định) sẽ khiến tính năng không bao giờ chạy nếu đặt sau.

### Chưa xác minh / giới hạn mới
- **Prisma coi index HNSW là khác biệt:** đã đo bằng `prisma migrate diff --from-url … --to-schema-datamodel`: Prisma sinh `DROP INDEX "KnowledgeChunk_embedding_hnsw_idx"`. Vì vậy **không dùng `pnpm db:dev`** cho các thay đổi schema sau này; dùng `pnpm db:migrate` (deploy). Nếu buộc dùng `migrate dev`, phải xóa dòng `DROP INDEX` khỏi migration vừa sinh.
- Số chiều bị cố định 1536; đổi sang kích thước khác cần migration đổi kiểu cột rồi `pnpm db:reindex` (chưa thực hiện lần nào).
- Danh sách mã lỗi token/quyền cần đối chiếu lại tài liệu Meta khi nâng `META_GRAPH_VERSION`; chưa thử với mã lỗi thật từ Meta.
- Nhánh từ chối URL vượt 100.000 ký tự chỉ được soát bằng code, **chưa** kiểm thử tự động vì cần HTTP thật (nhánh tệp đã có test).
- Chưa đo hiệu năng thực tế của index HNSW (chưa có dữ liệu quy mô lớn) và chưa kiểm tra kế hoạch truy vấn có dùng index hay không.
- Như các đợt trước: OAuth/quyền/gửi–nhận Messenger thật, model AI thật và tải sản xuất vẫn chưa được xác minh.

## Bổ sung 2026-10-13 — khả năng truy cập, dọn code chết, Việt hoá enum hiển thị

### Đã sửa
- **Trạng thái chọn cho trình đọc màn hình:** điều hướng (rail, không gian chung, bộ lọc, danh sách Page) có `aria-current`; nhóm chuyển nội dung (lọc hội thoại, tab chi tiết) dùng `role="tablist"` + `role="tab"` + `aria-selected` kèm `role="tabpanel"`; chế độ soạn tin dùng `aria-pressed`. Mỗi vùng điều hướng có tên riêng nên không bị đọc trùng.
- **Ô tìm kiếm hội thoại** không còn bọc `<button>` bên trong `<label>` (đổi `<label>` → `<div>`, input vẫn có `aria-label`).
- **Đăng xuất có xác nhận:** cả hai nút đăng xuất mở hộp thoại xác nhận dùng lại `Modal` sẵn có (focus trap, Esc).
- **Dọn code chết:** bỏ listener SSE `addEventListener('data', …)` (server chỉ phát sự kiện `message`); bỏ 2 nhánh trạng thái `QUEUED`/`DEMO` mà backend không bao giờ tạo; sửa selector CSS chết `.modal-card` → `.modal`; thêm `:focus-visible` cho `select` và checkbox.
- **Việt hoá mã hiển thị** tập trung tại `src/components/labels.ts`: quyết định AI (`ANSWER`/`NEEDS_HUMAN`), trạng thái kết nối Page, trạng thái tin nhắn (gồm `DISMISSED` do đợt P1 thêm, trước đó hiện nguyên mã), và 27 mã hành động trong nhật ký. Giá trị lạ giữ nguyên để còn chẩn đoán.
- `Empty` nhận prop `icon` tuỳ chọn để dùng đúng biểu tượng theo ngữ cảnh (mặc định vẫn là hộp thư).

### Đã chạy lại và xác minh
- `pnpm exec tsc --noEmit --incremental false`: đạt. `pnpm build`: đạt.
- Vitest trên DB kiểm thử: **69/69 ca đạt** (64 ca của ba đợt trước không hồi quy + 5 ca mới cho bảng nhãn). Chạy mặc định không cờ: 20 ca chạy, 49 bỏ qua.
- Playwright: **7/7** — 6 luồng gốc (trong đó `account.spec.ts` đã cập nhật cho luồng đăng xuất có xác nhận) + 1 luồng a11y mới kiểm: hai vùng điều hướng có tên khác nhau; `aria-current="page"` chuyển đúng khi đổi khu vực; bộ lọc có đúng một `aria-current="true"`; tablist có đúng một `aria-selected` và đổi khi bấm tab khác, kèm `tabpanel` tương ứng; ô tìm kiếm là `div` và nút xoá không nằm trong `label`; tab chi tiết chuyển `aria-selected`; chế độ soạn dùng `aria-pressed`; hộp thoại đăng xuất hiện và nút Hủy giữ nguyên phiên; không có lỗi runtime.
- **Không đổi role của các nút điều hướng chính** (vẫn là `<button>`) vì `theme.spec.ts`/`inbox.spec.ts` đang truy vấn chúng bằng `getByRole('button', …)`; đã chạy lại toàn bộ 6 luồng cũ để xác nhận không hồi quy.
- Soát bằng mắt ảnh chụp `artifacts/theme-light-inbox.png` (đối chiếu với ảnh chụp trước khi sửa) và `artifacts/a11y-inbox.png`: bố cục ô tìm kiếm và nhóm tab không thay đổi.

### Vẫn chưa xác minh / giới hạn
- **Viền focus của `select` và checkbox (`:focus-visible`) chỉ được soát bằng CSS**, không có test tự động: focus bằng lập trình dễ gây flaky trong môi trường headless.
- Không chạy công cụ a11y tự động (axe) và không có baseline visual regression; các assert trên chỉ kiểm thuộc tính ARIA mà test chủ động đặt ra, không thay thế đánh giá của người dùng cuối (đặc biệt với NVDA/VoiceOver thật).
- Việc đổi `<label>` → `<div>` ở ô tìm kiếm chỉ được kiểm bằng ảnh chụp ở hai chế độ sáng/tối, không kiểm trên trình duyệt cũ.
- Như các đợt trước: OAuth/quyền/gửi–nhận Messenger thật, model AI thật và tải sản xuất vẫn chưa được xác minh.

## Bổ sung 2026-10-13 (lần 4) — ngắt kết nối Page, receipt đến sớm, SSE toàn cụm, chuẩn bị production

### Đã sửa
- **Ngắt kết nối Page:** `POST /api/pages {action:'disconnect'}` (quản trị viên) huỷ đăng ký webhook ở Meta **trước** khi xoá token (best-effort; lỗi thì ghi `lastError`), rồi xoá token, tắt AI, chuyển `DISCONNECTED`, tăng `version` các hội thoại `AI_ACTIVE` để lượt AI đang chờ không gửi, ghi nhật ký `page.disconnect`. Page demo bị từ chối. Giao diện có nút + hộp xác nhận nêu rõ hệ quả.
- **Bỏ affordance giả:** khối "Không gian làm việc" không còn icon dropdown (sản phẩm chỉ có một không gian nội bộ).
- **Ẩn email đồng nghiệp với nhân viên:** `/api/bootstrap` chỉ trả `email` trong `members` cho vai trò quản trị viên; email của chính người đăng nhập vẫn còn.
- **Đối soát receipt đến sớm:** thêm bảng `PendingReceipt`. Receipt delivery/read khớp 0 dòng được lưu lại (chống trùng bằng `key`), rồi được áp lại ngay sau khi pha 2 của `processOutbound` ghi `metaId`/`sentAt`, và được worker quét lại mỗi sweep; receipt quá 7 ngày bị dọn; xoá Page thì xoá kèm (cascade).
- **Giới hạn SSE toàn cụm:** hạn mức kết nối SSE chuyển sang sorted set Redis (`pageflow:sse-connections`, cửa sổ 90 giây) để nhiều instance dùng chung một hạn mức; nếu Redis lỗi thì tự lùi về bộ đếm trong tiến trình.
- **Chuẩn bị production:** thêm [deploy/nginx.conf.example](deploy/nginx.conf.example) (SSE không đệm, giới hạn upload 9 MB, **ghi đè** `X-Forwarded-For`), README có mục "Sao lưu và phục hồi" và "Nghiệm thu trước khi vận hành".

### Lỗi thật phát hiện khi kiểm chứng (đã sửa)
Hai trong bốn ca test SSE thất bại: **kết nối SSE đầu tiên của một tiến trình mới luôn lùi về bộ đếm in-memory**. Nguyên nhân: producer ioredis dùng `enableOfflineQueue: false`, nên lệnh đầu tiên khi client chưa `ready` bị từ chối ngay. Hệ quả thực tế: hạn mức toàn cụm không có hiệu lực cho các kết nối đầu tiên và **`notify` đầu tiên sau khi khởi động bị mất**. Đã sửa bằng cách chờ ngắn cho client sẵn sàng (`whenReady`) trong `acquireSseSlot`/`refreshSseSlot`/`releaseSseSlot`/`notify`. Trước khi sửa: 2/4 ca đạt; sau khi sửa: 4/4.

### Đã chạy lại và xác minh
- `pnpm exec tsc --noEmit --incremental false` đạt; `pnpm build` đạt.
- Vitest: **83/83 ca đạt** (69 ca của ba đợt trước không hồi quy + 14 ca mới: 4 ngắt kết nối Page, 6 receipt đến sớm, 1 ẩn email, 3 SSE toàn cụm).
- Playwright: **7/7** (không hồi quy sau khi bỏ dropdown giả và thêm nút ngắt kết nối).
- Migration: 10 migration áp sạch trên DB dev và DB test trắng. **`prisma migrate dev` tự sinh `DROP INDEX "KnowledgeChunk_embedding_hnsw_idx"`** trong migration mới (vì index HNSW không diễn đạt được trong schema) — đã gỡ dòng đó **có chủ ý** và xác nhận index còn nguyên sau khi áp.
- **Thử tải ngưỡng giới hạn:** 40 yêu cầu đăng nhập song song (20 luồng, identifier khác nhau, DB test sạch bộ đếm) → đúng **30 lần 401 rồi 10 lần 429**, không có mã 5xx. Sau đó đã dọn bộ đếm.
- **Sao lưu/phục hồi chạy thật:** `pg_dump -Fc` (34 KB) → `pg_restore` vào DB tạm: 0 lỗi, 19 bảng + 10 migration + index HNSW khớp bản nguồn; DB tạm đã xoá.

### Chưa xác minh / giới hạn
- **Chưa chạy với Meta App/Page thật và nhà cung cấp AI thật** (không có credential trong môi trường này) — checklist trong README là để bạn tự nghiệm thu.
- `deploy/nginx.conf.example` **chưa từng được chạy** (không có nginx ở đây).
- Nhánh dự phòng in-memory của SSE được kiểm bằng test mô phỏng (mock `acquireSseSlot` ném lỗi), **chưa** thử bằng cách tắt Redis thật; `refreshSseSlot` trong heartbeat 20 giây và TTL 90 giây thật chưa có test (chỉ mô phỏng bằng score cũ).
- Sao lưu/phục hồi mới chạy với DB gần như trống: chứng minh schema + migration khôi phục đúng, **không** chứng minh thời gian phục hồi hay dữ liệu quy mô lớn.
- `prunePendingReceipts` không chặn giá trị `retentionDays <= 0` (mặc định 7 nên an toàn).
- **Nhóm 2 vẫn hoãn:** OCR PDF scan, kênh khác (bình luận/Instagram/WhatsApp), CRM/đơn hàng/tồn kho, nhập lịch sử Messenger cũ, `HUMAN_AGENT`/marketing, push nền, trang chính sách quyền riêng tư — cần quyết định kinh doanh, tài nguyên ngoài, hoặc nội dung pháp lý do bạn cung cấp.
