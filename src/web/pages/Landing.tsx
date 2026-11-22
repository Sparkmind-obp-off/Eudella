import { Link } from "react-router-dom";
import { useI18n } from "../i18n";
import { useSession } from "../lib/session";
import { Icon, Mark } from "../components/ui";

export function Landing() {
  const { t, locale, setLocale } = useI18n();
  const { session } = useSession();
  const authed = session?.authenticated;
  const isId = locale === "id";
  return (
    <div className="landing">
      <a className="skip-link" href="#main">Skip to content</a>
      <header className="l-head">
        <Link to="/" className="brand" aria-label="EUDELLA home"><Mark size={36} color="var(--forest)" /><span className="brand-word">EUDELLA</span></Link>
        <nav className="row" aria-label="Site">
          <button className="btn btn-quiet btn-sm hide-sm" onClick={() => setLocale(isId ? "en" : "id")} aria-label={isId ? "Switch to English" : "Ganti ke Bahasa Indonesia"}>{isId ? "EN" : "ID"}</button>
          <Link to="/help" className="btn btn-quiet btn-sm hide-sm">{t("nav_help")}</Link>
          {authed ? <Link to="/app" className="btn btn-primary btn-sm">{t("nav_home")}</Link> : <>
            <Link to="/signin" className="btn btn-sm">{t("sign_in")}</Link>
            <Link to="/signup" className="btn btn-primary btn-sm">{t("get_started")}</Link>
          </>}
        </nav>
      </header>
      <main id="main">
        <section className="l-hero" aria-labelledby="hero-title">
          <div>
            <h1 id="hero-title">{t("tagline")}</h1>
            <p className="l-lede">{isId
              ? "EUDELLA membantu Anda memahami apa yang Anda butuhkan, menemukan dukungan dan peluang yang relevan, lalu menyusun langkah berikutnya — dengan Anda tetap memegang kendali."
              : "EUDELLA helps you understand what you need, find support and opportunities that fit, and shape a next step you can actually take — with you in charge the whole way."}</p>
            <div className="row" style={{ marginTop: "var(--s-5)" }}>
              <Link to={authed ? "/app" : "/signup"} className="btn btn-primary">{authed ? t("nav_home") : t("sign_up")}</Link>
              <a href="#how" className="btn">{isId ? "Cara kerjanya" : "How it works"}</a>
            </div>
            <p className="small muted" style={{ marginTop: "var(--s-4)" }}>{isId ? "Gratis selama tahap awal. AI dimatikan secara bawaan." : "Early preview. AI is off by default; nothing leaves EUDELLA without your approval."}</p>
          </div>
          <figure className="l-mark" style={{ margin: 0 }}>
            <Mark color="var(--ivory)" stroke={9} />
            <figcaption className="l-mark-caption">Preliminary mark concept</figcaption>
          </figure>
        </section>

        <section className="l-band" id="how" aria-labelledby="how-title">
          <div style={{ maxWidth: 1320, margin: "0 auto" }}>
            <h2 id="how-title">{isId ? "Dari apa yang terjadi, ke apa yang bisa Anda lakukan." : "From what's going on, to what you can do about it."}</h2>
            <div className="l-flow">
              <div><h3>{isId ? "Ceritakan" : "Say it your way"}</h3><p>{isId ? "Tuliskan kebutuhan dengan kata-kata Anda. Life Navigator membantu memilahnya." : "Describe a need in your own words. The Life Navigator helps sort out what it's mostly about."}</p></div>
              <div><h3>{isId ? "Temukan" : "See what's out there"}</h3><p>{isId ? "Layanan, panduan dan peluang — dengan sumber dan status verifikasi yang jelas." : "Services, guidance and opportunities — each with its source and an honest verification status."}</p></div>
              <div><h3>{isId ? "Rencanakan" : "Make a plan"}</h3><p>{isId ? "Ubah tujuan menjadi langkah kecil yang bisa Anda edit kapan saja." : "Turn a goal into small, editable steps. Your definition of success, not ours."}</p></div>
              <div><h3>{isId ? "Setujui" : "Approve, or don't"}</h3><p>{isId ? "Setiap tindakan keluar menunggu persetujuan spesifik Anda." : "Anything that would leave EUDELLA waits for your specific approval — and is recorded."}</p></div>
            </div>
          </div>
        </section>

        <section className="l-section" aria-labelledby="promise-title">
          <div className="l-promise">
            <blockquote id="promise-title">{t("promise")}</blockquote>
            <ul className="l-rules">
              {(isId ? [
                "AI bersifat opsional dan mati secara bawaan.",
                "Tidak ada pesan, pembagian data, atau pemesanan tanpa persetujuan Anda.",
                "Anda bisa melihat, memperbaiki, mengekspor, dan menghapus data Anda.",
                "Tidak ada pemantauan tersembunyi, tidak ada penjualan data.",
                "Informasi yang belum terverifikasi selalu diberi label.",
              ] : [
                "AI is optional and switched off by default.",
                "No messages, data sharing or bookings without your specific approval.",
                "See, correct, export and delete everything EUDELLA stores about you.",
                "No hidden monitoring, no profiling you didn't ask for, no selling data.",
                "Anything unverified is labelled as such — we don't invent prices or eligibility.",
              ]).map((r) => <li key={r}><Icon name="check" /><span>{r}</span></li>)}
            </ul>
          </div>
        </section>

        <section className="l-section" style={{ paddingTop: 0 }} aria-label="Safety">
          <div className="notice notice-safety"><p>{t("not_emergency")} {isId ? "EUDELLA juga bukan pengganti layanan klinis, hukum, atau keuangan profesional." : "EUDELLA is also not a substitute for clinical, legal or financial professionals."}</p></div>
        </section>
      </main>
      <footer className="l-foot">
        <span>EUDELLA · powered by ALSOS (Agentic Life Support System OS)</span>
        <span><Link to="/help">{t("nav_help")}</Link></span>
        <span>Early preview. Logo is a preliminary concept, not a registered mark.</span>
      </footer>
    </div>
  );
}
