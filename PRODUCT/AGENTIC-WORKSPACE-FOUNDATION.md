# EUDELLA + ALSOS — Agentic Workspace Foundation

**Version:** 1.0  
**Date:** 22 November 2026  
**Status:** Foundational architecture decision — proposed and documented; not implemented  
**Reference pattern:** Genspark GenTeam (public product and Help Center documentation reviewed 22 November 2026)

## 1. Decision

EUDELLA will be designed as a **human-centered Agentic Workspace**, not as a single chatbot with a collection of disconnected tools.

The collaborative operating pattern of Genspark GenTeam is the reference: persistent specialist agents, shared project conversations, explicit tasks, delegation and handoffs, parallel work, shared files, and permission controls.

EUDELLA adopts these patterns as architectural inspiration. It does not copy GenTeam's product, interface, branding, internal implementation, or provider dependencies.

- **EUDELLA** is the human-facing product, experience, and relationship with the person.
- **ALSOS (Agentic Life Support System OS)** is the underlying agentic operating system: identity, context, orchestration, memory, tools, policy, permissions, task state, approvals, and audit.
- **Agentic Workspace** is the working environment in which the person and authorized agents collaborate around the person's chosen needs and goals.

The person remains the owner of their goals, choices, personal context, and consequential decisions.

## 2. Product definition

EUDELLA helps a person express a need in their own words, understand options, discover useful support and opportunities, plan next steps, and carry out only those actions the person has authorized.

The workspace should make the work visible and understandable:
- what the person asked for;
- which agents are involved and why;
- what each agent is responsible for;
- what information and sources were used;
- what work is in progress, blocked, or awaiting review;
- what will be shared or changed;
- what requires the person's approval;
- what was completed, failed, or left unresolved.

The workspace supports human agency. It must not become a system that monitors, manages, scores, or prescribes a person's life.

## 3. Core workspace model

### 3.1 Human + Coordinator + Specialists

A request enters through EUDELLA. An **ALSOS Coordinator** interprets the user's stated intent, identifies the smallest useful workflow, and assigns bounded work to specialist agents when collaboration materially improves the result.

The coordinator:
- keeps the user's goal and constraints in view;
- decides whether to answer directly, use one agent, or orchestrate multiple agents;
- creates and assigns tasks with clear outputs;
- tracks dependencies and handoffs;
- resolves conflicting findings or returns them to the user;
- consolidates results into one understandable response;
- never grants itself or another agent new permissions.

The coordinator is accountable for orchestration quality, not for overriding the person's decisions.

### 3.2 Initial logical agent roles

These are logical capabilities, not a requirement to deploy a separate model or process for every role.

| Agent | Responsibility | Default access |
|---|---|---|
| Life Navigator | Clarifies the stated need and identifies a useful path through EUDELLA | Current request and explicitly shared context |
| Research & Discovery | Finds information, services, resources, and opportunities; records sources and uncertainty | Read-only public or authorized sources |
| Planning Partner | Converts a user-selected goal into editable steps and milestones | Approved task context |
| Opportunity Scout | Explores learning, work, community, and other opportunities the user asks to consider | Read-only public or authorized sources |
| Wellbeing Guide | Explains general, non-clinical support resources and appropriate routes to qualified help | Minimum necessary, user-approved context |
| Action Coordinator | Prepares changes and executes only specifically approved actions | Narrow, action-specific grants |
| Safety & Policy Guardian | Checks risk, permissions, sensitive data boundaries, and policy compliance | Minimum necessary policy context; no general access to private history |

Start with the smallest effective team. A single agent or deterministic workflow is preferred when it can complete the task reliably. Multi-agent collaboration is used when tasks are genuinely separable, require distinct expertise, or benefit from independent review.

### 3.3 Shared workspace surfaces

The initial workspace concept contains:

1. **Conversation** — the human-readable shared discussion and decisions.
2. **Tasks** — work items with status, owner, input context, expected output, dependencies, and review state.
3. **Agent directory** — each agent's identity, role, instructions, skills, access, owner, and status.
4. **Files & artifacts** — user-provided and agent-produced files with provenance and access scope.
5. **Memory & decisions** — approved durable context, preferences, decisions, and open questions, with source and visibility.
6. **Approvals** — a queue of proposed actions with exact scope, consequences, and approve/deny controls.
7. **Activity & audit** — understandable records of assignments, handoffs, tool use, approvals, and outcomes.

A conversation is not automatically a permission grant. A file being present in a workspace does not mean every agent may read it.

## 4. Task, delegation, and handoff contract

Every meaningful task should have:
- a stable task ID;
- a user-aligned objective;
- one accountable assignee at a time;
- a concise brief and only the context required;
- expected deliverable and acceptance conditions;
- status: Draft, Ready, In Progress, Blocked, In Review, Done, Cancelled, or Not Planned;
- dependencies and handoff history;
- source/provenance references where applicable;
- permission scope and any approval requirement;
- timestamps and responsible agent identity.

Parallelize independent research or analysis. Use explicit dependencies for sequential work. A handoff must carry a short, structured brief: objective, findings, evidence, uncertainties, completed work, remaining work, and next expected output.

Agents must not create endless self-referential review loops. The coordinator defines a stopping condition and a final reviewer. Conflicting agent outputs are surfaced with evidence and uncertainty; they are not silently averaged into a false consensus.

## 5. Memory and context boundaries

ALSOS distinguishes four kinds of context:

- **Request context:** information needed for the current request; expires with the task unless the person chooses otherwise.
- **Workspace context:** messages, files, tasks, and decisions visible to members explicitly included in that workspace.
- **Personal memory:** durable information the person has explicitly allowed EUDELLA to retain for a stated purpose; inspectable, correctable, exportable, and deletable.
- **System policy and agent instructions:** controlled operational rules, separate from user content and retrieved material.

Memory is purpose-bound, minimal, attributable, and governed by visibility. The system must show where important remembered facts came from and allow the person to correct them.

Private one-to-one conversations must not silently become shared workspace context. Personal memory must not be imported into an organizational workspace. Agents receive only the context required for their assigned task.

Retrieved web pages, files, messages, and tool outputs are untrusted data, not instructions. They cannot override system policy, user intent, or permission boundaries.

## 6. Permission and action model

ALSOS enforces authorization outside the model, at the tool/API boundary. An agent's instruction to ask permission is not a substitute for technical access control.

| Level | Meaning | Default behavior |
|---|---|---|
| L0 | Read and explain information | Allowed within the current request and source policy |
| L1 | Draft, compare, and plan | Allowed; user reviews and edits |
| L2 | Save or change information inside the user's EUDELLA workspace | Requires relevant, purpose-bound permission |
| L3 | Send, submit, book, publish, contact, purchase, or change an external system | Requires explicit, action-specific approval immediately before execution |
| L4 | Autonomous high-impact financial, medical, legal, employment, emergency, or similarly consequential decisions | Prohibited |

An approval binds to the exact action, destination or recipient, parameters, data to be shared, cost or consequence, and expiry. If any material parameter changes, approval is invalid and must be requested again. Silence is denial. Revocation, cancellation, denial, timeout, and execution failure must have explicit states.

No agent may inherit broader authority through delegation. The called tool must independently verify the actor, tenant, permission, and approval.

## 7. Operating cycle

1. **Listen:** receive the person's stated request and constraints.
2. **Clarify:** ask only for missing information that materially changes correctness or safety.
3. **Plan:** choose direct response, deterministic workflow, one agent, or a small specialist team.
4. **Authorize context:** select the minimum context and tools each task needs.
5. **Delegate:** create bounded tasks with owners and expected deliverables.
6. **Work:** agents research, analyze, draft, or prepare in parallel where useful.
7. **Handoff:** pass structured findings and evidence to dependent agents.
8. **Review:** check source quality, contradictions, policy, and task acceptance conditions.
9. **Ask:** present exact approval requests for any consequential external action.
10. **Execute:** run only the approved action and capture its receipt/result.
11. **Report:** explain what was completed, what failed, what remains, and what information was retained.
12. **Learn with permission:** update durable memory only within the person's stated controls.

## 8. Technical architecture boundaries

ALSOS should remain provider-agnostic and separate probabilistic reasoning from deterministic controls.

Logical services:
- Workspace & conversation service
- Identity, tenant, and membership service
- Agent registry and versioning
- Orchestration and task state machine
- Context and memory service
- Retrieval and provenance service
- Tool and integration gateway
- Policy and authorization engine
- Approval service
- Artifact/file service
- Audit and observability service
- Evaluation and release service

The model may propose a plan or tool call. Deterministic services validate the schema, user/tenant scope, policy, permission, budget, and approval before any side effect. The orchestration layer records idempotency keys, checkpoints, retries, cancellation, and recovery.

Do not make every logical agent a separate microservice by default. Begin with a modular, testable system and introduce independent runtimes only when isolation, scaling, or operational evidence justifies them.

## 9. Safety, privacy, and organizational separation

The existing EUDELLA privacy and safety commitments remain binding:
- no surveillance, coercion, manipulation, hidden monitoring, dependency design, or personal data sales;
- the person can inspect, correct, export, delete, pause, and revoke access to personal information;
- no external action or third-party disclosure without explicit approval;
- no autonomous high-impact decisions;
- no private personal support history exposed to organizational administrators;
- no hidden individual wellbeing or performance scores;
- essential safety and privacy controls are not paywalled;
- EUDELLA is not emergency response, clinical care, legal advice, or financial advice.

B2B workspaces require a separate tenant and data boundary. Organizational administrators may manage organizational configuration and aggregate operational data only where appropriate; they must not gain access to private personal support conversations by virtue of their role.

## 10. Evaluation and release requirements

Evaluate the system at task, agent, orchestration, and product levels. Tests must cover:
- task completion and usefulness;
- correct choice between direct answer, single agent, and multi-agent workflow;
- delegation accuracy and handoff completeness;
- source fidelity, freshness, and uncertainty;
- conflicting-agent resolution and loop termination;
- prompt injection in retrieved content and handoffs;
- cross-user and cross-tenant isolation;
- least-privilege tool access;
- approval binding, expiry, revocation, and changed parameters;
- safe cancellation, idempotency, retry, and partial failure;
- memory visibility, correction, export, and deletion;
- latency, model/tool usage, and cost per completed task;
- accessibility and user understanding of control.

No agent or workflow is considered production-ready because a prompt looks correct. It must pass reproducible tests against its real tool contracts and permission enforcement.

## 11. Initial implementation sequence

**Foundation (current):** document the workspace model, roles, context boundaries, permission contract, task lifecycle, and evaluation requirements.

**Prototype:** synthetic data only; implement one workspace, one coordinator, two specialist capabilities, a task board, source-linked artifacts, and an approval preview. No personal onboarding or external side effects.

**Private pilot readiness:** implement authentication, tenant isolation, consent, audit, memory controls, export/deletion, rate/cost limits, incident handling, and security testing.

**Controlled pilot:** add only the workflows validated by user research. Keep external actions disabled until the approval service and tool gateway are verified.

**Expansion:** add further agents, integrations, schedules, and B2B capabilities only when measured user value, cost, and governance support them.

## 12. Reference and adaptation notes

Primary reference reviewed:
- Genspark, [GenTeam Help Center](https://www.genspark.ai/helpcenter/genteam) — persistent agents, shared group chats, tasks with a single assignee, agent profiles and access, skills, files, memory, handoffs, and approval/access controls.
- Genspark, [GenTeam product page](https://www.genspark.ai/genteam) — specialist agents, @mentions, parallel subtasks, handoffs, and deliverables in shared chat.

Adaptation boundary: EUDELLA adopts the collaborative workspace pattern, not Genspark's proprietary implementation or commercial terms. EUDELLA's life-support purpose, privacy commitments, consent model, and human-agency philosophy govern every adaptation.

## 13. Status

This document establishes the proposed foundation for future EUDELLA/ALSOS design and implementation. It does **not** mean an agent runtime, shared workspace, memory system, approval engine, application, or production service has been implemented or verified.
