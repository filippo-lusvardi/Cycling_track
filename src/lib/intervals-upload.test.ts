import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ACTIVITY_FILE, uploadActivityFile } from "./intervals";
import { API_KEY, writeSetting } from "./settings";

const gpx = () => new File(["<gpx/>"], "opentracks.gpx", { type: "application/gpx+xml" });

describe("sending an activity file to intervals.icu", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    writeSetting(API_KEY, "secret");
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it("posts the file as multipart, with the key and no JSON content type", async () => {
    fetchMock.mockResolvedValue(new Response("{}", { status: 201 }));
    expect(await uploadActivityFile(gpx())).toBe("added");
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://intervals.icu/api/v1/athlete/0/activities");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe(`Basic ${btoa("API_KEY:secret")}`);
    expect(init.headers["Content-Type"]).toBeUndefined();
    expect((init.body as FormData).get("file")).toBeInstanceOf(File);
    expect(((init.body as FormData).get("file") as File).name).toBe("opentracks.gpx");
  });
  it("says when intervals.icu had the file already", async () => {
    fetchMock.mockResolvedValue(new Response("{}", { status: 200 }));
    expect(await uploadActivityFile(gpx())).toBe("duplicate");
  });
  it("fails on an error, and asks for the key again when it's refused", async () => {
    fetchMock.mockResolvedValue(new Response("bad", { status: 422 }));
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(uploadActivityFile(gpx())).rejects.toThrow("upload 422");
    fetchMock.mockResolvedValue(new Response("", { status: 401 }));
    await expect(uploadActivityFile(gpx())).rejects.toThrow();
  });
  it("takes what intervals.icu reads, not KML or KMZ", () => {
    for (const ok of ["a.gpx", "a.GPX", "a.fit", "a.tcx", "a.fit.gz", "a.gpx.gz"])
      expect(ACTIVITY_FILE.test(ok)).toBe(true);
    for (const no of ["a.kml", "a.kmz", "a.csv", "gpx"]) expect(ACTIVITY_FILE.test(no)).toBe(false);
  });
});
