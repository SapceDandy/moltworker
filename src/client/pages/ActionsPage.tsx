import { useState, useEffect, useCallback } from 'react';
import {
  listActions,
  approveAction,
  rejectAction,
  sendAction,
  type DraftAction,
} from '../api';
import './ActionsPage.css';

const ACTION_TYPE_ICONS: Record<string, string> = {
  email_draft: '✉️',
  calendar_event: '📅',
  task_update: '✏️',
  message: '💬',
};

function ActionTypeLabel(type: string) {
  return type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function EmailPreview({ content }: { content: string }) {
  try {
    const data = JSON.parse(content);
    return (
      <div className="action-email-preview">
        <div className="action-email-field">
          <span className="action-email-label">To:</span>
          <span>{data.to || '—'}</span>
        </div>
        {data.cc && (
          <div className="action-email-field">
            <span className="action-email-label">Cc:</span>
            <span>{data.cc}</span>
          </div>
        )}
        <div className="action-email-field">
          <span className="action-email-label">Subject:</span>
          <span>{data.subject || '—'}</span>
        </div>
        <div className="action-email-body">{data.body || data.html || ''}</div>
      </div>
    );
  } catch {
    return <div className="action-detail-content">{content}</div>;
  }
}

function ActionDetailPanel({
  action,
  onClose,
  onStatusChange,
}: {
  action: DraftAction;
  onClose: () => void;
  onStatusChange: (id: string, newStatus: string) => void;
}) {
  const [processing, setProcessing] = useState(false);

  const handleApprove = async () => {
    setProcessing(true);
    try {
      await approveAction(action.id);
      onStatusChange(action.id, 'approved');
    } catch {
      // ignore
    } finally {
      setProcessing(false);
    }
  };

  const handleReject = async () => {
    const reason = prompt('Rejection reason (optional):');
    if (reason === null) return; // cancelled
    setProcessing(true);
    try {
      await rejectAction(action.id, reason);
      onStatusChange(action.id, 'rejected');
    } catch {
      // ignore
    } finally {
      setProcessing(false);
    }
  };

  const handleSend = async () => {
    if (!confirm('Send this email now?')) return;
    setProcessing(true);
    try {
      const res = await sendAction(action.id);
      onStatusChange(action.id, res.status || 'sent');
    } catch {
      onStatusChange(action.id, 'failed');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <>
      <div className="detail-overlay" onClick={onClose} />
      <div className="detail-panel">
        <div className="detail-header">
          <h3>
            <span className="action-type-icon">{ACTION_TYPE_ICONS[action.action_type] || '📋'}</span>{' '}
            {action.title}
          </h3>
          <button className="detail-close" onClick={onClose}>&times;</button>
        </div>

        <div className="detail-body">
          <div className="detail-row">
            <div className="detail-field">
              <span className="detail-label">Type</span>
              <span className="detail-value">{ActionTypeLabel(action.action_type)}</span>
            </div>
            <div className="detail-field">
              <span className="detail-label">Status</span>
              <span className="detail-value">
                <span className={`action-status-badge status-${action.status}`}>{action.status}</span>
              </span>
            </div>
          </div>
          <div className="detail-row">
            <div className="detail-field">
              <span className="detail-label">Created By</span>
              <span className="detail-value">{action.created_by}</span>
            </div>
            <div className="detail-field">
              <span className="detail-label">Created</span>
              <span className="detail-value">{new Date(action.created_at).toLocaleString()}</span>
            </div>
          </div>
          {action.reviewed_at && (
            <div className="detail-row">
              <div className="detail-field">
                <span className="detail-label">Reviewed By</span>
                <span className="detail-value">{action.reviewed_by || '—'}</span>
              </div>
              <div className="detail-field">
                <span className="detail-label">Reviewed</span>
                <span className="detail-value">{new Date(action.reviewed_at).toLocaleString()}</span>
              </div>
            </div>
          )}

          <div className="detail-field">
            <span className="detail-label">Content</span>
            {action.action_type === 'email_draft' ? (
              <EmailPreview content={action.content} />
            ) : (
              <div className="action-detail-content">{action.content}</div>
            )}
          </div>

          {action.result && (
            <div className="detail-field">
              <span className="detail-label">Result</span>
              <div className={`action-result ${action.status === 'failed' ? 'result-error' : ''}`}>
                {action.result}
              </div>
            </div>
          )}
        </div>

        <div className="detail-actions">
          {action.status === 'pending' && (
            <>
              {action.action_type === 'email_draft' ? (
                <button className="btn-save" onClick={handleSend} disabled={processing}>
                  {processing ? '...' : 'Approve & Send'}
                </button>
              ) : (
                <button className="btn-save" onClick={handleApprove} disabled={processing}>
                  {processing ? '...' : 'Approve'}
                </button>
              )}
              <button className="btn-danger" onClick={handleReject} disabled={processing}>
                Reject
              </button>
            </>
          )}
          <button onClick={onClose}>Close</button>
        </div>
      </div>
    </>
  );
}

export default function ActionsPage() {
  const [actions, setActions] = useState<DraftAction[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [selectedAction, setSelectedAction] = useState<DraftAction | null>(null);

  const loadActions = useCallback(async () => {
    try {
      const res = await listActions({
        status: statusFilter || undefined,
        action_type: typeFilter || undefined,
      });
      setActions(res.actions);
      setPendingCount(res.pending_count);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load actions');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, typeFilter]);

  useEffect(() => {
    loadActions();
  }, [loadActions]);

  const handleStatusChange = (id: string, newStatus: string) => {
    setActions((prev) =>
      prev.map((a) => (a.id === id ? { ...a, status: newStatus } : a)),
    );
    if (selectedAction?.id === id) {
      setSelectedAction({ ...selectedAction, status: newStatus });
    }
    // Refresh to get updated pending count
    loadActions();
  };

  if (loading) {
    return (
      <div className="board-loading">
        <div className="spinner" />
        <p>Loading actions...</p>
      </div>
    );
  }

  if (error && actions.length === 0) {
    return <div className="error-banner"><span>{error}</span></div>;
  }

  return (
    <div className="actions-page">
      <div className="actions-header">
        <h2>
          Actions
          {pendingCount > 0 && <span className="pending-badge">{pendingCount}</span>}
        </h2>
      </div>

      <div className="actions-toolbar">
        <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setLoading(true); }}>
          <option value="">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="sent">Sent</option>
          <option value="rejected">Rejected</option>
          <option value="failed">Failed</option>
        </select>
        <select value={typeFilter} onChange={(e) => { setTypeFilter(e.target.value); setLoading(true); }}>
          <option value="">All Types</option>
          <option value="email_draft">Email Draft</option>
          <option value="calendar_event">Calendar Event</option>
          <option value="task_update">Task Update</option>
          <option value="message">Message</option>
        </select>
        <span className="actions-count">{actions.length} action{actions.length !== 1 ? 's' : ''}</span>
      </div>

      {actions.length === 0 ? (
        <div className="actions-empty">
          <p>{statusFilter || typeFilter ? 'No actions match your filters' : 'No actions yet'}</p>
          <p>Kudjo will create draft actions when tasks require external actions like sending emails</p>
        </div>
      ) : (
        <div className="actions-list">
          {actions.map((action) => (
            <div
              key={action.id}
              className={`action-card status-${action.status}`}
              onClick={() => setSelectedAction(action)}
            >
              <div className="action-card-header">
                <span className="action-type-icon">
                  {ACTION_TYPE_ICONS[action.action_type] || '📋'}
                </span>
                <span className="action-title">{action.title}</span>
                <span className={`action-status-badge status-${action.status}`}>
                  {action.status}
                </span>
              </div>
              <div className="action-card-preview">
                {action.action_type === 'email_draft'
                  ? (() => {
                      try {
                        const d = JSON.parse(action.content);
                        return `To: ${d.to} — ${d.subject}`;
                      } catch {
                        return action.content.slice(0, 100);
                      }
                    })()
                  : action.content.slice(0, 100)}
              </div>
              <div className="action-card-meta">
                <span>{ActionTypeLabel(action.action_type)}</span>
                <span>by {action.created_by}</span>
                <span>{new Date(action.created_at).toLocaleDateString()}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {selectedAction && (
        <ActionDetailPanel
          action={selectedAction}
          onClose={() => setSelectedAction(null)}
          onStatusChange={handleStatusChange}
        />
      )}
    </div>
  );
}
