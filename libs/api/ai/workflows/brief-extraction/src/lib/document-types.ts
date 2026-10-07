import {
  DRAFT_DOCUMENT_TYPES,
  type DraftDocumentFamily,
  type DraftDocumentType,
} from "@law/api-interfaces";

export interface DocumentPartyRole {
  /** Stable id; missing-field keys are `<role>Name`, `<role>Address`, `<role>IdNumber`. */
  role: string;
  /** Serbian Latin, nominative (e.g. "Tuženi"). */
  label: string;
  /** Genitive form for task titles and labels ("adresa tuženog"). */
  genitive: string;
}

export interface DocumentField {
  key: string;
  /** Serbian Latin label shown to the lawyer and the model. */
  label: string;
  /** What the model should put in the field. */
  hint: string;
  /** Action-phrased task title when the field is missing. */
  taskTitle: string;
  /** Missing value blocks a time limit: the task is due next working day, HIGH. */
  urgent?: boolean;
  /** Task description for an urgent field; defaults to the service-date wording. */
  urgentDescription?: string;
  /** Used as the suggested case name when present. */
  caseName?: boolean;
}

export interface DocumentTypeDefinition {
  id: DraftDocumentType;
  family: DraftDocumentFamily;
  /** Serbian Latin name of the document ("Žalba"). */
  label: string;
  /** Genitive, lower case ("nacrt žalbe"). */
  labelGenitive: string;
  /** ASCII file-name stem for exports ("zalba"). */
  fileSlug: string;
  /** Short English description for the agent's tool description. */
  agentDescription: string;
  parties: DocumentPartyRole[];
  /** Role that is the office's client unless the lawyer picks another party. */
  defaultClientRole: string;
  fields: DocumentField[];
  /** Ordered sections the draft must contain. */
  structure: string[];
  /** Laws the brief and draft should rely on. */
  legalFrame: string;
  /** Extra drafting rules for this type. */
  draftingRules: string[];
}

export interface DocumentFamilyText {
  /** What the brief lists in `evidence` for this family. */
  evidenceHint: string;
  /** Task title prefix for an evidence item ("Pribaviti dokaz"). */
  evidenceTaskPrefix: string;
  /** Task description; {label} and {document} (genitive) are replaced. */
  evidenceDescription: string;
}

export const DOCUMENT_FAMILY_TEXT: Readonly<
  Record<DraftDocumentFamily, DocumentFamilyText>
> = {
  LITIGATION: {
    evidenceHint:
      "dokaze (isprave, svedoke, veštačenja) na koje se stranka poziva",
    evidenceTaskPrefix: "Pribaviti dokaz",
    evidenceDescription:
      "Dokaz je naveden u nacrtu {document}, a nije priložen u razgovoru: {label}.",
  },
  CONTRACT: {
    evidenceHint:
      "priloge i isprave potrebne za zaključenje ugovora (npr. izvod iz registra, specifikacija, ovlašćenje za potpisivanje)",
    evidenceTaskPrefix: "Pribaviti prilog",
    evidenceDescription:
      "Prilog je potreban za nacrt {document}, a nije priložen u razgovoru: {label}.",
  },
  LETTER: {
    evidenceHint:
      "isprave na koje se dopis poziva (npr. ugovor, faktura, sporni tekst)",
    evidenceTaskPrefix: "Pribaviti ispravu",
    evidenceDescription:
      "Isprava je navedena u nacrtu {document}, a nije priložena u razgovoru: {label}.",
  },
  CORPORATE: {
    evidenceHint:
      "isprave potrebne za akt (npr. osnivački akt, izvod iz registra, lična isprava punomoćnika)",
    evidenceTaskPrefix: "Pribaviti ispravu",
    evidenceDescription:
      "Isprava je potrebna za nacrt {document}, a nije priložena u razgovoru: {label}.",
  },
};

const COMPETENT_COURT: DocumentField = {
  key: "competentCourt",
  label: "Nadležni sud",
  hint: "naziv i adresa suda kome se podnesak upućuje",
  taskTitle: "Utvrditi nadležni sud",
};

const CASE_REFERENCE: DocumentField = {
  key: "caseReference",
  label: "Poslovni broj predmeta",
  hint: "broj sudskog predmeta (npr. P 123/2026)",
  taskTitle: "Utvrditi poslovni broj predmeta",
};

const SERVICE_DATE: DocumentField = {
  key: "serviceDate",
  label: "Datum dostavljanja osporenog akta",
  hint: "datum kada je stranci dostavljen akt od kog teče rok",
  taskTitle: "Utvrditi datum dostavljanja osporenog akta",
  urgent: true,
};

const LAWSUIT: DocumentTypeDefinition = {
  id: "LAWSUIT",
  family: "LITIGATION",
  label: "Tužba",
  labelGenitive: "tužbe",
  fileSlug: "tuzba",
  agentDescription: "lawsuit (tužba) that starts civil proceedings",
  parties: [
    { role: "plaintiff", label: "Tužilac", genitive: "tužioca" },
    { role: "defendant", label: "Tuženi", genitive: "tuženog" },
  ],
  defaultClientRole: "plaintiff",
  fields: [
    COMPETENT_COURT,
    {
      key: "claimValue",
      label: "Vrednost predmeta spora",
      hint: "vrednost spora u dinarima, samo ako je navedena",
      taskTitle: "Utvrditi vrednost predmeta spora",
    },
    {
      key: "reliefSought",
      label: "Tužbeni zahtev",
      hint: "šta tužilac traži od suda",
      taskTitle: "Precizirati tužbeni zahtev sa klijentom",
      caseName: true,
    },
    SERVICE_DATE,
    {
      key: "contractReference",
      label: "Broj i datum ugovora",
      hint: "broj i datum ugovora na koji se tužba poziva",
      taskTitle: "Pribaviti broj i datum ugovora",
    },
  ],
  structure: [
    "naziv i adresa nadležnog suda",
    "podaci o tužiocu i tuženom (naziv/ime i adresa)",
    "vrednost predmeta spora",
    "pravni osnov (pozivanje na ZPP/ZOO odredbe)",
    "obrazloženje činjeničnog stanja",
    "spisak dokaza",
    "tužbeni zahtev",
    "blok za potpis punomoćnika",
  ],
  legalFrame:
    "Zakon o parničnom postupku (ZPP) i Zakon o obligacionim odnosima (ZOO)",
  draftingRules: [],
};

const STATEMENT_OF_DEFENCE: DocumentTypeDefinition = {
  id: "STATEMENT_OF_DEFENCE",
  family: "LITIGATION",
  label: "Odgovor na tužbu",
  labelGenitive: "odgovora na tužbu",
  fileSlug: "odgovor-na-tuzbu",
  agentDescription:
    "statement of defence (odgovor na tužbu) replying to a lawsuit served on the client",
  parties: [
    { role: "defendant", label: "Tuženi", genitive: "tuženog" },
    { role: "plaintiff", label: "Tužilac", genitive: "tužioca" },
  ],
  defaultClientRole: "defendant",
  fields: [
    COMPETENT_COURT,
    CASE_REFERENCE,
    SERVICE_DATE,
    {
      key: "defencePosition",
      label: "Stav tuženog",
      hint: "da li tuženi osporava tužbeni zahtev u celini ili delimično, i zašto",
      taskTitle: "Utvrditi stav klijenta prema tužbenom zahtevu",
      caseName: true,
    },
    {
      key: "proceduralObjections",
      label: "Procesni prigovori",
      hint: "prigovori nenadležnosti, litispendencije, presuđene stvari, zastarelosti, ako postoje",
      taskTitle: "Proveriti procesne prigovore",
    },
  ],
  structure: [
    "naziv suda i poslovni broj predmeta",
    "podaci o tužiocu i tuženom",
    "naznaka da je u pitanju odgovor na tužbu",
    "procesni prigovori, ako ih ima",
    "izjašnjenje o tužbenom zahtevu i navodima tužbe",
    "činjenični navodi tuženog",
    "dokazi",
    "predlog sudu (odbijanje tužbenog zahteva i troškovi postupka)",
    "blok za potpis punomoćnika",
  ],
  legalFrame:
    "Zakon o parničnom postupku (ZPP), posebno odredbe o odgovoru na tužbu, i materijalni propis spora (najčešće ZOO)",
  draftingRules: [
    "Odgovor se odnosi na tužbu koja je dostavljena tuženom; ako tekst tužbe nije dat, navedi to u warnings i ne izmišljaj njene navode.",
  ],
};

const APPEAL: DocumentTypeDefinition = {
  id: "APPEAL",
  family: "LITIGATION",
  label: "Žalba",
  labelGenitive: "žalbe",
  fileSlug: "zalba",
  agentDescription:
    "appeal (žalba) against a first-instance judgment or ruling (presuda/rešenje)",
  parties: [
    { role: "appellant", label: "Žalilac", genitive: "žalioca" },
    { role: "opponent", label: "Protivna strana", genitive: "protivne strane" },
  ],
  defaultClientRole: "appellant",
  fields: [
    {
      key: "contestedDecision",
      label: "Osporena odluka",
      hint: "vrsta, poslovni broj i datum osporene presude ili rešenja i sud koji ju je doneo",
      taskTitle: "Pribaviti osporenu odluku",
      caseName: true,
    },
    {
      key: "appellateCourt",
      label: "Drugostepeni sud",
      hint: "sud kome se žalba upućuje",
      taskTitle: "Utvrditi drugostepeni sud",
    },
    SERVICE_DATE,
    {
      key: "appealGrounds",
      label: "Žalbeni razlozi",
      hint: "bitna povreda postupka, pogrešno ili nepotpuno utvrđeno činjenično stanje, pogrešna primena materijalnog prava",
      taskTitle: "Utvrditi žalbene razloge",
    },
    {
      key: "appealScope",
      label: "Obim pobijanja",
      hint: "da li se odluka pobija u celini ili u kom delu",
      taskTitle: "Utvrditi obim pobijanja odluke",
    },
  ],
  structure: [
    "drugostepeni sud, preko prvostepenog suda koji je doneo odluku",
    "poslovni broj predmeta i podaci o strankama",
    "oznaka osporene odluke i obim pobijanja",
    "žalbeni razlozi",
    "obrazloženje žalbe po razlozima",
    "žalbeni predlog (preinačenje ili ukidanje odluke) i troškovi",
    "blok za potpis punomoćnika",
  ],
  legalFrame:
    "Zakon o parničnom postupku (ZPP), posebno odredbe o žalbi i žalbenim razlozima",
  draftingRules: [
    "Žalbene razloge zasnivaj samo na sadržaju osporene odluke i datim činjenicama; ako tekst odluke nije dat, navedi to u warnings.",
  ],
};

const ENFORCEMENT_MOTION: DocumentTypeDefinition = {
  id: "ENFORCEMENT_MOTION",
  family: "LITIGATION",
  label: "Predlog za izvršenje",
  labelGenitive: "predloga za izvršenje",
  fileSlug: "predlog-za-izvrsenje",
  agentDescription:
    "enforcement motion (predlog za izvršenje) on the basis of an enforceable or authentic document",
  parties: [
    {
      role: "creditor",
      label: "Izvršni poverilac",
      genitive: "izvršnog poverioca",
    },
    { role: "debtor", label: "Izvršni dužnik", genitive: "izvršnog dužnika" },
  ],
  defaultClientRole: "creditor",
  fields: [
    COMPETENT_COURT,
    {
      key: "enforcementTitle",
      label: "Izvršna ili verodostojna isprava",
      hint: "vrsta, broj i datum isprave (presuda, menica, faktura…) i datum pravosnažnosti/izvršnosti",
      taskTitle: "Pribaviti izvršnu ili verodostojnu ispravu",
      caseName: true,
    },
    {
      key: "claimAmount",
      label: "Iznos potraživanja",
      hint: "glavni dug, kamata i troškovi, samo ako su navedeni",
      taskTitle: "Utvrditi iznos potraživanja",
    },
    {
      key: "enforcementMeans",
      label: "Sredstvo izvršenja",
      hint: "npr. prenos sa računa, popis pokretnih stvari",
      taskTitle: "Odrediti sredstvo i predmet izvršenja",
    },
  ],
  structure: [
    "sud kome se predlog podnosi",
    "podaci o izvršnom poveriocu i izvršnom dužniku",
    "izvršna ili verodostojna isprava",
    "potraživanje (glavni dug, kamata, troškovi)",
    "sredstvo i predmet izvršenja",
    "predlog rešenja o izvršenju",
    "blok za potpis punomoćnika",
  ],
  legalFrame: "Zakon o izvršenju i obezbeđenju (ZIO)",
  draftingRules: [],
};

const SUBMISSION: DocumentTypeDefinition = {
  id: "SUBMISSION",
  family: "LITIGATION",
  label: "Podnesak",
  labelGenitive: "podneska",
  fileSlug: "podnesak",
  agentDescription:
    "general court submission (podnesak) in pending proceedings, e.g. a statement, motion for evidence, or urgency request",
  parties: [
    { role: "submitter", label: "Podnosilac", genitive: "podnosioca" },
    { role: "opponent", label: "Protivna strana", genitive: "protivne strane" },
  ],
  defaultClientRole: "submitter",
  fields: [
    COMPETENT_COURT,
    CASE_REFERENCE,
    {
      key: "submissionPurpose",
      label: "Svrha podneska",
      hint: "šta se podneskom predlaže ili na šta se izjašnjava",
      taskTitle: "Utvrditi svrhu podneska",
      caseName: true,
    },
  ],
  structure: [
    "naziv suda i poslovni broj predmeta",
    "podaci o strankama",
    "naziv podneska",
    "sadržina: izjašnjenje ili predlog sa obrazloženjem",
    "dokazi, ako ih ima",
    "blok za potpis punomoćnika",
  ],
  legalFrame: "Zakon o parničnom postupku (ZPP)",
  draftingRules: [],
};

const CONTRACT_SIGNATURES =
  "potpisi ugovornih strana (ime, funkcija zastupnika, mesto i datum)";

// Form rules for every contract, including employment.
const CONTRACT_FORM_RULES = [
  "Ugovor piši kao celovit tekst sa numerisanim članovima (Član 1, Član 2, …) i jasnim naslovima, u neutralnom tonu koji štiti obe strane osim gde klijentov interes zahteva drugačije.",
  "Iznose, rokove, procente i ugovorne kazne unosi samo ako su dati; inače placeholder. Ne dodaji klauzule koje bitno menjaju položaj strana a nisu tražene, nego ih predloži u warnings.",
];

// Commercial contracts may agree on the court; labour disputes follow the law.
const CONTRACT_RULES = [
  ...CONTRACT_FORM_RULES,
  "Sporove upućuj na stvarno nadležni sud prema sedištu strane koju kancelarija zastupa, osim ako je drugačije navedeno; ako sedište nije poznato, placeholder.",
];

const PARTY_REGISTRY_HINT =
  "za pravna lica: poslovno ime, sedište, matični broj i PIB, zastupnik";

const SERVICES_CONTRACT: DocumentTypeDefinition = {
  id: "SERVICES_CONTRACT",
  family: "CONTRACT",
  label: "Ugovor o pružanju usluga",
  labelGenitive: "ugovora o pružanju usluga",
  fileSlug: "ugovor-o-pruzanju-usluga",
  agentDescription:
    "services or consulting agreement (ugovor o pružanju usluga), usually B2B",
  parties: [
    { role: "customer", label: "Naručilac", genitive: "naručioca" },
    { role: "provider", label: "Pružalac usluga", genitive: "pružaoca usluga" },
  ],
  defaultClientRole: "customer",
  fields: [
    {
      key: "serviceScope",
      label: "Predmet usluga",
      hint: "koje usluge se pružaju i očekivani rezultat",
      taskTitle: "Precizirati predmet i obim usluga sa klijentom",
      caseName: true,
    },
    {
      key: "fee",
      label: "Naknada i način plaćanja",
      hint: "iznos ili način obračuna naknade, valuta, PDV, rok plaćanja",
      taskTitle: "Utvrditi naknadu i uslove plaćanja",
    },
    {
      key: "term",
      label: "Trajanje i rokovi",
      hint: "početak, trajanje ugovora, rokovi izvršenja, otkazni rok",
      taskTitle: "Utvrditi trajanje ugovora i rokove izvršenja",
    },
    {
      key: "liability",
      label: "Odgovornost i ograničenja",
      hint: "ograničenje odgovornosti, ugovorna kazna, garancije, ako su tražene",
      taskTitle: "Dogovoriti odgovornost i ugovornu kaznu",
    },
  ],
  structure: [
    "naziv ugovora, mesto i datum zaključenja",
    `ugovorne strane (${PARTY_REGISTRY_HINT})`,
    "predmet ugovora i opis usluga",
    "obaveze pružaoca usluga i obaveze naručioca",
    "naknada, rokovi i način plaćanja",
    "rokovi izvršenja i primopredaja rezultata",
    "poverljivost i prava na rezultate rada",
    "odgovornost, ugovorna kazna i viša sila",
    "trajanje, otkaz i raskid ugovora",
    "rešavanje sporova i merodavno pravo",
    "završne odredbe (izmene u pisanoj formi, broj primeraka)",
    CONTRACT_SIGNATURES,
  ],
  legalFrame:
    "Zakon o obligacionim odnosima (ZOO), posebno odredbe o ugovoru o delu i opšte odredbe o ugovorima",
  draftingRules: CONTRACT_RULES,
};

const NDA: DocumentTypeDefinition = {
  id: "NDA",
  family: "CONTRACT",
  label: "Ugovor o poverljivosti",
  labelGenitive: "ugovora o poverljivosti",
  fileSlug: "ugovor-o-poverljivosti",
  agentDescription:
    "non-disclosure agreement (ugovor o poverljivosti / NDA), one-way or mutual",
  parties: [
    {
      role: "discloser",
      label: "Strana koja otkriva informacije",
      genitive: "strane koja otkriva informacije",
    },
    {
      role: "recipient",
      label: "Strana koja prima informacije",
      genitive: "strane koja prima informacije",
    },
  ],
  defaultClientRole: "discloser",
  fields: [
    {
      key: "purpose",
      label: "Svrha otkrivanja",
      hint: "posao ili pregovori zbog kojih se informacije razmenjuju",
      taskTitle: "Utvrditi svrhu razmene poverljivih informacija",
      caseName: true,
    },
    {
      key: "mutuality",
      label: "Jednostrano ili obostrano",
      hint: "da li obe strane otkrivaju poverljive informacije",
      taskTitle: "Utvrditi da li je obaveza poverljivosti obostrana",
    },
    {
      key: "confidentialityTerm",
      label: "Trajanje obaveze poverljivosti",
      hint: "koliko dugo traje obaveza, i posle prestanka saradnje",
      taskTitle: "Utvrditi trajanje obaveze poverljivosti",
    },
    {
      key: "penalty",
      label: "Ugovorna kazna",
      hint: "iznos ugovorne kazne za povredu, samo ako je tražena",
      taskTitle: "Dogovoriti ugovornu kaznu za povredu poverljivosti",
    },
  ],
  structure: [
    "naziv ugovora, mesto i datum zaključenja",
    `ugovorne strane (${PARTY_REGISTRY_HINT})`,
    "svrha ugovora",
    "definicija poverljivih informacija i izuzeci (javno dostupne, već poznate, zakonska obaveza otkrivanja)",
    "obaveze strane koja prima informacije i dozvoljena upotreba",
    "trajanje obaveze poverljivosti",
    "vraćanje i uništavanje informacija",
    "odgovornost i ugovorna kazna",
    "rešavanje sporova i merodavno pravo",
    CONTRACT_SIGNATURES,
  ],
  legalFrame:
    "Zakon o obligacionim odnosima (ZOO) i Zakon o zaštiti poslovne tajne",
  draftingRules: [
    ...CONTRACT_RULES,
    "Ako je ugovor obostran, obaveze poverljivosti formuliši tako da važe za obe strane.",
  ],
};

const EMPLOYMENT_CONTRACT: DocumentTypeDefinition = {
  id: "EMPLOYMENT_CONTRACT",
  family: "CONTRACT",
  label: "Ugovor o radu",
  labelGenitive: "ugovora o radu",
  fileSlug: "ugovor-o-radu",
  agentDescription: "employment contract (ugovor o radu)",
  parties: [
    { role: "employer", label: "Poslodavac", genitive: "poslodavca" },
    { role: "employee", label: "Zaposleni", genitive: "zaposlenog" },
  ],
  defaultClientRole: "employer",
  fields: [
    {
      key: "position",
      label: "Radno mesto i opis poslova",
      hint: "naziv radnog mesta i opis poslova, stručna sprema",
      taskTitle: "Utvrditi radno mesto i opis poslova",
      caseName: true,
    },
    {
      key: "workplace",
      label: "Mesto rada",
      hint: "adresa mesta rada, rad od kuće ako je dogovoren",
      taskTitle: "Utvrditi mesto rada",
    },
    {
      key: "duration",
      label: "Vrsta i trajanje radnog odnosa",
      hint: "određeno ili neodređeno vreme, datum početka rada, probni rad",
      taskTitle: "Utvrditi vrstu radnog odnosa i datum početka rada",
    },
    {
      key: "workingTime",
      label: "Radno vreme",
      hint: "puno ili nepuno radno vreme, raspored",
      taskTitle: "Utvrditi radno vreme",
    },
    {
      key: "salary",
      label: "Osnovna zarada",
      hint: "novčani iznos osnovne zarade, elementi i rokovi isplate",
      taskTitle: "Utvrditi osnovnu zaradu i rokove isplate",
    },
  ],
  structure: [
    "naziv ugovora, mesto i datum zaključenja",
    "poslodavac (poslovno ime, sedište, matični broj, PIB, zastupnik) i zaposleni (ime, prebivalište, JMBG, stručna sprema)",
    "radno mesto, opis poslova i mesto rada",
    "vrsta i trajanje radnog odnosa, dan stupanja na rad i probni rad",
    "radno vreme",
    "zarada, uvećanja i rokovi isplate",
    "odmori i odsustva",
    "ostala prava i obaveze, poverljivost",
    "prestanak radnog odnosa i otkazni rok",
    "pozivanje na opšti akt i zakon za pitanja koja nisu uređena",
    "potpisi poslodavca i zaposlenog",
  ],
  legalFrame:
    "Zakon o radu, posebno odredbe o obaveznim elementima ugovora o radu",
  draftingRules: [
    ...CONTRACT_FORM_RULES,
    "Ugovor o radu mora sadržati sve obavezne elemente propisane Zakonom o radu; svaki obavezni element koji nije dat označi placeholderom, ne izostavljaj ga.",
    "Ne ugovaraj prava zaposlenog ispod zakonskog minimuma; ako je dati podatak u suprotnosti sa zakonom, navedi to u warnings.",
  ],
};

const COPYRIGHT_LICENCE: DocumentTypeDefinition = {
  id: "COPYRIGHT_LICENCE",
  family: "CONTRACT",
  label: "Ugovor o licenci / ustupanju autorskih prava",
  labelGenitive: "ugovora o licenci autorskih prava",
  fileSlug: "ugovor-o-autorskim-pravima",
  agentDescription:
    "copyright licence or assignment (ugovor o licenci / ustupanju autorskih imovinskih prava), e.g. for media content",
  parties: [
    { role: "licensee", label: "Sticalac prava", genitive: "sticaoca prava" },
    {
      role: "licensor",
      label: "Autor / nosilac prava",
      genitive: "autora odnosno nosioca prava",
    },
  ],
  defaultClientRole: "licensee",
  fields: [
    {
      key: "work",
      label: "Autorsko delo",
      hint: "koje delo je predmet ugovora (naziv, vrsta, opis)",
      taskTitle: "Precizno odrediti autorsko delo",
      caseName: true,
    },
    {
      key: "rightsScope",
      label: "Obim prava",
      hint: "vrste iskorišćavanja koje se ustupaju (umnožavanje, stavljanje u promet, interaktivno činjenje dostupnim…), isključiva ili neisključiva licenca",
      taskTitle: "Utvrditi obim i isključivost prava",
    },
    {
      key: "territoryAndTerm",
      label: "Teritorija i trajanje",
      hint: "teritorija i vreme za koje se prava ustupaju",
      taskTitle: "Utvrditi teritoriju i trajanje prava",
    },
    {
      key: "fee",
      label: "Autorski honorar",
      hint: "iznos i način isplate naknade, ili da je ustupanje bez naknade",
      taskTitle: "Utvrditi autorski honorar",
    },
  ],
  structure: [
    "naziv ugovora, mesto i datum zaključenja",
    `ugovorne strane (${PARTY_REGISTRY_HINT}; za autora fizičko lice: ime, adresa, JMBG)`,
    "predmet ugovora: autorsko delo",
    "vrsta i obim ustupljenih prava, isključivost",
    "teritorija i trajanje",
    "autorski honorar i način isplate",
    "garancije autora (originalnost, odsustvo prava trećih lica)",
    "moralna prava autora i navođenje autorstva",
    "raskid ugovora i rešavanje sporova",
    CONTRACT_SIGNATURES,
  ],
  legalFrame:
    "Zakon o autorskom i srodnim pravima (ZASP) i Zakon o obligacionim odnosima (ZOO)",
  draftingRules: [
    ...CONTRACT_RULES,
    "Svako ustupljeno ovlašćenje navedi izričito; ovlašćenja koja nisu navedena ostaju autoru, pa nejasan obim prava označi placeholderom i navedi u warnings.",
  ],
};

const DEMAND_LETTER: DocumentTypeDefinition = {
  id: "DEMAND_LETTER",
  family: "LETTER",
  label: "Opomena pred utuženje",
  labelGenitive: "opomene pred utuženje",
  fileSlug: "opomena-pred-utuzenje",
  agentDescription:
    "pre-suit demand letter (opomena pred utuženje) for payment or performance",
  parties: [
    { role: "creditor", label: "Poverilac", genitive: "poverioca" },
    { role: "debtor", label: "Dužnik", genitive: "dužnika" },
  ],
  defaultClientRole: "creditor",
  fields: [
    {
      key: "claim",
      label: "Osnov i iznos potraživanja",
      hint: "ugovor ili faktura (broj i datum) i dugovani iznos",
      taskTitle: "Utvrditi osnov i tačan iznos potraživanja",
      caseName: true,
    },
    {
      key: "maturityDate",
      label: "Datum dospelosti",
      hint: "kada je obaveza dospela",
      taskTitle: "Utvrditi datum dospelosti potraživanja",
    },
    {
      key: "complianceDeadline",
      label: "Rok za ispunjenje",
      hint: "rok koji se dužniku ostavlja (npr. 8 dana od prijema)",
      taskTitle: "Odrediti rok za ispunjenje u opomeni",
    },
    {
      key: "paymentDetails",
      label: "Podaci za uplatu",
      hint: "tekući račun i poziv na broj",
      taskTitle: "Pribaviti podatke za uplatu",
    },
  ],
  structure: [
    "podaci o pošiljaocu (poverilac, preko punomoćnika) i primaocu (dužnik), mesto i datum",
    "naslov: Opomena pred utuženje",
    "osnov i iznos potraživanja sa datumom dospelosti",
    "poziv na ispunjenje u ostavljenom roku sa podacima za uplatu",
    "napomena o zateznoj kamati i troškovima",
    "upozorenje da će po isteku roka biti pokrenut sudski postupak",
    "potpis punomoćnika",
  ],
  legalFrame:
    "Zakon o obligacionim odnosima (ZOO), odredbe o docnji dužnika, i Zakon o zateznoj kamati",
  draftingRules: [
    "Ton je odlučan i profesionalan, bez pretnji koje prelaze najavu sudskog postupka.",
  ],
};

const TERMINATION_NOTICE: DocumentTypeDefinition = {
  id: "TERMINATION_NOTICE",
  family: "LETTER",
  label: "Izjava o raskidu ugovora",
  labelGenitive: "izjave o raskidu ugovora",
  fileSlug: "raskid-ugovora",
  agentDescription:
    "notice of contract termination (izjava o raskidu ili otkazu ugovora)",
  parties: [
    {
      role: "terminating",
      label: "Strana koja raskida",
      genitive: "strane koja raskida",
    },
    {
      role: "counterparty",
      label: "Druga ugovorna strana",
      genitive: "druge ugovorne strane",
    },
  ],
  defaultClientRole: "terminating",
  fields: [
    {
      key: "contract",
      label: "Ugovor koji se raskida",
      hint: "naziv, broj i datum ugovora",
      taskTitle: "Pribaviti ugovor koji se raskida",
      caseName: true,
    },
    {
      key: "terminationGround",
      label: "Razlog raskida",
      hint: "neispunjenje, otkaz po ugovoru, sporazum, i činjenice koje ga potvrđuju",
      taskTitle: "Utvrditi razlog raskida i dokaze o njemu",
    },
    {
      key: "effectiveDate",
      label: "Dejstvo raskida",
      hint: "kada raskid proizvodi dejstvo, otkazni rok iz ugovora",
      taskTitle: "Utvrditi otkazni rok i dan prestanka ugovora",
    },
  ],
  structure: [
    "podaci o pošiljaocu i primaocu, mesto i datum",
    "naslov: Izjava o raskidu (otkazu) ugovora",
    "oznaka ugovora",
    "razlog raskida i pozivanje na ugovornu ili zakonsku odredbu",
    "dan prestanka ugovora i otkazni rok",
    "posledice raskida (obračun, vraćanje dokumentacije i sredstava) i zadržavanje prava na naknadu štete",
    "potpis",
  ],
  legalFrame:
    "Zakon o obligacionim odnosima (ZOO), odredbe o raskidu ugovora zbog neispunjenja, i odredbe samog ugovora",
  draftingRules: [
    "Ako uslovi raskida iz ugovora nisu poznati, navedi u warnings da treba proveriti otkazni rok i formu obaveštenja iz ugovora.",
  ],
};

const MEDIA_REPLY_REQUEST: DocumentTypeDefinition = {
  id: "MEDIA_REPLY_REQUEST",
  family: "LETTER",
  label: "Zahtev za objavljivanje odgovora / ispravke",
  labelGenitive: "zahteva za objavljivanje odgovora odnosno ispravke",
  fileSlug: "zahtev-za-objavljivanje-odgovora",
  agentDescription:
    "request to a media outlet to publish a reply or correction (zahtev za objavljivanje odgovora / ispravke)",
  parties: [
    {
      role: "requester",
      label: "Podnosilac zahteva",
      genitive: "podnosioca zahteva",
    },
    {
      role: "media",
      label: "Medij (glavni urednik)",
      genitive: "medija odnosno glavnog urednika",
    },
  ],
  defaultClientRole: "requester",
  fields: [
    {
      key: "publication",
      label: "Sporna informacija",
      hint: "naziv medija, naslov teksta ili priloga i mesto objavljivanja (izdanje, link)",
      taskTitle: "Pribaviti spornu objavu",
      caseName: true,
    },
    {
      key: "publicationDate",
      label: "Datum objavljivanja",
      hint: "kada je informacija objavljena",
      taskTitle: "Utvrditi datum objavljivanja sporne informacije",
      urgent: true,
      urgentDescription:
        "Od datuma objavljivanja zavisi rok za podnošenje zahteva — utvrditi hitno i uneti rok u kalendar.",
    },
    {
      key: "requestType",
      label: "Odgovor ili ispravka",
      hint: "da li se traži objavljivanje odgovora, ispravke, ili oba",
      taskTitle: "Odlučiti da li se traži odgovor ili ispravka",
    },
    {
      key: "disputedStatements",
      label: "Sporni navodi i tačne činjenice",
      hint: "koji navodi su netačni, nepotpuni ili povređuju pravo, i šta je tačno",
      taskTitle: "Utvrditi sporne navode i tačne činjenice sa klijentom",
    },
  ],
  structure: [
    "glavnom uredniku medija: naziv medija i adresa, mesto i datum",
    "podnosilac zahteva (preko punomoćnika)",
    "naslov: Zahtev za objavljivanje odgovora (ispravke)",
    "oznaka sporne informacije: naslov, datum i mesto objavljivanja",
    "tekst odgovora odnosno ispravke koji se traži da bude objavljen",
    "zahtev da se objavi bez izmena, na istom ili odgovarajućem mestu i u zakonskom roku",
    "potpis punomoćnika",
  ],
  legalFrame:
    "Zakon o javnom informisanju i medijima, odredbe o odgovoru i ispravci",
  draftingRules: [
    "Tekst odgovora odnosno ispravke mora se odnositi samo na spornu informaciju i biti srazmeran njoj; ne dodaji uvrede ili nove optužbe.",
    "Rokove i uslove objavljivanja navodi samo iz datih izvora; ako izvor nije dat, napiši 'u zakonskom roku' i u warnings navedi da advokat proveri rok.",
  ],
};

const POWER_OF_ATTORNEY: DocumentTypeDefinition = {
  id: "POWER_OF_ATTORNEY",
  family: "CORPORATE",
  label: "Punomoćje",
  labelGenitive: "punomoćja",
  fileSlug: "punomocje",
  agentDescription:
    "power of attorney (punomoćje), general or for a specific matter or court proceedings",
  parties: [
    { role: "principal", label: "Vlastodavac", genitive: "vlastodavca" },
    { role: "agent", label: "Punomoćnik", genitive: "punomoćnika" },
  ],
  defaultClientRole: "principal",
  fields: [
    {
      key: "authority",
      label: "Ovlašćenja",
      hint: "za šta se punomoćnik ovlašćuje (posao, postupak, organ), opšte ili posebno",
      taskTitle: "Precizirati ovlašćenja punomoćnika",
      caseName: true,
    },
    {
      key: "validity",
      label: "Trajanje",
      hint: "do kada važi punomoćje ili do opoziva",
      taskTitle: "Utvrditi trajanje punomoćja",
    },
    {
      key: "substitution",
      label: "Prenos ovlašćenja",
      hint: "da li punomoćnik može preneti ovlašćenja na drugo lice",
      taskTitle: "Utvrditi da li je dozvoljen prenos ovlašćenja",
    },
  ],
  structure: [
    "naslov: Punomoćje",
    "vlastodavac (za pravno lice: poslovno ime, sedište, matični broj i zakonski zastupnik; za fizičko lice: ime, adresa, JMBG)",
    "punomoćnik (ime, adresa, za advokata i sedište kancelarije)",
    "obim ovlašćenja",
    "trajanje i mogućnost prenosa ovlašćenja",
    "mesto, datum i potpis vlastodavca",
  ],
  legalFrame:
    "Zakon o obligacionim odnosima (ZOO), odredbe o punomoćju, i Zakon o parničnom postupku (ZPP) za procesno punomoćje",
  draftingRules: [
    "Ako se punomoćje koristi za posao za koji zakon traži posebnu formu (npr. overu ili promet nepokretnosti), navedi to u warnings.",
  ],
};

const CORPORATE_DECISION: DocumentTypeDefinition = {
  id: "CORPORATE_DECISION",
  family: "CORPORATE",
  label: "Odluka organa društva",
  labelGenitive: "odluke organa društva",
  fileSlug: "odluka",
  agentDescription:
    "company decision (odluka skupštine ili direktora društva), e.g. appointment, profit distribution, address change",
  parties: [{ role: "company", label: "Društvo", genitive: "društva" }],
  defaultClientRole: "company",
  fields: [
    {
      key: "decisionSubject",
      label: "Predmet odluke",
      hint: "šta se odlučuje (imenovanje direktora, raspodela dobiti, promena sedišta…)",
      taskTitle: "Precizirati predmet odluke",
      caseName: true,
    },
    {
      key: "body",
      label: "Organ koji donosi odluku",
      hint: "skupština (jedini član ili članovi) ili direktor",
      taskTitle: "Utvrditi nadležni organ društva",
    },
    {
      key: "voting",
      label: "Članovi i glasanje",
      hint: "članovi skupštine, udeli i način glasanja, ako je reč o skupštini",
      taskTitle: "Pribaviti podatke o članovima i udelima",
    },
    {
      key: "decisionDate",
      label: "Datum donošenja",
      hint: "datum sednice ili donošenja odluke",
      taskTitle: "Utvrditi datum donošenja odluke",
    },
  ],
  structure: [
    "pozivanje na zakon i osnivački akt kao osnov za donošenje odluke",
    "naziv organa, mesto i datum",
    "naslov: Odluka o …",
    "izreka odluke po članovima",
    "stupanje na snagu",
    "potpis (predsednik skupštine, članovi ili direktor)",
  ],
  legalFrame: "Zakon o privrednim društvima (ZPD) i osnivački akt društva",
  draftingRules: [
    "Ako odluka podleže registraciji u Agenciji za privredne registre, navedi to u warnings.",
    "Ako način donošenja odluke zavisi od osnivačkog akta koji nije dat, navedi to u warnings.",
  ],
};

export const DOCUMENT_TYPES: Readonly<
  Record<DraftDocumentType, DocumentTypeDefinition>
> = {
  LAWSUIT,
  STATEMENT_OF_DEFENCE,
  APPEAL,
  ENFORCEMENT_MOTION,
  SUBMISSION,
  SERVICES_CONTRACT,
  NDA,
  EMPLOYMENT_CONTRACT,
  COPYRIGHT_LICENCE,
  DEMAND_LETTER,
  TERMINATION_NOTICE,
  MEDIA_REPLY_REQUEST,
  POWER_OF_ATTORNEY,
  CORPORATE_DECISION,
};

export const DEFAULT_DOCUMENT_TYPE: DraftDocumentType = "LAWSUIT";

export function getDocumentType(id: DraftDocumentType): DocumentTypeDefinition {
  return DOCUMENT_TYPES[id];
}

export function listDocumentTypes(): DocumentTypeDefinition[] {
  return DRAFT_DOCUMENT_TYPES.map((id) => DOCUMENT_TYPES[id]);
}

/** Keys a missing-field item of this type may carry (besides "other"). */
export function missingFieldKeys(type: DocumentTypeDefinition): string[] {
  return [
    ...type.parties.flatMap((party) => [
      `${party.role}Name`,
      `${party.role}Address`,
      `${party.role}IdNumber`,
    ]),
    ...type.fields.map((field) => field.key),
    "legalBasis",
    "factualDescription",
  ];
}

export interface MissingFieldInfo {
  label: string;
  taskTitle: string;
  urgent: boolean;
  urgentDescription?: string;
}

/** Label and task title for a missing-field key of this type, or null. */
export function describeMissingField(
  type: DocumentTypeDefinition,
  key: string,
): MissingFieldInfo | null {
  const field = type.fields.find((item) => item.key === key);
  if (field) {
    return {
      label: field.label,
      taskTitle: field.taskTitle,
      urgent: Boolean(field.urgent),
      ...(field.urgentDescription
        ? { urgentDescription: field.urgentDescription }
        : {}),
    };
  }
  if (key === "legalBasis") {
    return {
      label: "Pravni osnov",
      taskTitle: "Utvrditi pravni osnov",
      urgent: false,
    };
  }
  if (key === "factualDescription") {
    return {
      label: "Činjenični opis",
      taskTitle: "Dopuniti činjenični opis sa klijentom",
      urgent: false,
    };
  }
  for (const party of type.parties) {
    if (key === `${party.role}Name`) {
      return {
        label: `Ime ili naziv ${party.genitive}`,
        taskTitle: `Utvrditi tačno ime ili naziv ${party.genitive}`,
        urgent: false,
      };
    }
    if (key === `${party.role}Address`) {
      return {
        label: `Adresa ${party.genitive}`,
        taskTitle: `Pribaviti adresu ${party.genitive}`,
        urgent: false,
      };
    }
    if (key === `${party.role}IdNumber`) {
      return {
        label: `JMBG / matični broj ${party.genitive}`,
        taskTitle: `Pribaviti JMBG / matični broj ${party.genitive}`,
        urgent: false,
      };
    }
  }
  return null;
}
