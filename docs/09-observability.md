# Step 09 - Observability

# Goal

Add logging, monitoring, and operational visibility.

---

# Requirements

Track:
- API errors
- AI usage
- latency
- token consumption

---

# AI Metrics

Log:
- model
- tokens used
- estimated cost
- response time

---

# Error Logging

Log:
- unhandled exceptions
- validation failures
- AI failures

---

# Suggested Libraries

- pino
- nestjs-pino

---

# Monitoring Goals

Be able to identify:
- expensive AI operations
- slow endpoints
- abnormal usage

---

# Security Rules

Never log:
- passwords
- JWT tokens
- sensitive health data

---

# Non Goals

Do not implement:
- distributed tracing
- enterprise monitoring
- advanced analytics
