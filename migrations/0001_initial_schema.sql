-- EUDELLA / ALSOS — initial schema (D1 / SQLite)
-- Every user-owned row carries tenant_id + user_id. tenant_id is ALWAYS derived server-side
-- from the authenticated session, never from the client. Timestamps are ISO-8601 UTC text.

-- Tenants: B2C users each get a personal tenant. B2B organisations (future) get their own tenant.
CREATE TABLE tenants (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('personal', 'organization')),
  name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  password_hash TEXT NOT NULL,          -- PBKDF2-SHA256, format pbkdf2$<iter>$<salt_b64>$<hash_b64>
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'closed')),
  onboarding_completed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX ux_users_email ON users(email);
CREATE INDEX ix_users_tenant ON users(tenant_id);

CREATE TABLE profiles (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  locale TEXT NOT NULL DEFAULT 'en' CHECK (locale IN ('en', 'id')),
  region TEXT,
  pronouns TEXT,
  bio TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Sessions store only a SHA-256 hash of the opaque token; the raw token lives in an HttpOnly cookie.
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  csrf_token TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  user_agent TEXT
);
CREATE UNIQUE INDEX ux_sessions_token ON sessions(token_hash);
CREATE INDEX ix_sessions_user ON sessions(user_id);
CREATE INDEX ix_sessions_expires ON sessions(expires_at);

-- Personal context: user-visible, user-editable memory. Nothing is inferred silently.
CREATE TABLE personal_context (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN ('situation', 'household', 'work', 'education', 'health_general', 'finance_general', 'location', 'other')),
  label TEXT NOT NULL,
  value TEXT NOT NULL,
  sensitivity TEXT NOT NULL DEFAULT 'normal' CHECK (sensitivity IN ('normal', 'sensitive')),
  source TEXT NOT NULL DEFAULT 'user' CHECK (source IN ('user', 'onboarding')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX ix_context_owner ON personal_context(tenant_id, user_id);

CREATE TABLE user_preferences (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  ai_assistance_enabled INTEGER NOT NULL DEFAULT 0,     -- AI is OFF by default
  memory_enabled INTEGER NOT NULL DEFAULT 1,            -- user may disable context use by agents
  reduced_motion INTEGER NOT NULL DEFAULT 0,
  theme TEXT NOT NULL DEFAULT 'light' CHECK (theme IN ('light', 'dark', 'system')),
  updated_at TEXT NOT NULL
);

CREATE TABLE needs (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  area TEXT NOT NULL CHECK (area IN ('work', 'learning', 'money', 'housing', 'health', 'wellbeing', 'family', 'community', 'business', 'other')),
  urgency TEXT NOT NULL DEFAULT 'normal' CHECK (urgency IN ('low', 'normal', 'high')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'archived')),
  priority INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX ix_needs_owner ON needs(tenant_id, user_id, status);

CREATE TABLE goals (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  need_id TEXT REFERENCES needs(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  success_definition TEXT,             -- the user's own definition of success
  target_date TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'achieved', 'archived')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX ix_goals_owner ON goals(tenant_id, user_id, status);

CREATE TABLE plans (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  goal_id TEXT REFERENCES goals(id) ON DELETE SET NULL,
  need_id TEXT REFERENCES needs(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  summary TEXT,
  origin TEXT NOT NULL DEFAULT 'user' CHECK (origin IN ('user', 'planning_agent')),
  agent_run_id TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('draft', 'active', 'completed', 'archived')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX ix_plans_owner ON plans(tenant_id, user_id, status);

CREATE TABLE plan_tasks (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_id TEXT REFERENCES plans(id) ON DELETE CASCADE,  -- NULL = standalone task
  title TEXT NOT NULL,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'doing', 'done', 'skipped')),
  position INTEGER NOT NULL DEFAULT 0,
  due_date TEXT,
  resource_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT
);
CREATE INDEX ix_tasks_owner ON plan_tasks(tenant_id, user_id, status);
CREATE INDEX ix_tasks_plan ON plan_tasks(plan_id, position);

-- Catalog (global, read-only to users). Every row carries provenance and a verification state.
CREATE TABLE resources (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  area TEXT NOT NULL,
  provider_name TEXT NOT NULL,
  eligibility TEXT,                  -- NULL = unknown; never invented
  cost_text TEXT,                    -- NULL = not verified
  cost_verified INTEGER NOT NULL DEFAULT 0,
  location_text TEXT,
  region TEXT,
  is_online INTEGER NOT NULL DEFAULT 0,
  accessibility_text TEXT,
  url TEXT,
  source_name TEXT NOT NULL,
  source_url TEXT,
  verification_status TEXT NOT NULL CHECK (verification_status IN ('verified', 'unverified', 'example')),
  verified_at TEXT,
  tags TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX ix_resources_area ON resources(area, category);

CREATE TABLE opportunities (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  description TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('education', 'work', 'business', 'program', 'community')),
  organization TEXT NOT NULL,
  eligibility TEXT,
  cost_text TEXT,
  cost_verified INTEGER NOT NULL DEFAULT 0,
  deadline TEXT,
  location_text TEXT,
  is_online INTEGER NOT NULL DEFAULT 0,
  limitations TEXT,
  url TEXT,
  source_name TEXT NOT NULL,
  source_url TEXT,
  verification_status TEXT NOT NULL CHECK (verification_status IN ('verified', 'unverified', 'example')),
  verified_at TEXT,
  tags TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX ix_opps_kind ON opportunities(kind);

CREATE TABLE saved_items (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_type TEXT NOT NULL CHECK (item_type IN ('resource', 'opportunity')),
  item_id TEXT NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX ux_saved ON saved_items(user_id, item_type, item_id);

-- ALSOS execution log
CREATE TABLE agent_runs (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  agent TEXT NOT NULL,
  intent TEXT NOT NULL,
  permission_level TEXT NOT NULL CHECK (permission_level IN ('L0', 'L1', 'L2', 'L3', 'L4')),
  status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'blocked', 'failed', 'awaiting_approval')),
  input_redacted TEXT NOT NULL,
  output_json TEXT,
  policy_decision TEXT,
  adapter TEXT,
  error TEXT,
  started_at TEXT NOT NULL,
  finished_at TEXT
);
CREATE INDEX ix_runs_owner ON agent_runs(tenant_id, user_id, started_at);

CREATE TABLE agent_events (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  seq INTEGER NOT NULL,
  type TEXT NOT NULL,                 -- policy_check, safety_flag, adapter_call, adapter_error, retry, output
  detail TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX ux_events_seq ON agent_events(run_id, seq);

-- Approvals: specific, informed, revocable, recorded. An L3 action never executes without one.
CREATE TABLE approvals (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL,
  title TEXT NOT NULL,
  destination TEXT NOT NULL,
  data_shared TEXT NOT NULL,
  cost_text TEXT NOT NULL,
  reversible INTEGER NOT NULL DEFAULT 0,
  payload_json TEXT NOT NULL,
  payload_hash TEXT NOT NULL,          -- approval binds to exactly this payload
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled', 'executed', 'failed', 'expired')),
  requested_by TEXT NOT NULL,          -- agent or 'user'
  agent_run_id TEXT,
  decided_at TEXT,
  executed_at TEXT,
  result_json TEXT,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX ix_approvals_owner ON approvals(tenant_id, user_id, status);

-- Consent records: append-only history. Current state = latest row per (user, scope).
CREATE TABLE consent_records (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  scope TEXT NOT NULL,
  granted INTEGER NOT NULL,
  purpose TEXT NOT NULL,
  policy_version TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX ix_consent_owner ON consent_records(user_id, scope, created_at);

-- Integrations: per-user enablement of a provider adapter. No secrets stored here.
CREATE TABLE integrations (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('enabled', 'revoked')),
  scopes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX ux_integrations ON integrations(user_id, provider_id);

CREATE TABLE activity_logs (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  actor TEXT NOT NULL,                 -- 'user' | agent name | 'system'
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  detail TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX ix_activity_owner ON activity_logs(tenant_id, user_id, created_at);

CREATE TABLE notifications (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  link TEXT,
  read_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX ix_notifications_owner ON notifications(user_id, read_at, created_at);

CREATE TABLE notification_preferences (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  in_app INTEGER NOT NULL DEFAULT 1,
  email INTEGER NOT NULL DEFAULT 0,    -- off: no email provider is active
  approvals INTEGER NOT NULL DEFAULT 1,
  task_reminders INTEGER NOT NULL DEFAULT 1,
  product_updates INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);

CREATE TABLE data_export_requests (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('completed', 'failed')),
  byte_size INTEGER,
  created_at TEXT NOT NULL,
  completed_at TEXT
);
CREATE INDEX ix_exports_owner ON data_export_requests(user_id, created_at);

-- Deletion requests outlive the user row on purpose (no FK) so the erasure itself is auditable.
-- Only a salted hash of the user id is retained; no personal data.
CREATE TABLE account_deletion_requests (
  id TEXT PRIMARY KEY,
  subject_hash TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('completed', 'failed')),
  reason TEXT,
  requested_at TEXT NOT NULL,
  completed_at TEXT
);

-- Fixed-window rate limiting (D1-backed; no paid KV / Durable Objects).
CREATE TABLE rate_limits (
  key TEXT NOT NULL,
  window_start INTEGER NOT NULL,
  count INTEGER NOT NULL,
  PRIMARY KEY (key, window_start)
);

-- Idempotency for sensitive operations.
CREATE TABLE idempotency_keys (
  key TEXT NOT NULL,
  user_id TEXT NOT NULL,
  route TEXT NOT NULL,
  response_json TEXT NOT NULL,
  status_code INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, route, key)
);
