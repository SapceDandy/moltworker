import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  closestCorners,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  listTasks,
  listProjects,
  createTask,
  updateTask,
  deleteTask,
  getTask,
  listComments,
  createComment,
  resolveComment,
  ApiError,
  type Task,
  type Project,
  type Blocker,
  type TaskComment,
} from '../api';
import './BoardPage.css';

// --- Column definitions ---

const COLUMNS = [
  { id: 'todo', title: 'Backlog' },
  { id: 'in_progress', title: 'In Progress' },
  { id: 'review', title: 'Review' },
  { id: 'done', title: 'Done' },
  { id: 'blocked', title: 'Blocked' },
] as const;

type ColumnId = (typeof COLUMNS)[number]['id'];

// --- Sortable Task Card ---

function SortableTaskCard({
  task,
  projectName,
  onClick,
}: {
  task: Task;
  projectName?: string;
  onClick: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id, data: { task } });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const isOverdue =
    task.deadline &&
    task.status !== 'done' &&
    new Date(task.deadline) < new Date();

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`task-card ${isDragging ? 'dragging' : ''}`}
      {...attributes}
      {...listeners}
      onClick={(e) => {
        // Don't open detail if dragging
        if (!isDragging) {
          e.stopPropagation();
          onClick();
        }
      }}
    >
      <p className="card-title">{task.title}</p>
      <div className="card-meta">
        <span className={`card-badge priority-${task.priority}`}>
          {task.priority}
        </span>
        {projectName && <span className="card-project">{projectName}</span>}
        {task.deadline && (
          <span className={`card-deadline ${isOverdue ? 'overdue' : ''}`}>
            {task.deadline}
          </span>
        )}
      </div>
    </div>
  );
}

// --- Overlay card (shown while dragging) ---

function TaskCardOverlay({
  task,
  projectName,
}: {
  task: Task;
  projectName?: string;
}) {
  return (
    <div className="task-card drag-overlay">
      <p className="card-title">{task.title}</p>
      <div className="card-meta">
        <span className={`card-badge priority-${task.priority}`}>
          {task.priority}
        </span>
        {projectName && <span className="card-project">{projectName}</span>}
      </div>
    </div>
  );
}

// --- Column Droppable ---

function BoardColumn({
  column,
  tasks,
  projectMap,
  onCardClick,
  onQuickAdd,
}: {
  column: (typeof COLUMNS)[number];
  tasks: Task[];
  projectMap: Map<string, string>;
  onCardClick: (task: Task) => void;
  onQuickAdd: (title: string, status: ColumnId) => Promise<void>;
}) {
  const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [saving, setSaving] = useState(false);

  const taskIds = useMemo(() => tasks.map((t) => t.id), [tasks]);

  const { setNodeRef: setDroppableRef } = useDroppable({ id: column.id });

  const handleAdd = async () => {
    if (!newTitle.trim()) return;
    setSaving(true);
    try {
      await onQuickAdd(newTitle.trim(), column.id);
      setNewTitle('');
      setAdding(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="board-column" id={`column-${column.id}`}>
      <div className="column-header">
        <div className="column-title">
          <h3>{column.title}</h3>
          <span className="column-count">{tasks.length}</span>
        </div>
        <button
          className="column-add-btn"
          onClick={() => setAdding(true)}
          title="Add task"
        >
          +
        </button>
      </div>

      <SortableContext items={taskIds} strategy={verticalListSortingStrategy}>
        <div className="column-cards" id={`cards-${column.id}`} ref={setDroppableRef}>
          {tasks.length === 0 && !adding && (
            <div className="column-empty">No tasks</div>
          )}
          {tasks.map((task) => (
            <SortableTaskCard
              key={task.id}
              task={task}
              projectName={
                task.project_id ? projectMap.get(task.project_id) : undefined
              }
              onClick={() => onCardClick(task)}
            />
          ))}
        </div>
      </SortableContext>

      {adding && (
        <div className="quick-add-form">
          <input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Task title..."
            autoFocus
            disabled={saving}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAdd();
              if (e.key === 'Escape') {
                setAdding(false);
                setNewTitle('');
              }
            }}
          />
          <div className="quick-add-actions">
            <button className="btn-save" onClick={handleAdd} disabled={saving}>
              {saving ? '...' : 'Add'}
            </button>
            <button
              onClick={() => {
                setAdding(false);
                setNewTitle('');
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// --- Task Detail Panel ---

// --- Comments Thread ---

function CommentsThread({ taskId }: { taskId: string }) {
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [posting, setPosting] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    listComments(taskId)
      .then((res) => {
        if (!cancelled) setComments(res.comments || []);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => { cancelled = true; };
  }, [taskId]);

  const handlePost = async () => {
    if (!newComment.trim()) return;
    setPosting(true);
    try {
      const res = await createComment(taskId, { content: newComment.trim() });
      setComments((prev) => [
        ...prev,
        {
          id: res.id,
          task_id: taskId,
          author: 'user',
          author_name: null,
          content: newComment.trim(),
          comment_type: 'comment',
          metadata: null,
          created_at: new Date().toISOString(),
          resolved_at: null,
        },
      ]);
      setNewComment('');
    } catch {
      // ignore
    } finally {
      setPosting(false);
    }
  };

  const handleResolve = async (commentId: string) => {
    try {
      const res = await resolveComment(taskId, commentId);
      if (res.ok) {
        setComments((prev) =>
          prev.map((c) =>
            c.id === commentId ? { ...c, resolved_at: res.resolved_at || new Date().toISOString() } : c,
          ),
        );
      }
    } catch {
      // ignore
    }
  };

  const unresolvedCount = comments.filter(
    (c) => c.comment_type === 'blocking' && !c.resolved_at,
  ).length;

  return (
    <div className="comments-section">
      <span className="detail-label">
        Comments ({comments.length})
        {unresolvedCount > 0 && (
          <span className="blocking-count"> — {unresolvedCount} blocking</span>
        )}
      </span>
      <div className="comments-list">
        {!loaded && <div className="comment-loading">Loading...</div>}
        {loaded && comments.length === 0 && (
          <div className="comment-empty">No comments yet</div>
        )}
        {comments.map((c) => {
          const isBlocking = c.comment_type === 'blocking';
          const isUnresolved = isBlocking && !c.resolved_at;
          return (
            <div
              key={c.id}
              className={`comment-item ${c.author === 'agent' ? 'comment-agent' : 'comment-user'}${isUnresolved ? ' comment-blocking' : ''}${isBlocking && c.resolved_at ? ' comment-resolved' : ''}`}
            >
              <div className="comment-header">
                <span className={`comment-author ${c.author === 'agent' ? 'author-agent' : ''}`}>
                  {c.author === 'agent' ? (c.author_name || 'Kudjo') : 'You'}
                </span>
                {isBlocking && (
                  <span className={`comment-type-badge ${isUnresolved ? 'badge-blocking' : 'badge-resolved'}`}>
                    {isUnresolved ? 'blocking' : 'resolved'}
                  </span>
                )}
                {!isBlocking && c.comment_type !== 'comment' && (
                  <span className="comment-type-badge">{c.comment_type.replace(/_/g, ' ')}</span>
                )}
                <span className="comment-time">
                  {new Date(c.created_at).toLocaleString()}
                </span>
              </div>
              <div className="comment-body">{c.content}</div>
              {isUnresolved && (
                <button
                  className="btn-resolve"
                  onClick={() => handleResolve(c.id)}
                >
                  Resolve
                </button>
              )}
            </div>
          );
        })}
      </div>
      <div className="comment-input">
        <textarea
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          placeholder="Add a comment..."
          rows={2}
          disabled={posting}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handlePost();
          }}
        />
        <button
          className="btn-save"
          onClick={handlePost}
          disabled={posting || !newComment.trim()}
        >
          {posting ? '...' : 'Post'}
        </button>
      </div>
    </div>
  );
}

// --- Task Detail Panel ---

function TaskDetailPanel({
  taskId,
  projectMap,
  onClose,
  onUpdate,
  onDelete,
}: {
  taskId: string;
  projectMap: Map<string, string>;
  onClose: () => void;
  onUpdate: (id: string, data: Partial<Task>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [task, setTask] = useState<Task | null>(null);
  const [blockers, setBlockers] = useState<Blocker[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);

  // Edit state
  const [editTitle, setEditTitle] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editStatus, setEditStatus] = useState('');
  const [editPriority, setEditPriority] = useState('');
  const [editDeadline, setEditDeadline] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getTask(taskId)
      .then((res) => {
        if (cancelled) return;
        setTask(res.task);
        setBlockers(res.blockers || []);
        setEditTitle(res.task.title);
        setEditDesc(res.task.description || '');
        setEditStatus(res.task.status);
        setEditPriority(res.task.priority);
        setEditDeadline(res.task.deadline || '');
      })
      .catch(() => {
        if (!cancelled) setTask(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [taskId]);

  const handleSave = async () => {
    if (!task) return;
    setSaving(true);
    try {
      await onUpdate(task.id, {
        title: editTitle,
        description: editDesc,
        status: editStatus,
        priority: editPriority,
        deadline: editDeadline || null,
      });
      setTask({
        ...task,
        title: editTitle,
        description: editDesc,
        status: editStatus,
        priority: editPriority,
        deadline: editDeadline || null,
      });
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!task) return;
    if (!confirm('Delete this task?')) return;
    await onDelete(task.id);
    onClose();
  };

  if (loading) {
    return (
      <>
        <div className="detail-overlay" onClick={onClose} />
        <div className="detail-panel">
          <div className="board-loading">
            <div className="spinner" />
            <p>Loading task...</p>
          </div>
        </div>
      </>
    );
  }

  if (!task) {
    return (
      <>
        <div className="detail-overlay" onClick={onClose} />
        <div className="detail-panel">
          <div className="board-loading">
            <p>Task not found</p>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="detail-overlay" onClick={onClose} />
      <div className="detail-panel">
        <div className="detail-header">
          <h3>{task.title}</h3>
          <button className="detail-close" onClick={onClose}>
            &times;
          </button>
        </div>

        <div className="detail-body">
          {editing ? (
            <>
              <div className="detail-field detail-edit-field">
                <span className="detail-label">Title</span>
                <input
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                />
              </div>
              <div className="detail-field detail-edit-field">
                <span className="detail-label">Description</span>
                <textarea
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                  rows={4}
                />
              </div>
              <div className="detail-row">
                <div className="detail-field detail-edit-field">
                  <span className="detail-label">Status</span>
                  <select
                    value={editStatus}
                    onChange={(e) => setEditStatus(e.target.value)}
                  >
                    <option value="todo">Backlog</option>
                    <option value="in_progress">In Progress</option>
                    <option value="review">Review</option>
                    <option value="done">Done</option>
                    <option value="blocked">Blocked</option>
                    <option value="deferred">Deferred</option>
                  </select>
                </div>
                <div className="detail-field detail-edit-field">
                  <span className="detail-label">Priority</span>
                  <select
                    value={editPriority}
                    onChange={(e) => setEditPriority(e.target.value)}
                  >
                    <option value="critical">Critical</option>
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>
                </div>
              </div>
              <div className="detail-field detail-edit-field">
                <span className="detail-label">Deadline</span>
                <input
                  type="date"
                  value={editDeadline}
                  onChange={(e) => setEditDeadline(e.target.value)}
                />
              </div>
            </>
          ) : (
            <>
              <div className="detail-field">
                <span className="detail-label">Description</span>
                <span
                  className={`detail-value ${!task.description ? 'empty' : ''}`}
                >
                  {task.description || 'No description'}
                </span>
              </div>
              <div className="detail-row">
                <div className="detail-field">
                  <span className="detail-label">Status</span>
                  <span className="detail-value">
                    {COLUMNS.find((c) => c.id === task.status)?.title ||
                      task.status}
                  </span>
                </div>
                <div className="detail-field">
                  <span className="detail-label">Priority</span>
                  <span className="detail-value">
                    <span className={`card-badge priority-${task.priority}`}>
                      {task.priority}
                    </span>
                  </span>
                </div>
              </div>
              <div className="detail-row">
                <div className="detail-field">
                  <span className="detail-label">Project</span>
                  <span
                    className={`detail-value ${!task.project_id ? 'empty' : ''}`}
                  >
                    {task.project_id
                      ? projectMap.get(task.project_id) || task.project_id
                      : 'None'}
                  </span>
                </div>
                <div className="detail-field">
                  <span className="detail-label">Deadline</span>
                  <span
                    className={`detail-value ${!task.deadline ? 'empty' : ''}`}
                  >
                    {task.deadline || 'None'}
                  </span>
                </div>
              </div>
              {task.blocked_reason && (
                <div className="detail-field">
                  <span className="detail-label">Blocked Reason</span>
                  <span className="detail-value">{task.blocked_reason}</span>
                </div>
              )}
              {blockers.length > 0 && (
                <div className="detail-field">
                  <span className="detail-label">
                    Open Blockers ({blockers.length})
                  </span>
                  <div className="detail-blockers">
                    {blockers.map((b) => (
                      <div key={b.id} className="detail-blocker">
                        <span className={`badge badge-${b.severity}`}>
                          {b.severity}
                        </span>
                        <span>{b.description}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="detail-row">
                <div className="detail-field">
                  <span className="detail-label">Created</span>
                  <span className="detail-value">
                    {new Date(task.created_at).toLocaleDateString()}
                  </span>
                </div>
                <div className="detail-field">
                  <span className="detail-label">Updated</span>
                  <span className="detail-value">
                    {new Date(task.updated_at).toLocaleDateString()}
                  </span>
                </div>
              </div>
              <CommentsThread taskId={task.id} />
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
              <button className="btn-danger" onClick={handleDelete}>
                Delete
              </button>
            </>
          )}
        </div>
      </div>
    </>
  );
}

// --- Main Board Page ---

export default function BoardPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterProjectId, setFilterProjectId] = useState<string>('');
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [detailTaskId, setDetailTaskId] = useState<string | null>(null);

  // Map project id -> name
  const projectMap = useMemo(() => {
    const m = new Map<string, string>();
    projects.forEach((p) => m.set(p.id, p.name));
    return m;
  }, [projects]);

  // Group tasks by column status
  const tasksByColumn = useMemo(() => {
    const filtered = filterProjectId
      ? tasks.filter((t) => t.project_id === filterProjectId)
      : tasks;

    const map: Record<ColumnId, Task[]> = {
      todo: [],
      in_progress: [],
      review: [],
      done: [],
      blocked: [],
    };

    for (const task of filtered) {
      const col = (task.status as ColumnId) in map ? (task.status as ColumnId) : 'todo';
      map[col].push(task);
    }

    return map;
  }, [tasks, filterProjectId]);

  const loadData = useCallback(async () => {
    try {
      const [tasksRes, projectsRes] = await Promise.all([
        listTasks(),
        listProjects('active'),
      ]);
      setTasks(tasksRes.tasks);
      setProjects(projectsRes.projects);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load board');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  // Find which column a task is in
  const findColumnForTask = useCallback(
    (taskId: string): ColumnId | null => {
      for (const [col, colTasks] of Object.entries(tasksByColumn)) {
        if (colTasks.some((t) => t.id === taskId)) {
          return col as ColumnId;
        }
      }
      return null;
    },
    [tasksByColumn],
  );

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      const task = tasks.find((t) => t.id === event.active.id);
      setActiveTask(task || null);
    },
    [tasks],
  );

  const handleDragOver = useCallback((_event: DragOverEvent) => {
    // Could add visual feedback here
  }, []);

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      setActiveTask(null);
      const { active, over } = event;

      if (!over) return;

      const taskId = active.id as string;

      // Determine the target column
      let targetColumn: ColumnId | null = null;

      // Check if dropped over a column droppable area
      const overId = over.id as string;

      // If dropped on another task card, find its column
      const overTaskColumn = findColumnForTask(overId);
      if (overTaskColumn) {
        targetColumn = overTaskColumn;
      }

      // If dropped on the column container itself
      for (const col of COLUMNS) {
        if (overId === col.id || overId === `cards-${col.id}`) {
          targetColumn = col.id;
          break;
        }
      }

      if (!targetColumn) return;

      // Only update if status changed
      const task = tasks.find((t) => t.id === taskId);
      if (!task || task.status === targetColumn) return;

      // Optimistic update
      setTasks((prev) =>
        prev.map((t) =>
          t.id === taskId ? { ...t, status: targetColumn as string } : t,
        ),
      );

      try {
        await updateTask(taskId, { status: targetColumn });
      } catch (err: unknown) {
        // Show blocking comments error to user
        if (err instanceof ApiError && err.code === 'BLOCKING_COMMENTS') {
          const comments = (err.details.unresolved_comments as Array<{ content: string }>) || [];
          const items = comments.map((c) => `• ${c.content}`).join('\n');
          alert(`${err.message}\n\n${items}\n\nOpen the task to resolve blocking comments first.`);
        }
        // Revert on error
        loadData();
      }
    },
    [tasks, findColumnForTask, loadData],
  );

  const handleQuickAdd = useCallback(
    async (title: string, status: ColumnId) => {
      const data: Partial<Task> = {
        title,
        status,
        priority: 'medium',
        project_id: filterProjectId || null,
      };
      const res = await createTask(data);
      // Add to local state immediately
      const newTask: Task = {
        id: res.id,
        title,
        description: '',
        status,
        priority: 'medium',
        project_id: filterProjectId || null,
        milestone_id: null,
        deadline: null,
        completed_date: null,
        blocked_reason: null,
        deferred_until: null,
        sort_order: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      setTasks((prev) => [...prev, newTask]);
    },
    [filterProjectId],
  );

  const handleTaskUpdate = useCallback(
    async (id: string, data: Partial<Task>) => {
      await updateTask(id, data);
      setTasks((prev) =>
        prev.map((t) => (t.id === id ? { ...t, ...data } : t)),
      );
    },
    [],
  );

  const handleTaskDelete = useCallback(
    async (id: string) => {
      await deleteTask(id);
      setTasks((prev) => prev.filter((t) => t.id !== id));
    },
    [],
  );

  if (loading) {
    return (
      <div className="board-loading">
        <div className="spinner" />
        <p>Loading board...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="error-banner">
        <span>{error}</span>
      </div>
    );
  }

  return (
    <div className="board-page">
      <div className="board-header">
        <h2>Task Board</h2>
        <div className="board-controls">
          <select
            value={filterProjectId}
            onChange={(e) => setFilterProjectId(e.target.value)}
          >
            <option value="">All Projects</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <div className="board-columns">
          {COLUMNS.map((col) => (
            <BoardColumn
              key={col.id}
              column={col}
              tasks={tasksByColumn[col.id]}
              projectMap={projectMap}
              onCardClick={(task) => setDetailTaskId(task.id)}
              onQuickAdd={handleQuickAdd}
            />
          ))}
        </div>

        <DragOverlay>
          {activeTask ? (
            <TaskCardOverlay
              task={activeTask}
              projectName={
                activeTask.project_id
                  ? projectMap.get(activeTask.project_id)
                  : undefined
              }
            />
          ) : null}
        </DragOverlay>
      </DndContext>

      {detailTaskId && (
        <TaskDetailPanel
          taskId={detailTaskId}
          projectMap={projectMap}
          onClose={() => setDetailTaskId(null)}
          onUpdate={handleTaskUpdate}
          onDelete={handleTaskDelete}
        />
      )}
    </div>
  );
}
