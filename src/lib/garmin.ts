// Garmin attribution, which intervals.icu's API terms require wherever Garmin-sourced data is shown.

/** "Garmin <device>" for an activity recorded on a Garmin device (as Garmin's brand guidelines word it), else null. */
export function garminAttribution(source: unknown, deviceName: unknown): string | null {
  const device = typeof deviceName === "string" ? deviceName.trim() : "";
  if (/^garmin\b/i.test(device)) return `Garmin${device.slice(6)}`;
  if (source !== "GARMIN_CONNECT") return null;
  return device ? `Garmin ${device}` : "Garmin";
}
