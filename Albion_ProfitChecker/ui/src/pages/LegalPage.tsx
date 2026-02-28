import { useEffect } from "react";
import { Link } from "react-router-dom";
import { useSeo } from "../shared/seo/useSeo";
import "./legal.css";

export function LegalPage() {
  useSeo({
    title: "Legal | RomulusKings Market Reader",
    description: "Legal and compliance information for RomulusKings Market Reader.",
    canonical: "https://blackmarketreader.com/legal"
  });

  useEffect(() => {
    document.body.classList.add("legal-body");
    document.body.classList.remove("landing-body", "dashboard-body", "bm-crafter", "panel-open", "crafting-calculator-body");
    return () => {
      document.body.classList.remove("legal-body");
    };
  }, []);

  return (
    <div className="legal-page">
      <div className="legal-shell">
        <header className="legal-header">
          <Link className="legal-back" to="/" aria-label="Back to Landing">
            Back to Landing
          </Link>
          <h1>Legal & Compliance</h1>
          
        </header>

        <section className="legal-section" id="impressum">
          <h2>Impressum</h2>
          <p><strong>Operator:</strong> RomulusKings Market Reader</p>
          <p><strong>Email:</strong> blackmarketreader@gmail.com</p>
        </section>

        <section className="legal-section" id="privacy">
          <h2>Privacy Policy</h2>
          <p>
            We process minimal user data required for authentication and service delivery
            (e.g., email address for login, technical logs, and IP-based security checks).
          </p>
          <ul>
            <li>Data collected: login email, access timestamps, device/session metadata.</li>
            <li>Purpose: authentication, security, service reliability, and support.</li>
            <li>Retention: kept only as long as needed for account operation or legal duties.</li>
            <li>Rights: you can request access, correction, or deletion of your data.</li>
          </ul>
        </section>

        <section className="legal-section" id="terms">
          <h2>Terms of Service</h2>
          <p>
            By using this service you agree to follow the usage rules and acknowledge
            that market data can change rapidly. This tool provides informational signals
            and does not guarantee profit.
          </p>
          <ul>
            <li>Use at your own risk; prices and profitability are volatile.</li>
            <li>No resale of data without written permission.</li>
            <li>Accounts may be suspended for abuse or automated scraping.</li>
          </ul>
        </section>

        <section className="legal-section" id="cookies">
          <h2>Cookie & Tracking Notice</h2>
          <p>
            If analytics or tracking is enabled, we will show a consent banner and document which cookies are used.
            Currently, only essential cookies required for login/session may be used.
          </p>
        </section>
      </div>
    </div>
  );
}
