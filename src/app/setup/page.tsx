'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { ArrowRight, Layers3, LoaderCircle, ShieldCheck, UserPlus } from 'lucide-react';
import { ThemeToggle } from '@/components/theme';

export default function SetupPage() {
  const [checking, setChecking] = useState(true);
  const [allowed, setAllowed] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    fetch('/api/auth/setup', { cache: 'no-store' }).then(response => response.json()).then(result => { if (active) setAllowed(!!result.needsSetup); })
      .catch(() => { if (active) setError('Không kiểm tra được trạng thái máy chủ. Vui lòng tải lại trang.'); })
      .finally(() => { if (active) setChecking(false); });
    return () => { active = false; };
  }, []);
  async function submit(event: FormEvent) {
    event.preventDefault(); setError('');
    if (password !== confirm) { setError('Hai lần nhập mật khẩu không khớp.'); return; }
    if (password.length < 12) { setError('Mật khẩu tối thiểu 12 ký tự.'); return; }
    setPending(true);
    try {
      const response = await fetch('/api/auth/setup', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, email, username, password }) });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(typeof result?.error === 'string' ? result.error : 'Không tạo được tài khoản. Vui lòng thử lại.');
      window.location.assign('/');
    } catch (err) { setError(err instanceof TypeError ? 'Không thể kết nối máy chủ. Vui lòng thử lại.' : err instanceof Error ? err.message : 'Không tạo được tài khoản.'); }
    finally { setPending(false); }
  }
  return <main className="login-page">
    <ThemeToggle className="login-theme" />
    <section className="login-story">
      <a href="/setup" className="brand"><span className="brand-icon"><Layers3 size={24} /></span>PageFlow<span className="brand-dot">.</span></a>
      <div className="story-content"><span className="eyebrow light">BƯỚC ĐẦU TIÊN</span><h1>Tạo tài khoản<br /><span>quản trị viên.</span></h1><p>Máy chủ chưa có tài khoản nào.<br />Tài khoản này có toàn quyền cấu hình và truy cập mọi Page.</p>
        <div className="story-features"><span><UserPlus size={17} /> Tạo một lần duy nhất</span><span><ShieldCheck size={17} /> Mật khẩu tối thiểu 12 ký tự</span></div>
      </div><small className="story-copyright">PAGEFLOW · WORKSPACE FOR YOUR TEAM</small>
    </section>
    <section className="login-form-panel"><div className="login-form-wrap">{checking ? <div className="loading-state" role="status"><LoaderCircle className="spin" size={23} /><span>Đang kiểm tra máy chủ…</span></div> : !allowed ? <>
      <span className="login-lock"><ShieldCheck size={25} /></span><h2>Máy chủ đã có tài khoản</h2><p>Trang tạo tài khoản đầu tiên chỉ dùng khi chưa có người dùng nào.</p>
      <a className="button primary login-submit" href="/login">Đi tới đăng nhập <ArrowRight size={18} /></a>
      {error && <div className="alert error" role="alert">{error}</div>}
    </> : <>
      <span className="login-lock"><UserPlus size={25} /></span><h2>Tạo tài khoản quản trị</h2><p>Bạn sẽ được đăng nhập ngay sau khi tạo.</p>
      <form onSubmit={submit}>
        <label>Họ và tên<input required minLength={2} maxLength={100} value={name} onChange={event => setName(event.target.value)} autoComplete="name" placeholder="Nguyễn Minh Anh" /></label>
        <label>Email công việc<input required type="email" maxLength={200} value={email} onChange={event => setEmail(event.target.value)} autoComplete="email" placeholder="ban@congty.vn" /></label>
        <label>Tên đăng nhập<input required minLength={3} maxLength={30} value={username} onChange={event => setUsername(event.target.value.toLowerCase())} autoComplete="username" placeholder="admin" /><small>3–30 ký tự, bắt đầu bằng chữ cái. Dùng để đăng nhập nhanh.</small></label>
        <label>Mật khẩu<input required minLength={12} type="password" value={password} onChange={event => setPassword(event.target.value)} autoComplete="new-password" placeholder="Tối thiểu 12 ký tự" /></label>
        <label>Nhập lại mật khẩu<input required minLength={12} type="password" value={confirm} onChange={event => setConfirm(event.target.value)} autoComplete="new-password" /></label>
        {error && <div className="alert error" role="alert">{error}</div>}
        <button className="button primary login-submit" disabled={pending}>{pending ? <LoaderCircle className="spin" size={18} /> : <>Tạo tài khoản và vào hộp thư <ArrowRight size={18} /></>}</button>
      </form>
      <div className="login-help"><ShieldCheck size={16} /><span>Sau bước này, chỉ quản trị viên mới thêm được thành viên trong Cài đặt.</span></div>
    </>}</div><footer>Được xây dựng cho những cuộc trò chuyện có ý nghĩa.</footer></section>
  </main>;
}
