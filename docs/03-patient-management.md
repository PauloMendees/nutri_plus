# Step 03 - Patient Management

> **Note:** The `ProgressEntry` model and the `/progress` endpoints below are
> **superseded by `docs/3.1-patient-domain-mode.md`**, which defines the richer
> `BodyAssessment` model. The implemented endpoints are
> `POST /v1/patients/:id/assessments` and `GET /v1/patients/:id/assessments`.
> Ownership, role rules, and non-goals in this document still apply.

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

---

# Nutritionist-Created Patients (update)

Patients can now be **created by the nutritionist** during the consultation via
`POST /v1/patients` (name + email + optional clinical fields). The backend invites
the patient through the Supabase Admin API and creates the linked record in one
step — see `docs/superpowers/specs/2026-06-04-nutritionist-created-patients-design.md`.
The earlier "patients self-onboard only" assumption no longer holds; `sync-user`
remains for nutritionist onboarding and for an invited patient's first login.
