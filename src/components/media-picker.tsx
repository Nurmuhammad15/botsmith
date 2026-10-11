import { FileText, Upload, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { formatBytes } from "@/lib/media";

type MediaPickerProps = {
  label: string;
  hint: string;
  files: File[];
  onChange: (files: File[]) => void;
  /** Returns an error message for an unusable file, or null. */
  validate: (file: File) => string | null;
  /** Maximum number of files in total, counting `used`. */
  max: number;
  /** Slots already taken by items that are uploaded already. */
  used?: number;
  accept?: string;
  /** Show thumbnails for the selected files (images). */
  preview?: boolean;
  disabled?: boolean;
};

const sameFile = (a: File, b: File) =>
  a.name === b.name && a.size === b.size && a.lastModified === b.lastModified;

/** File chooser with validation, de-duplication and removable selected-file chips. */
export function MediaPicker({
  label,
  hint,
  files,
  onChange,
  validate,
  max,
  used = 0,
  accept,
  preview = false,
  disabled = false,
}: MediaPickerProps) {
  const inputId = useId();
  const input = useRef<HTMLInputElement>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [urls, setUrls] = useState<string[]>([]);
  const free = Math.max(0, max - used);

  useEffect(() => {
    if (!preview) return;
    const next = files.map((file) => URL.createObjectURL(file));
    setUrls(next);
    return () => next.forEach((url) => URL.revokeObjectURL(url));
  }, [files, preview]);

  function pick(list: FileList | null) {
    const picked = Array.from(list ?? []);
    if (input.current) input.current.value = ""; // allow choosing the same file again
    const problems: string[] = [];
    const accepted: File[] = [];
    for (const file of picked) {
      if (files.some((existing) => sameFile(existing, file))) continue;
      const problem = validate(file);
      if (problem) problems.push(problem);
      else accepted.push(file);
    }
    const room = free - files.length;
    if (accepted.length > room) {
      problems.push(`Ko‘pi bilan ${max} ta fayl yuklash mumkin; ortiqchalari qo‘shilmadi.`);
    }
    setErrors(problems);
    if (accepted.length > 0) onChange([...files, ...accepted.slice(0, Math.max(0, room))]);
  }

  return (
    <div className="space-y-2 text-sm">
      <label htmlFor={inputId} className="block">
        {label}
      </label>
      <input
        ref={input}
        id={inputId}
        type="file"
        multiple
        accept={accept}
        disabled={disabled}
        className="sr-only"
        onChange={(event) => pick(event.target.files)}
      />
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="outline"
          disabled={disabled || free - files.length <= 0}
          onClick={() => input.current?.click()}
        >
          <Upload />
          Fayl tanlash
        </Button>
        <span className="text-xs text-muted-foreground">{hint}</span>
      </div>
      {errors.length > 0 && (
        <ul role="alert" className="space-y-1 text-xs text-destructive">
          {errors.map((message) => (
            <li key={message}>{message}</li>
          ))}
        </ul>
      )}
      {files.length > 0 && (
        <ul className={preview ? "flex flex-wrap gap-3" : "space-y-2"}>
          {files.map((file, i) => (
            <li
              key={`${file.name}-${file.size}-${file.lastModified}`}
              className={
                preview
                  ? "relative h-20 w-28 overflow-hidden rounded-lg border"
                  : "flex items-center gap-3 rounded-lg border px-3 py-2"
              }
            >
              {preview ? (
                urls[i] && (
                  <img src={urls[i]} alt={file.name} className="h-full w-full object-cover" />
                )
              ) : (
                <>
                  <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate">{file.name}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {formatBytes(file.size)}
                  </span>
                </>
              )}
              <button
                type="button"
                disabled={disabled}
                aria-label={`${file.name} ni olib tashlash`}
                onClick={() => onChange(files.filter((_, index) => index !== i))}
                className={
                  preview
                    ? "absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-background/90 shadow"
                    : "grid h-6 w-6 shrink-0 place-items-center rounded-full hover:bg-muted"
                }
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
