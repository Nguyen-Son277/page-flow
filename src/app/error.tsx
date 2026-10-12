'use client';

import { useEffect } from 'react';
import { AlertCircle } from 'lucide-react';

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Technical detail stays in the browser console, never in the user-facing UI.
    console.error(error);
  }, [error]);
  return (
    <div className="section-page">
      <div className="surface">
        <div className="surface-header"><div><AlertCircle size={17} /><h2>Đã xảy ra lỗi</h2></div></div>
        <div className="empty-state">
          <span className="empty-icon"><AlertCircle size={28} /></span>
          <h3>Thao tác chưa hoàn tất</h3>
          <p>Dữ liệu đã gửi tới Facebook không bị ảnh hưởng. Vui lòng thử lại.</p>
          <button className="button primary" onClick={() => reset()}>Thử lại</button>
        </div>
      </div>
    </div>
  );
}
