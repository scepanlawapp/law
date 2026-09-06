const { PrismaClient } = require("@prisma/client");
const { randomBytes, scryptSync } = require("node:crypto");

function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const key = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${key}`;
}

async function main() {
  const email = process.env.AUTH_BOOTSTRAP_EMAIL?.trim().toLowerCase();
  const password = process.env.AUTH_BOOTSTRAP_PASSWORD;
  const workspaceName =
    process.env.AUTH_BOOTSTRAP_WORKSPACE ?? "Default workspace";

  if (!email || !password) {
    throw new Error(
      "AUTH_BOOTSTRAP_EMAIL and AUTH_BOOTSTRAP_PASSWORD are required",
    );
  }
  if (password.length < 12) {
    throw new Error("AUTH_BOOTSTRAP_PASSWORD must be at least 12 characters");
  }

  const prisma = new PrismaClient();
  try {
    // Must be RFC 4122: class-validator @IsUUID() rejects nil-like ids.
    const workspaceId =
      process.env.AUTH_BOOTSTRAP_WORKSPACE_ID ??
      "11111111-1111-4111-a111-111111111111";
    const workspace = await prisma.workspace.upsert({
      where: { id: workspaceId },
      update: { name: workspaceName },
      create: {
        id: workspaceId,
        name: workspaceName,
      },
    });

    let user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      user = await prisma.user.create({
        data: {
          email,
          passwordHash: hashPassword(password),
          status: "ACTIVE",
          passwordChangedAt: new Date(),
        },
      });
    } else if (process.env.AUTH_BOOTSTRAP_FORCE_PASSWORD_RESET === "true") {
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          passwordHash: hashPassword(password),
          status: "ACTIVE",
          passwordChangedAt: new Date(),
        },
      });
    }

    await prisma.workspaceMember.upsert({
      where: {
        userId_workspaceId: { userId: user.id, workspaceId: workspace.id },
      },
      update: { role: "OWNER", status: "ACTIVE" },
      create: {
        userId: user.id,
        workspaceId: workspace.id,
        role: "OWNER",
        status: "ACTIVE",
      },
    });

    console.log(`Bootstrap user ready: ${email}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
