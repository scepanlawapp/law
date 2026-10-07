/**
 * Response and remedy periods for served acts. Each period and article was
 * checked on 2026-10-07 against the consolidated texts:
 * - ZPP: "Sl. glasnik RS", br. 72/2011 … 10/2023 – dr. zakon
 * - ZIO: br. 106/2015 … 91/2025
 * - ZUP: br. 18/2016, 95/2018, 2/2023 – odluka US
 * - ZUS: br. 111/2009
 * A period here never comes from a model.
 */

export const DEADLINE_ACT_KINDS = [
  "FIRST_INSTANCE_JUDGMENT",
  "FIRST_INSTANCE_RULING",
  "PAYMENT_ORDER",
  "LAWSUIT",
  "APPEAL",
  "SECOND_INSTANCE_JUDGMENT",
  "REVISION",
  "ENFORCEMENT_ORDER_AUTHENTIC_DOCUMENT",
  "ENFORCEMENT_ORDER_ENFORCEABLE_TITLE",
  "ENFORCEMENT_ORDER_SUMMARY",
  "ENFORCEMENT_OTHER_RULING",
  "ADMINISTRATIVE_DECISION",
  "FINAL_ADMINISTRATIVE_ACT",
  "ADMINISTRATIVE_COURT_DECISION",
  "OTHER",
] as const;
export type DeadlineActKind = (typeof DEADLINE_ACT_KINDS)[number];

/** Kind of civil (parnični) procedure; only matters for civil act kinds. */
export const CIVIL_PROCEDURE_KINDS = [
  "GENERAL",
  "COMMERCIAL",
  "SMALL_CLAIMS",
  "CONSUMER",
  "BILL_OF_EXCHANGE",
  "POSSESSION",
  "COLLECTIVE_AGREEMENT",
] as const;
export type CivilProcedureKind = (typeof CIVIL_PROCEDURE_KINDS)[number];

export interface ActKindDefinition {
  id: DeadlineActKind;
  /** Serbian Latin name. */
  label: string;
  /** How to recognize it, for the classification prompt. */
  hint: string;
  civil: boolean;
}

export const ACT_KINDS: readonly ActKindDefinition[] = [
  {
    id: "FIRST_INSTANCE_JUDGMENT",
    label: "Prvostepena presuda u parnici",
    hint: "presuda osnovnog, višeg ili privrednog suda u parnici, uključujući presudu zbog propuštanja, presudu na osnovu priznanja i delimičnu presudu",
    civil: true,
  },
  {
    id: "FIRST_INSTANCE_RULING",
    label: "Prvostepeno rešenje u parnici",
    hint: "rešenje prvostepenog suda u parnici (npr. o odbacivanju tužbe, prekidu, troškovima, privremenoj meri)",
    civil: true,
  },
  {
    id: "PAYMENT_ORDER",
    label: "Platni nalog",
    hint: "rešenje o platnom nalogu kojim se tuženom nalaže da ispuni tužbeni zahtev",
    civil: true,
  },
  {
    id: "LAWSUIT",
    label: "Tužba dostavljena na odgovor",
    hint: "tužba protivne strane koju je sud dostavio tuženom radi odgovora",
    civil: true,
  },
  {
    id: "APPEAL",
    label: "Žalba protivne strane",
    hint: "žalba protivne strane koju je sud dostavio radi odgovora na žalbu",
    civil: true,
  },
  {
    id: "SECOND_INSTANCE_JUDGMENT",
    label: "Drugostepena presuda",
    hint: "presuda višeg ili apelacionog suda (ili Privrednog apelacionog suda) kojom je odlučeno o žalbi u parnici",
    civil: true,
  },
  {
    id: "REVISION",
    label: "Revizija protivne strane",
    hint: "revizija protivne strane dostavljena radi odgovora",
    civil: true,
  },
  {
    id: "ENFORCEMENT_ORDER_AUTHENTIC_DOCUMENT",
    label: "Rešenje o izvršenju na osnovu verodostojne isprave",
    hint: "rešenje o izvršenju doneto na osnovu verodostojne isprave (faktura, izvod iz poslovnih knjiga, menica u redovnom postupku)",
    civil: false,
  },
  {
    id: "ENFORCEMENT_ORDER_ENFORCEABLE_TITLE",
    label: "Rešenje o izvršenju na osnovu izvršne isprave",
    hint: "rešenje o izvršenju na osnovu izvršne isprave (pravnosnažna presuda, poravnanje, notarski zapis)",
    civil: false,
  },
  {
    id: "ENFORCEMENT_ORDER_SUMMARY",
    label: "Rešenje o izvršenju u skraćenom izvršnom postupku",
    hint: "rešenje o izvršenju doneto u skraćenom izvršnom postupku između privrednih subjekata (menica, ček, bankarska garancija, akreditiv)",
    civil: false,
  },
  {
    id: "ENFORCEMENT_OTHER_RULING",
    label: "Drugo rešenje u izvršnom postupku",
    hint: "drugo rešenje suda ili javnog izvršitelja u izvršnom postupku ili postupku obezbeđenja (zaključak nije rešenje)",
    civil: false,
  },
  {
    id: "ADMINISTRATIVE_DECISION",
    label: "Prvostepeno rešenje u upravnom postupku",
    hint: "rešenje organa uprave ili drugog organa u upravnom postupku protiv kog je dozvoljena žalba",
    civil: false,
  },
  {
    id: "FINAL_ADMINISTRATIVE_ACT",
    label: "Konačni upravni akt",
    hint: "drugostepeno rešenje ili konačno rešenje organa protiv kog žalba nije dozvoljena, a može se pokrenuti upravni spor",
    civil: false,
  },
  {
    id: "ADMINISTRATIVE_COURT_DECISION",
    label: "Odluka Upravnog suda",
    hint: "presuda ili rešenje Upravnog suda u upravnom sporu",
    civil: false,
  },
  {
    id: "OTHER",
    label: "Drugi dokument",
    hint: "ugovor, dopis, podnesak, zapisnik, zaključak, poziv za ročište ili drugi dokument koji nije nijedan od navedenih akata",
    civil: false,
  },
];

export const CIVIL_PROCEDURE_LABELS: Record<CivilProcedureKind, string> = {
  GENERAL: "opšti parnični postupak",
  COMMERCIAL: "privredni spor",
  SMALL_CLAIMS: "spor male vrednosti",
  CONSUMER: "potrošački spor",
  BILL_OF_EXCHANGE: "menični ili čekovni spor",
  POSSESSION: "spor zbog smetanja državine",
  COLLECTIVE_AGREEMENT: "spor povodom kolektivnog ugovora",
};

export function getActKind(id: DeadlineActKind): ActKindDefinition {
  const kind = ACT_KINDS.find((item) => item.id === id);
  if (!kind) throw new Error(`Unknown act kind: ${id}`);
  return kind;
}

export interface DeadlineRule {
  /** Serbian name of the response or remedy ("Žalba protiv presude"). */
  remedy: string;
  days: number;
  /** Article that sets the period. */
  legalBasis: string;
  /** Article that sets how the period is counted. */
  countingBasis: string;
  deadlineType: "COURT" | "STATUTORY";
  /** Conditions the lawyer should check. */
  notes: string[];
}

export type RuleLookup =
  | { status: "RULE"; rule: DeadlineRule }
  | { status: "NONE"; reason: string };

const ZPP_COUNTING = "ZPP čl. 103";
const ZIO_COUNTING = "ZPP čl. 103 u vezi sa ZIO čl. 39";
const ZUS_COUNTING = "ZPP čl. 103 u vezi sa ZUS čl. 74";
const ZUP_COUNTING = "ZUP čl. 80";

const SMALL_CLAIMS_NOTE =
  "Ako je spor male vrednosti (do 3.000 evra, u privrednom sporu do 30.000 evra), rok za žalbu je osam dana (ZPP čl. 479).";
const ANNOUNCEMENT_NOTE =
  "Ako odluka nije dostavljena stranci, rok teče od dana objavljivanja.";

function court(
  remedy: string,
  days: number,
  legalBasis: string,
  notes: string[] = [],
  countingBasis = ZPP_COUNTING,
): RuleLookup {
  return {
    status: "RULE",
    rule: {
      remedy,
      days,
      legalBasis,
      countingBasis,
      deadlineType: "COURT",
      notes,
    },
  };
}

function none(reason: string): RuleLookup {
  return { status: "NONE", reason };
}

/** First-instance judgment or ruling ending the case, by procedure. */
function firstInstanceAppeal(
  remedy: string,
  procedure: CivilProcedureKind,
  general: { legalBasis: string; notes: string[] },
): RuleLookup {
  switch (procedure) {
    case "SMALL_CLAIMS":
      return court(remedy, 8, "ZPP čl. 479 st. 3", [ANNOUNCEMENT_NOTE]);
    case "CONSUMER":
      return court(remedy, 8, "ZPP čl. 493 st. 2", [ANNOUNCEMENT_NOTE]);
    case "BILL_OF_EXCHANGE":
      return court(remedy, 8, "ZPP čl. 367 st. 1");
    case "POSSESSION":
      return court(remedy, 8, "ZPP čl. 452 st. 2");
    case "COLLECTIVE_AGREEMENT":
      return court(remedy, 8, "ZPP čl. 446");
    case "GENERAL":
    case "COMMERCIAL":
      return court(remedy, 15, general.legalBasis, general.notes);
  }
}

/**
 * The period for responding to or challenging a served act. Returns NONE with
 * the reason when the law gives no such period for this act and procedure.
 */
export function findDeadlineRule(
  actKind: DeadlineActKind,
  procedure: CivilProcedureKind = "GENERAL",
): RuleLookup {
  switch (actKind) {
    case "FIRST_INSTANCE_JUDGMENT":
      return firstInstanceAppeal("Žalba protiv presude", procedure, {
        legalBasis: "ZPP čl. 367 st. 1",
        notes: [
          SMALL_CLAIMS_NOTE,
          "U meničnim i čekovnim sporovima rok je osam dana.",
        ],
      });
    case "FIRST_INSTANCE_RULING": {
      const found = firstInstanceAppeal("Žalba protiv rešenja", procedure, {
        legalBasis: "ZPP čl. 402 u vezi sa čl. 367 st. 1",
        notes: [
          "Proverite u pouci da li je protiv rešenja dozvoljena posebna žalba; ako nije, rešenje se pobija tek žalbom protiv konačne odluke (ZPP čl. 399 st. 2).",
          SMALL_CLAIMS_NOTE,
        ],
      });
      if (
        found.status === "RULE" &&
        (procedure === "SMALL_CLAIMS" || procedure === "CONSUMER")
      ) {
        found.rule.notes.push(
          "U ovom postupku posebna žalba je dozvoljena samo protiv rešenja kojim se postupak okončava.",
        );
      }
      return found;
    }
    case "PAYMENT_ORDER":
      return procedure === "BILL_OF_EXCHANGE"
        ? court("Prigovor protiv platnog naloga", 3, "ZPP čl. 457 st. 2")
        : court("Prigovor protiv platnog naloga", 8, "ZPP čl. 457 st. 2", [
            "U istom roku tuženi može i da ispuni zahtev iz platnog naloga.",
          ]);
    case "LAWSUIT":
      if (procedure === "SMALL_CLAIMS") {
        return none(
          "U sporu male vrednosti tužba se ne dostavlja tuženom na odgovor (ZPP čl. 472, u privrednom sporu čl. 487 st. 4); činjenice i dokaze treba izneti najkasnije na prvom ročištu.",
        );
      }
      if (procedure === "CONSUMER") {
        return none(
          "U potrošačkom sporu tužba se ne dostavlja na odgovor (ZPP čl. 489 st. 1); dostavlja se uz poziv za glavnu raspravu.",
        );
      }
      return court("Odgovor na tužbu", 30, "ZPP čl. 297 st. 1", [
        "Ako tuženi ne podnese odgovor u roku, sud može doneti presudu zbog propuštanja (ZPP čl. 350).",
      ]);
    case "APPEAL":
      return procedure === "BILL_OF_EXCHANGE"
        ? court("Odgovor na žalbu", 8, "ZPP čl. 380 st. 1")
        : court("Odgovor na žalbu", 15, "ZPP čl. 380 st. 1", [
            "Odgovor na žalbu nije obavezan; neblagovremen odgovor drugostepeni sud ne razmatra.",
          ]);
    case "SECOND_INSTANCE_JUDGMENT":
      if (procedure === "SMALL_CLAIMS") {
        return none(
          "U sporu male vrednosti revizija nije dozvoljena (ZPP čl. 479).",
        );
      }
      if (procedure === "POSSESSION") {
        return none(
          "U parnici zbog smetanja državine revizija nije dozvoljena (ZPP čl. 452).",
        );
      }
      return court("Revizija", 30, "ZPP čl. 403 st. 1", [
        "Revizija nije uvek dozvoljena: u imovinskopravnim sporovima vrednost pobijenog dela mora preći 40.000 evra, osim u slučajevima iz ZPP čl. 403 st. 2; proverite dozvoljenost i posebnu reviziju (ZPP čl. 404).",
      ]);
    case "REVISION":
      return court("Odgovor na reviziju", 30, "ZPP čl. 411 st. 2", [
        "Odgovor na reviziju nije obavezan.",
      ]);
    case "ENFORCEMENT_ORDER_AUTHENTIC_DOCUMENT":
      return court(
        "Prigovor protiv rešenja o izvršenju",
        8,
        "ZIO čl. 86 st. 2",
        [],
        ZIO_COUNTING,
      );
    case "ENFORCEMENT_ORDER_ENFORCEABLE_TITLE":
      return court(
        "Žalba protiv rešenja o izvršenju",
        8,
        "ZIO čl. 73 i čl. 25 st. 1",
        [],
        ZIO_COUNTING,
      );
    case "ENFORCEMENT_ORDER_SUMMARY":
      return court(
        "Prigovor u skraćenom izvršnom postupku",
        5,
        "ZIO čl. 326g st. 1",
        [
          "Prigovor se može izjaviti samo iz razloga propisanih u ZIO čl. 326g.",
        ],
        ZIO_COUNTING,
      );
    case "ENFORCEMENT_OTHER_RULING":
      return court(
        "Žalba ili prigovor u izvršnom postupku",
        8,
        "ZIO čl. 25 st. 1",
        [
          "Pravni lek i rok proverite u pouci: ZIO za pojedina rešenja propisuje drugi rok ili isključuje pravni lek, a protiv zaključka pravni lek nije dozvoljen (ZIO čl. 24).",
        ],
        ZIO_COUNTING,
      );
    case "ADMINISTRATIVE_DECISION":
      return {
        status: "RULE",
        rule: {
          remedy: "Žalba u upravnom postupku",
          days: 15,
          legalBasis: "ZUP čl. 153 st. 1",
          countingBasis: ZUP_COUNTING,
          deadlineType: "STATUTORY",
          notes: [
            "Poseban zakon može propisati drugi rok; proverite pouku o pravnom leku.",
          ],
        },
      };
    case "FINAL_ADMINISTRATIVE_ACT":
      return court(
        "Tužba u upravnom sporu",
        30,
        "ZUS čl. 18 st. 1",
        ["Zakon može propisati kraći rok za tužbu; proverite pouku."],
        ZUS_COUNTING,
      );
    case "ADMINISTRATIVE_COURT_DECISION":
      return court(
        "Zahtev za preispitivanje sudske odluke",
        30,
        "ZUS čl. 51 st. 1",
        [
          "Zahtev je dozvoljen samo u slučajevima iz ZUS čl. 49; proverite dozvoljenost.",
        ],
        ZUS_COUNTING,
      );
    case "OTHER":
      return none(
        "Dokument nije sudska ni upravna odluka ili podnesak za koji zakon određuje rok za odgovor ili pravni lek.",
      );
  }
}
