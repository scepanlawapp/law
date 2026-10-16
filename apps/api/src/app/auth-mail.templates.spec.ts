import { AuthEmailLocale, AuthEmailMessage, renderAuthEmail } from "@law/auth";

const link = "https://app.example.com/reset-password?token=abc%20123";
const changedAt = "2026-10-16T10:30:00.000Z";

function formatted(locale: AuthEmailLocale): string {
  return new Intl.DateTimeFormat(locale === "SR" ? "sr-Latn-RS" : "en-GB", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "Europe/Belgrade",
  }).format(new Date(changedAt));
}

describe("renderAuthEmail", () => {
  it("renders invitation in Serbian", () => {
    const email = renderAuthEmail(
      { template: "invitation", link },
      { locale: "SR", officeName: "Advokati Petrović" },
    );
    expect(email.subject).toContain("Poziv");
    expect(email.subject).toContain("Advokati Petrović");
    expect(email.text).toContain(link);
    expect(email.html).toContain(link);
  });

  it("renders password reset in English", () => {
    const email = renderAuthEmail(
      { template: "passwordReset", link },
      { locale: "EN", officeName: "Petrović Law" },
    );
    expect(email.subject).toContain("Reset your password");
    expect(email.text).toContain(link);
    expect(email.text).toContain("30 minutes");
  });

  it("renders password reset in Serbian", () => {
    const email = renderAuthEmail(
      { template: "passwordReset", link },
      { locale: "SR", officeName: "Advokati Petrović" },
    );
    expect(email.text).toContain("30 minuta");
  });

  it("password changed mentions time and what to do", () => {
    const sr = renderAuthEmail(
      { template: "passwordChanged", changedAt },
      { locale: "SR", officeName: "Advokati Petrović" },
    );
    expect(sr.text).toContain(formatted("SR"));
    expect(sr.text).toContain("administrator");

    const en = renderAuthEmail(
      { template: "passwordChanged", changedAt },
      { locale: "EN", officeName: "Petrović Law" },
    );
    expect(en.text).toContain(formatted("EN"));
    expect(en.text).toContain("If this wasn't you");
  });

  it("escapes HTML but not text", () => {
    const email = renderAuthEmail(
      { template: "invitation", link },
      { locale: "EN", officeName: "A&B <Advokati>" },
    );
    expect(email.html).toContain("A&amp;B &lt;Advokati&gt;");
    expect(email.html).not.toContain("<Advokati>");
    expect(email.text).toContain("A&B <Advokati>");
  });

  const messages: AuthEmailMessage[] = [
    { template: "invitation", link },
    { template: "passwordReset", link },
    { template: "passwordChanged", changedAt },
  ];
  const locales: AuthEmailLocale[] = ["SR", "EN"];

  it.each(
    messages.flatMap((message) =>
      locales.map((locale) => [message.template, locale, message] as const),
    ),
  )(
    "every template x locale yields non-empty subject/html/text (%s, %s)",
    (_template, locale, message) => {
      const email = renderAuthEmail(message, {
        locale,
        officeName: "Advokati Petrović",
      });
      expect(email.subject.trim()).not.toBe("");
      expect(email.html.trim()).not.toBe("");
      expect(email.text.trim()).not.toBe("");
    },
  );
});
