// Demo seed for "Advokatska kancelarija Stojković i partneri".
// Run db:seed:auth first, then this script (db:seed:demo-stojkovic).
// Everything is in Serbian (Latin script). Activity is concentrated in
// September and October 2026; statuses are derived from the current time
// (Europe/Belgrade). The data part runs once per workspace (marker
// DEMO_SEED_STOJKOVIC_COMPLETED); reruns only refresh personas, user settings
// and organization settings. Nothing is ever deleted.
process.env.TZ = "Europe/Belgrade";
const { PrismaClient } = require("@prisma/client");
const { randomUUID } = require("node:crypto");
const { upsertPersonas } = require("./demo-personas.cjs");

const NOW = new Date();
const TZ = "Europe/Belgrade";
const MARKER = "DEMO_SEED_STOJKOVIC_COMPLETED";
const PERIOD_START = "2026-09-01";
const PERIOD_END = "2026-10-31";

// ------------------------------------------------------------------ helpers

let rngState = 20261009;
function random() {
  rngState |= 0;
  rngState = (rngState + 0x6d2b79f5) | 0;
  let t = Math.imul(rngState ^ (rngState >>> 15), 1 | rngState);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const randomInt = (min, max) => min + Math.floor(random() * (max - min + 1));
const pick = (items) => items[randomInt(0, items.length - 1)];
const chance = (p) => random() < p;
function shuffle(items) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = randomInt(0, i);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
function weighted(options) {
  const total = options.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = random() * total;
  for (const [value, weight] of options) {
    roll -= weight;
    if (roll < 0) return value;
  }
  return options[options.length - 1][0];
}

function local(iso, hour = 0, minute = 0) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d, hour, minute, 0, 0);
}
function ymd(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
// Prisma @db.Date values are midnight UTC of the intended calendar day.
const dateOnly = (iso) => new Date(`${iso}T00:00:00.000Z`);
function addDays(iso, days) {
  const date = local(iso);
  date.setDate(date.getDate() + days);
  return ymd(date);
}
const addMinutes = (date, minutes) =>
  new Date(date.getTime() + minutes * 60000);
const daysBetween = (fromIso, toIso) =>
  Math.round((local(toIso, 12) - local(fromIso, 12)) / 86400000);
const clampPast = (date) => (date > NOW ? new Date(NOW) : date);
const maxIso = (a, b) => (a > b ? a : b);
const minIso = (a, b) => (a < b ? a : b);
const TODAY = ymd(NOW);
const isWeekend = (iso) => [0, 6].includes(local(iso).getDay());
function workdays(fromIso, toIso) {
  const days = [];
  for (let iso = fromIso; iso <= toIso; iso = addDays(iso, 1))
    if (!isWeekend(iso)) days.push(iso);
  return days;
}
const WORKDAYS = workdays(PERIOD_START, PERIOD_END);
const toCents = (amount) => Math.round(amount * 100);
const centsToMoney = (cents) => (cents / 100).toFixed(2);
const formatDuration = (minutes) =>
  `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
const formatDate = (iso) => {
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}.`;
};
function slug(value) {
  return value
    .toLowerCase()
    .replace(/đ/g, "dj")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.|\.$/g, "");
}

function jmbg(birthIso, region, serial) {
  const [y, m, d] = birthIso.split("-");
  const base = `${d}${m}${y.slice(1)}${String(region).padStart(2, "0")}${String(serial).padStart(3, "0")}`;
  const a = base.split("").map(Number);
  const sum =
    7 * (a[0] + a[6]) +
    6 * (a[1] + a[7]) +
    5 * (a[2] + a[8]) +
    4 * (a[3] + a[9]) +
    3 * (a[4] + a[10]) +
    2 * (a[5] + a[11]);
  let control = 11 - (sum % 11);
  if (control > 9) control = 0;
  return `${base}${control}`;
}
// Serbian PIB: eight digits plus an ISO 7064 MOD 11,10 control digit.
function pib(base8) {
  let p = 10;
  for (const digit of base8) {
    p = (p + Number(digit)) % 10;
    if (p === 0) p = 10;
    p = (p * 2) % 11;
  }
  return `${base8}${(11 - p) % 10}`;
}
// Domestic account number bank-account-control with MOD 97 control digits.
function accountNumber(bank, account) {
  const body = `${bank}${String(account).padStart(13, "0")}`;
  const control = 98n - ((BigInt(body) * 100n) % 97n);
  return `${bank}-${String(account).padStart(13, "0")}-${String(control).padStart(2, "0")}`;
}

// --------------------------------------------------------------- reference

const CASE_TYPES = [
  ["Parnica", "Građanski parnični postupak pred sudom opšte nadležnosti."],
  ["Krivični postupak", "Odbrana i zastupanje oštećenih u krivičnom postupku."],
  [
    "Privredni spor",
    "Sporovi između privrednih subjekata i naplata poslovnih potraživanja.",
  ],
  ["Radni spor", "Postupci iz radnog odnosa, otkaz i naknada štete."],
  ["Nasleđivanje", "Ostavinski postupci i sporovi naslednika."],
  ["Nepokretnosti", "Svojinski, zakupni i katastarski poslovi."],
  ["Porodični spor", "Razvod braka, vršenje roditeljskog prava i izdržavanje."],
  [
    "Izvršni postupak",
    "Prinudna naplata potraživanja pred javnim izvršiteljem i sudom.",
  ],
  ["Upravni postupak", "Postupci pred organima uprave i upravni sporovi."],
  ["Prekršajni postupak", "Zastupanje pred prekršajnim sudovima."],
  [
    "Savetodavni predmet",
    "Pravno savetovanje, ugovori i usklađivanje poslovanja bez sudskog postupka.",
  ],
];
const PRACTICE_AREAS = [
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
  [
    "Upravno pravo",
    "Dozvole, inspekcijski nadzor, javne nabavke i upravni sporovi.",
  ],
  [
    "Pravo intelektualne svojine",
    "Žigovi, autorska prava i licenciranje softvera.",
  ],
  [
    "IT i zaštita podataka",
    "Zaštita podataka o ličnosti, IT ugovori i usklađenost.",
  ],
];
const TAGS = [
  ["Hitno", "#DC2626"],
  ["VIP klijent", "#7C3AED"],
  ["Pro bono", "#0284C7"],
  ["Naplata u kašnjenju", "#D97706"],
  ["Strani klijent", "#059669"],
  ["Medijacija", "#4F46E5"],
];
const CATEGORIES = [
  "Savetovanje i konsultacije",
  "Izrada podnesaka",
  "Zastupanje pred sudom",
  "Izrada i pregled ugovora",
  "Korporativni poslovi",
  "Pregovori",
  "Due diligence",
  "Upravni postupci",
  "Administracija i korespondencija",
];
const [SAV, POD, ZAS, UGO, KOR, PRE, DUE, UPR, ADM] = CATEGORIES;

const COURTS = {
  "Prvi osnovni sud u Beogradu": "Bulevar Mihajla Pupina 16, Novi Beograd",
  "Drugi osnovni sud u Beogradu": "Katanićeva 15, Beograd",
  "Treći osnovni sud u Beogradu": "Bulevar Mihajla Pupina 16, Novi Beograd",
  "Viši sud u Beogradu": "Savska 17a, Beograd",
  "Privredni sud u Beogradu": "Masarikova 2, Beograd",
  "Upravni sud": "Nemanjina 9, Beograd",
  "Osnovni sud u Novom Sadu": "Sutjeska 3, Novi Sad",
  "Privredni sud u Novom Sadu": "Sutjeska 3, Novi Sad",
  "Osnovni sud u Nišu": "Vojvode Putnika bb, Niš",
  "Osnovni sud u Kragujevcu": "Trg Vojvode Radomira Putnika 3, Kragujevac",
  "Privredni sud u Kragujevcu": "Trg Vojvode Radomira Putnika 3, Kragujevac",
  "Osnovni sud u Čačku": "Železnička 1, Čačak",
  "Osnovni sud u Subotici": "Trg Lazara Nešića 1, Subotica",
  "Osnovni sud u Valjevu": "Karađorđeva 48, Valjevo",
  "Prekršajni sud u Pančevu": "Svetozara Miletića 2, Pančevo",
};
const NOTARIES = [
  "Jelena Marić, Terazije 5, Beograd",
  "Nenad Popović, Kralja Milana 31, Beograd",
  "Svetlana Đokić, Bulevar oslobođenja 69, Novi Sad",
];
const WRITE_OFF_REASONS = [
  "Interna greška – rad je ponovljen, ne naplaćuje se klijentu.",
  "Po dogovoru sa klijentom rad nije fakturabilan.",
  "Prekoračenje procene – otpisano kao gest dobre volje.",
  "Obuka pripravnika – vreme se ne naplaćuje.",
];
const COUNTRY_NAMES = {
  RS: "Srbija",
  DE: "Nemačka",
  IT: "Italija",
  AT: "Austrija",
};
const MONTH_NAMES = [
  "januar",
  "februar",
  "mart",
  "april",
  "maj",
  "jun",
  "jul",
  "avgust",
  "septembar",
  "oktobar",
  "novembar",
  "decembar",
];

// lawyer index: 0 Bojana, 1 Đorđe, 2 Marija, 3 Ljubica, 4 Vladimir
const CLIENTS = [
  {
    key: "stojanovic",
    first: "Marko",
    last: "Stojanović",
    city: "Beograd",
    postal: "11000",
    street: "Bulevar kralja Aleksandra 112",
    born: "1984-03-12",
    region: 71,
    billing: "AT",
    resp: 1,
  },
  {
    key: "pavlovic",
    first: "Jovana",
    last: "Pavlović",
    city: "Novi Sad",
    postal: "21000",
    street: "Bulevar oslobođenja 45",
    born: "1990-07-22",
    region: 80,
    billing: "AT",
    resp: 2,
  },
  {
    key: "ristic",
    first: "Dušan",
    last: "Ristić",
    city: "Niš",
    postal: "18000",
    street: "Obrenovićeva 18",
    born: "1979-11-02",
    region: 73,
    billing: "AT",
    resp: 4,
  },
  {
    key: "todorovic",
    first: "Ivana",
    last: "Todorović",
    city: "Beograd",
    postal: "11000",
    street: "Cara Dušana 61",
    born: "1987-01-30",
    region: 71,
    billing: "HOURLY",
    hourly: 8000,
    resp: 3,
    tags: ["VIP klijent"],
  },
  {
    key: "popovic",
    first: "Nemanja",
    last: "Popović",
    city: "Kragujevac",
    postal: "34000",
    street: "Kralja Petra I 9",
    born: "1972-05-17",
    region: 72,
    billing: "AT",
    resp: 2,
  },
  {
    key: "kovacevic",
    first: "Katarina",
    last: "Kovačević",
    city: "Beograd",
    postal: "11000",
    street: "Njegoševa 33",
    born: "1993-09-08",
    region: 71,
    billing: "AT",
    resp: 4,
    tags: ["Medijacija"],
  },
  {
    key: "zivkovic",
    first: "Igor",
    last: "Živković",
    city: "Čačak",
    postal: "32000",
    street: "Gradsko šetalište 14",
    born: "1968-12-01",
    region: 78,
    billing: "AT",
    resp: 0,
    tags: ["Hitno"],
  },
  {
    key: "milosevic",
    first: "Sofija",
    last: "Milošević",
    city: "Subotica",
    postal: "24000",
    street: "Korzo 7",
    born: "1981-04-25",
    region: 80,
    billing: "AT",
    resp: 1,
  },
  {
    key: "vasic",
    first: "Aleksandar",
    last: "Vasić",
    city: "Beograd",
    postal: "11000",
    street: "Vojvode Stepe 210",
    born: "1976-10-10",
    region: 71,
    billing: "HOURLY",
    hourly: 9000,
    resp: 0,
    tags: ["VIP klijent"],
  },
  {
    key: "radovanovic",
    first: "Teodora",
    last: "Radovanović",
    city: "Novi Sad",
    postal: "21000",
    street: "Zmaj Jovina 20",
    born: "1995-02-14",
    region: 80,
    billing: "AT",
    resp: 2,
  },
  {
    key: "lazic",
    first: "Uroš",
    last: "Lazić",
    city: "Pančevo",
    postal: "26000",
    street: "Vojvode Radomira Putnika 5",
    born: "1989-06-03",
    region: 86,
    billing: "AT",
    resp: 4,
    status: "ARCHIVED",
  },
  {
    key: "obradovic",
    first: "Nina",
    last: "Obradović",
    city: "Beograd",
    postal: "11000",
    street: "Gandijeva 120",
    born: "1997-08-19",
    region: 71,
    billing: "PRO_BONO",
    resp: 3,
    tags: ["Pro bono"],
  },
  {
    key: "antic",
    first: "Filip",
    last: "Antić",
    city: "Beograd",
    postal: "11000",
    street: "Ustanička 128",
    born: "1983-03-03",
    region: 71,
    billing: "AT",
    resp: 4,
  },
  {
    key: "dimitrijevic",
    first: "Sara",
    last: "Dimitrijević",
    city: "Valjevo",
    postal: "14000",
    street: "Karađorđeva 50",
    born: "1991-11-27",
    region: 77,
    billing: "AT",
    resp: 2,
    status: "INACTIVE",
  },
  {
    key: "markovic",
    first: "Bojan",
    last: "Marković",
    city: "Beograd",
    postal: "11000",
    street: "Šumadijska 12",
    born: "1985-07-07",
    region: 71,
    billing: "AT",
    resp: 0,
    tags: ["Hitno"],
  },
  {
    key: "jankovic",
    first: "Milena",
    last: "Janković",
    city: "Šabac",
    postal: "15000",
    street: "Masarikova 3",
    born: "1964-02-11",
    region: 77,
    billing: "AT",
    resp: 1,
    status: "PROSPECT",
  },
  {
    key: "muller",
    first: "Thomas",
    last: "Müller",
    city: "Berlin",
    postal: "10115",
    street: "Friedrichstraße 120",
    country: "DE",
    born: "1978-05-09",
    billing: "HOURLY",
    hourly: 110,
    currency: "EUR",
    resp: 3,
    tags: ["Strani klijent"],
  },
  {
    key: "rossi",
    first: "Anna",
    last: "Rossi",
    city: "Milano",
    postal: "20121",
    street: "Via Manzoni 14",
    country: "IT",
    born: "1986-09-15",
    billing: "HOURLY",
    hourly: 110,
    currency: "EUR",
    resp: 1,
    tags: ["Strani klijent"],
  },
  {
    key: "alfa",
    name: "Alfa Trade d.o.o.",
    city: "Beograd",
    postal: "11000",
    street: "Bulevar Mihajla Pupina 10a",
    industry: "Veleprodaja tehničke robe",
    billing: "RETAINER",
    hourly: 10000,
    resp: 0,
    tags: ["VIP klijent"],
    contacts: [
      ["Zoran", "Milenković", "Direktor"],
      ["Jelena", "Savić", "Finansijski direktor"],
    ],
    retainers: [
      {
        title: "Paušal – tekuće pravno savetovanje",
        fee: 120000,
        from: "2026-01-01",
        cap: 1200,
        overage: "HOURLY",
        overageRate: 9000,
        outOfScope: "HOURLY",
        outRate: 10000,
        cats: [SAV, UGO, KOR, ADM],
      },
    ],
  },
  {
    key: "bti",
    name: "Beogradska tekstilna industrija a.d.",
    city: "Beograd",
    postal: "11000",
    street: "Bulevar despota Stefana 99",
    industry: "Proizvodnja tekstila",
    billing: "HOURLY",
    hourly: 9000,
    resp: 2,
    tags: ["Naplata u kašnjenju"],
    contacts: [
      ["Dragan", "Ilić", "Generalni direktor"],
      ["Snežana", "Pejić", "Šef računovodstva"],
    ],
    retainers: [
      {
        title: "Paušal 2026 – otkazan",
        fee: 80000,
        from: "2026-01-01",
        to: "2026-03-31",
        cap: 900,
        overage: "HOURLY",
        overageRate: 8000,
        outOfScope: "HOURLY",
        outRate: 9000,
        cats: [SAV, UGO],
        active: false,
      },
    ],
  },
  {
    key: "novaEnergija",
    name: "Nova Energija d.o.o.",
    city: "Novi Sad",
    postal: "21000",
    street: "Narodnog fronta 23",
    industry: "Obnovljivi izvori energije",
    billing: "RETAINER",
    hourly: 12000,
    resp: 0,
    contacts: [
      ["Miloš", "Kostić", "Direktor"],
      ["Ana", "Lukić", "Pravni saradnik"],
    ],
    retainers: [
      {
        title: "Mesečni paušal – energetski projekti",
        fee: 180000,
        from: "2026-03-01",
        cap: 1800,
        overage: "ABSORBED",
        outOfScope: "AT",
        cats: [SAV, UGO, KOR, PRE, DUE, UPR, ADM],
      },
    ],
  },
  {
    key: "dunav",
    name: "Dunav Logistika d.o.o.",
    city: "Beograd",
    postal: "11000",
    street: "Pančevački put 41",
    industry: "Transport i logistika",
    billing: "RETAINER",
    hourly: 9000,
    resp: 1,
    contacts: [
      ["Vesna", "Đorđević", "Direktor"],
      ["Marko", "Lalić", "Menadžer za ugovore"],
    ],
    retainers: [
      {
        title: "Paušal – logistički ugovori",
        fee: 90000,
        from: "2026-02-01",
        cap: 900,
        overage: "HOURLY",
        overageRate: 8000,
        outOfScope: "HOURLY",
        outRate: 9000,
        cats: [SAV, UGO, ADM],
      },
    ],
  },
  {
    key: "srbijaAgro",
    name: "Srbija Agro a.d.",
    city: "Novi Sad",
    postal: "21000",
    street: "Temerinski put 50",
    industry: "Poljoprivreda i prerada hrane",
    billing: "HOURLY",
    hourly: 10000,
    resp: 2,
    contacts: [
      ["Radomir", "Stanković", "Predsednik izvršnog odbora"],
      ["Ljiljana", "Bogdanović", "Rukovodilac pravne službe"],
    ],
    retainers: [
      {
        title: "Paušal 2025/2026",
        fee: 100000,
        from: "2025-07-01",
        to: "2026-06-30",
        cap: 1200,
        overage: "HOURLY",
        overageRate: 9000,
        outOfScope: "HOURLY",
        outRate: 10000,
        cats: [SAV, UGO, ADM],
      },
    ],
  },
  {
    key: "grand",
    name: "Grand Nekretnine d.o.o.",
    city: "Beograd",
    postal: "11000",
    street: "Omladinskih brigada 88",
    industry: "Razvoj i upravljanje nekretninama",
    billing: "RETAINER",
    hourly: 11000,
    resp: 3,
    tags: ["VIP klijent"],
    contacts: [
      ["Nikola", "Đurović", "Direktor razvoja"],
      ["Tamara", "Nedeljković", "Finansije"],
    ],
    retainers: [
      {
        title: "Paušal – prodaja i razvoj projekata",
        fee: 150000,
        from: "2026-01-01",
        cap: null,
        overage: "ABSORBED",
        outOfScope: "HOURLY",
        outRate: 11000,
        cats: [SAV, UGO, DUE, UPR, ADM],
      },
    ],
  },
  {
    key: "medicus",
    name: "Medicus Plus d.o.o.",
    city: "Beograd",
    postal: "11000",
    street: "Resavska 28",
    industry: "Privatna zdravstvena ustanova",
    billing: "RETAINER",
    hourly: 10000,
    resp: 1,
    contacts: [
      ["Dr Branka", "Jeremić", "Direktor"],
      ["Goran", "Tasić", "Administrativni direktor"],
    ],
    retainers: [
      {
        title: "Paušal – zdravstvena regulativa",
        fee: 75000,
        from: "2026-04-01",
        cap: 720,
        overage: "HOURLY",
        overageRate: 8500,
        outOfScope: "AT",
        cats: [SAV, UGO, ADM],
      },
    ],
  },
  {
    key: "tehnopolis",
    name: "Tehnopolis IT d.o.o.",
    city: "Niš",
    postal: "18000",
    street: "Bulevar Nemanjića 25",
    industry: "Razvoj softvera",
    billing: "RETAINER",
    hourly: 9500,
    resp: 4,
    contacts: [
      ["Stefan", "Mitić", "Osnivač i direktor"],
      ["Milica", "Ranković", "HR menadžer"],
    ],
    retainers: [
      {
        title: "Paušal – IT ugovori i licence",
        fee: 60000,
        from: "2026-09-15",
        cap: 600,
        overage: "HOURLY",
        overageRate: 8500,
        outOfScope: "HOURLY",
        outRate: 9500,
        cats: [SAV, UGO, KOR],
      },
    ],
  },
  {
    key: "zlatnoZrno",
    name: "Pekara Zlatno Zrno d.o.o.",
    city: "Kragujevac",
    postal: "34000",
    street: "Kneza Miloša 40",
    industry: "Proizvodnja pekarskih proizvoda",
    billing: "HOURLY",
    hourly: 8000,
    resp: 1,
    status: "PROSPECT",
    contacts: [["Dragana", "Simić", "Vlasnik"]],
  },
  {
    key: "gradjevinar",
    name: "Građevinar Inženjering d.o.o.",
    city: "Beograd",
    postal: "11000",
    street: "Autoput za Zagreb 22",
    industry: "Građevinarstvo",
    billing: "HOURLY",
    hourly: 11000,
    resp: 1,
    tags: ["Hitno"],
    contacts: [
      ["Predrag", "Vuković", "Direktor"],
      ["Irena", "Matić", "Komercijala"],
    ],
  },
  {
    key: "hotel",
    name: "Hotel Savski Venac d.o.o.",
    city: "Beograd",
    postal: "11000",
    street: "Karađorđeva 2",
    industry: "Ugostiteljstvo i turizam",
    billing: "HOURLY",
    hourly: 9500,
    resp: 2,
    contacts: [
      ["Aleksandra", "Pešić", "Generalni menadžer"],
      ["Dejan", "Rakić", "Finansijski kontroler"],
    ],
  },
  {
    key: "opstina",
    name: "Gradska opština Stari grad",
    city: "Beograd",
    postal: "11000",
    street: "Makedonska 42",
    industry: "Lokalna samouprava",
    billing: "HOURLY",
    hourly: 8000,
    resp: 0,
    publicSector: true,
    jbkjs: "01826",
    contacts: [
      ["Vladan", "Nikolić", "Načelnik uprave"],
      ["Maja", "Ivković", "Služba za javne nabavke"],
    ],
  },
  {
    key: "alpen",
    name: "Alpen Holding GmbH",
    city: "Beč",
    postal: "1010",
    street: "Kärntner Ring 5",
    country: "AT",
    industry: "Holding i investicije",
    lang: "EN",
    billing: "RETAINER",
    hourly: 130,
    currency: "EUR",
    resp: 0,
    tags: ["Strani klijent", "VIP klijent"],
    contacts: [
      ["Lukas", "Gruber", "Managing Director"],
      ["Sabine", "Huber", "Head of Legal"],
    ],
    retainers: [
      {
        title: "Retainer – operations in Serbia",
        fee: 1500,
        currency: "EUR",
        from: "2026-06-01",
        cap: 900,
        overage: "HOURLY",
        overageRate: 120,
        outOfScope: "HOURLY",
        outRate: 130,
        cats: [SAV, KOR, DUE, PRE, UGO, ADM],
      },
    ],
  },
];

// [client, name, case type, practice area, opposing party, court, status, priority, lawyer, opened, closed]
const CASES = [
  [
    "stojanovic",
    "Naknada štete iz saobraćajne nezgode",
    "Parnica",
    "Građansko pravo",
    "Osiguranje Sava a.d.",
    "Prvi osnovni sud u Beogradu",
    "ACTIVE",
    "HIGH",
    1,
    "2026-03-04",
  ],
  [
    "stojanovic",
    "Izvršenje na osnovu pravnosnažne presude",
    "Izvršni postupak",
    "Građansko pravo",
    "Milan Marković",
    null,
    "ACTIVE",
    "NORMAL",
    1,
    "2026-08-18",
  ],
  [
    "pavlovic",
    "Sporazumni razvod braka i vršenje roditeljskog prava",
    "Porodični spor",
    "Porodično pravo",
    "Nikola Pavlović",
    "Osnovni sud u Novom Sadu",
    "ACTIVE",
    "NORMAL",
    2,
    "2026-06-10",
  ],
  [
    "ristic",
    "Poništaj rešenja o otkazu ugovora o radu",
    "Radni spor",
    "Radno pravo",
    "Jugoprevoz Niš a.d.",
    "Osnovni sud u Nišu",
    "ACTIVE",
    "HIGH",
    4,
    "2026-05-20",
  ],
  [
    "todorovic",
    "Pravna provera kupoprodaje stana na Vračaru",
    "Nepokretnosti",
    "Pravo nekretnina",
    "Petar i Ana Ilić",
    null,
    "ACTIVE",
    "NORMAL",
    3,
    "2026-09-02",
  ],
  [
    "todorovic",
    "Upis prava svojine u katastar nepokretnosti",
    "Upravni postupak",
    "Pravo nekretnina",
    "RGZ – Služba za katastar nepokretnosti Vračar",
    null,
    "ACTIVE",
    "LOW",
    3,
    "2026-09-21",
  ],
  [
    "popovic",
    "Ostavinski postupak iza pokojnog Radoja Popovića",
    "Nasleđivanje",
    "Građansko pravo",
    null,
    "Osnovni sud u Kragujevcu",
    "ACTIVE",
    "NORMAL",
    2,
    "2026-04-14",
  ],
  [
    "kovacevic",
    "Zaštita od zlostavljanja na radu (mobing)",
    "Radni spor",
    "Radno pravo",
    "Banka Meridian a.d.",
    "Drugi osnovni sud u Beogradu",
    "ON_HOLD",
    "NORMAL",
    4,
    "2026-02-03",
  ],
  [
    "zivkovic",
    "Odbrana – nesavestan rad u službi",
    "Krivični postupak",
    "Krivično pravo",
    "Osnovno javno tužilaštvo u Čačku",
    "Osnovni sud u Čačku",
    "ACTIVE",
    "URGENT",
    0,
    "2026-07-07",
  ],
  [
    "milosevic",
    "Naplata zakupnine za poslovni prostor",
    "Parnica",
    "Građansko pravo",
    "Metalpromet d.o.o.",
    "Osnovni sud u Subotici",
    "ACTIVE",
    "NORMAL",
    1,
    "2026-05-28",
  ],
  [
    "vasic",
    "Spor povodom ugovora o kreditu indeksiranom u CHF",
    "Parnica",
    "Građansko pravo",
    "Banka Meridian a.d.",
    "Prvi osnovni sud u Beogradu",
    "ACTIVE",
    "HIGH",
    0,
    "2025-11-12",
  ],
  [
    "vasic",
    "Osnivanje jednočlanog društva sa ograničenom odgovornošću",
    "Savetodavni predmet",
    "Privredno pravo",
    null,
    null,
    "CLOSED",
    "LOW",
    3,
    "2026-08-01",
    "2026-09-11",
  ],
  [
    "radovanovic",
    "Zaštita potrošača – neispravno vozilo",
    "Parnica",
    "Građansko pravo",
    "Auto kuća Vojvodina d.o.o.",
    "Osnovni sud u Novom Sadu",
    "ACTIVE",
    "NORMAL",
    2,
    "2026-06-22",
  ],
  [
    "lazic",
    "Prekršajni postupak – prekoračenje brzine",
    "Prekršajni postupak",
    "Krivično pravo",
    "MUP – Policijska uprava Pančevo",
    "Prekršajni sud u Pančevu",
    "ARCHIVED",
    "LOW",
    4,
    "2025-10-01",
    "2026-01-20",
  ],
  [
    "obradovic",
    "Izdržavanje maloletnog deteta (besplatna pravna pomoć)",
    "Porodični spor",
    "Porodično pravo",
    "Dejan Obradović",
    "Treći osnovni sud u Beogradu",
    "ACTIVE",
    "NORMAL",
    3,
    "2026-08-25",
  ],
  [
    "antic",
    "Smetanje državine – zajedničko dvorište",
    "Parnica",
    "Pravo nekretnina",
    "Zoran i Mira Petković",
    "Prvi osnovni sud u Beogradu",
    "ACTIVE",
    "NORMAL",
    4,
    "2026-09-08",
  ],
  [
    "dimitrijevic",
    "Naknada nematerijalne štete – ujed psa lutalice",
    "Parnica",
    "Građansko pravo",
    "Grad Valjevo",
    "Osnovni sud u Valjevu",
    "CLOSED",
    "NORMAL",
    2,
    "2025-12-10",
    "2026-09-24",
  ],
  [
    "markovic",
    "Odbrana – krivično delo prevare",
    "Krivični postupak",
    "Krivično pravo",
    "Više javno tužilaštvo u Beogradu",
    "Viši sud u Beogradu",
    "ACTIVE",
    "URGENT",
    0,
    "2026-09-14",
  ],
  [
    "jankovic",
    "Konsultacije o nasleđivanju vikendice na Tari",
    "Nasleđivanje",
    "Građansko pravo",
    null,
    null,
    "DRAFT",
    "LOW",
    1,
    "2026-10-05",
  ],
  [
    "muller",
    "Kupovina stana u Beogradu – pravna provera",
    "Nepokretnosti",
    "Pravo nekretnina",
    null,
    null,
    "ACTIVE",
    "NORMAL",
    3,
    "2026-08-20",
  ],
  [
    "muller",
    "Boravišna i radna dozvola za stranca",
    "Upravni postupak",
    "Upravno pravo",
    "MUP – Uprava za strance",
    null,
    "ACTIVE",
    "NORMAL",
    3,
    "2026-09-03",
  ],
  [
    "rossi",
    "Registracija ogranka strane kompanije",
    "Savetodavni predmet",
    "Privredno pravo",
    null,
    null,
    "ACTIVE",
    "NORMAL",
    1,
    "2026-09-10",
  ],
  [
    "alfa",
    "Naplata potraživanja od kupca Delta Invest",
    "Privredni spor",
    "Privredno pravo",
    "Delta Invest d.o.o.",
    "Privredni sud u Beogradu",
    "ACTIVE",
    "HIGH",
    0,
    "2026-04-02",
  ],
  [
    "alfa",
    "Usklađivanje opštih uslova poslovanja",
    "Savetodavni predmet",
    "Privredno pravo",
    null,
    null,
    "ACTIVE",
    "NORMAL",
    1,
    "2026-07-15",
  ],
  [
    "alfa",
    "Radni spor – bivši komercijalista",
    "Radni spor",
    "Radno pravo",
    "Goran Simić",
    "Prvi osnovni sud u Beogradu",
    "ACTIVE",
    "NORMAL",
    4,
    "2026-05-11",
  ],
  [
    "alfa",
    "Registracija žiga ALFA TRADE",
    "Upravni postupak",
    "Pravo intelektualne svojine",
    "Zavod za intelektualnu svojinu",
    null,
    "CLOSED",
    "LOW",
    1,
    "2026-01-20",
    "2026-09-04",
  ],
  [
    "bti",
    "Prijava potraživanja u stečaju – Konfekcija Morava",
    "Privredni spor",
    "Privredno pravo",
    "Konfekcija Morava a.d. u stečaju",
    "Privredni sud u Kragujevcu",
    "ACTIVE",
    "NORMAL",
    2,
    "2026-03-18",
  ],
  [
    "bti",
    "Pravilnik o radu i kolektivni ugovor",
    "Savetodavni predmet",
    "Radno pravo",
    null,
    null,
    "ON_HOLD",
    "LOW",
    4,
    "2026-06-01",
  ],
  [
    "novaEnergija",
    "Ugovor o izgradnji solarne elektrane Kovin",
    "Savetodavni predmet",
    "Privredno pravo",
    "Sunpower Balkan d.o.o.",
    null,
    "ACTIVE",
    "HIGH",
    0,
    "2026-02-10",
  ],
  [
    "novaEnergija",
    "Upravni spor – energetska dozvola",
    "Upravni postupak",
    "Upravno pravo",
    "Ministarstvo rudarstva i energetike",
    "Upravni sud",
    "ACTIVE",
    "URGENT",
    0,
    "2026-06-05",
  ],
  [
    "novaEnergija",
    "Zakup zemljišta za vetropark",
    "Nepokretnosti",
    "Pravo nekretnina",
    "Opština Kovin",
    null,
    "ACTIVE",
    "NORMAL",
    3,
    "2026-08-12",
  ],
  [
    "dunav",
    "Naknada štete na prevezenoj robi",
    "Privredni spor",
    "Privredno pravo",
    "Euroosiguranje a.d.",
    "Privredni sud u Beogradu",
    "ACTIVE",
    "NORMAL",
    1,
    "2026-04-22",
  ],
  [
    "dunav",
    "Standardizacija ugovora sa podprevoznicima",
    "Savetodavni predmet",
    "Privredno pravo",
    null,
    null,
    "ACTIVE",
    "LOW",
    2,
    "2026-09-01",
  ],
  [
    "srbijaAgro",
    "Spor sa dobavljačem semenske robe",
    "Privredni spor",
    "Privredno pravo",
    "Agroseme Bačka d.o.o.",
    "Privredni sud u Novom Sadu",
    "ACTIVE",
    "HIGH",
    2,
    "2026-03-09",
  ],
  [
    "srbijaAgro",
    "Žalba na rešenje poljoprivredne inspekcije",
    "Upravni postupak",
    "Upravno pravo",
    "Ministarstvo poljoprivrede – inspekcija",
    null,
    "CLOSED",
    "NORMAL",
    4,
    "2026-05-15",
    "2026-09-18",
  ],
  [
    "grand",
    "Ugovori o prodaji stanova u izgradnji – Blok 23",
    "Savetodavni predmet",
    "Pravo nekretnina",
    null,
    null,
    "ACTIVE",
    "NORMAL",
    3,
    "2026-01-15",
  ],
  [
    "grand",
    "Spor sa izvođačem radova zbog kašnjenja",
    "Privredni spor",
    "Privredno pravo",
    "Konstruktor Gradnja d.o.o.",
    "Privredni sud u Beogradu",
    "ACTIVE",
    "HIGH",
    0,
    "2026-05-04",
  ],
  [
    "grand",
    "Ozakonjenje poslovnog objekta",
    "Upravni postupak",
    "Pravo nekretnina",
    "Gradska uprava Grada Beograda",
    null,
    "ON_HOLD",
    "LOW",
    3,
    "2026-02-25",
  ],
  [
    "medicus",
    "Odbrana od zahteva za naknadu štete zbog lekarske greške",
    "Parnica",
    "Građansko pravo",
    "Dragana Jovanović",
    "Drugi osnovni sud u Beogradu",
    "ACTIVE",
    "HIGH",
    1,
    "2026-04-08",
  ],
  [
    "medicus",
    "Usklađivanje sa Zakonom o zaštiti podataka o ličnosti",
    "Savetodavni predmet",
    "IT i zaštita podataka",
    null,
    null,
    "ACTIVE",
    "NORMAL",
    4,
    "2026-07-01",
  ],
  [
    "tehnopolis",
    "Ugovori o razvoju softvera i licenciranju",
    "Savetodavni predmet",
    "Pravo intelektualne svojine",
    null,
    null,
    "ACTIVE",
    "NORMAL",
    4,
    "2026-09-15",
  ],
  [
    "tehnopolis",
    "Program opcija za zaposlene (ESOP)",
    "Savetodavni predmet",
    "Privredno pravo",
    null,
    null,
    "DRAFT",
    "LOW",
    0,
    "2026-10-01",
  ],
  [
    "gradjevinar",
    "Naplata za izvedene radove – Mostogradnja",
    "Privredni spor",
    "Privredno pravo",
    "Mostogradnja Plus d.o.o.",
    "Privredni sud u Beogradu",
    "ACTIVE",
    "NORMAL",
    1,
    "2026-06-17",
  ],
  [
    "gradjevinar",
    "Povreda na radu – naknada štete zaposlenom",
    "Radni spor",
    "Radno pravo",
    "Miloš Đurić",
    "Treći osnovni sud u Beogradu",
    "ACTIVE",
    "HIGH",
    4,
    "2026-07-29",
  ],
  [
    "hotel",
    "Zakup poslovnog prostora restorana",
    "Nepokretnosti",
    "Pravo nekretnina",
    "Restoran Kalemegdanska terasa d.o.o.",
    null,
    "ACTIVE",
    "NORMAL",
    2,
    "2026-08-04",
  ],
  [
    "hotel",
    "Spor sa turističkom agencijom",
    "Privredni spor",
    "Privredno pravo",
    "Balkan Tours d.o.o.",
    "Privredni sud u Beogradu",
    "CLOSED",
    "NORMAL",
    2,
    "2026-02-12",
    "2026-09-29",
  ],
  [
    "opstina",
    "Zahtev za zaštitu prava u javnoj nabavci",
    "Upravni postupak",
    "Upravno pravo",
    "Republička komisija za zaštitu prava u postupcima javnih nabavki",
    null,
    "ACTIVE",
    "HIGH",
    0,
    "2026-09-07",
  ],
  [
    "opstina",
    "Restitucija – povraćaj gradskog zemljišta",
    "Upravni postupak",
    "Pravo nekretnina",
    "Agencija za restituciju",
    null,
    "ARCHIVED",
    "LOW",
    3,
    "2025-06-01",
    "2026-02-27",
  ],
  [
    "alpen",
    "Akvizicija udela u distributeru Distribucija Sever",
    "Savetodavni predmet",
    "Privredno pravo",
    "Distribucija Sever d.o.o.",
    null,
    "ACTIVE",
    "URGENT",
    0,
    "2026-08-03",
  ],
  [
    "alpen",
    "Radnopravna usklađenost ogranka u Srbiji",
    "Savetodavni predmet",
    "Radno pravo",
    null,
    null,
    "ACTIVE",
    "NORMAL",
    4,
    "2026-09-10",
  ],
  [
    "zlatnoZrno",
    "Inicijalna konsultacija – franšizni ugovor",
    "Savetodavni predmet",
    "Privredno pravo",
    null,
    null,
    "DRAFT",
    "LOW",
    1,
    "2026-10-07",
  ],
];

const KIND_BY_TYPE = {
  "Savetodavni predmet": "advisory",
  Nepokretnosti: "advisory",
  "Upravni postupak": "administrative",
};
const CATEGORY_POOL = {
  litigation: [POD, POD, ZAS, SAV, PRE, ADM],
  advisory: [SAV, UGO, UGO, KOR, DUE, PRE, ADM],
  administrative: [UPR, UPR, SAV, ADM],
};
const WORK_TITLES = {
  [SAV]: [
    "Telefonske konsultacije sa klijentom",
    "Pravni savet u vezi sa ugovornim obavezama",
    "Odgovor na upit klijenta",
    "Sastanak sa klijentom – pregled otvorenih pitanja",
    "Izrada pravnog mišljenja",
  ],
  [POD]: [
    "Izrada nacrta tužbe",
    "Izrada odgovora na tužbu",
    "Izrada žalbe na prvostepenu presudu",
    "Izrada podneska sa dokaznim predlozima",
    "Izrada pripremnog podneska",
    "Izrada predloga za izvršenje",
    "Izjašnjenje na nalaz veštaka",
  ],
  [ZAS]: [
    "Priprema za ročište",
    "Uvid u spise predmeta",
    "Pregled zapisnika sa ročišta",
    "Priprema pitanja za saslušanje svedoka",
  ],
  [UGO]: [
    "Pregled nacrta ugovora i komentari",
    "Izrada ugovora o poslovnoj saradnji",
    "Izrada aneksa ugovora",
    "Izrada ugovora o zakupu",
    "Usaglašavanje ugovora sa drugom stranom",
  ],
  [KOR]: [
    "Priprema odluke skupštine društva",
    "Registracija promene u APR-u",
    "Izmena osnivačkog akta",
    "Pregled internih akata društva",
  ],
  [PRE]: [
    "Pregovori sa suprotnom stranom",
    "Priprema predloga poravnanja",
    "Prepiska sa advokatom suprotne strane",
  ],
  [DUE]: [
    "Pregled dokumentacije za pravnu proveru",
    "Provera tereta u katastru i registru zaloge",
    "Izrada izveštaja o pravnoj proveri",
  ],
  [UPR]: [
    "Izrada žalbe na rešenje",
    "Priprema zahteva nadležnom organu",
    "Praćenje statusa upravnog postupka",
    "Izrada tužbe u upravnom sporu",
  ],
  [ADM]: [
    "Korespondencija sa klijentom",
    "Organizacija dokumentacije predmeta",
    "Dostava dokumentacije sudu",
    "Ažuriranje evidencije rokova",
  ],
};
const AT_VALUES = {
  [ZAS]: [18000, 22500, 27000],
  [POD]: [22500, 30000, 45000],
  [SAV]: [6000, 9000],
  [UGO]: [30000, 45000],
  [UPR]: [15000, 22500],
};
const MINUTES = [
  12, 18, 24, 30, 30, 36, 42, 45, 48, 54, 60, 60, 60, 72, 90, 90, 105, 120, 120,
  150, 180, 210, 240,
];

const HEARING_TITLES = {
  litigation: [
    "Pripremno ročište",
    "Glavna rasprava",
    "Ročište za izvođenje dokaza – saslušanje svedoka",
    "Ročište za izvođenje dokaza – veštačenje",
    "Nastavak glavne rasprave",
    "Ročište za objavljivanje presude",
  ],
  criminal: [
    "Glavni pretres",
    "Saslušanje okrivljenog",
    "Nastavak glavnog pretresa",
    "Ročište za izricanje krivične sankcije",
  ],
  administrative: ["Usmena javna rasprava"],
};
const COURT_FILE_PREFIX = {
  Parnica: "P",
  "Privredni spor": "P",
  "Radni spor": "P1",
  "Porodični spor": "P2",
  "Krivični postupak": "K",
  Nasleđivanje: "O",
  "Upravni postupak": "U",
  "Prekršajni postupak": "PR",
};

const TASK_TEMPLATES = {
  litigation: [
    [
      "Izraditi nacrt tužbe",
      "Na osnovu prikupljene dokumentacije izraditi nacrt tužbe sa dokaznim predlozima i proslediti ga na internu reviziju.",
    ],
    [
      "Pripremiti odgovor na tužbu",
      "Analizirati navode tužbe, pripremiti protivargumente i dokaze.",
    ],
    [
      "Izraditi žalbu na prvostepenu presudu",
      "Ispitati razloge za žalbu i pripremiti nacrt u zakonskom roku.",
    ],
    [
      "Pripremiti dokazne predloge",
      "Popisati svedoke, isprave i predloge za veštačenje.",
    ],
    [
      "Analizirati nalaz veštaka",
      "Uporediti nalaz sa dokumentacijom i pripremiti primedbe.",
    ],
    [
      "Poslati klijentu izveštaj sa ročišta",
      "Ukratko opisati tok ročišta, naredne korake i rokove.",
    ],
    [
      "Pretraga sudske prakse",
      "Pronaći odluke apelacionih sudova i Vrhovnog suda relevantne za predmet.",
    ],
    [
      "Pripremiti pitanja za svedoke",
      "Sastaviti listu pitanja i redosled saslušanja.",
    ],
    [
      "Proveriti status predmeta na portalu sudova",
      "Proveriti da li je zakazano novo ročište ili je stigla odluka.",
    ],
    [
      "Pripremiti predlog za poravnanje",
      "Izraditi nacrt predloga sa rasponom prihvatljivih uslova.",
    ],
  ],
  advisory: [
    [
      "Pregledati ugovor i dostaviti komentare",
      "Označiti rizične odredbe i predložiti izmene u režimu praćenja izmena.",
    ],
    [
      "Izraditi pravno mišljenje",
      "Pripremiti pisano mišljenje sa zaključkom i preporukama.",
    ],
    [
      "Pripremiti nacrt ugovora",
      "Izraditi prvi nacrt na osnovu dogovorenih komercijalnih uslova.",
    ],
    [
      "Proveriti podatke u APR-u",
      "Izvući aktuelni izvod i proveriti zastupnike i ograničenja.",
    ],
    [
      "Proveriti stanje u katastru nepokretnosti",
      "Pribaviti list nepokretnosti i proveriti terete i zabeležbe.",
    ],
    [
      "Zakazati sastanak sa klijentom",
      "Dogovoriti termin za usaglašavanje otvorenih pitanja.",
    ],
    [
      "Pripremiti punomoćje za potpis",
      "Pripremiti specijalno punomoćje i dogovoriti overu.",
    ],
    [
      "Usaglasiti finalnu verziju sa klijentom",
      "Proći kroz sve komentare i potvrditi konačan tekst.",
    ],
  ],
  administrative: [
    [
      "Izraditi žalbu na rešenje",
      "Pripremiti žalbu sa obrazloženjem i dokazima u roku od 15 dana.",
    ],
    [
      "Pripremiti zahtev nadležnom organu",
      "Popuniti zahtev i priložiti potrebnu dokumentaciju.",
    ],
    [
      "Uplatiti republičku administrativnu taksu",
      "Proveriti iznos takse i dostaviti dokaz o uplati.",
    ],
    [
      "Proveriti status predmeta u organu",
      "Pozvati službu i evidentirati status postupka.",
    ],
    [
      "Izraditi tužbu u upravnom sporu",
      "Pripremiti tužbu Upravnom sudu protiv konačnog rešenja.",
    ],
  ],
};
const TRAINEE_TASKS = [
  [
    "Uvid u spise predmeta u sudu",
    "Izvršiti uvid u spise, fotokopirati nove podneske i zapisnike.",
  ],
  [
    "Predati podnesak na pisarnici",
    "Predati podnesak u potrebnom broju primeraka i doneti potvrdu o prijemu.",
  ],
  [
    "Pripremiti hronologiju predmeta",
    "Sastaviti hronološki pregled događaja sa referencama na dokumente.",
  ],
  [
    "Proveriti dostavnice",
    "Proveriti da li su sve strane uredno primile pismena.",
  ],
  [
    "Izvod iz lista nepokretnosti",
    "Pribaviti izvod sa portala RGZ-a i priložiti ga spisu.",
  ],
  ["Uneti rokove u kalendar", "Evidentirati sve rokove iz primljenih rešenja."],
];
const INTERNAL_TASKS = [
  [
    "Pročitati izmene Zakona o parničnom postupku",
    "Pripremiti kratak rezime izmena za kolegijum.",
  ],
  [
    "Ažurirati šablone podnesaka",
    "Uskladiti šablone tužbe i žalbe sa novom praksom.",
  ],
  [
    "Pregled nedeljnog izveštaja o radu",
    "Proveriti evidentirano vreme i potvrditi predložene unose.",
  ],
  [
    "Priprema za predavanje u Advokatskoj komori",
    "Pripremiti prezentaciju o naknadi štete.",
  ],
  [
    "Mentorski pregled rada pripravnika",
    "Pregledati podneske pripravnika i dati povratnu informaciju.",
  ],
];
const DESK_TASKS = [
  [
    "Zavesti ulaznu poštu",
    "Skenirati i zavesti svu pristiglu poštu i rasporediti je odgovornim advokatima.",
  ],
  [
    "Poslati fakture klijentima",
    "Poslati fakture elektronskom poštom i evidentirati slanje.",
  ],
  [
    "Arhivirati zatvorene predmete",
    "Spakovati i obeležiti spise zatvorenih predmeta za arhivu.",
  ],
  [
    "Naručiti kancelarijski materijal",
    "Proveriti zalihe papira, tonera i fascikli i poslati porudžbinu.",
  ],
  [
    "Ažurirati imenik klijenata",
    "Uneti nove kontakt podatke i proveriti adrese za dostavu.",
  ],
  [
    "Organizovati kurirsku dostavu",
    "Zakazati kurira za dostavu ugovora klijentima.",
  ],
  [
    "Obnoviti pretplatu na Paragraf Lex",
    "Proveriti ponudu i poslati zahtev za obnovu licence.",
  ],
  [
    "Rezervisati sudskog tumača",
    "Zakazati sudskog tumača za nemački jezik za sastanak sa klijentom.",
  ],
];
const DEADLINE_TEMPLATES = {
  COURT: [
    "Rok za odgovor na tužbu",
    "Rok za izjavljivanje žalbe",
    "Rok za dostavljanje dokaza po nalogu suda",
    "Rok za uplatu predujma za veštačenje",
    "Rok za izjašnjenje na nalaz veštaka",
  ],
  STATUTORY: [
    "Rok zastarelosti potraživanja",
    "Rok za podnošenje tužbe u upravnom sporu",
    "Rok za žalbu na rešenje",
    "Rok za pokretanje radnog spora",
  ],
  CONTRACTUAL: [
    "Rok za potpisivanje ugovora",
    "Istek ugovora o zakupu – obaveštenje o produženju",
    "Rok za ispunjenje ugovorne obaveze",
    "Rok za dostavljanje bankarske garancije",
  ],
  INTERNAL: [
    "Interni rok za nacrt podneska",
    "Interna revizija ugovora pre slanja klijentu",
    "Izveštaj klijentu o stanju predmeta",
  ],
  OTHER: ["Rok za dostavljanje dokumentacije od klijenta", "Overa punomoćja"],
};

// ------------------------------------------------------------ organization

const RSD_ACCOUNT = accountNumber("160", "5100012345678");
const RSD_ACCOUNT_2 = accountNumber("265", "1630310004521");
const EUR_ACCOUNT = accountNumber("160", "5100087654321");

async function ensureOrganization(db, workspaceId) {
  const accounts = [
    {
      name: "Tekući račun – Banca Intesa",
      bankName: "Banca Intesa a.d. Beograd",
      accountNumber: RSD_ACCOUNT,
      currencyCode: "RSD",
      isDefault: true,
    },
    {
      name: "Tekući račun – Raiffeisen",
      bankName: "Raiffeisen banka a.d. Beograd",
      accountNumber: RSD_ACCOUNT_2,
      currencyCode: "RSD",
      isDefault: false,
    },
    {
      name: "Devizni račun EUR",
      bankName: "Banca Intesa a.d. Beograd",
      accountNumber: EUR_ACCOUNT,
      iban: "RS35160510008765432199",
      swiftBic: "DBDBRSBG",
      currencyCode: "EUR",
      isDefault: false,
    },
  ];
  let qrAccountId = null;
  for (const account of accounts) {
    const existing = await db.bankAccount.findFirst({
      where: { workspaceId, accountNumber: account.accountNumber },
    });
    const row = existing
      ? await db.bankAccount.update({
          where: { id: existing.id },
          data: { ...account, active: true },
        })
      : await db.bankAccount.create({
          data: { workspaceId, ...account, active: true },
        });
    if (account.isDefault) qrAccountId = row.id;
  }
  if (qrAccountId)
    await db.bankAccount.updateMany({
      where: { workspaceId, id: { not: qrAccountId } },
      data: { isDefault: false },
    });

  const data = {
    legalName: "Advokatska kancelarija Stojković i partneri",
    displayName: "AK Stojković i partneri",
    taxId: pib("10834567"),
    registrationNumber: "64123987",
    addressLine1: "Knez Mihailova 22",
    addressLine2: "III sprat, kancelarija 7",
    city: "Beograd",
    postalCode: "11000",
    countryCode: "RS",
    email: "kancelarija@stojkovic-advokati.rs",
    phone: "+381 11 555 2000",
    website: "https://www.stojkovic-advokati.rs",
    jbkjs: null,
    vatRegistered: true,
    defaultVatRate: "20.00",
    availableVatRates: [0, 10, 20],
    defaultTaxCategoryCode: "S20",
    defaultTaxExemptionReasonCode: null,
    defaultTaxExemptionReasonText: null,
    cashAccountingEnabled: false,
    sefEnabled: false,
    sefEnvironment: "DEMO",
    caseNumberPattern: "{YYYY}-{SEQ}",
    invoiceNumberPattern: "{YYYY}-{SEQ:6}",
    invoiceNumberStartingSequence: 1,
    invoiceNumberIncrementBy: 1,
    invoiceNumberResetPolicy: "YEARLY",
    invoiceNumberAllowManualOverride: true,
    defaultPaymentTermDays: 15,
    defaultPaymentMethod: "BANK_TRANSFER",
    defaultPaymentModel: "97",
    paymentReferencePattern: null,
    defaultCurrencyCode: "RSD",
    allowedCurrencyCodes: ["RSD", "EUR"],
    exchangeRateSource: "NBS_MIDDLE",
    allowManualExchangeRate: true,
    exchangeRatePrecision: 4,
    amountPrecision: 2,
    defaultIssuePlace: "Beograd",
    defaultLanguage: "sr-Latn",
    defaultUnitOfMeasure: "H87",
    defaultNote:
      "Hvala na poverenju. Iznosi su iskazani bez PDV-a, a PDV je obračunat po stopi od 20%. Molimo da prilikom uplate navedete broj računa kao poziv na broj.",
    defaultFooterText: `AK Stojković i partneri · Knez Mihailova 22, 11000 Beograd · PIB ${pib("10834567")} · MB 64123987 · Tekući račun ${RSD_ACCOUNT}`,
    paymentQrEnabled: Boolean(qrAccountId),
    paymentQrStandard: "NBS_IPS",
    paymentQrAccountId: qrAccountId,
    paymentQrPurposeTemplate: "Plaćanje po fakturi {{invoiceNumber}}",
    paymentQrReferenceModel: null,
    paymentQrReferenceTemplate: null,
    includeGeneratedInvoicePdf: true,
    includeUserAttachments: true,
    allowedSefAttachmentFileExtensions: ["pdf", "docx", "xlsx"],
    maxSefAttachmentCount: 3,
    maxSefSingleFileSizeMb: 10,
  };
  await db.organizationSettings.upsert({
    where: { workspaceId },
    update: data,
    create: { workspaceId, ...data },
  });
  const config = {
    timeZone: TZ,
    dateTimeFormat: "TWENTY_FOUR_HOUR",
    workspaceNotifications: true,
    targetHourlyRate: "9000.00",
    internalCurrency: "RSD",
    defaultVatRate: "20.00",
    paymentTermDays: 15,
  };
  await db.workspaceConfig.upsert({
    where: { workspaceId },
    update: config,
    create: { workspaceId, ...config },
  });
}

async function ensureReferences(db, workspaceId, actorId) {
  const audit = { createdByUserId: actorId, updatedByUserId: actorId };
  const refs = {
    caseType: new Map(),
    practiceArea: new Map(),
    tag: new Map(),
    category: new Map(),
  };
  for (const [model, rows] of [
    ["caseType", CASE_TYPES],
    ["practiceArea", PRACTICE_AREAS],
  ])
    for (const [name, description] of rows)
      refs[model].set(
        name,
        await db[model].upsert({
          where: { workspaceId_name: { workspaceId, name } },
          update: { description, isActive: true },
          create: { workspaceId, name, description, ...audit },
        }),
      );
  for (const [name, color] of TAGS)
    refs.tag.set(
      name,
      await db.tag.upsert({
        where: { workspaceId_name: { workspaceId, name } },
        update: { color, isActive: true },
        create: { workspaceId, name, color, ...audit },
      }),
    );
  for (const [order, name] of CATEGORIES.entries())
    refs.category.set(
      name,
      await db.serviceCategory.upsert({
        where: { workspaceId_name: { workspaceId, name } },
        update: { active: true, order },
        create: { workspaceId, name, order },
      }),
    );
  return refs;
}

// ------------------------------------------------------------------- seed

async function seedData(db, workspaceId, users, refs) {
  const [bojana, djordje, marija, ljubica, vladimir, petar, milica, stefan] =
    users;
  const lawyers = [bojana, djordje, marija, ljubica, vladimir];
  const trainees = [petar, milica];
  const TRAINEE_OF = new Map([
    [bojana.id, milica],
    [djordje.id, petar],
    [marija.id, milica],
    [ljubica.id, milica],
    [vladimir.id, petar],
  ]);
  const isDesk = (user) => user.id === stefan.id;
  const logs = [];
  const log = (action, entityType, entityId, occurredAt, extra = {}) =>
    logs.push({
      id: randomUUID(),
      workspaceId,
      action,
      entityType,
      entityId,
      occurredAt: clampPast(occurredAt),
      actorUserId: bojana.id,
      ...extra,
    });

  // ---------------------------------------------------------------- clients
  const counter = await db.domainCounter.findUnique({
    where: { workspaceId_name: { workspaceId, name: "CLIENT" } },
  });
  let clientSeq = counter?.value ?? 0;
  const clients = new Map();
  for (const [index, def] of CLIENTS.entries()) {
    const isOrg = Boolean(def.name);
    const country = def.country ?? "RS";
    const domestic = country === "RS";
    const displayName = isOrg ? def.name : `${def.first} ${def.last}`;
    const domain = `${slug(displayName.split(" ")[0])}.example`;
    const email = isOrg
      ? `office@${domain}`
      : `${slug(`${def.first} ${def.last}`)}@posta.example`;
    const contacts = (def.contacts ?? []).map(
      ([firstName, lastName, position], i) => ({
        id: randomUUID(),
        firstName,
        lastName,
        position,
        email: `${slug(`${firstName} ${lastName}`)}@${domain}`,
        phone: domestic
          ? `+381 6${randomInt(0, 6)} ${randomInt(100, 999)} ${randomInt(1000, 9999)}`
          : `+43 1 ${randomInt(1000000, 9999999)}`,
        isPrimary: i === 0,
        notes:
          i === 0
            ? "Odobrava strategiju, poravnanja i konačne verzije ugovora."
            : "Kontakt za fakture, uplate i poslovnu dokumentaciju.",
        status: "ACTIVE",
      }),
    );
    const createdAt = local("2026-01-05", 10);
    const row = await db.client.create({
      data: {
        workspaceId,
        clientNumber: `CL-${String(++clientSeq).padStart(6, "0")}`,
        type: isOrg ? "ORGANIZATION" : "INDIVIDUAL",
        displayName,
        firstName: isOrg ? null : def.first,
        lastName: isOrg ? null : def.last,
        organizationName: isOrg ? def.name : null,
        isDomestic: domestic,
        isPublicSector: Boolean(def.publicSector),
        jbkjs: def.jbkjs ?? null,
        jmbg:
          !isOrg && domestic
            ? jmbg(def.born, def.region, 100 + index * 7)
            : null,
        taxNumber: isOrg
          ? domestic
            ? pib(String(10900000 + index * 1373))
            : "ATU63421987"
          : null,
        registrationNumber: isOrg
          ? domestic
            ? String(20100000 + index * 4219)
            : "FN 412356 k"
          : null,
        status: def.status ?? "ACTIVE",
        email,
        phone: domestic
          ? isOrg
            ? `+381 ${def.city === "Beograd" ? "11" : def.city === "Novi Sad" ? "21" : "18"} ${randomInt(200, 799)} ${randomInt(1000, 9999)}`
            : `+381 6${randomInt(0, 6)} ${randomInt(100, 999)} ${randomInt(1000, 9999)}`
          : country === "DE"
            ? "+49 30 5551 2876"
            : country === "IT"
              ? "+39 02 5551 7720"
              : "+43 1 5554 1200",
        website: isOrg ? `https://www.${domain}` : null,
        preferredLanguage: def.lang ?? (domestic ? "SR" : "EN"),
        notes: isOrg
          ? `${def.industry}. Za procesne odluke kontaktirati zakonskog zastupnika, a račune slati finansijama.`
          : domestic
            ? "Klijent preferira komunikaciju telefonom. Pre slanja podnesaka potvrditi konačnu verziju."
            : "Komunikacija na engleskom jeziku. Po potrebi angažovati sudskog tumača.",
        customFields: {
          ...(isOrg ? { industry: def.industry } : {}),
          billingModel:
            def.billing === "RETAINER"
              ? "MONTHLY_RETAINER"
              : def.billing === "HOURLY"
                ? "HOURLY"
                : def.billing === "PRO_BONO"
                  ? "PRO_BONO"
                  : "ATTORNEY_TARIFF",
          referralSource: pick([
            "Preporuka klijenta",
            "Internet",
            "Poslovni partner",
            "Advokatska komora",
          ]),
          preferredContactMethod: isOrg ? "EMAIL" : pick(["PHONE", "EMAIL"]),
        },
        responsibleUserId: lawyers[def.resp].id,
        createdByUserId: bojana.id,
        updatedByUserId: bojana.id,
        createdAt,
        addresses: {
          create: [
            {
              addressType: isOrg ? "HEADQUARTERS" : "HOME",
              street: def.street,
              city: def.city,
              postalCode: def.postal,
              stateOrRegion: domestic ? "Srbija" : null,
              country,
              note: isOrg
                ? "Sedište registrovano u APR-u."
                : "Adresa za dostavu pošte i službenih pismena.",
              isPrimary: true,
            },
          ],
        },
        identificationDocuments: isOrg
          ? undefined
          : {
              create: [
                {
                  type: domestic ? "LICNA_KARTA" : "PASSPORT",
                  number: domestic
                    ? String(randomInt(100000000, 999999999))
                    : `C${randomInt(10000000, 99999999)}`,
                  issuedDate: dateOnly(
                    `202${randomInt(1, 4)}-0${randomInt(1, 9)}-1${randomInt(0, 9)}`,
                  ),
                  expiredDate: dateOnly(
                    `203${randomInt(1, 4)}-0${randomInt(1, 9)}-1${randomInt(0, 9)}`,
                  ),
                  country,
                },
              ],
            },
        contacts: contacts.length ? { create: contacts } : undefined,
        tags: def.tags
          ? {
              create: def.tags.map((name) => ({
                tagId: refs.tag.get(name).id,
              })),
            }
          : undefined,
      },
    });
    clients.set(def.key, {
      ...def,
      row,
      id: row.id,
      displayName,
      email,
      country,
      status: row.status,
      currency: def.currency ?? "RSD",
      hourly: def.hourly ?? 7000,
      responsible: lawyers[def.resp],
      contact: contacts[0] ?? null,
      agreements: [],
    });
  }
  await db.domainCounter.upsert({
    where: { workspaceId_name: { workspaceId, name: "CLIENT" } },
    update: { value: clientSeq },
    create: { workspaceId, name: "CLIENT", value: clientSeq },
  });

  // ------------------------------------------------- billing setup per client
  const profiles = [];
  const agreements = [];
  const agreementCategories = [];
  for (const client of clients.values()) {
    if (client.billing !== "PRO_BONO")
      profiles.push({
        id: randomUUID(),
        workspaceId,
        clientId: client.id,
        hourlyRate: client.hourly.toFixed(2),
        currency: client.currency,
      });
    for (const retainer of client.retainers ?? []) {
      const agreement = {
        id: randomUUID(),
        workspaceId,
        clientId: client.id,
        title: retainer.title,
        monthlyFee: retainer.fee.toFixed(2),
        currency: retainer.currency ?? "RSD",
        validFrom: dateOnly(retainer.from),
        validTo: retainer.to ? dateOnly(retainer.to) : null,
        includedMinutes: retainer.cap,
        overageRule: retainer.overage,
        overageHourlyRate:
          retainer.overage === "HOURLY"
            ? retainer.overageRate.toFixed(2)
            : null,
        outOfScopeRule: retainer.outOfScope,
        outOfScopeHourlyRate:
          retainer.outOfScope === "HOURLY" ? retainer.outRate.toFixed(2) : null,
        active: retainer.active ?? true,
      };
      agreements.push(agreement);
      for (const name of retainer.cats)
        agreementCategories.push({
          workspaceId,
          retainerAgreementId: agreement.id,
          serviceCategoryId: refs.category.get(name).id,
        });
      client.agreements.push({
        ...retainer,
        id: agreement.id,
        active: agreement.active,
        currency: agreement.currency,
      });
    }
  }
  await db.clientBillingProfile.createMany({
    data: profiles,
    skipDuplicates: true,
  });
  await db.retainerAgreement.createMany({ data: agreements });
  await db.retainerAgreementCategory.createMany({ data: agreementCategories });
  const RATES = [
    [bojana, 15000],
    [djordje, 11000],
    [marija, 11000],
    [ljubica, 10000],
    [vladimir, 10000],
    [petar, 4500],
    [milica, 4500],
    [stefan, 2500],
  ];
  await db.userRate.createMany({
    data: [
      ...RATES.map(([user, rate]) => ({
        workspaceId,
        userId: user.id,
        hourlyValue: rate.toFixed(2),
        currency: "RSD",
        effectiveFrom: dateOnly("2026-01-01"),
      })),
      {
        workspaceId,
        userId: petar.id,
        hourlyValue: "5500.00",
        currency: "RSD",
        effectiveFrom: dateOnly("2026-09-01"),
      },
    ],
    skipDuplicates: true,
  });

  const agreementOn = (client, iso) =>
    client.agreements.find(
      (a) => a.active && a.from <= iso && (!a.to || a.to >= iso),
    ) ?? null;

  // ------------------------------------------------------------------ cases
  const existingCases = await db.case.findMany({
    where: { workspaceId },
    select: { caseNumber: true },
  });
  let caseSeq = existingCases.reduce((max, item) => {
    const match = /^2026-(\d+)$/.exec(item.caseNumber);
    return match ? Math.max(max, Number(match[1])) : max;
  }, existingCases.length);
  const cases = [];
  const caseRows = [];
  const caseTags = [];
  const responsibilities = [];
  const caseActivities = [];
  const clientActivities = [];
  for (const [
    clientKey,
    name,
    typeName,
    areaName,
    opposing,
    court,
    status,
    priority,
    lawyerIndex,
    opened,
    closed,
  ] of CASES) {
    const client = clients.get(clientKey);
    const responsible = lawyers[lawyerIndex];
    const kind =
      typeName === "Krivični postupak" || typeName === "Prekršajni postupak"
        ? "criminal"
        : (KIND_BY_TYPE[typeName] ?? (court ? "litigation" : "advisory"));
    const collaborators = [TRAINEE_OF.get(responsible.id)];
    if (["HIGH", "URGENT"].includes(priority))
      collaborators.push(pick(lawyers.filter((l) => l.id !== responsible.id)));
    const id = randomUUID();
    const caseNumber = `2026-${++caseSeq}`;
    const courtFile = court
      ? `${COURT_FILE_PREFIX[typeName] ?? "P"} ${randomInt(120, 9800)}/${opened.slice(0, 4)}`
      : null;
    const kase = {
      id,
      caseNumber,
      name,
      client,
      responsible,
      collaborators,
      workers: [responsible, ...collaborators],
      status,
      priority,
      opened,
      closed: closed ?? null,
      court,
      opposing,
      kind,
      typeName,
    };
    cases.push(kase);
    const createdAt = local(opened, 9, 30);
    caseRows.push({
      id,
      workspaceId,
      caseNumber,
      clientId: client.id,
      name,
      description: `${name}. Klijent: ${client.displayName}.${opposing ? ` Suprotna strana: ${opposing}.` : ""} ${court ? `Postupak se vodi pred sudom: ${court}.` : "Vansudski predmet – savetovanje i izrada dokumentacije."}`,
      caseTypeId: refs.caseType.get(typeName).id,
      practiceAreaId: refs.practiceArea.get(areaName).id,
      status,
      priority,
      responsibleUserId: responsible.id,
      openedDate: createdAt,
      closedDate: closed ? local(closed, 14) : null,
      closingNote: closed
        ? status === "ARCHIVED"
          ? "Predmet je okončan i arhiviran. Spisi predati u arhivu kancelarije."
          : pick([
              "Postupak okončan pravnosnažnom presudom u korist klijenta.",
              "Zaključeno sudsko poravnanje; obaveze ispunjene.",
              "Posao završen; klijentu predata kompletna dokumentacija.",
            ])
        : null,
      externalReference: courtFile,
      opposingPartyName: opposing,
      opposingPartyAddress: opposing
        ? `${pick(["Nemanjina 4", "Bulevar Zorana Đinđića 64a", "Kneza Miloša 12", "Bulevar oslobođenja 100"])}, ${pick(["Beograd", "Novi Sad", "Niš"])}`
        : null,
      confidentialityLevel: kind === "criminal" ? "RESTRICTED" : "INTERNAL",
      customFields: {
        courtFileNumber: courtFile,
        valueInDisputeRsd: court ? randomInt(3, 250) * 50000 : null,
        proceduralStage: closed
          ? "OKONCAN"
          : court
            ? pick(["PRVOSTEPENI_POSTUPAK", "DOKAZNI_POSTUPAK", "PRIPREMA"])
            : pick(["PREGOVORI", "IZRADA_DOKUMENTACIJE", "PRIPREMA"]),
      },
      createdByUserId: responsible.id,
      updatedByUserId: responsible.id,
      createdAt,
      updatedAt: clampPast(local(closed ?? TODAY, 12)),
    });
    const tagNames = new Set();
    if (priority === "URGENT") tagNames.add("Hitno");
    if (client.tags?.includes("VIP klijent")) tagNames.add("VIP klijent");
    if (client.billing === "PRO_BONO") tagNames.add("Pro bono");
    if (opposing && chance(0.15)) tagNames.add("Medijacija");
    for (const tagName of tagNames)
      caseTags.push({ caseId: id, tagId: refs.tag.get(tagName).id });
    responsibilities.push({
      id: randomUUID(),
      workspaceId,
      caseId: id,
      userId: responsible.id,
      isPrimary: true,
      startedAt: createdAt,
      endedAt: closed ? local(closed, 14) : null,
      createdByUserId: bojana.id,
      updatedByUserId: bojana.id,
    });
    for (const collaborator of collaborators)
      responsibilities.push({
        id: randomUUID(),
        workspaceId,
        caseId: id,
        userId: collaborator.id,
        isPrimary: false,
        startedAt: createdAt,
        endedAt: closed ? local(closed, 14) : null,
        createdByUserId: responsible.id,
        updatedByUserId: responsible.id,
      });
    log("CASE_CREATED", "Case", id, createdAt, {
      caseId: id,
      clientId: client.id,
      actorUserId: responsible.id,
      metadata: { caseNumber, priority },
    });
    if (closed)
      log(`CASE_${status}`, "Case", id, local(closed, 14), {
        caseId: id,
        clientId: client.id,
        actorUserId: responsible.id,
        metadata: { caseNumber },
      });

    const activityAudit = {
      workspaceId,
      caseId: id,
      source: "MANUAL",
      createdByUserId: responsible.id,
      updatedByUserId: responsible.id,
    };
    caseActivities.push({
      id: randomUUID(),
      ...activityAudit,
      type: "MEETING",
      title: "Uvodni sastanak sa klijentom",
      description:
        "Utvrđena hronologija događaja, ciljevi angažovanja i lista potrebne dokumentacije. Klijent potpisao punomoćje.",
      activityDate: local(opened, 11),
    });
    if (opened < "2026-10-01")
      caseActivities.push({
        id: randomUUID(),
        ...activityAudit,
        type: "NOTE",
        title: "Beleška o stanju predmeta",
        description:
          "Dokumentacija je kompletirana. Otvorena pitanja su označena u radnoj belešci; slede interna revizija nacrta i potvrda činjenica sa klijentom.",
        activityDate: local(
          maxIso(
            opened,
            `2026-09-${String(randomInt(10, 28)).padStart(2, "0")}`,
          ),
          16,
        ),
      });
    const lastContact = minIso(TODAY, `2026-10-0${randomInt(1, 8)}`);
    if (lastContact >= opened)
      caseActivities.push({
        id: randomUUID(),
        ...activityAudit,
        type: pick(["EMAIL", "PHONE_CALL"]),
        title: pick([
          "Klijent obavešten o toku postupka",
          "Primljena dopunska dokumentacija",
          "Dogovor o narednim koracima",
        ]),
        description:
          "Klijent je obavešten o trenutnom statusu predmeta i narednim rokovima.",
        activityDate: local(lastContact, 10 + randomInt(0, 6)),
      });
  }
  await db.case.createMany({ data: caseRows });
  await db.caseTag.createMany({ data: caseTags, skipDuplicates: true });
  await db.caseResponsibility.createMany({ data: responsibilities });
  for (const client of clients.values()) {
    const related = cases.find((kase) => kase.client.id === client.id);
    const audit = {
      workspaceId,
      clientId: client.id,
      relatedCaseId: related?.id ?? null,
      source: "MANUAL",
      createdByUserId: client.responsible.id,
      updatedByUserId: client.responsible.id,
    };
    clientActivities.push({
      id: randomUUID(),
      ...audit,
      type: "PHONE_CALL",
      title: "Provera kontakt podataka",
      description:
        "Potvrđeni telefon, adresa elektronske pošte i poželjan način komunikacije.",
      activityDate: local(
        `2026-09-${String(randomInt(1, 15)).padStart(2, "0")}`,
        10,
      ),
    });
    clientActivities.push({
      id: randomUUID(),
      ...audit,
      type: "EMAIL",
      title: "Poslato statusno obaveštenje",
      description:
        "Klijentu je poslat pregled aktivnih predmeta, narednih rokova i dokumentacije koju treba dostaviti.",
      activityDate: local(minIso(TODAY, `2026-10-0${randomInt(1, 7)}`), 15),
    });
    if (client.billing === "RETAINER")
      clientActivities.push({
        id: randomUUID(),
        ...audit,
        type: "MEETING",
        title: "Kvartalni pregled paušalnog angažovanja",
        description:
          "Pregled iskorišćenih sati, prioriteta za naredni kvartal i eventualnih poslova van paušala.",
        activityDate: local("2026-09-29", 13),
      });
  }
  const activeOn = (kase, iso) =>
    kase.opened <= iso &&
    (!kase.closed || kase.closed >= iso) &&
    kase.status !== "ARCHIVED" &&
    (kase.status !== "DRAFT" || kase.opened <= iso);
  const casesOf = (user, iso) =>
    cases.filter(
      (kase) =>
        kase.workers.some((w) => w.id === user.id) && activeOn(kase, iso),
    );

  // -------------------------------------------------------------- deadlines
  const deadlines = [];
  const deadlineByCase = new Map();
  const deadlineTypesFor = (kind) =>
    kind === "advisory"
      ? [
          ["CONTRACTUAL", 4],
          ["INTERNAL", 3],
          ["OTHER", 1],
        ]
      : kind === "administrative"
        ? [
            ["STATUTORY", 4],
            ["COURT", 1],
            ["INTERNAL", 2],
            ["OTHER", 1],
          ]
        : [
            ["COURT", 5],
            ["STATUTORY", 2],
            ["INTERNAL", 2],
            ["OTHER", 1],
          ];
  for (const kase of cases) {
    if (kase.status === "DRAFT" || kase.status === "ARCHIVED") continue;
    const count = kase.status === "CLOSED" ? 1 : randomInt(1, 3);
    for (let i = 0; i < count; i++) {
      const type = weighted(deadlineTypesFor(kase.kind));
      const latest = kase.closed ?? "2026-11-20";
      const earliest = maxIso(kase.opened, "2026-09-01");
      if (earliest > latest) continue;
      const due = addDays(
        earliest,
        randomInt(0, daysBetween(earliest, latest)),
      );
      const past = due < TODAY;
      let status = "OPEN";
      if (kase.closed) status = chance(0.85) ? "SATISFIED" : "CANCELLED";
      else if (past)
        status = weighted([
          ["SATISFIED", 85],
          ["CANCELLED", 8],
          ["OPEN", 7],
        ]);
      else if (chance(0.06)) status = "SATISFIED";
      const responsible = chance(0.8)
        ? kase.responsible
        : kase.collaborators[0];
      const exact = type === "COURT" && chance(0.25);
      const createdAt = clampPast(local(addDays(due, -randomInt(8, 30)), 10));
      const satisfiedAt =
        status === "SATISFIED"
          ? clampPast(local(minIso(addDays(due, -randomInt(0, 3)), TODAY), 15))
          : null;
      const row = {
        id: randomUUID(),
        workspaceId,
        title: `${pick(DEADLINE_TEMPLATES[type])} – ${kase.client.displayName}`,
        description:
          type === "COURT"
            ? "Rok određen rešenjem suda. Proveriti dostavnicu i ne ostavljati predaju za poslednji dan."
            : "Rok evidentiran radi blagovremene pripreme i kontrole kvaliteta.",
        type,
        dueDate: exact ? null : dateOnly(due),
        dueAt: exact ? local(due, 15) : null,
        timeZone: TZ,
        status,
        responsibleUserId: responsible.id,
        caseId: kase.id,
        clientId: kase.client.id,
        sourceDescription:
          type === "COURT" && kase.court
            ? `Rešenje – ${kase.court}, primljeno ${formatDate(addDays(due, -15))}`
            : type === "STATUTORY"
              ? "Zakonski rok"
              : type === "CONTRACTUAL"
                ? "Rok iz ugovora sa drugom stranom"
                : "Interni rok kancelarije",
        satisfiedAt:
          satisfiedAt && satisfiedAt < createdAt ? createdAt : satisfiedAt,
        satisfiedByUserId: status === "SATISFIED" ? responsible.id : null,
        createdByUserId: kase.responsible.id,
        createdAt,
        updatedAt: satisfiedAt ?? createdAt,
      };
      deadlines.push(row);
      if (!deadlineByCase.has(kase.id)) deadlineByCase.set(kase.id, []);
      deadlineByCase.get(kase.id).push({ row, due });
      log("DEADLINE_CREATED", "Deadline", row.id, createdAt, {
        caseId: kase.id,
        clientId: kase.client.id,
        actorUserId: kase.responsible.id,
        metadata: { title: row.title, type },
      });
      if (status !== "OPEN")
        log(
          `DEADLINE_${status}`,
          "Deadline",
          row.id,
          row.satisfiedAt ?? local(due, 9),
          {
            caseId: kase.id,
            actorUserId: responsible.id,
            metadata: { title: row.title },
          },
        );
    }
  }

  // ------------------------------------------------------------------ tasks
  const tasks = [];
  const taskMeta = [];
  function taskStatus(due, kase) {
    if (kase && (kase.status === "CLOSED" || kase.status === "ARCHIVED"))
      return chance(0.9) ? "DONE" : "CANCELLED";
    const days = daysBetween(TODAY, due);
    if (days < 0)
      return weighted([
        ["DONE", 78],
        ["CANCELLED", 7],
        ["IN_PROGRESS", 9],
        ["TODO", 6],
      ]);
    if (days <= 7)
      return weighted([
        ["TODO", 45],
        ["IN_PROGRESS", 40],
        ["DONE", 15],
      ]);
    return weighted([
      ["TODO", 80],
      ["IN_PROGRESS", 17],
      ["DONE", 3],
    ]);
  }
  function addTask({
    title,
    description,
    assignee,
    creator,
    kase = null,
    client = null,
    due,
    exactHour = null,
    priority,
    deadlineId = null,
  }) {
    const status = taskStatus(due, kase);
    let createdAt = clampPast(
      local(addDays(due, -randomInt(4, 20)), 9, randomInt(0, 59)),
    );
    let completedAt = null;
    if (status === "DONE") {
      completedAt = clampPast(
        local(
          minIso(addDays(due, -randomInt(0, 2)), TODAY),
          randomInt(10, 17),
          randomInt(0, 59),
        ),
      );
      if (completedAt < createdAt) createdAt = addMinutes(completedAt, -240);
    }
    const linkedClient = kase?.client ?? client;
    const row = {
      id: randomUUID(),
      workspaceId,
      title: linkedClient ? `${title} (${linkedClient.displayName})` : title,
      description,
      status,
      priority,
      assigneeUserId: assignee.id,
      dueDate: exactHour === null ? dateOnly(due) : null,
      dueAt: exactHour === null ? null : local(due, exactHour),
      caseId: kase?.id ?? null,
      clientId: linkedClient?.id ?? null,
      deadlineId,
      completedAt,
      completedByUserId: completedAt ? assignee.id : null,
      createdByUserId: creator.id,
      createdAt,
      updatedAt: completedAt ?? createdAt,
    };
    tasks.push(row);
    taskMeta.push({ row, kase, client: linkedClient, assignee });
    log("TASK_CREATED", "Task", row.id, createdAt, {
      caseId: row.caseId,
      clientId: row.clientId,
      actorUserId: creator.id,
      metadata: { title: row.title, assigneeUserId: assignee.id },
    });
    if (status === "DONE" || status === "CANCELLED")
      log(
        `TASK_${status}`,
        "Task",
        row.id,
        completedAt ?? addMinutes(createdAt, 60 * 24),
        {
          caseId: row.caseId,
          actorUserId: assignee.id,
          metadata: { title: row.title },
        },
      );
    return row;
  }
  const taskPriority = (kase) =>
    kase?.priority === "URGENT"
      ? weighted([
          ["URGENT", 4],
          ["HIGH", 4],
          ["NORMAL", 2],
        ])
      : weighted([
          ["LOW", 20],
          ["NORMAL", 55],
          ["HIGH", 20],
          ["URGENT", 5],
        ]);
  for (const kase of cases) {
    if (kase.status === "ARCHIVED") continue;
    const from = maxIso(kase.opened, "2026-09-01");
    const to = kase.closed ?? "2026-11-13";
    if (from > to) continue;
    const pool =
      TASK_TEMPLATES[kase.kind === "criminal" ? "litigation" : kase.kind];
    const count =
      kase.status === "DRAFT"
        ? 2
        : kase.status === "ON_HOLD"
          ? randomInt(2, 3)
          : randomInt(5, 9);
    for (const [title, description] of shuffle(pool).slice(0, count)) {
      const assignee = chance(0.6)
        ? kase.responsible
        : pick(kase.collaborators);
      addTask({
        title,
        description,
        assignee,
        creator: kase.responsible,
        kase,
        due: addDays(from, randomInt(0, daysBetween(from, to))),
        exactHour: chance(0.15) ? pick([10, 12, 14, 16]) : null,
        priority: taskPriority(kase),
      });
    }
    if (kase.court && kase.status === "ACTIVE")
      for (const [title, description] of shuffle(TRAINEE_TASKS).slice(
        0,
        randomInt(1, 3),
      )) {
        const trainee =
          kase.collaborators.find((c) => trainees.some((t) => t.id === c.id)) ??
          pick(trainees);
        addTask({
          title,
          description,
          assignee: trainee,
          creator: kase.responsible,
          kase,
          due: addDays(from, randomInt(0, daysBetween(from, to))),
          priority: "NORMAL",
        });
      }
    for (const { row, due } of deadlineByCase.get(kase.id) ?? []) {
      const taskDue = addDays(due, -randomInt(1, 3));
      if (taskDue < from) continue;
      addTask({
        title: `Pripremiti radnju pre roka: ${row.title.split(" – ")[0]}`,
        description:
          "Završiti pripremu najmanje dan pre isteka roka i dostaviti na internu reviziju.",
        assignee: kase.responsible,
        creator: kase.responsible,
        kase,
        due: taskDue,
        priority: row.type === "COURT" ? "HIGH" : "NORMAL",
        deadlineId: row.id,
      });
    }
  }
  for (const user of [...lawyers, ...trainees])
    for (const [title, description] of shuffle(INTERNAL_TASKS).slice(
      0,
      randomInt(2, 4),
    ))
      addTask({
        title,
        description,
        assignee: user,
        creator: user.id === bojana.id || chance(0.5) ? user : bojana,
        due: pick(WORKDAYS),
        priority: weighted([
          ["LOW", 3],
          ["NORMAL", 5],
          ["HIGH", 1],
        ]),
      });
  for (const iso of WORKDAYS.filter((_, i) => i % 2 === 0)) {
    const [title, description] = pick(DESK_TASKS);
    const client =
      title.includes("fakture") ||
      title.includes("kurirsku") ||
      title.includes("tumača")
        ? pick([...clients.values()].filter((c) => c.status !== "ARCHIVED"))
        : null;
    addTask({
      title,
      description,
      assignee: stefan,
      creator: pick([bojana, stefan, djordje]),
      client,
      due: iso,
      exactHour: chance(0.3) ? 12 : null,
      priority: weighted([
        ["LOW", 4],
        ["NORMAL", 5],
        ["HIGH", 1],
      ]),
    });
  }

  // ----------------------------------------------------------------- events
  const events = [];
  const eventMeta = [];
  const eventAssignees = [];
  const eventClients = [];
  const eventAttendees = [];
  const busy = new Map();
  const blocked = new Set();
  const busyList = (user, iso) => {
    const key = `${user.id}|${iso}`;
    if (!busy.has(key)) busy.set(key, []);
    return busy.get(key);
  };
  const free = (people, iso, start, end) =>
    people.every(
      (u) =>
        !blocked.has(`${u.id}|${iso}`) &&
        busyList(u, iso).every(([s, e]) => end <= s || start >= e),
    );
  const reserve = (people, iso, start, end) =>
    people.forEach((u) => busyList(u, iso).push([start, end]));
  const STARTS = Array.from({ length: 17 }, (_, i) => 9 * 60 + i * 30);
  function findSlot(people, iso, duration, starts = STARTS) {
    for (const start of shuffle(starts)) {
      const end = start + duration;
      if (end > 18 * 60) continue;
      if (free(people, iso, start, end)) {
        reserve(people, iso, start, end);
        return start;
      }
    }
    return null;
  }
  function eventStatus(startsAt, endsAt) {
    if (endsAt <= NOW)
      return weighted([
        ["COMPLETED", 87],
        ["CANCELLED", 9],
        ["SCHEDULED", 4],
      ]);
    return startsAt > NOW && chance(0.07) ? "CANCELLED" : "SCHEDULED";
  }
  function addEvent({
    organizer,
    assignees = [organizer],
    iso,
    start = null,
    duration = 60,
    allDayTo = null,
    type,
    title,
    description,
    kase = null,
    client = null,
    location = null,
    meetingUrl = null,
    category = SAV,
    status = null,
  }) {
    const allDay = start === null;
    const startsAt = allDay
      ? local(iso)
      : local(iso, Math.floor(start / 60), start % 60);
    const endsAt = allDay
      ? local(addDays(allDayTo ?? iso, 1))
      : addMinutes(startsAt, duration);
    const finalStatus = status ?? eventStatus(startsAt, endsAt);
    const id = randomUUID();
    const createdAt = clampPast(
      new Date(startsAt.getTime() - randomInt(2, 20) * 86400000),
    );
    const linkedClient = kase?.client ?? client;
    events.push({
      id,
      workspaceId,
      type,
      title,
      description,
      startsAt,
      endsAt,
      timeZone: TZ,
      isAllDay: allDay,
      status: finalStatus,
      location,
      meetingUrl,
      courtName: type === "HEARING" ? (kase?.court ?? null) : null,
      courtroom: type === "HEARING" ? `Sudnica ${randomInt(1, 40)}` : null,
      organizerUserId: organizer.id,
      caseId: kase?.id ?? null,
      createdByUserId: organizer.id,
      createdAt,
      updatedAt:
        finalStatus === "SCHEDULED"
          ? createdAt
          : clampPast(
              finalStatus === "COMPLETED"
                ? endsAt
                : addMinutes(startsAt, -60 * 20),
            ),
    });
    for (const user of new Map(assignees.map((u) => [u.id, u])).values())
      eventAssignees.push({ workspaceId, eventId: id, userId: user.id });
    if (linkedClient) {
      eventClients.push({
        workspaceId,
        eventId: id,
        clientId: linkedClient.id,
      });
      if (type !== "OTHER")
        eventAttendees.push({
          id: randomUUID(),
          workspaceId,
          eventId: id,
          clientContactId: linkedClient.contact?.id ?? null,
          displayName: linkedClient.contact
            ? `${linkedClient.contact.firstName} ${linkedClient.contact.lastName}`
            : linkedClient.displayName,
          email: linkedClient.contact?.email ?? linkedClient.email,
        });
    }
    eventMeta.push({
      id,
      organizer,
      assignees,
      kase,
      client: linkedClient,
      type,
      title,
      description,
      startsAt,
      endsAt,
      allDay,
      status: finalStatus,
      category,
    });
    log("EVENT_CREATED", "Event", id, createdAt, {
      caseId: kase?.id ?? null,
      clientId: linkedClient?.id ?? null,
      actorUserId: organizer.id,
      metadata: { title, type },
    });
    if (finalStatus === "COMPLETED")
      log("EVENT_COMPLETED", "Event", id, endsAt, {
        caseId: kase?.id ?? null,
        actorUserId: organizer.id,
        metadata: { title },
      });
    if (finalStatus === "CANCELLED")
      log("EVENT_CANCELLED", "Event", id, addMinutes(startsAt, -60 * 20), {
        caseId: kase?.id ?? null,
        actorUserId: organizer.id,
        metadata: { title },
      });
  }
  const officeRoom = () =>
    pick([
      "Kancelarija – sala za sastanke 1",
      "Kancelarija – sala za sastanke 2",
      "Kancelarija – velika sala",
    ]);
  const meetUrl = (text) =>
    `https://meet.stojkovic-advokati.rs/${slug(text).slice(0, 40)}-${randomInt(100, 999)}`;

  // Fixed calendar: vacations, seminars and team rituals.
  const blockDays = (user, from, to) => {
    for (let iso = from; iso <= to; iso = addDays(iso, 1))
      blocked.add(`${user.id}|${iso}`);
  };
  addEvent({
    organizer: ljubica,
    iso: "2026-09-07",
    allDayTo: "2026-09-11",
    type: "OTHER",
    title: "Godišnji odmor – Ljubica Gajić",
    description: "Zamena za hitne predmete: Marija Bradić.",
    category: ADM,
    status: "COMPLETED",
  });
  blockDays(ljubica, "2026-09-07", "2026-09-11");
  addEvent({
    organizer: bojana,
    assignees: [...lawyers, ...trainees],
    iso: "2026-09-18",
    type: "OTHER",
    title: "Seminar AKB – primena izmena Zakona o parničnom postupku",
    description:
      "Celodnevni seminar Advokatske komore Beograda. Obavezno prisustvo zbog bodova stručnog usavršavanja.",
    location: "Advokatska komora Beograda, Dečanska 13",
    category: ADM,
    status: NOW > local("2026-09-19") ? "COMPLETED" : "SCHEDULED",
  });
  for (const user of [...lawyers, ...trainees])
    blockDays(user, "2026-09-18", "2026-09-18");
  addEvent({
    organizer: vladimir,
    iso: "2026-10-02",
    type: "OTHER",
    title: "Slobodan dan – Vladimir Joksimović",
    description:
      "Korišćenje slobodnog dana. Hitne stvari preuzima Đorđe Nikolić.",
    category: ADM,
    status: NOW > local("2026-10-03") ? "COMPLETED" : "SCHEDULED",
  });
  blockDays(vladimir, "2026-10-02", "2026-10-02");
  addEvent({
    organizer: bojana,
    assignees: users,
    iso: "2026-10-23",
    type: "OTHER",
    title: "Dan kancelarije – izlet na Frušku goru",
    description:
      "Zajednički izlet tima. Kancelarija je zatvorena; telefon preusmeren na dežurni broj.",
    location: "Fruška gora – Iriški venac",
    category: ADM,
    status: "SCHEDULED",
  });
  for (const user of users) blockDays(user, "2026-10-23", "2026-10-23");
  addEvent({
    organizer: petar,
    iso: "2026-10-27",
    allDayTo: "2026-10-28",
    type: "OTHER",
    title: "Pravosudni ispit – pismeni deo (Petar Petrović)",
    description:
      "Polaganje pismenog dela pravosudnog ispita u Ministarstvu pravde.",
    location: "Ministarstvo pravde, Nemanjina 22-26",
    category: ADM,
    status: "SCHEDULED",
  });
  blockDays(petar, "2026-10-27", "2026-10-28");
  for (const iso of WORKDAYS) {
    const weekday = local(iso).getDay();
    if (weekday === 1) {
      const people = users.filter((u) => !blocked.has(`${u.id}|${iso}`));
      reserve(people, iso, 8 * 60 + 30, 9 * 60 + 15);
      addEvent({
        organizer: bojana,
        assignees: people,
        iso,
        start: 8 * 60 + 30,
        duration: 45,
        type: "MEETING",
        title: "Kolegijum – nedeljni pregled predmeta i rokova",
        description:
          "Pregled ročišta i rokova za narednu nedelju, raspodela hitnih zadataka i otvorena pitanja.",
        location: "Kancelarija – velika sala",
        category: ADM,
      });
    }
    if (
      weekday === 3 &&
      free([bojana, petar, milica], iso, 15 * 60 + 30, 16 * 60 + 15)
    ) {
      reserve([bojana, petar, milica], iso, 15 * 60 + 30, 16 * 60 + 15);
      addEvent({
        organizer: bojana,
        assignees: [bojana, petar, milica],
        iso,
        start: 15 * 60 + 30,
        duration: 45,
        type: "MEETING",
        title: "Mentorski sastanak sa pripravnicima",
        description:
          "Pregled podnesaka pripravnika, pitanja iz prakse i priprema za pravosudni ispit.",
        location: "Kancelarija – sala za sastanke 2",
        category: ADM,
      });
    }
  }
  const markovicCase = cases.find((kase) => kase.client.key === "markovic");
  addEvent({
    organizer: bojana,
    iso: "2026-09-26",
    start: 10 * 60,
    duration: 90,
    type: "MEETING",
    title: "Hitno – prisustvo saslušanju osumnjičenog u policiji",
    description:
      "Klijent zadržan radi saslušanja. Odbrana prisustvuje saslušanju u PU za Grad Beograd.",
    kase: markovicCase,
    location: "PU za Grad Beograd, 29. novembra 2",
    category: ZAS,
  });
  addEvent({
    organizer: bojana,
    assignees: [bojana, vladimir],
    iso: "2026-10-10",
    start: 11 * 60,
    duration: 60,
    type: "CALL",
    title: "Vikend konsultacija – strategija odbrane",
    description:
      "Kratak poziv radi usaglašavanja strategije pred glavni pretres.",
    kase: markovicCase,
    meetingUrl: meetUrl("strategija odbrane"),
    location: "Online",
    category: SAV,
  });

  // Hearings for court cases.
  for (const kase of cases.filter((c) => c.court && c.status === "ACTIVE")) {
    const count =
      randomInt(1, 2) + (["HIGH", "URGENT"].includes(kase.priority) ? 1 : 0);
    const titles =
      HEARING_TITLES[
        kase.kind === "criminal"
          ? "criminal"
          : kase.kind === "administrative"
            ? "administrative"
            : "litigation"
      ];
    for (const iso of shuffle(WORKDAYS.filter((d) => d >= kase.opened)).slice(
      0,
      count,
    )) {
      const trainee = kase.collaborators.find((c) =>
        trainees.some((t) => t.id === c.id),
      );
      const people =
        trainee && chance(0.45)
          ? [kase.responsible, trainee]
          : [kase.responsible];
      const duration = pick([45, 60, 90]);
      const start = findSlot(
        people,
        iso,
        duration,
        [9, 9.5, 10, 10.5, 11, 11.5, 12, 13].map((h) => h * 60),
      );
      if (start === null) continue;
      addEvent({
        organizer: kase.responsible,
        assignees: people,
        iso,
        start,
        duration,
        type: "HEARING",
        title: `${pick(titles)} – ${kase.client.displayName}`,
        description:
          "Poneti punomoćje, dokazni materijal i poslednju verziju procesne beleške. Potvrditi dolazak klijenta dan ranije.",
        kase,
        location: COURTS[kase.court],
        category: ZAS,
      });
    }
  }

  // Daily calendar for every persona.
  function lawyerEvent(user, iso) {
    const mine = casesOf(user, iso);
    if (!mine.length) return null;
    const kase = pick(mine);
    const client = kase.client;
    const roll = random();
    if (roll < 0.28)
      return {
        type: "MEETING",
        duration: pick([45, 60, 90]),
        title: `Sastanak sa klijentom – ${client.displayName}`,
        description: `Razgovor o predmetu „${kase.name}“ i dogovor o narednim koracima.`,
        kase,
        location: chance(0.75)
          ? officeRoom()
          : `Kod klijenta – ${client.street}, ${client.city}`,
        category: SAV,
      };
    if (roll < 0.52) {
      const video = chance(0.4);
      return {
        type: "CALL",
        duration: pick([15, 30, 30, 45]),
        title: `${video ? "Video poziv" : "Telefonski razgovor"} – ${client.displayName}`,
        description:
          "Statusni razgovor, potvrda činjenica i prikupljanje dopunskih informacija.",
        kase,
        meetingUrl: video ? meetUrl(client.displayName) : null,
        location: video ? "Online" : null,
        category: SAV,
      };
    }
    if (roll < 0.64 && kase.opposing)
      return {
        type: "MEETING",
        duration: pick([60, 90, 120]),
        title: `Pregovori sa suprotnom stranom – ${kase.opposing}`,
        description:
          "Pregovori o mogućem poravnanju. Ovlašćenja klijenta potvrđena pisanim putem.",
        kase,
        location: chance(0.5)
          ? officeRoom()
          : "Kancelarija advokata suprotne strane",
        category: PRE,
      };
    if (roll < 0.76)
      return {
        type: "MEETING",
        duration: pick([30, 45, 60]),
        title: `Interni sastanak – strategija u predmetu ${kase.caseNumber}`,
        description:
          "Usaglašavanje procesne strategije i podela zaduženja u timu.",
        kase,
        location: officeRoom(),
        extra: kase.collaborators,
        category: SAV,
      };
    if (roll < 0.9)
      return {
        type: "OTHER",
        duration: 120,
        title: `Rad na podnesku – ${kase.name}`,
        description: "Blokirano vreme za izradu podneska bez prekida.",
        kase,
        location: "Kancelarija",
        category: kase.kind === "advisory" ? UGO : POD,
      };
    return {
      type: "OTHER",
      duration: 60,
      title: `Overa dokumenata kod javnog beležnika – ${client.displayName}`,
      description: "Overa potpisa na ugovoru i punomoćju.",
      kase,
      location: `Javni beležnik ${pick(NOTARIES)}`,
      category: ADM,
    };
  }
  function traineeEvent(user, iso) {
    const mine = casesOf(user, iso);
    if (!mine.length) return null;
    const kase = pick(mine);
    const roll = random();
    if (roll < 0.3 && kase.court)
      return {
        type: "OTHER",
        duration: pick([60, 90]),
        title: `Uvid u spise predmeta ${kase.caseNumber}`,
        description:
          "Uvid u spise i fotokopiranje novih podnesaka i zapisnika.",
        kase,
        location: COURTS[kase.court],
        category: ZAS,
      };
    if (roll < 0.5 && kase.court)
      return {
        type: "OTHER",
        duration: 60,
        title: `Predaja podneska na pisarnici – ${kase.court}`,
        description:
          "Predaja podneska u tri primerka i preuzimanje potvrde o prijemu.",
        kase,
        location: COURTS[kase.court],
        category: ADM,
      };
    if (roll < 0.68)
      return {
        type: "CALL",
        duration: pick([15, 30]),
        title: `Poziv klijentu – dostava dokumentacije (${kase.client.displayName})`,
        description:
          "Dogovor o dostavi originala dokumentacije i potpisu punomoćja.",
        kase,
        category: ADM,
      };
    if (roll < 0.85)
      return {
        type: "MEETING",
        duration: 45,
        title: `Priprema za ročište sa mentorom – ${kase.caseNumber}`,
        description:
          "Prolazak kroz spise, pitanja za svedoke i plan izlaganja.",
        kase,
        location: officeRoom(),
        extra: [kase.responsible],
        category: ZAS,
      };
    return {
      type: "OTHER",
      duration: 90,
      title: `Istraživanje sudske prakse – ${kase.name}`,
      description:
        "Pretraga baze Paragraf Lex i sajtova sudova i izrada kratkog pregleda.",
      kase,
      location: "Kancelarija – biblioteka",
      category: POD,
    };
  }
  function deskEvent(user, iso) {
    const activeClients = [...clients.values()].filter(
      (c) => c.status === "ACTIVE",
    );
    const roll = random();
    if (roll < 0.3)
      return {
        type: "OTHER",
        duration: 45,
        title: "Prijem i zavođenje ulazne pošte",
        description:
          "Skeniranje, zavođenje i raspodela pošte odgovornim advokatima.",
        location: "Kancelarija – prijemna kancelarija",
        category: ADM,
        starts: [9 * 60, 9 * 60 + 30],
      };
    if (roll < 0.55) {
      const client = pick(activeClients);
      return {
        type: "MEETING",
        duration: 30,
        title: `Prijem stranke – ${client.displayName}`,
        description:
          "Prijem dokumentacije od klijenta i izdavanje potvrde o prijemu.",
        client,
        location: "Kancelarija – prijemna kancelarija",
        category: ADM,
      };
    }
    if (roll < 0.72)
      return {
        type: "OTHER",
        duration: 90,
        title: "Kurirska dostava podnesaka u sudove",
        description:
          "Obilazak pisarnica Prvog osnovnog i Privrednog suda u Beogradu.",
        location: "Sudovi u Beogradu",
        category: ADM,
      };
    if (roll < 0.86)
      return {
        type: "CALL",
        duration: 30,
        title: "Zakazivanje termina za klijente",
        description: "Potvrđivanje sutrašnjih sastanaka i slanje podsetnika.",
        category: ADM,
      };
    return {
      type: "OTHER",
      duration: 90,
      title: "Arhiviranje zatvorenih predmeta",
      description: "Popis i pakovanje spisa zatvorenih predmeta za arhivu.",
      location: "Kancelarija – arhiva",
      category: ADM,
    };
  }
  for (const iso of WORKDAYS)
    for (const user of users) {
      if (blocked.has(`${user.id}|${iso}`)) continue;
      const desk = isDesk(user);
      const trainee = trainees.some((t) => t.id === user.id);
      const target = desk
        ? randomInt(1, 2)
        : trainee
          ? randomInt(1, 3)
          : randomInt(2, 3);
      for (let i = 0; i < target; i++) {
        const plan = desk
          ? deskEvent(user, iso)
          : trainee
            ? traineeEvent(user, iso)
            : lawyerEvent(user, iso);
        if (!plan) continue;
        const people = [
          user,
          ...(plan.extra ?? []).filter(
            (u) => u.id !== user.id && !blocked.has(`${u.id}|${iso}`),
          ),
        ];
        const start = findSlot(
          people,
          iso,
          plan.duration,
          plan.starts ?? STARTS,
        );
        if (start === null) continue;
        addEvent({ organizer: user, assignees: people, iso, start, ...plan });
      }
    }

  // ----------------------------------------------------------- work entries
  const entries = [];
  function entryStatus(iso) {
    const age = daysBetween(iso, TODAY);
    if (iso < "2026-10-01")
      return weighted([
        ["CONFIRMED", 92],
        ["WRITTEN_OFF", 5],
        ["PROPOSED", 3],
      ]);
    if (age <= 2)
      return weighted([
        ["PROPOSED", 60],
        ["CONFIRMED", 40],
      ]);
    return weighted([
      ["CONFIRMED", 73],
      ["PROPOSED", 20],
      ["WRITTEN_OFF", 7],
    ]);
  }
  function treatmentFor(client, iso, category, court) {
    if (!client) return "NON_BILLABLE";
    if (client.billing === "PRO_BONO") return "NON_BILLABLE";
    const agreement = agreementOn(client, iso);
    if (agreement)
      return agreement.cats.includes(category)
        ? "RETAINER"
        : agreement.outOfScope === "AT"
          ? "AT"
          : "HOURLY";
    if (client.billing === "AT") return court || chance(0.55) ? "AT" : "HOURLY";
    if (client.currency === "RSD" && court && chance(0.25)) return "AT";
    return "HOURLY";
  }
  function addEntry({
    user,
    iso,
    minutes,
    title,
    description = "",
    kase = null,
    client = null,
    category,
    source = "MANUAL",
    taskId = null,
    eventId = null,
    sourceType = null,
    sourceId = null,
    court = false,
    treatment = null,
    status = null,
    createdAt = null,
  }) {
    const linkedClient = kase?.client ?? client;
    const finalTreatment =
      treatment ?? treatmentFor(linkedClient, iso, category, court);
    let finalStatus = status ?? entryStatus(iso);
    let entryTreatment = finalTreatment;
    if (
      finalStatus === "PROPOSED" &&
      finalTreatment !== "NON_BILLABLE" &&
      chance(0.3)
    )
      entryTreatment = "UNDECIDED";
    const value =
      entryTreatment === "AT"
        ? pick(AT_VALUES[category] ?? [12000, 15000]).toFixed(2)
        : null;
    const created = clampPast(
      createdAt ?? local(iso, randomInt(16, 19), randomInt(0, 59)),
    );
    const row = {
      id: randomUUID(),
      workspaceId,
      userId: user.id,
      clientId: linkedClient?.id ?? null,
      caseId: kase?.id ?? null,
      taskId,
      eventId,
      workDate: dateOnly(iso),
      minutes,
      timerStartedAt: null,
      title: title.slice(0, 200),
      description,
      serviceCategoryId: refs.category.get(category).id,
      treatment: entryTreatment,
      value,
      currency: linkedClient?.currency ?? null,
      status: finalStatus,
      writeOffReason:
        finalStatus === "WRITTEN_OFF" ? pick(WRITE_OFF_REASONS) : null,
      source,
      sourceType,
      sourceId,
      invoiceLineId: null,
      aiParsed: source === "QUICK_CAPTURE" && chance(0.6),
      createdByUserId: user.id,
      updatedByUserId: user.id,
      createdAt: created,
      updatedAt: created,
    };
    entries.push({ row, iso, client: linkedClient, kase, category });
    return row;
  }

  // Work recorded from completed events.
  for (const meta of eventMeta) {
    if (meta.status !== "COMPLETED" || meta.allDay) continue;
    const iso = ymd(meta.startsAt);
    const minutes = Math.round((meta.endsAt - meta.startsAt) / 60000);
    const common = {
      user: meta.organizer,
      iso,
      minutes,
      title: meta.title,
      description: meta.description ?? "",
      source: "EVENT",
      eventId: meta.id,
      sourceType: "EVENT",
      sourceId: meta.id,
      createdAt: addMinutes(meta.endsAt, randomInt(5, 120)),
    };
    if (meta.client && !isDesk(meta.organizer) && chance(0.82))
      addEntry({
        ...common,
        kase: meta.kase,
        client: meta.client,
        category: meta.category,
        court: meta.type === "HEARING",
      });
    else if (!meta.client && meta.title.startsWith("Kolegijum") && chance(0.5))
      addEntry({
        ...common,
        category: ADM,
        treatment: "NON_BILLABLE",
        status: "CONFIRMED",
      });
    else if (!meta.client && meta.title.startsWith("Mentorski") && chance(0.6))
      addEntry({
        ...common,
        category: ADM,
        treatment: "NON_BILLABLE",
        status: daysBetween(iso, TODAY) <= 2 ? "PROPOSED" : "CONFIRMED",
      });
    if (meta.type === "HEARING" && meta.assignees.length > 1 && chance(0.6))
      addEntry({
        user: meta.assignees[1],
        iso,
        minutes,
        title: `Prisustvo ročištu sa mentorom – ${meta.kase.caseNumber}`,
        kase: meta.kase,
        category: ZAS,
        treatment: "NON_BILLABLE",
        status: "CONFIRMED",
        createdAt: addMinutes(meta.endsAt, 60),
      });
  }
  // Work recorded when completing tasks.
  for (const { row, kase, client, assignee } of taskMeta) {
    if (row.status !== "DONE" || !client || isDesk(assignee) || !chance(0.55))
      continue;
    const iso = ymd(row.completedAt);
    if (iso < "2026-08-15") continue;
    const category = pick(
      CATEGORY_POOL[
        kase?.kind === "criminal" ? "litigation" : (kase?.kind ?? "advisory")
      ],
    );
    addEntry({
      user: assignee,
      iso,
      minutes: pick(MINUTES),
      title: row.title,
      description: row.description ?? "",
      kase,
      client,
      category,
      source: "TASK",
      taskId: row.id,
      sourceType: "TASK",
      sourceId: row.id,
      createdAt: addMinutes(row.completedAt, 5),
    });
  }
  // Daily manual, quick-capture, timer and e-mail entries.
  const workers = [...lawyers, ...trainees];
  for (const iso of WORKDAYS.filter((d) => d <= TODAY))
    for (const user of [...workers, stefan]) {
      if (blocked.has(`${user.id}|${iso}`)) continue;
      const mine = casesOf(user, iso);
      if (isDesk(user)) {
        if (!chance(0.6)) continue;
        const kase = pick(cases.filter((c) => activeOn(c, iso)));
        addEntry({
          user,
          iso,
          minutes: pick([15, 30, 45]),
          title: pick([
            "Kopiranje i overa dokumentacije",
            "Zavođenje pošte za predmet",
            "Dostava pismena u sud",
          ]),
          kase,
          category: ADM,
          treatment: "NON_BILLABLE",
          status: iso < TODAY ? "CONFIRMED" : "PROPOSED",
        });
        continue;
      }
      if (!mine.length) continue;
      let count = randomInt(2, 4);
      if (iso === TODAY) count = NOW.getHours() >= 12 ? randomInt(1, 2) : 0;
      for (let i = 0; i < count; i++) {
        const kase = pick(mine);
        const pool =
          CATEGORY_POOL[kase.kind === "criminal" ? "litigation" : kase.kind];
        const category = pick(pool);
        const source = weighted([
          ["MANUAL", 50],
          ["QUICK_CAPTURE", 20],
          ["TIMER", 15],
          ["EMAIL", 15],
        ]);
        const noCase = kase.client.billing === "RETAINER" && chance(0.12);
        const title =
          source === "EMAIL"
            ? `Korespondencija e-poštom – ${kase.client.displayName}`
            : `${pick(WORK_TITLES[source === "EMAIL" ? ADM : category])}${noCase ? ` – ${kase.client.displayName}` : ""}`;
        addEntry({
          user,
          iso,
          minutes: source === "EMAIL" ? pick([12, 18, 24, 30]) : pick(MINUTES),
          title,
          description: chance(0.4)
            ? `Predmet: ${kase.name}. ${pick(["Urađeno prema dogovoru sa odgovornim advokatom.", "Nastavak rada iz prethodnog dana.", "Potrebna je potvrda klijenta pre slanja.", "Uključeni komentari klijenta."])}`
            : "",
          kase: noCase ? null : kase,
          client: kase.client,
          category: source === "EMAIL" ? ADM : category,
          source,
          createdAt:
            iso === TODAY ? addMinutes(NOW, -randomInt(10, 120)) : null,
        });
      }
    }
  // Timers running right now.
  if (!isWeekend(TODAY) && NOW.getHours() >= 8 && NOW.getHours() < 20)
    for (const [user, title] of [
      [djordje, "Izrada odgovora na tužbu"],
      [marija, ""],
      [petar, "Uvid u spise predmeta"],
    ]) {
      const mine = casesOf(user, TODAY);
      if (!mine.length) continue;
      const kase = pick(mine);
      const started = addMinutes(NOW, -randomInt(15, 95));
      const row = addEntry({
        user,
        iso: TODAY,
        minutes: null,
        title,
        kase,
        category: title ? POD : SAV,
        source: "TIMER",
        status: "RUNNING",
        createdAt: started,
      });
      row.timerStartedAt = started;
      if (row.treatment === "AT") row.value = null;
    }

  // --------------------------------------------------------------- invoices
  const sequenceState = await db.invoiceNumberSequenceState.findUnique({
    where: { workspaceId_periodKey: { workspaceId, periodKey: "2026" } },
  });
  let invoiceSeq = sequenceState?.lastSequenceValue ?? 0;
  const invoices = [];
  const invoiceLines = [];
  const invoiceLineCases = [];
  function createInvoice({
    client,
    created,
    turnover,
    status,
    billingMonth = null,
    voided = null,
    replacementFor = null,
    comment = null,
  }) {
    const domesticVat = client.country === "RS";
    const vatRate = domesticVat ? 20 : 0;
    const createdAt = local(created, 10, randomInt(0, 59));
    const sentAt =
      status === "DRAFT" ? null : local(created, 14, randomInt(0, 59));
    const invoiceNumber = `2026-${String(++invoiceSeq).padStart(6, "0")}`;
    const invoice = {
      id: randomUUID(),
      workspaceId,
      clientId: client.id,
      invoiceNumber,
      dateOfCreate: dateOnly(created),
      dateOfMaturity: dateOnly(addDays(created, 15)),
      dateOfTurnover: dateOnly(turnover),
      placeOfIssue: "Beograd",
      methodOfPayment: "Prenos na račun",
      comment:
        comment ??
        `Plaćanje na račun ${client.currency === "EUR" ? `IBAN RS35160510008765432199 (SWIFT DBDBRSBG)` : RSD_ACCOUNT}, poziv na broj ${invoiceNumber}. Specifikacija rada je u prilogu.`,
      netCents: 0,
      vatCents: 0,
      vatRate,
      numberOfCashBill: "",
      country: COUNTRY_NAMES[client.country],
      currency: client.currency,
      vatLiabilityTimingCode: vatRate > 0 ? "35" : null,
      status: voided ? "VOIDED" : status,
      sharedAt: sentAt,
      sharedMethod: sentAt ? "EXTERNAL" : null,
      sharedByUserId: sentAt ? bojana.id : null,
      voidedAt: voided ? local(voided.date, 11) : null,
      voidReason: voided?.reason ?? null,
      voidedByUserId: voided ? bojana.id : null,
      replacementForId: replacementFor?.id ?? null,
      createdByUserId: bojana.id,
      updatedByUserId: bojana.id,
      createdAt,
      updatedAt: voided ? local(voided.date, 11) : (sentAt ?? createdAt),
      printWorkSpecification: true,
      billingMonth,
      lineStatus: status === "DRAFT" ? "RESERVED" : "BILLED",
      billedAt: sentAt,
      lineCount: 0,
    };
    invoices.push(invoice);
    return invoice;
  }
  function addLine(
    invoice,
    {
      description,
      net,
      minutes = null,
      performer,
      items = [],
      serviceDate,
      sourceType = null,
      sourceId = null,
      attach = true,
    },
  ) {
    const netCents = toCents(net);
    const vatCents = Math.round((netCents * invoice.vatRate) / 100);
    const line = {
      id: randomUUID(),
      workspaceId,
      invoiceId: invoice.id,
      clientId: invoice.clientId,
      performedByUserId: performer.id,
      lineOrder: invoice.lineCount++,
      description,
      serviceDate: dateOnly(serviceDate),
      netAmount: centsToMoney(netCents),
      vatRate: invoice.vatRate.toFixed(2),
      taxCategoryCode: invoice.vatRate > 0 ? "S20" : "O",
      taxExemptionReasonCode: null,
      taxExemptionReasonText:
        invoice.vatRate > 0
          ? null
          : "Promet usluga licu iz inostranstva – mesto prometa nije u Republici Srbiji (član 12. Zakona o PDV).",
      vatAmount: centsToMoney(vatCents),
      grossAmount: centsToMoney(netCents + vatCents),
      currency: invoice.currency,
      status: invoice.lineStatus,
      sourceType,
      sourceId,
      pricingRequired: false,
      minutes: minutes && minutes > 0 ? minutes : null,
      billedAt: invoice.billedAt,
      createdByUserId: bojana.id,
      updatedByUserId: bojana.id,
      createdAt: invoice.createdAt,
      updatedAt: invoice.updatedAt,
    };
    invoice.netCents += netCents;
    invoice.vatCents += vatCents;
    invoiceLines.push(line);
    if (attach)
      for (const item of items) {
        item.row.status = "BILLED";
        item.row.invoiceLineId = line.id;
        item.row.updatedAt = clampPast(invoice.createdAt);
        item.row.updatedByUserId = bojana.id;
        log("WORK_ENTRY_BILLED", "WORK_ENTRY", item.row.id, invoice.createdAt, {
          clientId: item.row.clientId,
          caseId: item.row.caseId,
          metadata: { invoiceId: invoice.id },
        });
      }
    for (const caseId of new Set(
      items.map((item) => item.row.caseId).filter(Boolean),
    ))
      invoiceLineCases.push({ workspaceId, invoiceLineId: line.id, caseId });
    return line;
  }
  const sumMinutes = (items) =>
    items.reduce((total, item) => total + (item.row.minutes ?? 0), 0);
  const priceMinutes = (minutes, rate) =>
    Math.round((rate * minutes * 100) / 60) / 100;
  function groupByCase(items) {
    const groups = new Map();
    for (const item of items) {
      const key = item.kase?.id ?? `cat:${item.category}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(item);
    }
    return [...groups.values()].map((group) => ({
      items: group,
      description: group[0].kase
        ? `${group[0].kase.caseNumber} ${group[0].kase.name}`
        : group[0].category,
      minutes: sumMinutes(group),
      performer: group[0].kase?.responsible ?? group[0].client.responsible,
    }));
  }
  // Mirrors the month-end run: fee (net), overage, out-of-scope, hourly and tariff lines.
  function monthPlan(client, monthStart, monthEnd) {
    const label = `${MONTH_NAMES[Number(monthStart.slice(5, 7)) - 1]} ${monthStart.slice(0, 4)}`;
    const items = entries
      .filter(
        (item) =>
          item.client?.id === client.id &&
          item.iso >= monthStart &&
          item.iso <= monthEnd &&
          item.row.status === "CONFIRMED" &&
          !item.row.invoiceLineId &&
          ["RETAINER", "HOURLY", "AT"].includes(item.row.treatment),
      )
      .sort(
        (a, b) =>
          a.iso.localeCompare(b.iso) || a.row.createdAt - b.row.createdAt,
      );
    const lines = [];
    const daysInMonth = daysBetween(monthStart, monthEnd) + 1;
    const agreement = client.agreements.find(
      (a) => a.active && a.from <= monthEnd && (!a.to || a.to >= monthStart),
    );
    if (agreement) {
      const activeDays =
        daysBetween(
          maxIso(agreement.from, monthStart),
          minIso(agreement.to ?? monthEnd, monthEnd),
        ) + 1;
      const fee =
        Math.round((agreement.fee * activeDays * 100) / daysInMonth) / 100;
      const cap =
        agreement.cap === null
          ? null
          : Math.floor((agreement.cap * activeDays) / daysInMonth);
      const retainerItems = items.filter(
        (item) => item.row.treatment === "RETAINER",
      );
      const covered = [];
      const overage = [];
      let running = 0;
      let overageMinutes = 0;
      for (const item of retainerItems) {
        running += item.row.minutes;
        if (cap === null || running <= cap || agreement.overage === "ABSORBED")
          covered.push(item);
        else {
          overage.push(item);
          overageMinutes += Math.min(item.row.minutes, running - cap);
        }
      }
      lines.push({
        description: `Paušal za ${label}${activeDays < daysInMonth ? ` (srazmerno, ${activeDays}/${daysInMonth} dana)` : ""}`,
        net: fee,
        items: covered,
        minutes: sumMinutes(covered),
        performer: client.responsible,
        sourceType: "RETAINER_FEE",
        sourceId: agreement.id,
      });
      if (overage.length)
        lines.push({
          description: `Prekoračenje paušala: ${formatDuration(overageMinutes)}`,
          net: priceMinutes(overageMinutes, agreement.overageRate),
          items: overage,
          minutes: overageMinutes,
          performer: client.responsible,
        });
    }
    for (const group of groupByCase(
      items.filter((item) => item.row.treatment === "HOURLY"),
    )) {
      const coveredBy = agreementOn(client, group.items[0].iso);
      const rate =
        coveredBy?.outOfScope === "HOURLY" ? coveredBy.outRate : client.hourly;
      lines.push({
        description: coveredBy
          ? `Van paušala: ${group.description}`
          : group.description,
        net: priceMinutes(group.minutes, rate),
        items: group.items,
        minutes: group.minutes,
        performer: group.performer,
      });
    }
    for (const group of groupByCase(
      items.filter((item) => item.row.treatment === "AT"),
    ))
      lines.push({
        description: `${group.description} – po Advokatskoj tarifi`,
        net: group.items.reduce(
          (total, item) => total + Number(item.row.value ?? 0),
          0,
        ),
        items: group.items,
        minutes: group.minutes,
        performer: group.performer,
      });
    return lines.filter((line) => line.net > 0 || line.items.length);
  }
  function billMonth(
    client,
    monthStart,
    monthEnd,
    created,
    status,
    options = {},
  ) {
    const plan = monthPlan(client, monthStart, monthEnd);
    if (!plan.length) return null;
    if (options.voided) {
      const voided = createInvoice({
        client,
        created,
        turnover: monthEnd,
        status: "SENT",
        billingMonth: monthStart.slice(0, 7),
        voided: options.voided,
      });
      for (const line of plan)
        addLine(voided, {
          ...line,
          serviceDate: monthEnd,
          attach: false,
          items: [],
        });
      const replacement = createInvoice({
        client,
        created: options.voided.date,
        turnover: monthEnd,
        status,
        billingMonth: monthStart.slice(0, 7),
        replacementFor: voided,
        comment: `Zamenjuje fakturu ${voided.invoiceNumber} (stornirana zbog pogrešnog PIB-a kupca).`,
      });
      for (const line of plan)
        addLine(replacement, { ...line, serviceDate: monthEnd });
      return replacement;
    }
    const invoice = createInvoice({
      client,
      created,
      turnover: monthEnd,
      status,
      billingMonth: monthStart.slice(0, 7),
    });
    for (const line of plan)
      addLine(invoice, { ...line, serviceDate: monthEnd });
    return invoice;
  }
  // History: retainer fees and hourly work for July and August (no detailed time log).
  for (const [monthStart, monthEnd, created] of [
    ["2026-07-01", "2026-07-31", "2026-08-03"],
    ["2026-08-01", "2026-08-31", "2026-09-02"],
  ]) {
    for (const client of clients.values()) {
      const agreement = client.agreements.find(
        (a) => a.active && a.from <= monthEnd && (!a.to || a.to >= monthStart),
      );
      const hourlyClient = [
        "srbijaAgro",
        "bti",
        "hotel",
        "opstina",
        "vasic",
        "todorovic",
      ].includes(client.key);
      const atClient = ["stojanovic", "ristic", "milosevic"].includes(
        client.key,
      );
      if (!agreement && !hourlyClient && !atClient) continue;
      const invoice = createInvoice({
        client,
        created,
        turnover: monthEnd,
        status: "SENT",
        billingMonth: monthStart.slice(0, 7),
      });
      const label = `${MONTH_NAMES[Number(monthStart.slice(5, 7)) - 1]} ${monthStart.slice(0, 4)}`;
      if (agreement)
        addLine(invoice, {
          description: `Paušal za ${label}`,
          net: agreement.fee,
          performer: client.responsible,
          serviceDate: monthEnd,
          sourceType: "RETAINER_FEE",
          sourceId: agreement.id,
        });
      if (hourlyClient) {
        const minutes = randomInt(8, 30) * 30;
        addLine(invoice, {
          description: `Pravne usluge za ${label} (${formatDuration(minutes)})`,
          net: priceMinutes(minutes, client.hourly),
          minutes,
          performer: client.responsible,
          serviceDate: monthEnd,
        });
      }
      if (atClient)
        addLine(invoice, {
          description: `Zastupanje na ročištu – po Advokatskoj tarifi`,
          net: 18000,
          performer: client.responsible,
          serviceDate: addDays(monthStart, randomInt(5, 25)),
        });
      if (agreement && chance(0.4)) {
        const minutes = randomInt(2, 10) * 30;
        addLine(invoice, {
          description: `Van paušala: zastupanje u sporu (${formatDuration(minutes)})`,
          net: priceMinutes(minutes, agreement.outRate ?? client.hourly),
          minutes,
          performer: client.responsible,
          serviceDate: monthEnd,
        });
      }
    }
  }
  // September: month-end statements. Građevinar is left unbilled for the month-end demo.
  if (TODAY >= "2026-10-05") {
    const DRAFTS = new Set(["dunav", "vasic", "hotel"]);
    const billable = [...clients.values()].filter(
      (client) => client.key !== "gradjevinar" && client.billing !== "PRO_BONO",
    );
    // Numbers follow creation dates: sent statements, the voided one and its replacement, then drafts.
    for (const client of billable.filter(
      (c) => !DRAFTS.has(c.key) && c.key !== "bti",
    ))
      billMonth(client, "2026-09-01", "2026-09-30", "2026-10-02", "SENT");
    billMonth(
      clients.get("bti"),
      "2026-09-01",
      "2026-09-30",
      "2026-10-02",
      "SENT",
      {
        voided: {
          date: "2026-10-03",
          reason: "Na fakturi je naveden pogrešan PIB kupca.",
        },
      },
    );
    for (const client of billable.filter((c) => DRAFTS.has(c.key)))
      billMonth(client, "2026-09-01", "2026-09-30", "2026-10-05", "DRAFT");
  }
  // October: one ad hoc tariff invoice and one advance invoice still in draft.
  if (TODAY >= "2026-10-06") {
    const stojanovic = clients.get("stojanovic");
    const items = entries.filter(
      (item) =>
        item.client?.id === stojanovic.id &&
        item.iso >= "2026-10-01" &&
        item.iso <= "2026-10-05" &&
        item.row.status === "CONFIRMED" &&
        ["AT", "HOURLY"].includes(item.row.treatment) &&
        !item.row.invoiceLineId,
    );
    if (items.length) {
      const invoice = createInvoice({
        client: stojanovic,
        created: "2026-10-06",
        turnover: "2026-10-05",
        status: "SENT",
      });
      for (const group of groupByCase(
        items.filter((item) => item.row.treatment === "AT"),
      ))
        addLine(invoice, {
          description: `${group.description} – po Advokatskoj tarifi`,
          net: group.items.reduce(
            (total, item) => total + Number(item.row.value),
            0,
          ),
          items: group.items,
          minutes: group.minutes,
          performer: group.performer,
          serviceDate: "2026-10-05",
        });
      for (const group of groupByCase(
        items.filter((item) => item.row.treatment === "HOURLY"),
      ))
        addLine(invoice, {
          description: group.description,
          net: priceMinutes(group.minutes, stojanovic.hourly),
          items: group.items,
          minutes: group.minutes,
          performer: group.performer,
          serviceDate: "2026-10-05",
        });
    }
    const todorovic = clients.get("todorovic");
    const advance = createInvoice({
      client: todorovic,
      created: TODAY,
      turnover: TODAY,
      status: "DRAFT",
      comment:
        "Avansni račun – akontacija za pravnu proveru kupoprodaje stana. Konačni obračun po završetku posla.",
    });
    addLine(advance, {
      description: "Akontacija – pravna provera kupoprodaje stana na Vračaru",
      net: 40000,
      performer: todorovic.responsible,
      serviceDate: TODAY,
    });
  }

  // ------------------------------------------------------------------ writes
  const chunked = async (model, rows, size = 500) => {
    for (let i = 0; i < rows.length; i += size)
      await db[model].createMany({ data: rows.slice(i, i + size) });
  };
  await chunked("deadline", deadlines);
  await chunked("task", tasks);
  await chunked("event", events);
  await chunked("eventAssignee", eventAssignees);
  await chunked("eventClient", eventClients);
  await chunked("eventAttendee", eventAttendees);
  const invoiceRow = ({
    netCents,
    vatCents,
    lineStatus,
    billedAt,
    lineCount,
    ...invoice
  }) => ({
    ...invoice,
    netAmount: centsToMoney(netCents),
    vatRate: invoice.vatRate.toFixed(2),
    vatAmount: centsToMoney(vatCents),
    grossAmount: centsToMoney(netCents + vatCents),
  });
  await chunked(
    "invoice",
    invoices.filter((invoice) => !invoice.replacementForId).map(invoiceRow),
  );
  await chunked(
    "invoice",
    invoices.filter((invoice) => invoice.replacementForId).map(invoiceRow),
  );
  await chunked("invoiceLine", invoiceLines);
  await chunked("invoiceLineCase", invoiceLineCases);
  for (const item of entries)
    log("WORK_ENTRY_CREATED", "WORK_ENTRY", item.row.id, item.row.createdAt, {
      actorUserId: item.row.userId,
      clientId: item.row.clientId,
      caseId: item.row.caseId,
      metadata: {
        source: item.row.source,
        status: item.row.status,
        minutes: item.row.minutes,
        treatment: item.row.treatment,
      },
    });
  await chunked(
    "workEntry",
    entries.map((item) => item.row),
  );
  await chunked("caseActivity", caseActivities);
  await chunked("clientActivity", clientActivities);
  await db.invoiceNumberSequenceState.upsert({
    where: { workspaceId_periodKey: { workspaceId, periodKey: "2026" } },
    update: { lastSequenceValue: invoiceSeq },
    create: { workspaceId, periodKey: "2026", lastSequenceValue: invoiceSeq },
  });
  log(MARKER, "DemoSeed", "demo-seed-stojkovic", NOW);
  await chunked("activityLog", logs, 1000);

  const count = (rows, key, value) =>
    rows.filter((row) => row[key] === value).length;
  const statusSummary = (rows, values) =>
    values
      .map((value) => `${value} ${count(rows, "status", value)}`)
      .join(", ");
  const entryRows = entries.map((item) => item.row);
  console.log(
    `Klijenti: ${clients.size}, predmeti: ${cases.length}, rokovi: ${deadlines.length}`,
  );
  console.log(
    `Događaji: ${events.length} (${statusSummary(events, ["SCHEDULED", "COMPLETED", "CANCELLED"])})`,
  );
  console.log(
    `Zadaci: ${tasks.length} (${statusSummary(tasks, ["TODO", "IN_PROGRESS", "DONE", "CANCELLED"])})`,
  );
  console.log(
    `Unosi rada: ${entryRows.length} (${statusSummary(entryRows, ["RUNNING", "PROPOSED", "CONFIRMED", "BILLED", "WRITTEN_OFF"])})`,
  );
  console.log(
    `Paušali: ${agreements.length}, fakture: ${invoices.length} (${statusSummary(invoices, ["DRAFT", "SENT", "VOIDED"])}), stavke: ${invoiceLines.length}`,
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
        // Serialize concurrent seed runs for this workspace.
        await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${workspaceId}))`;
        if (!(await db.workspace.findUnique({ where: { id: workspaceId } })))
          throw new Error("Workspace missing. Run db:seed:auth first.");
        const users = await upsertPersonas(db, workspaceId);
        await ensureOrganization(db, workspaceId);
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
        const marker = await db.activityLog.findFirst({
          where: { workspaceId, action: MARKER },
        });
        if (marker) {
          console.log(
            "Korisnici, podešavanja i podaci kancelarije su ažurirani. Demo podaci već postoje – ništa novo nije dodato.",
          );
          return;
        }
        const refs = await ensureReferences(db, workspaceId, users[0].id);
        await seedData(db, workspaceId, users, refs);
      },
      { maxWait: 10000, timeout: 600000 },
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
