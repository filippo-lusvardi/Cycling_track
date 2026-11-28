// The monkey on your back: a ride where the legs gave up, marked by hand as a readable "Monkey: yes" line in its
// intervals.icu description. A monkey hangs from the tip of the ride's branch and bends it. Pure.

const LINE = /^\s*monkey:\s*yes\s*$/im;

/** Whether the description carries the monkey's line. */
export const monkeyIn = (description: string | null): boolean => LINE.test(description ?? "");

/** The description with the line added at the end or removed. */
export function withMonkey(description: string | null, on: boolean): string {
  const rest = (description ?? "")
    .split("\n")
    .filter((l) => !LINE.test(l))
    .join("\n")
    .trim();
  return on ? [rest, "Monkey: yes"].filter(Boolean).join("\n\n") : rest;
}

/** The description to show, without the monkey's line (it has its own section). */
export const withoutMonkey = (description: string | null) => withMonkey(description, false);
