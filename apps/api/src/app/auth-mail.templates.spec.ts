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

  it("mfaEmailCode shows the code, validity and a do-not-share warning", () => {
    const sr = renderAuthEmail(
      { template: "mfaEmailCode", code: "482915" },
      { locale: "SR", officeName: "Advokati Petrović" },
    );
    expect(sr.text).toContain("482915");
    expect(sr.html).toContain("482915");
    expect(sr.html).toContain("monospace");
    expect(sr.text).toContain("10 minuta");
    expect(sr.text).toContain("Ne delite");
    expect(sr.text).toContain("administrator");
    expect(sr.subject).not.toContain("482915");
    expect(sr.html).not.toContain("<a ");

    const en = renderAuthEmail(
      { template: "mfaEmailCode", code: "482915" },
      { locale: "EN", officeName: "Petrović Law" },
    );
    expect(en.text).toContain("482915");
    expect(en.html).toContain("482915");
    expect(en.text).toContain("10 minutes");
    expect(en.text).toContain("Do not share");
    expect(en.text).toContain("administrator");
    expect(en.subject).not.toContain("482915");
  });

  it.each([
    ["mfaDisabled", "isključena", "turned off"],
    ["mfaResetByAdmin", "administrator", "administrator"],
  ] as const)("%s mentions time and what to do", (template, srWord, enWord) => {
    const message = { template, at: changedAt } as AuthEmailMessage;
    const sr = renderAuthEmail(message, {
      locale: "SR",
      officeName: "Advokati Petrović",
    });
    expect(sr.text).toContain(`Datum i vreme: ${formatted("SR")}.`);
    expect(sr.text).toContain("kontaktirajte administratora");
    expect(sr.text).toContain(srWord);

    const en = renderAuthEmail(message, {
      locale: "EN",
      officeName: "Petrović Law",
    });
    expect(en.text).toContain(`Date and time: ${formatted("EN")}.`);
    expect(en.text).toContain("contact the office administrator");
    expect(en.text).toContain(enWord);
  });

  it("mfaDisabled and mfaResetByAdmin carry their specific copy", () => {
    const disabled = renderAuthEmail(
      { template: "mfaDisabled", at: changedAt },
      { locale: "SR", officeName: "AK" },
    );
    expect(disabled.text).toContain(
      "Dvofaktorska autentifikacija je isključena",
    );
    const reset = renderAuthEmail(
      { template: "mfaResetByAdmin", at: changedAt },
      { locale: "SR", officeName: "AK" },
    );
    expect(reset.text).toContain("pri sledećoj prijavi");
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
    { template: "mfaEmailCode", code: "482915" },
    { template: "mfaDisabled", at: changedAt },
    { template: "mfaResetByAdmin", at: changedAt },
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
