# EUDELLA — Master Brand & Product Blueprint

**Version:** 1.0  
**Date:** 21 November 2026  
**Status:** Foundational strategy and specification draft  
**Canonical public brand:** EUDELLA  
**Technology name:** Agentic Life Support System OS (ALSOS)

---

## Executive summary

EUDELLA is a human-centered agentic life-support platform designed to help people connect their voluntarily expressed needs with useful information, resources, services, opportunities, and practical next steps. Its purpose is not to manage, monitor, or control a person's life. It should help each person navigate their own life with greater clarity and agency.

The philosophy is **human flourishing**: the possibility of living well and developing a meaningful life as defined by the individual. EUDELLA takes inspiration from the philosophical concept *eudaimonia*. The name EUDELLA is a coined brand name, not a literal Greek word.

The underlying technology concept is **Agentic Life Support System OS (ALSOS)**. It coordinates specialized agents, tools, information sources, user permissions, approvals, and task workflows. The commercial architecture is B2C first, with B2B expansion later.

**Tagline:** Support for the life you're living.

## 1. Identity and brand architecture

| Element | Definition |
|---|---|
| Brand | EUDELLA |
| Category | Human-centered agentic life-support platform |
| Positioning | Premium, global, human-centered |
| Philosophy | Human flourishing |
| Tagline | Support for the life you're living. |
| Technology | Agentic Life Support System OS (ALSOS) |
| B2C product | EUDELLA Personal Life Support |
| B2B product | EUDELLA Organizational Support |
| Business model | Both B2C and B2B; B2C validation first |

EUDELLA is the public-facing brand. ALSOS is the technology/system name. Do not market ALSOS as a separate consumer brand unless a future strategy explicitly calls for that.

## 2. Meaning and philosophy

The brand draws inspiration from *eudaimonia*, a philosophical idea commonly associated with human flourishing, living well, and fulfilling one's potential through a meaningful life.

This does not mean EUDELLA defines what a good life is. It does not calculate a person's worth, prescribe a life path, or optimize people against a universal score. Each person decides what matters to them.

The product promise is: **You remain in charge. EUDELLA helps make the next step clearer.**

## 3. Purpose, vision, mission

**Purpose:** Make meaningful, practical support more accessible so people can understand their options, strengthen their agency, and move toward a life they define as worthwhile.

**Vision:** A world in which people can reach relevant support and opportunity without navigating fragmented systems alone—and remain in control of their choices, information, and future.

**Mission:** Translate a person's voluntarily expressed needs into clear information, realistic options, coordinated support, and manageable next steps, with privacy, consent, and human judgment at the center.

## 4. Core values

1. Agency — people choose their goals and actions.
2. Dignity — people are treated without judgment or reduction to a profile.
3. Care — support is attentive, useful, and honest about limitations.
4. Integrity — the system explains what it knows, does, and cannot do.
5. Privacy — collect the minimum necessary; never sell personal data.
6. Access — essential guidance and safety information remain accessible.

## 5. Audience and positioning

### B2C
Individuals who want help navigating everyday complexity: finding information, organizing plans, understanding choices, accessing opportunities, or coordinating support. EUDELLA must not assume a person's needs, identity, health, income, or circumstances.

### B2B
Organizations that want to make support resources easier for members, customers, students, or employees to discover. Organizational deployments must not expose private personal support histories to administrators or become employee surveillance systems.

### Positioning statement
For people and organizations seeking a more coherent way to access practical support, EUDELLA is a human-centered agentic life-support platform that connects needs to information, resources, opportunities, and authorized next steps. Unlike a generic chatbot or opaque automation system, EUDELLA is designed around continuity, transparent permissions, and human control.

## 6. Product definition

EUDELLA is intended to be more than a conversational assistant. The experience should support a continuous journey:

1. Express a need or goal in the user's own words.
2. Clarify the context without unnecessary questioning.
3. Discover information, services, people, and opportunities.
4. Compare options and understand trade-offs.
5. Build an editable plan with manageable next steps.
6. Carry out permitted tasks with clear approval.
7. Review progress and control the information retained.

### Personal Life Support
A private personal workspace for support discovery, planning, resources, opportunities, and user-authorized assistance.

### Organizational Support
A future resource-navigation and support-access layer for organizations. It must preserve individual privacy and must not provide managers with private conversations, sensitive inferences, or individual wellbeing scores by default.

## 7. ALSOS system concept

ALSOS coordinates the product's logical layers:

- Experience: accessible web/PWA interface.
- Identity: authentication, sessions, tenant membership.
- Consent and policy: scope, purpose, expiry, revocation, risk.
- Orchestration: routing requests to bounded agents and tools.
- Agent layer: specialized support capabilities.
- Knowledge: resources, provenance, freshness, confidence.
- Integrations: external apps and APIs with scoped credentials.
- Action: draft, preview, approval, execution, receipt.
- Data: tenant-scoped storage, retention, export, deletion.
- Observability: minimal, redacted logs and user-visible audit events.

### Initial agent roles
- Life Navigator — clarifies user-stated goals and routes support.
- Support Discovery Agent — finds and evaluates relevant resources.
- Planning Agent — creates editable next-step plans.
- Opportunity Agent — explores learning, career, and community opportunities.
- Wellbeing Guide — provides non-clinical information and referral guidance.
- Safety Guardian — applies safety policies and suggests appropriate escalation.

Agents are bounded capabilities, not independent authorities. They must not assign goals or infer needs without user input.

### Action levels
- L0: explain and retrieve information.
- L1: draft suggestions and plans.
- L2: save workspace changes with relevant permission.
- L3: external actions and third-party contact require explicit, action-specific approval immediately before execution.
- L4: financial, medical, legal, or other high-impact decisions are not autonomously executed.

## 8. User experience principles

- Ask before assuming.
- Explain before recommending.
- Offer options rather than commands.
- Show sources, dates, uncertainty, and limitations.
- Make permissions visible and revocable.
- Keep consequential actions behind explicit approval.
- Make export, correction, deletion, and account exit understandable.
- Avoid designs that create emotional dependence or compulsive use.

## 9. Privacy, safety, and governance

The person controls their personal context. Consent must be specific, understandable, purpose-bound, and revocable. Data collection must be minimized. Sensitive information requires stricter controls.

EUDELLA must never secretly monitor, coerce, manipulate, sell personal data, contact third parties without approval, create hidden personal scores, or expose private personal support histories to organizational administrators.

EUDELLA is not an emergency service, clinician, lawyer, financial adviser, or replacement for qualified professionals. It must not promise guaranteed wellbeing, safety, or success.

No personal pilot should begin until identity, tenant isolation, consent UX, access controls, audit history, export/deletion, threat model, incident process, and safety escalation are implemented and tested.

## 10. Visual identity direction

**Creative idea:** A quiet path toward possibility.

Proposed palette:
- Forest: #173D35
- Deep Forest: #102B26
- Warm Ivory: #F4F0E7
- Charcoal: #252A28
- Muted Bronze: #A8875B
- Mist: #DCE4DE
- White: #FFFFFF

Typography direction: refined contemporary serif or humanist display face paired with a highly legible sans serif. Use licensed fonts and verify language coverage.

Logo concept: an open frame or shelter combined with a subtle path or horizon, using negative space to express support, direction, and personal agency. This is a concept direction, not an approved final logo.

Visuals should be calm, warm, premium, accessible, and grounded in real human contexts. Avoid generic AI gradients, random glowing orbs, medical symbols, surveillance imagery, fake trust seals, and low-contrast typography.

## 11. Voice and messaging

Voice: warm, thoughtful, capable, calm, respectful, clear, and dependable.

Master message: **Support for the life you're living.**

One-sentence description: EUDELLA is a human-centered platform that helps people connect what they need with useful information, resources, opportunities, and practical next steps—while keeping them in control.

Use language such as "your priorities", "with your permission", "here are the options", and "you decide". Avoid claims such as "we know what you need", "we manage your life", or "guaranteed transformation".

## 12. Commercial model

The intended model is both B2C and B2B.

B2C first: test a freemium core with optional paid continuity, advanced planning, or integrations only after user value and operating costs are validated.

B2B later: consider organization licensing, member/seat tiers, configuration, and integration services. Never monetize personal data.

Do not set prices or claim product-market fit without customer research. Essential safety information, privacy controls, data export, and deletion must not be held hostage by a subscription.

## 13. MVP scope and technical direction

Initial MVP:
- private authentication and user profile;
- consent and permission center;
- support request intake;
- resource directory with source metadata;
- editable support plans;
- user-controlled tasks;
- review-and-approve action queue;
- export and deletion request;
- user-visible audit history.

Proposed zero-budget-first stack, subject to verification of current free limits:
- React + Vite + TypeScript PWA;
- Cloudflare Workers + Hono;
- Cloudflare D1;
- R2 only if needed and after cost review;
- GitHub;
- provider-agnostic AI adapters, disabled by default until terms, cost, and data handling are approved.

Use tenant isolation from the first schema. Derive tenant identity from the authenticated session, not client input. Preview environments must never access production personal data, secrets, or storage.

## 14. Validation and metrics

Initial hypotheses to test:
- people struggle to find relevant support;
- fragmented tools make follow-through difficult;
- users value continuity if they retain control;
- organizations need better support-resource navigation.

Measure task usefulness, resource discovery time, user-selected next-step completion, permission comprehension, trust, perceived control, and safety incidents. Do not optimize for dependency, time spent, or personal data collected.

## 15. Roadmap

P0 Foundation: brand, product, architecture, governance documents.  
P1 Discovery: interviews, support jobs, language and trust validation.  
P2 Specification: threat model, data flows, permissions, schemas, acceptance tests.  
P3 Prototype: synthetic data only, narrow workflow, no personal onboarding.  
P4 Pilot readiness: identity, consent, audit, export/deletion, safety and security review.  
P5 Private pilot: small voluntary cohort and measured iteration.  
P6 Commercial validation: pricing, B2C unit economics, B2B use-case validation.  
P7 Controlled launch: only after legal, privacy, security, accessibility, and operational gates pass.

## 16. Brand clearance status

EUDELLA is the selected internal brand name. It is not certified as legally available.

Prior screening observed an active exact-name website at `eudella.com`. PDKI candidate-specific status was not verified. A prior WIPO exact query returned no exact record, but fuzzy and phonetic searches returned similar marks that require review. Other domains and social handles have not been verified.

Before commercial launch, conduct current official searches in PDKI, WIPO, EUIPO/TMview, USPTO, UKIPO, and relevant national registers; check exact, fuzzy, phonetic, and figurative marks; verify actual domain and social-handle status; and obtain professional trademark advice.

## 17. Current project status

This repository began empty. The current work establishes documentation only. No application, database, agent runtime, user onboarding, legal registration, trademark filing, domain purchase, or production deployment is represented as complete.

### Next execution priorities
1. Approve or revise the strategy and voice.
2. Complete formal trademark/domain review.
3. Conduct user discovery.
4. Produce the threat model and data-flow specification.
5. Define MVP acceptance tests.
6. Implement a synthetic-data prototype before any personal pilot.
