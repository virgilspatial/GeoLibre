import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@geolibre/ui";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { LinkKind } from "./link-detection";
import { LinkTab } from "./LinkTab";
import { MoreSourcesTab, type MoreSourceGroup } from "./MoreSourcesTab";
import { UploadTab } from "./UploadTab";

export type AddDataTab = "upload" | "link" | "more";

interface SwiftmapAddDataDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** A viewer gets Upload and From a link only, with their own limits and wording. */
  viewer?: boolean;
  /** More sources, already filtered to what works here. Ignored for viewers. */
  moreSources: MoreSourceGroup[];
  /** Adds a link of the given type; resolves to the added layer's name, or null when a form took over. */
  onAddLink: (url: string, kind: LinkKind) => Promise<string | null>;
}

/**
 * SWIFTMAP (Change 24): the Add Data dialog, Stage 0. Upload, From a link and
 * More sources; no Vault tab until Stage 1 (5b). Opened from the rail, the
 * Layers panel's +, and the command palette. Closes with Esc, ×, Cancel or a
 * click outside; the button reads Done once something was added.
 */
export function SwiftmapAddDataDialog({
  open,
  onOpenChange,
  viewer = false,
  moreSources,
  onAddLink,
}: SwiftmapAddDataDialogProps) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<AddDataTab>("upload");
  const [addedAny, setAddedAny] = useState(false);

  // Each opening starts fresh on Upload.
  useEffect(() => {
    if (!open) return;
    setTab("upload");
    setAddedAny(false);
  }, [open]);

  // A file dropped anywhere outside the drop zone while the dialog is open
  // (its overlay, its header) must not make the browser open the file in place
  // of the app. The map's own drop handlers sit under the overlay, so they
  // can't catch it.
  useEffect(() => {
    if (!open) return;
    const cancel = (event: DragEvent) => {
      if (event.dataTransfer?.types.includes("Files")) event.preventDefault();
    };
    window.addEventListener("dragover", cancel);
    window.addEventListener("drop", cancel);
    return () => {
      window.removeEventListener("dragover", cancel);
      window.removeEventListener("drop", cancel);
    };
  }, [open]);

  const close = () => onOpenChange(false);
  const added = () => setAddedAny(true);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-testid="add-data-dialog"
        className="h-[min(620px,calc(100dvh-1rem))] max-w-[760px] rounded-[14px] p-0 sm:rounded-[14px]"
        bodyClassName="flex min-h-0 flex-col gap-0 overflow-hidden p-0"
      >
        <div className="flex flex-col gap-1 pe-14 ps-6 pt-5">
          <DialogTitle className="text-[17px] font-semibold leading-normal tracking-normal">
            {t("addDataDialog.title")}
          </DialogTitle>
          <DialogDescription className="text-[13px]">
            {viewer ? t("addDataDialog.subtitleViewer") : t("addDataDialog.subtitle")}
          </DialogDescription>
        </div>
        <Tabs
          value={tab}
          onValueChange={(value) => setTab(value as AddDataTab)}
          className="flex min-h-0 flex-1 flex-col gap-0"
        >
          <TabsList className="mx-6 mt-[18px] h-auto self-start rounded-[9px] p-[3px]">
            <TabsTrigger value="upload" className="h-[30px] flex-none px-3.5 text-[13px]">
              {t("addDataDialog.tab.upload")}
            </TabsTrigger>
            <TabsTrigger value="link" className="h-[30px] flex-none px-3.5 text-[13px]">
              {t("addDataDialog.tab.link")}
            </TabsTrigger>
            {viewer ? null : (
              <TabsTrigger value="more" className="h-[30px] flex-none px-3.5 text-[13px]">
                {t("addDataDialog.tab.more")}
              </TabsTrigger>
            )}
          </TabsList>
          <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-5 pt-[18px]">
            <TabsContent value="upload" className="mt-0">
              <UploadTab viewer={viewer} onAdded={added} onAllAdded={close} />
            </TabsContent>
            <TabsContent value="link" className="mt-0">
              <LinkTab
                onAddLink={onAddLink}
                onAdded={() => {
                  added();
                  close();
                }}
                onHandedOff={close}
              />
            </TabsContent>
            {viewer ? null : (
              <TabsContent value="more" className="mt-0">
                <MoreSourcesTab groups={moreSources} onPicked={close} />
              </TabsContent>
            )}
          </div>
        </Tabs>
        <div className="flex items-center justify-between gap-3 border-t py-3 pe-5 ps-6">
          <span className="text-xs text-muted-foreground">{t("addDataDialog.dropTip")}</span>
          <Button variant="outline" className="h-[34px] px-3.5 text-[13px]" onClick={close}>
            {addedAny ? t("addDataDialog.done") : t("common.cancel")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
