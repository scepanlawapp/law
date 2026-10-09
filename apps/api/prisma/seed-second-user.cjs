// Seeds every office persona (profile, membership, user settings) into the workspace.
// Passwords: AUTH_BOOTSTRAP_PASSWORD{2..9}, falling back to AUTH_BOOTSTRAP_PASSWORD.
const { PrismaClient } = require("@prisma/client");
const { upsertPersonas } = require("./demo-personas.cjs");

async function main() {
  const workspaceName =
    process.env.AUTH_BOOTSTRAP_WORKSPACE ?? "Default workspace";

  const prisma = new PrismaClient();

  try {
    // Must be RFC 4122: class-validator @IsUUID() rejects nil-like ids.
    const workspaceId =
      process.env.AUTH_BOOTSTRAP_WORKSPACE_ID ??
      "11111111-1111-4111-a111-111111111111";

    const workspace = await prisma.workspace.upsert({
      where: { id: workspaceId },
      update: { name: workspaceName },
      create: { id: workspaceId, name: workspaceName },
    });

    const users = await upsertPersonas(prisma, workspace.id);

    await prisma.storageConnection.upsert({
      where: {
        workspaceId_configRef: {
          workspaceId: workspace.id,
          configRef: "local-default",
        },
      },
      update: { enabled: true, isDefault: true, providerType: "LOCAL" },
      create: {
        workspaceId: workspace.id,
        providerType: "LOCAL",
        enabled: true,
        isDefault: true,
        configRef: "local-default",
      },
    });

    for (const user of users)
      console.log(
        `User ready: ${user.firstName} ${user.lastName} <${user.email}>`,
      );
    console.log(`Bootstrap workspace ready: ${workspace.id}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
