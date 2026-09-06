import { Test } from "@nestjs/testing";
import { CoreModule, PrismaService } from "@law/core";
import { ChatModule } from "@law/chat";

describe("ChatModule", () => {
  it("resolves AuthGuard dependencies from AuthModule", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [CoreModule, ChatModule],
    })
      .overrideProvider(PrismaService)
      .useValue({
        $connect: jest.fn(),
        $disconnect: jest.fn(),
      })
      .compile();

    expect(moduleRef.get(ChatModule)).toBeDefined();
    await moduleRef.close();
  });
});
