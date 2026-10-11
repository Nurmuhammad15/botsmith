import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { MediaPicker } from "@/components/media-picker";
import { MAX_IMAGE_BYTES, validateImage } from "@/lib/media";

beforeAll(() => {
  // jsdom has no object URLs; the picker only needs unique strings for previews.
  let n = 0;
  URL.createObjectURL = () => `blob:test/${++n}`;
  URL.revokeObjectURL = () => {};
});
afterEach(cleanup);

const image = (name: string, size = 1000, type = "image/png") =>
  new File([new Uint8Array(size)], name, { type });

function Harness({ max = 3, used = 0 }: { max?: number; used?: number }) {
  const [files, setFiles] = useState<File[]>([]);
  return (
    <MediaPicker
      label="Rasm qo‘shish"
      hint="hint"
      files={files}
      onChange={setFiles}
      validate={validateImage}
      max={max}
      used={used}
      preview
    />
  );
}

const choose = (...files: File[]) =>
  fireEvent.change(screen.getByLabelText("Rasm qo‘shish"), { target: { files } });

describe("MediaPicker", () => {
  it("accepts valid images and lists them with a remove button", () => {
    render(<Harness />);
    choose(image("a.png"), image("b.png"));

    expect(screen.getByAltText("a.png")).toBeInTheDocument();
    expect(screen.getByAltText("b.png")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "a.png ni olib tashlash" }));
    expect(screen.queryByAltText("a.png")).not.toBeInTheDocument();
    expect(screen.getByAltText("b.png")).toBeInTheDocument();
  });

  it("rejects unsupported types and oversized files with a message, keeping the good ones", () => {
    render(<Harness />);
    choose(
      image("ok.png"),
      image("anim.gif", 100, "image/gif"),
      image("huge.png", MAX_IMAGE_BYTES + 1),
    );

    expect(screen.getByAltText("ok.png")).toBeInTheDocument();
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("anim.gif");
    expect(alert).toHaveTextContent("huge.png");
    expect(screen.queryByAltText("anim.gif")).not.toBeInTheDocument();
  });

  it("never exceeds the maximum, counting items already uploaded", () => {
    render(<Harness max={3} used={2} />);
    choose(image("a.png"), image("b.png"), image("c.png"));

    expect(screen.getAllByRole("img")).toHaveLength(1);
    expect(screen.getByRole("alert")).toHaveTextContent("Ko‘pi bilan 3 ta");
    expect(screen.getByRole("button", { name: /Fayl tanlash/ })).toBeDisabled();
  });

  it("ignores the same file chosen twice", () => {
    render(<Harness />);
    const file = image("a.png");
    choose(file);
    choose(file);

    expect(screen.getAllByRole("img")).toHaveLength(1);
  });
});
