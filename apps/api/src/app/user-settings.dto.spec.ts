import "reflect-metadata";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { UpdatePreferencesDto } from "@law/user-settings";

describe("UpdatePreferencesDto appearance values", () => {
  it("accepts every new theme and accent", async () => {
    for (const theme of [
      "MIDNIGHT",
      "DEEP_NAVY",
      "CHARCOAL",
      "DARK_TEAL",
      "BURGUNDY",
      "IVORY",
    ]) {
      const dto = plainToInstance(UpdatePreferencesDto, {
        theme,
        accentColor: "GOLD",
      });
      expect(await validate(dto)).toHaveLength(0);
    }

    for (const accentColor of [
      "GOLD",
      "EMERALD",
      "ROYAL_BLUE",
      "COPPER",
      "ICE_BLUE",
      "BURGUNDY",
      "PURPLE",
      "IVORY",
    ]) {
      const dto = plainToInstance(UpdatePreferencesDto, {
        theme: "MIDNIGHT",
        accentColor,
      });
      expect(await validate(dto)).toHaveLength(0);
    }
  });

  it("rejects legacy appearance values", async () => {
    const dto = plainToInstance(UpdatePreferencesDto, {
      theme: "DARK",
      accentColor: "BLUE",
    });

    const errors = await validate(dto);
    expect(errors.map((error) => error.property)).toEqual([
      "theme",
      "accentColor",
    ]);
  });
});
