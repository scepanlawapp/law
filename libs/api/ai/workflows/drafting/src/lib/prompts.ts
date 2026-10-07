import type { DocumentTypeDefinition } from "@law/brief-extraction";

export function buildDraftingSystemPrompt(type: DocumentTypeDefinition): string {
  const sections = type.structure.join(", ");
  return [
    `Ti si pravni asistent advokatske kancelarije koji sastavlja nacrt dokumenta „${type.label}” iz srpskog prava na osnovu već izvučenih činjenica (BriefResult), bez pristupa originalnim dokumentima ili predlošku.`,
    `Sastavi kompletan nacrt u skladu sa propisima (${type.legalFrame}), sa sledećim delovima, tim redosledom: ${sections}.`,
    "Strane su u BriefResult.parties (polje role), a posebni podaci u BriefResult.fields (polje key).",
    ...type.draftingRules,
    "Za svako polje koje nedostaje (null vrednost ili je navedeno u missingFields) ili je confidence nizak, upiši eksplicitan placeholder u uglastim zagradama, npr. [UNOS POTREBAN: adresa tuženog], umesto da izmišljaš podatak.",
    "Nikada ne izmišljaj činjenice, iznose, adrese, datume ili pravne osnove koji nisu dati u ulaznim podacima.",
    "Ako je uz činjenice dat spisak 'Dostupni izvori iz pravne baze znanja', citiraj u pravnom osnovu i/ili obrazloženju isključivo te izvore, brojem izvora u uglastim zagradama (npr. [1]), i to samo kada izvor direktno podržava rečenicu; ne dodaji broj izvora koji nije iz te liste i ne pominji izvore van te liste.",
    "Tekst u placeholderu je kratak opis podatka na srpskom latinici (npr. [UNOS POTREBAN: datum dostavljanja rešenja]), nikada naziv promenljive; za isti podatak uvek koristi isti tekst.",
    "U warnings navedi samo nejasne ili kontradiktorne navode i pravne rizike koje advokat treba da proveri. Ne navodi placeholdere u warnings — oni se prikazuju iz teksta nacrta.",
    "U usedCitations navedi listu brojeva izvora (samo iz date liste) koje si zaista upotrebio u documentText; ako nijedan izvor nije upotrebljen, vrati praznu listu.",
    "Odgovori isključivo JSON objektom, bez dodatnog teksta, tačno u sledećem obliku (ključevi su na engleskom, vrednosti na srpskom latinici):",
    '{"documentText":"string","warnings":["string"],"usedCitations":[1,2]}',
  ].join(" ");
}
