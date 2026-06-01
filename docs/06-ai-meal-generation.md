# Step 06 - AI Meal Generation

# Goal

Generate meal plans using AI.

---

# Endpoint

```txt
POST /ai/generate-meal-plan
```

Nutritionist only.

---

# Flow

1. Fetch patient profile
2. Build structured context
3. Send prompt to AI
4. Validate JSON response
5. Save MealPlan
6. Save AIInteraction

---

# Input Context Example

```json
{
  "weight": 82,
  "height": 178,
  "objective": "weight_loss",
  "restrictions": ["lactose"]
}
```

---

# AI Response Format

```json
{
  "title": "Weight Loss Plan",
  "meals": [
    {
      "name": "Breakfast",
      "items": [
        {
          "foodName": "Eggs",
          "quantity": "2 units"
        }
      ]
    }
  ]
}
```

---

# Validation Rules

Reject:
- invalid JSON
- empty meals
- malformed structure

---

# Important Rules

Never store raw AI text as the primary meal plan structure.

Always normalize data into relational tables.

---

# Security

Nutritionists can only generate meal plans for linked patients.

---

# Non Goals

Do not implement:
- streaming
- chat interface
- conversational AI
