import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { clearMagnifiedCardId, MAGNIFY_SCALE, useLocalUiState } from "./local-ui-state";

describe("clearMagnifiedCardId", () => {
  it("clears the preview when the magnified card is left", () => {
    expect(clearMagnifiedCardId("card-1", "card-1")).toBeNull();
  });

  it("keeps the preview when a different card is left", () => {
    expect(clearMagnifiedCardId("card-2", "card-1")).toBe("card-2");
  });
});

describe("useLocalUiState", () => {
  it("magnifies the hovered card and keeps the latest one on out-of-order leaves", () => {
    const { result } = renderHook(() => useLocalUiState());
    expect(result.current.magnifiedCardId).toBeNull();

    act(() => result.current.magnifyCard("card-1"));
    expect(result.current.magnifiedCardId).toBe("card-1");

    act(() => result.current.magnifyCard("card-2"));
    act(() => result.current.unmagnifyCard("card-1"));
    expect(result.current.magnifiedCardId).toBe("card-2");

    act(() => result.current.unmagnifyCard("card-2"));
    expect(result.current.magnifiedCardId).toBeNull();
  });

  it("clears the preview outright", () => {
    const { result } = renderHook(() => useLocalUiState());
    act(() => result.current.magnifyCard("card-1"));
    act(() => result.current.clearMagnifiedCard());
    expect(result.current.magnifiedCardId).toBeNull();
  });
});

describe("magnification factor", () => {
  it("stays within the 2-4x range the spec allows", () => {
    expect(MAGNIFY_SCALE).toBeGreaterThanOrEqual(2);
    expect(MAGNIFY_SCALE).toBeLessThanOrEqual(4);
  });
});
