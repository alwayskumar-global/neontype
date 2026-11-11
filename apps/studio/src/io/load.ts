/**
 * Open a project JSON file (Requirement 7.3-7.5). The file is validated by the
 * engine parser BEFORE use; any failure (bad JSON, size limit, schema failure)
 * returns a typed error with a clear message and leaves the current project
 * unchanged. No network.
 */
import { parseProject, ParseError, type Project } from "@studio/engine";

/** Same 5 MiB cap the engine parser enforces; checked on `file.size` before reading. */
export const MAX_PROJECT_BYTES = 5 * 1024 * 1024;

export type LoadResult = { ok: true; project: Project } | { ok: false; message: string };

/** Reads a File's text and validates it into a Project (never throws). */
export async function loadProjectFromFile(file: File): Promise<LoadResult> {
  // Reject oversized files BEFORE reading them into memory.
  if (file.size > MAX_PROJECT_BYTES) {
    return { ok: false, message: "Could not open the project: the file is larger than the 5 MiB limit." };
  }
  let text: string;
  try {
    text = await file.text();
  } catch {
    return { ok: false, message: "Could not read the file." };
  }
  const parsed = parseProject(text);
  if (parsed instanceof ParseError) {
    const detail =
      parsed.code === "SIZE_LIMIT_EXCEEDED"
        ? "the file is larger than the 5 MiB limit"
        : "it is not a valid project file";
    return { ok: false, message: `Could not open the project: ${detail}.` };
  }
  return { ok: true, project: parsed };
}
