CREATE TABLE "Bus" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "vehicle_no" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Bus_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Bus_vehicle_no_key" ON "Bus"("vehicle_no");

CREATE TABLE "DieselFill" (
    "id" TEXT NOT NULL,
    "bus_id" TEXT NOT NULL,
    "filled_on" TEXT NOT NULL,
    "litres" DOUBLE PRECISION NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DieselFill_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DieselFill_bus_id_filled_on_idx" ON "DieselFill"("bus_id", "filled_on");
CREATE INDEX "DieselFill_filled_on_idx" ON "DieselFill"("filled_on");

ALTER TABLE "DieselFill" ADD CONSTRAINT "DieselFill_bus_id_fkey" FOREIGN KEY ("bus_id") REFERENCES "Bus"("id") ON DELETE CASCADE ON UPDATE CASCADE;
