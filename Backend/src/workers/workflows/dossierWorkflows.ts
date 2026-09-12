import { proxyActivities } from "@temporalio/workflow";
import type * as dossierActivities from "../activities/dossierActivities";

const { compileDossier, exportDossier } = proxyActivities<typeof dossierActivities>({
  startToCloseTimeout: "10 minutes",
  retry: { maximumAttempts: 3 },
});

/**
 * Workflow: orchestrateDossier
 * Compiles and exports a dossier from gathered evidence.
 */
export async function orchestrateDossier(params: {
  dossierId: string;
  subjectId: string;
}): Promise<{ exportUrl: string }> {
  const compiled = await compileDossier(params);
  const { exportUrl } = await exportDossier({ dossierId: params.dossierId, compiledData: compiled });
  return { exportUrl };
}
