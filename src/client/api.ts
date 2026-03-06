// API client for admin endpoints
// Authentication is handled by Cloudflare Access (JWT in cookies)

const API_BASE = '/api/admin';

export interface PendingDevice {
  requestId: string;
  deviceId: string;
  displayName?: string;
  platform?: string;
  clientId?: string;
  clientMode?: string;
  role?: string;
  roles?: string[];
  scopes?: string[];
  remoteIp?: string;
  ts: number;
}

export interface PairedDevice {
  deviceId: string;
  displayName?: string;
  platform?: string;
  clientId?: string;
  clientMode?: string;
  role?: string;
  roles?: string[];
  scopes?: string[];
  createdAtMs: number;
  approvedAtMs: number;
}

export interface DeviceListResponse {
  pending: PendingDevice[];
  paired: PairedDevice[];
  raw?: string;
  stderr?: string;
  parseError?: string;
  error?: string;
}

export interface ApproveResponse {
  success: boolean;
  requestId: string;
  message?: string;
  stdout?: string;
  stderr?: string;
  error?: string;
}

export interface ApproveAllResponse {
  approved: string[];
  failed: Array<{ requestId: string; success: boolean; error?: string }>;
  message?: string;
  error?: string;
}

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthError';
  }
}

async function apiRequest<T>(path: string, options: globalThis.RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  } as globalThis.RequestInit);

  if (response.status === 401) {
    throw new AuthError('Unauthorized - please log in via Cloudflare Access');
  }

  const data = (await response.json()) as T & { error?: string };

  if (!response.ok) {
    throw new Error(data.error || `API error: ${response.status}`);
  }

  return data;
}

export async function listDevices(): Promise<DeviceListResponse> {
  return apiRequest<DeviceListResponse>('/devices');
}

export async function approveDevice(requestId: string): Promise<ApproveResponse> {
  return apiRequest<ApproveResponse>(`/devices/${requestId}/approve`, {
    method: 'POST',
  });
}

export async function approveAllDevices(): Promise<ApproveAllResponse> {
  return apiRequest<ApproveAllResponse>('/devices/approve-all', {
    method: 'POST',
  });
}

export interface RestartGatewayResponse {
  success: boolean;
  message?: string;
  error?: string;
}

export async function restartGateway(): Promise<RestartGatewayResponse> {
  return apiRequest<RestartGatewayResponse>('/gateway/restart', {
    method: 'POST',
  });
}

export interface StorageStatusResponse {
  configured: boolean;
  missing?: string[];
  lastSync: string | null;
  message: string;
}

export async function getStorageStatus(): Promise<StorageStatusResponse> {
  return apiRequest<StorageStatusResponse>('/storage');
}

export interface SyncResponse {
  success: boolean;
  message?: string;
  lastSync?: string;
  error?: string;
  details?: string;
}

export async function triggerSync(): Promise<SyncResponse> {
  return apiRequest<SyncResponse>('/storage/sync', {
    method: 'POST',
  });
}

// ============================================================
// Executive Assistant API Client
// Routes are mounted at /api/* (not /api/admin/*)
// ============================================================

async function execApi<T>(path: string, options: globalThis.RequestInit = {}): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  } as globalThis.RequestInit);

  if (response.status === 401) {
    throw new AuthError('Unauthorized - please log in via Cloudflare Access');
  }

  const data = (await response.json()) as T & { error?: unknown };

  if (!response.ok) {
    const errMsg = typeof data.error === 'string'
      ? data.error
      : (data.error as Record<string, string>)?.message || `API error: ${response.status}`;
    throw new Error(errMsg);
  }

  return data;
}

// --- Types ---

export interface Project {
  id: string;
  name: string;
  description: string;
  status: string;
  priority: string;
  health: string;
  percent_complete: number;
  start_date: string | null;
  target_date: string | null;
  completed_date: string | null;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface Task {
  id: string;
  project_id: string | null;
  milestone_id: string | null;
  title: string;
  description: string;
  status: string;
  priority: string;
  deadline: string | null;
  completed_date: string | null;
  blocked_reason: string | null;
  deferred_until: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
  project_name?: string;
}

export interface Goal {
  id: string;
  project_id: string | null;
  title: string;
  description: string;
  metric: string | null;
  target_value: string | null;
  current_value: string | null;
  status: string;
  target_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface Milestone {
  id: string;
  project_id: string;
  title: string;
  description: string;
  status: string;
  percent_complete: number;
  target_date: string | null;
  completed_date: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface Reminder {
  id: string;
  title: string;
  description: string | null;
  remind_at: string;
  status: string;
  related_project_id: string | null;
  related_task_id: string | null;
  recurrence: string | null;
  created_at: string;
}

export interface Blocker {
  id: string;
  project_id: string | null;
  task_id: string | null;
  description: string;
  status: string;
  severity: string;
  resolved_at: string | null;
  resolution: string | null;
  created_at: string;
  updated_at: string;
  project_name?: string;
  task_title?: string;
  days_open?: number;
}

export interface AgentLog {
  id: string;
  action: string;
  details: string | null;
  source: string;
  created_at: string;
}

export interface DashboardSummary {
  active_projects: number;
  overdue_tasks: number;
  open_blockers: number;
  critical_blockers: number;
  tasks_due_today: number;
  tasks_in_progress: number;
  stalled_projects: number;
}

export interface DashboardResponse {
  date: string;
  summary: DashboardSummary;
  projects: Project[];
  overdue_tasks: Task[];
  today_tasks: Task[];
  in_progress_tasks: Task[];
  open_blockers: Blocker[];
  upcoming_deadlines: Task[];
  stalled_projects: Project[];
  last_checkin: Record<string, unknown> | null;
}

// --- Projects ---

export async function listProjects(status?: string): Promise<{ projects: Project[] }> {
  const params = status ? `?status=${status}` : '';
  return execApi(`/projects${params}`);
}

export async function getProject(id: string): Promise<{
  project: Project;
  task_counts: Array<{ status: string; count: number }>;
  open_blockers: number;
  milestones: number;
}> {
  return execApi(`/projects/${id}`);
}

export async function createProject(data: Partial<Project>): Promise<{ ok: boolean; id: string }> {
  return execApi('/projects', { method: 'POST', body: JSON.stringify(data) });
}

export async function updateProject(id: string, data: Partial<Project>): Promise<{ ok: boolean; id: string }> {
  return execApi(`/projects/${id}`, { method: 'PUT', body: JSON.stringify(data) });
}

export async function deleteProject(id: string): Promise<{ ok: boolean; id: string }> {
  return execApi(`/projects/${id}`, { method: 'DELETE' });
}

// --- Tasks ---

export async function listTasks(filters?: { project_id?: string; status?: string }): Promise<{ tasks: Task[] }> {
  const params = new URLSearchParams();
  if (filters?.project_id) params.set('project_id', filters.project_id);
  if (filters?.status) params.set('status', filters.status);
  const qs = params.toString();
  return execApi(`/tasks${qs ? `?${qs}` : ''}`);
}

export async function createTask(data: Partial<Task>): Promise<{ ok: boolean; id: string }> {
  return execApi('/tasks', { method: 'POST', body: JSON.stringify(data) });
}

export async function updateTask(id: string, data: Partial<Task>): Promise<{ ok: boolean; id: string }> {
  return execApi(`/tasks/${id}`, { method: 'PUT', body: JSON.stringify(data) });
}

export async function deleteTask(id: string): Promise<{ ok: boolean; id: string }> {
  return execApi(`/tasks/${id}`, { method: 'DELETE' });
}

// --- Goals ---

export async function listGoals(filters?: { project_id?: string; status?: string }): Promise<{ goals: Goal[] }> {
  const params = new URLSearchParams();
  if (filters?.project_id) params.set('project_id', filters.project_id);
  if (filters?.status) params.set('status', filters.status);
  const qs = params.toString();
  return execApi(`/goals${qs ? `?${qs}` : ''}`);
}

export async function createGoal(data: Partial<Goal>): Promise<{ ok: boolean; id: string }> {
  return execApi('/goals', { method: 'POST', body: JSON.stringify(data) });
}

export async function updateGoal(id: string, data: Partial<Goal>): Promise<{ ok: boolean; id: string }> {
  return execApi(`/goals/${id}`, { method: 'PUT', body: JSON.stringify(data) });
}

export async function deleteGoal(id: string): Promise<{ ok: boolean; id: string }> {
  return execApi(`/goals/${id}`, { method: 'DELETE' });
}

// --- Milestones ---

export async function listMilestones(projectId?: string): Promise<{ milestones: Milestone[] }> {
  const params = projectId ? `?project_id=${projectId}` : '';
  return execApi(`/milestones${params}`);
}

export async function createMilestone(data: Partial<Milestone>): Promise<{ ok: boolean; id: string }> {
  return execApi('/milestones', { method: 'POST', body: JSON.stringify(data) });
}

export async function updateMilestone(id: string, data: Partial<Milestone>): Promise<{ ok: boolean; id: string }> {
  return execApi(`/milestones/${id}`, { method: 'PUT', body: JSON.stringify(data) });
}

export async function deleteMilestone(id: string): Promise<{ ok: boolean; id: string }> {
  return execApi(`/milestones/${id}`, { method: 'DELETE' });
}

// --- Reminders ---

export async function listReminders(filters?: { status?: string; upcoming?: boolean }): Promise<{ reminders: Reminder[] }> {
  const params = new URLSearchParams();
  if (filters?.status) params.set('status', filters.status);
  if (filters?.upcoming) params.set('upcoming', 'true');
  const qs = params.toString();
  return execApi(`/reminders${qs ? `?${qs}` : ''}`);
}

export async function createReminder(data: Partial<Reminder>): Promise<{ ok: boolean; id: string }> {
  return execApi('/reminders', { method: 'POST', body: JSON.stringify(data) });
}

export async function updateReminder(id: string, data: Partial<Reminder>): Promise<{ ok: boolean; id: string }> {
  return execApi(`/reminders/${id}`, { method: 'PUT', body: JSON.stringify(data) });
}

export async function deleteReminder(id: string): Promise<{ ok: boolean; id: string }> {
  return execApi(`/reminders/${id}`, { method: 'DELETE' });
}

// --- Blockers ---

export async function listBlockers(filters?: { status?: string; project_id?: string }): Promise<{ blockers: Blocker[] }> {
  const params = new URLSearchParams();
  if (filters?.status) params.set('status', filters.status);
  if (filters?.project_id) params.set('project_id', filters.project_id);
  const qs = params.toString();
  return execApi(`/blockers${qs ? `?${qs}` : ''}`);
}

// --- Dashboard ---

export async function getDashboard(): Promise<DashboardResponse> {
  return execApi('/dashboard');
}

// --- Agent Logs ---

export async function listAgentLogs(filters?: { action?: string; limit?: number }): Promise<{ logs: AgentLog[] }> {
  const params = new URLSearchParams();
  if (filters?.action) params.set('action', filters.action);
  if (filters?.limit) params.set('limit', filters.limit.toString());
  const qs = params.toString();
  return execApi(`/agent-logs${qs ? `?${qs}` : ''}`);
}

// --- Google Integration ---

export interface GoogleAccount {
  id: string;
  email: string;
  label: string | null;
  scopes: string;
  token_valid: boolean;
  created_at: string;
}

export async function listGoogleAccounts(): Promise<{ accounts: GoogleAccount[] }> {
  return execApi('/google/accounts');
}

export async function disconnectGoogleAccount(id: string): Promise<{ ok: boolean; id: string }> {
  return execApi(`/google/accounts/${id}`, { method: 'DELETE' });
}

export function getGoogleAuthUrl(label?: string): string {
  const params = label ? `?label=${encodeURIComponent(label)}` : '';
  return `/api/google/auth${params}`;
}
