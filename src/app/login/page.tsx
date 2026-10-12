'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { ArrowRight, Bot, Check, Layers3, LoaderCircle, LockKeyhole, MessageCircle, ShieldCheck, UserPlus } from 'lucide-react';
import { ThemeToggle } from '@/components/theme';

export default function LoginPage() {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [needsSetup, setNeedsSetup] = useState(false);
  useEffect(() => {
    let active = true;
    fetch('/api/auth/setup', { cache: 'no-store' }).then(response => response.json()).then(result => { if (active) setNeedsSetup(!!result.needsSetup); }).catch(() => {});
    return () => { active = false; };
  }, []);
  async function login(event: FormEvent) {
    event.preventDefault(); setPending(true); setError('');
    try {
      const response = await fetch('/api/auth/login', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier, password }) });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(typeof result?.error === 'string' ? result.error : 'Không thể đăng nhập. Vui lòng thử lại.');
      window.location.assign('/');
    } catch (err) { setError(err instanceof TypeError ? 'Không thể kết nối máy chủ. Vui lòng kiểm tra mạng và thử lại.' : err instanceof Error ? err.message : 'Đăng nhập không thành công.'); }
    finally { setPending(false); }
  }
  return <main className="login-page">
    <ThemeToggle className="login-theme" />
    <section className="login-story">
      <a href="/" className="brand"><span className="brand-icon"><Layers3 size={24} /></span>PageFlow<span className="brand-dot">.</span></a>
      <div className="story-content"><span className="eyebrow light">MỖI HỘI THOẠI, MỘT KẾT NỐI</span><h1>Chăm sóc tốt hơn.<br /><span>Cùng nhau.</span></h1><p>Một không gian chung cho mọi Facebook Page.<br />Để AI xử lý việc lặp lại, đội ngũ tập trung vào khách hàng.</p>
        <div className="login-preview"><div className="preview-head"><span className="avatar teal"><MessageCircle size={20} /></span><div><strong>Hộp thư của đội ngũ</strong><small>AI và con người, phối hợp liền mạch</small></div><span className="online-dot" /></div><div className="preview-bubble">Mình cần tư vấn thêm về sản phẩm nhé.</div><div className="preview-bubble reply"><Bot size={16} /> Sẵn sàng hỗ trợ bạn.</div><div className="preview-foot"><Check size={15} /> Đúng thông tin · Đúng người · Đúng lúc</div><span className="demo-mini">MINH HỌA · Không phải hội thoại thật</span></div>
        <div className="story-features"><span><Layers3 size={17} /> Đa Page, một hộp thư</span><span><ShieldCheck size={17} /> Kiểm soát bởi đội ngũ</span></div>
      </div><small className="story-copyright">PAGEFLOW · WORKSPACE FOR YOUR TEAM</small>
    </section>
    <section className="login-form-panel"><div className="login-form-wrap"><span className="login-lock"><LockKeyhole size={25} /></span><h2>Chào mừng trở lại</h2><p>Đăng nhập để tiếp tục chăm sóc khách hàng.</p><form onSubmit={login}><label>Email hoặc tên đăng nhập<input type="text" autoComplete="username" placeholder="admin hoặc ban@congty.vn" required value={identifier} onChange={e => setIdentifier(e.target.value)} /></label><label>Mật khẩu<input type="password" autoComplete="current-password" placeholder="Nhập mật khẩu của bạn" required value={password} onChange={e => setPassword(e.target.value)} /></label>{error && <div className="alert error" role="alert">{error}</div>}<button className="button primary login-submit" disabled={pending}>{pending ? <LoaderCircle className="spin" size={18} /> : <>Đăng nhập <ArrowRight size={18} /></>}</button></form>{needsSetup && <div className="login-help"><UserPlus size={16} /><span>Máy chủ chưa có tài khoản nào. <a className="text-button" href="/setup">Tạo tài khoản quản trị đầu tiên</a></span></div>}<div className="login-help"><ShieldCheck size={16} /><span>Không gian nội bộ. Liên hệ quản trị viên để được cấp tài khoản hoặc đặt lại mật khẩu.</span></div></div><footer>Được xây dựng cho những cuộc trò chuyện có ý nghĩa.</footer></section>
  </main>;
}
