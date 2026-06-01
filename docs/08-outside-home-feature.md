# Step 08 - Outside Home Feature

# Goal

Implement the outside-home AI assistant feature.

---

# Overview

Patients can ask for food suggestions when outside home.

The AI must provide recommendations aligned with:
- patient goal
- restrictions
- current meal plan

---

# Model

```prisma
model OutsideHomeRequest {
  id                String   @id @default(uuid())

  patientId         String
  patient           PatientProfile
                     @relation(fields: [patientId], references: [id])

  message           String

  aiSuggestion      String

  createdAt         DateTime @default(now())
}
```

---

# Endpoint

```txt
POST /outside-home
```

Patient only.

---

# Request Example

```json
{
  "message": "I am at a burger restaurant"
}
```

---

# Flow

1. Fetch patient profile
2. Fetch latest meal plan
3. Build AI context
4. Generate suggestion
5. Save request and response

---

# Rules

Suggestions must:
- be practical
- be concise
- avoid medical claims

---

# Logging

Store:
- request
- response
- timestamp

---

# Security

Patients can only access their own requests.

---

# Non Goals

Do not implement:
- image recognition
- voice input
- restaurant integrations
