import { Logger } from "@nestjs/common";
import {
  AUTH_MAIL_JOB_OPTIONS,
  AuthMailJob,
  AuthMailProcessor,
  AuthMailService,
  AuthRuntimeConfig,
  renderAuthEmail,
} from "@law/auth";

const user = { id: "user-1", email: "ana@example.com" };

function createService() {
  const prisma = {
    userSettings: { findUnique: jest.fn().mockResolvedValue(null) },
    organizationSettings: { findUnique: jest.fn().mockResolvedValue(null) },
  };
  const queue = { add: jest.fn().mockResolvedValue(undefined) };
  const config = new AuthRuntimeConfig();
  const service = new AuthMailService(config, prisma as never, queue as never);
  return { service, prisma, queue };
}

describe("AUTH_MAIL_JOB_OPTIONS", () => {
  it("has the agreed retry and retention values", () => {
    expect(AUTH_MAIL_JOB_OPTIONS.attempts).toBe(5);
    expect(AUTH_MAIL_JOB_OPTIONS.backoff).toEqual({
      type: "exponential",
      delay: 5000,
    });
    expect(AUTH_MAIL_JOB_OPTIONS.removeOnComplete).toBe(true);
    expect(AUTH_MAIL_JOB_OPTIONS.removeOnFail).toEqual({ age: 3600 });
  });
});

describe("AuthMailService", () => {
  afterEach(() => jest.restoreAllMocks());

  it("enqueues password reset with the user's language", async () => {
    const { service, prisma, queue } = createService();
    prisma.userSettings.findUnique.mockResolvedValue({ language: "EN" });
    prisma.organizationSettings.findUnique.mockResolvedValue({
      displayName: "AK Test",
    });

    await service.sendPasswordReset(user, "t+1");

    expect(queue.add).toHaveBeenCalledWith(
      "send",
      {
        to: user.email,
        userId: user.id,
        locale: "EN",
        officeName: "AK Test",
        message: {
          template: "passwordReset",
          link: "http://localhost:4200/reset-password?token=t%2B1",
        },
      },
      AUTH_MAIL_JOB_OPTIONS,
    );
  });

  it("defaults to Serbian and office fallback", async () => {
    const { service, queue } = createService();

    await service.sendPasswordReset(user, "tok");

    const [, job] = queue.add.mock.calls[0] as [string, AuthMailJob];
    expect(job.locale).toBe("SR");
    expect(job.officeName).toBe("Law");
  });

  it("invitation is always Serbian", async () => {
    const { service, prisma, queue } = createService();
    prisma.userSettings.findUnique.mockResolvedValue({ language: "EN" });

    await service.sendInvitation("new@example.com", "tok");

    const [, job] = queue.add.mock.calls[0] as [string, AuthMailJob];
    expect(job.locale).toBe("SR");
    expect(job.userId).toBeNull();
    expect(job.to).toBe("new@example.com");
    expect(job.message.template).toBe("invitation");
  });

  it("sends password changed notice with ISO timestamp", async () => {
    const { service, queue } = createService();
    const changedAt = new Date("2026-10-16T10:30:00.000Z");

    await service.sendPasswordChanged(user, changedAt);

    const [, job] = queue.add.mock.calls[0] as [string, AuthMailJob];
    expect(job.message).toEqual({
      template: "passwordChanged",
      changedAt: "2026-10-16T10:30:00.000Z",
    });
  });

  it("enqueue failure does not throw and never logs the token", async () => {
    const { service, queue } = createService();
    queue.add.mockRejectedValue(new Error("redis down"));
    const warn = jest.spyOn(Logger.prototype, "warn").mockImplementation();

    await expect(
      service.sendPasswordReset(user, "secret-token"),
    ).resolves.toBeUndefined();

    expect(warn).toHaveBeenCalled();
    for (const call of warn.mock.calls) {
      expect(String(call[0])).not.toContain("secret-token");
    }
  });
});

describe("AuthMailService enqueue timeout", () => {
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it("does not hang when the queue never answers", async () => {
    jest.useFakeTimers();
    const { service, queue } = createService();
    queue.add.mockReturnValue(new Promise(() => undefined));
    const warn = jest.spyOn(Logger.prototype, "warn").mockImplementation();

    let settled = false;
    const pending = service
      .sendPasswordReset(user, "secret-token")
      .then(() => (settled = true));

    await jest.advanceTimersByTimeAsync(2900);
    expect(settled).toBe(false);
    await jest.advanceTimersByTimeAsync(200);
    await pending;

    expect(settled).toBe(true);
    expect(warn).toHaveBeenCalledTimes(1);
    const logged = String(warn.mock.calls[0][0]);
    expect(logged).toContain("passwordReset");
    expect(logged).toContain("user-1");
    expect(logged).not.toContain("secret-token");
    expect(logged).not.toContain("ana@example.com");
  });

  it("clears the timer when the add resolves", async () => {
    jest.useFakeTimers();
    const { service } = createService();

    await service.sendPasswordReset(user, "tok");

    expect(jest.getTimerCount()).toBe(0);
  });
});

describe("AuthMailProcessor", () => {
  const config = new AuthRuntimeConfig();
  const jobData: AuthMailJob = {
    to: "ana@example.com",
    userId: "user-1",
    locale: "SR",
    officeName: "AK Test",
    message: { template: "passwordReset", link: "http://x/reset?token=t" },
  };

  function createProcessor() {
    const transport = { sendMail: jest.fn().mockResolvedValue(undefined) };
    const prisma = { auditEvent: { create: jest.fn().mockResolvedValue({}) } };
    const processor = new AuthMailProcessor(
      config,
      transport as never,
      prisma as never,
    );
    return { processor, transport, prisma };
  }

  it("renders and sends", async () => {
    const { processor, transport } = createProcessor();
    const rendered = renderAuthEmail(jobData.message, {
      locale: "SR",
      officeName: "AK Test",
    });

    await processor.process({ data: jobData } as never);

    expect(transport.sendMail).toHaveBeenCalledWith({
      from: config.smtpFrom,
      to: jobData.to,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
    });
  });

  it("rethrows send errors so BullMQ retries", async () => {
    const { processor, transport } = createProcessor();
    transport.sendMail.mockRejectedValue(new Error("smtp down"));

    await expect(processor.process({ data: jobData } as never)).rejects.toThrow(
      "smtp down",
    );
  });

  it("audits final failure without the token", async () => {
    const { processor, prisma } = createProcessor();

    await processor.onFailed(
      { data: jobData, attemptsMade: 5, opts: { attempts: 5 } } as never,
      new Error("smtp down"),
    );

    expect(prisma.auditEvent.create).toHaveBeenCalledWith({
      data: {
        eventType: "EMAIL_DELIVERY_FAILED",
        outcome: "FAILURE",
        userId: "user-1",
        metadata: { template: "passwordReset" },
      },
    });
  });

  it("final-failure warning omits recipient and error message", async () => {
    const { processor } = createProcessor();
    const warn = jest.spyOn(Logger.prototype, "warn").mockImplementation();

    await processor.onFailed(
      { data: jobData, attemptsMade: 5, opts: { attempts: 5 } } as never,
      new Error("550 rejected ana@example.com"),
    );

    expect(warn).toHaveBeenCalled();
    const logged = warn.mock.calls.map((c) => String(c[0])).join("\n");
    expect(logged).toContain("passwordReset");
    expect(logged).toContain("user-1");
    expect(logged).not.toContain("ana@example.com");
    expect(logged).not.toContain("550 rejected");
    warn.mockRestore();
  });

  it("does not audit while retries remain", async () => {
    const { processor, prisma } = createProcessor();

    await processor.onFailed(
      { data: jobData, attemptsMade: 2, opts: { attempts: 5 } } as never,
      new Error("smtp down"),
    );

    expect(prisma.auditEvent.create).not.toHaveBeenCalled();
  });
});
