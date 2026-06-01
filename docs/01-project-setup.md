# Step 01 - Project Setup

## Goal

Initialize infrastructure.

## Stack

- NestJS
- Prisma
- PostgreSQL
- Docker
- Supabase Auth

## Environment Variables

```env
DATABASE_URL=
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_JWT_SECRET=
OPENAI_API_KEY=
```

## User Model

```prisma
enum UserRole {
  NUTRITIONIST
  PATIENT
}

model User {
  id               String @id @default(uuid())

  authProvider     String
  authProviderId   String

  email            String @unique
  name             String

  role             UserRole

  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  nutritionistProfile NutritionistProfile?
  patientProfile      PatientProfile?

  @@unique([authProvider, authProviderId])
}
```
