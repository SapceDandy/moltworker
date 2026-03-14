-- ============================================================
-- SALES CADENCE SYSTEM
-- ============================================================

-- Sales pipeline templates (e.g. "Cold Outbound", "Referral")
CREATE TABLE IF NOT EXISTS sales_pipelines (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  is_default INTEGER DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Ordered stages within a pipeline
CREATE TABLE IF NOT EXISTS pipeline_stages (
  id TEXT PRIMARY KEY,
  pipeline_id TEXT NOT NULL,
  stage_number INTEGER NOT NULL,
  name TEXT NOT NULL,
  stage_type TEXT NOT NULL DEFAULT 'email',
  default_owner TEXT NOT NULL DEFAULT 'human',
  delay_days INTEGER DEFAULT 0,
  framework TEXT,
  guidance TEXT,
  benchmarks TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (pipeline_id) REFERENCES sales_pipelines(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_pipeline_stages_pipeline ON pipeline_stages(pipeline_id, stage_number);

-- One cadence per lead being actively worked
CREATE TABLE IF NOT EXISTS sales_cadences (
  id TEXT PRIMARY KEY,
  lead_id TEXT NOT NULL,
  pipeline_id TEXT NOT NULL,
  current_stage_id TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  priority TEXT NOT NULL DEFAULT 'medium',
  health TEXT NOT NULL DEFAULT 'on_track',
  next_touch_due TEXT,
  loss_reason TEXT,
  owner_notes TEXT,
  lead_score INTEGER,
  started_at TEXT,
  last_touch_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE,
  FOREIGN KEY (pipeline_id) REFERENCES sales_pipelines(id),
  FOREIGN KEY (current_stage_id) REFERENCES pipeline_stages(id)
);
CREATE INDEX IF NOT EXISTS idx_sales_cadences_lead ON sales_cadences(lead_id);
CREATE INDEX IF NOT EXISTS idx_sales_cadences_status ON sales_cadences(status);
CREATE INDEX IF NOT EXISTS idx_sales_cadences_next_touch ON sales_cadences(next_touch_due);
CREATE INDEX IF NOT EXISTS idx_sales_cadences_pipeline ON sales_cadences(pipeline_id);

-- Every touch interaction (completed, scheduled, or skipped)
CREATE TABLE IF NOT EXISTS touch_log (
  id TEXT PRIMARY KEY,
  cadence_id TEXT NOT NULL,
  stage_id TEXT,
  touch_type TEXT NOT NULL DEFAULT 'email',
  owner TEXT NOT NULL DEFAULT 'human',
  status TEXT NOT NULL DEFAULT 'scheduled',
  outcome TEXT,
  outcome_notes TEXT,
  call_prep TEXT,
  email_metrics TEXT,
  action_id TEXT,
  gmail_message_id TEXT,
  gmail_thread_id TEXT,
  scheduled_at TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (cadence_id) REFERENCES sales_cadences(id) ON DELETE CASCADE,
  FOREIGN KEY (stage_id) REFERENCES pipeline_stages(id),
  FOREIGN KEY (action_id) REFERENCES draft_actions(id)
);
CREATE INDEX IF NOT EXISTS idx_touch_log_cadence ON touch_log(cadence_id);
CREATE INDEX IF NOT EXISTS idx_touch_log_status ON touch_log(status);
CREATE INDEX IF NOT EXISTS idx_touch_log_scheduled ON touch_log(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_touch_log_gmail_thread ON touch_log(gmail_thread_id);

-- Aggregate campaign KPIs per pipeline/stage (populated by cron)
CREATE TABLE IF NOT EXISTS campaign_metrics (
  id TEXT PRIMARY KEY,
  pipeline_id TEXT NOT NULL,
  stage_id TEXT,
  period TEXT NOT NULL,
  total_sent INTEGER DEFAULT 0,
  opens INTEGER DEFAULT 0,
  replies INTEGER DEFAULT 0,
  meetings INTEGER DEFAULT 0,
  bounces INTEGER DEFAULT 0,
  opt_outs INTEGER DEFAULT 0,
  open_rate REAL DEFAULT 0,
  reply_rate REAL DEFAULT 0,
  meeting_rate REAL DEFAULT 0,
  bounce_rate REAL DEFAULT 0,
  created_at TEXT NOT NULL,
  FOREIGN KEY (pipeline_id) REFERENCES sales_pipelines(id),
  FOREIGN KEY (stage_id) REFERENCES pipeline_stages(id)
);
CREATE INDEX IF NOT EXISTS idx_campaign_metrics_period ON campaign_metrics(pipeline_id, period);

-- ============================================================
-- SEED: Default Cold Outbound Pipeline (14 stages)
-- ============================================================

INSERT INTO sales_pipelines (id, name, description, is_default, created_at, updated_at)
VALUES (
  'cold-outbound-default',
  'Cold Outbound',
  '14-stage cold outbound cadence based on the validated 22-step AI-driven sales playbook. Multi-channel: email, phone, LinkedIn, meetings.',
  1,
  datetime('now'),
  datetime('now')
);

-- Stage 1: Research & Enrich
INSERT INTO pipeline_stages (id, pipeline_id, stage_number, name, stage_type, default_owner, delay_days, framework, guidance, benchmarks, created_at)
VALUES ('stage-01-research', 'cold-outbound-default', 1, 'Research & Enrich', 'research', 'ai', 0, NULL,
  'AI enriches lead data: firmographics, technographics, intent signals (funding, hiring, G2/Bombora). Score the lead. Identify key contacts and recent signals.',
  '{"notes":"Automated step — no outbound metrics"}',
  datetime('now'));

-- Stage 2: Initial Outreach
INSERT INTO pipeline_stages (id, pipeline_id, stage_number, name, stage_type, default_owner, delay_days, framework, guidance, benchmarks, created_at)
VALUES ('stage-02-initial-outreach', 'cold-outbound-default', 2, 'Initial Outreach', 'email', 'ai_draft', 1, NULL,
  'Personalized cold email. Use timeline-based hook (2.3x better than problem hooks). Interest CTA: "Are you interested in learning more?" (30% positive vs 13% for time-ask). 50-125 words. Reference a recent signal (funding, hiring, tech usage). Subject: "Hi {first_name}" or "How {company} can {achieve X}".',
  '{"target_open":30,"target_reply":10}',
  datetime('now'));

-- Stage 3: Follow-up 1
INSERT INTO pipeline_stages (id, pipeline_id, stage_number, name, stage_type, default_owner, delay_days, framework, guidance, benchmarks, created_at)
VALUES ('stage-03-followup-1', 'cold-outbound-default', 3, 'Follow-up 1', 'email', 'ai', 3, NULL,
  'New angle: share social proof, case study, or relevant stat. Different subject line. Keep under 125 words. 48% of reps never send a 2nd email — this alone captures significant additional replies.',
  '{"target_open":25,"target_reply":5}',
  datetime('now'));

-- Stage 4: Phone Call 1
INSERT INTO pipeline_stages (id, pipeline_id, stage_number, name, stage_type, default_owner, delay_days, framework, guidance, benchmarks, created_at)
VALUES ('stage-04-call-1', 'cold-outbound-default', 4, 'Phone Call 1', 'call', 'human', 2, 'spin',
  'SPIN discovery call. Ask 11-14 targeted questions. Situation: current tools, team size. Problem: limitations, pain points. Implication: business impact. Need-Payoff: value of solving. Maintain 46:54 talk:listen ratio. Uncover 3-4 distinct problems.',
  '{"target_connect":15,"target_meeting":3}',
  datetime('now'));

-- Stage 5: LinkedIn Touch
INSERT INTO pipeline_stages (id, pipeline_id, stage_number, name, stage_type, default_owner, delay_days, framework, guidance, benchmarks, created_at)
VALUES ('stage-05-linkedin', 'cold-outbound-default', 5, 'LinkedIn Touch', 'linkedin', 'ai_draft', 2, NULL,
  'Personalized LinkedIn DM. Reference something from their profile or recent post. LinkedIn DMs average ~10.3% response (2x good email rates). Keep concise. Multi-channel cadences drive 4.7x more engagement than email-only.',
  '{"target_response":10}',
  datetime('now'));

-- Stage 6: Follow-up 2
INSERT INTO pipeline_stages (id, pipeline_id, stage_number, name, stage_type, default_owner, delay_days, framework, guidance, benchmarks, created_at)
VALUES ('stage-06-followup-2', 'cold-outbound-default', 6, 'Follow-up 2', 'email', 'ai', 1, NULL,
  'Share a specific case study or ROI stat relevant to their industry/role. Switch thread if needed. Offer something helpful (e.g. market trend report) or ask a diagnostic question.',
  '{"target_open":25,"target_reply":5}',
  datetime('now'));

-- Stage 7: Phone Call 2
INSERT INTO pipeline_stages (id, pipeline_id, stage_number, name, stage_type, default_owner, delay_days, framework, guidance, benchmarks, created_at)
VALUES ('stage-07-call-2', 'cold-outbound-default', 7, 'Phone Call 2', 'call', 'human', 2, 'spin',
  'Deeper SPIN discovery. Build on any signals from email opens/clicks. Go deeper on problems uncovered. If no prior contact, treat as fresh intro with more urgency. Leave voicemail referencing email thread.',
  '{"target_connect":15,"target_meeting":3}',
  datetime('now'));

-- Stage 8: Follow-up 3
INSERT INTO pipeline_stages (id, pipeline_id, stage_number, name, stage_type, default_owner, delay_days, framework, guidance, benchmarks, created_at)
VALUES ('stage-08-followup-3', 'cold-outbound-default', 8, 'Follow-up 3', 'email', 'ai', 2, NULL,
  'Unique testimonial or competitive angle. Highlight specific ROI numbers. Keep it fresh — different angle from previous emails. If still no reply, consider adjusting value prop.',
  '{"target_open":20,"target_reply":4}',
  datetime('now'));

-- Stage 9: Breakup Email
INSERT INTO pipeline_stages (id, pipeline_id, stage_number, name, stage_type, default_owner, delay_days, framework, guidance, benchmarks, created_at)
VALUES ('stage-09-breakup', 'cold-outbound-default', 9, 'Breakup Email', 'email', 'ai', 3, NULL,
  '"Closing the loop" email. Final check-in. Often nudges late responders — adds ~2-4% lift in replies. Simple: "I haven''t heard back — should I close your file?" Interest CTA. Short and respectful.',
  '{"target_open":20,"target_reply":3}',
  datetime('now'));

-- Stage 10: Discovery Call
INSERT INTO pipeline_stages (id, pipeline_id, stage_number, name, stage_type, default_owner, delay_days, framework, guidance, benchmarks, created_at)
VALUES ('stage-10-discovery', 'cold-outbound-default', 10, 'Discovery Call', 'meeting', 'human', 0, 'spin',
  'Full SPIN discovery with engaged prospect. Triggered on reply/positive signal. Ask 11-14 quality questions. Uncover 3-4 problems. Map to MEDDIC criteria: Metrics, Economic Buyer, Decision Criteria, Decision Process, Identify Pain, Champion. Goal: qualify for proposal.',
  '{"target_conversion":50}',
  datetime('now'));

-- Stage 11: Qualification
INSERT INTO pipeline_stages (id, pipeline_id, stage_number, name, stage_type, default_owner, delay_days, framework, guidance, benchmarks, created_at)
VALUES ('stage-11-qualification', 'cold-outbound-default', 11, 'Qualification', 'meeting', 'human', 0, 'meddic',
  'MEDDIC/MEDDPICC qualification. Validate: Metrics (what they measure), Economic Buyer (who signs), Decision Criteria (how they choose), Decision Process (timeline/steps), Identify Pain (confirmed), Champion (internal advocate), Paper Process (procurement), Competition (alternatives). 82% of high-growth SaaS use MEDDIC — 42% higher win rates.',
  '{"target_conversion":60}',
  datetime('now'));

-- Stage 12: Proposal / Demo
INSERT INTO pipeline_stages (id, pipeline_id, stage_number, name, stage_type, default_owner, delay_days, framework, guidance, benchmarks, created_at)
VALUES ('stage-12-proposal', 'cold-outbound-default', 12, 'Proposal / Demo', 'meeting', 'human', 0, 'challenger',
  'Challenger approach: Teach-Tailor-Take Control. Offer unique insights tailored to each stakeholder. Present ROI case. Demo focused on their specific pain points from discovery. Multi-thread: engage champion + economic buyer. Challenger reps close ~26% more deals.',
  '{"target_conversion":40}',
  datetime('now'));

-- Stage 13: Negotiation
INSERT INTO pipeline_stages (id, pipeline_id, stage_number, name, stage_type, default_owner, delay_days, framework, guidance, benchmarks, created_at)
VALUES ('stage-13-negotiation', 'cold-outbound-default', 13, 'Negotiation', 'meeting', 'human', 0, 'challenger',
  'Challenger multi-threading. Engage all stakeholders identified in MEDDIC. Address objections per persona. Tailor messages to each exec''s concerns (strongest predictor of complex sale success per Gartner). Use specific CTAs for scheduling (doubles booking success in late-stage). Paper process: align with procurement timeline.',
  '{"target_conversion":70}',
  datetime('now'));

-- Stage 14: Closed
INSERT INTO pipeline_stages (id, pipeline_id, stage_number, name, stage_type, default_owner, delay_days, framework, guidance, benchmarks, created_at)
VALUES ('stage-14-closed', 'cold-outbound-default', 14, 'Closed', 'milestone', 'human', 0, NULL,
  'Deal closed (won or lost). Log outcome, loss reason if applicable. Update lead status. If won: transition to customer onboarding. If lost: consider re-engage pipeline in 60-90 days.',
  NULL,
  datetime('now'));
