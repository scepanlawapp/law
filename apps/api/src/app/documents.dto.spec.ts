import { IncomingMessage } from "node:http";
import { Readable } from "node:stream";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import {
  BulkDocumentAiAccessDto,
  parseDocumentUpload,
  UpdateDocumentDto,
} from "@law/workspace-documents";

const id = "11111111-1111-4111-a111-111111111111";

const errorsFor = async <T extends object>(type: new () => T, body: unknown) =>
  validate(plainToInstance(type, body), { forbidNonWhitelisted: true });

describe("document AI access DTOs", () => {
  it("accepts 1 to 200 uuids with a boolean aiAccess", async () => {
    expect(
      await errorsFor(BulkDocumentAiAccessDto, {
        documentIds: [id],
        aiAccess: true,
      }),
    ).toHaveLength(0);
    expect(
      await errorsFor(BulkDocumentAiAccessDto, {
        documentIds: Array(200).fill(id),
        aiAccess: false,
      }),
    ).toHaveLength(0);
  });

  it.each([
    ["empty list", { documentIds: [], aiAccess: true }],
    ["201 ids", { documentIds: Array(201).fill(id), aiAccess: true }],
    ["non-uuid", { documentIds: ["nope"], aiAccess: true }],
    ["string flag", { documentIds: [id], aiAccess: "true" }],
    ["missing flag", { documentIds: [id] }],
  ])("rejects %s", async (_label, body) => {
    expect((await errorsFor(BulkDocumentAiAccessDto, body)).length).toBe(1);
  });

  it("accepts a boolean aiAccess on document patch only", async () => {
    expect(
      await errorsFor(UpdateDocumentDto, { aiAccess: false }),
    ).toHaveLength(0);
    expect(
      (await errorsFor(UpdateDocumentDto, { aiAccess: "yes" })).length,
    ).toBe(1);
  });
});

describe("parseDocumentUpload aiAccess", () => {
  const request = (aiAccess?: string) => {
    const boundary = "xBOUNDARYx";
    const parts = [
      ...(aiAccess === undefined
        ? []
        : [
            `--${boundary}\r\nContent-Disposition: form-data; name="aiAccess"\r\n\r\n${aiAccess}\r\n`,
          ]),
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="a.txt"\r\nContent-Type: text/plain\r\n\r\nhello\r\n`,
      `--${boundary}--\r\n`,
    ];
    return Object.assign(Readable.from([Buffer.from(parts.join(""))]), {
      headers: {
        "content-type": `multipart/form-data; boundary=${boundary}`,
      },
    }) as unknown as IncomingMessage;
  };

  it.each([
    ["true", true],
    ["false", false],
    [undefined, undefined],
  ])("parses %s", async (raw, expected) => {
    const upload = await parseDocumentUpload(request(raw));
    expect(upload.aiAccess).toBe(expected);
    upload.stream.resume();
  });

  it.each(["1", "TRUE", "yes", ""])("rejects %j", async (raw) => {
    await expect(parseDocumentUpload(request(raw))).rejects.toThrow(
      "aiAccess must be true or false",
    );
  });
});
