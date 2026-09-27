export const PARAGRAF_PROPISI_BASE_URL = "https://www.paragraf.rs/propisi/";

export type LegalSourceArea =
  | "general"
  | "contracts"
  | "company"
  | "competition"
  | "ip"
  | "media"
  | "data-protection"
  | "human-rights"
  | "real-estate"
  | "agriculture"
  | "family"
  | "arbitration"
  | "labor";

export interface LegalSourceManifestEntry {
  slug: string;
  url: string;
  area: LegalSourceArea;
}

function paragraf(
  slug: string,
  page: string,
  area: LegalSourceArea,
): LegalSourceManifestEntry {
  return { slug, url: `${PARAGRAF_PROPISI_BASE_URL}${page}`, area };
}

/**
 * Core public Serbian laws for the target office's practice areas.
 * Slugs are stable source identities; changing one re-ingests the law as a
 * new source.
 */
export const PARAGRAF_CORE_SOURCES: readonly LegalSourceManifestEntry[] = [
  paragraf("ustav-republike-srbije", "ustav_republike_srbije.html", "general"),
  paragraf(
    "zakon-o-parnicnom-postupku",
    "zakon_o_parnicnom_postupku.html",
    "general",
  ),
  paragraf(
    "zakon-o-vanparnicnom-postupku",
    "zakon_o_vanparnicnom_postupku.html",
    "general",
  ),
  paragraf(
    "zakon-o-izvrsenju-i-obezbedjenju",
    "zakon_o_izvrsenju_i_obezbedjenju.html",
    "general",
  ),
  paragraf(
    "zakon-o-sudskim-taksama",
    "zakon_o_sudskim_taksama.html",
    "general",
  ),
  paragraf("zakon-o-advokaturi", "zakon_o_advokaturi.html", "general"),
  paragraf(
    "zakon-o-opstem-upravnom-postupku",
    "zakon-o-opstem-upravnom-postupku.html",
    "general",
  ),
  paragraf(
    "zakon-o-upravnim-sporovima",
    "zakon_o_upravnim_sporovima.html",
    "general",
  ),
  paragraf(
    "zakon-o-obligacionim-odnosima",
    "zakon_o_obligacionim_odnosima.html",
    "contracts",
  ),
  paragraf(
    "zakon-o-rokovima-izmirenja-novcanih-obaveza",
    "zakon_o_rokovima_izmirenja_novcanih_obaveza_u_komercijalnim_transakcijama.html",
    "contracts",
  ),
  paragraf(
    "zakon-o-privrednim-drustvima",
    "zakon_o_privrednim_drustvima.html",
    "company",
  ),
  paragraf(
    "zakon-o-postupku-registracije-u-apr",
    "zakon_o_postupku_registracije_u_agenciji_za_privredne_registre.html",
    "company",
  ),
  paragraf("zakon-o-stecaju", "zakon_o_stecaju.html", "company"),
  paragraf(
    "zakon-o-zastiti-konkurencije",
    "zakon_o_zastiti_konkurencije.html",
    "competition",
  ),
  paragraf(
    "zakon-o-autorskom-i-srodnim-pravima",
    "zakon_o_autorskom_i_srodnim_pravima.html",
    "ip",
  ),
  paragraf("zakon-o-zigovima", "zakon_o_zigovima.html", "ip"),
  paragraf("zakon-o-patentima", "zakon_o_patentima.html", "ip"),
  paragraf(
    "zakon-o-pravnoj-zastiti-industrijskog-dizajna",
    "zakon_o_pravnoj_zastiti_industrijskog_dizajna.html",
    "ip",
  ),
  paragraf(
    "zakon-o-javnom-informisanju-i-medijima",
    "zakon_o_javnom_informisanju_i_medijima.html",
    "media",
  ),
  paragraf(
    "zakon-o-elektronskim-medijima",
    "zakon_o_elektronskim_medijima.html",
    "media",
  ),
  paragraf(
    "zakon-o-zastiti-podataka-o-licnosti",
    "zakon_o_zastiti_podataka_o_licnosti.html",
    "data-protection",
  ),
  paragraf(
    "zakon-o-zabrani-diskriminacije",
    "zakon_o_zabrani_diskriminacije.html",
    "human-rights",
  ),
  paragraf(
    "evropska-konvencija-o-ljudskim-pravima",
    "zakon-ratifikaciji-evropske-konvencije-ljudska-prava-osnovne-slobode.html",
    "human-rights",
  ),
  paragraf(
    "zakon-o-osnovama-svojinskopravnih-odnosa",
    "zakon_o_osnovama_svojinskopravnih_odnosa.html",
    "real-estate",
  ),
  paragraf(
    "zakon-o-prometu-nepokretnosti",
    "zakon_o_prometu_nepokretnosti.html",
    "real-estate",
  ),
  paragraf("zakon-o-hipoteci", "zakon_o_hipoteci.html", "real-estate"),
  paragraf(
    "zakon-o-postupku-upisa-u-katastar",
    "zakon-o-postupku-upisa-u-katastar-nepokretnosti-i-vodova.html",
    "real-estate",
  ),
  paragraf(
    "zakon-o-poljoprivrednom-zemljistu",
    "zakon_o_poljoprivrednom_zemljistu.html",
    "agriculture",
  ),
  paragraf("porodicni-zakon", "porodicni_zakon.html", "family"),
  paragraf("zakon-o-nasledjivanju", "zakon_o_nasledjivanju.html", "family"),
  paragraf("zakon-o-arbitrazi", "zakon_o_arbitrazi.html", "arbitration"),
  paragraf(
    "zakon-o-posredovanju-u-resavanju-sporova",
    "zakon_o_posredovanju_u_resavanju_sporova.html",
    "arbitration",
  ),
  paragraf("zakon-o-radu", "zakon_o_radu.html", "labor"),
];
