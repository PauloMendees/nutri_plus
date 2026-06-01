# Step 04 - Meal Plans

# Goal

Implement meal plan structure and CRUD operations.

---

# Requirements

Nutritionists must be able to:
- create meal plans
- update meal plans
- manage meals
- manage meal items

Patients must be able to:
- view their own meal plans

---

# Models

## MealPlan

```prisma
model MealPlan {
  id              String   @id @default(uuid())

  patientId       String
  patient         PatientProfile @relation(fields: [patientId], references: [id])

  title           String
  objective       String?

  aiGenerated     Boolean  @default(false)

  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  meals           Meal[]
}
```

---

# Meal

```prisma
model Meal {
  id              String   @id @default(uuid())

  mealPlanId      String
  mealPlan        MealPlan @relation(fields: [mealPlanId], references: [id])

  name            String
  timeLabel       String?

  instructions    String?

  createdAt       DateTime @default(now())

  items           MealItem[]
}
```

---

# MealItem

```prisma
model MealItem {
  id              String   @id @default(uuid())

  mealId          String
  meal            Meal @relation(fields: [mealId], references: [id])

  foodName        String
  quantity        String

  calories        Float?

  protein         Float?
  carbs           Float?
  fats            Float?
}
```

---

# Endpoints

## Create Meal Plan

```txt
POST /meal-plans
```

---

# Get Meal Plan

```txt
GET /meal-plans/:id
```

---

# Update Meal Plan

```txt
PATCH /meal-plans/:id
```

---

# Delete Meal Plan

```txt
DELETE /meal-plans/:id
```

---

# Rules

Meal plans belong to one patient only.

Nutritionists can only manage meal plans from linked patients.

---

# Non Goals

Do not implement:
- AI generation
- PDF export
- version history
