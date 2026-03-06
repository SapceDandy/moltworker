import { useState, useEffect, useCallback } from 'react';
import {
  listGoals,
  createGoal,
  updateGoal,
  deleteGoal,
  listProjects,
  type Goal,
  type Project,
} from '../api';
import './GoalsPage.css';

function GoalForm({ goal, projects, onSave, onCancel }: {
  goal?: Goal;
  projects: Project[];
  onSave: (data: Partial<Goal>) => Promise<void>;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(goal?.title ?? '');
  const [description, setDescription] = useState(goal?.description ?? '');
  const [metric, setMetric] = useState(goal?.metric ?? '');
  const [targetValue, setTargetValue] = useState(goal?.target_value ?? '');
  const [currentValue, setCurrentValue] = useState(goal?.current_value ?? '');
  const [projectId, setProjectId] = useState(goal?.project_id ?? '');
  const [targetDate, setTargetDate] = useState(goal?.target_date ?? '');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave({
        title,
        description,
        metric: metric || null,
        target_value: targetValue || null,
        current_value: currentValue || null,
        project_id: projectId || null,
        target_date: targetDate || null,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="entity-form" onSubmit={handleSubmit}>
      <div className="form-group">
        <label htmlFor="g-title">Title *</label>
        <input id="g-title" value={title} onChange={(e) => setTitle(e.target.value)} required autoFocus />
      </div>
      <div className="form-group">
        <label htmlFor="g-desc">Description</label>
        <textarea id="g-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
      </div>
      <div className="form-row">
        <div className="form-group">
          <label htmlFor="g-project">Project</label>
          <select id="g-project" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            <option value="">None (standalone)</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label htmlFor="g-metric">Metric</label>
          <input id="g-metric" placeholder="e.g. revenue, users, miles" value={metric} onChange={(e) => setMetric(e.target.value)} />
        </div>
        <div className="form-group">
          <label htmlFor="g-target">Target</label>
          <input id="g-target" placeholder="e.g. 10000" value={targetValue} onChange={(e) => setTargetValue(e.target.value)} />
        </div>
      </div>
      <div className="form-row">
        <div className="form-group">
          <label htmlFor="g-current">Current Value</label>
          <input id="g-current" placeholder="e.g. 2500" value={currentValue} onChange={(e) => setCurrentValue(e.target.value)} />
        </div>
        <div className="form-group">
          <label htmlFor="g-date">Target Date</label>
          <input id="g-date" type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />
        </div>
      </div>
      <div className="form-actions">
        <button type="submit" className="btn btn-primary" disabled={saving || !title}>
          {saving ? 'Saving...' : goal ? 'Update' : 'Create Goal'}
        </button>
        <button type="button" className="btn btn-secondary" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}

export default function GoalsPage() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [gRes, pRes] = await Promise.all([
        listGoals(),
        listProjects(),
      ]);
      setGoals(gRes.goals);
      setProjects(pRes.projects);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async (data: Partial<Goal>) => {
    await createGoal(data);
    setCreating(false);
    await load();
  };

  const handleUpdate = async (id: string, data: Partial<Goal>) => {
    await updateGoal(id, data);
    setEditingId(null);
    await load();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this goal?')) return;
    await deleteGoal(id);
    await load();
  };

  const getProjectName = (pid: string | null) => {
    if (!pid) return null;
    return projects.find((p) => p.id === pid)?.name ?? null;
  };

  const computeProgress = (g: Goal): number | null => {
    if (!g.target_value || !g.current_value) return null;
    const target = parseFloat(g.target_value);
    const current = parseFloat(g.current_value);
    if (isNaN(target) || isNaN(current) || target === 0) return null;
    return Math.min(Math.round((current / target) * 100), 100);
  };

  if (loading) return <div className="dash-loading"><div className="spinner" /><p>Loading goals...</p></div>;
  if (error) return <div className="error-banner"><span>{error}</span></div>;

  return (
    <div className="goals-page">
      <div className="page-header">
        <h2>Goals</h2>
        <button className="btn btn-primary" onClick={() => { setCreating(!creating); setEditingId(null); }}>
          {creating ? 'Cancel' : '+ New Goal'}
        </button>
      </div>

      {creating && (
        <GoalForm projects={projects} onSave={handleCreate} onCancel={() => setCreating(false)} />
      )}

      {goals.length === 0 && !creating ? (
        <div className="empty-state-large">
          <h3>No goals yet</h3>
          <p>Set goals to track your progress towards key outcomes.</p>
          <button className="btn btn-primary" onClick={() => setCreating(true)}>Create Goal</button>
        </div>
      ) : (
        <div className="goals-list">
          {goals.map((g) => {
            if (editingId === g.id) {
              return (
                <GoalForm
                  key={g.id}
                  goal={g}
                  projects={projects}
                  onSave={(data) => handleUpdate(g.id, data)}
                  onCancel={() => setEditingId(null)}
                />
              );
            }

            const pct = computeProgress(g);
            const projectName = getProjectName(g.project_id);

            return (
              <div key={g.id} className={`goal-card ${g.status !== 'active' ? 'inactive' : ''}`}>
                <div className="goal-card-top">
                  <div className="goal-card-info">
                    <span className="goal-card-title">{g.title}</span>
                    {projectName && <span className="goal-card-project">{projectName}</span>}
                  </div>
                  <div className="goal-card-actions">
                    <span className={`badge ${g.status === 'active' ? 'badge-low' : 'badge-medium'}`}>{g.status}</span>
                    <button className="btn btn-secondary btn-sm" onClick={() => { setEditingId(g.id); setCreating(false); }}>Edit</button>
                    <button className="btn btn-danger btn-sm" onClick={() => handleDelete(g.id)}>Del</button>
                  </div>
                </div>

                {g.description && <p className="goal-card-desc">{g.description}</p>}

                {g.metric && (
                  <div className="goal-metric-row">
                    <span className="metric-label">{g.metric}</span>
                    <span className="metric-values">{g.current_value ?? '0'} / {g.target_value ?? '?'}</span>
                    {pct != null && (
                      <div className="metric-bar-wrap">
                        <div className="metric-bar" style={{ width: `${pct}%` }} />
                        <span className="metric-pct">{pct}%</span>
                      </div>
                    )}
                  </div>
                )}

                {g.target_date && <div className="goal-card-date">Target: {g.target_date}</div>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
