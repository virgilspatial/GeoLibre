import { useAppStore } from "@geolibre/core";
import { Input, Select, cn } from "@geolibre/ui";
import type { ParseKeys, TFunction } from "i18next";
import { Check } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useSidePanelStore } from "../layout/rail/sidePanelStore";
import { Field } from "../style-panel-swiftmap/fields";
import type { AnalysisInput } from "./analysis-inputs";
import { runBelongsTo, useAnalysisStore, type FormToolId, type RunState } from "./analysisStore";
import type { FormStatus } from "./form-model";

/**
 * SWIFTMAP (Change 37, shared by every tool's form since Change 43): the
 * description, layer and name fields, and Run with a spinner and Cancel. Muted
 * lines under Run report the size limits, a refused input or name, a result
 * the run will replace, or the finished run.
 */

export function ToolDescription({ children }: { children: ReactNode }) {
  return (
    <p className="mx-1.5 mb-3.5 text-[13px] leading-normal text-muted-foreground">{children}</p>
  );
}

export function LayerField({
  id,
  label,
  inputs,
  value,
  onChange,
  testId,
  emptyLabel,
}: {
  id: string;
  label: string;
  inputs: AnalysisInput[];
  value: string;
  onChange: (layerId: string) => void;
  testId: string;
  emptyLabel: string;
}) {
  return (
    <Field label={label} htmlFor={id}>
      <Select
        id={id}
        data-testid={testId}
        value={value}
        disabled={inputs.length === 0}
        onChange={(event) => onChange(event.target.value)}
      >
        {inputs.length === 0 ? (
          <option value="">{emptyLabel}</option>
        ) : (
          inputs.map((item) => (
            <option key={item.layer.id} value={item.layer.id}>
              {item.layer.name}
            </option>
          ))
        )}
      </Select>
    </Field>
  );
}

export function NameField({
  id,
  value,
  onChange,
  testId,
}: {
  id: string;
  value: string;
  onChange: (name: string) => void;
  testId: string;
}) {
  const { t } = useTranslation();
  return (
    <Field label={t("swiftmapAnalysis.buffer.outputName")} htmlFor={id}>
      <Input
        id={id}
        data-testid={testId}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-9 rounded-lg"
      />
    </Field>
  );
}

/** Run, Cancel while running, and the status lines. `testId` prefixes Run and Cancel. */
export function RunArea({
  tool,
  testId,
  status,
  name,
  onRun,
  twoInputs = false,
}: {
  tool: FormToolId;
  testId: string;
  status: FormStatus;
  /** The output name, for the name lines. */
  name: string;
  onRun: () => void;
  twoInputs?: boolean;
}) {
  const { t } = useTranslation();
  const run = useAnalysisStore((state) => state.run);
  const cancel = useAnalysisStore((state) => state.cancel);
  const running = run.status === "running";
  const mine = runBelongsTo(run, tool);
  // One run at a time: another tool's run disables Run here.
  const busyElsewhere = running && !mine;
  return (
    <div className="mt-auto flex flex-col gap-2.5 px-1.5 pt-4 pb-0.5">
      <div className="flex gap-2">
        <button
          type="button"
          data-testid={`${testId}-run`}
          onClick={() => {
            if (!status.block && !running) onRun();
          }}
          disabled={(Boolean(status.block) && !running) || busyElsewhere}
          aria-disabled={running || undefined}
          aria-busy={(running && mine) || undefined}
          className={cn(
            "flex h-[38px] flex-1 items-center justify-center gap-2 rounded-lg bg-foreground text-[13px] font-medium text-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
            running && mine ? "cursor-progress opacity-70" : "hover:bg-foreground/90",
            "disabled:cursor-not-allowed disabled:opacity-50",
          )}
        >
          {running && mine ? <Spinner /> : null}
          {running && mine ? t("swiftmapAnalysis.running") : t("swiftmapAnalysis.run")}
        </button>
        {running && mine ? (
          <button
            type="button"
            data-testid={`${testId}-cancel`}
            onClick={cancel}
            className="h-[38px] shrink-0 rounded-lg border border-input px-3.5 text-[13px] font-medium hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {t("swiftmapAnalysis.cancel")}
          </button>
        ) : null}
      </div>
      <StatusLine
        tool={tool}
        run={mine ? run : { status: "idle" }}
        status={status}
        name={name}
        twoInputs={twoInputs}
      />
    </div>
  );
}

function Spinner() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
      className="animate-spin motion-reduce:animate-none"
    >
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}

/** Block keys whose wording differs per tool (Buffer keeps its own). */
const PER_TOOL_BLOCKS = new Set(["noInput", "noGeometry"]);

function StatusLine({
  tool,
  run,
  status,
  name,
  twoInputs,
}: {
  tool: FormToolId;
  run: RunState;
  status: FormStatus;
  name: string;
  twoInputs: boolean;
}) {
  const { t } = useTranslation();
  const lines: { key: string; node: ReactNode; tone?: "error" }[] = [];
  const toolName = t(`swiftmapAnalysis.tools.${tool}`);
  const showInLayers = (layerId: string) => {
    useAppStore.getState().selectLayer(layerId);
    useSidePanelStore.getState().open("layers");
  };

  if (status.block && status.block !== "badDistance" && status.block !== "noName") {
    let key = `swiftmapAnalysis.block.${status.block}`;
    if (status.blockLayer) key += "Named";
    else if (tool !== "buffer" && PER_TOOL_BLOCKS.has(status.block)) {
      key = `swiftmapAnalysis.block.${tool}.${status.block}`;
    }
    lines.push({ key: "block", node: t(key as ParseKeys, { name: status.blockLayer ?? name }) });
  } else if (status.size === "slow") {
    lines.push({ key: "slow", node: t("swiftmapAnalysis.slow") });
  }
  for (const layer of status.polygonsOnly ?? []) {
    lines.push({
      key: `polygons-${layer}`,
      node: t("swiftmapAnalysis.polygonsOnly", { name: layer }),
    });
  }
  // Not while the line for that same layer's finished run shows: it says more.
  const replacing = status.name?.kind === "replace" ? status.name.layer : null;
  if (!status.block && replacing && !(run.status === "done" && run.layerId === replacing.id)) {
    lines.push({ key: "replaces", node: t("swiftmapAnalysis.replaces", { name: replacing.name }) });
  }
  if (status.zone?.warning) {
    lines.push({
      key: "zone",
      node: t(twoInputs ? "swiftmapAnalysis.zoneWarningMany" : "swiftmapAnalysis.zoneWarning", {
        zone: status.zone.zone.label,
      }),
    });
  }
  if (run.status === "done") {
    lines.push({
      key: "done",
      node: (
        <span className="flex items-start gap-2" data-testid="analysis-result">
          <Check
            className="mt-0.5 size-[15px] shrink-0 text-green-600 dark:text-green-500"
            strokeWidth={2.25}
            aria-hidden="true"
          />
          <span>
            {t(run.replaced ? "swiftmapAnalysis.replaced" : "swiftmapAnalysis.added", {
              count: run.count,
              name: run.name,
            })}{" "}
            <button
              type="button"
              data-testid="analysis-show-in-layers"
              onClick={() => showInLayers(run.layerId)}
              className="rounded-sm font-medium text-foreground underline underline-offset-[3px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {t("swiftmapAnalysis.showInLayers")}
            </button>
          </span>
        </span>
      ),
    });
  } else if (run.status === "cancelled") {
    lines.push({ key: "cancelled", node: t("swiftmapAnalysis.cancelled") });
  } else if (run.status === "failed") {
    lines.push({ key: "failed", node: failureMessage(run, tool, toolName, t), tone: "error" });
  }
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex flex-col gap-1.5"
      data-testid="analysis-status"
    >
      {lines.map((line) => (
        <div
          key={line.key}
          data-line={line.key}
          className={cn(
            "text-xs leading-normal text-muted-foreground",
            line.tone === "error" && "text-destructive",
          )}
        >
          {line.node}
        </div>
      ))}
    </div>
  );
}

function failureMessage(
  run: Extract<RunState, { status: "failed" }>,
  tool: FormToolId,
  toolName: string,
  t: TFunction,
): string {
  switch (run.code) {
    case "nameTaken":
      return t("swiftmapAnalysis.block.nameTaken", { name: run.message });
    case "noFeatures":
      return tool === "buffer"
        ? t("swiftmapAnalysis.failed.noFeatures")
        : t("swiftmapAnalysis.failed.noOverlap");
    case "noGeometry":
    case "badDistance":
    case "noPolygons":
      return t(`swiftmapAnalysis.failed.${run.code}` as ParseKeys);
    default:
      return t("swiftmapAnalysis.failed.other", { tool: toolName, message: run.message });
  }
}
