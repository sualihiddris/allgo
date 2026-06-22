import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function seed() {
  console.log("🌱 Seeding AllGO MVP database...\n");

  // Create test customer
  // NOTE: phone must be "+233..." - normalizeGhanaPhone() always produces a
  // leading "+", so a seed row without it can never be matched by a real
  // login (OTP or dev-login) and silently becomes an unreachable duplicate.
  const customer = await prisma.user.upsert({
    where: { phone: "+233241234567" },
    update: {},
    create: {
      phone: "+233241234567",
      name: "Test Customer",
      role: "CUSTOMER",
      customer: { create: {} },
    },
  });
  console.log("✅ Customer:", customer.phone);

  // Create test drivers - one for each vehicle type
  const drivers = [
    { phone: "+233561111111", name: "Kofi (Moto)", vehicleType: "MOTO" as const },
    { phone: "+233552222222", name: "Ama (Keke)", vehicleType: "KEKE" as const },
    { phone: "+233553333333", name: "Kwame (Motor King)", vehicleType: "MOTOR_KING" as const },
  ];

  for (const d of drivers) {
    const driver = await prisma.user.upsert({
      where: { phone: d.phone },
      update: {},
      create: {
        phone: d.phone,
        name: d.name,
        role: "DRIVER",
        driver: {
          create: {
            vehicleType: d.vehicleType,
            isApproved: true,
            isOnline: true,
            lastLocation: JSON.stringify({
              lat: 5.6037 + (Math.random() - 0.5) * 0.02,
              lng: -0.1870 + (Math.random() - 0.5) * 0.02,
              timestamp: new Date().toISOString(),
            }),
          },
        },
      },
    });
    console.log(`✅ Driver (${d.vehicleType}):`, driver.phone);
  }

  // Create admin
  const admin = await prisma.user.upsert({
    where: { phone: "+233200000000" },
    update: {},
    create: {
      phone: "+233200000000",
      name: "Admin",
      role: "ADMIN",
      admin: { create: {} },
    },
  });
  console.log("✅ Admin:", admin.phone);

  console.log("\n=== Login Credentials ===");
  console.log("Customer:   0241234567");
  console.log("Moto:       0551111111");
  console.log("Keke:       0552222222");
  console.log("Motor King: 0553333333");
  console.log("Admin:      0200000000");
  console.log("\n(Use Dev Login - no OTP needed in dev mode)");

  await prisma.$disconnect();
}

seed().catch((e) => {
  console.error(e);
  process.exit(1);
});
