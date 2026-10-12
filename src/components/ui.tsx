'use client';

import { AlertCircle, Inbox, LoaderCircle, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { conversationStatusLabel } from './labels';

export type User = { id: string; name: string; email: string; role: string; csrf: string };
export type Member = { id: string; name: string; email?: string; username?: string | null; role: string; pageIds?: string[]; pages?: { id?: string; pageId?: string }[]; memberships?: { pageId: string }[] };
export type Page = { id: string; name: string; category: string; color: string; demo: boolean; aiEnabled: boolean; connection: string; lastError?: string | null; tone?: string };
export type Conversation = { id: string; pageId: string; customerName: string; status: string; assignedTo?: string | null; resolved: boolean; lastCustomerAt?: string | null; lastIncomingAt?: string | null; lastMessageAt: string; preview: string; unread: boolean | number; page: { name: string; color: string; demo: boolean } };
export type Message = { id: string; role: 'CUSTOMER' | 'AI' | 'HUMAN' | 'NOTE'; text: string; state: string; error?: string | null; createdAt: string; receivedAt?: string | null; attachments?: unknown };
export type SourceRef = { id?: string; title?: string; text?: string };
export type Run = { answer?: string | null; decision: string; sources: unknown; createdAt: string };
export type ConversationList = { items: Conversation[]; nextCursor: string | null };
export type Detail = Conversation & { messages: Message[]; runs: Run[]; nextMessageCursor: string | null };
export type Bootstrap = { user: User; pages: Page[]; stats: { unread: number; needsHuman: number; aiReplies: number; total: number }; conversations: Conversation[]; conversationNextCursor?: string | null; members: Member[] };
export type KnowledgeSource = { id: string; title: string; kind: string; draft: string; published?: string | null; version: number; updatedAt: string };

export async function request<T>(url: string, options: RequestInit = {}, csrf?: string): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body && !(options.body instanceof FormData)) headers.set('Content-Type', 'application/json');
  if (options.method && !['GET', 'HEAD'].includes(options.method.toUpperCase())) headers.set('x-csrf-token', csrf || '');
  const response = await fetch(url, { ...options, headers, credentials: 'same-origin', cache: 'no-store' });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 401) throw new Error('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
    const safe = typeof data?.error === 'string' && !data.error.includes('<') && data.error.length < 400 ? data.error : 'Không thể xử lý yêu cầu. Vui lòng thử lại.';
    throw new Error(safe);
  }
  if (data === null && response.status !== 204) throw new Error('Máy chủ trả về dữ liệu không hợp lệ. Vui lòng thử lại.');
  return data as T;
}
export const post = <T,>(url: string, body: unknown, csrf: string) => request<T>(url, { method: 'POST', body: JSON.stringify(body) }, csrf);
export const errorText = (error: unknown) => error instanceof TypeError ? 'Không thể kết nối máy chủ. Kiểm tra mạng và thử lại.' : error instanceof Error ? error.message : 'Có lỗi xảy ra. Vui lòng thử lại.';
export function relativeTime(value?: string | null) {
  if (!value) return 'Chưa có';
  const date = new Date(value); if (Number.isNaN(date.getTime())) return '—';
  const seconds = Math.round((date.getTime() - Date.now()) / 1000);
  const formatter = new Intl.RelativeTimeFormat('vi', { numeric: 'auto' });
  if (Math.abs(seconds) < 60) return 'Vừa xong';
  if (Math.abs(seconds) < 3600) return formatter.format(Math.round(seconds / 60), 'minute');
  if (Math.abs(seconds) < 86400) return formatter.format(Math.round(seconds / 3600), 'hour');
  if (Math.abs(seconds) < 604800) return formatter.format(Math.round(seconds / 86400), 'day');
  return new Intl.DateTimeFormat('vi', { day: '2-digit', month: '2-digit' }).format(date);
}
export function fullTime(value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat('vi', { dateStyle: 'medium', timeStyle: 'short' }).format(date); }
export const initials = (name: string) => name.trim().split(/\s+/).slice(-2).map(s => s[0]).join('').toUpperCase() || '?';
export function StatusBadge({ status, resolved }: { status: string; resolved?: boolean }) {
  const label = conversationStatusLabel(status, resolved);
  return <span className={`badge ${resolved ? 'neutral' : status === 'NEEDS_HUMAN' ? 'amber' : status.includes('HUMAN') ? 'indigo' : 'teal'}`}>{label}</span>;
}
export function Empty({ title, description, children, icon }: { title: string; description?: string; children?: ReactNode; icon?: ReactNode }) { return <div className="empty-state"><span className="empty-icon">{icon ?? <Inbox size={28} />}</span><h3>{title}</h3>{description && <p>{description}</p>}{children}</div>; }
export function Loading({ label = 'Đang tải dữ liệu…' }: { label?: string }) { return <div className="loading-state" role="status"><LoaderCircle className="spin" size={23} /><span>{label}</span></div>; }
export function Alert({ message, onClose, kind = 'error' }: { message: string; onClose?: () => void; kind?: 'error' | 'success' | 'warning' }) { return <div className={`alert ${kind}`} role={kind === 'error' ? 'alert' : 'status'}><AlertCircle size={17} /><span>{message}</span>{onClose && <button className="icon-button" onClick={onClose} aria-label="Đóng thông báo"><X size={16} /></button>}</div>; }
export function sourcesOf(value: unknown): SourceRef[] { if (!Array.isArray(value)) return []; return value.map(item => typeof item === 'string' ? { title: item } : item && typeof item === 'object' ? item as SourceRef : {}).filter(item => item.title || item.id || item.text); }
