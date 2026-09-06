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
    const workspace = await prisma.workspace.upsert({
      where: {
        id:
          process.env.AUTH_BOOTSTRAP_WORKSPACE_ID ??
          "00000000-0000-0000-0000-000000000001",
      },
      update: { name: workspaceName },
      create: {
        id:
          process.env.AUTH_BOOTSTRAP_WORKSPACE_ID ??
          "00000000-0000-0000-0000-000000000001",
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
