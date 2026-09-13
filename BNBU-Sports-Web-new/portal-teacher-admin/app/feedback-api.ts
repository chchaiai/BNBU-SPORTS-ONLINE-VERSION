import { request } from './api-client';
import type { SupportTicket, TicketCategory, TicketStatus } from './admin-types';

export type FeedbackStatus = 'OPEN' | 'IN_PROGRESS' | 'WAITING_TECH' | 'RESOLVED' | 'CLOSED';
export type FeedbackItem = {
  id: string; category: TicketCategory; content: string; status: FeedbackStatus; version: number;
  createdAt: string; updatedAt: string;
  requester: { name: string | null; studentNumber: string | null; email: string | null };
};
export type FeedbackDetail = FeedbackItem & {
  publicReply: string | null;
  history: { id: string; actorUserId: string; actorName: string | null; publicReply: string;
    previousStatus: FeedbackStatus; nextStatus: FeedbackStatus; occurredAt: string; eventVersion: number }[];
};
export type FeedbackPage = {
  items: FeedbackItem[]; page: number; pageSize: 6; total: number;
  summary: { total: number; pending: number; waitingTech: number; resolved: number };
};
export const feedbackTicketStatuses: Record<FeedbackStatus, TicketStatus> = {
  OPEN: 'pending', IN_PROGRESS: 'in_progress', WAITING_TECH: 'technical', RESOLVED: 'resolved', CLOSED: 'closed',
};
const writeStatuses: Record<Exclude<TicketStatus, 'pending'>, Exclude<FeedbackStatus, 'OPEN'>> = {
  in_progress: 'IN_PROGRESS', technical: 'WAITING_TECH', resolved: 'RESOLVED', closed: 'CLOSED',
};
export function listAdminFeedback(input: { page?: number; search?: string; category?: TicketCategory; status?: FeedbackStatus } = {}) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) if (value !== undefined && value !== '') query.set(key, String(value));
  return request<FeedbackPage>(`/admin/feedback?${query.toString()}`);
}
export function getAdminFeedback(id: string) {
  return request<FeedbackDetail>(`/admin/feedback/${encodeURIComponent(id)}`);
}
export function handleAdminFeedback(id: string, status: Exclude<TicketStatus, 'pending'>,
  publicReply: string, expectedVersion: number, idempotencyKey: string) {
  return request<{ id: string; status: FeedbackStatus; publicReply: string; version: number; updatedAt: string }>(
    `/admin/feedback/${encodeURIComponent(id)}/handling`, { method: 'POST',
      body: { status: writeStatuses[status], publicReply, expectedVersion }, headers: { 'Idempotency-Key': idempotencyKey } });
}
export function feedbackToTicket(item: FeedbackItem | FeedbackDetail): SupportTicket {
  return { id: item.id, requester: item.requester.name ?? item.requester.studentNumber ?? item.id,
    account: item.requester.studentNumber ?? '', category: item.category, subject: item.content,
    content: item.content, source: 'student', submittedAt: item.createdAt, status: feedbackTicketStatuses[item.status],
    replies: 'history' in item ? item.history.map(event => ({ id: event.id, author: event.actorName ?? event.actorUserId,
      message: event.publicReply, createdAt: event.occurredAt })) : [] };
}
