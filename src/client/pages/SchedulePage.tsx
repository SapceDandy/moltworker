import { useState, useEffect, useCallback } from 'react';
import {
  listReminders,
  createReminder,
  updateReminder,
  deleteReminder,
  listTasks,
  listMilestones,
  listProjects,
  type Reminder,
  type Task,
  type Milestone,
  type Project,
} from '../api';
import './SchedulePage.css';

function ReminderForm({ reminder, projects, onSave, onCancel }: {
  reminder?: Reminder;
  projects: Project[];
  onSave: (data: Partial<Reminder>) => Promise<void>;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(reminder?.title ?? '');
  const [description, setDescription] = useState(reminder?.description ?? '');
  const [remindAt, setRemindAt] = useState(
    reminder?.remind_at ? reminder.remind_at.slice(0, 16) : ''
  );
  const [projectId, setProjectId] = useState(reminder?.related_project_id ?? '');
  const [recurrence, setRecurrence] = useState(reminder?.recurrence ?? '');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave({
        title,
        description: description || null,
        remind_at: remindAt ? new Date(remindAt).toISOString() : '',
        related_project_id: projectId || null,
        recurrence: recurrence || null,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="entity-form" onSubmit={handleSubmit}>
      <div className="form-group">
        <label htmlFor="r-title">Title *</label>
        <input id="r-title" value={title} onChange={(e) => setTitle(e.target.value)} required autoFocus />
      </div>
      <div className="form-group">
        <label htmlFor="r-desc">Description</label>
        <textarea id="r-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
      </div>
      <div className="form-row">
        <div className="form-group">
          <label htmlFor="r-at">Remind At *</label>
          <input id="r-at" type="datetime-local" value={remindAt} onChange={(e) => setRemindAt(e.target.value)} required />
        </div>
        <div className="form-group">
          <label htmlFor="r-project">Project</label>
          <select id="r-project" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            <option value="">None</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label htmlFor="r-recur">Recurrence</label>
          <select id="r-recur" value={recurrence} onChange={(e) => setRecurrence(e.target.value)}>
            <option value="">None</option>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </select>
        </div>
      </div>
      <div className="form-actions">
        <button type="submit" className="btn btn-primary" disabled={saving || !title || !remindAt}>
          {saving ? 'Saving...' : reminder ? 'Update' : 'Create Reminder'}
        </button>
        <button type="button" className="btn btn-secondary" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}

interface ScheduleItem {
  type: 'task' | 'milestone' | 'reminder';
  id: string;
  title: string;
  date: string;
  project?: string;
  priority?: string;
  status?: string;
  recurrence?: string | null;
}

export default function SchedulePage() {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [scheduleItems, setScheduleItems] = useState<ScheduleItem[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<'upcoming' | 'reminders'>('upcoming');

  const load = useCallback(async () => {
    try {
      const [remRes, taskRes, mileRes, projRes] = await Promise.all([
        listReminders(),
        listTasks(),
        listMilestones(),
        listProjects(),
      ]);

      setReminders(remRes.reminders);
      setProjects(projRes.projects);

      const projectMap = new Map(projRes.projects.map((p: Project) => [p.id, p.name]));

      const items: ScheduleItem[] = [];

      // Tasks with deadlines
      (taskRes.tasks as Task[])
        .filter((t) => t.deadline && t.status !== 'done')
        .forEach((t) => {
          items.push({
            type: 'task',
            id: t.id,
            title: t.title,
            date: t.deadline!,
            project: t.project_id ? projectMap.get(t.project_id) ?? undefined : undefined,
            priority: t.priority,
            status: t.status,
          });
        });

      // Milestones with target dates
      (mileRes.milestones as Milestone[])
        .filter((m) => m.target_date && m.status !== 'completed')
        .forEach((m) => {
          items.push({
            type: 'milestone',
            id: m.id,
            title: m.title,
            date: m.target_date!,
            project: projectMap.get(m.project_id) ?? undefined,
            status: m.status,
          });
        });

      // Pending reminders
      (remRes.reminders as Reminder[])
        .filter((r) => r.status === 'pending')
        .forEach((r) => {
          items.push({
            type: 'reminder',
            id: r.id,
            title: r.title,
            date: r.remind_at,
            project: r.related_project_id ? projectMap.get(r.related_project_id) ?? undefined : undefined,
            recurrence: r.recurrence,
          });
        });

      // Sort by date
      items.sort((a, b) => a.date.localeCompare(b.date));
      setScheduleItems(items);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCreateReminder = async (data: Partial<Reminder>) => {
    await createReminder(data);
    setCreating(false);
    await load();
  };

  const handleUpdateReminder = async (id: string, data: Partial<Reminder>) => {
    await updateReminder(id, data);
    setEditingId(null);
    await load();
  };

  const handleDeleteReminder = async (id: string) => {
    if (!confirm('Delete this reminder?')) return;
    await deleteReminder(id);
    await load();
  };

  const handleDismissReminder = async (id: string) => {
    await updateReminder(id, { status: 'dismissed' });
    await load();
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = d.getTime() - now.getTime();
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays < 0) return `${Math.abs(diffDays)}d overdue`;
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Tomorrow';
    if (diffDays <= 7) return `In ${diffDays}d`;
    return d.toLocaleDateString();
  };

  const isOverdue = (iso: string) => new Date(iso) < new Date();

  if (loading) return <div className="dash-loading"><div className="spinner" /><p>Loading schedule...</p></div>;
  if (error) return <div className="error-banner"><span>{error}</span></div>;

  return (
    <div className="schedule-page">
      <div className="page-header">
        <h2>Schedule</h2>
        <div className="header-controls">
          <div className="view-toggle">
            <button
              className={`toggle-btn ${view === 'upcoming' ? 'active' : ''}`}
              onClick={() => setView('upcoming')}
            >
              Timeline
            </button>
            <button
              className={`toggle-btn ${view === 'reminders' ? 'active' : ''}`}
              onClick={() => setView('reminders')}
            >
              Reminders
            </button>
          </div>
          <button className="btn btn-primary" onClick={() => { setCreating(!creating); setEditingId(null); }}>
            {creating ? 'Cancel' : '+ Reminder'}
          </button>
        </div>
      </div>

      {creating && (
        <ReminderForm projects={projects} onSave={handleCreateReminder} onCancel={() => setCreating(false)} />
      )}

      {view === 'upcoming' ? (
        /* Timeline View */
        scheduleItems.length === 0 ? (
          <div className="empty-state-large">
            <h3>Nothing scheduled</h3>
            <p>Add deadlines to tasks, target dates to milestones, or create reminders.</p>
          </div>
        ) : (
          <div className="timeline">
            {scheduleItems.map((item) => (
              <div key={`${item.type}-${item.id}`} className={`timeline-item ${isOverdue(item.date) ? 'overdue' : ''}`}>
                <div className="timeline-marker">
                  <span className={`type-icon type-${item.type}`}>
                    {item.type === 'task' ? 'T' : item.type === 'milestone' ? 'M' : 'R'}
                  </span>
                </div>
                <div className="timeline-content">
                  <div className="timeline-top">
                    <span className="timeline-title">{item.title}</span>
                    <span className={`timeline-date ${isOverdue(item.date) ? 'overdue-text' : ''}`}>
                      {formatDate(item.date)}
                    </span>
                  </div>
                  <div className="timeline-meta">
                    <span className="timeline-type">{item.type}</span>
                    {item.project && <span className="timeline-project">{item.project}</span>}
                    {item.priority && <span className={`badge badge-${item.priority}`}>{item.priority}</span>}
                    {item.recurrence && <span className="badge badge-medium">{item.recurrence}</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )
      ) : (
        /* Reminders View */
        reminders.length === 0 ? (
          <div className="empty-state-large">
            <h3>No reminders</h3>
            <p>Create reminders to stay on top of important dates and follow-ups.</p>
            <button className="btn btn-primary" onClick={() => setCreating(true)}>Create Reminder</button>
          </div>
        ) : (
          <div className="reminders-list">
            {reminders.map((r) => {
              if (editingId === r.id) {
                return (
                  <ReminderForm
                    key={r.id}
                    reminder={r}
                    projects={projects}
                    onSave={(data) => handleUpdateReminder(r.id, data)}
                    onCancel={() => setEditingId(null)}
                  />
                );
              }

              return (
                <div key={r.id} className={`reminder-card ${r.status !== 'pending' ? 'inactive' : ''} ${isOverdue(r.remind_at) && r.status === 'pending' ? 'overdue' : ''}`}>
                  <div className="reminder-card-top">
                    <div className="reminder-card-info">
                      <span className="reminder-card-title">{r.title}</span>
                      <span className="reminder-card-time">
                        {new Date(r.remind_at).toLocaleString()}
                        {r.recurrence && <span className="recurrence-badge">{r.recurrence}</span>}
                      </span>
                    </div>
                    <div className="reminder-card-actions">
                      <span className={`badge ${r.status === 'pending' ? 'badge-yellow' : 'badge-low'}`}>{r.status}</span>
                      {r.status === 'pending' && (
                        <button className="btn btn-secondary btn-sm" onClick={() => handleDismissReminder(r.id)}>Dismiss</button>
                      )}
                      <button className="btn btn-secondary btn-sm" onClick={() => { setEditingId(r.id); setCreating(false); }}>Edit</button>
                      <button className="btn btn-danger btn-sm" onClick={() => handleDeleteReminder(r.id)}>Del</button>
                    </div>
                  </div>
                  {r.description && <p className="reminder-card-desc">{r.description}</p>}
                </div>
              );
            })}
          </div>
        )
      )}
    </div>
  );
}
