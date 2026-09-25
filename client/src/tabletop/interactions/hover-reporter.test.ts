import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { nextHoveredCardId, useHoverReporter } from "./hover-reporter";

describe("nextHoveredCardId", () => {
  it("reports entering a new card", () => {
    expect(nextHoveredCardId(null, { kind: "enter", cardId: "card-1" })).toBe("card-1");
    expect(nextHoveredCardId("card-1", { kind: "enter", cardId: "card-2" })).toBe("card-2");
  });

  it("sends nothing when the pointer re-enters the card it is already on", () => {
    expect(nextHoveredCardId("card-1", { kind: "enter", cardId: "card-1" })).toBeUndefined();
  });

  it("clears only when the card being left is the one still hovered", () => {
    expect(nextHoveredCardId("card-1", { kind: "leave", cardId: "card-1" })).toBeNull();
    // enter(card-2) already arrived: a late leave(card-1) must not clear it.
    expect(nextHoveredCardId("card-2", { kind: "leave", cardId: "card-1" })).toBeUndefined();
  });
});

describe("useHoverReporter", () => {
  function setup() {
    const setHover = vi.fn().mockResolvedValue(undefined);
    const view = renderHook(() => useHoverReporter({ setHover }));
    return { setHover, ...view };
  }

  it("sends one message per card change, and none while resting on a card", () => {
    const { setHover, result } = setup();

    result.current.hoverStart("card-1");
    result.current.hoverStart("card-1");
    expect(setHover).toHaveBeenCalledExactlyOnceWith("card-1");

    result.current.hoverEnd("card-1");
    expect(setHover).toHaveBeenLastCalledWith(null);
    expect(setHover).toHaveBeenCalledTimes(2);
  });

  it("survives an out-of-order leave when moving between adjacent cards", () => {
    const { setHover, result } = setup();

    result.current.hoverStart("card-1");
    result.current.hoverStart("card-2"); // enter of the new card lands first
    result.current.hoverEnd("card-1"); // stale leave of the old one

    expect(setHover).toHaveBeenCalledTimes(2);
    expect(setHover).toHaveBeenLastCalledWith("card-2");
  });

  it("releases the hover when the tabletop unmounts", () => {
    const { setHover, result, unmount } = setup();
    result.current.hoverStart("card-1");
    setHover.mockClear();

    unmount();

    expect(setHover).toHaveBeenCalledExactlyOnceWith(null);
  });

  it("does not report on unmount when nothing was hovered", () => {
    const { setHover, unmount } = setup();
    unmount();
    expect(setHover).not.toHaveBeenCalled();
  });
});
