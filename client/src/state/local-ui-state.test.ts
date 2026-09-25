import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MAGNIFY_SCALE, useLocalUiState } from "./local-ui-state";

describe("useLocalUiState", () => {
  it("magnifies the requested card and replaces it when another is chosen", () => {
    const { result } = renderHook(() => useLocalUiState());
    expect(result.current.magnifiedCardId).toBeNull();

    act(() => result.current.magnifyCard("card-1"));
    expect(result.current.magnifiedCardId).toBe("card-1");

    act(() => result.current.magnifyCard("card-2"));
    expect(result.current.magnifiedCardId).toBe("card-2");
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
