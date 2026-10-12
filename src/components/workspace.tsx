'use client';

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { AlertCircle, ArrowLeft, ArrowUpRight, Bell, BookOpen, Bot, Check, CheckCheck, CircleHelp, Command, FileText, Filter, Globe, Inbox, Layers3, LogOut, MessageCircle, MoreHorizontal, Plus, RefreshCw, Search, Send, Settings, ShieldCheck, Sparkles, StickyNote, UserRound, Users, WandSparkles, X } from 'lucide-react';
import { AccountPanel, KnowledgePanel, Modal, PagesPanel, SettingsPanel } from './workspace-panels';
import { decisionLabel, messageStateLabel } from './labels';
import { ThemeToggle } from './theme';
import { Alert, Empty, Loading, StatusBadge, errorText, fullTime, initials, post, relativeTime, request, sourcesOf, type Bootstrap, type Conversation, type ConversationList, type Detail, type Page, type User } from './ui';

type Tab = 'inbox' | 'knowledge' | 'pages' | 'settings' | 'account';
type FilterName = 'all' | 'unread' | 'needsHuman' | 'mine' | 'resolved';
const filters: { id: FilterName; label: string; icon: typeof Inbox }[] = [{ id: 'all', label: 'Tất cả hội thoại', icon: Inbox }, { id: 'unread', label: 'Chưa đọc', icon: MessageCircle }, { id: 'needsHuman', label: 'Cần nhân viên', icon: UserRound }, { id: 'mine', label: 'Của tôi', icon: Users }, { id: 'resolved', label: 'Đã xử lý', icon: CheckCheck }];
const nav: { id: Tab; label: string; icon: typeof Inbox }[] = [{ id: 'inbox', label: 'Hộp thư', icon: Inbox }, { id: 'knowledge', label: 'Tri thức AI', icon: BookOpen }, { id: 'pages', label: 'Facebook Pages', icon: Layers3 }, { id: 'settings', label: 'Cài đặt', icon: Settings }, { id: 'account', label: 'Tài khoản', icon: UserRound }];

export function Workspace({ user }: { user: User }) {
  const [tab, setTab] = useState<Tab>('inbox');
  const [data, setData] = useState<Bootstrap | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [pageId, setPageId] = useState('');
  const [filter, setFilter] = useState<FilterName>('all');
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [detailTab, setDetailTab] = useState<'conversation' | 'sources'>('conversation');
  const [composerMode, setComposerMode] = useState<'message' | 'note'>('message');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState('');
  const [live, setLive] = useState<'connecting' | 'connected' | 'offline'>('connecting');
  const [sideOpen, setSideOpen] = useState(false);
  const [confirmResume, setConfirmResume] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const messageEnd = useRef<HTMLDivElement>(null);
  const detailVersion = useRef(0);
  const listVersion = useRef(0);
  const csrf = data?.user.csrf || user.csrf;
  const activeUser = data?.user || user;
  const [, tick] = useState(0);

  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [moreLoading, setMoreLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission | 'unsupported'>('unsupported');
  const sendAttempt = useRef<{ id: string; text: string; key: string } | null>(null);
  const listCount = useRef(0);
  const notificationStart = useRef(Date.now());
  const incomingSeen = useRef(new Map<string, string>());
  const readSeen = useRef(new Map<string, string>());
  const detailRef = useRef(detail); detailRef.current = detail;
  const selectedRef = useRef(selectedId); selectedRef.current = selectedId;
  const tabRef = useRef(tab); tabRef.current = tab;
  const historyVersion = useRef(0);
  const moreVersion = useRef(0);
  const scrollBox = useRef<HTMLDivElement>(null);
  const followMessages = useRef(true);
  const navItems = nav.filter(item => item.id !== 'settings' || activeUser.role === 'ADMIN');

  const observeIncoming = useCallback((items: Conversation[]) => {
    for (const item of items) {
      const stamp = item.lastIncomingAt || item.lastCustomerAt;
      if (!stamp) continue;
      const previous = incomingSeen.current.get(item.id);
      if (!previous || stamp > previous) {
        incomingSeen.current.set(item.id, stamp);
        if (Date.parse(stamp) > notificationStart.current && (!previous || stamp > previous) && typeof Notification !== 'undefined' && Notification.permission === 'granted' && (document.hidden || tabRef.current !== 'inbox' || selectedRef.current !== item.id)) {
          try {
            const notification = new Notification(`Tin nhắn mới · ${item.page.name}`, { body: `${item.customerName} vừa gửi tin nhắn.`, tag: `conversation-${item.id}` });
            notification.onclick = () => { window.focus(); setTab('inbox'); setSelectedId(item.id); notification.close(); };
          } catch { /* Some mobile browsers expose Notification but require a service worker. */ }
        }
      }
    }
  }, []);
  const loadBootstrap = useCallback(async () => {
    const result = await request<Bootstrap>('/api/bootstrap');
    observeIncoming(result.conversations);
    setData(result); return result;
  }, [observeIncoming]);
  const loadList = useCallback(async (silent = false) => {
    const version = ++listVersion.current; ++moreVersion.current; setMoreLoading(false);
    if (!silent) { setListLoading(true); setConversations([]); setNextCursor(null); listCount.current = 0; }
    try {
      const params = new URLSearchParams({ filter, q: search }); if (pageId) params.set('pageId', pageId);
      let result = await request<ConversationList>(`/api/conversations?${params}`);
      const items = [...result.items];
      // Refresh the entire loaded range so old pages do not retain stale statuses or filters.
      while (silent && result.nextCursor && items.length < listCount.current && version === listVersion.current) {
        params.set('cursor', result.nextCursor); result = await request<ConversationList>(`/api/conversations?${params}`); items.push(...result.items);
      }
      if (version === listVersion.current) { observeIncoming(items); setConversations(items); listCount.current = items.length; setNextCursor(result.nextCursor); setError(''); }
    } catch (err) { if (version === listVersion.current) setError(errorText(err)); }
    finally { if (version === listVersion.current) setListLoading(false); }
  }, [pageId, filter, search, observeIncoming]);
  async function loadMore() {
    if (!nextCursor || moreLoading || listLoading) return;
    const version = ++moreVersion.current, list = listVersion.current;
    setMoreLoading(true);
    try {
      const params = new URLSearchParams({ filter, q: search, cursor: nextCursor }); if (pageId) params.set('pageId', pageId);
      const result = await request<ConversationList>(`/api/conversations?${params}`);
      if (version !== moreVersion.current || list !== listVersion.current) return;
      observeIncoming(result.items);
      setConversations(previous => { const items = [...previous, ...result.items.filter(item => !previous.some(old => old.id === item.id))]; listCount.current = items.length; return items; });
      setNextCursor(result.nextCursor); setError('');
    } catch (err) { if (version === moreVersion.current) setError(errorText(err)); }
    finally { if (version === moreVersion.current) setMoreLoading(false); }
  }
  const loadDetail = useCallback(async (id: string, silent = false) => {
    const version = ++detailVersion.current;
    if (!silent) { ++historyVersion.current; setHistoryLoading(false); setDetailLoading(true); setDetail(null); }
    try {
      let result = await request<Detail>(`/api/conversations/${encodeURIComponent(id)}`);
      const previousDetail = detailRef.current;
      const target = silent && previousDetail?.id === id ? previousDetail.messages[0] : undefined;
      // Catch up after a long disconnect without skipping a gap between the loaded history and latest 50.
      while (target && result.nextMessageCursor && !result.messages.some(message => message.id === target.id) && result.messages[0] && Date.parse(result.messages[0].createdAt) >= Date.parse(target.createdAt) && version === detailVersion.current) {
        const older = await request<Detail>(`/api/conversations/${encodeURIComponent(id)}?before=${encodeURIComponent(result.nextMessageCursor)}`);
        result = { ...result, messages: [...older.messages, ...result.messages], nextMessageCursor: older.nextMessageCursor };
      }
      if (version === detailVersion.current && selectedRef.current === id) {
        setDetail(previous => {
          if (!silent || previous?.id !== id) return result;
          const latestIds = new Set(result.messages.map(message => message.id));
          const older = previous.messages.filter(message => !latestIds.has(message.id) && message.createdAt <= (result.messages[0]?.createdAt || ''));
          return { ...result, messages: [...older, ...result.messages], nextMessageCursor: older.length ? previous.nextMessageCursor : result.nextMessageCursor };
        }); setDetailError('');
      }
    } catch (err) { if (version === detailVersion.current) setDetailError(errorText(err)); }
    finally { if (version === detailVersion.current) setDetailLoading(false); }
  }, []);
  async function loadHistory() {
    if (!detail?.nextMessageCursor || historyLoading) return;
    const id = detail.id, version = ++historyVersion.current;
    setHistoryLoading(true);
    try {
      const result = await request<Detail>(`/api/conversations/${encodeURIComponent(id)}?before=${encodeURIComponent(detail.nextMessageCursor)}`);
      if (version !== historyVersion.current || selectedRef.current !== id) return;
      const box = scrollBox.current, oldHeight = box?.scrollHeight || 0, oldTop = box?.scrollTop || 0;
      setDetail(previous => previous?.id === id ? { ...previous, messages: [...result.messages.filter(message => !previous.messages.some(old => old.id === message.id)), ...previous.messages], nextMessageCursor: result.nextMessageCursor } : previous);
      requestAnimationFrame(() => { if (box) box.scrollTop = oldTop + box.scrollHeight - oldHeight; });
      setDetailError('');
    } catch (err) { if (selectedRef.current === id) setDetailError(errorText(err)); }
    finally { if (version === historyVersion.current) setHistoryLoading(false); }
  }
  async function enableNotifications() {
    if (typeof Notification === 'undefined') return;
    try { const permission = await Notification.requestPermission(); setNotificationPermission(permission); setNotice(permission === 'granted' ? 'Đã bật thông báo cho tin nhắn mới. Không thông báo lại hội thoại chưa đọc cũ.' : 'Chưa được cấp quyền thông báo. Bạn vẫn nhận cập nhật trong hộp thư.'); }
    catch (err) { setError(errorText(err)); }
  }
  useEffect(() => {
    let active = true;
    loadBootstrap().then(result => { if (active) { setConversations(result.conversations); listCount.current = result.conversations.length; setNextCursor(result.conversationNextCursor || null); } }).catch(err => { if (active) setError(errorText(err)); }).finally(() => { if (active) setInitialLoading(false); });
    const interval = window.setInterval(() => tick(n => n + 1), 60000);
    return () => { active = false; window.clearInterval(interval); };
  }, [loadBootstrap]);
  useEffect(() => { const timeout = window.setTimeout(() => setSearch(query), 250); return () => window.clearTimeout(timeout); }, [query]);
  useEffect(() => { if (!initialLoading && data) void loadList(); }, [initialLoading, Boolean(data), loadList]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    followMessages.current = true;
    setText(''); setDetailError(''); setDetailTab('conversation'); setComposerMode('message'); setConfirmResume(false);
    if (selectedId) void loadDetail(selectedId);
    else { ++detailVersion.current; ++historyVersion.current; setHistoryLoading(false); setDetail(null); setDetailLoading(false); }
  }, [selectedId, loadDetail]);
  useEffect(() => {
    if (!detail || detail.id !== selectedId || tab !== 'inbox' || document.hidden) return;
    const stamps = detail.messages.filter(message => message.role === 'CUSTOMER').map(message => message.receivedAt || message.createdAt).filter(value => Number.isFinite(Date.parse(value)));
    const seenAt = stamps.sort((a, b) => Date.parse(a) - Date.parse(b)).at(-1);
    if (!seenAt || (readSeen.current.get(detail.id) || '') >= seenAt) return;
    const id = detail.id; readSeen.current.set(id, seenAt);
    post(`/api/conversations/${encodeURIComponent(id)}`, { action: 'read', seenAt: new Date(seenAt).toISOString() }, csrf).then(() => { void loadList(true); void loadBootstrap().catch(err => setError(errorText(err))); }).catch(err => { readSeen.current.delete(id); if (selectedRef.current === id) setDetailError(errorText(err)); });
  }, [detail, selectedId, csrf, tab, loadList, loadBootstrap]);
  useEffect(() => {
    if (!data) return;
    let timer: ReturnType<typeof setTimeout> | undefined, connected = false, running = false, pending = false, active = true;
    const reload = async () => {
      if (!active) return;
      if (running) { pending = true; return; } running = true;
      try { await Promise.all([loadList(true), loadBootstrap(), ...(selectedId ? [loadDetail(selectedId, true)] : [])]); }
      catch (err) { setError(errorText(err)); } finally { running = false; if (pending) { pending = false; void reload(); } }
    };
    const events = new EventSource('/api/events');
    events.onopen = () => { connected = true; setLive('connected'); void reload(); };
    events.onerror = () => { connected = false; setLive('offline'); };
    const refresh = () => { if (timer) clearTimeout(timer); timer = setTimeout(() => void reload(), 250); };
    events.onmessage = refresh;
    const poll = window.setInterval(() => { if (!connected) void reload(); }, 15000);
    const visible = () => { if (!document.hidden) void reload(); }; document.addEventListener('visibilitychange', visible);
    return () => { active = false; events.close(); window.clearInterval(poll); document.removeEventListener('visibilitychange', visible); if (timer) clearTimeout(timer); };
  }, [Boolean(data), loadList, loadBootstrap, loadDetail, selectedId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (followMessages.current) messageEnd.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, [detail?.messages.at(-1)?.id, detailTab]);
  useEffect(() => { setNotificationPermission(typeof Notification === 'undefined' ? 'unsupported' : Notification.permission); if (new URLSearchParams(window.location.search).has('selectPages')) setTab('pages'); }, []);

  async function mutate(action: string, extras: Record<string, unknown> = {}) {
    if (!selectedId || busy) return;
    setBusy(action); setDetailError('');
    try {
      if (action === 'message') {
        const content = String(extras.text || '');
        if (!sendAttempt.current || sendAttempt.current.id !== selectedId || sendAttempt.current.text !== content) sendAttempt.current = { id: selectedId, text: content, key: crypto.randomUUID() };
        extras.idempotencyKey = sendAttempt.current.key;
      }
      await post(`/api/conversations/${encodeURIComponent(selectedId)}`, { action, ...extras }, csrf);
      if (action === 'message') sendAttempt.current = null;
      if (action === 'message' || action === 'note' || action === 'demo-incoming') setText('');
      await Promise.all([loadDetail(selectedId, true), loadList(true), loadBootstrap()]);
      setConfirmResume(false);
    } catch (err) { setDetailError(errorText(err)); } finally { setBusy(''); }
  }
  async function logout() { setBusy('logout'); try { await post('/api/auth/logout', {}, csrf); window.location.assign('/login'); } catch (err) { setError(errorText(err)); setBusy(''); } }
  async function refresh() { setBusy('refresh'); try { await Promise.all([loadBootstrap(), loadList(true), ...(selectedId ? [loadDetail(selectedId, true)] : [])]); } catch (err) { setError(errorText(err)); } finally { setBusy(''); } }
  const selectedPage = detail ? data?.pages.find(p => p.id === detail.pageId) : undefined;
  const human = detail?.status.includes('HUMAN') && detail.status !== 'NEEDS_HUMAN';
  const canSend = composerMode === 'note' || human;
  const currentPage = data?.pages.find(p => p.id === pageId);
  const selectScope = (id: string) => { setPageId(id); setSelectedId(null); setSideOpen(false); };
  const changeTab = (id: Tab) => { setTab(id); setSideOpen(false); };

  return <div className="workspace">
    <aside className="rail">
      <button className="rail-brand" aria-label="PageFlow, mở hộp thư" onClick={() => changeTab('inbox')}><Layers3 size={25} /></button>

      <nav className="rail-nav" aria-label="Điều hướng nhanh">{navItems.map(item => <button key={item.id} className={`rail-item ${tab === item.id ? 'active' : ''}`} onClick={() => changeTab(item.id)} title={item.label} aria-label={item.label} aria-current={tab === item.id ? 'page' : undefined}><item.icon size={22} /><span>{item.label}</span>{item.id === 'inbox' && !!data?.stats.unread && <i />}</button>
)}</nav>
      <div className="rail-bottom">{activeUser.role === 'ADMIN' && <button className="rail-item" title="Hướng dẫn thiết lập" aria-label="Hướng dẫn thiết lập" onClick={() => changeTab('settings')}><CircleHelp size={21} /></button>}
<button className="rail-avatar" title={`${activeUser.name} · Đăng xuất`} aria-label="Đăng xuất" onClick={() => setConfirmLogout(true)} disabled={busy === 'logout'}>{initials(activeUser.name)}</button>
</div>
    </aside>
    <aside className={`workspace-sidebar ${sideOpen ? 'open' : ''}`}>
      <div className="sidebar-brand">PageFlow<span>.</span><button className="icon-button mobile-only" aria-label="Đóng menu" onClick={() => setSideOpen(false)}><X size={18} /></button>
</div>
      <div className="workspace-switch"><span className="workspace-logo"><Command size={19} /></span><div><strong>Không gian làm việc</strong><small>{activeUser.role === 'ADMIN' ? 'Quản trị viên' : 'Đội ngũ chăm sóc'}</small></div></div>
      <div className="sidebar-heading">KHÔNG GIAN CHUNG</div>
      <nav className="sidebar-nav" aria-label="Không gian chung">{navItems.map(item => <button key={item.id} className={tab === item.id ? 'active' : ''} onClick={() => changeTab(item.id)} aria-current={tab === item.id ? 'page' : undefined}><item.icon size={18} /><span>{item.label}</span>{item.id === 'inbox' && !!data?.stats.unread && <b>{data.stats.unread}</b>}</button>
)}</nav>
      <div className="sidebar-divider" />
      {tab === 'inbox' && <><div className="sidebar-heading">HỘI THOẠI <Filter size={13} /></div><nav className="filter-nav" aria-label="Bộ lọc hội thoại">{filters.map(item => <button key={item.id} className={filter === item.id ? 'active' : ''} onClick={() => { setFilter(item.id); setSelectedId(null); setSideOpen(false); }} aria-current={filter === item.id ? 'true' : undefined}><item.icon size={17} /><span>{item.label}</span>{item.id === 'unread' && !!data?.stats.unread && <b>{data.stats.unread}</b>}{item.id === 'needsHuman' && !!data?.stats.needsHuman && <b className="amber-count">{data.stats.needsHuman}</b>}</button>
)}</nav></>}
      <div className="sidebar-heading">FACEBOOK PAGES <button className="icon-button" aria-label="Quản lý Pages" onClick={() => changeTab('pages')}><Plus size={15} /></button>
</div>
      <nav className="page-nav" aria-label="Facebook Pages"><button className={!pageId ? 'active' : ''} onClick={() => selectScope('')} aria-current={!pageId ? 'true' : undefined}><Globe size={17} /><span>Tất cả Pages</span><small>{data?.pages.length ?? '—'}</small></button>
{data?.pages.map(page => <button key={page.id} className={pageId === page.id ? 'active' : ''} onClick={() => selectScope(page.id)} aria-current={pageId === page.id ? 'true' : undefined}><span className="page-dot" style={{ background: page.color }} /><span>{page.name}</span>{page.demo ? <small className="demo-mini">DEMO</small> : <span className={`connection-dot ${page.connection === 'CONNECTED' ? 'ok' : ''}`} title={page.connection === 'CONNECTED' ? 'Đã kết nối' : 'Chưa kết nối'} />}</button>
)}</nav>
      <div className="sidebar-bottom"><div className="ai-tip"><span><Sparkles size={17} /> AI có trách nhiệm</span><p>Chỉ dùng tri thức đã xuất bản. Chuyển nhân viên khi cần hỗ trợ.</p>
<button onClick={() => changeTab('knowledge')}>Quản lý tri thức <ArrowUpRight size={14} /></button>
</div><div className="sidebar-user"><span className="avatar small indigo">{initials(activeUser.name)}</span><div><strong>{activeUser.name}</strong><small>{activeUser.email}</small></div><button className="icon-button" title="Đăng xuất" aria-label="Đăng xuất" disabled={busy === 'logout'} onClick={() => setConfirmLogout(true)}><LogOut size={16} /></button>
</div></div>
    </aside>
    {sideOpen && <button className="sidebar-overlay" onClick={() => setSideOpen(false)} aria-label="Đóng menu" />}
    <main className="main-workspace">
      <header className="topbar"><div><button className="icon-button mobile-only" onClick={() => setSideOpen(true)} aria-label="Mở menu"><Layers3 size={21} /></button>
<span className="breadcrumb">Không gian làm việc</span><span className="breadcrumb-divider">/</span><strong>{nav.find(item => item.id === tab)?.label}</strong></div><div className="topbar-actions">{notificationPermission === 'default' && <button className="button secondary compact notification-action" onClick={() => void enableNotifications()} title="Bật thông báo trình duyệt cho tin nhắn mới"><Bell size={15} /><span>Bật thông báo</span></button>}<span className={`live-status ${live}`} title="Trạng thái kênh cập nhật sự kiện"><i />{live === 'connected' ? 'Đang cập nhật trực tiếp' : live === 'offline' ? 'Cập nhật dự phòng mỗi 15 giây' : 'Đang kết nối'}</span><ThemeToggle /><button className="icon-button" disabled={busy === 'refresh'} title="Làm mới dữ liệu" aria-label="Làm mới dữ liệu" onClick={refresh}><RefreshCw size={17} className={busy === 'refresh' ? 'spin' : ''} /></button>
<span className="avatar small indigo">{initials(activeUser.name)}</span></div></header>
      {error && <div className="global-alert"><Alert message={error} onClose={() => setError('')} /><button className="text-button" onClick={() => { setInitialLoading(true); loadBootstrap().then(result => { setConversations(result.conversations); listCount.current = result.conversations.length; setError(''); }).catch(err => setError(errorText(err))).finally(() => setInitialLoading(false)); }}>Thử lại</button>
{error.includes('đăng nhập') && <a className="text-button" href="/login">Đăng nhập lại</a>}</div>}
      {notice && <div className="global-alert"><Alert message={notice} kind="success" onClose={() => setNotice('')} /></div>}
      {initialLoading ? <Loading label="Đang mở không gian làm việc…" /> : !data ? <Empty title="Chưa tải được không gian làm việc" description="Kiểm tra kết nối máy chủ rồi thử lại. Không có dữ liệu giả được hiển thị." icon={<AlertCircle size={28} />} /> : tab !== 'inbox' ? <div className="panel-scroll">{tab === 'knowledge' && <KnowledgePanel pages={data.pages} initialPageId={pageId} csrf={csrf} user={activeUser} />}{tab === 'pages' && <PagesPanel pages={data.pages} user={activeUser} csrf={csrf} onRefresh={loadBootstrap} />}{tab === 'settings' && <SettingsPanel pages={data.pages} user={activeUser} csrf={csrf} />}{tab === 'account' && <AccountPanel user={activeUser} csrf={csrf} />}</div> : <>
        <section className="inbox-heading"><div><span className="eyebrow">KẾT NỐI VỚI KHÁCH HÀNG</span><h1>Hộp thư <span className="heading-count">{data.stats.total}</span></h1><p>Mọi cuộc trò chuyện. Một nơi để chăm sóc.</p>
</div><div className="inbox-stats"><div><span className="stat-icon indigo"><MessageCircle size={19} /></span><div><strong>{data.stats.unread}</strong><small>Chưa đọc</small></div></div><div><span className="stat-icon amber"><UserRound size={19} /></span><div><strong>{data.stats.needsHuman}</strong><small>Cần nhân viên</small></div></div><div><span className="stat-icon teal"><Bot size={19} /></span><div><strong>{data.stats.aiReplies}</strong><small>AI đã trả lời</small></div></div></div></section>
        {!!data.pages.some(p => p.demo) && <div className="demo-banner"><span className="badge amber">DEMO</span><span>Pages demo chỉ mô phỏng hội thoại, không kết nối và không gửi tin nhắn Facebook thật.</span><button onClick={() => changeTab('pages')}>Xem Pages <ArrowUpRight size={14} /></button>
</div>}
        <section className={`inbox-grid ${selectedId ? 'detail-open' : ''}`}>
          <div className="conversation-list"><div className="list-toolbar"><div className="list-title"><strong>{currentPage?.name || filters.find(f => f.id === filter)?.label}</strong><span>{conversations.length}</span><button className="icon-button" aria-label="Làm mới danh sách" onClick={() => void loadList()}><RefreshCw size={15} /></button>
</div><div className="search-field"><Search size={17} /><input placeholder="Tìm tên hoặc nội dung…" value={query} onChange={e => setQuery(e.target.value)} aria-label="Tìm hội thoại" />{query && <button className="icon-button" onClick={() => setQuery('')} aria-label="Xóa tìm kiếm"><X size={14} /></button>
}</div><div className="list-tabs" role="tablist" aria-label="Lọc hội thoại"><button role="tab" aria-selected={filter === 'all'} className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>Tất cả</button>
<button role="tab" aria-selected={filter === 'unread'} className={filter === 'unread' ? 'active' : ''} onClick={() => setFilter('unread')}>Chưa đọc</button>
<button role="tab" aria-selected={filter === 'needsHuman'} className={filter === 'needsHuman' ? 'active' : ''} onClick={() => setFilter('needsHuman')}>Cần hỗ trợ</button>
</div></div>
            <div className="list-items" role="tabpanel" aria-label="Danh sách hội thoại">{listLoading ? <Loading /> : conversations.length === 0 ? <Empty title="Không có hội thoại" description={query ? 'Thử một từ khóa hoặc bộ lọc khác.' : 'Hội thoại sẽ xuất hiện khi Page nhận tin nhắn mới.'} /> : conversations.map(conversation => <button key={conversation.id} className={`conversation-card ${selectedId === conversation.id ? 'selected' : ''} ${conversation.unread ? 'unread' : ''}`} onClick={() => setSelectedId(conversation.id)}><span className="avatar customer page-tint" style={{ '--page-color': conversation.page.color } as CSSProperties}>{initials(conversation.customerName)}<i className="facebook-mini">f</i></span><div className="conversation-card-body"><div className="conversation-card-top"><strong>{conversation.customerName}</strong><time title={fullTime(conversation.lastMessageAt)}>{relativeTime(conversation.lastMessageAt)}</time></div><p>{conversation.preview || 'Chưa có tin nhắn'}</p>
<div className="conversation-card-bottom"><span className="page-label"><i style={{ background: conversation.page.color }} />{conversation.page.name}</span><StatusBadge status={conversation.status} resolved={conversation.resolved} /></div></div>{!!conversation.unread && <span className="unread-dot" />}</button>
)}{nextCursor && <button className="button secondary load-more" disabled={moreLoading || listLoading} onClick={() => void loadMore()}>{moreLoading ? 'Đang tải…' : 'Tải thêm hội thoại'}</button>}</div><div className="list-footer"><ShieldCheck size={13} /> Chỉ hiển thị Pages bạn được cấp quyền</div>
          </div>
          <div className="conversation-detail">{!selectedId ? <Empty title="Bắt đầu một cuộc trò chuyện" description="Chọn hội thoại bên trái để xem tin nhắn, phối hợp cùng AI và hỗ trợ khách hàng."><span className="empty-note"><Bot size={17} /> AI hỗ trợ. Bạn kiểm soát.</span></Empty> : detailLoading ? <Loading label="Đang tải hội thoại…" /> : !detail ? <Empty title="Không thể mở hội thoại" description={detailError} icon={<AlertCircle size={28} />}><button className="button secondary" onClick={() => void loadDetail(selectedId)}>Thử lại</button>
<button className="text-button" onClick={() => setSelectedId(null)}>Quay lại</button>
</Empty> : <>
            <div className="detail-header"><button className="icon-button detail-back" onClick={() => setSelectedId(null)} aria-label="Quay lại danh sách"><ArrowLeft size={21} /></button>
<span className="avatar customer page-tint" style={{ '--page-color': detail.page.color } as CSSProperties}>{initials(detail.customerName)}</span><div className="detail-heading"><h2>{detail.customerName}</h2><span><i style={{ background: detail.page.color }} />{detail.page.name}{detail.page.demo && <b className="demo-mini">DEMO</b>}</span></div><div className="detail-header-actions"><StatusBadge status={detail.status} resolved={detail.resolved} /><button className="button secondary compact" disabled={!!busy || detail.resolved} onClick={() => void mutate('resolve')}><Check size={15} /><span>Đã xử lý</span></button>
</div></div>
            <div className="detail-meta"><span><UserRound size={14} /> Phụ trách</span><select aria-label="Phân công nhân viên" value={detail.assignedTo || ''} disabled={!!busy} onChange={e => void mutate('assign', { assignedTo: e.target.value || null })}><option value="">Chưa phân công</option>{data.members.map(member => <option key={member.id} value={member.id}>{member.name}{member.id === activeUser.id ? ' (Tôi)' : ''}</option>)}</select><span className="detail-channel"><MessageCircle size={13} /> Messenger</span></div>
            {detailError && <Alert message={detailError} onClose={() => setDetailError('')} />}
            <div className={`ai-control ${human ? 'human-control' : ''}`}><span className="ai-control-icon">{human ? <UserRound size={19} /> : <Sparkles size={19} />}</span><div><strong>{human ? 'Bạn đang kiểm soát hội thoại' : detail.status === 'NEEDS_HUMAN' ? 'Hội thoại cần nhân viên hỗ trợ' : selectedPage?.aiEnabled ? 'AI đang hỗ trợ hội thoại' : 'AI đang tắt trên Page này'}</strong><small>{human ? 'AI tạm dừng, nhân viên trả lời trực tiếp.' : 'Tiếp quản để phản hồi khách hàng bằng tài khoản đội ngũ.'}</small></div><button className="button secondary compact" disabled={!!busy} onClick={() => human ? setConfirmResume(true) : void mutate('takeover')}>{human ? <><Bot size={14} /> Trả lại AI</> : <><UserRound size={14} /> Tiếp quản</>}</button>
</div>
            {confirmResume && <div className="inline-confirm"><span>Cho phép AI tiếp tục? AI chỉ phản hồi nếu đã bật trên Page.</span><button className="button primary compact" disabled={!!busy} onClick={() => void mutate('resume')}>Xác nhận</button>
<button className="text-button" onClick={() => setConfirmResume(false)}>Hủy</button>
</div>}
            <div className="detail-tabs" role="tablist" aria-label="Nội dung hội thoại"><button role="tab" aria-selected={detailTab === 'conversation'} className={detailTab === 'conversation' ? 'active' : ''} onClick={() => setDetailTab('conversation')}><MessageCircle size={16} /> Hội thoại</button>
<button role="tab" aria-selected={detailTab === 'sources'} className={detailTab === 'sources' ? 'active' : ''} onClick={() => setDetailTab('sources')}><BookOpen size={16} /> Nguồn AI <span>{detail.runs.length}</span></button>
<button className="add-note" onClick={() => { setComposerMode('note'); setDetailTab('conversation'); }}><StickyNote size={15} /> Ghi chú</button>
</div>
            {detailTab === 'sources' ? <div className="sources-scroll" role="tabpanel" aria-label="Nguồn AI">{detail.runs.length === 0 ? <Empty title="Chưa có lần xử lý AI" description="Nguồn tri thức và quyết định của AI sẽ hiển thị tại đây, không có dữ liệu mô phỏng." /> : [...detail.runs].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).map((run, index) => <article className="run-card" key={`${run.createdAt}-${index}`}><header><span><Sparkles size={16} /> Lần xử lý AI</span><time title={fullTime(run.createdAt)}>{relativeTime(run.createdAt)}</time></header><span className={`badge ${run.decision.includes('HUMAN') ? 'amber' : 'teal'}`}>{decisionLabel(run.decision)}</span>{run.answer && <p>{run.answer}</p>
}<h4>Nguồn tham khảo</h4>{sourcesOf(run.sources).length ? sourcesOf(run.sources).map((source, i) => <div className="source-reference" key={source.id || i}><FileText size={15} /><div><strong>{source.title || source.id || 'Nguồn tri thức'}</strong>{source.text && <p>{source.text}</p>
}</div></div>) : <small>Không có nguồn tri thức được trích dẫn.</small>}</article>)}</div> : <div className="messages-scroll" role="tabpanel" aria-label="Hội thoại" ref={scrollBox} onScroll={event => { const box = event.currentTarget; followMessages.current = box.scrollHeight - box.scrollTop - box.clientHeight < 80; }}>{detail.nextMessageCursor && <button className="button secondary load-history" disabled={historyLoading} onClick={() => void loadHistory()}>{historyLoading ? 'Đang tải lịch sử…' : 'Xem tin nhắn trước đó'}</button>}<div className="conversation-start"><ShieldCheck size={13} /> Hội thoại nội bộ · {detail.page.demo ? 'Môi trường demo' : 'Facebook Messenger'}</div>{detail.messages.length === 0 && <Empty title="Chưa có tin nhắn" description="Tin nhắn sẽ hiển thị tại đây khi nhận được." />}{detail.messages.map(message => <div key={message.id} className={`message-row ${message.role.toLowerCase()}`}><div className="message-wrapper"><div className="message-author">{message.role === 'CUSTOMER' ? detail.customerName : message.role === 'AI' ? <><Sparkles size={12} /> PageFlow AI</> : message.role === 'NOTE' ? <><StickyNote size={12} /> Ghi chú nội bộ</> : 'Đội ngũ hỗ trợ'}</div><div className="message-bubble">{message.text || (message.attachments ? 'Tin nhắn có tệp đính kèm' : '(Tin nhắn trống)')}{message.attachments != null && <AttachmentList value={message.attachments} />}</div><div className="message-time"><time title={fullTime(message.createdAt)}>{relativeTime(message.createdAt)}</time>{message.role !== 'CUSTOMER' && message.role !== 'NOTE' && <span className={message.state === 'FAILED' || message.state === 'UNCERTAIN' ? 'failed' : ''}>{messageStateLabel(message.state, detail.page.demo)}</span>}</div>{message.error && <div className="message-error">Không gửi được: {message.error}</div>}</div></div>)}<div ref={messageEnd} /></div>}
            {detailTab === 'conversation' && <div className={`composer ${composerMode === 'note' ? 'note-mode' : ''}`}><div className="composer-tabs"><button aria-pressed={composerMode === 'message'} className={composerMode === 'message' ? 'active' : ''} onClick={() => setComposerMode('message')}><MessageCircle size={14} /> Trả lời</button>
<button aria-pressed={composerMode === 'note'} className={composerMode === 'note' ? 'active' : ''} onClick={() => setComposerMode('note')}><StickyNote size={14} /> Ghi chú nội bộ</button>
<span>{composerMode === 'note' ? 'Chỉ đội ngũ nhìn thấy' : detail.page.demo ? 'Không gửi Facebook thật' : 'Facebook Messenger'}</span></div><textarea aria-label={composerMode === 'note' ? 'Nội dung ghi chú' : 'Nội dung trả lời'} placeholder={composerMode === 'note' ? 'Ghi chú cho đội ngũ của bạn…' : human ? 'Viết tin nhắn cho khách hàng…' : 'Tiếp quản hội thoại để gửi tin nhắn…'} disabled={!!busy || !canSend} value={text} onChange={e => setText(e.target.value)} onKeyDown={e => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && text.trim() && canSend && !busy) { e.preventDefault(); void mutate(composerMode, { text: text.trim(), idempotencyKey: crypto.randomUUID() }); } }} /><div className="composer-bottom"><small>{composerMode === 'message' && !human ? 'AI đang giữ hội thoại. Nhấn “Tiếp quản” để trả lời.' : 'Ctrl / ⌘ + Enter để gửi'}</small><button className={`button ${composerMode === 'note' ? 'note-button' : 'primary'}`} disabled={!!busy || !text.trim() || !canSend} onClick={() => void mutate(composerMode, { text: text.trim(), idempotencyKey: crypto.randomUUID() })}>{composerMode === 'note' ? <StickyNote size={15} /> : <Send size={15} />}{busy === composerMode ? 'Đang gửi…' : composerMode === 'note' ? 'Lưu ghi chú' : 'Gửi tin nhắn'}</button>
</div>{detail.page.demo && <div className="demo-incoming"><span><WandSparkles size={14} /> Thử luồng hội thoại trên Page demo</span><button disabled={!!busy} onClick={() => void mutate('demo-incoming', { text: 'Xin chào, mình muốn được tư vấn về sản phẩm và giá.', idempotencyKey: crypto.randomUUID() })}>Tạo tin nhắn mẫu <Plus size={13} /></button>
</div>}</div>}
          </> }</div>
        </section>
      </>}
    </main>
    {confirmLogout && <Modal title="Đăng xuất khỏi PageFlow?" onClose={() => setConfirmLogout(false)}><p>Phiên đăng nhập trên thiết bị này sẽ kết thúc. AI và worker vẫn tiếp tục chạy nền cho các Page đang hoạt động.</p>
<div className="modal-actions"><button type="button" className="button secondary" disabled={busy === 'logout'} onClick={() => setConfirmLogout(false)}>Hủy</button>
<button type="button" className="button danger" disabled={busy === 'logout'} onClick={() => void logout()}>{busy === 'logout' ? 'Đang đăng xuất…' : 'Đăng xuất'}</button>
</div></Modal>}
  </div>;
}

function AttachmentList({ value }: { value: unknown }) {
  if (!Array.isArray(value)) return <span className="attachment-label">Có tệp đính kèm</span>;
  return <div className="attachments">{value.map((attachment, index) => {
    const item = attachment && typeof attachment === 'object' ? attachment as { type?: string; url?: string; payload?: { url?: string } } : {};
    const url = item.url || item.payload?.url; const safe = url && /^https?:\/\//i.test(url);
    return safe ? <a key={index} href={url} target="_blank" rel="noopener noreferrer"><FileText size={13} />{item.type === 'image' ? 'Xem hình ảnh' : 'Mở tệp đính kèm'} <ArrowUpRight size={12} /></a> : <span key={index} className="attachment-label">Tệp đính kèm {index + 1}</span>;
  })}</div>;
}
