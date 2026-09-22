import "reflect-metadata";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { UpdateProfileDto } from "./user-settings.dto";

describe("UpdateProfileDto gender", () => {
  it.each(["MALE", "FEMALE", null, undefined])("accepts %p", async (gender) => {
    const dto = plainToInstance(UpdateProfileDto, { gender });

    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it("rejects unsupported values", async () => {
    const dto = plainToInstance(UpdateProfileDto, { gender: "OTHER" });

    const errors = await validate(dto);

    expect(errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          property: "gender",
          constraints: expect.objectContaining({ isIn: expect.any(String) }),
        }),
      ]),
    );
  });
});
