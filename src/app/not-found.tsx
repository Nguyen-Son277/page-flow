import Link from 'next/link';
import { SearchX } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="section-page">
      <div className="surface">
        <div className="empty-state">
          <span className="empty-icon"><SearchX size={28} /></span>
          <h3>Không tìm thấy trang</h3>
          <p>Đường dẫn bạn truy cập không tồn tại hoặc đã được thay đổi.</p>
          <Link className="button primary" href="/">Về trang chủ</Link>
        </div>
      </div>
    </div>
  );
}
