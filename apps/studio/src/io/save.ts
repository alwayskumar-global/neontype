/**
 * Save the project as a downloaded JSON file (Requirement 7.1, 7.2, 7.6). Uses
 * the engine's canonical serializer (includes the versioned schemaVersion). No
 * network; a Blob URL is created and revoked after the click.
 */
import { serializeProject, type Project } from "@studio/engine";

export function downloadProject(project: Project, fileName = "project.json"): void {
  const json = serializeProject(project);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
