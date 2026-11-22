// Generates seed/seed.sql — SYNTHETIC EXAMPLE catalog data only.
// Every entry is marked verification_status='example'. No real organisations, prices,
// eligibility rules or availability are asserted. Cost/eligibility are left NULL (unknown)
// or written as explicit "Example only" text, never as facts.
import { writeFileSync, mkdirSync } from "node:fs";

const now = "2026-11-22T00:00:00.000Z";
const q = (v) => (v === null || v === undefined ? "NULL" : `'${String(v).replace(/'/g, "''")}'`);

const resources = [
  ["res_ex_career_coaching", "Community career guidance sessions (example)", "One-to-one conversations to explore work options and next steps.", "An illustrative listing showing how career guidance services appear in EUDELLA. Replace with a verified provider before launch.", "guidance", "work", "Example Community Centre", null, null, "Example city centre", "ID-JK", 0, "Step-free entrance described by provider (example, unverified)", ["career", "jobs", "guidance"]],
  ["res_ex_cv_workshop", "CV and application writing workshop (example)", "Group workshop on preparing a CV and job applications.", "Illustrative workshop listing. Schedules, capacity and cost are not verified.", "workshop", "work", "Example Skills Library", null, null, null, null, 1, "Online; captions availability unknown", ["cv", "resume", "jobs"]],
  ["res_ex_budget_basics", "Household budgeting basics guide (example)", "A plain-language guide to organising monthly spending.", "Illustrative educational material. EUDELLA does not provide financial advice.", "guide", "money", "Example Money Education Project", null, null, null, null, 1, "Readable on screen readers (example claim, unverified)", ["budget", "money", "planning"]],
  ["res_ex_debt_advice", "Free-to-access debt advice line (example)", "Talk to an adviser about managing debts.", "Illustrative listing. Whether a real service is free, and who qualifies, must be verified with the provider.", "advice", "money", "Example Advice Network", null, null, null, null, 1, null, ["debt", "money", "advice"]],
  ["res_ex_housing_info", "Renters' rights information hub (example)", "General information about renting and tenancy.", "Illustrative information resource. Not legal advice; rules vary by jurisdiction.", "information", "housing", "Example Housing Information Service", null, null, null, null, 1, null, ["housing", "rent", "tenancy"]],
  ["res_ex_peer_support", "Peer support circle (example)", "Small facilitated group to talk with people in similar situations.", "Illustrative non-clinical peer group. Not therapy or emergency support.", "community", "wellbeing", "Example Neighbourhood Association", null, null, "Example neighbourhood hall", "ID-JB", 0, "Accessibility details not yet confirmed", ["wellbeing", "community", "peer"]],
  ["res_ex_counselling_directory", "Directory of licensed counsellors (example)", "Find qualified professionals for emotional support.", "Illustrative directory listing. EUDELLA routes to qualified professionals; it does not provide clinical care.", "directory", "health", "Example Professional Association", null, null, null, null, 1, null, ["health", "counselling", "professional"]],
  ["res_ex_childcare_info", "Childcare options overview (example)", "Overview of childcare types and questions to ask providers.", "Illustrative family resource. Availability and cost are not verified.", "guide", "family", "Example Family Resource Centre", null, null, null, null, 1, null, ["family", "childcare"]],
  ["res_ex_small_business_clinic", "Small business drop-in clinic (example)", "Ask general questions about starting a small business.", "Illustrative listing. Not legal or tax advice.", "advice", "business", "Example Enterprise Hub", null, null, "Example business district", "ID-JK", 0, "Accessibility details not yet confirmed", ["business", "startup"]],
  ["res_ex_digital_skills", "Digital skills drop-in (example)", "Help with email, online forms and basic device use.", "Illustrative community listing.", "workshop", "learning", "Example Public Library", null, null, "Example public library", "ID-JT", 0, "Step-free access stated by provider (example, unverified)", ["digital", "skills", "learning"]],
];

const opportunities = [
  ["opp_ex_data_course", "Introductory data skills course (example)", "Self-paced introduction to spreadsheets and data.", "Illustrative learning opportunity. Duration, cost and certification are not verified.", "education", "Example Open Learning Platform", null, null, null, null, 1, "Example listing — confirm language, cost and recognition with the provider.", ["learning", "data", "online"]],
  ["opp_ex_language_exchange", "Community language exchange (example)", "Practise English or Bahasa Indonesia with volunteers.", "Illustrative community programme.", "community", "Example Volunteer Network", null, null, null, "Example community centre", 0, "Schedule and capacity unknown.", ["language", "community"]],
  ["opp_ex_apprenticeship", "Apprenticeship pathway information (example)", "Learn how apprenticeships combine paid work and training.", "Illustrative listing. EUDELLA does not make employment decisions or guarantee placement.", "work", "Example Training Council", null, null, null, null, 1, "Eligibility and pay must be confirmed with the employer.", ["work", "apprenticeship", "training"]],
  ["opp_ex_volunteering", "Local volunteering roles (example)", "Find volunteering roles that build experience and connection.", "Illustrative listing.", "community", "Example Volunteer Centre", null, null, null, "Various locations (example)", 0, "Role availability changes often.", ["volunteering", "community", "experience"]],
  ["opp_ex_micro_grant", "Micro-enterprise grant programme (example)", "Information about small grants for new businesses.", "Illustrative programme. Amounts, eligibility and deadlines are NOT verified and must not be relied upon.", "business", "Example Enterprise Foundation", null, null, null, null, 1, "Example only — no funding is offered through EUDELLA.", ["business", "grant", "funding"]],
  ["opp_ex_scholarship_info", "Scholarship search guidance (example)", "How to look for and evaluate scholarships.", "Illustrative guidance resource.", "education", "Example Education Advice Service", null, null, null, null, 1, "General guidance only.", ["education", "scholarship"]],
  ["opp_ex_mentoring", "Career mentoring programme (example)", "Get matched with a volunteer mentor in your field.", "Illustrative programme listing.", "program", "Example Mentoring Network", null, null, null, null, 1, "Matching criteria and waiting time unknown.", ["mentoring", "career", "work"]],
];

let sql = "-- SYNTHETIC EXAMPLE DATA. Generated by scripts/gen-seed.mjs. Not real organisations or offers.\n";
sql += "DELETE FROM resources WHERE verification_status = 'example';\nDELETE FROM opportunities WHERE verification_status = 'example';\n";
for (const r of resources) {
  const [id, title, summary, desc, cat, area, prov, elig, cost, loc, region, online, acc, tags] = r;
  sql += `INSERT INTO resources (id,title,summary,description,category,area,provider_name,eligibility,cost_text,cost_verified,location_text,region,is_online,accessibility_text,url,source_name,source_url,verification_status,verified_at,tags,created_at,updated_at) VALUES (${[id, title, summary, desc, cat, area, prov, elig, cost].map(q).join(",")},0,${q(loc)},${q(region)},${online},${q(acc)},NULL,'EUDELLA synthetic seed data',NULL,'example',NULL,${q(tags.join(","))},${q(now)},${q(now)});\n`;
}
for (const o of opportunities) {
  const [id, title, summary, desc, kind, org, elig, cost, deadline, loc, online, lim, tags] = o;
  sql += `INSERT INTO opportunities (id,title,summary,description,kind,organization,eligibility,cost_text,cost_verified,deadline,location_text,is_online,limitations,url,source_name,source_url,verification_status,verified_at,tags,created_at,updated_at) VALUES (${[id, title, summary, desc, kind, org, elig, cost].map(q).join(",")},0,${q(deadline)},${q(loc)},${online},${q(lim)},NULL,'EUDELLA synthetic seed data',NULL,'example',NULL,${q(tags.join(","))},${q(now)},${q(now)});\n`;
}
mkdirSync("seed", { recursive: true });
writeFileSync("seed/seed.sql", sql);
console.log(`seed/seed.sql: ${resources.length} resources, ${opportunities.length} opportunities (all 'example')`);
