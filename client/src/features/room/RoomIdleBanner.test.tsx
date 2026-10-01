import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { formatCountdown, RoomIdleBanner } from "./RoomIdleBanner";

const keepOpen = vi.fn().mockResolvedValue(undefined);
const multiplayer = { idleEndsAt: null as number | null, keepOpen };
const download = vi.fn().mockResolvedValue(undefined);

vi.mock("../../multiplayer/MultiplayerContext", () => ({ useMultiplayer: () => multiplayer }));
vi.mock("../../tabletop/board-export/useBoardImageDownload", () => ({
  useBoardImageDownload: () => ({ download, isExporting: false, error: null }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  multiplayer.idleEndsAt = null;
});

describe("RoomIdleBanner", () => {
  it("renders nothing until the server warns", () => {
    const { container } = render(<RoomIdleBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  it("offers Keep open and a board image download while a warning is active", () => {
    multiplayer.idleEndsAt = Date.now() + 125_000;
    render(<RoomIdleBanner />);

    expect(screen.getByRole("alert")).toHaveTextContent(/closes in 2:0\d/);
    fireEvent.click(screen.getByRole("button", { name: "Keep open" }));
    expect(keepOpen).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Download board image" }));
    expect(download).toHaveBeenCalled();
  });

  it("formats the countdown and never goes negative", () => {
    expect(formatCountdown(65_000)).toBe("1:05");
    expect(formatCountdown(-5)).toBe("0:00");
  });
});
