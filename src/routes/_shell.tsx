import { createFileRoute } from "@tanstack/react-router";

import { CommandShell } from "@/components/wf/shell";
import { WfProvider } from "@/lib/wf/store";

export const Route = createFileRoute("/_shell")({
  component: ShellLayout,
});

function ShellLayout() {
  return (
    <WfProvider>
      <CommandShell />
    </WfProvider>
  );
}
