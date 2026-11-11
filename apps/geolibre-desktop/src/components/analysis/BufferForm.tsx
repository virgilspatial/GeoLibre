import { useAppStore } from "@geolibre/core";
import { Input, Select } from "@geolibre/ui";
import { useId, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Field, SwitchRow } from "../style-panel-swiftmap/fields";
import { analysisInputs } from "./analysis-inputs";
import { useAnalysisStore } from "./analysisStore";
import { autoOutputName, bufferFormStatus } from "./buffer-form-model";
import type { DistanceUnit } from "./engine/buffer";
import { LayerField, NameField, RunArea, ToolDescription } from "./form-parts";

/**
 * SWIFTMAP (Change 37): the Buffer form: input layer, distance and unit,
 * Dissolve, an output name that follows the settings until edited, and Run
 * with a spinner and Cancel (shared with the other tools since Change 43).
 */
export function BufferForm() {
  const { t } = useTranslation();
  const layers = useAppStore((state) => state.layers);
  const form = useAnalysisStore((state) => state.buffer);
  const update = useAnalysisStore((state) => state.updateBuffer);
  const runBuffer = useAnalysisStore((state) => state.runBuffer);
  const inputId = useId();
  const distanceId = useId();
  const nameId = useId();

  const inputs = useMemo(() => analysisInputs(layers), [layers]);
  const input = inputs.find((item) => item.layer.id === form.inputLayerId) ?? inputs[0] ?? null;
  const unitLabel = t(`swiftmapAnalysis.units.${form.unit}`);
  const name =
    form.name ?? (input ? autoOutputName(input.layer.name, form.distance, unitLabel) : "");
  const status = bufferFormStatus({ input, distance: form.distance, name, layers });

  return (
    <div className="flex flex-1 flex-col">
      <ToolDescription>{t("swiftmapAnalysis.buffer.description")}</ToolDescription>
      <div className="flex flex-col gap-4 px-1.5">
        <LayerField
          id={inputId}
          label={t("swiftmapAnalysis.buffer.input")}
          inputs={inputs}
          value={input?.layer.id ?? ""}
          onChange={(inputLayerId) => update({ inputLayerId })}
          testId="buffer-input"
          emptyLabel={t("swiftmapAnalysis.buffer.noLayers")}
        />
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
        <NameField
          id={nameId}
          value={name}
          onChange={(value) => update({ name: value })}
          testId="buffer-name"
        />
      </div>
      <RunArea
        tool="buffer"
        testId="buffer"
        status={status}
        name={name.trim()}
        onRun={() => {
          if (input) void runBuffer({ inputLayerId: input.layer.id, name: name.trim() });
        }}
      />
    </div>
  );
}
