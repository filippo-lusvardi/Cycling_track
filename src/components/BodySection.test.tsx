// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TrendChart } from "./BodySection";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
);

const days = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    date: `2026-10-${String(i + 1).padStart(2, "0")}`,
    weight: 72 - i * 0.1 + (i % 2 ? 0.3 : -0.3),
  }));

describe("weight and body fat charts", () => {
  let root: Root;
  let host: HTMLDivElement;
  beforeEach(() => {
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });
  const show = (n: number, trend: boolean) =>
    act(() =>
      root.render(
        <TrendChart data={days(n)} dataKey="weight" name="Weight" color="red" trend={trend} />,
      ),
    );

  it("say what the dashed trend is", () => {
    show(20, true);
    expect(host.textContent).toContain("Dashed: trend (linear)");
  });
  it("have no trend from too few weigh-ins, or where none was asked for", () => {
    show(3, true);
    expect(host.textContent).not.toContain("trend");
    show(20, false);
    expect(host.textContent).not.toContain("trend");
  });
});
