import { createFileRoute, redirect } from "@tanstack/react-router";

// Today lives in the tree's crown now, so the home address opens the tree.
export const Route = createFileRoute("/")({
  beforeLoad: () => {
    throw redirect({ to: "/tree" });
  },
});
