import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import './ResearchPage.css';
import {
  getLead,
  listResearch,
  createResearch,
  updateResearch,
  deleteResearch,
  RESEARCH_CATEGORIES,
  type Lead,
  type ResearchEntry,
} from '../api';

const CONFIDENCE_COLORS: Record<string, string> = {
  high: '#22c55e',
  medium: '#eab308',
  low: '#ef4444',
};

function CategorySection({
  category,
  entries,
  onEdit,
  onDelete,
}: {
  category: typeof RESEARCH_CATEGORIES[number];
  entries: ResearchEntry[];
  onEdit: (entry: ResearchEntry) => void;
  onDelete: (id: string) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);

  if (entries.length === 0) return null;

  return (
    <div className="research-category">
      <div className="research-category-header" onClick={() => setCollapsed(!collapsed)}>
        <span className="research-category-icon">{category.icon}</span>
        <h3>{category.label}</h3>
        <span className="research-count">{entries.length}</span>
        <span className="research-collapse">{collapsed ? '▸' : '▾'}</span>
      </div>
      {!collapsed && (
        <div className="research-entries">
          {entries.map((entry) => (
            <div key={entry.id} className="research-entry">
              <div className="research-entry-header">
                <h4>{entry.title}</h4>
                <div className="research-entry-meta">
                  <span
                    className="confidence-dot"
                    title={`Confidence: ${entry.confidence}`}
                    style={{ background: CONFIDENCE_COLORS[entry.confidence] || CONFIDENCE_COLORS.medium }}
                  />
                  <span className="research-date">
                    {new Date(entry.created_at).toLocaleDateString()}
                  </span>
                  <span className="research-by">{entry.gathered_by}</span>
                </div>
              </div>
              <div className="research-entry-content">{entry.content}</div>
              {entry.source_url && (
                <a
                  href={entry.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="research-source"
                >
                  {entry.source_label || 'Source'}
                </a>
              )}
              <div className="research-entry-actions">
                <button className="btn btn-sm" onClick={() => onEdit(entry)}>Edit</button>
                <button className="btn btn-sm btn-danger" onClick={() => onDelete(entry.id)}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ResearchForm({
  leadId,
  entry,
  onSave,
  onCancel,
}: {
  leadId: string;
  entry?: ResearchEntry | null;
  onSave: () => void;
  onCancel: () => void;
}) {
  const [category, setCategory] = useState(entry?.category || 'company_overview');
  const [title, setTitle] = useState(entry?.title || '');
  const [content, setContent] = useState(entry?.content || '');
  const [sourceUrl, setSourceUrl] = useState(entry?.source_url || '');
  const [sourceLabel, setSourceLabel] = useState(entry?.source_label || '');
  const [confidence, setConfidence] = useState(entry?.confidence || 'medium');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) return;
    setSaving(true);
    try {
      if (entry) {
        await updateResearch(entry.id, { category, title, content, source_url: sourceUrl || null, source_label: sourceLabel || null, confidence });
      } else {
        await createResearch({ lead_id: leadId, category, title, content, source_url: sourceUrl || null, source_label: sourceLabel || null, confidence, gathered_by: 'manual' });
      }
      onSave();
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="research-form" onSubmit={handleSubmit}>
      <h3>{entry ? 'Edit Research' : 'Add Research'}</h3>
      <div className="form-row">
        <div className="form-field">
          <label>Category</label>
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            {RESEARCH_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>{c.icon} {c.label}</option>
            ))}
          </select>
        </div>
        <div className="form-field">
          <label>Confidence</label>
          <select value={confidence} onChange={(e) => setConfidence(e.target.value)}>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </div>
      </div>
      <div className="form-field">
        <label>Title</label>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Brief summary of the finding..." required />
      </div>
      <div className="form-field">
        <label>Details</label>
        <textarea value={content} onChange={(e) => setContent(e.target.value)} rows={5} placeholder="Full research details..." required />
      </div>
      <div className="form-row">
        <div className="form-field">
          <label>Source URL</label>
          <input value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} placeholder="https://..." />
        </div>
        <div className="form-field">
          <label>Source Label</label>
          <input value={sourceLabel} onChange={(e) => setSourceLabel(e.target.value)} placeholder="e.g. Company website, LinkedIn..." />
        </div>
      </div>
      <div className="form-actions">
        <button type="submit" className="btn btn-primary" disabled={saving || !title.trim() || !content.trim()}>
          {saving ? 'Saving...' : entry ? 'Update' : 'Add'}
        </button>
        <button type="button" className="btn" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}

export default function ResearchPage() {
  const { leadId } = useParams<{ leadId: string }>();
  const navigate = useNavigate();
  const [lead, setLead] = useState<Lead | null>(null);
  const [entries, setEntries] = useState<ResearchEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editEntry, setEditEntry] = useState<ResearchEntry | null>(null);
  const [filterCategory, setFilterCategory] = useState('');

  const load = useCallback(async () => {
    if (!leadId) return;
    try {
      const [leadRes, researchRes] = await Promise.all([
        getLead(leadId),
        listResearch(leadId),
      ]);
      setLead(leadRes.lead);
      setEntries(researchRes.research);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load research');
    } finally {
      setLoading(false);
    }
  }, [leadId]);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this research entry?')) return;
    try {
      await deleteResearch(id);
      setEntries((prev) => prev.filter((e) => e.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete');
    }
  };

  const handleEdit = (entry: ResearchEntry) => {
    setEditEntry(entry);
    setShowForm(true);
  };

  const handleFormSave = () => {
    setShowForm(false);
    setEditEntry(null);
    load();
  };

  if (!leadId) {
    navigate('/leads');
    return null;
  }

  if (loading) return <div className="dash-loading"><div className="spinner" /><p>Loading research...</p></div>;
  if (error) return <div className="error-banner"><span>{error}</span></div>;
  if (!lead) return <div className="error-banner"><span>Lead not found</span></div>;

  // Group entries by category
  const grouped = RESEARCH_CATEGORIES.map((cat) => ({
    category: cat,
    entries: entries.filter((e) =>
      e.category === cat.value && (!filterCategory || filterCategory === cat.value)
    ),
  }));

  const filteredEntries = filterCategory
    ? entries.filter((e) => e.category === filterCategory)
    : entries;

  // Categories with data for the summary bar
  const categoriesWithData = RESEARCH_CATEGORIES.filter(
    (cat) => entries.some((e) => e.category === cat.value)
  );
  const categoriesEmpty = RESEARCH_CATEGORIES.filter(
    (cat) => !entries.some((e) => e.category === cat.value)
  );

  return (
    <div className="research-page">
      <div className="research-header">
        <div>
          <Link to="/leads" className="back-link">&larr; Leads</Link>
          <h2>
            {lead.business_name || lead.domain}
            <span className="research-subtitle">Company Research</span>
          </h2>
          {lead.website && (
            <a href={lead.website} target="_blank" rel="noopener noreferrer" className="research-website">
              {lead.domain}
            </a>
          )}
        </div>
        <div className="research-header-actions">
          <span className="research-total">{entries.length} entries</span>
          <button
            className="btn btn-primary"
            onClick={() => { setEditEntry(null); setShowForm(!showForm); }}
          >
            {showForm ? 'Cancel' : '+ Add Research'}
          </button>
        </div>
      </div>

      {showForm && (
        <ResearchForm
          leadId={leadId}
          entry={editEntry}
          onSave={handleFormSave}
          onCancel={() => { setShowForm(false); setEditEntry(null); }}
        />
      )}

      {/* Coverage Summary */}
      <div className="research-coverage">
        <span className="coverage-label">Coverage:</span>
        {RESEARCH_CATEGORIES.map((cat) => {
          const count = entries.filter((e) => e.category === cat.value).length;
          const isActive = filterCategory === cat.value;
          return (
            <button
              key={cat.value}
              className={`coverage-chip ${count > 0 ? 'has-data' : 'no-data'} ${isActive ? 'active' : ''}`}
              onClick={() => setFilterCategory(isActive ? '' : cat.value)}
              title={`${cat.label}: ${count} entries`}
            >
              <span className="chip-icon">{cat.icon}</span>
              <span className="chip-label">{cat.label}</span>
              {count > 0 && <span className="chip-count">{count}</span>}
            </button>
          );
        })}
      </div>

      {/* Research Entries by Category */}
      {filteredEntries.length === 0 ? (
        <div className="empty-state-large">
          <h3>{filterCategory ? 'No entries in this category' : 'No research yet'}</h3>
          <p>
            {filterCategory
              ? 'Click "Add Research" to add findings, or ask the agent to research this company.'
              : 'Research entries will appear here as the agent gathers intel on this company. You can also add entries manually.'}
          </p>
          {!showForm && (
            <button className="btn btn-primary" onClick={() => { setEditEntry(null); setShowForm(true); }}>
              Add Research
            </button>
          )}
        </div>
      ) : (
        <div className="research-body">
          {filterCategory ? (
            // Show filtered category
            <CategorySection
              category={RESEARCH_CATEGORIES.find((c) => c.value === filterCategory)!}
              entries={filteredEntries}
              onEdit={handleEdit}
              onDelete={handleDelete}
            />
          ) : (
            // Show all categories
            grouped.map(({ category, entries: catEntries }) => (
              <CategorySection
                key={category.value}
                category={category}
                entries={catEntries}
                onEdit={handleEdit}
                onDelete={handleDelete}
              />
            ))
          )}
        </div>
      )}

      {/* Gaps */}
      {categoriesEmpty.length > 0 && !filterCategory && entries.length > 0 && (
        <div className="research-gaps">
          <h4>Research Gaps</h4>
          <p>No data yet for: {categoriesEmpty.map((c) => `${c.icon} ${c.label}`).join(', ')}</p>
        </div>
      )}
    </div>
  );
}
