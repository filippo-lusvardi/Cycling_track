/** 0–100 readiness gauge: a ring that fills clockwise from the top. */
export function ReadinessRing({ score, color, size = 148 }: { score: number | null; color: string; size?: number }) {
  const r = 58;
  const c = 2 * Math.PI * r;
  const filled = score == null ? 0 : (Math.max(0, Math.min(100, score)) / 100) * c;
  return (
    <svg width={size} height={size} viewBox="0 0 140 140" role="img" aria-label={score == null ? "No readiness score" : `Readiness ${score} of 100`} className="mx-auto">
      <circle cx="70" cy="70" r={r} fill="none" stroke="var(--secondary)" strokeWidth="12" />
      <circle
        cx="70"
        cy="70"
        r={r}
        fill="none"
        stroke={color}
        strokeWidth="12"
        strokeLinecap="round"
        strokeDasharray={`${filled} ${c}`}
        transform="rotate(-90 70 70)"
        style={{ transition: "stroke-dasharray 600ms ease" }}
      />
      <text x="70" y="70" textAnchor="middle" dominantBaseline="central" className="stat-num" fontSize="38" fontWeight="600" fill="var(--foreground)">
        {score ?? "–"}
      </text>
      <text x="70" y="98" textAnchor="middle" fontSize="10" letterSpacing="1.5" fill="var(--muted-foreground)">
        READINESS
      </text>
    </svg>
  );
}
