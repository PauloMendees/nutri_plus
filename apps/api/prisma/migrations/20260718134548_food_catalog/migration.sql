-- CreateTable
CREATE TABLE "Food" (
    "id" TEXT NOT NULL,
    "tacoId" INTEGER,
    "name" TEXT NOT NULL,
    "searchName" TEXT NOT NULL,
    "group" TEXT,
    "energyKcal" DOUBLE PRECISION,
    "protein" DOUBLE PRECISION,
    "carbohydrate" DOUBLE PRECISION,
    "lipid" DOUBLE PRECISION,
    "fiber" DOUBLE PRECISION,
    "sodium" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Food_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Food_tacoId_key" ON "Food"("tacoId");

-- CreateIndex
CREATE INDEX "Food_searchName_idx" ON "Food"("searchName");
