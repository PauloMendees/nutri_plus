-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('NUTRITIONIST', 'PATIENT');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "authProvider" TEXT NOT NULL,
    "authProviderId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NutritionistProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "crn" TEXT,
    "referralCode" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NutritionistProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatientProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "nutritionistId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PatientProfile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_authProvider_authProviderId_key" ON "User"("authProvider", "authProviderId");

-- CreateIndex
CREATE UNIQUE INDEX "NutritionistProfile_userId_key" ON "NutritionistProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "NutritionistProfile_referralCode_key" ON "NutritionistProfile"("referralCode");

-- CreateIndex
CREATE UNIQUE INDEX "PatientProfile_userId_key" ON "PatientProfile"("userId");

-- CreateIndex
CREATE INDEX "PatientProfile_nutritionistId_idx" ON "PatientProfile"("nutritionistId");

-- AddForeignKey
ALTER TABLE "NutritionistProfile" ADD CONSTRAINT "NutritionistProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientProfile" ADD CONSTRAINT "PatientProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientProfile" ADD CONSTRAINT "PatientProfile_nutritionistId_fkey" FOREIGN KEY ("nutritionistId") REFERENCES "NutritionistProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
