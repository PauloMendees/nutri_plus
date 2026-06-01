# Step 03 - Patient Management

# Goal

Implement patient management features for nutritionists.

---

# Requirements

Nutritionists must be able to:
- list patients
- view patient details
- update patient information
- add progress entries

Patients must only access their own data.

---

# Models

## ProgressEntry

```prisma
model ProgressEntry {
  id              String   @id @default(uuid())

  patientId       String
  patient         PatientProfile @relation(fields: [patientId], references: [id])

  weight          Float?
  bodyFat         Float?

  notes           String?

  createdAt       DateTime @default(now())
}
```

---

# Endpoints

## List Patients

```txt
GET /patients
```

Nutritionist only.

Return all patients linked to authenticated nutritionist.

---

# Get Patient Details

```txt
GET /patients/:id
```

Nutritionist only.

Must validate ownership.

---

# Update Patient

```txt
PATCH /patients/:id
```

Nutritionist only.

---

# Create Progress Entry

```txt
POST /patients/:id/progress
```

Nutritionist only.

---

# List Progress Entries

```txt
GET /patients/:id/progress
```

---

# Validation Rules

## Patient Ownership

Nutritionists can only access patients linked to their profile.

---

# Security Rules

Patients cannot:
- access other patients
- update clinical data
- access nutritionist-only endpoints

---

# Non Goals

Do not implement:
- file uploads
- image analysis
- messaging
- notifications
