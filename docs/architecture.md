# Project Architecture

## Overview

Nutrition SaaS platform for nutritionists and patients.

## Authentication

This project uses Supabase Auth as the authentication provider.

Supabase is responsible for:

- Sign up
- Sign in
- Password reset
- Email verification
- Session management
- JWT issuance
- Social logins (apple e google)

The backend never stores passwords.

The backend verifies access tokens with the project's **asymmetric JWT signing
key (ES256)**, fetched from `${SUPABASE_URL}/auth/v1/.well-known/jwks.json`. There
is no shared `SUPABASE_JWT_SECRET`.

## Tech Stack

- NestJS
- TypeScript
- Prisma
- PostgreSQL
- Supabase Auth
- OpenAI API

## User Synchronization

After authenticating with Supabase, the frontend must call:

POST /auth/sync-user

The backend will create or update the local user record.

## User Model Strategy

Store:

- authProvider
- authProviderId
- email
- role

Recommended:

```prisma
authProvider   String
authProviderId String

@@unique([authProvider, authProviderId])
```

## AI Principles

The backend performs calculations.
AI only suggests, adapts and explains.

## Authorization

Roles:

- NUTRITIONIST
- PATIENT
