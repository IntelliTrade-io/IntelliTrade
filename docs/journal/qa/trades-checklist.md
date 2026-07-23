# Trades Checklist

- Confirm `/journal` loads without a React Query provider error.
- Confirm the trades table renders authenticated data or a clear auth-required state.
- Confirm pagination updates the API request and button disabled states.
- Confirm symbol links point to `/journal/trades/[id]`.
- Confirm empty and error states are readable on desktop and mobile.
- Confirm the add trade button routes to the live `/journal/trades/new` form.
- Confirm account and instrument options are loaded only for the authenticated user.
- Confirm the form blocks submit when required lookup prerequisites are missing.
- Confirm missing account or instrument prerequisites explain that the user must create or seed those records before adding trades.
- Confirm missing strategies do not block create or edit, and the UI explains that strategy is optional.
- Confirm at least one execution leg is required and add/remove leg controls work.
- Confirm successful submit returns to `/journal`.
- Confirm validation, auth, and API errors are visible and honest.
- Confirm a trade opened from the table can be updated through the detail page edit form for supported top-level fields only.
- Confirm execution legs can be replaced through the dedicated detail-page leg editor.
- Confirm execution legs and screenshot paths are not editable through the generic trade PATCH flow.
- Confirm trade delete requires explicit confirmation and returns the user to `/journal`.
