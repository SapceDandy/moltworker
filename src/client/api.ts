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

export async function listDevices(timeoutMs = 120_000): Promise<DeviceListResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await apiRequest<DeviceListResponse>('/devices', { signal: controller.signal });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error('Request timed out — gateway may still be starting. Try again in a moment.');
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
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
  blocked_tasks: number;
}

export interface DashboardResponse {
  date: string;
  summary: DashboardSummary;
  projects: Project[];
  overdue_tasks: Task[];
  today_tasks: Task[];
  in_progress_tasks: Task[];
  open_blockers: Blocker[];
  blocked_tasks: Task[];
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

// --- Sales Cadence ---

export interface SalesPipeline {
  id: string;
  name: string;
  description: string | null;
  is_default: number;
  created_at: string;
  updated_at: string;
}

export interface PipelineStage {
  id: string;
  pipeline_id: string;
  stage_number: number;
  name: string;
  stage_type: string;
  default_owner: string;
  delay_days: number;
  framework: string | null;
  guidance: string | null;
  benchmarks: string | null;
  created_at: string;
}

export interface SalesCadence {
  id: string;
  lead_id: string;
  pipeline_id: string;
  current_stage_id: string | null;
  status: string;
  priority: string;
  health: string;
  next_touch_due: string | null;
  loss_reason: string | null;
  owner_notes: string | null;
  lead_score: number | null;
  started_at: string | null;
  last_touch_at: string | null;
  created_at: string;
  updated_at: string;
  // Joined fields
  business_name?: string;
  domain?: string;
  lead_email?: string;
  lead_phone?: string;
  lead_match_score?: number;
  lead_status?: string;
  current_stage_name?: string;
  current_stage_number?: number;
  current_stage_type?: string;
  pipeline_name?: string;
}

export interface TouchLog {
  id: string;
  cadence_id: string;
  stage_id: string | null;
  touch_type: string;
  owner: string;
  status: string;
  outcome: string | null;
  outcome_notes: string | null;
  call_prep: string | null;
  email_metrics: string | null;
  action_id: string | null;
  gmail_message_id: string | null;
  gmail_thread_id: string | null;
  scheduled_at: string | null;
  completed_at: string | null;
  created_at: string;
  // Joined fields
  stage_name?: string;
  stage_number?: number;
  stage_type?: string;
  framework?: string;
  business_name?: string;
  domain?: string;
}

export interface CadenceDashboard {
  date: string;
  due_touches: TouchLog[];
  funnel: Array<{ stage_id: string; stage_name: string; stage_number: number; stage_type: string; cadence_count: number }>;
  stalled: SalesCadence[];
  summary: { active: number; won: number; lost: number; paused: number };
  recent_outcomes: Array<{ outcome: string; count: number }>;
}

// Pipelines
export async function listPipelines(): Promise<{ pipelines: SalesPipeline[] }> {
  return execApi('/cadence/pipelines');
}

export async function getPipeline(id: string): Promise<{ pipeline: SalesPipeline; stages: PipelineStage[] }> {
  return execApi(`/cadence/pipelines/${id}`);
}

export async function createPipeline(data: Partial<SalesPipeline>): Promise<{ ok: boolean; id: string }> {
  return execApi('/cadence/pipelines', { method: 'POST', body: JSON.stringify(data) });
}

export async function updatePipeline(id: string, data: Partial<SalesPipeline>): Promise<{ ok: boolean; id: string }> {
  return execApi(`/cadence/pipelines/${id}`, { method: 'PUT', body: JSON.stringify(data) });
}

export async function deletePipeline(id: string): Promise<{ ok: boolean; id: string }> {
  return execApi(`/cadence/pipelines/${id}`, { method: 'DELETE' });
}

// Stages
export async function listStages(pipelineId: string): Promise<{ stages: PipelineStage[] }> {
  return execApi(`/cadence/pipelines/${pipelineId}/stages`);
}

export async function createStage(pipelineId: string, data: Partial<PipelineStage>): Promise<{ ok: boolean; id: string }> {
  return execApi(`/cadence/pipelines/${pipelineId}/stages`, { method: 'POST', body: JSON.stringify(data) });
}

export async function updateStage(id: string, data: Partial<PipelineStage>): Promise<{ ok: boolean; id: string }> {
  return execApi(`/cadence/stages/${id}`, { method: 'PUT', body: JSON.stringify(data) });
}

export async function deleteStage(id: string): Promise<{ ok: boolean; id: string }> {
  return execApi(`/cadence/stages/${id}`, { method: 'DELETE' });
}

// Cadences
export async function listCadences(filters?: {
  lead_id?: string; status?: string; pipeline_id?: string; health?: string; next_touch_before?: string;
}): Promise<{ cadences: SalesCadence[] }> {
  const params = new URLSearchParams();
  if (filters?.lead_id) params.set('lead_id', filters.lead_id);
  if (filters?.status) params.set('status', filters.status);
  if (filters?.pipeline_id) params.set('pipeline_id', filters.pipeline_id);
  if (filters?.health) params.set('health', filters.health);
  if (filters?.next_touch_before) params.set('next_touch_before', filters.next_touch_before);
  const qs = params.toString();
  return execApi(`/cadence/cadences${qs ? `?${qs}` : ''}`);
}

export async function getCadence(id: string): Promise<{ cadence: SalesCadence; touches: TouchLog[]; stages: PipelineStage[] }> {
  return execApi(`/cadence/cadences/${id}`);
}

export async function createCadence(data: { lead_id: string; pipeline_id?: string; priority?: string; owner_notes?: string }): Promise<{ ok: boolean; id: string }> {
  return execApi('/cadence/cadences', { method: 'POST', body: JSON.stringify(data) });
}

export async function updateCadence(id: string, data: Partial<SalesCadence>): Promise<{ ok: boolean; id: string }> {
  return execApi(`/cadence/cadences/${id}`, { method: 'PUT', body: JSON.stringify(data) });
}

export async function deleteCadence(id: string): Promise<{ ok: boolean; id: string }> {
  return execApi(`/cadence/cadences/${id}`, { method: 'DELETE' });
}

export async function advanceCadence(id: string): Promise<{ ok: boolean; id: string; current_stage?: { id: string; name: string; stage_number: number }; next_touch_due?: string; status?: string }> {
  return execApi(`/cadence/cadences/${id}/advance`, { method: 'POST' });
}

// Touches
export async function listTouches(cadenceId: string): Promise<{ touches: TouchLog[] }> {
  return execApi(`/cadence/cadences/${cadenceId}/touches`);
}

export async function createTouch(cadenceId: string, data: Partial<TouchLog>): Promise<{ ok: boolean; id: string }> {
  return execApi(`/cadence/cadences/${cadenceId}/touches`, { method: 'POST', body: JSON.stringify(data) });
}

export async function updateTouch(id: string, data: Partial<TouchLog>): Promise<{ ok: boolean; id: string }> {
  return execApi(`/cadence/touches/${id}`, { method: 'PUT', body: JSON.stringify(data) });
}

// AI Call Prep
export async function generateCallPrep(cadenceId: string, touchId?: string): Promise<{ ok: boolean; call_prep: Record<string, unknown> }> {
  return execApi(`/cadence/cadences/${cadenceId}/call-prep`, {
    method: 'POST',
    body: JSON.stringify(touchId ? { touch_id: touchId } : {}),
  });
}

// Dashboard
export async function getCadenceDashboard(): Promise<CadenceDashboard> {
  return execApi('/cadence/dashboard');
}

// --- Browser Cookies ---

export interface BrowserCookieEntry {
  id: string;
  domain: string;
  label: string | null;
  cookies_size: number;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

// --- Company Research ---

export const RESEARCH_CATEGORIES = [
  { value: 'company_overview', label: 'Company Overview', icon: '🏢' },
  { value: 'online_presence', label: 'Online Presence', icon: '🌐' },
  { value: 'key_people', label: 'Key People', icon: '👤' },
  { value: 'pain_points', label: 'Pain Points & Needs', icon: '🎯' },
  { value: 'competition', label: 'Competition', icon: '⚔️' },
  { value: 'recent_activity', label: 'Recent Activity', icon: '📰' },
  { value: 'contact_intel', label: 'Contact Intel', icon: '📞' },
  { value: 'custom', label: 'Custom', icon: '📝' },
] as const;

export interface ResearchEntry {
  id: string;
  lead_id: string;
  category: string;
  title: string;
  content: string;
  source_url: string | null;
  source_label: string | null;
  confidence: string;
  gathered_by: string;
  created_at: string;
  updated_at: string;
}

export interface ResearchSummary {
  category: string;
  count: number;
  latest: string;
}

export async function listResearch(leadId: string, category?: string): Promise<{ research: ResearchEntry[] }> {
  const params = new URLSearchParams({ lead_id: leadId });
  if (category) params.set('category', category);
  return execApi(`/research?${params}`);
}

export async function getResearchSummary(leadId: string): Promise<{ summary: ResearchSummary[]; total: number }> {
  return execApi(`/research/summary/${leadId}`);
}

export async function createResearch(data: Partial<ResearchEntry> & { lead_id: string; category: string; title: string; content: string }): Promise<{ ok: boolean; ids: string[] }> {
  return execApi('/research', { method: 'POST', body: JSON.stringify(data) });
}

export async function updateResearch(id: string, data: Partial<ResearchEntry>): Promise<{ ok: boolean; id: string }> {
  return execApi(`/research/${id}`, { method: 'PUT', body: JSON.stringify(data) });
}

export async function deleteResearch(id: string): Promise<{ ok: boolean; id: string }> {
  return execApi(`/research/${id}`, { method: 'DELETE' });
}

// --- Browser Cookies ---

export async function listBrowserCookies(): Promise<{ cookies: BrowserCookieEntry[] }> {
  return execApi('/browser/cookies');
}

export async function storeBrowserCookies(data: { domain: string; cookies: unknown[]; label?: string }): Promise<{ id: string; domain: string; cookie_count: number }> {
  return execApi('/browser/cookies', { method: 'POST', body: JSON.stringify(data) });
}

export async function deleteBrowserCookies(domain: string): Promise<{ ok: boolean }> {
  return execApi(`/browser/cookies/${encodeURIComponent(domain)}`, { method: 'DELETE' });
}
