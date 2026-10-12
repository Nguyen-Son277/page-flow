// Vietnamese labels for values the API stores as stable English codes. Keeping the
// mapping in one module stops a raw enum from leaking into the UI and keeps every screen
// consistent; an unknown value is returned unchanged so new codes stay debuggable.
export function decisionLabel(decision: string) {
  if (decision === 'ANSWER') return 'Đã trả lời';
  if (decision === 'NEEDS_HUMAN') return 'Cần nhân viên';
  return decision;
}
export function connectionLabel(connection: string) {
  if (connection === 'CONNECTED') return 'Đã kết nối';
  if (connection === 'DISCONNECTED') return 'Chưa kết nối';
  if (connection === 'ERROR') return 'Lỗi kết nối';
  if (connection === 'DEMO') return 'Mô phỏng';
  return connection;
}
export function conversationStatusLabel(status: string, resolved?: boolean) {
  if (resolved) return 'Đã xử lý';
  if (status === 'NEEDS_HUMAN') return 'Cần hỗ trợ';
  if (status.includes('HUMAN')) return 'Nhân viên';
  if (status === 'AI_ACTIVE') return 'AI đang hỗ trợ';
  return status;
}
export function messageStateLabel(state: string, demo = false) {
  switch (state) {
    case 'PENDING': return 'Đang chờ gửi';
    case 'SENT': return demo ? 'Mô phỏng · Không gửi Facebook' : 'Đã gửi';
    case 'DELIVERED': return 'Đã chuyển đến';
    case 'READ': return 'Khách đã xem';
    case 'UNCERTAIN': return 'Chưa xác định đã gửi · Không gửi lại tự động';
    case 'CANCELLED': return 'Đã hủy gửi';
    case 'FAILED': return 'Gửi thất bại';
    case 'DISMISSED': return 'Đã bỏ qua, không gửi lại';
    default: return state;
  }
}
// Every action string the server currently writes to AuditLog, plus the conversation
// actions recorded by the conversation route.
const AUDIT_ACTIONS: Record<string, string> = {
  'user.setup': 'Tạo quản trị viên đầu tiên',
  'user.create': 'Thêm thành viên',
  'user.delete': 'Xóa thành viên',
  'password.change': 'Đổi mật khẩu của mình',
  'password.reset': 'Đặt lại mật khẩu thành viên',
  'profile.update': 'Cập nhật hồ sơ',
  'session.setup-login': 'Đăng nhập sau khi thiết lập',
  'session.revoke-others': 'Đăng xuất thiết bị khác',
  'page.grant': 'Cấp quyền Page',
  'page.revoke': 'Thu hồi quyền Page',
  'page.update': 'Cập nhật cấu hình Page',
  'page.disconnect': 'Ngắt kết nối Page',
  'meta.connect': 'Kết nối Facebook Page',
  'knowledge.import': 'Nhập tài liệu tri thức',
  'knowledge.save': 'Lưu nháp tri thức',
  'knowledge.publish': 'Xuất bản tri thức',
  'knowledge.delete': 'Xóa nguồn tri thức',
  'webhook.replay': 'Phát lại sự kiện webhook lỗi',
  'webhook.dismiss': 'Bỏ qua sự kiện webhook lỗi',
  'send.retry': 'Gửi lại tin lỗi',
  'send.dismiss': 'Bỏ qua tin gửi lỗi',
  takeover: 'Tiếp quản hội thoại',
  resume: 'Trả lại AI',
  resolve: 'Đánh dấu đã xử lý',
  assign: 'Phân công nhân viên',
  message: 'Gửi tin cho khách',
  note: 'Ghi chú nội bộ',
  'demo-incoming': 'Tạo tin mẫu trên Page demo'
};
export function auditActionLabel(action: string) {
  return AUDIT_ACTIONS[action] || action;
}
