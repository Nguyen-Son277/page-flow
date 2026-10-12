import { describe, it, expect } from 'vitest';
import { auditActionLabel, connectionLabel, conversationStatusLabel, decisionLabel, messageStateLabel } from '../src/components/labels';
// The label maps exist so no raw API enum reaches the screen. These cases enumerate every
// code the server can currently produce, so adding a new code without a label fails here.
describe('Vietnamese labels for API codes', () => {
  it('translates every AI decision', () => {
    expect(decisionLabel('ANSWER')).toBe('Đã trả lời');
    expect(decisionLabel('NEEDS_HUMAN')).toBe('Cần nhân viên');
    expect(decisionLabel('SOMETHING_NEW')).toBe('SOMETHING_NEW');
  });
  it('translates every Page connection state', () => {
    expect(connectionLabel('CONNECTED')).toBe('Đã kết nối');
    expect(connectionLabel('DISCONNECTED')).toBe('Chưa kết nối');
    expect(connectionLabel('ERROR')).toBe('Lỗi kết nối');
    expect(connectionLabel('DEMO')).toBe('Mô phỏng');
    expect(connectionLabel('UNKNOWN')).toBe('UNKNOWN');
  });
  it('translates conversation status and respects the resolved flag', () => {
    expect(conversationStatusLabel('AI_ACTIVE')).toBe('AI đang hỗ trợ');
    expect(conversationStatusLabel('NEEDS_HUMAN')).toBe('Cần hỗ trợ');
    expect(conversationStatusLabel('HUMAN_ACTIVE')).toBe('Nhân viên');
    expect(conversationStatusLabel('AI_ACTIVE', true)).toBe('Đã xử lý');
    expect(conversationStatusLabel('OTHER')).toBe('OTHER');
  });
  it('translates every message state the send pipeline can store', () => {
    for (const state of ['PENDING', 'DELIVERED', 'READ', 'UNCERTAIN', 'CANCELLED', 'FAILED', 'DISMISSED']) {
      expect(messageStateLabel(state), state).not.toBe(state);
    }
    // A simulated send reads differently from a real one.
    expect(messageStateLabel('SENT', true)).toBe('Mô phỏng · Không gửi Facebook');
    expect(messageStateLabel('SENT', false)).toBe('Đã gửi');
    expect(messageStateLabel('BRAND_NEW')).toBe('BRAND_NEW');
  });
  it('translates every audit action the server writes', () => {
    const actions = ['user.setup', 'user.create', 'user.delete', 'password.change', 'password.reset', 'profile.update', 'session.setup-login', 'session.revoke-others', 'page.grant', 'page.revoke', 'page.update', 'page.disconnect', 'meta.connect', 'knowledge.import', 'knowledge.save', 'knowledge.publish', 'knowledge.delete', 'webhook.replay', 'webhook.dismiss', 'send.retry', 'send.dismiss', 'takeover', 'resume', 'resolve', 'assign', 'message', 'note', 'demo-incoming'];
    for (const action of actions) expect(auditActionLabel(action), action).not.toBe(action);
    expect(auditActionLabel('future.action')).toBe('future.action');
  });
});
