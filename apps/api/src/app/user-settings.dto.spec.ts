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

    for (const finish of ["SOLID", "METALLIC", "BRUSHED", "MATTE", "LUXURY"]) {
      const dto = plainToInstance(UpdatePreferencesDto, {
        theme: "MIDNIGHT",
        accentColor: "GOLD",
        finish,
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

  it("rejects an unknown finish value", async () => {
    const dto = plainToInstance(UpdatePreferencesDto, {
      theme: "MIDNIGHT",
      accentColor: "GOLD",
      finish: "NEON",
    });

    const errors = await validate(dto);
    expect(errors.map((error) => error.property)).toEqual(["finish"]);
  });

  it("validates notification preference keys and boolean values", async () => {
    const valid = plainToInstance(UpdatePreferencesDto, {
      notificationPreferences: {
        taskAssigned: false,
        deadlineDueSoon: true,
      },
    });
    expect(
      await validate(valid, { whitelist: true, forbidNonWhitelisted: true }),
    ).toHaveLength(0);

    const invalid = plainToInstance(UpdatePreferencesDto, {
      notificationPreferences: {
        taskAssigned: "no",
        arbitraryChannel: true,
      },
    });
    const errors = await validate(invalid, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    const serialized = JSON.stringify(errors);
    expect(serialized).toContain("taskAssigned");
    expect(serialized).toContain("arbitraryChannel");
  });
});
