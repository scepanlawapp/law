export type AuthEmailLocale = "SR" | "EN";

export type AuthEmailMessage =
  | { template: "invitation"; link: string }
  | { template: "passwordReset"; link: string }
  | { template: "passwordChanged"; changedAt: string /* ISO */ };

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

interface AuthEmailContext {
  locale: AuthEmailLocale;
  officeName: string;
}

interface EmailContent {
  subject: string;
  heading: string;
  paragraphs: string[];
  action?: { label: string; link: string };
  /** Shown below the action, e.g. what to do if the link was not requested. */
  afterAction?: string[];
  footer: string;
}

const RESET_VALIDITY_MINUTES = 30;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatDateTime(isoDate: string, locale: AuthEmailLocale): string {
  return new Intl.DateTimeFormat(locale === "SR" ? "sr-Latn-RS" : "en-GB", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "Europe/Belgrade",
  }).format(new Date(isoDate));
}

const contentBuilders: Record<
  AuthEmailMessage["template"],
  Record<
    AuthEmailLocale,
    (message: never, context: AuthEmailContext) => EmailContent
  >
> = {
  invitation: {
    SR: (message: { link: string }, { officeName }) => ({
      subject: `Poziv za pristup – ${officeName}`,
      heading: "Pozvani ste da se pridružite kancelariji",
      paragraphs: [
        `Kancelarija ${officeName} Vas poziva da otvorite nalog i pristupite radnom prostoru.`,
        "Kliknite na dugme ispod da prihvatite poziv i postavite lozinku.",
      ],
      action: { label: "Prihvati poziv", link: message.link },
      afterAction: [
        "Ako niste očekivali ovaj poziv, slobodno ignorišite ovu poruku.",
      ],
      footer: officeName,
    }),
    EN: (message: { link: string }, { officeName }) => ({
      subject: `Invitation to join ${officeName}`,
      heading: "You have been invited to join the office",
      paragraphs: [
        `${officeName} has invited you to create an account and access the workspace.`,
        "Use the button below to accept the invitation and set your password.",
      ],
      action: { label: "Accept invitation", link: message.link },
      afterAction: [
        "If you were not expecting this invitation, you can safely ignore this message.",
      ],
      footer: officeName,
    }),
  },
  passwordReset: {
    SR: (message: { link: string }, { officeName }) => ({
      subject: `Resetovanje lozinke – ${officeName}`,
      heading: "Resetovanje lozinke",
      paragraphs: [
        "Primili smo zahtev za resetovanje lozinke za Vaš nalog.",
        `Kliknite na dugme ispod da postavite novu lozinku. Link važi ${RESET_VALIDITY_MINUTES} minuta.`,
      ],
      action: { label: "Postavi novu lozinku", link: message.link },
      afterAction: [
        "Ako niste Vi zatražili resetovanje, slobodno ignorišite ovu poruku. Vaša lozinka ostaje nepromenjena.",
      ],
      footer: officeName,
    }),
    EN: (message: { link: string }, { officeName }) => ({
      subject: `Reset your password – ${officeName}`,
      heading: "Reset your password",
      paragraphs: [
        "We received a request to reset the password for your account.",
        `Use the button below to choose a new password. The link is valid for ${RESET_VALIDITY_MINUTES} minutes.`,
      ],
      action: { label: "Set a new password", link: message.link },
      afterAction: [
        "If you did not request a reset, you can safely ignore this message. Your password will stay the same.",
      ],
      footer: officeName,
    }),
  },
  passwordChanged: {
    SR: (message: { changedAt: string }, { officeName }) => ({
      subject: `Lozinka je promenjena – ${officeName}`,
      heading: "Vaša lozinka je promenjena",
      paragraphs: [
        `Lozinka za Vaš nalog promenjena je ${formatDateTime(message.changedAt, "SR")}.`,
        "Ako to niste bili Vi, odmah kontaktirajte administratora kancelarije kako bi se Vaš nalog obezbedio.",
      ],
      footer: officeName,
    }),
    EN: (message: { changedAt: string }, { officeName }) => ({
      subject: `Your password was changed – ${officeName}`,
      heading: "Your password was changed",
      paragraphs: [
        `The password for your account was changed on ${formatDateTime(message.changedAt, "EN")}.`,
        "If this wasn't you, contact the office administrator immediately so your account can be secured.",
      ],
      footer: officeName,
    }),
  },
};

function renderText(content: EmailContent): string {
  const blocks = [content.heading, ...content.paragraphs];
  if (content.action) {
    blocks.push(`${content.action.label}: ${content.action.link}`);
  }
  blocks.push(...(content.afterAction ?? []));
  blocks.push(`-- \n${content.footer}`);
  return blocks.join("\n\n");
}

function renderHtml(content: EmailContent): string {
  const paragraph = (value: string) =>
    `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#333333;">${escapeHtml(value)}</p>`;
  const action = content.action
    ? `<p style="margin:24px 0;"><a href="${escapeHtml(content.action.link)}" style="display:inline-block;padding:12px 24px;background-color:#1f2937;color:#ffffff;text-decoration:none;border-radius:4px;font-size:15px;">${escapeHtml(content.action.label)}</a></p>` +
      `<p style="margin:0 0 16px;font-size:13px;line-height:1.6;color:#666666;word-break:break-all;">${escapeHtml(content.action.link)}</p>`
    : "";
  return [
    `<!doctype html>`,
    `<html><head><meta charset="utf-8"><title>${escapeHtml(content.subject)}</title></head>`,
    `<body style="margin:0;padding:24px;background-color:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">`,
    `<div style="max-width:560px;margin:0 auto;padding:32px;background-color:#ffffff;border:1px solid #e4e4e7;border-radius:6px;">`,
    `<h1 style="margin:0 0 20px;font-size:20px;line-height:1.3;color:#111111;">${escapeHtml(content.heading)}</h1>`,
    ...content.paragraphs.map(paragraph),
    action,
    ...(content.afterAction ?? []).map(paragraph),
    `<hr style="margin:24px 0 16px;border:0;border-top:1px solid #e4e4e7;">`,
    `<p style="margin:0;font-size:13px;color:#666666;">${escapeHtml(content.footer)}</p>`,
    `</div>`,
    `</body></html>`,
  ].join("\n");
}

export function renderAuthEmail(
  message: AuthEmailMessage,
  context: AuthEmailContext,
): RenderedEmail {
  const content = contentBuilders[message.template][context.locale](
    message as never,
    context,
  );
  return {
    subject: content.subject,
    html: renderHtml(content),
    text: renderText(content),
  };
}
