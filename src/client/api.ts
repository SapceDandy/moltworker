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

export class ApiError extends Error {
  code: string;
  details: Record<string, unknown>;
  constructor(message: string, code: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.details = details;
  }
}

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
    const errData = data.error as Record<string, unknown> | string | undefined;
    if (typeof errData === 'object' && errData !== null) {
      throw new ApiError(
        (errData.message as string) || `API error: ${response.status}`,
        (errData.code as string) || 'UNKNOWN',
        errData,
      );
    }
    const errMsg = typeof errData === 'string' ? errData : `API error: ${response.status}`;
    throw new ApiError(errMsg, 'UNKNOWN');
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

export interface TaskComment {
  id: string;
  task_id: string;
  author: string;
  author_name: string | null;
  content: string;
  comment_type: string;
  metadata: string | null;
  created_at: string;
  resolved_at: string | null;
}

export interface Lead {
  id: string;
  domain: string;
  business_name: string;
  website: string;
  phone: string;
  email: string;
  city: string;
  state: string;
  category: string;
  owner_or_people: string;
  linkedin_company: string;
  linkedin_people: string;
  contact_page_url: string;
  source_urls: string;
  evidence_snippet: string;
  match_score: number | null;
  notes: string;
  lead_status: string;
  created_at: string;
  updated_at: string;
}

export interface DraftAction {
  id: string;
  task_id: string | null;
  lead_id: string | null;
  action_type: string;
  title: string;
  content: string;
  status: string;
  created_by: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
  result: string | null;
  created_at: string;
  updated_at: string;
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

export async function getTask(id: string): Promise<{ task: Task; blockers: Blocker[] }> {
  return execApi(`/tasks/${id}`);
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

// --- Task Comments ---

export async function listComments(taskId: string): Promise<{ comments: TaskComment[] }> {
  return execApi(`/comments/${taskId}`);
}

export async function createComment(taskId: string, data: { content: string; author?: string; author_name?: string; comment_type?: string }): Promise<{ ok: boolean; id: string }> {
  return execApi(`/comments/${taskId}`, { method: 'POST', body: JSON.stringify(data) });
}

export async function deleteComment(taskId: string, commentId: string): Promise<{ ok: boolean; id: string }> {
  return execApi(`/comments/${taskId}/${commentId}`, { method: 'DELETE' });
}

export async function resolveComment(taskId: string, commentId: string): Promise<{ ok: boolean; id: string; resolved_at?: string }> {
  return execApi(`/comments/${taskId}/${commentId}/resolve`, { method: 'PUT' });
}

// --- Leads ---

export async function listLeads(filters?: {
  category?: string; city?: string; state?: string; status?: string;
  min_score?: number; q?: string; limit?: number; offset?: number;
}): Promise<{ leads: Lead[]; total: number; limit: number; offset: number }> {
  const params = new URLSearchParams();
  if (filters?.category) params.set('category', filters.category);
  if (filters?.city) params.set('city', filters.city);
  if (filters?.state) params.set('state', filters.state);
  if (filters?.status) params.set('status', filters.status);
  if (filters?.min_score != null) params.set('min_score', filters.min_score.toString());
  if (filters?.q) params.set('q', filters.q);
  if (filters?.limit) params.set('limit', filters.limit.toString());
  if (filters?.offset) params.set('offset', filters.offset.toString());
  const qs = params.toString();
  return execApi(`/leads${qs ? `?${qs}` : ''}`);
}

export async function getLead(id: string): Promise<{ lead: Lead }> {
  return execApi(`/leads/${id}`);
}

export async function createLead(data: Partial<Lead> & { domain?: string }): Promise<{ ok: boolean; domain: string }> {
  return execApi('/leads', { method: 'POST', body: JSON.stringify(data) });
}

export async function updateLead(id: string, data: Partial<Lead>): Promise<{ ok: boolean; id: string }> {
  return execApi(`/leads/${id}`, { method: 'PUT', body: JSON.stringify(data) });
}

export async function deleteLead(id: string): Promise<{ ok: boolean; id: string }> {
  return execApi(`/leads/${id}`, { method: 'DELETE' });
}

export async function importLeadsCsv(file: File): Promise<{ ok: boolean; imported: number; skipped: number; errors: string[] }> {
  const formData = new FormData();
  formData.append('file', file);
  const response = await fetch('/api/leads/import', {
    method: 'POST',
    credentials: 'include',
    body: formData,
  });
  if (response.status === 401) throw new AuthError('Unauthorized');
  const data = await response.json() as any;
  if (!response.ok) throw new Error(data.error?.message || `Import failed: ${response.status}`);
  return data;
}

// --- Draft Actions ---

export async function listActions(filters?: {
  status?: string; task_id?: string; lead_id?: string; action_type?: string;
}): Promise<{ actions: DraftAction[]; pending_count: number }> {
  const params = new URLSearchParams();
  if (filters?.status) params.set('status', filters.status);
  if (filters?.task_id) params.set('task_id', filters.task_id);
  if (filters?.lead_id) params.set('lead_id', filters.lead_id);
  if (filters?.action_type) params.set('action_type', filters.action_type);
  const qs = params.toString();
  return execApi(`/actions${qs ? `?${qs}` : ''}`);
}

export async function getAction(id: string): Promise<{ action: DraftAction }> {
  return execApi(`/actions/${id}`);
}

export async function approveAction(id: string): Promise<{ ok: boolean; id: string; status: string }> {
  return execApi(`/actions/${id}/approve`, { method: 'PUT' });
}

export async function rejectAction(id: string, reason?: string): Promise<{ ok: boolean; id: string; status: string }> {
  return execApi(`/actions/${id}/reject`, {
    method: 'PUT',
    body: JSON.stringify({ reason: reason || '' }),
  });
}

export async function sendAction(id: string): Promise<{ ok: boolean; id: string; status: string }> {
  return execApi(`/actions/${id}/send`, { method: 'PUT' });
}
