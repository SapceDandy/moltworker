import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  listProjects,
  getProject,
  createProject,
  updateProject,
  deleteProject,
  listTasks,
  createTask,
  updateTask,
  listMilestones,
  listGoals,
  type Project,
  type Task,
  type Milestone,
  type Goal,
} from '../api';
import './ProjectsPage.css';

// --- Project Form ---

function ProjectForm({ project, onSave, onCancel }: {
  project?: Project;
  onSave: (data: Partial<Project>) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(project?.name ?? '');
  const [description, setDescription] = useState(project?.description ?? '');
  const [priority, setPriority] = useState(project?.priority ?? 'medium');
  const [status, setStatus] = useState(project?.status ?? 'active');
  const [targetDate, setTargetDate] = useState(project?.target_date ?? '');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave({ name, description, priority, status, target_date: targetDate || null });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="entity-form" onSubmit={handleSubmit}>
      <div className="form-group">
        <label htmlFor="name">Name *</label>
        <input id="name" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
      </div>
      <div className="form-group">
        <label htmlFor="description">Description</label>
        <textarea id="description" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
      </div>
      <div className="form-row">
        <div className="form-group">
          <label htmlFor="priority">Priority</label>
          <select id="priority" value={priority} onChange={(e) => setPriority(e.target.value)}>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </select>
        </div>
        <div className="form-group">
          <label htmlFor="status">Status</label>
          <select id="status" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="active">Active</option>
            <option value="paused">Paused</option>
            <option value="completed">Completed</option>
            <option value="archived">Archived</option>
          </select>
        </div>
        <div className="form-group">
          <label htmlFor="target_date">Target Date</label>
          <input id="target_date" type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />
        </div>
      </div>
      <div className="form-actions">
        <button type="submit" className="btn btn-primary" disabled={saving || !name}>
          {saving ? 'Saving...' : project ? 'Update' : 'Create Project'}
        </button>
        <button type="button" className="btn btn-secondary" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}

// --- Quick Task Form ---

function QuickTaskForm({ projectId, onCreated }: { projectId: string; onCreated: () => void }) {
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState('medium');
  const [deadline, setDeadline] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title) return;
    setSaving(true);
    try {
      await createTask({ title, project_id: projectId, priority, deadline: deadline || null });
      setTitle('');
      setDeadline('');
      onCreated();
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="quick-form" onSubmit={handleSubmit}>
      <input placeholder="New task..." value={title} onChange={(e) => setTitle(e.target.value)} />
      <select value={priority} onChange={(e) => setPriority(e.target.value)}>
        <option value="low">Low</option>
        <option value="medium">Med</option>
        <option value="high">High</option>
        <option value="critical">Critical</option>
      </select>
      <input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
      <button type="submit" className="btn btn-primary btn-sm" disabled={saving || !title}>Add</button>
    </form>
  );
}

// --- Project Detail ---

function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [project, setProject] = useState<Project | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [miles, setMiles] = useState<Milestone[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const [pRes, tRes, mRes, gRes] = await Promise.all([
        getProject(id),
        listTasks({ project_id: id }),
        listMilestones(id),
        listGoals({ project_id: id }),
      ]);
      setProject(pRes.project);
      setTasks(tRes.tasks);
      setMiles(mRes.milestones);
      setGoals(gRes.goals);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load project');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const handleSave = async (data: Partial<Project>) => {
    if (!id) return;
    await updateProject(id, data);
    setEditing(false);
    await load();
  };

  const handleDelete = async () => {
    if (!id || !confirm('Delete this project? Tasks, goals, and milestones will remain but be unlinked.')) return;
    await deleteProject(id);
    navigate('/projects');
  };

  const toggleTaskStatus = async (task: Task) => {
    const newStatus = task.status === 'done' ? 'todo' : 'done';
    await updateTask(task.id, { status: newStatus });
    await load();
  };

  if (loading) return <div className="dash-loading"><div className="spinner" /><p>Loading...</p></div>;
  if (error) return <div className="error-banner"><span>{error}</span></div>;
  if (!project) return <div className="error-banner"><span>Project not found</span></div>;

  if (editing) {
    return (
      <div className="project-detail">
        <h2>Edit Project</h2>
        <ProjectForm project={project} onSave={handleSave} onCancel={() => setEditing(false)} />
      </div>
    );
  }

  const todoTasks = tasks.filter((t) => t.status === 'todo' || t.status === 'in_progress' || t.status === 'blocked');
  const doneTasks = tasks.filter((t) => t.status === 'done');

  return (
    <div className="project-detail">
      <div className="detail-header">
        <div>
          <Link to="/projects" className="back-link">&larr; Projects</Link>
          <h2>{project.name}</h2>
          {project.description && <p className="detail-desc">{project.description}</p>}
        </div>
        <div className="detail-actions">
          <span className={`badge badge-${project.priority}`}>{project.priority}</span>
          <span className={`badge badge-health-${project.health}`}>{project.health.replace('_', ' ')}</span>
          <button className="btn btn-secondary btn-sm" onClick={() => setEditing(true)}>Edit</button>
          <button className="btn btn-danger btn-sm" onClick={handleDelete}>Delete</button>
        </div>
      </div>

      <div className="detail-meta">
        {project.target_date && <span>Target: {project.target_date}</span>}
        <span>Progress: {project.percent_complete}%</span>
      </div>

      <div className="detail-grid">
        {/* Tasks */}
        <section className="detail-section">
          <h3>Tasks ({todoTasks.length} open, {doneTasks.length} done)</h3>
          <QuickTaskForm projectId={project.id} onCreated={load} />
          <div className="task-checklist">
            {todoTasks.map((t) => (
              <div key={t.id} className={`check-row ${t.status === 'blocked' ? 'blocked' : ''}`}>
                <input type="checkbox" checked={false} onChange={() => toggleTaskStatus(t)} />
                <span className="check-title">{t.title}</span>
                <span className={`badge badge-${t.priority}`}>{t.priority}</span>
                {t.status === 'blocked' && <span className="badge badge-red">blocked</span>}
                {t.deadline && <span className="check-deadline">{t.deadline}</span>}
              </div>
            ))}
            {doneTasks.slice(0, 5).map((t) => (
              <div key={t.id} className="check-row done">
                <input type="checkbox" checked onChange={() => toggleTaskStatus(t)} />
                <span className="check-title">{t.title}</span>
              </div>
            ))}
            {doneTasks.length > 5 && (
              <div className="check-more">+ {doneTasks.length - 5} more completed</div>
            )}
          </div>
        </section>

        {/* Milestones */}
        <section className="detail-section">
          <h3>Milestones ({miles.length})</h3>
          {miles.length === 0 ? (
            <div className="empty-hint"><p>No milestones yet</p></div>
          ) : (
            <div className="milestone-list">
              {miles.map((m) => (
                <div key={m.id} className={`milestone-row ${m.status === 'completed' ? 'done' : ''}`}>
                  <span className="milestone-title">{m.title}</span>
                  <span className="milestone-meta">
                    <span className={`badge badge-${m.status === 'completed' ? 'low' : 'medium'}`}>{m.status}</span>
                    {m.target_date && <span>{m.target_date}</span>}
                    <span>{m.percent_complete}%</span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Goals */}
        {goals.length > 0 && (
          <section className="detail-section">
            <h3>Goals ({goals.length})</h3>
            <div className="goal-list">
              {goals.map((g) => (
                <div key={g.id} className="goal-row">
                  <span className="goal-title">{g.title}</span>
                  {g.metric && (
                    <span className="goal-progress">
                      {g.current_value ?? '0'} / {g.target_value ?? '?'} {g.metric}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

// --- Project List ---

function ProjectList() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [creating, setCreating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const load = useCallback(async () => {
    try {
      const res = await listProjects();
      setProjects(res.projects);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async (data: Partial<Project>) => {
    const res = await createProject(data);
    setCreating(false);
    navigate(`/projects/${res.id}`);
  };

  if (loading) return <div className="dash-loading"><div className="spinner" /><p>Loading projects...</p></div>;
  if (error) return <div className="error-banner"><span>{error}</span></div>;

  return (
    <div className="projects-page">
      <div className="page-header">
        <h2>Projects</h2>
        <button className="btn btn-primary" onClick={() => setCreating(!creating)}>
          {creating ? 'Cancel' : '+ New Project'}
        </button>
      </div>

      {creating && (
        <ProjectForm onSave={handleCreate} onCancel={() => setCreating(false)} />
      )}

      {projects.length === 0 && !creating ? (
        <div className="empty-state-large">
          <h3>No projects yet</h3>
          <p>Create your first project to start tracking goals and tasks.</p>
          <button className="btn btn-primary" onClick={() => setCreating(true)}>Create Project</button>
        </div>
      ) : (
        <div className="project-cards">
          {projects.map((p) => (
            <Link to={`/projects/${p.id}`} key={p.id} className="project-card">
              <div className="card-top">
                <span className="project-name">{p.name}</span>
                <div className="card-badges">
                  <span className={`badge badge-${p.priority}`}>{p.priority}</span>
                  <span className={`badge badge-health-${p.health}`}>{p.health.replace('_', ' ')}</span>
                </div>
              </div>
              {p.description && <p className="card-desc">{p.description}</p>}
              <div className="card-bottom">
                <div className="progress-bar-wrap">
                  <div className="progress-bar" style={{ width: `${p.percent_complete}%` }} />
                  <span className="progress-label">{p.percent_complete}%</span>
                </div>
                {p.target_date && <span className="card-date">Due: {p.target_date}</span>}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

// --- Router Entry ---

export default function ProjectsPage() {
  const { id } = useParams();
  return id ? <ProjectDetail /> : <ProjectList />;
}
