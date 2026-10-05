import type { Metadata } from "next";
import { PolicyPage } from "@/components/flow/PolicyPage";

export const metadata: Metadata = { title: "Privacy · Rebloom" };

export default function PrivacyPage() {
  return (
    <PolicyPage title="Privacy, in plain English." updated="October 5, 2026">
      <section>
        <h2>What we collect</h2>
        <ul>
          <li>One photo of your face, and the measurements taken from it.</li>
          <li>Your answers to the intake questions, including routine pre-treatment questions such as pregnancy or recent medication.</li>
          <li>Your first name and email, and your phone number and age range if you choose to share them.</li>
          <li>A record of your consent: when you gave it, the wording you agreed to, and your browser type.</li>
        </ul>
      </section>
      <section>
        <h2>Why</h2>
        <p>To show you a private skin report, to help the clinic prepare for your visit, and, if you ask, to remind you when a progress scan is due. Nothing else.</p>
      </section>
      <section>
        <h2>Your face photo is biometric data</h2>
        <p>
          Some US states, including Illinois, Texas and Washington, have specific rules for face data. We only analyze your
          photo after you explicitly agree, we never use it to identify you, and we never sell or share it for advertising.
        </p>
      </section>
      <section>
        <h2>Who processes it</h2>
        <p>
          Perfect Corp&apos;s YouCam API measures your photo and keeps it for no longer than 24 hours. Our database and file
          storage are private: photos are only shown through short-lived secure links. Report text may be written with the
          help of an AI model, which receives your scores and answers but never your photo.
        </p>
      </section>
      <section>
        <h2>How long we keep it</h2>
        <p>
          In a real clinic: until you delete it, or 12 months after your last visit, whichever comes first. In this demo,
          everything you create is deleted automatically after 30 days.
        </p>
      </section>
      <section>
        <h2>Deleting your data</h2>
        <p>Your report has a Delete my data link. It removes your photos and personal details. We keep only an anonymous count that a scan happened.</p>
      </section>
      <section>
        <h2>Cosmetic, not medical</h2>
        <p>Your report is a cosmetic assessment of visible skin. It is not a medical diagnosis.</p>
      </section>
    </PolicyPage>
  );
}
