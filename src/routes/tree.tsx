import { createFileRoute, redirect } from "@tanstack/react-router";

/** The tree is the first page now: old links and bookmarks to /tree land there. */
export const Route = createFileRoute("/tree")({
  validateSearch: (s: Record<string, unknown>): { zoom?: "years" } =>
    s["zoom"] === "years" ? { zoom: "years" } : {},
  beforeLoad: ({ search }) => {
    throw redirect({ to: "/", search, replace: true });
  },
});
