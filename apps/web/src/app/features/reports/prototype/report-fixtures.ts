import { ReportAllocation, ReportDataset, ReportRecord } from "./report-model";
/** Entirely fictional. The dedicated self slot is bound to the authenticated user only at the mock boundary. */
export function demoDataset(viewerId: string): ReportDataset {
  const members = [
    { id: viewerId, name: "Ana Radović (demo)", former: false },
    { id: "demo-marko", name: "Marko Vuković", former: false },
    { id: "demo-nikola", name: "Nikola Savić", former: false },
    { id: "demo-jelena", name: "Jelena Đorđević", former: true },
  ];
  const clients = [
    "Dunav Studio d.o.o.",
    "Javor Tehnika d.o.o.",
    "Mila Petrović",
    "Orion Trgovina d.o.o.",
  ];
  const records: ReportRecord[] = [];
  // Twelve stable months, with earlier invoices paid in later months, plus older balances for aging.
  for (let month = 1; month <= 12; month++) {
    for (let scenario = 0; scenario < 10; scenario++) {
      const performer = scenario === 8 ? 2 : scenario === 7 ? 3 : scenario % 2;
      const memberId = members[performer].id;
      const day = 3 + scenario * 2;
      const date = `2026-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const later = (days: number) =>
        new Date(Date.parse(date + "T00:00:00Z") + days * 86400000)
          .toISOString()
          .slice(0, 10);
      const amount = (36000 + month * 2100 + scenario * 4500) * 100;
      const clientIndex = scenario % clients.length;
      const ownClient = scenario % 3 === 0;
      const workRate =
        performer === 0
          ? ownClient
            ? 4000
            : 3000
          : performer === 1
            ? ownClient
              ? 3500
              : 2500
            : 2000;
      const missing = scenario === 9;
      const excluded = scenario === 8;
      const uninvoiced = scenario === 5 || scenario === 6;
      const full =
        scenario === 0 || scenario === 2 || scenario === 7 || scenario === 8;
      const partial = scenario === 1 || scenario === 3 || missing;
      const allocations: ReportAllocation[] =
        missing || excluded
          ? []
          : [
              {
                memberId,
                category: "workShare",
                rate: workRate,
                reason: ownClient ? "ownClient" : "otherClient",
              },
            ];
      // Ana receives an origination allocation for work performed by Marko (including origination-only records).
      if (!missing && !excluded && !ownClient)
        allocations.push({
          memberId: performer === 0 ? "demo-marko" : viewerId,
          category: "origination",
          reason: "origination",
          rate: 1000,
        });
      records.push({
        id: `demo-${month}-${scenario}`,
        performerId: memberId,
        clientId: `client-${clientIndex}`,
        client: clients[clientIndex],
        caseId: `case-${clientIndex}`,
        caseName: `P ${120 + clientIndex}/2026`,
        titleKey: `report.event.${scenario % 4}`,
        workDate: date,
        workStatus: scenario === 6 ? "planned" : "completed",
        estimated: amount,
        invoice: uninvoiced
          ? null
          : {
              reference: `DEMO-${month}-${scenario + 1}`,
              date: later(4),
              amount,
            },
        payments: uninvoiced
          ? []
          : full
            ? [{ date: later(scenario === 2 ? 35 : 12), amount }]
            : partial
              ? [{ date: later(15), amount: amount / 2 }]
              : [],
        sharing: missing ? "missing" : excluded ? "excluded" : "configured",
        allocations,
      });
    }
  }
  return { members, records };
}
