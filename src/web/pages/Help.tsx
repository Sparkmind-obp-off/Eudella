import { Link } from "react-router-dom";
import { useI18n } from "../i18n";
import { Mark, PageHead } from "../components/ui";

export function HelpPage({ standalone }: { standalone?: boolean }) {
  const { t } = useI18n();
  const body = (
    <div className="page">
      <PageHead title={t("help_title")} lede="What EUDELLA is, what it isn't, and where to turn when you need more." />
      <div className="notice notice-safety" role="note" style={{ marginBottom: "var(--s-6)" }}>
        <p><strong>{t("not_emergency")}</strong></p>
        <p>If you're thinking about harming yourself, please contact local emergency services or a crisis line in your country, or reach out to someone you trust right now.</p>
      </div>
      <div className="grid-2">
        <section className="stack">
          <h2>What EUDELLA does</h2>
          <p>EUDELLA helps you put needs into words, find support and opportunities, make editable plans and keep track of next steps. Its agents (the ALSOS system) follow fixed rules in this version — no AI model is used, and nothing you write is sent to an AI provider.</p>
          <h2>What EUDELLA doesn't do</h2>
          <ul>
            <li>It does not give clinical, legal, financial or employment advice, and never makes those decisions for you.</li>
            <li>It does not make purchases or payments, or change outside accounts.</li>
            <li>It does not send anything outside EUDELLA without your specific approval. In this preview, even approved actions are simulated.</li>
            <li>It does not monitor you, score you, or sell your data.</li>
          </ul>
          <h2>About the listings</h2>
          <p>The current catalog is <strong>example data</strong>, clearly marked. It shows how EUDELLA presents sources, costs and eligibility. Before relying on any service, confirm the details directly with the provider.</p>
        </section>
        <section className="stack">
          <h2>Permission levels</h2>
          <dl className="kv">
            <dt>L0</dt><dd>Information — read and explain.</dd>
            <dt>L1</dt><dd>Planning — suggest steps and plans. Nothing is saved.</dd>
            <dt>L2</dt><dd>Saving — only when you press save.</dd>
            <dt>L3</dt><dd>External actions — only after your specific approval, and only with external actions allowed.</dd>
            <dt>L4</dt><dd>Prohibited — autonomous financial, medical, legal and employment decisions.</dd>
          </dl>
          <h2>Your controls</h2>
          <p>See and correct what's stored in <Link to="/app/context">About me</Link>, choose what EUDELLA may do in <Link to="/app/privacy">Privacy & consent</Link>, and export, pause or delete in <Link to="/app/data">Your data</Link>.</p>
        </section>
      </div>
    </div>
  );
  if (!standalone) return body;
  return (
    <div className="landing">
      <header className="l-head"><Link to="/" className="brand" aria-label="EUDELLA home"><Mark size={34} color="var(--forest)" /><span className="brand-word">EUDELLA</span></Link><Link to="/signin" className="btn btn-sm">{t("sign_in")}</Link></header>
      <main id="main" className="main" style={{ maxWidth: 1100, margin: "0 auto" }}>{body}</main>
    </div>
  );
}
