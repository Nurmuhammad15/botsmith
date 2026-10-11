import { describe, expect, it } from "vitest";
import {
  formatBytes,
  MAX_FILE_BYTES,
  MAX_IMAGE_BYTES,
  objectPath,
  safeFileName,
  validateDeliverable,
  validateImage,
} from "@/lib/media";

describe("validateImage", () => {
  it("accepts jpeg, png and webp within the size limit", () => {
    for (const type of ["image/jpeg", "image/png", "image/webp"]) {
      expect(validateImage({ name: "a", type, size: 1000 })).toBeNull();
    }
  });

  it("rejects other types, including svg and gif", () => {
    expect(validateImage({ name: "a.svg", type: "image/svg+xml", size: 10 })).toMatch(/JPG, PNG/);
    expect(validateImage({ name: "a.gif", type: "image/gif", size: 10 })).toMatch(/JPG, PNG/);
    expect(validateImage({ name: "a.exe", type: "", size: 10 })).toMatch(/JPG, PNG/);
  });

  it("rejects images over the limit", () => {
    expect(validateImage({ name: "big", type: "image/png", size: MAX_IMAGE_BYTES + 1 })).toMatch(
      /hajmi/,
    );
    expect(validateImage({ name: "ok", type: "image/png", size: MAX_IMAGE_BYTES })).toBeNull();
  });
});

describe("validateDeliverable", () => {
  it("accepts any type within the limit and rejects empty or oversized files", () => {
    expect(validateDeliverable({ name: "bot.zip", size: 1024 })).toBeNull();
    expect(validateDeliverable({ name: "e", size: 0 })).toMatch(/bo‘sh/);
    expect(validateDeliverable({ name: "x", size: MAX_FILE_BYTES + 1 })).toMatch(/hajmi/);
  });
});

describe("safeFileName", () => {
  it("keeps simple names and extensions", () => {
    expect(safeFileName("bot-source_v2.zip")).toBe("bot-source_v2.zip");
  });

  it("strips path separators and unsafe characters", () => {
    expect(safeFileName("../../etc/passwd")).not.toContain("/");
    expect(safeFileName("../../etc/passwd")).not.toContain("..");
    expect(safeFileName("my bot (final).zip")).toBe("my_bot_final.zip");
    expect(safeFileName("archive.tar.gz")).toBe("archive_tar.gz");
  });

  it("falls back to a placeholder for non-latin names but keeps the extension", () => {
    expect(safeFileName("бот.zip")).toBe("file.zip");
    expect(safeFileName("")).toBe("file");
  });

  it("limits very long names", () => {
    expect(safeFileName(`${"a".repeat(300)}.zip`).length).toBeLessThanOrEqual(90);
  });
});

describe("objectPath", () => {
  it("follows <seller>/<bot>/<random>-<name> and is unique per call", () => {
    const a = objectPath("seller-1", "bot-1", "cover.png");
    const b = objectPath("seller-1", "bot-1", "cover.png");
    expect(a).toMatch(/^seller-1\/bot-1\/[0-9a-f-]{36}-cover\.png$/);
    expect(a).not.toBe(b);
  });

  it("never lets a file name escape its folder", () => {
    const path = objectPath("s", "b", "../../x/../y.zip");
    expect(path.split("/")).toHaveLength(3);
    expect(path).not.toContain("..");
  });
});

describe("formatBytes", () => {
  it("formats sizes", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2.0 KB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.0 MB");
  });
});
