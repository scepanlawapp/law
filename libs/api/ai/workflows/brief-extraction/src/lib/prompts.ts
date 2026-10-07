import { type DocumentTypeDefinition, missingFieldKeys } from "./document-types";

export function buildBriefSystemPrompt(type: DocumentTypeDefinition): string {
  const parties = type.parties
    .map((party) => `${party.role} (${party.label.toLowerCase()})`)
    .join(", ");
  const fields = type.fields
    .map((field) => `${field.key} (${field.label.toLowerCase()}: ${field.hint})`)
    .join("; ");
  const keys = [...missingFieldKeys(type), "other"].join(", ");
  const example = JSON.stringify({
    parties: type.parties.map((party) => ({
      role: party.role,
      name: "string|null",
      address: "string|null",
      idNumber: "string|null",
    })),
    fields: type.fields.map((field) => ({ key: field.key, value: "string|null" })),
    legalBasis: ["string"],
    factualDescription: "string|null",
    evidence: [{ label: "string", provided: false }],
    missingFields: [
      { key: `${type.parties[type.parties.length - 1].role}Address`, label: "string" },
    ],
    confidence: 0.0,
    warnings: ["string"],
  });
  return [
    `Ti si pravni asistent advokatske kancelarije koji priprema činjenice za dokument „${type.label}” iz srpskog prava.`,
    "Iz poruke klijenta i priloženih dokumenata izvuci tačno one podatke koji su eksplicitno navedeni.",
    "Nikada ne izmišljaj JMBG, matične brojeve, adrese, iznose, datume ili druge podatke koji nisu jasno dati — za njih upiši null i dodaj stavku u missingFields.",
    `Strane (parties, polje role): ${parties}. Za svaku stranu navedi name, address i idNumber (JMBG ili matični broj).`,
    `Posebni podaci (fields, polje key): ${fields}.`,
    `Svaka stavka missingFields ima key i label. Dozvoljeni key: ${keys}. Ključ strane je role + Name, Address ili IdNumber (npr. ${type.parties[0].role}Address).`,
    "label je kratak opis podatka na srpskom latinici sa dijakriticima, kako bi ga napisao advokat (npr. \"Adresa tuženog\", \"Datum dostavljanja presude\"), nikada naziv promenljive. key other koristi samo kada nijedan drugi ne odgovara.",
    "U evidence navedi dokaze kao objekte sa label (kratak opis dokaza) i provided: true ako je taj dokument već među priloženim dokumentima, inače false.",
    `Pravni osnov navedi pozivanjem na relevantne odredbe propisa (${type.legalFrame}) kad god je to moguće.`,
    "Proceni confidence (0 do 1) koliko si siguran u izvučene podatke, i dodaj upozorenja u warnings za nejasne ili kontradiktorne navode.",
    "Odgovori isključivo JSON objektom, bez dodatnog teksta, tačno u sledećem obliku (ključevi su na engleskom, vrednosti na srpskom latinici):",
    example,
  ].join(" ");
}
