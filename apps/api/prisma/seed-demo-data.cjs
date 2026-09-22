// Populates the bootstrap workspace with realistic Serbian demo/test data:
// extra lawyer/staff logins, clients, cases, events, tasks, deadlines, and notes.
// Run `npm run db:seed:auth` first, then `npm run db:seed:demo`.
const { PrismaClient } = require("@prisma/client");
const { randomBytes, scryptSync } = require("node:crypto");

const TODAY = new Date("2026-09-19T09:00:00.000Z");
const YEAR_END = new Date("2026-12-31T23:59:59.000Z");
const YEAR_START = new Date("2026-01-10T09:00:00.000Z");
const FALLBACK_PASSWORD = "!QAZ2wsx!QAZ2wsx";

function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const key = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${key}`;
}

// Deterministic PRNG (mulberry32) so re-running the script is reproducible.
function createRandom(seed) {
  let state = seed;
  return function random() {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const random = createRandom(20260919);

function pick(list) {
  return list[Math.floor(random() * list.length)];
}
function pickMany(list, count) {
  const pool = [...list];
  const result = [];
  while (pool.length && result.length < count) {
    result.push(pool.splice(Math.floor(random() * pool.length), 1)[0]);
  }
  return result;
}
function randomInt(min, max) {
  return min + Math.floor(random() * (max - min + 1));
}
function dateBetween(start, end) {
  return new Date(
    start.getTime() + random() * (end.getTime() - start.getTime()),
  );
}
function toDateOnly(date) {
  return date.toISOString().slice(0, 10);
}
function pad(num) {
  return String(num).padStart(3, "0");
}

const CASE_TYPES = [
  "Parnica",
  "Krivični postupak",
  "Privredni spor",
  "Radni spor",
  "Nasleđivanje",
  "Nepokretnosti",
];
const PRACTICE_AREAS = [
  "Građansko pravo",
  "Krivično pravo",
  "Privredno pravo",
  "Radno pravo",
  "Porodično pravo",
  "Pravo nekretnina",
];
const TAG_NAMES = [
  "Hitno",
  "VIP klijent",
  "Pro bono",
  "Naplata u kašnjenju",
  "Strani klijent",
  "Medijacija",
];

// Suffix 2-9 personas, matched to AUTH_BOOTSTRAP_EMAIL{n}/AUTH_BOOTSTRAP_PASSWORD{n}
// when the operator has set them, otherwise a deterministic fallback login.
const PERSONAS = [
  {
    suffix: 2,
    firstName: "Milica",
    lastName: "Jovanović",
    gender: "FEMALE",
    jobTitle: "Advokat ortak",
    role: "ADMIN",
  },
  {
    suffix: 3,
    firstName: "Nikola",
    lastName: "Petrović",
    gender: "MALE",
    jobTitle: "Advokat",
    role: "LAWYER",
  },
  {
    suffix: 4,
    firstName: "Ana",
    lastName: "Simić",
    gender: "FEMALE",
    jobTitle: "Advokat",
    role: "LAWYER",
  },
  {
    suffix: 5,
    firstName: "Stefan",
    lastName: "Nikolić",
    gender: "MALE",
    jobTitle: "Advokat",
    role: "LAWYER",
  },
  {
    suffix: 6,
    firstName: "Jelena",
    lastName: "Kostić",
    gender: "FEMALE",
    jobTitle: "Advokatski pripravnik",
    role: "LAWYER",
  },
  {
    suffix: 7,
    firstName: "Miloš",
    lastName: "Đorđević",
    gender: "MALE",
    jobTitle: "Advokatski pripravnik",
    role: "LAWYER",
  },
  {
    suffix: 8,
    firstName: "Tamara",
    lastName: "Ilić",
    gender: "FEMALE",
    jobTitle: "Pravni asistent",
    role: "MEMBER",
  },
  {
    suffix: 9,
    firstName: "Vladimir",
    lastName: "Marković",
    gender: "MALE",
    jobTitle: "Office menadžer",
    role: "MEMBER",
  },
];

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
const CASE_ACTIVITY_TEMPLATES = [
  {
    type: "MEETING",
    title: "Sastanak sa klijentom",
    description: "Razgovor o toku predmeta i narednim koracima.",
  },
  {
    type: "PHONE_CALL",
    title: "Telefonski poziv sa klijentom",
    description: "Ažuriranje klijenta o statusu predmeta.",
  },
  {
    type: "EMAIL",
    title: "Razmena dokumentacije putem e-pošte",
    description: "Poslata dodatna dokumentacija sudu/klijentu.",
  },
  {
    type: "NOTE",
    title: "Interna beleška",
    description: "Beleška o strategiji zastupanja.",
  },
  {
    type: "OTHER",
    title: "Pregled sudske prakse",
    description: "Analiza relevantne sudske prakse za predmet.",
  },
];
const CLIENT_ACTIVITY_TEMPLATES = [
  {
    type: "PHONE_CALL",
    title: "Poziv radi provere podataka",
    description: "Ažurirani kontakt podaci klijenta.",
  },
  {
    type: "MEETING",
    title: "Uvodni sastanak",
    description: "Upoznavanje sa potrebama klijenta.",
  },
  {
    type: "EMAIL",
    title: "Poslat predlog angažovanja",
    description: "Klijentu poslat predlog uslova zastupanja.",
  },
];
const TASK_TITLE_TEMPLATES = [
  "Priprema podneska sudu",
  "Pregled dokumentacije klijenta",
  "Poziv klijentu radi ažuriranja",
  "Priprema za ročište",
  "Sastavljanje ugovora",
  "Provera roka za žalbu",
  "Usklađivanje dokaznog materijala",
  "Priprema punomoćja",
  "Analiza sudske prakse",
  "Priprema odgovora na tužbu",
  "Prevod dokumentacije",
  "Overa dokumenata kod javnog beležnika",
];
const DEADLINE_TITLE_TEMPLATES = [
  { type: "COURT", title: "Rok za podnošenje žalbe" },
  { type: "COURT", title: "Rok za odgovor na tužbu" },
  { type: "STATUTORY", title: "Zastarelost potraživanja" },
  {
    type: "STATUTORY",
    title: "Rok za prijavu potraživanja u stečajnom postupku",
  },
  { type: "CONTRACTUAL", title: "Rok po ugovoru o zastupanju" },
  { type: "CONTRACTUAL", title: "Rok za isporuku po ugovoru" },
  { type: "INTERNAL", title: "Interni rok za pripremu predmeta" },
  { type: "OTHER", title: "Rok za uplatu sudske takse" },
];
const EVENT_TEMPLATES = [
  { type: "HEARING", title: "Ročište" },
  { type: "HEARING", title: "Pripremno ročište" },
  { type: "MEETING", title: "Sastanak sa klijentom" },
  { type: "MEETING", title: "Interni sastanak tima" },
  { type: "CALL", title: "Telefonska konsultacija" },
  { type: "CALL", title: "Poziv radi usaglašavanja strategije" },
  { type: "OTHER", title: "Uviđaj" },
  { type: "OTHER", title: "Dostava dokumentacije" },
];
const NOTE_TEMPLATES = [
  {
    type: "GENERAL",
    body: "Opšta beleška o statusu predmeta i narednim koracima.",
  },
  { type: "CALL_SUMMARY", body: "Rezime telefonskog razgovora sa klijentom." },
  {
    type: "MEETING_SUMMARY",
    body: "Rezime sastanka: dogovorene su naredne aktivnosti i rokovi.",
  },
  {
    type: "CASE_UPDATE",
    body: "Ažuriranje statusa predmeta nakon poslednje aktivnosti.",
  },
];

function localPart(firstName, lastName) {
  return `${firstName}.${lastName}`
    .toLowerCase()
    .replace(/š/g, "s")
    .replace(/đ/g, "dj")
    .replace(/č/g, "c")
    .replace(/ć/g, "c")
    .replace(/ž/g, "z");
}
function slugify(word) {
  return word
    .toLowerCase()
    .replace(/š/g, "s")
    .replace(/đ/g, "dj")
    .replace(/č/g, "c")
    .replace(/ć/g, "c")
    .replace(/ž/g, "z")
    .replace(/[^a-z0-9]/g, "");
}

async function ensureUsers(prisma, workspaceId) {
  const adminEmail = process.env.AUTH_BOOTSTRAP_EMAIL?.trim().toLowerCase();
  if (!adminEmail) {
    throw new Error(
      "AUTH_BOOTSTRAP_EMAIL is not set. Run `npm run db:seed:auth` first.",
    );
  }
  const admin = await prisma.user.findUnique({ where: { email: adminEmail } });
  if (!admin) {
    throw new Error(
      `No user found for ${adminEmail}. Run \`npm run db:seed:auth\` first.`,
    );
  }
  if (!admin.firstName) {
    await prisma.user.update({
      where: { id: admin.id },
      data: {
        firstName: "Vlasnik",
        lastName: "Kancelarije",
        jobTitle: "Advokat",
      },
    });
  }

  const users = [admin];
  for (const persona of PERSONAS) {
    const envEmail = process.env[`AUTH_BOOTSTRAP_EMAIL${persona.suffix}`];
    const envPassword = process.env[`AUTH_BOOTSTRAP_PASSWORD${persona.suffix}`];
    const email = (
      envEmail ||
      `${localPart(persona.firstName, persona.lastName)}@example.test`
    )
      .trim()
      .toLowerCase();
    const rawPassword =
      envPassword && envPassword.length >= 12
        ? envPassword
        : process.env.AUTH_BOOTSTRAP_PASSWORD &&
            process.env.AUTH_BOOTSTRAP_PASSWORD.length >= 12
          ? process.env.AUTH_BOOTSTRAP_PASSWORD
          : FALLBACK_PASSWORD;

    let user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      user = await prisma.user.create({
        data: {
          email,
          passwordHash: hashPassword(rawPassword),
          firstName: persona.firstName,
          lastName: persona.lastName,
          gender: persona.gender,
          jobTitle: persona.jobTitle,
          status: "ACTIVE",
          passwordChangedAt: new Date(),
        },
      });
    } else if (!user.firstName) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          firstName: persona.firstName,
          lastName: persona.lastName,
          gender: persona.gender,
          jobTitle: persona.jobTitle,
        },
      });
    }

    await prisma.workspaceMember.upsert({
      where: { userId_workspaceId: { userId: user.id, workspaceId } },
      update: { role: persona.role, status: "ACTIVE" },
      create: {
        userId: user.id,
        workspaceId,
        role: persona.role,
        status: "ACTIVE",
      },
    });
    users.push(user);
    console.log(`Demo user ready: ${email}`);
  }
  return users;
}

async function ensureReferenceData(prisma, workspaceId, actorUserId) {
  const caseTypes = [];
  for (const name of CASE_TYPES) {
    caseTypes.push(
      await prisma.caseType.upsert({
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
  const practiceAreas = [];
  for (const name of PRACTICE_AREAS) {
    practiceAreas.push(
      await prisma.practiceArea.upsert({
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
  const tags = [];
  for (const name of TAG_NAMES) {
    tags.push(
      await prisma.tag.upsert({
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
  return { caseTypes, practiceAreas, tags };
}

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

async function ensureCases(
  prisma,
  workspaceId,
  actorUserId,
  clients,
  lawyers,
  refData,
) {
  const statuses = [
    "DRAFT",
    "DRAFT",
    "DRAFT",
    "ACTIVE",
    "ACTIVE",
    "ACTIVE",
    "ACTIVE",
    "ACTIVE",
    "ACTIVE",
    "ACTIVE",
    "ACTIVE",
    "ACTIVE",
    "ON_HOLD",
    "ON_HOLD",
    "ON_HOLD",
    "CLOSED",
    "CLOSED",
    "ARCHIVED",
  ];
  const cases = [];
  for (let i = 0; i < CASE_TITLE_TEMPLATES.length; i++) {
    const status = statuses[i % statuses.length];
    const client = clients[i % clients.length];
    const responsible = pick(lawyers);
    const caseNumber = `P-2026-${pad(i + 1)}`;
    const openedDate = dateBetween(
      new Date("2025-11-01"),
      new Date("2026-08-15"),
    );
    const isClosedLike = status === "CLOSED" || status === "ARCHIVED";
    const caseTags = random() < 0.35 ? pickMany(refData.tags, 1) : [];
    const item = await prisma.case.upsert({
      where: { workspaceId_caseNumber: { workspaceId, caseNumber } },
      update: {},
      create: {
        workspaceId,
        caseNumber,
        clientId: client.id,
        name: `${CASE_TITLE_TEMPLATES[i]} - ${client.displayName}`,
        description: `Predmet: ${CASE_TITLE_TEMPLATES[i]} za klijenta ${client.displayName}.`,
        caseTypeId: pick(refData.caseTypes).id,
        practiceAreaId: pick(refData.practiceAreas).id,
        status,
        priority: pick(["LOW", "NORMAL", "NORMAL", "HIGH", "URGENT"]),
        responsibleUserId: responsible.id,
        openedDate,
        closedDate: isClosedLike ? dateBetween(openedDate, TODAY) : null,
        closingNote: isClosedLike
          ? "Predmet zaključen po dogovoru sa klijentom."
          : null,
        createdByUserId: actorUserId,
        updatedByUserId: actorUserId,
        tags: caseTags.length
          ? { create: caseTags.map((tag) => ({ tagId: tag.id })) }
          : undefined,
      },
    });
    cases.push(item);

    await prisma.caseResponsibility.create({
      data: {
        workspaceId,
        caseId: item.id,
        userId: responsible.id,
        isPrimary: true,
        startedAt: openedDate,
        createdByUserId: actorUserId,
        updatedByUserId: actorUserId,
      },
    });
    if (i % 2 === 0) {
      const secondary = pick(lawyers.filter((u) => u.id !== responsible.id));
      await prisma.caseResponsibility.create({
        data: {
          workspaceId,
          caseId: item.id,
          userId: secondary.id,
          isPrimary: false,
          startedAt: openedDate,
          createdByUserId: actorUserId,
          updatedByUserId: actorUserId,
        },
      });
    }

    for (let a = 0; a < 2; a++) {
      const template = pick(CASE_ACTIVITY_TEMPLATES);
      await prisma.caseActivity.create({
        data: {
          workspaceId,
          caseId: item.id,
          type: template.type,
          title: template.title,
          description: template.description,
          activityDate: dateBetween(
            openedDate,
            isClosedLike ? (item.closedDate ?? TODAY) : TODAY,
          ),
          source: "MANUAL",
          createdByUserId: actorUserId,
          updatedByUserId: actorUserId,
        },
      });
    }
  }
  return cases;
}

async function ensureClientActivities(
  prisma,
  workspaceId,
  actorUserId,
  clients,
) {
  for (const client of clients) {
    const template = pick(CLIENT_ACTIVITY_TEMPLATES);
    await prisma.clientActivity.create({
      data: {
        workspaceId,
        clientId: client.id,
        type: template.type,
        title: template.title,
        description: template.description,
        activityDate: dateBetween(new Date("2026-01-15"), TODAY),
        source: "MANUAL",
        createdByUserId: actorUserId,
        updatedByUserId: actorUserId,
      },
    });
  }
}

// Spreads generated items across an overdue/today/upcoming distribution so
// every work-tracking filter (overdue, today, upcoming, history) has data.
function buildScheduleBuckets(
  count,
  { overdueShare, todayShare, futureRatioToYearEnd },
) {
  const overdueCount = Math.round(count * overdueShare);
  const todayCount = Math.round(count * todayShare);
  const futureCount = count - overdueCount - todayCount;
  const buckets = [];
  for (let i = 0; i < overdueCount; i++) buckets.push("OVERDUE");
  for (let i = 0; i < todayCount; i++) buckets.push("TODAY");
  for (let i = 0; i < futureCount; i++) {
    buckets.push(random() < futureRatioToYearEnd ? "LATE_YEAR" : "NEAR_FUTURE");
  }
  return buckets;
}

function dateForBucket(bucket) {
  switch (bucket) {
    case "OVERDUE":
      return dateBetween(new Date("2026-08-01"), new Date("2026-09-18"));
    case "TODAY":
      return new Date(TODAY);
    case "NEAR_FUTURE":
      return dateBetween(new Date("2026-09-20"), new Date("2026-10-31"));
    case "LATE_YEAR":
    default:
      return dateBetween(new Date("2026-11-01"), YEAR_END);
  }
}

async function ensureEvents(
  prisma,
  workspaceId,
  actorUserId,
  cases,
  clients,
  lawyers,
) {
  const activityLogRows = [];
  const buckets = buildScheduleBuckets(48, {
    overdueShare: 0.2,
    todayShare: 0.05,
    futureRatioToYearEnd: 0.5,
  });

  for (let i = 0; i < buckets.length; i++) {
    const bucket = buckets[i];
    const isPast = bucket === "OVERDUE";
    const template = pick(EVENT_TEMPLATES);
    const linkedCase = random() < 0.7 ? pick(cases) : null;
    const client = linkedCase
      ? clients.find((c) => c.id === linkedCase.clientId)
      : random() < 0.5
        ? pick(clients)
        : null;
    const organizer = pick(lawyers);
    const assignees = pickMany(lawyers, randomInt(1, 2));
    const startsAt = isPast
      ? dateBetween(YEAR_START, new Date("2026-09-18"))
      : dateForBucket(bucket);
    startsAt.setUTCHours(randomInt(8, 15), pick([0, 15, 30, 45]), 0, 0);
    const endsAt = new Date(startsAt.getTime() + randomInt(30, 90) * 60000);
    const status = isPast
      ? pick(["COMPLETED", "COMPLETED", "COMPLETED", "CANCELLED"])
      : "SCHEDULED";
    const isHearing = template.type === "HEARING";

    const event = await prisma.event.create({
      data: {
        workspaceId,
        type: template.type,
        title: linkedCase
          ? `${template.title} - ${linkedCase.name}`
          : template.title,
        description: `${template.title} u vezi sa ${client ? client.displayName : "internim aktivnostima kancelarije"}.`,
        startsAt,
        endsAt,
        timeZone: "Europe/Belgrade",
        isAllDay: false,
        status,
        location: isHearing
          ? pick(COURTS)
          : template.type === "MEETING"
            ? "Kancelarija"
            : null,
        meetingUrl:
          template.type === "CALL" ? "https://meet.example.test/poziv" : null,
        courtName: isHearing ? pick(COURTS) : null,
        courtroom: isHearing ? `Sudnica ${randomInt(1, 12)}` : null,
        organizerUserId: organizer.id,
        caseId: linkedCase ? linkedCase.id : null,
        createdByUserId: actorUserId,
        assignees: {
          create: assignees.map((u) => ({ userId: u.id, workspaceId })),
        },
        clients: client
          ? { create: [{ clientId: client.id, workspaceId }] }
          : undefined,
      },
    });

    activityLogRows.push({
      workspaceId,
      action: "EVENT_CREATED",
      actorUserId,
      occurredAt: event.createdAt,
      caseId: event.caseId,
      entityType: "Event",
      entityId: event.id,
    });
    if (status === "COMPLETED") {
      activityLogRows.push({
        workspaceId,
        action: "EVENT_COMPLETED",
        actorUserId: organizer.id,
        occurredAt: endsAt,
        caseId: event.caseId,
        entityType: "Event",
        entityId: event.id,
      });
    } else if (status === "CANCELLED") {
      activityLogRows.push({
        workspaceId,
        action: "EVENT_CANCELLED",
        actorUserId: organizer.id,
        occurredAt: startsAt,
        caseId: event.caseId,
        entityType: "Event",
        entityId: event.id,
      });
    }
  }
  return activityLogRows;
}

async function ensureTasks(
  prisma,
  workspaceId,
  actorUserId,
  cases,
  clients,
  lawyers,
) {
  const activityLogRows = [];
  const buckets = buildScheduleBuckets(46, {
    overdueShare: 0.15,
    todayShare: 0.08,
    futureRatioToYearEnd: 0.45,
  });

  for (let i = 0; i < buckets.length; i++) {
    const bucket = buckets[i];
    const isPast = bucket === "OVERDUE" && random() < 0.4; // some overdue stay open, some are historical
    const linkedCase = random() < 0.75 ? pick(cases) : null;
    const client = linkedCase
      ? clients.find((c) => c.id === linkedCase.clientId)
      : random() < 0.3
        ? pick(clients)
        : null;
    const assignee = pick(lawyers);
    const useTimestamp = random() < 0.4;
    const dueDate = isPast
      ? dateBetween(new Date("2026-07-01"), new Date("2026-09-10"))
      : dateForBucket(bucket);
    const status = isPast
      ? pick(["DONE", "DONE", "CANCELLED"])
      : bucket === "OVERDUE"
        ? "TODO"
        : pick(["TODO", "TODO", "IN_PROGRESS"]);
    const isDone = status === "DONE";

    const task = await prisma.task.create({
      data: {
        workspaceId,
        title: linkedCase
          ? `${pick(TASK_TITLE_TEMPLATES)} - ${linkedCase.name}`
          : pick(TASK_TITLE_TEMPLATES),
        description: `Zadatak vezan za ${client ? client.displayName : "interne aktivnosti kancelarije"}.`,
        status,
        priority: pick(["LOW", "NORMAL", "NORMAL", "HIGH", "URGENT"]),
        assigneeUserId: assignee.id,
        dueDate: useTimestamp
          ? null
          : new Date(`${toDateOnly(dueDate)}T00:00:00.000Z`),
        dueAt: useTimestamp ? dueDate : null,
        caseId: linkedCase ? linkedCase.id : null,
        clientId: !linkedCase && client ? client.id : null,
        completedAt: isDone ? dueDate : null,
        completedByUserId: isDone ? assignee.id : null,
        createdByUserId: actorUserId,
      },
    });

    activityLogRows.push({
      workspaceId,
      action: "TASK_CREATED",
      actorUserId,
      occurredAt: task.createdAt,
      caseId: task.caseId,
      clientId: task.clientId,
      entityType: "Task",
      entityId: task.id,
    });
    if (status === "DONE" || status === "CANCELLED") {
      activityLogRows.push({
        workspaceId,
        action: `TASK_${status}`,
        actorUserId: assignee.id,
        occurredAt: dueDate,
        caseId: task.caseId,
        clientId: task.clientId,
        entityType: "Task",
        entityId: task.id,
      });
    }
  }
  return activityLogRows;
}

async function ensureDeadlines(
  prisma,
  workspaceId,
  actorUserId,
  cases,
  clients,
  lawyers,
) {
  const activityLogRows = [];
  const buckets = buildScheduleBuckets(26, {
    overdueShare: 0.2,
    todayShare: 0.08,
    futureRatioToYearEnd: 0.5,
  });

  for (let i = 0; i < buckets.length; i++) {
    const bucket = buckets[i];
    const isHistorical = bucket === "OVERDUE" && random() < 0.35;
    const linkedCase = random() < 0.8 ? pick(cases) : null;
    const client = linkedCase
      ? clients.find((c) => c.id === linkedCase.clientId)
      : random() < 0.3
        ? pick(clients)
        : null;
    const responsible = pick(lawyers);
    const template = pick(DEADLINE_TITLE_TEMPLATES);
    const useTimestamp = random() < 0.3;
    const dueDate = isHistorical
      ? dateBetween(new Date("2026-06-01"), new Date("2026-09-05"))
      : dateForBucket(bucket);
    const status = isHistorical
      ? pick(["SATISFIED", "SATISFIED", "CANCELLED"])
      : "OPEN";
    const isSatisfied = status === "SATISFIED";

    const deadline = await prisma.deadline.create({
      data: {
        workspaceId,
        title: linkedCase
          ? `${template.title} - ${linkedCase.name}`
          : template.title,
        description: `Rok vezan za ${client ? client.displayName : "internu obavezu kancelarije"}.`,
        type: template.type,
        dueDate: useTimestamp
          ? null
          : new Date(`${toDateOnly(dueDate)}T00:00:00.000Z`),
        dueAt: useTimestamp ? dueDate : null,
        timeZone: "Europe/Belgrade",
        status,
        responsibleUserId: responsible.id,
        caseId: linkedCase ? linkedCase.id : null,
        clientId: !linkedCase && client ? client.id : null,
        sourceDescription: "Uneto ručno na osnovu procene predmeta.",
        satisfiedAt: isSatisfied ? dueDate : null,
        satisfiedByUserId: isSatisfied ? responsible.id : null,
        createdByUserId: actorUserId,
      },
    });

    activityLogRows.push({
      workspaceId,
      action: "DEADLINE_CREATED",
      actorUserId,
      occurredAt: deadline.createdAt,
      caseId: deadline.caseId,
      clientId: deadline.clientId,
      entityType: "Deadline",
      entityId: deadline.id,
    });
    if (status === "SATISFIED" || status === "CANCELLED") {
      activityLogRows.push({
        workspaceId,
        action: `DEADLINE_${status}`,
        actorUserId: responsible.id,
        occurredAt: dueDate,
        caseId: deadline.caseId,
        clientId: deadline.clientId,
        entityType: "Deadline",
        entityId: deadline.id,
      });
    }
  }
  return activityLogRows;
}

async function ensureNotes(prisma, workspaceId, actorUserId, cases, clients) {
  const activityLogRows = [];
  for (let i = 0; i < 22; i++) {
    const template = pick(NOTE_TEMPLATES);
    const linkedCase = random() < 0.7 ? pick(cases) : null;
    const client = linkedCase
      ? clients.find((c) => c.id === linkedCase.clientId)
      : pick(clients);
    const occurredAt = dateBetween(new Date("2026-02-01"), TODAY);
    const note = await prisma.note.create({
      data: {
        workspaceId,
        type: template.type,
        body: `${template.body} (${client ? client.displayName : "opšta napomena"})`,
        occurredAt,
        caseId: linkedCase ? linkedCase.id : null,
        clientId: !linkedCase && client ? client.id : null,
        createdByUserId: actorUserId,
      },
    });
    activityLogRows.push({
      workspaceId,
      action: "NOTE_CREATED",
      actorUserId,
      occurredAt: note.createdAt,
      caseId: note.caseId,
      clientId: note.clientId,
      entityType: "Note",
      entityId: note.id,
      metadata: { type: note.type },
    });
  }
  return activityLogRows;
}

async function main() {
  const prisma = new PrismaClient();
  try {
    const workspaceId =
      process.env.AUTH_BOOTSTRAP_WORKSPACE_ID ??
      "11111111-1111-4111-a111-111111111111";
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
    });
    if (!workspace) {
      throw new Error(
        `Workspace ${workspaceId} not found. Run \`npm run db:seed:auth\` first.`,
      );
    }

    await prisma.storageConnection.upsert({
      where: {
        workspaceId_configRef: {
          workspaceId,
          configRef: "local-default",
        },
      },
      update: { enabled: true, isDefault: true, providerType: "LOCAL" },
      create: {
        workspaceId,
        providerType: "LOCAL",
        enabled: true,
        isDefault: true,
        configRef: "local-default",
      },
    });

    const users = await ensureUsers(prisma, workspaceId);
    const adminUser = users[0];
    const lawyers = users; // include admin in the assignable pool too

    const refData = await ensureReferenceData(
      prisma,
      workspaceId,
      adminUser.id,
    );
    const clients = await ensureClients(
      prisma,
      workspaceId,
      adminUser.id,
      lawyers,
      refData.tags,
    );
    const cases = await ensureCases(
      prisma,
      workspaceId,
      adminUser.id,
      clients,
      lawyers,
      refData,
    );
    await ensureClientActivities(prisma, workspaceId, adminUser.id, clients);

    const marker = await prisma.activityLog.findFirst({
      where: { workspaceId, action: "DEMO_SEED_COMPLETED" },
    });
    if (marker) {
      console.log(
        "Demo work-item data already seeded (events/tasks/deadlines/notes) — skipping to avoid duplicates.",
      );
      console.log(
        "Delete existing Events/Tasks/Deadlines/Notes/ActivityLog rows to reseed them.",
      );
      return;
    }

    const activityLogRows = [
      ...(await ensureEvents(
        prisma,
        workspaceId,
        adminUser.id,
        cases,
        clients,
        lawyers,
      )),
      ...(await ensureTasks(
        prisma,
        workspaceId,
        adminUser.id,
        cases,
        clients,
        lawyers,
      )),
      ...(await ensureDeadlines(
        prisma,
        workspaceId,
        adminUser.id,
        cases,
        clients,
        lawyers,
      )),
      ...(await ensureNotes(prisma, workspaceId, adminUser.id, cases, clients)),
    ];
    activityLogRows.push({
      workspaceId,
      action: "DEMO_SEED_COMPLETED",
      actorUserId: adminUser.id,
      occurredAt: new Date(),
      entityType: "DemoSeed",
      entityId: "demo-seed-marker",
    });
    await prisma.activityLog.createMany({ data: activityLogRows });

    console.log(
      `Seeded ${clients.length} clients, ${cases.length} cases, and work items through ${YEAR_END.toISOString().slice(0, 10)}.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
