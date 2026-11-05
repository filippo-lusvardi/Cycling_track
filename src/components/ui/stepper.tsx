// A value changed with − and + on either side of it.
import { Minus, Plus } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function Stepper({
  children,
  less,
  more,
  canLess = true,
  canMore = true,
  onLess,
  onMore,
  compact,
}: {
  /** The value between the buttons. */
  children: ReactNode;
  /** What each button says to someone who can't see it. */
  less: string;
  more: string;
  canLess?: boolean;
  canMore?: boolean;
  onLess: () => void;
  onMore: () => void;
  compact?: boolean;
}) {
  const size = compact ? "h-10 w-10 shrink-0" : "h-11 w-11";
  return (
    <div className={cn("flex shrink-0 items-center", compact ? "gap-1" : "gap-3")}>
      <Button
        type="button"
        variant="secondary"
        size="icon"
        className={size}
        aria-label={less}
        disabled={!canLess}
        onClick={onLess}
      >
        <Minus />
      </Button>
      {children}
      <Button
        type="button"
        variant="secondary"
        size="icon"
        className={size}
        aria-label={more}
        disabled={!canMore}
        onClick={onMore}
      >
        <Plus />
      </Button>
    </div>
  );
}
