# Reviews Checklist

- Open `/journal/reviews` and confirm authenticated review rows load from the real `reviews` table.
- Confirm the save form renders for authenticated users and allows weekly/monthly period selection plus notes entry.
- Save a new review period and confirm a new row is persisted with notes plus a normalized `auto_stats` snapshot.
- Save the same `period` + `period_start` again and confirm the existing review is updated rather than duplicated.
- Confirm weekly and monthly review records match the existing schema period values and date ranges.
- Confirm saved `auto_stats` include only the supported realized-stats fields plus snapshot notes and unsupported-key metadata.
- Confirm saved `auto_stats` are normalized safely and unsupported legacy keys are hidden rather than mis-mapped.
- Confirm the page shows a current-period realized stats snapshot based on trades opened within the review period.
- Confirm validation errors are shown for invalid date ranges or oversized notes.
- Confirm save failures show an explicit error state and save success shows an explicit confirmation state.
- Confirm empty state is honest when no reviews exist.
- Confirm load failures show an explicit error state.
- Confirm the page does not imply attachments, screenshots, exports, delete flows, or advanced analytics are already wired.
