# Phase 1 and Phase 2 Implementation Plan

## What Is Being Built

Phase 1 creates the platform foundation shared by every future module:

- Organizations and properties.
- Property settings.
- Users, roles, permissions, and secure login.
- Audit logging.
- Business date records.
- Chart of accounts foundation.
- Financial period and journal entry structure.
- Accounting balance validation.
- Web dashboard shell for administrators and managers.

## Database Changes

The first database model is defined in `apps/api/prisma/schema.prisma`.

Core tables:

- `organizations`
- `properties`
- `property_settings`
- `departments`
- `users`
- `user_sessions`
- `roles`
- `permissions`
- `user_roles`
- `role_permissions`
- `business_dates`
- `audit_logs`
- `accounts`
- `account_mappings`
- `financial_periods`
- `journal_entries`
- `journal_lines`

## API Changes

Initial API groups:

- `/api/auth`
- `/api/users`
- `/api/organizations`
- `/api/properties`
- `/api/roles`
- `/api/permissions`
- `/api/accounting`
- `/api/audit`
- `/api/health`

## Completion Gate

Phase 1 is complete only when:

- Login works.
- Backend permission checks are enforced.
- Users and properties are tenant scoped.
- Sensitive changes create audit records.
- Journal entry validation blocks unbalanced entries.
- Tests pass for accounting balance rules.
- The web dashboard exposes the foundation status and next phase path.

## Phase 2 Hotel Core Additions

Database tables:

- `room_types`
- `floors`
- `rooms`
- `guests`
- `reservations`
- `reservation_rooms`
- `reservation_guests`
- `folios`
- `folio_items`

API groups:

- `/api/front-office/room-types`
- `/api/front-office/rooms`
- `/api/front-office/guests`
- `/api/front-office/reservations`
- `/api/front-office/reservations/:reservationId/check-in`
- `/api/front-office/reservations/:reservationId/check-out`

Business rules:

- Departure date must be after arrival date.
- A room cannot be double-booked across overlapping tentative, confirmed, or checked-in reservations.
- Check-in requires a confirmed reservation and an assigned room.
- Check-in creates an open folio for the primary guest.
- Check-out requires an open folio to be settled first.
- Check-out marks the room available and dirty.

Phase 2 is not considered fully complete until live database integration tests can run against PostgreSQL.
