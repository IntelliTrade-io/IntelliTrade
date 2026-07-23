# Uploads Checklist

- Open a trade detail page and confirm the screenshot section renders the real upload form.
- Validate PNG, JPEG, and WebP files against the screenshot helper.
- Reject empty files and files larger than 8 MB.
- Confirm upload requests fail for unsupported file types with an explicit error.
- Confirm screenshot storage paths are namespaced by user and trade.
- Confirm `screenshot_urls` stores stable storage object paths, not expiring signed URLs.
- Confirm screenshots render read-only from signed URLs generated at request time.
- Confirm missing or unreadable stored objects show an honest unavailable state instead of a broken silent failure.
- Confirm uploads only work for trades owned by the current authenticated user.
- Confirm trade delete attempts best-effort storage cleanup for the stored screenshot object paths after the trade row is removed.
- Confirm the private `journal-screenshots` bucket and matching storage policies are in place before QA signoff.
