# Recruitment 2.0 Architecture

This document outlines the initial modular structure of the project and the key principles for its evolution.

## Core principles

- Keep layers separated: UI, state management, services, and infrastructure.
- Allow business logic to be extracted into independent packages to simplify a future Unity migration.
- Use TypeScript as the shared language for both frontend and backend.

## Frontend

- `src/app` — base application composition and navigation.
- `src/components` — reusable visual components without business logic.
- `src/modules` — screens and their state.
- `src/shared` — types, utilities, and UI placeholders.
- Styles live in `src/styles` and are consumed via CSS modules.

## Backend

- `src/app` — Express entry point and route registration.
- `src/modules` — domain modules (accounts, cases, candidates, evaluation, questions, authentication).
- `src/shared` — shared infrastructure elements (for example, health checks).
- Services rely on repository layers that encapsulate PostgreSQL access via a connection pool.
- Lightweight migrations run on startup: tables are created and a super admin account is added.
- Deployment uses the `.nixpacks.toml` configuration, which installs dependencies through `npm install` and runs the build before the server starts.

## Next steps

1. Move migrations to a dedicated tool (for example, `node-pg-migrate` or Prisma) and introduce schema versioning.
2. Connect an email queue and integrate with a transactional email provider.
3. Persist one-time codes and sessions in durable storage with scalability in mind.
4. Integrate a production-grade AI API for resume parsing and interviewer feedback.
5. Add optimistic locking and WebSocket-based synchronization for real-time update notifications.
