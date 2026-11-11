import { useAppStore } from "@geolibre/core";
import { Select } from "@geolibre/ui";
import { useId, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Field } from "../style-panel-swiftmap/fields";
import { analysisInputs, plainFields, polygonInputs } from "./analysis-inputs";
import { useAnalysisStore } from "./analysisStore";
import {
  clipOutputName,
  dissolveOutputName,
  intersectOutputName,
  isMeasuredField,
  toolFormStatus,
} from "./form-model";
import { LayerField, NameField, RunArea, ToolDescription } from "./form-parts";

/**
 * SWIFTMAP (Change 43): the Clip, Intersect and Dissolve forms, on the same
 * pieces as Buffer: layers, an output name that follows the settings until
 * edited, and Run under the fields.
 */

/** Clip and Intersect: an input layer of any shape, and a polygon layer. */
export function OverlayForm({ tool }: { tool: "clip" | "intersect" }) {
  const { t } = useTranslation();
  const layers = useAppStore((state) => state.layers);
  const clipForm = useAnalysisStore((state) => state.clip);
  const intersectForm = useAnalysisStore((state) => state.intersect);
  const updateClip = useAnalysisStore((state) => state.updateClip);
  const updateIntersect = useAnalysisStore((state) => state.updateIntersect);
  const runClip = useAnalysisStore((state) => state.runClip);
  const runIntersect = useAnalysisStore((state) => state.runIntersect);
  const inputId = useId();
  const secondId = useId();
  const nameId = useId();

  const isClip = tool === "clip";
  const form = isClip
    ? { inputLayerId: clipForm.inputLayerId, secondLayerId: clipForm.clipLayerId, name: clipForm.name }
    : {
        inputLayerId: intersectForm.inputLayerId,
        secondLayerId: intersectForm.overlayLayerId,
        name: intersectForm.name,
      };
  const update = (patch: { inputLayerId?: string; secondLayerId?: string; name?: string }) => {
    const { secondLayerId, ...rest } = patch;
    if (isClip) {
      updateClip({ ...rest, ...(secondLayerId !== undefined ? { clipLayerId: secondLayerId } : {}) });
    } else {
      updateIntersect({
        ...rest,
        ...(secondLayerId !== undefined ? { overlayLayerId: secondLayerId } : {}),
      });
    }
  };

  const inputs = useMemo(() => analysisInputs(layers), [layers]);
  const polygonLayers = useMemo(() => polygonInputs(layers), [layers]);
  const input = inputs.find((item) => item.layer.id === form.inputLayerId) ?? inputs[0] ?? null;
  // The default second layer is the top polygon layer that isn't the input.
  const second =
    polygonLayers.find((item) => item.layer.id === form.secondLayerId) ??
    polygonLayers.find((item) => item.layer.id !== input?.layer.id) ??
    polygonLayers[0] ??
    null;
  const autoName =
    input && second
      ? (isClip ? clipOutputName : intersectOutputName)(input.layer.name, second.layer.name)
      : "";
  const name = form.name ?? autoName;
  const status = toolFormStatus({
    inputs: [{ input }, { input: second, polygonsOnly: true }],
    name,
    layers,
    named: true,
  });

  return (
    <div className="flex flex-1 flex-col">
      <ToolDescription>{t(`swiftmapAnalysis.${tool}.description`)}</ToolDescription>
      <div className="flex flex-col gap-4 px-1.5">
        <LayerField
          id={inputId}
          label={t("swiftmapAnalysis.buffer.input")}
          inputs={inputs}
          value={input?.layer.id ?? ""}
          onChange={(inputLayerId) => update({ inputLayerId })}
          testId={`${tool}-input`}
          emptyLabel={t("swiftmapAnalysis.buffer.noLayers")}
        />
        <LayerField
          id={secondId}
          label={t(`swiftmapAnalysis.${tool}.second`)}
          inputs={polygonLayers}
          value={second?.layer.id ?? ""}
          onChange={(secondLayerId) => update({ secondLayerId })}
          testId={`${tool}-second`}
          emptyLabel={t("swiftmapAnalysis.noPolygonLayers")}
        />
        <NameField
          id={nameId}
          value={name}
          onChange={(value) => update({ name: value })}
          testId={`${tool}-name`}
        />
      </div>
      <RunArea
        tool={tool}
        testId={tool}
        status={status}
        name={name.trim()}
        twoInputs
        onRun={() => {
          if (!input || !second) return;
          if (isClip) {
            void runClip({
              inputLayerId: input.layer.id,
              clipLayerId: second.layer.id,
              name: name.trim(),
            });
          } else {
            void runIntersect({
              inputLayerId: input.layer.id,
              overlayLayerId: second.layer.id,
              name: name.trim(),
            });
          }
        }}
      />
    </div>
  );
}

/** Dissolve: a polygon layer and an optional field to dissolve by. */
export function DissolveForm() {
  const { t } = useTranslation();
  const layers = useAppStore((state) => state.layers);
  const form = useAnalysisStore((state) => state.dissolve);
  const update = useAnalysisStore((state) => state.updateDissolve);
  const runDissolve = useAnalysisStore((state) => state.runDissolve);
  const inputId = useId();
  const fieldId = useId();
  const nameId = useId();

  const inputs = useMemo(() => polygonInputs(layers), [layers]);
  const input = inputs.find((item) => item.layer.id === form.inputLayerId) ?? inputs[0] ?? null;
  const collection = input?.layer.geojson;
  const fields = useMemo(
    () => (collection ? plainFields(collection, isMeasuredField) : []),
    [collection],
  );
  // A field the chosen layer doesn't have falls back to none.
  const field = form.field !== null && fields.includes(form.field) ? form.field : null;
  const name = form.name ?? (input ? dissolveOutputName(input.layer.name, field) : "");
  const status = toolFormStatus({
    inputs: [{ input, polygonsOnly: true }],
    name,
    layers,
  });

  return (
    <div className="flex flex-1 flex-col">
      <ToolDescription>{t("swiftmapAnalysis.dissolve.description")}</ToolDescription>
      <div className="flex flex-col gap-4 px-1.5">
        <LayerField
          id={inputId}
          label={t("swiftmapAnalysis.buffer.input")}
          inputs={inputs}
          value={input?.layer.id ?? ""}
          onChange={(inputLayerId) => update({ inputLayerId })}
          testId="dissolve-input"
          emptyLabel={t("swiftmapAnalysis.noPolygonLayers")}
        />
        <Field label={t("swiftmapAnalysis.dissolve.field")} htmlFor={fieldId}>
          <Select
            id={fieldId}
            data-testid="dissolve-field"
            value={field ?? ""}
            disabled={!input}
            onChange={(event) => update({ field: event.target.value || null })}
          >
            <option value="">{t("swiftmapAnalysis.dissolve.noField")}</option>
            {fields.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </Select>
        </Field>
        <NameField
          id={nameId}
          value={name}
          onChange={(value) => update({ name: value })}
          testId="dissolve-name"
        />
      </div>
      <RunArea
        tool="dissolve"
        testId="dissolve"
        status={status}
        name={name.trim()}
        onRun={() => {
          if (input) void runDissolve({ inputLayerId: input.layer.id, field, name: name.trim() });
        }}
      />
    </div>
  );
}
