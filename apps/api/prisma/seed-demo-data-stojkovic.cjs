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
  const demoUsers = [],
    emails = new Set([email]);
  for (const [
    suffix,
    login,
    firstName,
    lastName,
    jobTitle,
    role,
    phone,
    gender,
  ] of PERSONAS) {
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
    const profile = {
      firstName,
      lastName,
      username: login,
      phone,
      gender,
      jobTitle,
      status: "ACTIVE",
    };
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
    demoUsers.push(user);
  }
  // The bootstrap account is deliberately kept outside demoUsers. It is only
  // validated here and receives no seeded clients, cases, tasks, or activities.
  return demoUsers;
}
async function ensureReferences(db, workspaceId, actorUserId) {
  const result = {};
  for (const [model, definitions] of Object.entries({
    caseType: [
      ["Parnica", "Građanski parnični postupak pred sudom opšte nadležnosti."],
      [
        "Krivični postupak",
        "Odbrana i zastupanje oštećenih u krivičnom postupku.",
      ],
      [
        "Privredni spor",
        "Sporovi između privrednih subjekata i naplata poslovnih potraživanja.",
      ],
      ["Radni spor", "Postupci iz radnog odnosa, otkaz i naknada štete."],
      ["Nasleđivanje", "Ostavinski postupci i sporovi naslednika."],
      ["Nepokretnosti", "Svojinski, zakupni i katastarski postupci."],
    ],
    practiceArea: [
      [
        "Građansko pravo",
        "Ugovori, naknada štete, dugovanja i druga građanskopravna pitanja.",
      ],
      ["Krivično pravo", "Krivične prijave, odbrana i zastupanje oštećenih."],
      [
        "Privredno pravo",
        "Statusna pitanja, ugovori i sporovi privrednih društava.",
      ],
      ["Radno pravo", "Prava zaposlenih i poslodavaca i radni sporovi."],
      ["Porodično pravo", "Razvod, vršenje roditeljskog prava i izdržavanje."],
      [
        "Pravo nekretnina",
        "Promet, zakup, svojina i upis prava na nepokretnostima.",
      ],
    ],
    tag: [
      ["Hitno", null, "#DC2626"],
      ["VIP klijent", null, "#7C3AED"],
      ["Pro bono", null, "#0284C7"],
      ["Naplata u kašnjenju", null, "#D97706"],
      ["Strani klijent", null, "#059669"],
      ["Medijacija", null, "#4F46E5"],
    ],
  })) {
    result[model] = [];
    for (const [name, description, color] of definitions)
      result[model].push(
        await db[model].upsert({
          where: { workspaceId_name: { workspaceId, name } },
          update: {
            ...(model !== "tag" ? { description } : {}),
            ...(model === "tag" ? { color } : {}),
            isActive: true,
          },
          create: {
            workspaceId,
            name,
            ...(model !== "tag" ? { description } : {}),
            ...(model === "tag" ? { color } : {}),
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
  {
    name: "Alfa Trade d.o.o.",
    tax: "109100001",
    reg: "21100001",
    industry: "Veleprodaja tehničke robe",
    website: "https://www.alfatrade.example",
  },
  {
    name: "Beogradska tekstilna industrija a.d.",
    tax: "109100002",
    reg: "21100002",
    industry: "Proizvodnja tekstila",
    website: "https://www.bti.example",
  },
  {
    name: "Nova Energija d.o.o.",
    tax: "109100003",
    reg: "21100003",
    industry: "Obnovljivi izvori energije",
    website: "https://www.novaenergija.example",
  },
  {
    name: "Dunav Logistika d.o.o.",
    tax: "109100004",
    reg: "21100004",
    industry: "Transport i logistika",
    website: "https://www.dunavlogistika.example",
  },
  {
    name: "Srbija Agro a.d.",
    tax: "109100005",
    reg: "21100005",
    industry: "Poljoprivreda i prerada hrane",
    website: "https://www.srbijaagro.example",
  },
  {
    name: "Grand Nekretnine d.o.o.",
    tax: "109100006",
    reg: "21100006",
    industry: "Razvoj i upravljanje nekretninama",
    website: "https://www.grandnekretnine.example",
  },
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
const CASE_CLASSIFICATIONS = [
  ["Parnica", "Građansko pravo"],
  ["Privredni spor", "Privredno pravo"],
  ["Radni spor", "Radno pravo"],
  ["Parnica", "Porodično pravo"],
  ["Parnica", "Građansko pravo"],
  ["Privredni spor", "Privredno pravo"],
  ["Nasleđivanje", "Građansko pravo"],
  ["Privredni spor", "Privredno pravo"],
  ["Nepokretnosti", "Pravo nekretnina"],
  ["Krivični postupak", "Krivično pravo"],
  ["Radni spor", "Radno pravo"],
  ["Privredni spor", "Privredno pravo"],
  ["Parnica", "Građansko pravo"],
  ["Parnica", "Građansko pravo"],
  ["Parnica", "Građansko pravo"],
  ["Parnica", "Građansko pravo"],
  ["Nepokretnosti", "Pravo nekretnina"],
  ["Radni spor", "Radno pravo"],
];

const OPPOSING_PARTIES = [
  "Delta Invest d.o.o.",
  "Milan Marković",
  "Banka Meridian a.d.",
  "Grad Beograd - Gradska uprava",
  "Osiguranje Sava a.d.",
  "Jelena Ilić",
  "Metalpromet d.o.o.",
];

const CASE_DESCRIPTIONS = [
  "Klijent zahteva pravnu analizu, pripremu procesne strategije i zastupanje do pravnosnažnog okončanja postupka.",
  "Predmet obuhvata pregled ugovorne dokumentacije, procenu rizika, pregovore sa suprotnom stranom i eventualno pokretanje postupka.",
  "Potrebno je objediniti dokaze, utvrditi hronologiju događaja i pripremiti podneske u rokovima koje je odredio sud.",
  "Klijent je dostavio početnu dokumentaciju. Slede provera činjeničnog stanja, pravno istraživanje i dogovor o daljim koracima.",
];

async function ensureClients(prisma, workspaceId, actorUserId, lawyers, tags) {
  const clients = [];
  let seq = 1;

  for (let i = 0; i < 8; i++) {
    const isForeign = i === 7;
    const isMale = i % 2 === 0;
    const firstName = pick(isMale ? MALE_NAMES : FEMALE_NAMES);
    const lastName = pick(LAST_NAMES);
    const location = pick(CITIES);
    const clientNumber = `K-${pad(seq++)}`;
    const displayName = `${firstName} ${lastName}`;
    const clientTags = random() < 0.4 ? pickMany(tags, 1) : [];
    if (isForeign) {
      const foreignTag = tags.find((tag) => tag.name === "Strani klijent");
      if (foreignTag && !clientTags.some((tag) => tag.id === foreignTag.id))
        clientTags.push(foreignTag);
    }
    const street = pick(STREETS);
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
        isDomestic: !isForeign,
        jmbg: isForeign
          ? null
          : `${1000000000000 + i * 7919 + seq}`.slice(0, 13),
        status: "ACTIVE",
        email: `${localPart(firstName, lastName)}${seq}@primer.test`,
        phone: isForeign
          ? `+49 30 ${randomInt(1000000, 9999999)}`
          : `+381 6${randomInt(0, 9)} ${randomInt(100, 999)} ${randomInt(1000, 9999)}`,
        preferredLanguage: isForeign ? "EN" : "SR",
        notes:
          i % 3 === 0
            ? "Klijent preferira komunikaciju elektronskom poštom. Pre slanja podnesaka obavezno potvrditi konačnu verziju."
            : "Dokumentacija se čuva elektronski. Kontaktirati klijenta najmanje tri dana pre svakog zakazanog termina.",
        customFields: {
          preferredContactMethod: i % 2 === 0 ? "EMAIL" : "PHONE",
          referralSource: [
            "Preporuka klijenta",
            "Internet",
            "Poslovni partner",
          ][i % 3],
          billingModel: i % 3 === 0 ? "HOURLY" : "FIXED_FEE",
        },
        responsibleUserId: pick(lawyers).id,
        createdByUserId: actorUserId,
        updatedByUserId: actorUserId,
        addresses: {
          create: [
            {
              addressType: "HOME",
              street: `${street} ${randomInt(1, 120)}`,
              streetAdditional: i % 2 === 0 ? `stan ${randomInt(1, 35)}` : null,
              city: isForeign ? "Berlin" : location.city,
              postalCode: isForeign ? "10115" : location.postal,
              stateOrRegion: isForeign ? "Berlin" : "Srbija",
              country: isForeign ? "DE" : "RS",
              note: "Adresa za dostavu pošte i službenih pismena.",
              isPrimary: true,
            },
          ],
        },
        identificationDocuments: {
          create: [
            {
              type: isForeign ? "PASSPORT" : "LICNA_KARTA",
              number: `${randomInt(100000000, 999999999)}`,
              issuedDate: new Date(
                `202${randomInt(0, 3)}-0${randomInt(1, 9)}-10`,
              ),
              expiredDate: new Date(
                `203${randomInt(0, 3)}-0${randomInt(1, 9)}-10`,
              ),
              country: isForeign ? "DE" : "RS",
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
    const financeFirst = pick(MALE_NAMES.concat(FEMALE_NAMES));
    const financeLast = pick(LAST_NAMES);
    const clientTags = random() < 0.5 ? pickMany(tags, 1) : [];
    const domain = slugify(org.name.split(" ")[0]);
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
        email: `office@${domain}.test`,
        phone: `+381 11 ${randomInt(1000000, 9999999)}`,
        website: org.website,
        preferredLanguage: "SR",
        notes:
          "Pravno lice sa aktivnim okvirnim angažovanjem. Za procesne odluke kontaktirati zakonskog zastupnika, a račune slati finansijama.",
        customFields: {
          industry: org.industry,
          preferredContactMethod: "EMAIL",
          billingModel: "MONTHLY_RETAINER",
          invoiceReferenceRequired: true,
        },
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
              stateOrRegion: "Srbija",
              country: "RS",
              note: "Sedište registrovano u APR-u.",
              isPrimary: true,
            },
            ...(seq % 2 === 0
              ? [
                  {
                    addressType: "BRANCH",
                    street: `${pick(STREETS)} ${randomInt(1, 120)}`,
                    city: "Beograd",
                    postalCode: "11000",
                    stateOrRegion: "Srbija",
                    country: "RS",
                    note: "Operativna poslovnica za sastanke i prijem dokumentacije.",
                    isPrimary: false,
                  },
                ]
              : []),
          ],
        },
        contacts: {
          create: [
            {
              firstName: repFirst,
              lastName: repLast,
              position: "Zakonski zastupnik",
              email: `${localPart(repFirst, repLast)}@${domain}.test`,
              phone: `+381 6${randomInt(0, 9)} ${randomInt(100, 999)} ${randomInt(1000, 9999)}`,
              isPrimary: true,
              notes:
                "Odobrava pravnu strategiju, poravnanja i konačne verzije ugovora.",
              status: "ACTIVE",
            },
            {
              firstName: financeFirst,
              lastName: financeLast,
              position: "Finansije i administracija",
              email: `${localPart(financeFirst, financeLast)}@${domain}.test`,
              phone: `+381 11 ${randomInt(1000000, 9999999)}`,
              isPrimary: false,
              notes:
                "Kontakt za fakture, potvrde o uplati i dostavljanje poslovne dokumentacije.",
              status: "ACTIVE",
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

async function seedWork(db, workspaceId, demoUsers, clients, refs) {
  const actorUserId = demoUsers[0].id;
  const lawyers = demoUsers.slice(0, -1); // Demo lawyers and trainees; never office desk.
  const audit = {
    workspaceId,
    createdByUserId: actorUserId,
    updatedByUserId: actorUserId,
  };
  const logs = [];
  const cases = [];
  const counters = { tasks: 0, deadlines: 0, notes: 0, events: 0 };
  const createdAt = atDay(-14);
  const clientsById = new Map(clients.map((client) => [client.id, client]));
  const contacts = await db.clientContact.findMany({
    where: {
      clientId: { in: clients.map((client) => client.id) },
      status: "ACTIVE",
    },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
  });
  const primaryContactByClientId = new Map();
  for (const contact of contacts)
    if (!primaryContactByClientId.has(contact.clientId))
      primaryContactByClientId.set(contact.clientId, contact);

  async function create(model, data) {
    const item = await db[model].create({
      data: { workspaceId, createdByUserId: actorUserId, createdAt, ...data },
    });
    if (model === "task") counters.tasks++;
    if (model === "deadline") counters.deadlines++;
    if (model === "note") counters.notes++;
    if (model === "event") counters.events++;
    logs.push({
      workspaceId,
      actorUserId,
      action: `${model.toUpperCase()}_CREATED`,
      occurredAt: item.createdAt,
      caseId: item.caseId ?? null,
      clientId: item.clientId ?? null,
      entityType: model[0].toUpperCase() + model.slice(1),
      entityId: item.id,
      metadata: {
        title: item.title ?? null,
        type: item.type ?? null,
        status: item.status ?? null,
      },
    });
    return item;
  }
  async function event(
    user,
    type,
    title,
    day,
    hour,
    linkedCase = null,
    options = {},
  ) {
    const startsAt = atDay(day, hour),
      endsAt = new Date(
        startsAt.getTime() + (options.durationMinutes ?? 60) * 60000,
      );
    const status = endsAt <= NOW ? "COMPLETED" : "SCHEDULED";
    const court = type === "HEARING" ? pick(COURTS) : null;
    const linkedClient = linkedCase
      ? clientsById.get(linkedCase.clientId)
      : null;
    const linkedContact = linkedClient
      ? primaryContactByClientId.get(linkedClient.id)
      : null;
    const item = await create("event", {
      type,
      title,
      description:
        options.description ??
        (type === "HEARING"
          ? "Prisustvo zakazanom ročištu. Poneti punomoćje, dokazni materijal i poslednju verziju procesne beleške."
          : "Termin je evidentiran radi koordinacije tima i blagovremene pripreme dokumentacije."),
      startsAt,
      endsAt,
      timeZone: "Europe/Belgrade",
      isAllDay: false,
      status,
      organizerUserId: user.id,
      caseId: linkedCase?.id ?? null,
      location: options.location ?? court ?? "Kancelarija - sala za sastanke",
      meetingUrl: options.meetingUrl ?? null,
      courtName: court,
      courtroom: court ? `Sudnica ${randomInt(1, 12)}` : null,
      assignees: { create: [{ workspaceId, userId: user.id }] },
      clients: linkedCase
        ? { create: [{ workspaceId, clientId: linkedCase.clientId }] }
        : undefined,
      attendees: linkedClient
        ? {
            create: [
              {
                workspaceId,
                clientContactId: linkedContact?.id ?? null,
                displayName: linkedContact
                  ? `${linkedContact.firstName} ${linkedContact.lastName}`
                  : linkedClient.displayName,
                email: linkedContact?.email ?? linkedClient.email,
              },
            ],
          }
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
        metadata: { title: item.title, completedAutomatically: true },
      });
    return item;
  }

  for (let i = 0; i < lawyers.length * CASES_PER_LAWYER; i++) {
    const owner = lawyers[i % lawyers.length],
      client = clients[i % clients.length];
    const title = CASE_TITLE_TEMPLATES[i % CASE_TITLE_TEMPLATES.length];
    const [caseTypeName, practiceAreaName] =
      CASE_CLASSIFICATIONS[i % CASE_CLASSIFICATIONS.length];
    const caseType = refs.caseType.find((value) => value.name === caseTypeName);
    const practiceArea = refs.practiceArea.find(
      (value) => value.name === practiceAreaName,
    );
    const opposingParty = OPPOSING_PARTIES[i % OPPOSING_PARTIES.length];
    const priority = i % 7 === 0 ? "HIGH" : i % 11 === 0 ? "URGENT" : "NORMAL";
    const caseTags = [refs.tag[i % refs.tag.length]];
    if (priority === "URGENT" && !caseTags.some((tag) => tag.name === "Hitno"))
      caseTags.push(refs.tag.find((tag) => tag.name === "Hitno"));
    const item = await db.case.create({
      data: {
        ...audit,
        caseNumber: `DEMO-${TODAY.getFullYear()}-${pad(i + 1)}`,
        name: `${title} - ${client.displayName}`,
        description: `${CASE_DESCRIPTIONS[i % CASE_DESCRIPTIONS.length]} Klijent: ${client.displayName}. Predmet: ${title.toLowerCase()}.`,
        clientId: client.id,
        responsibleUserId: owner.id,
        status: i === 9 ? "ON_HOLD" : "ACTIVE",
        priority,
        caseTypeId: caseType.id,
        practiceAreaId: practiceArea.id,
        openedDate: atDay(-90 + i * 4, 9),
        externalReference: `P-${TODAY.getFullYear()}/${pad(150 + i)}`,
        opposingPartyName: opposingParty,
        opposingPartyAddress: `${pick(STREETS)} ${randomInt(1, 140)}, ${pick(CITIES).city}`,
        confidentialityLevel: i % 5 === 0 ? "RESTRICTED" : "INTERNAL",
        customFields: {
          courtFileNumber: `${randomInt(1, 9999)}/${TODAY.getFullYear()}`,
          valueInDisputeRsd: randomInt(2, 95) * 100000,
          proceduralStage: ["PRIPREMA", "PRVOSTEPENI_POSTUPAK", "PREGOVORI"][
            i % 3
          ],
          billingCode: `BILL-${pad(i + 1)}`,
        },
        tags: {
          create: caseTags.filter(Boolean).map((tag) => ({ tagId: tag.id })),
        },
      },
    });
    cases.push(item);
    logs.push({
      workspaceId,
      actorUserId,
      action: "CASE_CREATED",
      occurredAt: item.createdAt,
      caseId: item.id,
      clientId: item.clientId,
      entityType: "Case",
      entityId: item.id,
      metadata: { caseNumber: item.caseNumber, priority: item.priority },
    });
    await db.caseResponsibility.create({
      data: {
        ...audit,
        caseId: item.id,
        userId: owner.id,
        isPrimary: true,
        startedAt: atDay(-30),
      },
    });
    if (i % 2 === 0) {
      const collaborator = lawyers[(i + 1) % lawyers.length];
      await db.caseResponsibility.create({
        data: {
          ...audit,
          caseId: item.id,
          userId: collaborator.id,
          isPrimary: false,
          startedAt: atDay(-14),
        },
      });
    }
    const activities = [
      {
        type: "MEETING",
        title: "Uvodni sastanak i analiza zahteva",
        description:
          "Sa klijentom je rekonstruisana hronologija događaja, evidentirani su ciljevi angažovanja i dogovorena lista potrebne dokumentacije.",
        activityDate: atDay(-20, 11),
      },
      {
        type: "EMAIL",
        title: "Primljena dopunska dokumentacija",
        description:
          "Klijent je dostavio ugovore, prepisku i dokaz o uplati. Dokumenti su evidentirani za pravnu analizu.",
        activityDate: atDay(-8, 14),
      },
      {
        type: "PHONE_CALL",
        title: "Dogovor o narednim koracima",
        description:
          "Klijent je obavešten o trenutnom statusu. Potvrđeni su odgovorno lice, prioriteti i naredni procesni rok.",
        activityDate: atDay(-2, 10),
      },
    ];
    for (const activity of activities) {
      const createdActivity = await db.caseActivity.create({
        data: { ...audit, caseId: item.id, source: "MANUAL", ...activity },
      });
      logs.push({
        workspaceId,
        actorUserId: owner.id,
        action: "CASE_ACTIVITY_CREATED",
        occurredAt: createdActivity.activityDate,
        caseId: item.id,
        clientId: item.clientId,
        entityType: "CaseActivity",
        entityId: createdActivity.id,
        metadata: { type: createdActivity.type, title: createdActivity.title },
      });
    }

    const hearingDay = randomInt(5, 12);
    // Exactly one overdue deadline; other deadlines are today or within three weeks.
    const deadline = await create("deadline", {
      title: `Procesni rok - ${title}`,
      description:
        "Krajnji rok za proveru dokaza, internu reviziju podneska i dostavljanje odobrene verzije nadležnom organu.",
      type: i % 4 === 0 ? "COURT" : i % 4 === 1 ? "STATUTORY" : "INTERNAL",
      status: "OPEN",
      responsibleUserId: owner.id,
      caseId: item.id,
      clientId: client.id,
      timeZone: "Europe/Belgrade",
      dueDate: dateOnly(i === 2 ? -1 : i % 4 === 0 ? 0 : randomInt(5, 21)),
      dueAt: null,
      sourceDescription:
        i % 4 === 0
          ? "Rok evidentiran prema nalogu suda i potvrđen pregledom primljenog pismena."
          : "Interni rok kancelarije postavljen pre zvaničnog roka radi kontrole kvaliteta.",
    });
    if (i % 4 === 0)
      await create("deadline", {
        title: `Dostavljanje početne dokumentacije - ${title}`,
        description:
          "Raniji interni rok za prikupljanje punomoćja, identifikacionih podataka i osnovnih dokaza od klijenta.",
        type: "INTERNAL",
        dueDate: dateOnly(-15),
        dueAt: null,
        timeZone: "Europe/Belgrade",
        status: "SATISFIED",
        responsibleUserId: owner.id,
        caseId: item.id,
        clientId: client.id,
        sourceDescription: "Rok definisan na uvodnom sastanku sa klijentom.",
        satisfiedAt: atDay(-16, 14),
        satisfiedByUserId: owner.id,
      });

    // Per case: completed history, present work and three upcoming obligations.
    // Exactly two tasks across the entire seed are overdue.
    const tasks = [
      {
        title: "Pregled i klasifikacija dokumentacije",
        description:
          "Proveriti potpunost spisa, označiti ključne dokaze i evidentirati dokumente koje klijent još treba da dostavi.",
        status: "DONE",
        day: -7,
      },
      {
        title: "Pravna analiza i izbor procesne strategije",
        description:
          "Analizirati relevantne propise i praksu, izdvojiti rizike i pripremiti preporuku za odgovornog advokata.",
        status: "IN_PROGRESS",
        day: i < 2 ? -2 : randomInt(1, 4),
      },
      {
        title: "Priprema nacrta podneska",
        description:
          "Izraditi nacrt, uneti dokazne predloge i proslediti ga na internu reviziju pre procesnog roka.",
        status: "TODO",
        day: randomInt(3, 7),
        deadlineId: deadline.id,
      },
      {
        title: "Potvrda činjenica sa klijentom",
        description:
          "Zakazati kratak poziv, potvrditi sporne činjenice i zabeležiti eventualne izmene zahteva.",
        status: "TODO",
        day: randomInt(5, 10),
        exactTime: 14,
      },
      {
        title: "Priprema za zakazani termin",
        description:
          "Pripremiti hronologiju, pitanja, procesnu belešku i komplet dokumenata za zakazani termin.",
        status: "TODO",
        day: Math.max(1, hearingDay - 1),
      },
    ];
    for (const taskDefinition of tasks) {
      const {
        title: taskTitle,
        description,
        status,
        day,
        deadlineId,
        exactTime,
      } = taskDefinition;
      const task = await create("task", {
        title: `${taskTitle} - ${item.name}`,
        description,
        status,
        priority: day < 0 && status !== "DONE" ? "HIGH" : "NORMAL",
        assigneeUserId: owner.id,
        caseId: item.id,
        clientId: client.id,
        deadlineId: deadlineId ?? null,
        dueDate: exactTime ? null : dateOnly(day),
        dueAt: exactTime ? atDay(day, exactTime) : null,
        completedAt: status === "DONE" ? atDay(-6, 15) : null,
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
          metadata: { title: task.title },
        });
    }
    await create("note", {
      caseId: item.id,
      clientId: client.id,
      type: "CASE_UPDATE",
      occurredAt: atDay(-2),
      body: "Predmet je aktivan. Dokumentacija je uglavnom kompletirana, a otvorena pitanja su označena u radnoj belešci. Slede interna revizija nacrta, potvrda činjenica sa klijentom i praćenje procesnog roka.",
    });
    await create("note", {
      caseId: item.id,
      clientId: client.id,
      type: "CALL_SUMMARY",
      occurredAt: atDay(-5, 13),
      body: "Klijent je telefonom potvrdio hronologiju i saglasio se sa predloženim narednim koracima. Dogovoreno je da preostalu dokumentaciju dostavi elektronskom poštom.",
    });
    const hearing = await event(
      owner,
      "HEARING",
      `Ročište - ${item.name}`,
      hearingDay,
      i < lawyers.length ? 10 : 13,
      item,
      { durationMinutes: 90 },
    );
    await create("note", {
      caseId: item.id,
      clientId: client.id,
      eventId: hearing.id,
      type: "GENERAL",
      occurredAt: atDay(-1, 16),
      body: "Za zakazano ročište proveriti original punomoćja, pripremiti tri primerka priloga i potvrditi dolazak klijenta dan ranije.",
    });
    if (i % 3 === 0)
      await event(
        owner,
        "MEETING",
        `Pripremni sastanak sa klijentom - ${client.displayName}`,
        randomInt(1, 4),
        15,
        item,
        {
          description:
            "Pregled nacrta podneska, potvrda činjenica i priprema klijenta za narednu procesnu radnju.",
          durationMinutes: 45,
        },
      );
  }

  // Every generated persona, including office desk, has useful calendar data.
  // The real bootstrap account is intentionally excluded.
  for (const user of demoUsers) {
    const templates = [
      {
        type: "CALL",
        title: "Završena statusna konsultacija",
        day: -7,
        description:
          "Klijentu je prenet status predmeta i evidentirana su pitanja za naredni period.",
      },
      {
        type: "MEETING",
        title: "Jutarnji sastanak tima",
        day: 0,
        description:
          "Pregled današnjih ročišta, rokova i raspodele hitnih zadataka.",
      },
      {
        type: "MEETING",
        title: "Nedeljni pregled aktivnih predmeta",
        day: randomInt(1, 3),
        description:
          "Kratak pregled napretka, blokera i obaveza koje dospevaju naredne nedelje.",
      },
      {
        type: "CALL",
        title: "Telefonska konsultacija sa klijentom",
        day: randomInt(10, 14),
        description:
          "Termin rezervisan za statusno obaveštenje i prikupljanje dopunskih činjenica.",
        meetingUrl: "https://meet.example/legal-team",
        location: "Online sastanak",
      },
      {
        type: "OTHER",
        title: "Pregled pristigle pošte i dokumentacije",
        day: randomInt(15, 21),
        description:
          "Obrada sudske pošte, evidentiranje novih rokova i raspodela dokumentacije timu.",
      },
    ];
    for (const template of templates)
      await event(
        user,
        template.type,
        template.title,
        template.day,
        randomInt(9, 15),
        null,
        {
          description: template.description,
          meetingUrl: template.meetingUrl,
          location: template.location,
        },
      );
  }
  for (const [index, client] of clients.entries()) {
    const relatedCase = cases.find((item) => item.clientId === client.id);
    const clientActivities = [
      {
        type: "PHONE_CALL",
        title: "Provera kontakt podataka i načina komunikacije",
        description:
          "Potvrđeni su telefon, adresa elektronske pošte, primarni kontakt i poželjan način komunikacije.",
        activityDate: atDay(-12 + (index % 4), 10),
      },
      {
        type: "EMAIL",
        title: "Poslato statusno obaveštenje",
        description:
          "Klijentu je poslat sažetak aktivnih predmeta, narednih rokova i dokumentacije koju treba dostaviti.",
        activityDate: atDay(-4 + (index % 2), 15),
      },
    ];
    for (const activity of clientActivities) {
      const createdActivity = await db.clientActivity.create({
        data: {
          ...audit,
          clientId: client.id,
          relatedCaseId: relatedCase?.id ?? null,
          source: "MANUAL",
          ...activity,
        },
      });
      logs.push({
        workspaceId,
        actorUserId: client.responsibleUserId ?? actorUserId,
        action: "CLIENT_ACTIVITY_CREATED",
        occurredAt: createdActivity.activityDate,
        clientId: client.id,
        entityType: "ClientActivity",
        entityId: createdActivity.id,
        metadata: { type: createdActivity.type, title: createdActivity.title },
      });
    }
  }
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
    `Created ${cases.length} detailed cases, ${counters.tasks} tasks, ${counters.deadlines} deadlines, ` +
      `${counters.notes} notes and ${counters.events} events. Exactly 3 overdue obligations.`,
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
        const demoUsers = await ensureUsers(db, workspaceId);
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
        const demoActor = demoUsers[0];
        const demoLawyers = demoUsers.slice(0, -1);
        const refs = await ensureReferences(db, workspaceId, demoActor.id);
        const clients = await ensureClients(
          db,
          workspaceId,
          demoActor.id,
          demoLawyers,
          refs.tag,
        );
        await seedWork(db, workspaceId, demoUsers, clients, refs);
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
