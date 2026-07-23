# Auth Checklist

- Confirm `/journal` redirects unauthenticated users to `/login`.
- Confirm `/journal/trades/new`, `/journal/trades/[id]`, `/journal/reviews`, and `/journal/exports` inherit the same redirect behavior.
- Confirm successful login redirects back to the sanitized `next` path.
- Confirm external or malformed `next` values fall back to `/journal`.
- Confirm `POST /api/journal` and `GET /api/journal/[id]` still return `401` without a valid auth cookie.
- Confirm sign out clears the session and returns the user to `/login`.
