// Derives a URL-safe tenant slug from a free-text workspace name.
// Output matches the database constraint: ^[a-z0-9-]{1,32}$.
export function slugify(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip diacritics
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "") // remove disallowed chars but keep spaces and dashes
    .replace(/[\s]+/g, "-") // collapse spaces to single dash
    .replace(/-+/g, "-") // collapse multiple dashes
    .replace(/^-+|-+$/g, "") // strip leading/trailing dashes
    .slice(0, 32)
    .replace(/-+$/g, ""); // re-strip trailing dash if truncation produced one
}

export const SLUG_RE = /^[a-z0-9-]{1,32}$/;
