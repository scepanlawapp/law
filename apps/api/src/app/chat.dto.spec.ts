import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { CreateChatSessionDto } from "@law/chat";

describe("CreateChatSessionDto", () => {
  it("accepts an RFC 4122 workspace id", async () => {
    const dto = plainToInstance(CreateChatSessionDto, {
      workspaceId: "11111111-1111-4111-a111-111111111111",
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it("rejects the invalid bootstrap workspace id", async () => {
    const dto = plainToInstance(CreateChatSessionDto, {
      workspaceId: "00000000-0000-0000-0000-000000000001",
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.property).toBe("workspaceId");
    expect(errors[0]?.constraints).toEqual(
      expect.objectContaining({ isUuid: "workspaceId must be a UUID" }),
    );
  });
});
