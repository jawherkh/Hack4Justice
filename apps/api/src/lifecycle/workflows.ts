import {
  condition,
  continueAsNew,
  defineQuery,
  defineSignal,
  proxyActivities,
  setHandler,
} from "@temporalio/workflow";
import { COMMAND_SIGNAL, STATUS_QUERY, type CommandReference, type LifecycleActivities } from "./contracts";
import { transition } from "./state";

const commandSignal = defineSignal<[CommandReference]>(COMMAND_SIGNAL);
const statusQuery = defineQuery<{ pending: number; current: string | null }>(STATUS_QUERY);
const activities = proxyActivities<LifecycleActivities>({
  startToCloseTimeout: "30 seconds",
  retry: { initialInterval: "1 second", maximumInterval: "30 seconds" },
});

export async function dossierWorkflow(dossierId: string): Promise<void> {
  const queue: CommandReference[] = [];
  let current: string | null = null;
  let processed = 0;
  setHandler(commandSignal, (reference) => {
    if (
      reference.dossierId === dossierId &&
      reference.commandId !== current &&
      !queue.some((r) => r.commandId === reference.commandId)
    )
      queue.push(reference);
  });
  setHandler(statusQuery, () => ({ pending: queue.length, current }));
  for (;;) {
    await condition(() => queue.length > 0);
    const reference = queue.shift()!;
    current = reference.commandId;
    const prepared = await activities.prepare(reference);
    if (prepared) await activities.commit(prepared, transition(prepared));
    current = null;
    if (++processed >= 100 && queue.length === 0) await continueAsNew<typeof dossierWorkflow>(dossierId);
  }
}

export { agentTurnWorkflow } from "../agent/workflow";
