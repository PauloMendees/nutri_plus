# Step 02 - Authentication

## Goal

Integrate Supabase Auth.

## Important

The backend does not implement:

- login
- registration
- password reset

These responsibilities belong to Supabase.

## Endpoint

POST /auth/sync-user

## Flow

1. User authenticates with Supabase
2. Frontend receives JWT
3. Frontend calls sync-user
4. Backend validates JWT
5. Backend creates or updates local User

## Request

```json
{
  "role": "PATIENT",
  "referralCode": "NUTRI-12345"
}
```

## Current User

GET /auth/me

## Guards

- SupabaseJwtGuard
- RolesGuard
