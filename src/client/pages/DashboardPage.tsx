import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  getDashboard,
  listReminders,
  listAgentLogs,
  type DashboardResponse,
  type Reminder,
  type AgentLog,
} from '../api';
import './DashboardPage.css';

export default function DashboardPage() {
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [logs, setLogs] = useState<AgentLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const [dash, rem, lg] = await Promise.all([
          getDashboard(),
          listReminders({ upcoming: true }),
          listAgentLogs({ limit: 5 }),
        ]);
        setDashboard(dash);
        setReminders(rem.reminders);
        setLogs(lg.logs);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load dashboard');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="dash-loading">
        <div className="spinner" />
        <p>Loading dashboard...</p>
      </div>
    );
  }

  if (error) {
    return <div className="error-banner"><span>{error}</span></div>;
  }

  const s = dashboard?.summary;

  return (
    <div className="dashboard-page">
      <div className="dash-header">
        <h2>Dashboard</h2>
        <span className="dash-date">{dashboard?.date}</span>
      </div>

      {/* Summary Cards */}
      <div className="summary-cards">
        <Link to="/projects" className="summary-card">
          <span className="card-value">{s?.active_projects ?? 0}</span>
          <span className="card-label">Active Projects</span>
        </Link>
        <Link to="/board" className={`summary-card ${(s?.tasks_in_progress ?? 0) > 0 ? 'highlight-blue' : ''}`}>
          <span className="card-value">{s?.tasks_in_progress ?? 0}</span>
          <span className="card-label">In Progress</span>
        </Link>
        <Link to="/board" className={`summary-card ${(s?.tasks_due_today ?? 0) > 0 ? 'highlight-yellow' : ''}`}>
          <span className="card-value">{s?.tasks_due_today ?? 0}</span>
          <span className="card-label">Due Today</span>
        </Link>
        <Link to="/board" className={`summary-card ${(s?.overdue_tasks ?? 0) > 0 ? 'highlight-red' : ''}`}>
          <span className="card-value">{s?.overdue_tasks ?? 0}</span>
          <span className="card-label">Overdue</span>
        </Link>
        <Link to="/board" className={`summary-card ${(s?.open_blockers ?? 0) > 0 ? 'highlight-red' : ''}`}>
          <span className="card-value">{s?.open_blockers ?? 0}</span>
          <span className="card-label">Blockers</span>
        </Link>
        <Link to="/projects" className={`summary-card ${(s?.stalled_projects ?? 0) > 0 ? 'highlight-yellow' : ''}`}>
          <span className="card-value">{s?.stalled_projects ?? 0}</span>
          <span className="card-label">Stalled</span>
        </Link>
      </div>

      <div className="dash-grid">
        {/* Active Projects */}
        <section className="dash-section">
          <div className="section-title">
            <h3>Active Projects</h3>
            <Link to="/projects" className="link-btn">View all</Link>
          </div>
          {(dashboard?.projects ?? []).length === 0 ? (
            <div className="empty-hint">
              <p>No active projects</p>
              <Link to="/projects" className="link-btn">Create your first project</Link>
            </div>
          ) : (
            <div className="project-list">
              {(dashboard?.projects ?? []).slice(0, 5).map((p) => (
                <Link to={`/projects/${p.id}`} key={p.id} className="project-row">
                  <div className="project-info">
                    <span className="project-name">{p.name}</span>
                    <span className={`badge badge-${p.priority}`}>{p.priority}</span>
                    <span className={`badge badge-health-${p.health}`}>{p.health.replace('_', ' ')}</span>
                  </div>
                  <div className="progress-bar-wrap">
                    <div className="progress-bar" style={{ width: `${p.percent_complete}%` }} />
                    <span className="progress-label">{p.percent_complete}%</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>

        {/* Overdue & Today Tasks */}
        <section className="dash-section">
          <h3>Tasks Needing Attention</h3>
          {(dashboard?.overdue_tasks ?? []).length === 0 && (dashboard?.today_tasks ?? []).length === 0 ? (
            <div className="empty-hint"><p>No overdue or due-today tasks</p></div>
          ) : (
            <div className="task-list">
              {(dashboard?.overdue_tasks ?? []).map((t) => (
                <Link to={t.project_id ? `/projects/${t.project_id}` : '/board'} key={t.id} className="task-row overdue">
                  <span className="task-title">{t.title}</span>
                  <span className="task-meta">
                    <span className="badge badge-red">overdue</span>
                    {t.project_name && <span className="task-project">{t.project_name}</span>}
                    {t.deadline && <span className="task-deadline">{t.deadline}</span>}
                  </span>
                </Link>
              ))}
              {(dashboard?.today_tasks ?? []).map((t) => (
                <Link to={t.project_id ? `/projects/${t.project_id}` : '/board'} key={t.id} className="task-row today">
                  <span className="task-title">{t.title}</span>
                  <span className="task-meta">
                    <span className="badge badge-yellow">today</span>
                    {t.project_name && <span className="task-project">{t.project_name}</span>}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </section>

        {/* Upcoming Reminders */}
        <section className="dash-section">
          <div className="section-title">
            <h3>Upcoming Reminders</h3>
            <Link to="/schedule" className="link-btn">View schedule</Link>
          </div>
          {reminders.length === 0 ? (
            <div className="empty-hint"><p>No upcoming reminders</p></div>
          ) : (
            <div className="reminder-list">
              {reminders.slice(0, 5).map((r) => (
                <Link to="/schedule" key={r.id} className="reminder-row">
                  <span className="reminder-title">{r.title}</span>
                  <span className="reminder-time">{new Date(r.remind_at).toLocaleString()}</span>
                </Link>
              ))}
            </div>
          )}
        </section>

        {/* Recent Agent Activity */}
        <section className="dash-section">
          <h3>Recent Agent Activity</h3>
          {logs.length === 0 ? (
            <div className="empty-hint"><p>No recent activity</p></div>
          ) : (
            <div className="log-list">
              {logs.map((l) => (
                <div key={l.id} className="log-row">
                  <span className="log-action">{l.action.replace(/_/g, ' ')}</span>
                  <span className="log-time">{new Date(l.created_at).toLocaleString()}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Blocked Tasks */}
        {(dashboard?.blocked_tasks ?? []).length > 0 && (
          <section className="dash-section blockers-section">
            <h3>Blocked Tasks ({dashboard?.blocked_tasks.length})</h3>
            <div className="task-list">
              {(dashboard?.blocked_tasks ?? []).map((t) => (
                <Link to={t.project_id ? `/projects/${t.project_id}` : '/board'} key={t.id} className="task-row overdue">
                  <span className="task-title">{t.title}</span>
                  <span className="task-meta">
                    <span className="badge badge-red">blocked</span>
                    {t.project_name && <span className="task-project">{t.project_name}</span>}
                  </span>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Open Blockers */}
        {(dashboard?.open_blockers ?? []).length > 0 && (
          <section className="dash-section blockers-section">
            <h3>Open Blockers</h3>
            <div className="blocker-list">
              {(dashboard?.open_blockers ?? []).map((b) => (
                <Link to={b.project_id ? `/projects/${b.project_id}` : '/board'} key={b.id} className="blocker-row">
                  <span className={`badge badge-${b.severity}`}>{b.severity}</span>
                  <span className="blocker-desc">{b.description}</span>
                  {b.project_name && <span className="blocker-project">{b.project_name}</span>}
                  {b.days_open != null && <span className="blocker-age">{b.days_open}d open</span>}
                </Link>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
