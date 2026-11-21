# Agentic Life Support System OS (ALSOS) — Architecture Concept

**Status:** Proposed architecture; not implemented.

## 1. Role of ALSOS

ALSOS is the technology and orchestration concept behind EUDELLA. It coordinates user requests, specialized support agents, information sources, integrations, permissions, approvals, and task state.

ALSOS is not the public commercial brand. EUDELLA is the product brand.

## 2. Architectural principles

- Provider-agnostic model and tool adapters.
- Human approval for consequential external actions.
- Least privilege and purpose-bound permissions.
- Tenant isolation from the first schema.
- No sensitive data in logs by default.
- Clear provenance for retrieved information.
- Deterministic policy checks around probabilistic agents.
- AI features can be disabled or replaced.
- User-visible records for important actions.

## 3. Logical layers

1. **Experience layer:** Web/PWA interface, accessibility, localization.
2. **Identity layer:** Authentication, sessions, tenant membership.
3. **Consent and policy layer:** Purpose, scope, expiry, revocation, risk level.
4. **Orchestration layer:** Routes requests to suitable agents and tools.
5. **Agent layer:** Specialized bounded agents.
6. **Knowledge/resource layer:** Curated resources, search results, provenance, freshness.
7. **Integration layer:** External apps and APIs with scoped credentials.
8. **Action layer:** Draft, preview, approval, execution, receipt.
9. **Data layer:** Tenant-scoped storage, retention, export, deletion.
10. **Observability layer:** Minimal logs, redaction, audit events.

## 4. Initial agent roles

- **Life Navigator:** Clarifies a user's stated goal and routes to relevant support.
- **Support Discovery Agent:** Finds and evaluates resources, services, and opportunities.
- **Planning Agent:** Converts user-selected goals into editable steps.
- **Opportunity Agent:** Helps explore education, career, and community opportunities.
- **Wellbeing Guide:** Offers non-clinical information and routes to qualified resources when appropriate.
- **Safety Guardian:** Applies policy checks, identifies high-risk requests, and recommends safe escalation.

Agents are bounded capabilities, not independent authorities. They must not infer or assign a life goal to a user.

## 5. Action permission levels

| Level | Capability | Rule |
|---|---|---|
| L0 | Explain and retrieve information | Cite sources and uncertainty |
| L1 | Draft plans and suggestions | User can edit or discard |
| L2 | Save changes in the user's workspace | Require the relevant permission |
| L3 | External action or third-party contact | Explicit, action-specific approval immediately before execution |
| L4 | Financial, legal, medical, or other high-impact decision | Disabled for autonomous execution; require qualified human involvement |

Approval must include the action, destination, data to be shared, consequences, and ability to cancel before execution.

## 6. Suggested MVP stack (subject to current service limits)

- Frontend: React + Vite + TypeScript PWA.
- API: Cloudflare Workers + Hono.
- Database: Cloudflare D1.
- Private object storage: Cloudflare R2 only if required and after cost review.
- Repository: GitHub.
- Authentication: a supported authentication provider or Cloudflare Access, selected after threat-model review.
- AI: optional provider adapters; disabled by default until budget, terms, data handling, and reliability are reviewed.

No paid resource, subscription, or billing activation without explicit user approval. Confirm current free-tier limits before implementation.

## 7. Core data entities (conceptual)

- users
- instances / tenants
- memberships
- sessions
- profiles
- consents
- permission_grants
- privacy_requests
- life_areas
- support_requests
- support_plans
- support_actions
- resources
- opportunities
- agents
- agent_runs
- tasks
- approvals
- integrations
- usage_records
- audit_events

Every personal record must be tenant-scoped. Derive tenant identity from the authenticated session, never from an untrusted client-supplied tenant ID.

## 8. Security and reliability requirements

- Authorization checks on every API endpoint.
- Separate preview and production data stores and secrets.
- No production personal data in preview.
- Secrets server-side only.
- Rate limiting and abuse controls.
- Input validation and output encoding.
- CSRF/CORS policy appropriate to the auth design.
- Encryption in transit and at rest using platform-supported controls.
- Data minimization, retention schedule, and deletion workflow.
- Backups and tested restore procedure.
- Audit logs that avoid storing raw sensitive content.
- Dependency and security scanning.
- Incident response and breach-notification process.

## 9. Deployment boundaries

Prototype: synthetic data, isolated database, AI off, no personal onboarding.

Pilot production: private access, approved data-processing terms, tested permissions, user export/deletion, monitoring, and incident response.

Public production: only after legal, privacy, accessibility, security, support, and operational readiness gates pass.

## 10. Build sequence

P0 requirements and threat model  
P1 identity, tenant isolation, and permission foundation  
P2 privacy center and audit events  
P3 support intake and resource discovery  
P4 planning and user task workspace  
P5 bounded agent orchestration  
P6 integration approval and execution  
P7 private pilot and independent review  
P8 controlled public release
