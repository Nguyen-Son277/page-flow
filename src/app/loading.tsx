import { Loading } from '@/components/ui';

export default function LoadingPage() {
  return (
    <div className="section-page">
      <div className="surface">
        <Loading label="Đang tải trang…" />
      </div>
    </div>
  );
}
