import { useState, useEffect, useCallback, useRef } from 'react';
import {
  listLeads,
  updateLead,
  deleteLead,
  importLeadsCsv,
  type Lead,
} from '../api';
import './LeadsPage.css';

const LEAD_STATUSES = ['new', 'contacted', 'replied', 'qualified', 'won', 'lost'] as const;
const PAGE_SIZE = 50;

// --- Lead Detail Panel (reuses board detail panel CSS classes) ---

function LeadDetailPanel({
  lead,
  onClose,
  onUpdate,
  onDelete,
}: {
  lead: Lead;
  onClose: () => void;
  onUpdate: (id: string, data: Partial<Lead>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const [editName, setEditName] = useState(lead.business_name);
  const [editEmail, setEditEmail] = useState(lead.email);
  const [editPhone, setEditPhone] = useState(lead.phone);
  const [editCity, setEditCity] = useState(lead.city);
  const [editState, setEditState] = useState(lead.state);
  const [editCategory, setEditCategory] = useState(lead.category);
  const [editStatus, setEditStatus] = useState(lead.lead_status);
  const [editNotes, setEditNotes] = useState(lead.notes);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onUpdate(lead.id, {
        business_name: editName,
        email: editEmail,
        phone: editPhone,
        city: editCity,
        state: editState,
        category: editCategory,
        lead_status: editStatus,
        notes: editNotes,
      });
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Delete this lead?')) return;
    await onDelete(lead.id);
    onClose();
  };

  return (
    <>
      <div className="detail-overlay" onClick={onClose} />
      <div className="detail-panel">
        <div className="detail-header">
          <h3>{lead.business_name || lead.domain}</h3>
          <button className="detail-close" onClick={onClose}>&times;</button>
        </div>

        <div className="detail-body">
          {editing ? (
            <>
              <div className="detail-field detail-edit-field">
                <span className="detail-label">Business Name</span>
                <input value={editName} onChange={(e) => setEditName(e.target.value)} />
              </div>
              <div className="detail-row">
                <div className="detail-field detail-edit-field">
                  <span className="detail-label">Email</span>
                  <input value={editEmail} onChange={(e) => setEditEmail(e.target.value)} />
                </div>
                <div className="detail-field detail-edit-field">
                  <span className="detail-label">Phone</span>
                  <input value={editPhone} onChange={(e) => setEditPhone(e.target.value)} />
                </div>
              </div>
              <div className="detail-row">
                <div className="detail-field detail-edit-field">
                  <span className="detail-label">City</span>
                  <input value={editCity} onChange={(e) => setEditCity(e.target.value)} />
                </div>
                <div className="detail-field detail-edit-field">
                  <span className="detail-label">State</span>
                  <input value={editState} onChange={(e) => setEditState(e.target.value)} />
                </div>
              </div>
              <div className="detail-row">
                <div className="detail-field detail-edit-field">
                  <span className="detail-label">Category</span>
                  <input value={editCategory} onChange={(e) => setEditCategory(e.target.value)} />
                </div>
                <div className="detail-field detail-edit-field">
                  <span className="detail-label">Status</span>
                  <select value={editStatus} onChange={(e) => setEditStatus(e.target.value)}>
                    {LEAD_STATUSES.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="detail-field detail-edit-field">
                <span className="detail-label">Notes</span>
                <textarea value={editNotes} onChange={(e) => setEditNotes(e.target.value)} rows={3} />
              </div>
            </>
          ) : (
            <>
              <div className="detail-row">
                <div className="detail-field">
                  <span className="detail-label">Domain</span>
                  <span className="detail-value">
                    <a href={lead.website || `https://${lead.domain}`} target="_blank" rel="noopener noreferrer">
                      {lead.domain}
                    </a>
                  </span>
                </div>
                <div className="detail-field">
                  <span className="detail-label">Status</span>
                  <span className="detail-value">
                    <span className={`lead-status-badge status-${lead.lead_status || 'new'}`}>
                      {lead.lead_status || 'new'}
                    </span>
                  </span>
                </div>
              </div>
              <div className="detail-row">
                <div className="detail-field">
                  <span className="detail-label">Email</span>
                  <span className={`detail-value ${!lead.email ? 'empty' : ''}`}>
                    {lead.email ? <a href={`mailto:${lead.email}`}>{lead.email}</a> : 'None'}
                  </span>
                </div>
                <div className="detail-field">
                  <span className="detail-label">Phone</span>
                  <span className={`detail-value ${!lead.phone ? 'empty' : ''}`}>
                    {lead.phone || 'None'}
                  </span>
                </div>
              </div>
              <div className="detail-row">
                <div className="detail-field">
                  <span className="detail-label">City</span>
                  <span className={`detail-value ${!lead.city ? 'empty' : ''}`}>{lead.city || 'None'}</span>
                </div>
                <div className="detail-field">
                  <span className="detail-label">State</span>
                  <span className={`detail-value ${!lead.state ? 'empty' : ''}`}>{lead.state || 'None'}</span>
                </div>
              </div>
              <div className="detail-row">
                <div className="detail-field">
                  <span className="detail-label">Category</span>
                  <span className={`detail-value ${!lead.category ? 'empty' : ''}`}>{lead.category || 'None'}</span>
                </div>
                <div className="detail-field">
                  <span className="detail-label">Match Score</span>
                  <span className="detail-value">
                    {lead.match_score != null ? (
                      <span className={`lead-score ${lead.match_score >= 70 ? 'high' : lead.match_score >= 40 ? 'medium' : 'low'}`}>
                        {lead.match_score}
                      </span>
                    ) : (
                      <span className="empty">N/A</span>
                    )}
                  </span>
                </div>
              </div>
              {lead.owner_or_people && (
                <div className="detail-field">
                  <span className="detail-label">Owner / People</span>
                  <span className="detail-value">{lead.owner_or_people}</span>
                </div>
              )}
              {lead.linkedin_company && (
                <div className="detail-field">
                  <span className="detail-label">LinkedIn</span>
                  <span className="detail-value">
                    <a href={lead.linkedin_company} target="_blank" rel="noopener noreferrer">{lead.linkedin_company}</a>
                  </span>
                </div>
              )}
              {lead.contact_page_url && (
                <div className="detail-field">
                  <span className="detail-label">Contact Page</span>
                  <span className="detail-value">
                    <a href={lead.contact_page_url} target="_blank" rel="noopener noreferrer">Visit</a>
                  </span>
                </div>
              )}
              {lead.evidence_snippet && (
                <div className="detail-field">
                  <span className="detail-label">Evidence</span>
                  <span className="detail-value" style={{ whiteSpace: 'pre-wrap' }}>{lead.evidence_snippet}</span>
                </div>
              )}
              {lead.notes && (
                <div className="detail-field">
                  <span className="detail-label">Notes</span>
                  <span className="detail-value" style={{ whiteSpace: 'pre-wrap' }}>{lead.notes}</span>
                </div>
              )}
              <div className="detail-row">
                <div className="detail-field">
                  <span className="detail-label">Added</span>
                  <span className="detail-value">{new Date(lead.created_at).toLocaleDateString()}</span>
                </div>
                <div className="detail-field">
                  <span className="detail-label">Updated</span>
                  <span className="detail-value">{new Date(lead.updated_at).toLocaleDateString()}</span>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="detail-actions">
          {editing ? (
            <>
              <button className="btn-save" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving...' : 'Save'}
              </button>
              <button onClick={() => setEditing(false)}>Cancel</button>
            </>
          ) : (
            <>
              <button onClick={() => setEditing(true)}>Edit</button>
              <button className="btn-danger" onClick={handleDelete}>Delete</button>
            </>
          )}
        </div>
      </div>
    </>
  );
}

// --- Main Leads Page ---

export default function LeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(0);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [importResult, setImportResult] = useState<{ imported: number; skipped: number; errors: string[] } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadLeads = useCallback(async (opts?: { q?: string; status?: string; offset?: number }) => {
    try {
      const res = await listLeads({
        q: opts?.q || search || undefined,
        status: (opts?.status ?? statusFilter) || undefined,
        limit: PAGE_SIZE,
        offset: opts?.offset ?? page * PAGE_SIZE,
      });
      setLeads(res.leads);
      setTotal(res.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load leads');
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter, page]);

  useEffect(() => {
    loadLeads();
  }, [loadLeads]);

  const handleSearchChange = (value: string) => {
    setSearch(value);
    setPage(0);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => {
      loadLeads({ q: value, offset: 0 });
    }, 300);
  };

  const handleStatusChange = (value: string) => {
    setStatusFilter(value);
    setPage(0);
    setLoading(true);
    loadLeads({ status: value, offset: 0 });
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const result = await importLeadsCsv(file);
      setImportResult(result);
      loadLeads();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
    }
    // Reset file input
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleUpdate = async (id: string, data: Partial<Lead>) => {
    await updateLead(id, data);
    setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, ...data } : l)));
    if (selectedLead?.id === id) setSelectedLead({ ...selectedLead, ...data } as Lead);
  };

  const handleDelete = async (id: string) => {
    await deleteLead(id);
    setLeads((prev) => prev.filter((l) => l.id !== id));
    setTotal((prev) => prev - 1);
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);

  if (loading && leads.length === 0) {
    return (
      <div className="board-loading">
        <div className="spinner" />
        <p>Loading leads...</p>
      </div>
    );
  }

  if (error && leads.length === 0) {
    return <div className="error-banner"><span>{error}</span></div>;
  }

  return (
    <div className="leads-page">
      <div className="leads-header">
        <h2>Leads</h2>
        <div className="leads-header-actions">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            className="hidden-input"
            onChange={handleImport}
          />
          <button className="btn-primary" onClick={() => fileInputRef.current?.click()}>
            Import CSV
          </button>
          <a href="/api/leads/export.csv" download>Export CSV</a>
        </div>
      </div>

      {importResult && (
        <div className={`import-banner ${importResult.errors.length > 0 ? 'has-errors' : ''}`}>
          Imported {importResult.imported} leads
          {importResult.skipped > 0 && `, skipped ${importResult.skipped}`}
          {importResult.errors.length > 0 && (
            <span> — {importResult.errors.length} error(s): {importResult.errors[0]}</span>
          )}
          <button
            style={{ marginLeft: '0.5rem', fontSize: '0.75rem', cursor: 'pointer', background: 'none', border: 'none', color: 'var(--text-muted)' }}
            onClick={() => setImportResult(null)}
          >&times;</button>
        </div>
      )}

      <div className="leads-toolbar">
        <input
          className="leads-search"
          type="text"
          placeholder="Search leads..."
          value={search}
          onChange={(e) => handleSearchChange(e.target.value)}
        />
        <select value={statusFilter} onChange={(e) => handleStatusChange(e.target.value)}>
          <option value="">All Statuses</option>
          {LEAD_STATUSES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <span className="leads-count">{total} lead{total !== 1 ? 's' : ''}</span>
      </div>

      {leads.length === 0 ? (
        <div className="leads-empty">
          <p>{search || statusFilter ? 'No leads match your filters' : 'No leads yet'}</p>
          <p>Import a CSV or have Kudjo find leads for you</p>
        </div>
      ) : (
        <>
          <div className="leads-table-wrap">
            <table className="leads-table">
              <thead>
                <tr>
                  <th>Business</th>
                  <th>Domain</th>
                  <th>Email</th>
                  <th>City</th>
                  <th>State</th>
                  <th>Category</th>
                  <th>Score</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {leads.map((lead) => (
                  <tr key={lead.id} onClick={() => setSelectedLead(lead)}>
                    <td>{lead.business_name || '—'}</td>
                    <td>{lead.domain}</td>
                    <td>{lead.email || '—'}</td>
                    <td>{lead.city || '—'}</td>
                    <td>{lead.state || '—'}</td>
                    <td>{lead.category || '—'}</td>
                    <td>
                      {lead.match_score != null ? (
                        <span className={`lead-score ${lead.match_score >= 70 ? 'high' : lead.match_score >= 40 ? 'medium' : 'low'}`}>
                          {lead.match_score}
                        </span>
                      ) : '—'}
                    </td>
                    <td>
                      <span className={`lead-status-badge status-${lead.lead_status || 'new'}`}>
                        {lead.lead_status || 'new'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="leads-pagination">
              <button disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Prev</button>
              <span>Page {page + 1} of {totalPages}</span>
              <button disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>Next</button>
            </div>
          )}
        </>
      )}

      {selectedLead && (
        <LeadDetailPanel
          lead={selectedLead}
          onClose={() => setSelectedLead(null)}
          onUpdate={handleUpdate}
          onDelete={handleDelete}
        />
      )}
    </div>
  );
}
