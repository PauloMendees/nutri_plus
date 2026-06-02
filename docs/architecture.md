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

For manual testing before the frontend exists, the backend exposes a thin login
proxy `POST /v1/auth/login` that forwards email+password to Supabase's password
grant and returns the session. Supabase remains the auth authority; the backend
forwards credentials over TLS and never stores them.

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
