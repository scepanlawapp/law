// Shared office personas for seed-second-user.cjs and seed-demo-data-stojkovic.cjs.
const { randomBytes, scryptSync } = require("node:crypto");

// [env suffix, username, first name, last name, job title, role, phone, gender]
const PERSONAS = [
  [
    2,
    "bojana.stojkovic",
    "Bojana",
    "Stojković",
    "Advokat ortak",
    "ADMIN",
    "+381 64 110 2002",
    "FEMALE",
  ],
  [
    3,
    "djordje.nikolic",
    "Đorđe",
    "Nikolić",
    "Advokat",
    "LAWYER",
    "+381 64 110 2003",
    "MALE",
  ],
  [
    4,
    "marija.bradic",
    "Marija",
    "Bradić",
    "Advokat",
    "LAWYER",
    "+381 64 110 2004",
    "FEMALE",
  ],
  [
    5,
    "ljubica.gajic",
    "Ljubica",
    "Gajić",
    "Advokat",
    "LAWYER",
    "+381 64 110 2005",
    "FEMALE",
  ],
  [
    6,
    "vladimir.joksimovic",
    "Vladimir",
    "Joksimović",
    "Advokat",
    "LAWYER",
    "+381 64 110 2006",
    "MALE",
  ],
  [
    7,
    "petar.petrovic.pripravnik",
    "Petar",
    "Petrović",
    "Advokatski pripravnik",
    "LAWYER",
    "+381 64 110 2007",
    "MALE",
  ],
  [
    8,
    "milica.milic.pripravnik",
    "Milica",
    "Milić",
    "Advokatski pripravnik",
    "LAWYER",
    "+381 64 110 2008",
    "FEMALE",
  ],
  [
    9,
    "stefan.stefanovic.office-desk",
    "Stefan",
    "Stefanović",
    "Office desk",
    "MEMBER",
    "+381 11 555 2009",
    "MALE",
  ],
];

// Per-persona appearance and reminder preferences (UserSettings).
const SETTINGS = {
  "bojana.stojkovic": {
    theme: "MIDNIGHT",
    accentColor: "GOLD",
    finish: "LUXURY",
    timeReviewReminderEnabled: true,
    timeReviewReminderTime: "18:00",
  },
  "djordje.nikolic": {
    theme: "DEEP_NAVY",
    accentColor: "ROYAL_BLUE",
    finish: "METALLIC",
    timeReviewReminderEnabled: true,
    timeReviewReminderTime: "17:30",
  },
  "marija.bradic": {
    theme: "BURGUNDY",
    accentColor: "COPPER",
    finish: "BRUSHED",
    timeReviewReminderEnabled: true,
    timeReviewReminderTime: "17:00",
  },
  "ljubica.gajic": {
    theme: "IVORY",
    accentColor: "EMERALD",
    finish: "SOLID",
    timeReviewReminderEnabled: false,
    timeReviewReminderTime: "17:30",
  },
  "vladimir.joksimovic": {
    theme: "CHARCOAL",
    accentColor: "ICE_BLUE",
    finish: "MATTE",
    timeReviewReminderEnabled: true,
    timeReviewReminderTime: "18:30",
  },
  "petar.petrovic.pripravnik": {
    theme: "DARK_TEAL",
    accentColor: "EMERALD",
    finish: "METALLIC",
    timeReviewReminderEnabled: true,
    timeReviewReminderTime: "16:30",
  },
  "milica.milic.pripravnik": {
    theme: "MIDNIGHT",
    accentColor: "PURPLE",
    finish: "SOLID",
    timeReviewReminderEnabled: true,
    timeReviewReminderTime: "16:30",
  },
  "stefan.stefanovic.office-desk": {
    theme: "CHARCOAL",
    accentColor: "GOLD",
    finish: "METALLIC",
    timeReviewReminderEnabled: false,
    timeReviewReminderTime: "17:30",
  },
};

function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}

/**
 * Upserts every persona with profile, active membership and user settings.
 * Passwords come from AUTH_BOOTSTRAP_PASSWORD{n} (or AUTH_BOOTSTRAP_PASSWORD)
 * and are only set on creation or with AUTH_BOOTSTRAP_FORCE_PASSWORD_RESET=true.
 * Returns users in persona order.
 */
async function upsertPersonas(db, workspaceId) {
  const forceReset = process.env.AUTH_BOOTSTRAP_FORCE_PASSWORD_RESET === "true";
  const bootstrapEmail = process.env.AUTH_BOOTSTRAP_EMAIL?.trim().toLowerCase();
  const emails = new Set(bootstrapEmail ? [bootstrapEmail] : []);
  const users = [];
  for (const [
    suffix,
    username,
    firstName,
    lastName,
    jobTitle,
    role,
    phone,
    gender,
  ] of PERSONAS) {
    const email = (
      process.env[`AUTH_BOOTSTRAP_EMAIL${suffix}`] || `${username}@law.rs`
    )
      .trim()
      .toLowerCase();
    if (emails.has(email))
      throw new Error(`Duplicate bootstrap email: ${email}`);
    emails.add(email);
    const password =
      process.env[`AUTH_BOOTSTRAP_PASSWORD${suffix}`] ||
      process.env.AUTH_BOOTSTRAP_PASSWORD;
    if (!password || password.length < 12)
      throw new Error(
        `Set AUTH_BOOTSTRAP_PASSWORD${suffix} (or AUTH_BOOTSTRAP_PASSWORD) with at least 12 characters for ${email}.`,
      );
    const profile = {
      firstName,
      lastName,
      username,
      phone,
      gender,
      jobTitle,
      status: "ACTIVE",
    };
    const existing = await db.user.findUnique({ where: { email } });
    const credentials = {
      passwordHash: hashPassword(password),
      passwordChangedAt: new Date(),
    };
    const user = existing
      ? await db.user.update({
          where: { id: existing.id },
          data: { ...profile, ...(forceReset ? credentials : {}) },
        })
      : await db.user.create({ data: { email, ...profile, ...credentials } });
    await db.workspaceMember.upsert({
      where: { userId_workspaceId: { userId: user.id, workspaceId } },
      update: { role, status: "ACTIVE" },
      create: { userId: user.id, workspaceId, role, status: "ACTIVE" },
    });
    const settings = {
      ...SETTINGS[username],
      language: "SR",
      dateTimeFormat: "TWENTY_FOUR_HOUR",
      timeZone: "Europe/Belgrade",
      workspaceNotifications: true,
    };
    await db.userSettings.upsert({
      where: { userId: user.id },
      update: settings,
      create: { userId: user.id, ...settings },
    });
    users.push(user);
  }
  return users;
}

module.exports = { PERSONAS, upsertPersonas };
