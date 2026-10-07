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
  legalFrame: "Zakon o parničnom postupku (ZPP) i Zakon o obligacionim odnosima (ZOO)",
  draftingRules: [],
};

const STATEMENT_OF_DEFENCE: DocumentTypeDefinition = {
  id: "STATEMENT_OF_DEFENCE",
  family: "LITIGATION",
  label: "Odgovor na tužbu",
  labelGenitive: "odgovora na tužbu",
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
  agentDescription:
    "enforcement motion (predlog za izvršenje) on the basis of an enforceable or authentic document",
  parties: [
    { role: "creditor", label: "Izvršni poverilac", genitive: "izvršnog poverioca" },
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

export const DOCUMENT_TYPES: Readonly<Record<DraftDocumentType, DocumentTypeDefinition>> = {
  LAWSUIT,
  STATEMENT_OF_DEFENCE,
  APPEAL,
  ENFORCEMENT_MOTION,
  SUBMISSION,
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
}

/** Label and task title for a missing-field key of this type, or null. */
export function describeMissingField(
  type: DocumentTypeDefinition,
  key: string,
): MissingFieldInfo | null {
  const field = type.fields.find((item) => item.key === key);
  if (field) {
    return { label: field.label, taskTitle: field.taskTitle, urgent: Boolean(field.urgent) };
  }
  if (key === "legalBasis") {
    return { label: "Pravni osnov", taskTitle: "Utvrditi pravni osnov", urgent: false };
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
