import { describe, expect, it } from "vitest";
import { MAISON_VERRE } from "@/data/clinics";
import { checkCopy } from "@/lib/copy/check";
import { foreignLinks, rebookEmail } from "@/lib/email/rebook";
import { reportDelivery, reportEmail, reportEmailLive, sendReportEmail, senderAddress, TEST_SENDER } from "@/lib/email/report";

const url = "https://rebloom.test/r/abcdefghijklmnopqrstuvwx";

describe("the report email (DECISIONS D-062)", () => {
  it("comes from the clinic, carries the private link, and follows the copy rules", () => {
    const mail = reportEmail({ clinic: MAISON_VERRE, firstName: "Amelia", url });
    expect(mail.from).toBe(`"Maison Verre" <${TEST_SENDER}>`);
    expect(mail.subject).toBe("Amelia, your skin report from Maison Verre");
    expect(mail.text).toContain(url);
    expect(mail.html).toContain(`href="${url}"`);
    expect(mail.text).toContain(MAISON_VERRE.phone);
    expect(checkCopy(`${mail.subject}\n${mail.text}`)).toEqual([]);
  });

  it("never lets a typed name break the HTML or the subject line", () => {
    const mail = reportEmail({ clinic: MAISON_VERRE, firstName: '<img src=x onerror="alert(1)">\r\nBcc: someone', url });
    expect(mail.html).not.toContain("<img src=x");
    expect(mail.html).toContain("&lt;img src=x");
    expect(mail.subject).not.toMatch(/[\r\n]/);
  });

  it("uses EMAIL_FROM's address once a domain is set up, and the test sender until then", () => {
    expect(senderAddress(undefined)).toBe(TEST_SENDER);
    expect(senderAddress("Rebloom <reports@rebloom.app>")).toBe("reports@rebloom.app");
    expect(senderAddress("reports@rebloom.app")).toBe("reports@rebloom.app");
  });

  it("without a Resend key, sends nothing and says so", async () => {
    expect(reportEmailLive()).toBe(false);
    const input = { clinic: MAISON_VERRE, clientId: "c", sandboxId: "s", scanId: "scan", firstName: "Amelia", email: "a@example.com", url, now: new Date() };
    expect(await sendReportEmail(input)).toBe("off");
    expect(await reportDelivery(MAISON_VERRE.id, "c", "s", "scan")).toBe("off");
  });
});

describe("the rebook email and its demo copy (DECISIONS D-064)", () => {
  const body = `Hi Sofia,\n\nYour latest scan shows real change.\n\n${url}\n\nDana\nMaison Verre`;

  it("is Dana's words in the clinic's frame, with the report link as the button", () => {
    const mail = rebookEmail({ clinic: MAISON_VERRE, subject: "Real change on your latest scan, Sofia", body });
    expect(mail.from).toBe(`"Maison Verre" <${TEST_SENDER}>`);
    expect(mail.text).toContain("Your latest scan shows real change.");
    expect(mail.html).toContain(`href="${url}"`);
    expect(mail.html).toContain("Open your report");
    expect(mail.html).not.toContain("Rebloom demo");
  });

  it("turns a progress scan link into its own button (D-073)", () => {
    const mail = rebookEmail({ clinic: MAISON_VERRE, subject: "Time to see your progress, Rachel", body: `Hi Rachel,\n\nStart it here:\n\n${url}/rescan` });
    expect(mail.html).toContain(`href="${url}/rescan"`);
    expect(mail.html).toContain("Start your progress scan");
    expect(mail.html).not.toContain("Open your report");
  });

  it("says plainly on a demo copy whose email it is", () => {
    const mail = rebookEmail({ clinic: MAISON_VERRE, subject: "Hello", body, demoFor: "Sofia Morales" });
    expect(mail.text.startsWith("Rebloom demo: this is the email Sofia Morales, a sample client, would receive")).toBe(true);
    expect(mail.html).toContain("Rebloom demo");
    expect(checkCopy(mail.text)).toEqual([]);
  });

  it("never lets typed text break the HTML or the subject line", () => {
    const mail = rebookEmail({ clinic: MAISON_VERRE, subject: "Hi\r\nBcc: someone", body: '<script>alert(1)</script> "quoted"' });
    expect(mail.html).not.toContain("<script>");
    expect(mail.subject).not.toMatch(/[\r\n]/);
  });

  it("lets a demo copy link only to this app", () => {
    const origin = "https://rebloom.test";
    expect(foreignLinks(body, origin)).toEqual([]);
    expect(foreignLinks("Book at https://evil.example/login or https://rebloom.test.evil.example", origin)).toEqual([
      "https://evil.example/login",
      "https://rebloom.test.evil.example",
    ]);
  });
});
