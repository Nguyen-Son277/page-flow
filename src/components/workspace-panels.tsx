'use client';

import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import { ArrowUpRight, BookOpen, Bot, Check, ChevronRight, Copy, FileText, Globe, Layers3, Link, LoaderCircle, LockKeyhole, Plus, Save, Send, ShieldCheck, Sparkles, Trash2, Upload, Users, X } from 'lucide-react';
import { Alert, Empty, Loading, errorText, fullTime, initials, post, relativeTime, request, sourcesOf, type KnowledgeSource, type Member, type Page, type SourceRef, type User } from './ui';

type Common = { pages: Page[]; csrf: string };
export function KnowledgePanel({ pages, initialPageId, csrf, user }: Common & { initialPageId: string; user: User }) {
  const canEdit = user.role === 'ADMIN';
  const [pageId, setPageId] = useState(initialPageId || pages[0]?.id || '');
  const [sources, setSources] = useState<KnowledgeSource[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  const [editor, setEditor] = useState(false);
  const [viewSource, setViewSource] = useState<KnowledgeSource | null>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [kind, setKind] = useState('TEXT');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [confirmPublish, setConfirmPublish] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importMode, setImportMode] = useState<'file' | 'url'>('file');
  const [importTitle, setImportTitle] = useState('');
  const [url, setUrl] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [question, setQuestion] = useState('');
  const [testResult, setTestResult] = useState<{ answer?: string; decision: string; sources: SourceRef[]; error?: string } | null>(null);
  const [testError, setTestError] = useState('');
  const [testLoading, setTestLoading] = useState(false);
  async function load(id = pageId) {
    const result = await request<KnowledgeSource[] | { sources: KnowledgeSource[] }>(`/api/knowledge?pageId=${encodeURIComponent(id)}`);
    setSources(Array.isArray(result) ? result : result.sources);
  }
  useEffect(() => {
    let active = true; setEditor(false); setViewSource(null); setImportOpen(false); setNotice(''); setTestResult(null); setTestError(''); setSources([]); setError('');
    if (!pageId) return;
    setLoading(true);
    request<KnowledgeSource[] | { sources: KnowledgeSource[] }>(`/api/knowledge?pageId=${encodeURIComponent(pageId)}`).then(result => { if (active) setSources(Array.isArray(result) ? result : result.sources); }).catch(err => { if (active) setError(errorText(err)); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [pageId]);
  function openEditor(source?: KnowledgeSource) { setEditId(source?.id || null); setTitle(source?.title || ''); setContent(source?.draft || ''); setKind(source?.kind || 'TEXT'); setEditor(true); setConfirmPublish(false); }
  async function save(action: 'save' | 'publish') {
    if (!canEdit || busy) return;
    if (!title.trim() || content.trim().length < 10) { setError('Vui lòng nhập tiêu đề và nội dung tri thức tối thiểu 10 ký tự.'); return; }
    setBusy(action); setError('');
    try { const saved = await post<{ id: string }>('/api/knowledge', { pageId, title: title.trim(), content: content.trim(), ...(editId ? { id: editId } : {}), action, kind }, csrf); setEditId(saved.id); await load(); setEditor(false); setConfirmPublish(false); setNotice(action === 'publish' ? 'Đã xuất bản tri thức. AI có thể sử dụng phiên bản này.' : 'Đã lưu bản nháp. AI chưa sử dụng thay đổi này.'); }
    catch (err) { setError(errorText(err)); } finally { setBusy(''); }
  }
  async function remove(id: string) {
    if (!canEdit || busy) return;
    setBusy('delete'); setError('');
    try { await post('/api/knowledge', { pageId, id, action: 'delete' }, csrf); await load(); setConfirmDelete(null); if (editId === id) setEditor(false); setNotice('Đã xóa nguồn tri thức.'); }
    catch (err) { setError(errorText(err)); } finally { setBusy(''); }
  }
  async function importSource(event: FormEvent) {
    event.preventDefault(); if (!canEdit || busy) return; setBusy('import'); setError('');
    try {
      if (importMode === 'file') {
        if (!file) throw new Error('Vui lòng chọn một tệp để nhập.');
        const form = new FormData(); form.set('pageId', pageId); form.set('title', importTitle.trim()); form.set('file', file);
        await request('/api/knowledge/import', { method: 'POST', body: form }, csrf);
      } else { await post('/api/knowledge/import', { pageId, title: importTitle.trim(), url }, csrf); }
      await load(); setImportOpen(false); setImportTitle(''); setUrl(''); setFile(null); setNotice('Đã nhập tài liệu. Hãy kiểm tra bản nháp trước khi xuất bản.');
    } catch (err) { setError(errorText(err)); } finally { setBusy(''); }
  }
  async function test(event: FormEvent) {
    event.preventDefault(); setTestLoading(true); setTestError(''); setTestResult(null);
    try { const result = await post<{ answer?: string; decision: string; sources: SourceRef[]; error?: string }>('/api/ai/test', { pageId, question: question.trim() }, csrf); setTestResult(result); }
    catch (err) { setTestError(errorText(err)); } finally { setTestLoading(false); }
  }
  if (!pages.length) return <Empty title="Thêm Page để bắt đầu" description="Tri thức thuộc từng Page. Kết nối hoặc tạo Page demo trước khi thêm tài liệu." />;
  const selectedSource = sources.find(source => source.id === editId);
  return <div className="section-page"><div className="section-heading"><div><span className="eyebrow">THÔNG TIN ĐÚNG, CÂU TRẢ LỜI TỐT</span><h1>Tri thức AI</h1><p>Xây dựng nguồn thông tin đáng tin cậy cho từng Page.</p>
</div>{canEdit && <div className="section-actions"><button className="button secondary" onClick={() => { setImportOpen(true); setImportTitle(''); }}><Upload size={16} /> Nhập tài liệu</button>
<button className="button primary" onClick={() => openEditor()}><Plus size={17} /> Thêm tri thức</button>
</div>}</div>
    <div className="scope-bar"><label><Layers3 size={17} /><select value={pageId} disabled={!!busy || testLoading} onChange={e => setPageId(e.target.value)} aria-label="Page tri thức">{pages.map(page => <option key={page.id} value={page.id}>{page.name}{page.demo ? ' · DEMO' : ''}</option>)}</select></label><span><ShieldCheck size={15} /> AI chỉ sử dụng nội dung đã xuất bản</span></div>
    {error && <Alert message={error} onClose={() => setError('')} />}{notice && <Alert message={notice} kind="success" onClose={() => setNotice('')} />}
    <div className="knowledge-grid"><section className="surface knowledge-library"><div className="surface-header"><div><BookOpen size={19} /><h2>Thư viện tri thức</h2><span className="count-chip">{sources.length}</span></div><small>{sources.filter(s => s.published).length} đã xuất bản</small></div>
      {loading ? <Loading /> : editor ? <div className="knowledge-editor"><div className="editor-title"><h3>{editId ? 'Chỉnh sửa tri thức' : 'Nguồn tri thức mới'}</h3><button className="icon-button" disabled={!!busy} aria-label="Đóng trình soạn thảo" onClick={() => setEditor(false)}><X size={18} /></button>
</div><label>Tiêu đề<input value={title} onChange={e => setTitle(e.target.value)} placeholder="Ví dụ: Chính sách đổi trả" /></label><label>Loại nội dung<select value={kind} onChange={e => setKind(e.target.value)}><option value="TEXT">Văn bản</option><option value="FAQ">Câu hỏi thường gặp</option><option value="PRICE">Bảng giá</option></select></label><label>Nội dung<textarea rows={12} value={content} onChange={e => setContent(e.target.value)} placeholder="Nhập thông tin chính xác, rõ ràng để AI tham khảo…" /></label>{selectedSource?.published && <p className="muted">Phiên bản đã xuất bản: v{selectedSource.version}. Lưu nháp không thay đổi nội dung AI đang dùng.</p>
}{confirmPublish && <div className="alert warning"><ShieldCheck size={17} /><span>Nội dung này sẽ được AI sử dụng để trả lời khách hàng. Bạn đã kiểm tra tính chính xác?</span></div>}<div className="editor-actions"><button className="button secondary" disabled={!!busy || !title.trim() || !content.trim()} onClick={() => void save('save')}><Save size={15} />{busy === 'save' ? 'Đang lưu…' : 'Lưu bản nháp'}</button>
<button className="button primary" disabled={!!busy || !title.trim() || !content.trim()} onClick={() => confirmPublish ? void save('publish') : setConfirmPublish(true)}><Check size={16} />{busy === 'publish' ? 'Đang xuất bản…' : confirmPublish ? 'Xác nhận xuất bản' : 'Xuất bản'}</button>
</div></div> : !sources.length ? <Empty title="Tri thức bắt đầu từ đây" description="Thêm thông tin sản phẩm, bảng giá hoặc chính sách để AI có cơ sở trả lời chính xác.">{canEdit && <button className="button primary" onClick={() => openEditor()}><Plus size={16} /> Tạo nguồn đầu tiên</button>}
</Empty> : <div className="knowledge-items">{sources.map(source => <article className="knowledge-card" key={source.id}><span className={`document-icon ${source.kind === 'PRICE' ? 'teal' : 'indigo'}`}><FileText size={21} /></span><div><button className="source-title" onClick={() => canEdit ? openEditor(source) : setViewSource(source)}>{source.title}</button>
<div className="source-meta"><span>{source.kind === 'FAQ' ? 'Câu hỏi thường gặp' : source.kind === 'PRICE' ? 'Bảng giá' : 'Văn bản'}</span><i>·</i><time title={fullTime(source.updatedAt)}>{relativeTime(source.updatedAt)}</time></div><div className="source-state"><span className={`badge ${source.published ? 'teal' : 'neutral'}`}>{source.published ? `Đã xuất bản · v${source.version}` : 'Bản nháp'}</span>{source.published && source.draft !== source.published && <span className="badge amber">Có thay đổi chưa xuất bản</span>}</div></div>{canEdit && <button className="icon-button delete-button" aria-label={`Xóa ${source.title}`} onClick={() => setConfirmDelete(source.id)}><Trash2 size={16} /></button>}
{canEdit && <button className="icon-button" aria-label={`Sửa ${source.title}`} onClick={() => openEditor(source)}><ChevronRight size={17} /></button>}
</article>)}</div>}
      <div className="surface-foot"><ShieldCheck size={14} /> Kiểm tra bản nháp trước khi xuất bản. AI không tự suy đoán thông tin thiếu.</div>
    </section><aside className="surface test-panel"><div className="surface-header"><div><Sparkles size={19} /><h2>Thử phản hồi AI</h2></div><span className="badge indigo">SANDBOX</span></div><div className="test-content"><p>Đặt mình vào vị trí khách hàng. Kiểm tra câu trả lời và nguồn tham khảo trước khi bật AI.</p>
<form onSubmit={test}><label>Câu hỏi của khách hàng<textarea rows={4} placeholder="Ví dụ: Đổi trả sản phẩm trong bao lâu?" required value={question} onChange={e => setQuestion(e.target.value)} /></label><button className="button primary full-width" disabled={testLoading || !question.trim()}>{testLoading ? <LoaderCircle className="spin" size={16} /> : <Sparkles size={16} />}{testLoading ? 'AI đang xử lý…' : 'Thử câu trả lời'}</button>
</form><small className="sandbox-note"><ShieldCheck size={13} /> Không gửi tin nhắn tới Facebook</small>{testError && <Alert message={testError} />}{testResult && <div className="test-answer"><div><Bot size={19} /><strong>Phản hồi AI</strong><span className={`badge ${testResult.decision.includes('HUMAN') ? 'amber' : 'teal'}`}>{testResult.decision}</span></div>{testResult.error && <Alert message={testResult.error} />}{testResult.answer ? <p>{testResult.answer}</p>
 : <p className="muted">AI không đưa ra câu trả lời. Xem quyết định ở trên.</p>
}<h4>Nguồn tham khảo</h4>{sourcesOf(testResult.sources).length ? sourcesOf(testResult.sources).map((source, index) => <div className="source-reference" key={source.id || index}><FileText size={15} /><div><strong>{source.title || 'Nguồn tri thức'}</strong>{source.text && <p>{source.text}</p>
}</div></div>) : <small>Không có nguồn được trích dẫn.</small>}</div>}{!testResult && !testLoading && <div className="test-hint"><BookOpen size={24} /><p>Câu trả lời đáng tin cậy<br />bắt đầu từ tri thức tốt.</p>
</div>}</div></aside></div>
    {viewSource && <Modal title={viewSource.title} onClose={() => setViewSource(null)}><span className="badge neutral">Chỉ xem · {viewSource.published ? "Đã xuất bản" : "Bản nháp"}</span><pre className="source-preview">{viewSource.published || viewSource.draft}</pre></Modal>}
    {confirmDelete && <Modal title="Xóa nguồn tri thức?" onClose={() => setConfirmDelete(null)}><p>Nguồn này sẽ bị xóa và không còn được AI tham khảo. Hành động này không thể hoàn tác.</p>
<div className="modal-actions"><button className="button secondary" onClick={() => setConfirmDelete(null)}>Hủy</button>
<button className="button danger" disabled={!!busy} onClick={() => void remove(confirmDelete)}>{busy === 'delete' ? 'Đang xóa…' : 'Xóa nguồn'}</button>
</div></Modal>}
    {importOpen && <Modal title="Nhập nguồn tri thức" onClose={() => { if (!busy) setImportOpen(false); }}><p>Tài liệu được nhập thành bản nháp. Kiểm tra nội dung trước khi xuất bản.</p>
<div className="segmented"><button className={importMode === 'file' ? 'active' : ''} onClick={() => setImportMode('file')}><Upload size={15} /> Từ tệp</button>
<button className={importMode === 'url' ? 'active' : ''} onClick={() => setImportMode('url')}><Link size={15} /> Từ URL</button>
</div><form onSubmit={importSource}><label>Tiêu đề<input required value={importTitle} onChange={e => setImportTitle(e.target.value)} placeholder="Tên tài liệu" /></label>{importMode === 'file' ? <label className="file-drop"><Upload size={26} /><strong>{file?.name || 'Chọn tài liệu'}</strong><small>PDF, DOCX hoặc văn bản. Giới hạn do máy chủ kiểm tra.</small><input required type="file" accept=".pdf,.docx,.txt,.md,.csv" onChange={e => setFile(e.target.files?.[0] || null)} /></label> : <label>Địa chỉ trang web<input required type="url" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://example.com/chinh-sach" /><small>Chỉ nhập URL công khai mà bạn có quyền sử dụng.</small></label>}{error && <Alert message={error} />}<div className="modal-actions"><button type="button" className="button secondary" disabled={!!busy} onClick={() => setImportOpen(false)}>Hủy</button>
<button className="button primary" disabled={!!busy}>{busy === 'import' ? 'Đang nhập…' : 'Nhập tài liệu'}</button>
</div></form></Modal>}
  </div>;
}

export function PagesPanel({ pages, user, csrf, onRefresh }: Common & { user: User; onRefresh: () => Promise<unknown> }) {
  const [error, setError] = useState(''); const [notice, setNotice] = useState(''); const [busy, setBusy] = useState('');
  const [confirmPage, setConfirmPage] = useState<Page | null>(null); const [editPage, setEditPage] = useState<Page | null>(null); const [tone, setTone] = useState('');
  const [selectionOpen, setSelectionOpen] = useState(false);
  const [selection, setSelection] = useState<{ pages: { id: string; name: string; category: string }[]; selectionId: string | null } | null>(null);
  const [selectionLoading, setSelectionLoading] = useState(false);
  const [pageIds, setPageIds] = useState<string[]>([]);
  async function loadSelection() {
    setSelectionOpen(true); setSelectionLoading(true); setError('');
    try { setSelection(await request('/api/meta/selection')); setPageIds([]); }
    catch (err) { setError(errorText(err)); } finally { setSelectionLoading(false); }
  }
  useEffect(() => { if (user.role === 'ADMIN' && new URLSearchParams(window.location.search).has('selectPages')) void loadSelection(); }, [user.role]);
  function closeSelection() {
    if (busy) return;
    setSelectionOpen(false);
    const url = new URL(window.location.href); url.searchParams.delete('selectPages'); window.history.replaceState(null, '', url);
  }
  async function connectSelected() {
    if (!selection?.selectionId || !pageIds.length || busy) return;
    setBusy('selection'); setError('');
    try {
      const result = await post<{ results: { id: string; connected: boolean }[] }>('/api/meta/selection', { selectionId: selection.selectionId, pageIds }, csrf);
      setSelectionOpen(false);
      const url = new URL(window.location.href); url.searchParams.delete('selectPages'); window.history.replaceState(null, '', url);
      const failed = result.results.filter(page => !page.connected).length;
      if (failed) setError(`Có ${failed} Page chưa đăng ký được webhook. Kiểm tra trạng thái từng Page và kết nối lại sau khi kiểm tra quyền Meta.`);
      else setNotice(`Đã kết nối ${result.results.length} Page. AI tự động đang tắt; kiểm tra tri thức trước khi bật.`);
      await onRefresh();
    } catch (err) { setError(errorText(err)); } finally { setBusy(''); }
  }
  async function update(page: Page, values: { aiEnabled?: boolean; tone?: string }) {
    setBusy(page.id); setError('');
    try { await post('/api/pages', { action: 'update', id: page.id, ...values }, csrf); await onRefresh(); setConfirmPage(null); setEditPage(null); setNotice('Đã cập nhật cấu hình Page.'); }
    catch (err) { setError(errorText(err)); } finally { setBusy(''); }
  }
  return <div className="section-page"><div className="section-heading"><div><span className="eyebrow">MỘT ĐỘI NGŨ, NHIỀU KẾT NỐI</span><h1>Facebook Pages</h1><p>Quản lý kết nối và cách AI hỗ trợ trên từng Page.</p>
</div>{user.role === 'ADMIN' && <a className="button primary" href="/api/meta/connect"><Plus size={17} /> Kết nối Facebook</a>}</div>{error && <Alert message={error} onClose={() => setError('')} />}{notice && <Alert message={notice} kind="success" onClose={() => setNotice('')} />}<div className="info-banner"><ShieldCheck size={21} /><div><strong>Kết nối thật. Trạng thái rõ ràng.</strong><p>Page demo không kết nối Facebook. Bật AI không đồng nghĩa đã bật gửi tin thật; cấu hình gửi và quyền Meta cần hợp lệ.</p>
</div></div>
    {!pages.length ? <Empty title="Chưa có Facebook Page" description={user.role === 'ADMIN' ? 'Kết nối tài khoản Facebook để chọn các Page bạn quản lý.' : 'Liên hệ quản trị viên để được cấp quyền vào Page.'} /> : <div className="pages-grid">{pages.map(page => <article className="surface page-card" key={page.id}><div className="page-card-top"><span className="page-logo page-tint" style={{ '--page-color': page.color } as CSSProperties}>{initials(page.name)}<i className="facebook-mini">f</i></span><span className={`badge ${page.demo ? 'amber' : page.connection === 'CONNECTED' ? 'teal' : 'neutral'}`}>{page.demo ? 'DEMO · Không kết nối thật' : page.connection === 'CONNECTED' ? 'Đã kết nối' : page.connection === 'ERROR' ? 'Lỗi kết nối' : 'Chưa kết nối'}</span></div><h2>{page.name}</h2><p>{page.category}</p>
<div className="page-connection"><Globe size={15} /><span>{page.demo ? 'Môi trường thử nghiệm, không gửi Facebook' : `Trạng thái Meta: ${page.connection}`}</span></div>{page.lastError && <Alert message={page.lastError} />}<div className="page-ai"><span><Bot size={19} /><div><strong>Trợ lý AI</strong><small>{page.aiEnabled ? 'Được phép tự động phản hồi' : 'Đang tắt tự động phản hồi'}</small></div></span><button role="switch" aria-checked={page.aiEnabled} aria-label={`Bật AI cho ${page.name}`} className={`toggle ${page.aiEnabled ? 'on' : ''}`} disabled={!!busy || user.role !== 'ADMIN'} onClick={() => setConfirmPage(page)}><i /></button>
</div><div className="page-card-footer"><span>{page.demo ? 'Dữ liệu thử nghiệm' : 'Facebook Messenger'}</span><button className="text-button" disabled={user.role !== 'ADMIN'} onClick={() => { setEditPage(page); setTone(page.tone || ''); }}>Giọng điệu AI <ChevronRight size={14} /></button>
</div></article>)}</div>}
    {user.role !== 'ADMIN' && <p className="muted"><ShieldCheck size={14} /> Chỉ quản trị viên có thể thay đổi cấu hình và kết nối Page.</p>
}
    {selectionOpen && <Modal title="Chọn Facebook Pages để kết nối" onClose={closeSelection}><p>Chỉ Pages bạn chọn sẽ được kết nối vào không gian này. AI tự động mặc định tắt; kiểm tra tri thức trước khi bật.</p>{selectionLoading ? <Loading label="Đang tải Pages được Meta cấp quyền…" /> : !selection?.selectionId ? <><Alert message={error || 'Không có phiên lựa chọn hợp lệ. Hãy kết nối Facebook lại.'} /><button className="button secondary" onClick={() => void loadSelection()}>Thử lại</button><a className="text-button" href="/api/meta/connect">Kết nối lại Facebook</a></> : <><div className="selection-list">{selection.pages.length ? selection.pages.map(page => <label className="selection-page" key={page.id}><input type="checkbox" disabled={!!busy} checked={pageIds.includes(page.id)} onChange={e => setPageIds(ids => e.target.checked ? [...ids, page.id] : ids.filter(id => id !== page.id))} /><span className="avatar indigo">{initials(page.name)}</span><span><strong>{page.name}</strong><small>{page.category || 'Facebook Page'}</small></span></label>) : <Empty title="Không có Page được cấp quyền" description="Kiểm tra quyền quản lý Page trên Facebook rồi kết nối lại." />}</div>{error && <Alert message={error} />}<div className="modal-actions"><span className="muted">Đã chọn {pageIds.length} Page</span><button className="button secondary" disabled={!!busy} onClick={closeSelection}>Để sau</button><button className="button primary" disabled={!!busy || !pageIds.length} onClick={() => void connectSelected()}>{busy === 'selection' ? 'Đang kết nối…' : 'Kết nối Pages đã chọn'}</button></div></>}</Modal>}
    {confirmPage && <Modal title={confirmPage.aiEnabled ? 'Tạm dừng trợ lý AI?' : 'Bật trợ lý AI?'} onClose={() => setConfirmPage(null)}><p>{confirmPage.aiEnabled ? `AI sẽ không tự động trả lời tin nhắn mới trên ${confirmPage.name}.` : `AI có thể tự động phản hồi trên ${confirmPage.name} bằng tri thức đã xuất bản. Kiểm tra tri thức và thử phản hồi trước khi bật.`}</p>
{!confirmPage.aiEnabled && <Alert kind="warning" message={confirmPage.demo ? 'Đây là Page demo. Phản hồi chỉ được mô phỏng, không gửi tới Facebook thật.' : 'Tin nhắn có thể được gửi thật nếu gửi Meta đã được bật. Bật AI không đảm bảo Page đã kết nối.'} />}{error && <Alert message={error} />}<div className="modal-actions"><button className="button secondary" disabled={!!busy} onClick={() => setConfirmPage(null)}>Hủy</button>
<button className="button primary" disabled={!!busy} onClick={() => void update(confirmPage, { aiEnabled: !confirmPage.aiEnabled })}>{busy ? 'Đang cập nhật…' : 'Xác nhận'}</button>
</div></Modal>}
    {editPage && <Modal title="Giọng điệu của trợ lý AI" onClose={() => setEditPage(null)}><p>Điều chỉnh phong cách trả lời cho {editPage.name}. Giọng điệu không thay thế nguồn tri thức.</p>
<label>Hướng dẫn giọng điệu<textarea rows={5} maxLength={1000} value={tone} placeholder="Thân thiện, ngắn gọn, lịch sự. Không bịa thông tin." onChange={e => setTone(e.target.value)} /></label>{error && <Alert message={error} />}<div className="modal-actions"><button className="button secondary" disabled={!!busy} onClick={() => setEditPage(null)}>Hủy</button>
<button className="button primary" disabled={!!busy || !tone.trim()} onClick={() => void update(editPage, { tone: tone.trim() })}>{busy ? 'Đang lưu…' : 'Lưu giọng điệu'}</button>
</div></Modal>}
  </div>;
}

type SettingsData = { appUrl: string; webhookUrl: string; oauthUrl: string; metaConfigured: boolean; sendEnabled: boolean; aiConfigured: boolean; queue: { pending: number; failed: number }; members: Member[]; audit: { id?: string; action: string; target: string; createdAt: string; user?: { name: string }; userId?: string | null }[] };
export function SettingsPanel({ pages, user, csrf }: Common & { user: User }) {
  const [data, setData] = useState<SettingsData | null>(null); const [loading, setLoading] = useState(true); const [error, setError] = useState(''); const [notice, setNotice] = useState(''); const [busy, setBusy] = useState('');
  const [createOpen, setCreateOpen] = useState(false); const [name, setName] = useState(''); const [email, setEmail] = useState(''); const [newUsername, setNewUsername] = useState(''); const [password, setPassword] = useState(''); const [role, setRole] = useState('AGENT');
  const [resetMember, setResetMember] = useState<Member | null>(null); const [resetPassword, setResetPassword] = useState('');
  const [removeMember, setRemoveMember] = useState<Member | null>(null);
  const [grantMember, setGrantMember] = useState<Member | null>(null); const [grantPageId, setGrantPageId] = useState(pages[0]?.id || ''); const [grantEnabled, setGrantEnabled] = useState(true); const [copied, setCopied] = useState('');
  async function load() { setData(await request<SettingsData>('/api/settings')); }
  useEffect(() => { if (user.role !== 'ADMIN') { setLoading(false); return; } let active = true; request<SettingsData>('/api/settings').then(result => { if (active) setData(result); }).catch(err => { if (active) setError(errorText(err)); }).finally(() => { if (active) setLoading(false); }); return () => { active = false; }; }, [user.role]);
  async function create(event: FormEvent) {
    event.preventDefault(); setBusy('create'); setError('');
    try { await post('/api/settings', { action: 'create-user', name: name.trim(), email: email.trim(), username: newUsername.trim().toLowerCase(), password, role }, csrf); await load(); setCreateOpen(false); setName(''); setEmail(''); setNewUsername(''); setPassword(''); setNotice('Đã tạo tài khoản nội bộ. Chia sẻ tên đăng nhập và mật khẩu qua kênh an toàn.'); }
    catch (err) { setError(errorText(err)); } finally { setBusy(''); }
  }
  async function resetPasswordFor() {
    if (!resetMember || resetPassword.length < 12) { setError('Mật khẩu tạm tối thiểu 12 ký tự.'); return; }
    setBusy('reset'); setError('');
    try { await post('/api/settings', { action: 'reset-password', userId: resetMember.id, password: resetPassword }, csrf); setNotice(`Đã đặt lại mật khẩu cho ${resetMember.name}. Mọi thiết bị của người này đã bị đăng xuất.`); setResetMember(null); setResetPassword(''); }
    catch (err) { setError(errorText(err)); } finally { setBusy(''); }
  }
  async function removeMemberNow() {
    if (!removeMember) return; setBusy('remove'); setError('');
    try { await post('/api/settings', { action: 'delete-member', userId: removeMember.id }, csrf); await load(); setNotice(`Đã xóa tài khoản ${removeMember.name}. Hội thoại và tin nhắn vẫn được giữ.`); setRemoveMember(null); }
    catch (err) { setError(errorText(err)); } finally { setBusy(''); }
  }
  async function grant() {
    if (!grantMember || !grantPageId) return; setBusy('grant'); setError('');
    try { await post('/api/settings', { action: 'grant-page', userId: grantMember.id, pageId: grantPageId, enabled: grantEnabled }, csrf); await load(); setGrantMember(null); setNotice(grantEnabled ? 'Đã cấp quyền truy cập Page.' : 'Đã thu hồi quyền truy cập Page.'); }
    catch (err) { setError(errorText(err)); } finally { setBusy(''); }
  }
  async function copy(text: string, key: string) { try { await navigator.clipboard.writeText(text); setCopied(key); } catch { setError('Không thể sao chép. Vui lòng chọn và sao chép địa chỉ thủ công.'); } }
  if (user.role !== 'ADMIN') return <Empty title="Cài đặt dành cho quản trị viên" description="Liên hệ quản trị viên để thay đổi tài khoản, quyền Page hoặc cấu hình tích hợp." />;
  if (loading) return <Loading label="Đang tải cài đặt…" />;
  return <div className="section-page"><div className="section-heading"><div><span className="eyebrow">VẬN HÀNH AN TOÀN, CÙNG ĐỘI NGŨ</span><h1>Cài đặt không gian</h1><p>Cấu hình tích hợp, theo dõi dịch vụ và quản lý quyền truy cập.</p>
</div><span className="badge neutral"><ShieldCheck size={13} /> {user.role === 'ADMIN' ? 'Quản trị viên' : 'Chỉ xem'}</span></div>{error && <Alert message={error} onClose={() => setError('')} />}{notice && <Alert message={notice} kind="success" onClose={() => setNotice('')} />}{!data ? <Empty title="Không thể tải cài đặt" description="Trang cài đặt có thể yêu cầu quyền quản trị viên."><button className="button secondary" onClick={() => { setLoading(true); load().catch(err => setError(errorText(err))).finally(() => setLoading(false)); }}>Thử lại</button>
</Empty> : <>
    <div className="service-grid"><Service label="Tích hợp Meta" enabled={data.metaConfigured} enabledLabel="Đã cấu hình" disabledLabel="Chưa cấu hình" icon={Globe} /><Service label="Dịch vụ AI" enabled={data.aiConfigured} enabledLabel="Đã cấu hình" disabledLabel="Chưa cấu hình" icon={Sparkles} /><Service label="Gửi tin Facebook" enabled={data.sendEnabled} enabledLabel="Đã bật gửi thật" disabledLabel="Đang tắt gửi thật" icon={Send} /><div className="surface service-card"><span className="stat-icon indigo"><Layers3 size={21} /></span><div><small>Hàng đợi xử lý</small><strong>{data.queue.pending} chờ <span className={data.queue.failed ? 'text-danger' : ''}>· {data.queue.failed} lỗi</span></strong></div></div></div>
    <section className="surface setup-card"><div className="surface-header"><div><Globe size={19} /><h2>Thiết lập kết nối Facebook</h2></div><span className="badge neutral">Không hiển thị bí mật</span></div><div className="setup-content"><div className="setup-steps"><div><b>1</b><span><strong>Cấu hình ứng dụng Meta</strong><p>Quản trị viên đặt App ID, App Secret, mã xác minh webhook và khóa mã hóa trên máy chủ. Không nhập bí mật vào giao diện này.</p>
</span></div><div><b>2</b><span><strong>Đăng ký webhook và OAuth</strong><p>Trong Meta Developers, dùng các URL bên cạnh. Đăng ký sự kiện Messenger và kiểm tra quyền Page theo yêu cầu của Meta.</p>
</span></div><div><b>3</b><span><strong>Kết nối Page, kiểm tra rồi bật gửi</strong><p>Cấp quyền Page, xuất bản tri thức và thử AI. Chỉ bật gửi thật trên máy chủ sau khi kiểm tra webhook và hàng đợi.</p>
{user.role === 'ADMIN' && <a className="text-button" href="/api/meta/connect">Kết nối Facebook <ArrowUpRight size={14} /></a>}</span></div></div><div className="setup-urls">{[{ key: 'app', label: 'URL ứng dụng', value: data.appUrl }, { key: 'webhook', label: 'Webhook callback URL', value: data.webhookUrl }, { key: 'oauth', label: 'OAuth redirect URL', value: data.oauthUrl }].map(item => <div key={item.key}><label>{item.label}</label><div><code>{item.value}</code><button className="icon-button" aria-label={`Sao chép ${item.label}`} onClick={() => void copy(item.value, item.key)}>{copied === item.key ? <Check size={15} /> : <Copy size={15} />}</button>
</div></div>)}<p><ShieldCheck size={14} /> Trạng thái cấu hình không đảm bảo quyền Meta hoặc kết nối Page hợp lệ. Kiểm tra trạng thái từng Page.</p>
</div></div></section>
    <section className="surface members-card"><div className="surface-header"><div><Users size={19} /><h2>Thành viên & phân quyền</h2><span className="count-chip">{data.members.length}</span></div>{user.role === 'ADMIN' && <button className="button primary compact" onClick={() => setCreateOpen(true)}><Plus size={15} /> Thêm thành viên</button>
}</div><div className="table-wrap"><table><thead><tr><th>Thành viên</th><th>Vai trò</th><th>Quyền Page</th><th /></tr></thead><tbody>{data.members.map(member => {
      const ids = member.pageIds || member.memberships?.map(item => item.pageId) || member.pages?.map(item => item.pageId || item.id || '');
      return <tr key={member.id}><td><div className="member-cell"><span className="avatar small indigo">{initials(member.name)}</span><div><strong>{member.name}{member.id === user.id && <small> (Bạn)</small>}</strong><span>{member.email}</span>{member.username && <span className="member-username">@{member.username}</span>}</div></div></td><td><span className={`badge ${member.role === 'ADMIN' ? 'indigo' : 'neutral'}`}>{member.role === 'ADMIN' ? 'Quản trị viên' : 'Nhân viên'}</span></td><td>{member.role === 'ADMIN' ? <span className="muted">Tất cả Pages</span> : ids ? <span className="muted">{ids.length ? pages.filter(p => ids.includes(p.id)).map(p => p.name).join(', ') || `${ids.length} Pages` : 'Chưa có quyền Page'}</span> : <span className="muted">Quyền được quản lý trên máy chủ</span>}</td><td><div className="row-actions">{user.role === 'ADMIN' && member.role !== 'ADMIN' && <button className="text-button" onClick={() => { setGrantMember(member); setGrantPageId(pages[0]?.id || ''); setGrantEnabled(true); }}>Cấp / thu hồi <ChevronRight size={14} /></button>
}{user.role === 'ADMIN' && <button className="text-button" onClick={() => { setResetMember(member); setResetPassword(''); setError(''); }}>Đặt lại mật khẩu</button>
}{user.role === 'ADMIN' && member.id !== user.id && <button className="text-button danger-text" onClick={() => { setRemoveMember(member); setError(''); }}>Xóa</button>
}</div></td></tr>;
    })}</tbody></table></div>{!data.members.length && <Empty title="Chưa có thành viên" />}</section>
    <section className="surface audit-card"><div className="surface-header"><div><ShieldCheck size={19} /><h2>Nhật ký hoạt động</h2></div><small>Hoạt động gần đây</small></div>{data.audit.length ? <div className="audit-list">{data.audit.map((item, index) => <div key={item.id || index}><span className="audit-dot" /><div><strong>{item.action}</strong><span>{item.target}{item.user?.name && ` · ${item.user.name}`}</span></div><time title={fullTime(item.createdAt)}>{relativeTime(item.createdAt)}</time></div>)}</div> : <Empty title="Chưa có hoạt động" description="Thao tác quản trị sẽ được ghi lại tại đây." />}</section>
  </>}
    {createOpen && <Modal title="Thêm thành viên" onClose={() => { if (!busy) setCreateOpen(false); }}><p>Tạo tài khoản nội bộ. Nhân viên cần được cấp quyền Page sau khi tạo.</p>
<form onSubmit={create}><label>Họ và tên<input required minLength={2} maxLength={100} value={name} onChange={e => setName(e.target.value)} autoComplete="off" placeholder="Nguyễn Minh Anh" /></label><label>Email<input required type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="off" placeholder="minhanh@congty.vn" /></label><label>Tên đăng nhập<input required minLength={3} maxLength={30} value={newUsername} onChange={e => setNewUsername(e.target.value.toLowerCase())} autoComplete="off" placeholder="minhanh" /><small>3–30 ký tự, bắt đầu bằng chữ cái. Dùng để đăng nhập nhanh thay cho email.</small></label><label>Mật khẩu tạm thời<input required minLength={12} type="password" autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} /><small>Tối thiểu 12 ký tự. Chia sẻ qua kênh riêng an toàn.</small></label><label>Vai trò<select value={role} onChange={e => setRole(e.target.value)}><option value="AGENT">Nhân viên — Pages được cấp quyền</option><option value="ADMIN">Quản trị viên — toàn quyền</option></select></label>{role === 'ADMIN' && <Alert kind="warning" message="Quản trị viên có toàn quyền cấu hình và truy cập mọi Page. Chỉ cấp cho người phụ trách hệ thống." />}{error && <Alert message={error} />}<div className="modal-actions"><button type="button" className="button secondary" disabled={!!busy} onClick={() => setCreateOpen(false)}>Hủy</button>
<button className="button primary" disabled={!!busy}>{busy === 'create' ? 'Đang tạo…' : 'Tạo tài khoản'}</button>
</div></form></Modal>}
    {grantMember && <Modal title="Quyền truy cập Page" onClose={() => { if (!busy) setGrantMember(null); }}><p>Thay đổi quyền của <strong>{grantMember.name}</strong>. Thu hồi quyền sẽ loại Page khỏi không gian của nhân viên.</p>
<label>Facebook Page<select value={grantPageId} onChange={e => setGrantPageId(e.target.value)}>{pages.map(page => <option key={page.id} value={page.id}>{page.name}{page.demo ? ' · DEMO' : ''}</option>)}</select></label><div className="segmented"><button className={grantEnabled ? 'active' : ''} onClick={() => setGrantEnabled(true)}>Cấp quyền</button>
<button className={!grantEnabled ? 'active danger-text' : ''} onClick={() => setGrantEnabled(false)}>Thu hồi quyền</button>
</div><p className="muted">Đây là thao tác thay đổi quyền, không phải trạng thái quyền hiện tại.</p>
{error && <Alert message={error} />}<div className="modal-actions"><button className="button secondary" disabled={!!busy} onClick={() => setGrantMember(null)}>Hủy</button>
<button className={`button ${grantEnabled ? 'primary' : 'danger'}`} disabled={!!busy || !grantPageId} onClick={() => void grant()}>{busy === 'grant' ? 'Đang cập nhật…' : grantEnabled ? 'Xác nhận cấp quyền' : 'Xác nhận thu hồi'}</button>
</div></Modal>}
    {resetMember && <Modal title="Đặt lại mật khẩu" onClose={() => { if (!busy) { setResetMember(null); setResetPassword(''); } }}><p>Đặt mật khẩu tạm cho <strong>{resetMember.name}</strong>{resetMember.username ? ` (@${resetMember.username})` : ''}. Mọi thiết bị đang đăng nhập của người này sẽ bị đăng xuất.</p>
<label>Mật khẩu tạm thời<input required minLength={12} type="password" autoComplete="new-password" value={resetPassword} onChange={e => setResetPassword(e.target.value)} /><small>Tối thiểu 12 ký tự. Gửi qua kênh riêng và nhắc người đó đổi lại trong mục Tài khoản.</small></label>{error && <Alert message={error} />}<div className="modal-actions"><button type="button" className="button secondary" disabled={!!busy} onClick={() => { setResetMember(null); setResetPassword(''); }}>Hủy</button>
<button type="button" className="button primary" disabled={!!busy || resetPassword.length < 12} onClick={() => void resetPasswordFor()}>{busy === 'reset' ? 'Đang đặt lại…' : 'Đặt lại mật khẩu'}</button>
</div></Modal>}
    {removeMember && <Modal title="Xóa thành viên" onClose={() => { if (!busy) setRemoveMember(null); }}><Alert kind="warning" message={`Tài khoản ${removeMember.name}${removeMember.username ? ` (@${removeMember.username})` : ''} sẽ bị xóa và mọi thiết bị của người này bị đăng xuất. Hội thoại và tin nhắn vẫn được giữ lại.`} />
<p>Không thể hoàn tác thao tác này. Không thể xóa chính mình hoặc quản trị viên cuối cùng.</p>{error && <Alert message={error} />}<div className="modal-actions"><button type="button" className="button secondary" disabled={!!busy} onClick={() => setRemoveMember(null)}>Hủy</button>
<button type="button" className="button danger" disabled={!!busy} onClick={() => void removeMemberNow()}>{busy === 'remove' ? 'Đang xóa…' : 'Xóa tài khoản'}</button>
</div></Modal>}
  </div>;
}

function Service({ label, enabled, enabledLabel, disabledLabel, icon: Icon }: { label: string; enabled: boolean; enabledLabel: string; disabledLabel: string; icon: typeof Globe }) { return <div className="surface service-card"><span className={`stat-icon ${enabled ? 'teal' : 'neutral'}`}><Icon size={21} /></span><div><small>{label}</small><strong><i className={`connection-dot ${enabled ? 'ok' : ''}`} />{enabled ? enabledLabel : disabledLabel}</strong></div></div>; }
function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  const dialog = useRef<HTMLElement>(null);
  const closeRef = useRef(onClose); closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const focusable = () => Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]') || []);
    focusable()[0]?.focus();
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeRef.current();
      if (event.key === 'Tab') {
        const items = focusable(), first = items[0], last = items.at(-1);
        if (!first) { event.preventDefault(); dialog.current?.focus(); }
        else if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    window.addEventListener('keydown', handler);
    return () => { window.removeEventListener('keydown', handler); previous?.focus(); };
  }, []);
  return <div className="modal-overlay" onClick={event => { if (event.target === event.currentTarget) onClose(); }}><section ref={dialog} tabIndex={-1} className="modal" role="dialog" aria-modal="true" aria-label={title}><header><h2>{title}</h2><button className="icon-button" onClick={onClose} aria-label="Đóng hộp thoại"><X size={20} /></button>
</header>{children}</section></div>;
}

type AccountData = { name: string; username: string | null; email: string; role: string; usernameRule: string };
export function AccountPanel({ user, csrf }: { user: User; csrf: string }) {
  const [data, setData] = useState<AccountData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState('');
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  useEffect(() => {
    let active = true;
    request<AccountData>('/api/auth/account').then(result => { if (!active) return; setData(result); setName(result.name); setUsername(result.username || ''); })
      .catch(err => { if (active) setError(errorText(err)); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  async function saveProfile(event: FormEvent) {
    event.preventDefault(); if (busy) return; setBusy('profile'); setError(''); setNotice('');
    try {
      const result = await post<{ username?: string }>('/api/auth/account', { action: 'profile', name: name.trim(), username: username.trim().toLowerCase() }, csrf);
      setData(previous => previous ? { ...previous, name: name.trim(), username: result.username || username.trim().toLowerCase() } : previous);
      setNotice(`Đã lưu. Lần sau bạn có thể đăng nhập bằng tên "${result.username || username.trim().toLowerCase()}".`);
    } catch (err) { setError(errorText(err)); } finally { setBusy(''); }
  }
  async function savePassword(event: FormEvent) {
    event.preventDefault(); if (busy) return;
    setError(''); setNotice('');
    if (newPassword !== confirm) { setError('Hai lần nhập mật khẩu mới không khớp.'); return; }
    setBusy('password');
    try {
      await post('/api/auth/account', { action: 'password', currentPassword, newPassword }, csrf);
      setCurrentPassword(''); setNewPassword(''); setConfirm('');
      setNotice('Đã đổi mật khẩu. Các thiết bị khác đã bị đăng xuất, riêng phiên này vẫn giữ.');
    } catch (err) { setError(errorText(err)); } finally { setBusy(''); }
  }
  async function revokeOthers() {
    if (busy) return; setBusy('revoke'); setError(''); setNotice('');
    try { const result = await post<{ revoked: number }>('/api/auth/account', { action: 'revoke-sessions' }, csrf); setNotice(result.revoked ? `Đã đăng xuất ${result.revoked} phiên khác.` : 'Không có phiên nào khác đang mở.'); }
    catch (err) { setError(errorText(err)); } finally { setBusy(''); }
  }
  if (loading) return <Loading label="Đang tải tài khoản…" />;
  if (!data) return <Empty title="Không thể tải tài khoản" description={error || 'Vui lòng thử lại.'} />;
  return <div className="section-page"><div className="section-heading"><div><span className="eyebrow">THÔNG TIN ĐĂNG NHẬP CỦA BẠN</span><h1>Tài khoản</h1><p>Đổi tên đăng nhập ngắn gọn và mật khẩu dễ nhớ cho riêng bạn.</p>
</div><span className="badge neutral"><ShieldCheck size={13} /> {data.role === 'ADMIN' ? 'Quản trị viên' : 'Nhân viên'}</span></div>
    {error && <Alert message={error} onClose={() => setError('')} />}{notice && <Alert message={notice} kind="success" onClose={() => setNotice('')} />}
    <div className="knowledge-grid"><section className="surface"><div className="surface-header"><div><Users size={19} /><h2>Hồ sơ đăng nhập</h2></div><small>Email dùng để liên hệ, không đổi được tại đây</small></div>
      <form onSubmit={saveProfile} className="account-form"><label>Họ và tên<input required minLength={2} maxLength={100} value={name} onChange={event => setName(event.target.value)} autoComplete="name" /></label>
        <label>Tên đăng nhập<input required minLength={3} maxLength={30} value={username} onChange={event => setUsername(event.target.value.toLowerCase())} autoComplete="username" placeholder="admin" /><small>{data.usernameRule}</small></label>
        <label>Email<input value={data.email} readOnly disabled /><small>Liên hệ quản trị viên nếu cần đổi email.</small></label>
        <div className="modal-actions"><button className="button primary" disabled={!!busy || !name.trim() || username.trim().length < 3}>{busy === 'profile' ? 'Đang lưu…' : 'Lưu thay đổi'}</button>
        </div></form></section>
      <section className="surface"><div className="surface-header"><div><LockKeyhole size={19} /><h2>Đổi mật khẩu</h2></div></div>
        <form onSubmit={savePassword} className="account-form"><label>Mật khẩu hiện tại<input required type={showPassword ? 'text' : 'password'} value={currentPassword} onChange={event => setCurrentPassword(event.target.value)} autoComplete="current-password" /></label>
          <label>Mật khẩu mới<input required minLength={12} type={showPassword ? 'text' : 'password'} value={newPassword} onChange={event => setNewPassword(event.target.value)} autoComplete="new-password" placeholder="Tối thiểu 12 ký tự" /></label>
          <label>Nhập lại mật khẩu mới<input required minLength={12} type={showPassword ? 'text' : 'password'} value={confirm} onChange={event => setConfirm(event.target.value)} autoComplete="new-password" /></label>
          <label className="checkbox-row"><input type="checkbox" checked={showPassword} onChange={event => setShowPassword(event.target.checked)} /> Hiện mật khẩu khi nhập</label>
          <div className="modal-actions"><button className="button primary" disabled={!!busy || newPassword.length < 12}>{busy === 'password' ? 'Đang đổi…' : 'Đổi mật khẩu'}</button>
          <button type="button" className="button secondary" disabled={!!busy} onClick={() => void revokeOthers()}>{busy === 'revoke' ? 'Đang xử lý…' : 'Đăng xuất thiết bị khác'}</button>
          </div><p className="muted"><ShieldCheck size={14} /> Đổi mật khẩu sẽ đăng xuất mọi thiết bị khác, riêng phiên này vẫn giữ. Không dùng lại mật khẩu cũ.</p></form></section></div>
    <p className="muted">Quên mật khẩu? Quản trị viên có thể đặt lại trong Cài đặt → Thành viên, hoặc dùng lệnh <code>pnpm admin:reset</code> trên máy chủ.</p>
  </div>;
}
