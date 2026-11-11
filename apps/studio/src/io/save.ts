/**
 * Save the project as a downloaded JSON file (Requirement 7.1, 7.2, 7.6). Uses
 * the engine's canonical serializer (includes the versioned schemaVersion). No
 * network; the download goes through `downloadBlob`.
 */
import { serializeProject, type Project } from "@studio/engine";
import { downloadBlob } from "./download.js";

export function downloadProject(project: Project, fileName = "project.json"): void {
  const json = serializeProject(project);
  const blob = new Blob([json], { type: "application/json" });
  downloadBlob(blob, fileName);
}
