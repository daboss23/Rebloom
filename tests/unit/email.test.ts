import { describe, expect, it } from "vitest";
import { MAISON_VERRE } from "@/data/clinics";
import { checkCopy } from "@/lib/copy/check";
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
