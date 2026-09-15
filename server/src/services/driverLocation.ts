import { prisma } from "../config/database";

export interface DurableDriverLocationSnapshot {
  persisted: boolean;
}

export async function persistDriverLocationSnapshot(
  driverId: string,
  lat: number,
  lng: number,
  sampleTimestamp: Date
): Promise<DurableDriverLocationSnapshot> {
  const result = await prisma.driver.updateMany({
    where: {
      id: driverId,
      OR: [
        { lastLocationAt: null },
        { lastLocationAt: { lt: sampleTimestamp } },
      ],
    },
    data: {
      lastLocation: JSON.stringify({
        lat,
        lng,
        timestamp: sampleTimestamp.toISOString(),
      }),
      lastLocationAt: sampleTimestamp,
    },
  });

  return { persisted: result.count > 0 };
}
