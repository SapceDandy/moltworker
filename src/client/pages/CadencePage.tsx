import { useState, useEffect, useCallback } from 'react';
import {
  listCadences,
  getCadence,
  updateCadence,
  advanceCadence,
  updateTouch,
  generateCallPrep,
  getCadenceDashboard,
  type SalesCadence,
  type TouchLog,
  type PipelineStage,
  type CadenceDashboard,
} from '../api';
import './CadencePage.css';

type ViewTab = 'queue' | 'pipeline' | 'detail' | 'weekly';

// ============================================================
// HELPER COMPONENTS
// ============================================================

function TouchTypeBadge({ type }: { type: string }) {
  return <span className={`touch-type-badge ${type}`}>{type}</span>;
}

function HealthBadge({ health }: { health: string }) {
  return <span className={`health-badge ${health}`}>{health.replace('_', ' ')}</span>;
}

function StatusBadge({ status }: { status: string }) {
  return <span className={`status-badge ${status}`}>{status}</span>;
}

function daysSince(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  const now = new Date();
  return Math.floor((now.getTime() - d.getTime()) / 86400000);
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function isOverdue(dateStr: string | null | undefined): boolean {
  if (!dateStr) return false;
  return new Date(dateStr) < new Date(new Date().toISOString().split('T')[0]);
}

// ============================================================
// QUEUE VIEW — Today's due touches
// ============================================================

function QueueView({
  dashboard,
  onSelectCadence,
}: {
  dashboard: CadenceDashboard | null;
  onSelectCadence: (id: string) => void;
}) {
  if (!dashboard) return <div className="cadence-loading">Loading queue...</div>;

  const overdue = dashboard.due_touches.filter((t) => isOverdue(t.scheduled_at));
  const today = dashboard.due_touches.filter((t) => !isOverdue(t.scheduled_at));

  return (
    <div>
      {/* Summary cards */}
      <div className="cadence-summary">
        <div className="summary-card active">
          <div className="count">{dashboard.summary.active || 0}</div>
          <div className="label">Active</div>
        </div>
        <div className="summary-card won">
          <div className="count">{dashboard.summary.won || 0}</div>
          <div className="label">Won</div>
        </div>
        <div className="summary-card lost">
          <div className="count">{dashboard.summary.lost || 0}</div>
          <div className="label">Lost</div>
        </div>
        <div className="summary-card paused">
          <div className="count">{dashboard.summary.paused || 0}</div>
          <div className="label">Paused</div>
        </div>
        <div className="summary-card">
          <div className="count">{dashboard.due_touches.length}</div>
          <div className="label">Due Today</div>
        </div>
      </div>

      {/* Overdue */}
      {overdue.length > 0 && (
        <div className="queue-section" style={{ marginTop: '1rem' }}>
          <h3 style={{ color: '#ef4444' }}>Overdue ({overdue.length})</h3>
          <div className="queue-list">
            {overdue.map((t) => (
              <div key={t.id} className="queue-item" onClick={() => {
                const cid = (t as any).cadence_id;
                if (cid) onSelectCadence(cid);
              }}>
                <TouchTypeBadge type={t.stage_type || t.touch_type} />
                <div className="lead-info">
                  <div className="lead-name">{(t as any).business_name || 'Unknown'}</div>
                  <div className="lead-domain">{(t as any).domain || ''}</div>
                </div>
                <div className="stage-info">{t.stage_name || t.touch_type}</div>
                {(t as any).framework && <span className="framework-badge">{(t as any).framework}</span>}
                <div className="due-date overdue">{formatDate(t.scheduled_at)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Today */}
      <div className="queue-section" style={{ marginTop: '1rem' }}>
        <h3>Today ({today.length})</h3>
        {today.length === 0 && overdue.length === 0 ? (
          <div className="queue-empty">No touches due today. Great job staying ahead!</div>
        ) : (
          <div className="queue-list">
            {today.map((t) => (
              <div key={t.id} className="queue-item" onClick={() => {
                const cid = (t as any).cadence_id;
                if (cid) onSelectCadence(cid);
              }}>
                <TouchTypeBadge type={t.stage_type || t.touch_type} />
                <div className="lead-info">
                  <div className="lead-name">{(t as any).business_name || 'Unknown'}</div>
                  <div className="lead-domain">{(t as any).domain || ''}</div>
                </div>
                <div className="stage-info">{t.stage_name || t.touch_type}</div>
                {(t as any).framework && <span className="framework-badge">{(t as any).framework}</span>}
                <div className="due-date">{formatDate(t.scheduled_at)}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Stalled */}
      {dashboard.stalled.length > 0 && (
        <div className="queue-section" style={{ marginTop: '1rem' }}>
          <h3>Stalled ({dashboard.stalled.length})</h3>
          <div className="stalled-list">
            {dashboard.stalled.map((s) => {
              const days = daysSince(s.last_touch_at);
              return (
                <div key={s.id} className="stalled-item" onClick={() => onSelectCadence(s.id)}>
                  <div>
                    <div className="stalled-name">{s.business_name || s.domain || 'Unknown'}</div>
                    <div className="stalled-stage">{(s as any).current_stage_name || 'Unknown stage'}</div>
                  </div>
                  <div className="stalled-days">{days != null ? `${days}d ago` : 'No touches'}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// PIPELINE VIEW — Funnel visualization
// ============================================================

function PipelineView({
  dashboard,
  cadences,
  onSelectCadence,
}: {
  dashboard: CadenceDashboard | null;
  cadences: SalesCadence[];
  onSelectCadence: (id: string) => void;
}) {
  if (!dashboard) return <div className="cadence-loading">Loading pipeline...</div>;

  const maxCount = Math.max(...dashboard.funnel.map((f) => f.cadence_count), 1);

  return (
    <div>
      <div className="cadence-summary" style={{ marginBottom: '1.5rem' }}>
        <div className="summary-card active">
          <div className="count">{dashboard.summary.active || 0}</div>
          <div className="label">Active</div>
        </div>
        <div className="summary-card won">
          <div className="count">{dashboard.summary.won || 0}</div>
          <div className="label">Won</div>
        </div>
        <div className="summary-card lost">
          <div className="count">{dashboard.summary.lost || 0}</div>
          <div className="label">Lost</div>
        </div>
      </div>

      <div className="detail-card">
        <h3>Pipeline Funnel</h3>
        <div className="funnel-container">
          {dashboard.funnel.map((stage) => (
            <div key={stage.stage_id} className="funnel-row">
              <div className="funnel-label" title={stage.stage_name}>
                {stage.stage_number}. {stage.stage_name}
              </div>
              <div className="funnel-bar-wrap">
                <div
                  className={`funnel-bar ${stage.stage_type}`}
                  style={{ width: `${Math.max((stage.cadence_count / maxCount) * 100, 2)}%` }}
                />
              </div>
              <div className="funnel-count">{stage.cadence_count}</div>
              <div className="funnel-type">{stage.stage_type}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Active cadences list */}
      <div className="detail-card" style={{ marginTop: '1rem' }}>
        <h3>Active Cadences ({cadences.length})</h3>
        <div className="queue-list">
          {cadences.map((cad) => (
            <div key={cad.id} className="queue-item" onClick={() => onSelectCadence(cad.id)}>
              <StatusBadge status={cad.status} />
              <div className="lead-info">
                <div className="lead-name">{cad.business_name || cad.domain || 'Unknown'}</div>
                <div className="lead-domain">
                  Stage {cad.current_stage_number || '?'}: {cad.current_stage_name || 'Unknown'}
                </div>
              </div>
              <HealthBadge health={cad.health} />
              <div className="due-date">
                {cad.next_touch_due ? (
                  <span className={isOverdue(cad.next_touch_due) ? 'overdue' : ''}>
                    Next: {formatDate(cad.next_touch_due)}
                  </span>
                ) : '—'}
              </div>
            </div>
          ))}
          {cadences.length === 0 && <div className="queue-empty">No cadences yet. Create a lead to auto-enroll.</div>}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// DETAIL VIEW — Individual cadence with timeline + call prep
// ============================================================

function DetailView({
  cadenceId,
  onBack,
}: {
  cadenceId: string;
  onBack: () => void;
}) {
  const [cadence, setCadence] = useState<SalesCadence | null>(null);
  const [touches, setTouches] = useState<TouchLog[]>([]);
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [callPrep, setCallPrep] = useState<Record<string, any> | null>(null);
  const [generatingPrep, setGeneratingPrep] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const data = await getCadence(cadenceId);
      setCadence(data.cadence);
      setTouches(data.touches);
      setStages(data.stages);
    } catch (err) {
      console.error('Failed to load cadence:', err);
    } finally {
      setLoading(false);
    }
  }, [cadenceId]);

  useEffect(() => { load(); }, [load]);

  const handleGeneratePrep = async () => {
    setGeneratingPrep(true);
    try {
      // Find the current scheduled touch to save prep to
      const currentTouch = touches.find(
        (t) => t.status === 'scheduled' && t.stage_id === cadence?.current_stage_id,
      );
      const result = await generateCallPrep(cadenceId, currentTouch?.id);
      if (result.ok) {
        setCallPrep(result.call_prep);
        if (currentTouch) load();
      }
    } catch (err) {
      console.error('Call prep failed:', err);
    } finally {
      setGeneratingPrep(false);
    }
  };

  const handleCompleteTouch = async (touchId: string, outcome: string, notes: string) => {
    try {
      await updateTouch(touchId, {
        status: 'completed',
        outcome,
        outcome_notes: notes,
        completed_at: new Date().toISOString(),
      } as any);
      load();
    } catch (err) {
      console.error('Failed to complete touch:', err);
    }
  };

  const handleAdvance = async () => {
    try {
      await advanceCadence(cadenceId);
      load();
    } catch (err) {
      console.error('Failed to advance:', err);
    }
  };

  const handleUpdateHealth = async (health: string) => {
    try {
      await updateCadence(cadenceId, { health } as any);
      load();
    } catch (err) {
      console.error('Failed to update health:', err);
    }
  };

  const handleUpdateStatus = async (status: string) => {
    try {
      await updateCadence(cadenceId, { status } as any);
      load();
    } catch (err) {
      console.error('Failed to update status:', err);
    }
  };

  if (loading) return <div className="cadence-loading">Loading cadence...</div>;
  if (!cadence) return <div className="cadence-empty">Cadence not found</div>;

  const currentStage = stages.find((s) => s.id === cadence.current_stage_id);

  return (
    <div>
      <button onClick={onBack} style={{ marginBottom: '1rem', padding: '0.3rem 0.6rem', fontSize: '0.8rem', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--surface-color)', cursor: 'pointer' }}>
        &larr; Back
      </button>

      <div className="cadence-detail">
        {/* Main column: timeline + call prep */}
        <div className="cadence-detail-main">
          {/* Lead info header */}
          <div className="detail-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.1rem' }}>{cadence.business_name || cadence.domain || 'Unknown Lead'}</h3>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                  {cadence.domain && <span>{cadence.domain}</span>}
                  {(cadence as any).lead_email && <span> &middot; {(cadence as any).lead_email}</span>}
                  {(cadence as any).lead_phone && <span> &middot; {(cadence as any).lead_phone}</span>}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <HealthBadge health={cadence.health} />
                <StatusBadge status={cadence.status} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: '1rem', marginTop: '0.75rem', fontSize: '0.8rem' }}>
              <div><strong>Stage:</strong> {currentStage ? `#${currentStage.stage_number} ${currentStage.name}` : 'None'}</div>
              <div><strong>Priority:</strong> {cadence.priority}</div>
              <div><strong>Next Touch:</strong> {formatDate(cadence.next_touch_due)}</div>
              {cadence.lead_score != null && <div><strong>Score:</strong> {cadence.lead_score}</div>}
            </div>
          </div>

          {/* Actions bar */}
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button
              onClick={handleGeneratePrep}
              disabled={generatingPrep}
              style={{ padding: '0.4rem 0.75rem', fontSize: '0.8rem', borderRadius: '6px', border: '1px solid #c4b5fd', background: 'linear-gradient(135deg, #faf5ff, #eff6ff)', color: '#6d28d9', cursor: 'pointer', fontWeight: 600 }}
            >
              {generatingPrep ? 'Generating...' : 'Generate Call Prep'}
            </button>
            <button
              onClick={handleAdvance}
              style={{ padding: '0.4rem 0.75rem', fontSize: '0.8rem', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--surface-color)', cursor: 'pointer' }}
            >
              Advance Stage &rarr;
            </button>
            <select
              value={cadence.health}
              onChange={(e) => handleUpdateHealth(e.target.value)}
              style={{ padding: '0.4rem 0.6rem', fontSize: '0.75rem', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--surface-color)' }}
            >
              <option value="on_track">On Track</option>
              <option value="at_risk">At Risk</option>
              <option value="stalled">Stalled</option>
            </select>
            <select
              value={cadence.status}
              onChange={(e) => handleUpdateStatus(e.target.value)}
              style={{ padding: '0.4rem 0.6rem', fontSize: '0.75rem', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--surface-color)' }}
            >
              <option value="active">Active</option>
              <option value="paused">Paused</option>
              <option value="won">Won</option>
              <option value="lost">Lost</option>
            </select>
          </div>

          {/* Call prep panel */}
          {callPrep && !callPrep.raw && (
            <div className="call-prep-panel">
              <h3>Call Prep Brief</h3>
              {callPrep.summary && (
                <div className="call-prep-section">
                  <p><strong>{callPrep.summary}</strong></p>
                </div>
              )}
              {callPrep.mindset && (
                <div className="call-prep-section">
                  <h4>Mindset</h4>
                  <p>{callPrep.mindset}</p>
                </div>
              )}
              {callPrep.navigation && (
                <div className="call-prep-section">
                  <h4>Navigation</h4>
                  <p>{callPrep.navigation}</p>
                </div>
              )}
              {callPrep.opening_line && (
                <div className="call-prep-section">
                  <h4>Opening Line</h4>
                  <p style={{ fontStyle: 'italic' }}>"{callPrep.opening_line}"</p>
                </div>
              )}
              {callPrep.questions && callPrep.questions.length > 0 && (
                <div className="call-prep-section">
                  <h4>Discovery Questions</h4>
                  <ul>
                    {(callPrep.questions as string[]).map((q, i) => <li key={i}>{q}</li>)}
                  </ul>
                </div>
              )}
              {callPrep.outcomes && (
                <div className="call-prep-section">
                  <h4>Outcome Scenarios</h4>
                  <div className="outcomes-grid">
                    {['fantastic', 'good', 'okay', 'not_so_good', 'bad'].map((key) => (
                      callPrep.outcomes[key] ? (
                        <div key={key} className={`outcome-card ${key}`}>
                          <div className="outcome-label">{key.replace('_', ' ')}</div>
                          <div>{callPrep.outcomes[key]}</div>
                        </div>
                      ) : null
                    ))}
                  </div>
                </div>
              )}
              {callPrep.objection_handlers && (callPrep.objection_handlers as any[]).length > 0 && (
                <div className="call-prep-section">
                  <h4>Objection Handlers</h4>
                  <ul>
                    {(callPrep.objection_handlers as any[]).map((h, i) => (
                      <li key={i}><strong>{h.objection}:</strong> {h.response}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
          {callPrep && callPrep.raw && (
            <div className="call-prep-panel">
              <h3>Call Prep Brief</h3>
              <p style={{ whiteSpace: 'pre-wrap', fontSize: '0.8rem' }}>{callPrep.summary}</p>
            </div>
          )}

          {/* Touch timeline */}
          <div className="detail-card">
            <h3>Touch Timeline</h3>
            <div className="touch-timeline">
              {touches.map((t) => {
                const isCurrent = t.stage_id === cadence.current_stage_id && t.status === 'scheduled';
                const statusClass = t.status === 'completed' ? 'completed' : t.status === 'skipped' ? 'skipped' : isCurrent ? 'current' : 'scheduled';

                return (
                  <div key={t.id} className={`timeline-item ${statusClass}`}>
                    <div className="timeline-header">
                      <TouchTypeBadge type={t.stage_type || t.touch_type} />
                      <span className="stage-name">{t.stage_name || t.touch_type}</span>
                      <span className="stage-date">{formatDate(t.completed_at || t.scheduled_at)}</span>
                      {t.owner && <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>({t.owner})</span>}
                    </div>
                    {t.outcome && (
                      <div className="timeline-body">
                        <span className={`timeline-outcome outcome-${t.outcome}`}>{t.outcome}</span>
                        {t.outcome_notes && <span style={{ marginLeft: '0.5rem' }}>{t.outcome_notes}</span>}
                      </div>
                    )}
                    {/* Complete button for current scheduled touch */}
                    {isCurrent && t.status === 'scheduled' && (
                      <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
                        {['fantastic', 'good', 'okay', 'not_so_good', 'bad'].map((outcome) => (
                          <button
                            key={outcome}
                            onClick={() => {
                              const notes = prompt(`Notes for "${outcome}" outcome:`) || '';
                              handleCompleteTouch(t.id, outcome, notes);
                            }}
                            className={`outcome-card ${outcome}`}
                            style={{ border: 'none', cursor: 'pointer', padding: '0.2rem 0.4rem', borderRadius: '4px', fontSize: '0.65rem', fontWeight: 600 }}
                          >
                            {outcome.replace('_', ' ')}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
              {touches.length === 0 && <div className="queue-empty">No touches yet</div>}
            </div>
          </div>
        </div>

        {/* Side column: lead info + stage guidance */}
        <div className="cadence-detail-side">
          <div className="detail-card">
            <h3>Lead Intel</h3>
            {[
              ['Company', cadence.business_name],
              ['Domain', cadence.domain],
              ['Email', (cadence as any).lead_email],
              ['Phone', (cadence as any).lead_phone],
              ['Location', [(cadence as any).city, (cadence as any).state].filter(Boolean).join(', ')],
              ['Category', (cadence as any).category],
              ['People', (cadence as any).owner_or_people],
              ['LinkedIn', (cadence as any).linkedin_company],
              ['Match Score', (cadence as any).lead_match_score],
              ['Lead Status', cadence.lead_status],
            ].filter(([, v]) => v).map(([label, value]) => (
              <div className="field-row" key={label as string}>
                <span className="field-label">{label}</span>
                <span className="field-value">{value as string}</span>
              </div>
            ))}
            {(cadence as any).evidence_snippet && (
              <div style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                {(cadence as any).evidence_snippet}
              </div>
            )}
          </div>

          {currentStage && (
            <div className="detail-card">
              <h3>Stage #{currentStage.stage_number}: {currentStage.name}</h3>
              <div className="field-row">
                <span className="field-label">Type</span>
                <span className="field-value"><TouchTypeBadge type={currentStage.stage_type} /></span>
              </div>
              <div className="field-row">
                <span className="field-label">Owner</span>
                <span className="field-value">{currentStage.default_owner}</span>
              </div>
              {currentStage.framework && (
                <div className="field-row">
                  <span className="field-label">Framework</span>
                  <span className="field-value"><span className="framework-badge">{currentStage.framework}</span></span>
                </div>
              )}
              {currentStage.guidance && (
                <div style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  {currentStage.guidance}
                </div>
              )}
            </div>
          )}

          {cadence.owner_notes && (
            <div className="detail-card">
              <h3>Notes</h3>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: 0, whiteSpace: 'pre-wrap' }}>
                {cadence.owner_notes}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// WEEKLY VIEW — Calendar grid for the week
// ============================================================

function WeeklyView({
  cadences,
  onSelectCadence,
}: {
  cadences: SalesCadence[];
  onSelectCadence: (id: string) => void;
}) {
  // Build 5 weekdays starting from Monday of current week
  const now = new Date();
  const monday = new Date(now);
  const dayOfWeek = now.getDay();
  monday.setDate(now.getDate() - ((dayOfWeek + 6) % 7));

  const days = Array.from({ length: 5 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });

  const todayStr = now.toISOString().split('T')[0];

  // Group cadences by next_touch_due date
  const byDate = new Map<string, SalesCadence[]>();
  for (const cad of cadences) {
    if (cad.next_touch_due) {
      const key = cad.next_touch_due.split('T')[0];
      if (!byDate.has(key)) byDate.set(key, []);
      byDate.get(key)!.push(cad);
    }
  }

  return (
    <div className="weekly-grid">
      {days.map((day) => {
        const dateStr = day.toISOString().split('T')[0];
        const isToday = dateStr === todayStr;
        const items = byDate.get(dateStr) || [];

        return (
          <div key={dateStr} className="weekly-column">
            <div className={`weekly-column-header ${isToday ? 'today' : ''}`}>
              {day.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
            </div>
            {items.map((cad) => (
              <div key={cad.id} className="weekly-touch-card" onClick={() => onSelectCadence(cad.id)}>
                <div className="touch-company">{cad.business_name || cad.domain || 'Unknown'}</div>
                <div className="touch-stage">
                  <TouchTypeBadge type={cad.current_stage_type || 'email'} />
                  {' '}{cad.current_stage_name || 'Unknown'}
                </div>
              </div>
            ))}
            {items.length === 0 && <div className="weekly-empty">No touches</div>}
          </div>
        );
      })}
    </div>
  );
}

// ============================================================
// MAIN PAGE
// ============================================================

export default function CadencePage() {
  const [activeTab, setActiveTab] = useState<ViewTab>('queue');
  const [dashboard, setDashboard] = useState<CadenceDashboard | null>(null);
  const [cadences, setCadences] = useState<SalesCadence[]>([]);
  const [selectedCadenceId, setSelectedCadenceId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('active');
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      const [dashData, cadData] = await Promise.all([
        getCadenceDashboard(),
        listCadences({ status: statusFilter || undefined }),
      ]);
      setDashboard(dashData);
      setCadences(cadData.cadences);
    } catch (err) {
      console.error('Failed to load cadence data:', err);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleSelectCadence = (id: string) => {
    setSelectedCadenceId(id);
    setActiveTab('detail');
  };

  const handleBackFromDetail = () => {
    setSelectedCadenceId(null);
    setActiveTab('queue');
    loadData();
  };

  if (loading) return <div className="cadence-page"><div className="cadence-loading">Loading sales pipeline...</div></div>;

  return (
    <div className="cadence-page">
      <div className="cadence-header">
        <h2>Sales Cadence</h2>
        <div className="cadence-header-actions">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">All</option>
            <option value="active">Active</option>
            <option value="paused">Paused</option>
            <option value="won">Won</option>
            <option value="lost">Lost</option>
          </select>
          <button onClick={loadData}>Refresh</button>
        </div>
      </div>

      <div className="cadence-tabs">
        <button className={`cadence-tab ${activeTab === 'queue' ? 'active' : ''}`} onClick={() => { setActiveTab('queue'); setSelectedCadenceId(null); }}>
          Queue ({dashboard?.due_touches.length || 0})
        </button>
        <button className={`cadence-tab ${activeTab === 'pipeline' ? 'active' : ''}`} onClick={() => { setActiveTab('pipeline'); setSelectedCadenceId(null); }}>
          Pipeline
        </button>
        <button className={`cadence-tab ${activeTab === 'detail' ? 'active' : ''}`} onClick={() => setActiveTab('detail')}>
          Detail
        </button>
        <button className={`cadence-tab ${activeTab === 'weekly' ? 'active' : ''}`} onClick={() => { setActiveTab('weekly'); setSelectedCadenceId(null); }}>
          Weekly
        </button>
      </div>

      <div style={{ marginTop: '1rem' }}>
        {activeTab === 'queue' && (
          <QueueView dashboard={dashboard} onSelectCadence={handleSelectCadence} />
        )}
        {activeTab === 'pipeline' && (
          <PipelineView dashboard={dashboard} cadences={cadences} onSelectCadence={handleSelectCadence} />
        )}
        {activeTab === 'detail' && selectedCadenceId && (
          <DetailView cadenceId={selectedCadenceId} onBack={handleBackFromDetail} />
        )}
        {activeTab === 'detail' && !selectedCadenceId && (
          <div className="cadence-empty">Select a cadence from the Queue or Pipeline view to see details.</div>
        )}
        {activeTab === 'weekly' && (
          <WeeklyView cadences={cadences} onSelectCadence={handleSelectCadence} />
        )}
      </div>
    </div>
  );
}
