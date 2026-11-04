import { createFileRoute, redirect } from "@tanstack/react-router";

/** Body lives in Analysis now: old links and bookmarks to /body land on that view. */
export const Route = createFileRoute("/body")({
  beforeLoad: () => {
    throw redirect({ to: "/analysis", search: { view: "body" }, replace: true });
  },
});
