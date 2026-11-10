import { useAppStore } from "@geolibre/core";
import { Input, Select, cn } from "@geolibre/ui";
import { Check } from "lucide-react";
import { useId, useMemo, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useSidePanelStore } from "../layout/rail/sidePanelStore";
import { Field, SwitchRow } from "../style-panel-swiftmap/fields";
import { analysisInputs } from "./analysis-inputs";
import { useAnalysisStore } from "./analysisStore";
import { autoOutputName, bufferFormStatus } from "./buffer-form-model";
import type { DistanceUnit } from "./engine/buffer";

/**
 * SWIFTMAP (Change 37): the Buffer form: input layer, distance and unit,
 * Dissolve, an output name that follows the settings until edited, and Run
 * with a spinner and Cancel. Muted lines under Run report the size limits, a
 * refused input or name, a result the run will replace, or the finished run.
 */
export function BufferForm() {
  const { t } = useTranslation();
  const layers = useAppStore((state) => state.layers);
  const form = useAnalysisStore((state) => state.buffer);
  const run = useAnalysisStore((state) => state.run);
  const update = useAnalysisStore((state) => state.updateBuffer);
  const runBuffer = useAnalysisStore((state) => state.runBuffer);
  const cancel = useAnalysisStore((state) => state.cancel);
  const inputId = useId();
  const distanceId = useId();
  const nameId = useId();

  const inputs = useMemo(() => analysisInputs(layers), [layers]);
  const input = inputs.find((item) => item.layer.id === form.inputLayerId) ?? inputs[0] ?? null;
  const unitLabel = t(`swiftmapAnalysis.units.${form.unit}`);
  const name =
    form.name ?? (input ? autoOutputName(input.layer.name, form.distance, unitLabel) : "");
  const status = bufferFormStatus({ input, distance: form.distance, name, layers });
  const running = run.status === "running";

  const onRun = () => {
    if (!input || status.block || running) return;
    void runBuffer({ inputLayerId: input.layer.id, name: name.trim() });
  };

  const showInLayers = (layerId: string) => {
    useAppStore.getState().selectLayer(layerId);
    useSidePanelStore.getState().open("layers");
  };

  const muted = "text-xs leading-normal text-muted-foreground";

  return (
    <div className="flex flex-1 flex-col">
      <p className="mx-1.5 mb-3.5 text-[13px] leading-normal text-muted-foreground">
        {t("swiftmapAnalysis.buffer.description")}
      </p>
      <div className="flex flex-col gap-4 px-1.5">
        <Field label={t("swiftmapAnalysis.buffer.input")} htmlFor={inputId}>
          <Select
            id={inputId}
            data-testid="buffer-input"
            value={input?.layer.id ?? ""}
            disabled={inputs.length === 0}
            onChange={(event) => update({ inputLayerId: event.target.value })}
          >
            {inputs.length === 0 ? (
              <option value="">{t("swiftmapAnalysis.buffer.noLayers")}</option>
            ) : (
              inputs.map((item) => (
                <option key={item.layer.id} value={item.layer.id}>
                  {item.layer.name}
                </option>
              ))
            )}
          </Select>
        </Field>
        <Field label={t("swiftmapAnalysis.buffer.distance")} htmlFor={distanceId}>
          <div className="flex gap-2">
            <Input
              id={distanceId}
              data-testid="buffer-distance"
              type="number"
              inputMode="decimal"
              min="0"
              step="any"
              value={form.distance}
              onChange={(event) => update({ distance: event.target.value })}
              className="h-9 min-w-0 flex-1 rounded-lg tabular-nums"
            />
            <Select
              aria-label={t("swiftmapAnalysis.buffer.unit")}
              data-testid="buffer-unit"
              value={form.unit}
              onChange={(event) => update({ unit: event.target.value as DistanceUnit })}
              className="w-[90px] shrink-0"
            >
              <option value="m">{t("swiftmapAnalysis.unitOptions.m")}</option>
              <option value="km">{t("swiftmapAnalysis.unitOptions.km")}</option>
            </Select>
          </div>
        </Field>
        <SwitchRow
          label={t("swiftmapAnalysis.buffer.dissolve")}
          checked={form.dissolve}
          onCheckedChange={(dissolve) => update({ dissolve })}
        />
        <Field label={t("swiftmapAnalysis.buffer.outputName")} htmlFor={nameId}>
          <Input
            id={nameId}
            data-testid="buffer-name"
            value={name}
            onChange={(event) => update({ name: event.target.value })}
            className="h-9 rounded-lg"
          />
        </Field>
      </div>
      <div className="mt-auto flex flex-col gap-2.5 px-1.5 pt-4 pb-0.5">
        <div className="flex gap-2">
          <button
            type="button"
            data-testid="buffer-run"
            onClick={onRun}
            disabled={Boolean(status.block) && !running}
            aria-disabled={running || undefined}
            aria-busy={running || undefined}
            className={cn(
              "flex h-[38px] flex-1 items-center justify-center gap-2 rounded-lg bg-foreground text-[13px] font-medium text-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              running ? "cursor-progress opacity-70" : "hover:bg-foreground/90",
              "disabled:cursor-not-allowed disabled:opacity-50",
            )}
          >
            {running ? <Spinner /> : null}
            {running ? t("swiftmapAnalysis.running") : t("swiftmapAnalysis.run")}
          </button>
          {running ? (
            <button
              type="button"
              data-testid="buffer-cancel"
              onClick={cancel}
              className="h-[38px] shrink-0 rounded-lg border border-input px-3.5 text-[13px] font-medium hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {t("swiftmapAnalysis.cancel")}
            </button>
          ) : null}
        </div>
        <StatusLine
          run={run}
          status={status}
          name={name.trim()}
          mutedClass={muted}
          onShow={showInLayers}
        />
      </div>
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

function StatusLine({
  run,
  status,
  name,
  mutedClass,
  onShow,
}: {
  run: ReturnType<typeof useAnalysisStore.getState>["run"];
  status: ReturnType<typeof bufferFormStatus>;
  /** The output name, for the name lines. */
  name: string;
  mutedClass: string;
  onShow: (layerId: string) => void;
}) {
  const { t } = useTranslation();
  const lines: { key: string; node: ReactNode; tone?: "error" }[] = [];
  if (status.block && status.block !== "badDistance" && status.block !== "noName") {
    lines.push({ key: "block", node: t(`swiftmapAnalysis.block.${status.block}`, { name }) });
  } else if (status.size === "slow") {
    lines.push({ key: "slow", node: t("swiftmapAnalysis.slow") });
  }
  // Not while the line for that same layer's finished run shows: it says more.
  const replacing = status.name?.kind === "replace" ? status.name.layer : null;
  if (!status.block && replacing && !(run.status === "done" && run.layerId === replacing.id)) {
    lines.push({ key: "replaces", node: t("swiftmapAnalysis.replaces", { name: replacing.name }) });
  }
  if (status.zone?.warning) {
    lines.push({
      key: "zone",
      node: t("swiftmapAnalysis.zoneWarning", { zone: status.zone.zone.label }),
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
              onClick={() => onShow(run.layerId)}
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
    const message =
      run.code === "nameTaken"
        ? t("swiftmapAnalysis.block.nameTaken", { name: run.message })
        : run.code === "noFeatures" || run.code === "noGeometry" || run.code === "badDistance"
          ? t(`swiftmapAnalysis.failed.${run.code}`)
          : t("swiftmapAnalysis.failed.other", { message: run.message });
    lines.push({ key: "failed", node: message, tone: "error" });
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
          className={cn(mutedClass, line.tone === "error" && "text-destructive")}
        >
          {line.node}
        </div>
      ))}
    </div>
  );
}
