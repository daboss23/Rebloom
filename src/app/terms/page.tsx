import type { Metadata } from "next";
import { PolicyPage } from "@/components/flow/PolicyPage";

export const metadata: Metadata = { title: "Terms · Rebloom" };

export default function TermsPage() {
  return (
    <PolicyPage title="Terms, in plain English." updated="October 5, 2026">
      <section>
        <h2>This is a demo</h2>
        <p>Rebloom is a hackathon demo. The clinics, prices, treatments and practitioners shown are fictional. Please don&apos;t rely on anything here to make decisions about your skin.</p>
      </section>
      <section>
        <h2>Cosmetic only</h2>
        <p>Scores describe how skin looks in a photo. They are not a medical assessment, and nothing here diagnoses or treats any condition. For skin health concerns, see a licensed dermatologist.</p>
      </section>
      <section>
        <h2>Simulated images</h2>
        <p>Any image showing likely improvement is an illustration, not a guaranteed result. Everyone&apos;s skin responds differently.</p>
      </section>
      <section>
        <h2>Payments</h2>
        <p>Booking deposits in this demo run in test mode. No real money is ever taken.</p>
      </section>
      <section>
        <h2>Fair use</h2>
        <p>Live skin analysis is limited per browser each day. When a limit is reached, the demo shows sample results, clearly labelled.</p>
      </section>
    </PolicyPage>
  );
}
