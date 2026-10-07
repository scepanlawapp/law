import {
  CONTRACT_REVIEW_TYPES,
  type ContractReviewType,
} from "@law/api-interfaces";

/**
 * Built-in review checklist for one contract type. There is no office
 * playbook yet; these are standard points of Serbian practice that the lawyer
 * confirms in review.
 */
export interface ContractChecklist {
  id: ContractReviewType;
  /** Serbian Latin name of the contract. */
  label: string;
  /** ASCII stem for export file names. */
  fileSlug: string;
  /** Short English description for the agent's tool description. */
  agentDescription: string;
  /** Laws the review relies on; also the first grounding query. */
  legalFrame: string;
  /** Clauses a complete contract of this type is expected to contain. */
  expectedClauses: string[];
  /** Typical clauses that put the client at a disadvantage. */
  riskPoints: string[];
  /** Mandatory-law points to verify; each is also a grounding query. */
  compliancePoints: string[];
}

const COMMON_EXPECTED = [
  "ugovorne strane sa potpunim identifikacionim podacima i zastupnicima",
  "rešavanje sporova i merodavno pravo",
  "završne odredbe (izmene u pisanoj formi, broj primeraka, stupanje na snagu)",
];

const COMMON_RISKS = [
  "jednostrano pravo druge strane da menja cenu ili uslove",
  "automatsko produženje bez jasne mogućnosti otkaza",
  "nesrazmerna ugovorna kazna ili neograničena odgovornost klijenta",
  "isključiva nadležnost suda ili arbitraže nepovoljna za klijenta",
];

const SERVICES_CONTRACT: ContractChecklist = {
  id: "SERVICES_CONTRACT",
  label: "Ugovor o pružanju usluga",
  fileSlug: "ugovor-o-pruzanju-usluga",
  agentDescription: "services or consulting agreement",
  legalFrame:
    "Zakon o obligacionim odnosima (ZOO), ugovor o delu i opšte odredbe o ugovorima",
  expectedClauses: [
    "predmet i obim usluga sa merljivim rezultatom",
    "naknada, valuta, PDV i rokovi plaćanja",
    "rokovi izvršenja, primopredaja i reklamacije",
    "odgovornost i ograničenje odgovornosti",
    "poverljivost",
    "prava na rezultate rada (autorska i druga prava)",
    "trajanje, otkaz i raskid",
    "viša sila",
    ...COMMON_EXPECTED,
  ],
  riskPoints: [
    ...COMMON_RISKS,
    "prava na rezultate rada ostaju pružaocu usluga ili su preneta samo delimično",
    "kratak rok za reklamacije ili prećutno prihvatanje rezultata",
    "zabrana angažovanja zaposlenih druge strane bez vremenskog ograničenja",
  ],
  compliancePoints: [
    "isključenje ili ograničenje odgovornosti za nameru i krajnju nepažnju",
    "ugovorna kazna za novčane obaveze",
    "zatezna kamata u docnji",
  ],
};

const NDA: ContractChecklist = {
  id: "NDA",
  label: "Ugovor o poverljivosti",
  fileSlug: "ugovor-o-poverljivosti",
  agentDescription: "non-disclosure agreement (NDA)",
  legalFrame:
    "Zakon o obligacionim odnosima (ZOO) i Zakon o zaštiti poslovne tajne",
  expectedClauses: [
    "svrha razmene informacija",
    "definicija poverljivih informacija",
    "izuzeci (javno dostupne, već poznate, samostalno razvijene, zakonska obaveza otkrivanja)",
    "dozvoljena upotreba i krug lica kojima se informacije smeju otkriti",
    "trajanje obaveze poverljivosti i posle prestanka saradnje",
    "vraćanje ili uništavanje informacija",
    "ugovorna kazna ili naknada štete za povredu",
    "izjava da se ne prenose prava na informacijama",
    ...COMMON_EXPECTED,
  ],
  riskPoints: [
    ...COMMON_RISKS,
    "preširoka definicija poverljivih informacija",
    "neograničeno trajanje obaveze",
    "jednostrane obaveze iako informacije razmenjuju obe strane",
    "nedostaje postupak za zakonski obavezno otkrivanje",
  ],
  compliancePoints: [
    "pojam poslovne tajne i razumne mere zaštite",
    "obrada podataka o ličnosti ako se razmenjuju lični podaci",
    "ugovorna kazna za povredu obaveze",
  ],
};

const EMPLOYMENT_CONTRACT: ContractChecklist = {
  id: "EMPLOYMENT_CONTRACT",
  label: "Ugovor o radu",
  fileSlug: "ugovor-o-radu",
  agentDescription: "employment contract",
  legalFrame: "Zakon o radu, obavezni elementi ugovora o radu",
  expectedClauses: [
    "naziv i sedište poslodavca, ime i prebivalište zaposlenog",
    "vrsta i stepen stručne spreme zaposlenog",
    "naziv i opis poslova",
    "mesto rada",
    "vrsta radnog odnosa (neodređeno ili određeno vreme i osnov)",
    "dan početka rada",
    "radno vreme (puno, nepuno, skraćeno)",
    "novčani iznos osnovne zarade, elementi i rokovi isplate",
    "pozivanje na kolektivni ugovor ili pravilnik o radu",
    "trajanje dnevnog i nedeljnog radnog vremena",
  ],
  riskPoints: [
    "zabrana konkurencije posle prestanka radnog odnosa bez naknade ili šira od dozvoljenog",
    "jednostrano premeštanje ili promena uslova rada bez aneksa",
    "nejasno određena zarada ili uslovi za varijabilni deo",
    "nesrazmerne obaveze naknade troškova obuke",
  ],
  compliancePoints: [
    "obavezni elementi ugovora o radu",
    "ugovor o radu na određeno vreme, najduže trajanje",
    "probni rad, najduže trajanje",
    "minimalna zarada",
    "godišnji odmor, najkraće trajanje",
    "zabrana konkurencije, uslovi i naknada",
  ],
};

const COPYRIGHT_LICENCE: ContractChecklist = {
  id: "COPYRIGHT_LICENCE",
  label: "Ugovor o licenci / ustupanju autorskih prava",
  fileSlug: "ugovor-o-autorskim-pravima",
  agentDescription: "copyright licence or assignment",
  legalFrame:
    "Zakon o autorskom i srodnim pravima (ZASP) i Zakon o obligacionim odnosima (ZOO)",
  expectedClauses: [
    "precizno određeno autorsko delo",
    "vrste iskorišćavanja koje se ustupaju, izričito navedene",
    "isključiva ili neisključiva licenca",
    "teritorija i trajanje",
    "pravo na preradu i podlicenciranje ili prenos na treća lica",
    "autorski honorar i način isplate",
    "garancije autora (originalnost, odsustvo prava trećih lica)",
    "navođenje autorstva i moralna prava",
    ...COMMON_EXPECTED,
  ],
  riskPoints: [
    ...COMMON_RISKS,
    "neodređen ili preuzak obim ustupljenih prava za predviđenu upotrebu",
    "nema prava na preradu, podlicencu ili prenos (važno za medije)",
    "kratko trajanje ili uska teritorija za digitalnu distribuciju",
    "honorar vezan za neodređene prihode bez prava na kontrolu",
  ],
  compliancePoints: [
    "pisana forma ugovora o autorskom delu",
    "ovlašćenja koja nisu izričito ustupljena ostaju autoru",
    "moralna prava autora",
    "ugovor o budućim delima",
  ],
};

const OTHER_CONTRACT: ContractChecklist = {
  id: "OTHER_CONTRACT",
  label: "Ugovor",
  fileSlug: "ugovor",
  agentDescription: "any other contract (generic checklist)",
  legalFrame: "Zakon o obligacionim odnosima (ZOO)",
  expectedClauses: [
    "predmet ugovora",
    "cena ili naknada i rokovi plaćanja",
    "rokovi ispunjenja",
    "odgovornost i naknada štete",
    "trajanje, otkaz i raskid",
    "viša sila",
    ...COMMON_EXPECTED,
  ],
  riskPoints: COMMON_RISKS,
  compliancePoints: [
    "ništavost ugovora protivnog prinudnim propisima",
    "forma ugovora",
    "isključenje odgovornosti za nameru i krajnju nepažnju",
  ],
};

export const CONTRACT_CHECKLISTS: Readonly<
  Record<ContractReviewType, ContractChecklist>
> = {
  SERVICES_CONTRACT,
  NDA,
  EMPLOYMENT_CONTRACT,
  COPYRIGHT_LICENCE,
  OTHER_CONTRACT,
};

export function getContractChecklist(
  id: ContractReviewType,
): ContractChecklist {
  return CONTRACT_CHECKLISTS[id];
}

export function listContractChecklists(): ContractChecklist[] {
  return CONTRACT_REVIEW_TYPES.map((id) => CONTRACT_CHECKLISTS[id]);
}

export function isContractReviewType(
  value: unknown,
): value is ContractReviewType {
  return (
    typeof value === "string" &&
    (CONTRACT_REVIEW_TYPES as readonly string[]).includes(value)
  );
}

/** Grounding queries: the legal frame plus each compliance point within it. */
export function buildReviewGroundingQueries(
  checklist: ContractChecklist,
): string[] {
  return [
    checklist.legalFrame,
    ...checklist.compliancePoints.map(
      (point) => `${point} ${checklist.legalFrame}`,
    ),
  ];
}
