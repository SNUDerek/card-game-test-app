import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useImage } from "./useImage";

class TestImage extends EventTarget {
  static instances: TestImage[] = [];
  crossOrigin: string | null = null;
  src = "";

  constructor() {
    super();
    TestImage.instances.push(this);
  }
}

describe("useImage", () => {
  beforeEach(() => {
    TestImage.instances = [];
    vi.stubGlobal("Image", TestImage);
  });

  afterEach(() => vi.unstubAllGlobals());

  it("clears stale images while a new URL loads", () => {
    const { result, rerender } = renderHook(({ url }) => useImage(url), {
      initialProps: { url: "/first.png" as string | undefined },
    });
    const first = TestImage.instances[0]!;

    act(() => first.dispatchEvent(new Event("load")));
    expect(result.current).toEqual([first, "loaded"]);

    rerender({ url: "/second.png" });
    expect(result.current).toEqual([undefined, "loading"]);
    expect(TestImage.instances[1]).toMatchObject({
      crossOrigin: "anonymous",
      src: "/second.png",
    });
  });

  it("ignores events from a superseded request", () => {
    const { result, rerender } = renderHook(({ url }) => useImage(url), {
      initialProps: { url: "/first.png" as string | undefined },
    });
    const first = TestImage.instances[0]!;

    rerender({ url: undefined });
    act(() => first.dispatchEvent(new Event("load")));

    expect(result.current).toEqual([undefined, "idle"]);
  });
});
