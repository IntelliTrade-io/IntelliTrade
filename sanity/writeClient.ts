import { createClient } from "next-sanity";

// Server-only Sanity client with write access. NEVER import this into a client
// component: it carries the SANITY_API_WRITE_TOKEN. It is used only by the
// market-context webhook route to read fresh (non-CDN) docs and commit the
// generated marketContext documents.
export const writeClient = createClient({
  projectId: process.env.NEXT_PUBLIC_SANITY_PROJECT_ID!,
  dataset: process.env.NEXT_PUBLIC_SANITY_DATASET!,
  apiVersion: "2024-01-01",
  useCdn: false,
  token: process.env.SANITY_API_WRITE_TOKEN,
});
