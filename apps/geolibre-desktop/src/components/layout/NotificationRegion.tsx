import { Alert, AlertAction, AlertDescription, AlertTitle, Button, cn } from "@geolibre/ui";
import { Bug, CircleAlert, CircleCheck, Info, TriangleAlert, X } from "lucide-react";
import { useEffect, useRef, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import {
  dismissNotification,
  setNotificationsPaused,
  useNotificationStore,
  type AppNotification,
  type NotificationKind,
} from "../../lib/notify";
import { reportIssue } from "../../lib/report-issue";

const KIND_ICON: Record<NotificationKind, typeof Info> = {
  success: CircleCheck,
  info: Info,
  warning: TriangleAlert,
  error: CircleAlert,
};

/* Swiftmap: toasts follow the shadcn Alert examples (UI_CUSTOMISATION.md,
   Change 03). Success and info are the plain alert, with the icon in the text
   colour. Warning is the amber "custom colors" alert. Error is the destructive
   alert, but with red-700/red-400: our --destructive red fails AA contrast on
   the light card. tailwind-merge lets these override the variant's colours. */
const KIND_CLASS: Record<NotificationKind, string> = {
  success: "",
  info: "",
  warning:
    "border-amber-200 bg-amber-50 text-amber-900 *:data-[slot=alert-description]:text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100 dark:*:data-[slot=alert-description]:text-amber-200",
  error:
    "text-red-700 *:data-[slot=alert-description]:text-red-700 dark:text-red-400 dark:*:data-[slot=alert-description]:text-red-400",
};

function NotificationToast({ notification }: { notification: AppNotification }) {
  const { t } = useTranslation();
  const Icon = KIND_ICON[notification.kind];
  const close = () => dismissNotification(notification.id);
  return (
    <Alert
      // The region's role="status"/"alert" wrappers announce; a role on each
      // toast would make every one assertive.
      role={undefined}
      variant={notification.kind === "error" ? "destructive" : "default"}
      data-testid="notification"
      data-kind={notification.kind}
      data-notification-id={notification.id}
      className={cn(
        "pointer-events-auto shadow-lg",
        "motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-2",
        // AlertAction always holds the ✕; widen the reserve when it also
        // holds an action button.
        notification.action
          ? "has-data-[slot=alert-action]:pe-28"
          : "has-data-[slot=alert-action]:pe-9",
        KIND_CLASS[notification.kind],
      )}
    >
      <Icon aria-hidden="true" />
      <AlertTitle className="break-words">
        {notification.message}
        {notification.count > 1 ? (
          <span className="ms-1.5 rounded bg-muted px-1 py-0.5 text-xs font-normal text-muted-foreground">
            {t("notifications.repeated", { count: notification.count })}
          </span>
        ) : null}
      </AlertTitle>
      {notification.description ? (
        <AlertDescription className="break-words">{notification.description}</AlertDescription>
      ) : null}
      {notification.diagnostic ? (
        <button
          type="button"
          className="col-start-2 mt-0.5 inline-flex items-center gap-1 justify-self-start text-xs underline underline-offset-3 opacity-90 hover:opacity-100"
          onClick={() => reportIssue(notification.diagnostic ?? null)}
        >
          <Bug aria-hidden="true" className="h-3 w-3" />
          {t("notifications.reportIssue")}
        </button>
      ) : null}
      <AlertAction className="flex items-center gap-1">
        {notification.action ? (
          <Button
            variant="outline"
            size="sm"
            className="h-6 px-2"
            onClick={() => {
              notification.action?.onClick();
              close();
            }}
          >
            {notification.action.label}
          </Button>
        ) : null}
        <button
          type="button"
          aria-label={t("notifications.dismiss")}
          title={t("notifications.dismiss")}
          className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          onClick={close}
        >
          <X aria-hidden="true" className="h-3.5 w-3.5" />
        </button>
      </AlertAction>
    </Alert>
  );
}

/**
 * The app's toast region, mounted once at the root. Errors render in an
 * assertive live region and stay until dismissed; everything else is polite and
 * auto-dismisses. Both regions are always in the DOM, because a live region
 * inserted together with its first message is often not announced.
 */
export function NotificationRegion() {
  const { t } = useTranslation();
  const notifications = useNotificationStore((state) => state.notifications);
  const regionRef = useRef<HTMLElement>(null);
  const hoveredRef = useRef(false);
  const errors = notifications.filter((item) => item.kind === "error");
  const others = notifications.filter((item) => item.kind !== "error");

  // Timers pause while the pointer is over the region or focus is inside it.
  // Re-derived after every change too: a dismissed toast that held focus is
  // removed without a reliable blur, which must not leave timers frozen.
  const syncPaused = () => {
    const region = regionRef.current;
    const focusInside =
      region !== null && typeof document !== "undefined" && region.contains(document.activeElement);
    setNotificationsPaused(hoveredRef.current || focusInside);
  };
  useEffect(() => {
    if (notifications.length === 0) hoveredRef.current = false;
    syncPaused();
  });
  useEffect(() => () => setNotificationsPaused(false), []);

  return (
    <section
      ref={regionRef}
      aria-label={t("notifications.regionLabel")}
      data-testid="notification-region"
      className="pointer-events-none fixed bottom-10 end-4 z-[60] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2"
      onMouseEnter={() => {
        hoveredRef.current = true;
        syncPaused();
      }}
      onMouseLeave={() => {
        hoveredRef.current = false;
        syncPaused();
      }}
      onFocus={syncPaused}
      // Escape dismisses the toast that holds keyboard focus.
      onKeyDown={(event: KeyboardEvent<HTMLElement>) => {
        if (event.key !== "Escape" || !(event.target instanceof Element)) return;
        const id = event.target
          .closest<HTMLElement>("[data-notification-id]")
          ?.getAttribute("data-notification-id");
        if (!id) return;
        event.stopPropagation();
        dismissNotification(id);
      }}
      onBlur={(event) => {
        const next = event.relatedTarget as Node | null;
        setNotificationsPaused(hoveredRef.current || event.currentTarget.contains(next));
      }}
    >
      <div role="alert" aria-live="assertive" className="flex flex-col gap-2 empty:hidden">
        {errors.map((notification) => (
          // Keyed on the revision so a repeat remounts and is announced again.
          <NotificationToast
            key={`${notification.id}:${notification.revision}`}
            notification={notification}
          />
        ))}
      </div>
      <div role="status" aria-live="polite" className="flex flex-col gap-2 empty:hidden">
        {others.map((notification) => (
          <NotificationToast
            key={`${notification.id}:${notification.revision}`}
            notification={notification}
          />
        ))}
      </div>
    </section>
  );
}
