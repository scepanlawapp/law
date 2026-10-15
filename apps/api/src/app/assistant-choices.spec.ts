import { choicesFromMetadata, toolChoices } from "@law/chat";

describe("assistant choices", () => {
  it("reads the choices a tool result offers, at most five", () => {
    const choices = Array.from({ length: 7 }, (_, index) => ({
      label: ` Borko ${index} `,
      reply: `Borko ${index}`,
    }));
    expect(toolChoices({ status: "INVALID", message: "…", choices })).toEqual(
      choices.slice(0, 5).map((item) => ({ label: item.label.trim(), reply: item.reply })),
    );
  });

  it("drops malformed entries and ignores results without choices", () => {
    expect(
      toolChoices({ choices: [{ label: "A" }, { label: " ", reply: "x" }, 3, { label: "B", reply: "B" }] }),
    ).toEqual([{ label: "B", reply: "B" }]);
    expect(toolChoices({ status: "OK" })).toBeNull();
    expect(toolChoices([{ label: "A", reply: "A" }])).toBeNull();
    expect(toolChoices({ choices: [] })).toBeNull();
  });

  it("maps message metadata to choices", () => {
    expect(
      choicesFromMetadata({ outcome: "ANSWER", choices: [{ label: "A", reply: "a" }] }),
    ).toEqual([{ label: "A", reply: "a" }]);
    expect(choicesFromMetadata(null)).toEqual([]);
  });
});
