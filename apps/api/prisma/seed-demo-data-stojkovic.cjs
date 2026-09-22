// Demo seed: run db:seed:auth first, then this script through db:seed:demo.
// Dates are relative to execution in Europe/Belgrade (including DST).
// Existing clients are retained. Existing passwords are never overwritten.
// One atomic seed per workspace: reruns update user profiles but do not duplicate data.
// An old DEMO_SEED_COMPLETED marker blocks new data too: use a fresh demo database
// to replace an old dataset. This script deliberately does not delete existing data.
process.env.TZ = "Europe/Belgrade";
const { PrismaClient } = require("@prisma/client");
const { randomBytes, scryptSync } = require("node:crypto");
const NOW = new Date();
const TODAY = new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate());
const FALLBACK_PASSWORD = "!QAZ2wsx!QAZ2wsx"; // Local demo only; env passwords take precedence.
const CASES_PER_LAWYER = 2;
const PERSONAS = [
  [2, "bojana.stojkovic", "Bojana", "Stojković", "Advokat ortak", "ADMIN"],
  [3, "djordje.nikolic", "Đorđe", "Nikolić", "Advokat", "LAWYER"],
  [4, "marija.bradic", "Marija", "Bradić", "Advokat", "LAWYER"],
  [5, "ljubica.gajic", "Ljubica", "Gajić", "Advokat", "LAWYER"],
  [6, "vladimir.joksimovic", "Vladimir", "Joksimović", "Advokat", "LAWYER"],
  [
    7,
    "petar.petrovic.pripravnik",
    "Petar",
    "Petrović",
    "Advokatski pripravnik",
    "LAWYER",
  ],
  [
    8,
    "milica.milic.pripravnik",
    "Milica",
    "Milić",
    "Advokatski pripravnik",
    "LAWYER",
  ],
  [
    9,
    "stefan.stefanovic.office-desk",
    "Stefan",
    "Stefanović",
    "Office desk",
    "MEMBER",
  ],
];
let state = 20260919;
function random() {
  state |= 0;
  state = (state + 0x6d2b79f5) | 0;
  let t = Math.imul(state ^ (state >>> 15), 1 | state);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const randomInt = (min, max) => min + Math.floor(random() * (max - min + 1));
const pick = (items) => items[randomInt(0, items.length - 1)];
function pickMany(items, count) {
  const pool = [...items],
    result = [];
  while (pool.length && result.length < count)
    result.push(pool.splice(randomInt(0, pool.length - 1), 1)[0]);
  return result;
}
const pad = (n) => String(n).padStart(3, "0");
function localPart(first, last) {
  return `${first}.${last}`
    .toLowerCase()
    .replace(/đ/g, "dj")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}
const slugify = (s) => localPart(s, "").replace(/[^a-z0-9]/g, "");
function atDay(offset, hour = 10) {
  const date = new Date(TODAY);
  date.setDate(date.getDate() + offset);
  date.setHours(hour, 0, 0, 0);
  return date;
}
// Prisma date-only values use midnight UTC for the intended Belgrade calendar day.
function dateOnly(offset) {
  const date = atDay(offset);
  return new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()),
  );
}
function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}
async function ensureUsers(db, workspaceId) {
  const email = process.env.AUTH_BOOTSTRAP_EMAIL?.trim().toLowerCase();
  if (!email)
    throw new Error("Set AUTH_BOOTSTRAP_EMAIL and run db:seed:auth first.");
  const admin = await db.user.findUnique({ where: { email } });
  if (!admin)
    throw new Error("Bootstrap user missing. Run db:seed:auth first.");
  const membership = await db.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId: admin.id, workspaceId } },
  });
  if (membership?.status !== "ACTIVE")
    throw new Error(
      "Bootstrap user must be an active member of this workspace.",
    );
  const users = [admin],
    emails = new Set([email]);
  for (const [suffix, login, firstName, lastName, jobTitle, role] of PERSONAS) {
    const email = (
      process.env[`AUTH_BOOTSTRAP_EMAIL${suffix}`] || `${login}@law.rs`
    )
      .trim()
      .toLowerCase();
    if (emails.has(email))
      throw new Error(`Duplicate bootstrap email: ${email}`);
    emails.add(email);
    const password =
      process.env[`AUTH_BOOTSTRAP_PASSWORD${suffix}`] ||
      process.env.AUTH_BOOTSTRAP_PASSWORD ||
      FALLBACK_PASSWORD;
    if (password.length < 12)
      throw new Error(
        `Password for ${email} must have at least 12 characters.`,
      );
    const profile = { firstName, lastName, jobTitle, status: "ACTIVE" };
    const user = await db.user.upsert({
      where: { email },
      update: profile,
      create: {
        email,
        ...profile,
        passwordHash: hashPassword(password),
        passwordChangedAt: NOW,
      },
    });
    await db.workspaceMember.upsert({
      where: { userId_workspaceId: { userId: user.id, workspaceId } },
      update: { role, status: "ACTIVE" },
      create: { userId: user.id, workspaceId, role, status: "ACTIVE" },
    });
    users.push(user);
  }
  return users;
}
async function ensureReferences(db, workspaceId, actorUserId) {
  const result = {};
  for (const [model, names] of Object.entries({
    caseType: [
      "Parnica",
      "Krivični postupak",
      "Privredni spor",
      "Radni spor",
      "Nasleđivanje",
      "Nepokretnosti",
    ],
    practiceArea: [
      "Građansko pravo",
      "Krivično pravo",
      "Privredno pravo",
      "Radno pravo",
      "Porodično pravo",
      "Pravo nekretnina",
    ],
    tag: [
      "Hitno",
      "VIP klijent",
      "Pro bono",
      "Naplata u kašnjenju",
      "Strani klijent",
      "Medijacija",
    ],
  })) {
    result[model] = [];
    for (const name of names)
      result[model].push(
        await db[model].upsert({
          where: { workspaceId_name: { workspaceId, name } },
          update: {},
          create: {
            workspaceId,
            name,
            createdByUserId: actorUserId,
            updatedByUserId: actorUserId,
          },
        }),
      );
  }
  return result;
}

const MALE_NAMES = [
  "Marko",
  "Aleksandar",
  "Dušan",
  "Igor",
  "Nemanja",
  "Bojan",
  "Filip",
  "Uroš",
];
const FEMALE_NAMES = [
  "Jovana",
  "Marija",
  "Ivana",
  "Katarina",
  "Sofija",
  "Nina",
  "Teodora",
  "Sara",
];
const LAST_NAMES = [
  "Stojanović",
  "Pavlović",
  "Ristić",
  "Todorović",
  "Popović",
  "Kovačević",
  "Živković",
  "Milošević",
  "Vasić",
  "Radovanović",
  "Lazić",
  "Obradović",
  "Antić",
  "Dimitrijević",
];
const ORGANIZATIONS = [
  { name: "Alfa Trade d.o.o.", tax: "PIB100001", reg: "MB20001" },
  {
    name: "Beogradska tekstilna industrija a.d.",
    tax: "PIB100002",
    reg: "MB20002",
  },
  { name: "Nova Energija d.o.o.", tax: "PIB100003", reg: "MB20003" },
  { name: "Dunav Logistika d.o.o.", tax: "PIB100004", reg: "MB20004" },
  { name: "Srbija Agro a.d.", tax: "PIB100005", reg: "MB20005" },
  { name: "Grand Nekretnine d.o.o.", tax: "PIB100006", reg: "MB20006" },
];
const CITIES = [
  { city: "Beograd", postal: "11000" },
  { city: "Novi Sad", postal: "21000" },
  { city: "Niš", postal: "18000" },
  { city: "Kragujevac", postal: "34000" },
  { city: "Subotica", postal: "24000" },
  { city: "Čačak", postal: "32000" },
];
const STREETS = [
  "Kralja Petra",
  "Bulevar oslobođenja",
  "Cara Dušana",
  "Nemanjina",
  "Kneza Miloša",
  "Vojvode Stepe",
  "Bulevar kralja Aleksandra",
  "Ilije Garašanina",
];
const COURTS = [
  "Osnovni sud u Beogradu",
  "Privredni sud u Beogradu",
  "Apelacioni sud u Novom Sadu",
  "Osnovni sud u Nišu",
  "Viši sud u Beogradu",
];
const CASE_TITLE_TEMPLATES = [
  "Zastupanje po ugovoru o zakupu",
  "Naplata potraživanja",
  "Raskid ugovora o radu",
  "Sporazumni razvod braka",
  "Naknada štete iz saobraćajne nezgode",
  "Osnivanje privrednog društva",
  "Spor oko nasledstva",
  "Zaštita prava intelektualne svojine",
  "Utvrđivanje prava svojine na nepokretnosti",
  "Krivična prijava zbog utaje poreza",
  "Radni spor povodom otkaza",
  "Ugovor o poslovnoj saradnji",
  "Izvršni postupak radi naplate duga",
  "Spor po osnovu ugovora o kreditu",
  "Zaštita potrošača",
  "Upravni spor protiv rešenja opštine",
  "Spor o zakupu poslovnog prostora",
  "Osporavanje otkaza ugovora o radu",
];

async function ensureClients(prisma, workspaceId, actorUserId, lawyers, tags) {
  const clients = [];
  let seq = 1;

  for (let i = 0; i < 8; i++) {
    const isMale = i % 2 === 0;
    const firstName = pick(isMale ? MALE_NAMES : FEMALE_NAMES);
    const lastName = pick(LAST_NAMES);
    const location = pick(CITIES);
    const clientNumber = `K-${pad(seq++)}`;
    const displayName = `${firstName} ${lastName}`;
    const clientTags = random() < 0.4 ? pickMany(tags, 1) : [];
    const client = await prisma.client.upsert({
      where: { workspaceId_clientNumber: { workspaceId, clientNumber } },
      update: {},
      create: {
        workspaceId,
        clientNumber,
        type: "INDIVIDUAL",
        displayName,
        firstName,
        lastName,
        isDomestic: true,
        jmbg: `${1000000000000 + seq}`.slice(0, 13),
        status: "ACTIVE",
        email: `${localPart(firstName, lastName)}${seq}@primer.test`,
        phone: `+381 6${randomInt(0, 9)} ${randomInt(100, 999)} ${randomInt(1000, 9999)}`,
        preferredLanguage: "SR",
        responsibleUserId: pick(lawyers).id,
        createdByUserId: actorUserId,
        updatedByUserId: actorUserId,
        addresses: {
          create: [
            {
              addressType: "HOME",
              street: `${pick(STREETS)} ${randomInt(1, 120)}`,
              city: location.city,
              postalCode: location.postal,
              country: "RS",
              isPrimary: true,
            },
          ],
        },
        identificationDocuments: {
          create: [
            {
              type: "LICNA_KARTA",
              number: `${randomInt(100000000, 999999999)}`,
              issuedDate: new Date(
                `202${randomInt(0, 3)}-0${randomInt(1, 9)}-10`,
              ),
              country: "RS",
            },
          ],
        },
        tags: clientTags.length
          ? { create: clientTags.map((tag) => ({ tagId: tag.id })) }
          : undefined,
      },
    });
    clients.push(client);
  }

  for (const org of ORGANIZATIONS) {
    const location = pick(CITIES);
    const clientNumber = `K-${pad(seq++)}`;
    const repFirst = pick(MALE_NAMES.concat(FEMALE_NAMES));
    const repLast = pick(LAST_NAMES);
    const clientTags = random() < 0.5 ? pickMany(tags, 1) : [];
    const client = await prisma.client.upsert({
      where: { workspaceId_clientNumber: { workspaceId, clientNumber } },
      update: {},
      create: {
        workspaceId,
        clientNumber,
        type: "ORGANIZATION",
        displayName: org.name,
        organizationName: org.name,
        isDomestic: true,
        taxNumber: org.tax,
        registrationNumber: org.reg,
        status: "ACTIVE",
        email: `office@${slugify(org.name.split(" ")[0])}.test`,
        phone: `+381 11 ${randomInt(1000000, 9999999)}`,
        preferredLanguage: "SR",
        responsibleUserId: pick(lawyers).id,
        createdByUserId: actorUserId,
        updatedByUserId: actorUserId,
        addresses: {
          create: [
            {
              addressType: "HEADQUARTERS",
              street: `${pick(STREETS)} ${randomInt(1, 120)}`,
              city: location.city,
              postalCode: location.postal,
              country: "RS",
              isPrimary: true,
            },
          ],
        },
        contacts: {
          create: [
            {
              firstName: repFirst,
              lastName: repLast,
              position: "Zastupnik",
              email: `${localPart(repFirst, repLast)}@${slugify(org.name.split(" ")[0])}.test`,
              phone: `+381 6${randomInt(0, 9)} ${randomInt(100, 999)} ${randomInt(1000, 9999)}`,
              isPrimary: true,
            },
          ],
        },
        tags: clientTags.length
          ? { create: clientTags.map((tag) => ({ tagId: tag.id })) }
          : undefined,
      },
    });
    clients.push(client);
  }

  return clients;
}

async function seedWork(db, workspaceId, users, clients, refs) {
  const actorUserId = users[0].id;
  const lawyers = users.slice(0, -1); // Owner, lawyers, and both trainees; never office desk.
  const audit = {
    workspaceId,
    createdByUserId: actorUserId,
    updatedByUserId: actorUserId,
  };
  const logs = [],
    cases = [];
  const createdAt = atDay(-14);
  async function create(model, data) {
    const item = await db[model].create({
      data: { workspaceId, createdByUserId: actorUserId, createdAt, ...data },
    });
    logs.push({
      workspaceId,
      actorUserId,
      action: `${model.toUpperCase()}_CREATED`,
      occurredAt: item.createdAt,
      caseId: item.caseId ?? null,
      clientId: item.clientId ?? null,
      entityType: model[0].toUpperCase() + model.slice(1),
      entityId: item.id,
    });
    return item;
  }
  async function event(user, type, title, day, hour, linkedCase = null) {
    const startsAt = atDay(day, hour),
      endsAt = new Date(startsAt.getTime() + 60 * 60000);
    const status = endsAt <= NOW ? "COMPLETED" : "SCHEDULED";
    const court = type === "HEARING" ? pick(COURTS) : null;
    const item = await create("event", {
      type,
      title,
      startsAt,
      endsAt,
      timeZone: "Europe/Belgrade",
      isAllDay: false,
      status,
      organizerUserId: user.id,
      caseId: linkedCase?.id ?? null,
      location: court || "Kancelarija",
      courtName: court,
      courtroom: court ? `Sudnica ${randomInt(1, 12)}` : null,
      assignees: { create: [{ workspaceId, userId: user.id }] },
      clients: linkedCase
        ? { create: [{ workspaceId, clientId: linkedCase.clientId }] }
        : undefined,
    });
    if (status === "COMPLETED")
      logs.push({
        workspaceId,
        actorUserId: user.id,
        action: "EVENT_COMPLETED",
        occurredAt: endsAt,
        caseId: item.caseId,
        entityType: "Event",
        entityId: item.id,
      });
  }
  for (let i = 0; i < lawyers.length * CASES_PER_LAWYER; i++) {
    const owner = lawyers[i % lawyers.length],
      client = clients[i % clients.length];
    const title = CASE_TITLE_TEMPLATES[i % CASE_TITLE_TEMPLATES.length];
    const item = await db.case.create({
      data: {
        ...audit,
        caseNumber: `DEMO-${TODAY.getFullYear()}-${pad(i + 1)}`,
        name: `${title} - ${client.displayName}`,
        description: `Predmet za klijenta ${client.displayName}.`,
        clientId: client.id,
        responsibleUserId: owner.id,
        status: "ACTIVE",
        priority: "NORMAL",
        caseTypeId: refs.caseType[i % refs.caseType.length].id,
        practiceAreaId: refs.practiceArea[i % refs.practiceArea.length].id,
        openedDate: dateOnly(-30),
      },
    });
    cases.push(item);
    await db.caseResponsibility.create({
      data: {
        ...audit,
        caseId: item.id,
        userId: owner.id,
        isPrimary: true,
        startedAt: atDay(-30),
      },
    });
    await db.caseActivity.create({
      data: {
        ...audit,
        caseId: item.id,
        type: "MEETING",
        title: "Dogovor o narednim koracima",
        description: "Utvrđene obaveze, odgovorno lice i naredni rokovi.",
        activityDate: atDay(-2),
        source: "MANUAL",
      },
    });
    // Per case: completed history + present work + two upcoming tasks.
    // Exactly two tasks across the entire seed are overdue.
    const tasks = [
      ["Pregled dokumentacije", "DONE", -3],
      ["Priprema podneska", "IN_PROGRESS", i < 2 ? -2 : 0],
      ["Priprema za ročište", "TODO", randomInt(1, 4)],
      ["Kontakt sa klijentom", "TODO", randomInt(10, 21)],
    ];
    for (const [title, status, day] of tasks) {
      const task = await create("task", {
        title: `${title} - ${item.name}`,
        status,
        priority: day < 0 && status !== "DONE" ? "HIGH" : "NORMAL",
        assigneeUserId: owner.id,
        caseId: item.id,
        dueDate: dateOnly(day),
        dueAt: null,
        completedAt: status === "DONE" ? atDay(-3, 15) : null,
        completedByUserId: status === "DONE" ? owner.id : null,
      });
      if (status === "DONE")
        logs.push({
          workspaceId,
          actorUserId: owner.id,
          action: "TASK_DONE",
          occurredAt: task.completedAt,
          caseId: item.id,
          entityType: "Task",
          entityId: task.id,
        });
    }
    // Exactly one overdue deadline; other deadlines are today or within three weeks.
    await create("deadline", {
      title: `Interni rok za pripremu predmeta - ${item.name}`,
      type: "INTERNAL",
      status: "OPEN",
      responsibleUserId: owner.id,
      caseId: item.id,
      timeZone: "Europe/Belgrade",
      dueDate: dateOnly(i === 2 ? -1 : i % 4 === 0 ? 0 : randomInt(5, 21)),
      dueAt: null,
      sourceDescription: "Demonstracioni interni rok.",
    });
    await create("note", {
      caseId: item.id,
      type: "CASE_UPDATE",
      occurredAt: atDay(-2),
      body: "Predmet je u toku. Pripremiti dokumentaciju, potvrditi termin i pratiti naredne rokove.",
    });
    await event(
      owner,
      "HEARING",
      `Ročište - ${item.name}`,
      randomInt(5, 9),
      i < lawyers.length ? 10 : 13,
      item,
    );
  }
  // Everyone, including office desk, has today's event and several future events.
  // Each user has separate day windows to avoid clashes with their hearings.
  for (const user of users) {
    const templates = [
      ["MEETING", "Dnevni dogovor u kancelariji", 0],
      ["MEETING", "Sastanak o planu rada", randomInt(1, 3)],
      ["CALL", "Telefonska konsultacija", randomInt(10, 14)],
      ["OTHER", "Pregled pristigle dokumentacije", randomInt(15, 21)],
    ];
    for (const [type, title, day] of templates)
      await event(user, type, title, day, randomInt(9, 15));
  }
  for (const client of clients)
    await db.clientActivity.create({
      data: {
        ...audit,
        clientId: client.id,
        type: "PHONE_CALL",
        title: "Provera kontakt podataka",
        description: "Potvrđeni kontakt podaci klijenta.",
        activityDate: atDay(-4),
        source: "MANUAL",
      },
    });
  logs.push({
    workspaceId,
    actorUserId,
    action: "DEMO_SEED_COMPLETED",
    occurredAt: NOW,
    entityType: "DemoSeed",
    entityId: "demo-seed-marker",
  });
  await db.activityLog.createMany({ data: logs });
  console.log(
    `Created ${cases.length} cases, ${cases.length * 4} tasks, ${cases.length} deadlines, ` +
      `${cases.length} notes and ${cases.length + users.length * 4} events. Exactly 3 overdue obligations.`,
  );
}
async function main() {
  const prisma = new PrismaClient();
  try {
    await prisma.$transaction(
      async (db) => {
        const workspaceId =
          process.env.AUTH_BOOTSTRAP_WORKSPACE_ID ??
          "11111111-1111-4111-a111-111111111111";
        // Serialize concurrent seed runs for this workspace (PostgreSQL).
        await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${workspaceId}))`;
        if (!(await db.workspace.findUnique({ where: { id: workspaceId } }))) {
          throw new Error("Workspace missing. Run db:seed:auth first.");
        }
        const users = await ensureUsers(db, workspaceId);
        const marker = await db.activityLog.findFirst({
          where: { workspaceId, action: "DEMO_SEED_COMPLETED" },
        });
        if (marker) {
          console.log(
            "User profiles updated. Demo data already exists; no cases or activities added. " +
              "To replace an old demo dataset, run this script against a fresh demo database after db:seed:auth.",
          );
          return;
        }
        await db.storageConnection.upsert({
          where: {
            workspaceId_configRef: { workspaceId, configRef: "local-default" },
          },
          update: { enabled: true, isDefault: true, providerType: "LOCAL" },
          create: {
            workspaceId,
            configRef: "local-default",
            enabled: true,
            isDefault: true,
            providerType: "LOCAL",
          },
        });
        const refs = await ensureReferences(db, workspaceId, users[0].id);
        const clients = await ensureClients(
          db,
          workspaceId,
          users[0].id,
          users.slice(0, -1),
          refs.tag,
        );
        await seedWork(db, workspaceId, users, clients, refs);
      },
      { maxWait: 10000, timeout: 120000 },
    );
  } finally {
    await prisma.$disconnect();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
