# Step 07 - Patient App API

# Goal

Expose endpoints for the patient mobile app.

---

# Requirements

Patients must be able to:
- access profile
- access meal plans
- access progress history

---

# Endpoints

## Get Current User

```txt
GET /me
```

---

# Get My Meal Plans

```txt
GET /my-meal-plans
```

---

# Get My Progress

```txt
GET /my-progress
```

---

# Security Rules

Patients must only access their own data.

Use authenticated user id to resolve patient profile.

Never trust route ids from patients.

---

# Response Rules

Keep payloads mobile-friendly.

Avoid deeply nested responses.

---

# Non Goals

Do not implement:
- offline mode
- push notifications
- real-time sync
