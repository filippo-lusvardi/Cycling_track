import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { t } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/** Back to Home, from the Tree and the Garden. */
export function BackHome({ className }: { className?: string }) {
  return (
    <Link
      to="/"
      className={cn(
        "on-sky inline-flex items-center gap-1 text-sm text-foreground/85 hover:text-foreground",
        className,
      )}
    >
      <ArrowLeft className="h-4 w-4" /> {t("Home", "Casa")}
    </Link>
  );
}
