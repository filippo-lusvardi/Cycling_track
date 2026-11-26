// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { activitySections, setHidden } from "@/lib/layouts";
import { LAYOUTS } from "@/lib/settings";
import { useLayout, type UseLayout } from "./use-layout";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
vi.mock("@/lib/cloud", () => ({ saveProfile: vi.fn(() => Promise.resolve()) }));

const defs = activitySections("activity-ride");
let got: UseLayout;
function Probe() {
  got = useLayout("activity-gravel", defs, "activity-ride");
  return null;
}
const stored = () => JSON.parse(localStorage.getItem(LAYOUTS) ?? "{}");
const hidden = () => got.sections.filter((s) => s.hidden).map((s) => s.id);

describe("a kind of activity's own page", () => {
  let root: Root;
  let host: HTMLDivElement;
  beforeEach(() => {
    localStorage.setItem(
      LAYOUTS,
      JSON.stringify({ "activity-ride": { hidden: { segments: true } } }),
    );
    host = document.createElement("div");
    root = createRoot(host);
    act(() => root.render(<Probe />));
  });
  afterEach(() => {
    act(() => root.unmount());
    localStorage.clear();
  });

  it("starts as the rides' page was, and the first change makes it its own", () => {
    expect(hidden()).toContain("segments");
    act(() => got.change(setHidden(got.layout, "brioche", true)));
    expect(stored()["activity-gravel"].hidden).toEqual({ segments: true, brioche: true });
    expect(stored()["activity-ride"].hidden).toEqual({ segments: true });
  });
  it("goes back to the defaults when reset, not to the rides' page", () => {
    act(() => got.change(undefined));
    expect(stored()["activity-gravel"]).toEqual({});
    expect(hidden()).not.toContain("segments");
  });
});
