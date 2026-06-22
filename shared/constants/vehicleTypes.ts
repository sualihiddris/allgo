/**
 * AllGO MVP Vehicle Types
 * 
 * MOTO - Motorcycle (1 passenger)
 * KEKE - Tricycle taxi (1-3 passengers)
 * MOTOR_KING - Cargo tricycle (goods transport)
 */

export const VEHICLE_TYPES = {
  MOTO: "MOTO",
  KEKE: "KEKE",
  MOTOR_KING: "MOTOR_KING",
} as const;

export type VehicleType = (typeof VEHICLE_TYPES)[keyof typeof VEHICLE_TYPES];

// Display names
export const VEHICLE_DISPLAY_NAMES: Record<VehicleType, string> = {
  MOTO: "Motorbike",
  KEKE: "Keke (Tricycle)",
  MOTOR_KING: "Motor King",
};

// Max passengers per vehicle
export const VEHICLE_CAPACITY: Record<VehicleType, number> = {
  MOTO: 1,
  KEKE: 3,
  MOTOR_KING: 0, // Goods only
};

// Vehicle descriptions
export const VEHICLE_DESCRIPTIONS: Record<VehicleType, string> = {
  MOTO: "Quick & affordable for one person",
  KEKE: "Comfortable for up to 3 people",
  MOTOR_KING: "For transporting goods & cargo",
};
