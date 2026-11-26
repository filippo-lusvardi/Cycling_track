// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SOURCE, writeSetting } from "@/lib/settings";
import { UploadRides } from "./UploadRides";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const sent = vi.hoisted(() => vi.fn());
const fitFiles = vi.hoisted(() => vi.fn());
const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
vi.mock("sonner", () => ({ toast }));
vi.mock("@/lib/intervals", async (orig) => ({
  ...(await orig<typeof import("@/lib/intervals")>()),
  uploadActivityFile: sent,
}));
vi.mock("@/lib/native/upload", () => ({ uploadFitFiles: fitFiles }));
vi.mock("@/lib/segment-app", () => ({ segmentEngine: { rebuild: vi.fn(), sync: vi.fn() } }));

const file = (name: string) => new File(["x"], name);

describe("dropping activity files", () => {
  let root: Root;
  let host: HTMLDivElement;
  beforeEach(() => {
    host = document.createElement("div");
    root = createRoot(host);
  });
  afterEach(() => {
    act(() => root.unmount());
    localStorage.clear();
    vi.clearAllMocks();
  });
  const show = () =>
    act(() =>
      root.render(
        <QueryClientProvider client={new QueryClient()}>
          <UploadRides />
        </QueryClientProvider>,
      ),
    );
  const pick = async (...names: string[]) => {
    const input = host.querySelector<HTMLInputElement>("input[type=file]")!;
    Object.defineProperty(input, "files", { value: names.map(file), configurable: true });
    await act(async () => {
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
  };

  it("sends OpenTracks' .gpx to intervals.icu, and says what happened", async () => {
    show();
    expect(host.querySelector("input")!.accept).toContain(".gpx");
    expect(host.textContent).toContain("OpenTracks");
    sent.mockResolvedValueOnce("added").mockResolvedValueOnce("duplicate");
    await pick("ride.gpx", "old.fit");
    expect(sent).toHaveBeenCalledTimes(2);
    expect(toast.success).toHaveBeenCalledWith("1 added · 1 already there");
  });
  it("turns KML and KMZ away with a clear message", async () => {
    show();
    await pick("ride.kmz");
    expect(sent).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith("Choose .gpx or .fit files");
  });
  it("keeps Cirmolo's own accounts on .fit files read on the device", async () => {
    writeSetting(SOURCE, "native");
    show();
    expect(host.querySelector("input")!.accept).toBe(".fit");
    await pick("ride.gpx");
    expect(sent).not.toHaveBeenCalled();
    expect(fitFiles).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith("Choose .fit files");
  });
});
