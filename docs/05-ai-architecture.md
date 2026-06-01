# Step 05 - AI Architecture

# Goal

Create a centralized AI module architecture.

---

# Requirements

Use:
- OpenAI API
- GPT-4o
- GPT-4o-mini

---

# Folder Structure

```txt
src/modules/ai/
  providers/
  prompts/
  services/
  types/
```

---

# Rules

Never call OpenAI directly from controllers.

All AI interactions must go through services.

---

# AI Provider

Create:

```txt
OpenAIProvider
```

Responsibilities:
- send prompts
- handle responses
- validate JSON output
- log token usage

---

# AI Principles

## AI must not:
- calculate macros
- calculate BMI
- calculate TDEE

The backend must handle all critical calculations.

---

# Structured Output

AI responses must return structured JSON.

Never rely on free-text parsing.

---

# Logging

Log:
- tokens
- latency
- estimated cost
- model used

---

# AIInteraction Model

```prisma
model AIInteraction {
  id                String   @id @default(uuid())

  patientId         String?
  patient           PatientProfile?
                     @relation(fields: [patientId], references: [id])

  type              String

  input             Json
  response          Json

  createdAt         DateTime @default(now())
}
```

---

# Non Goals

Do not implement:
- embeddings
- vector database
- memory systems
- RAG
