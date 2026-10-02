import { CircleCheck, CircleAlert, Info, TriangleAlert, Loader2 } from "lucide-react";
import { Toaster as Sonner } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const iconWrap = "grid size-9 shrink-0 place-items-center rounded-2xl";

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      className="toaster group"
      gap={10}
      offset={16}
      icons={{
        success: <span className={`${iconWrap} bg-income/15 text-income`}><CircleCheck className="size-5" /></span>,
        error: <span className={`${iconWrap} bg-destructive/15 text-destructive`}><CircleAlert className="size-5" /></span>,
        warning: <span className={`${iconWrap} bg-warning/15 text-warning`}><TriangleAlert className="size-5" /></span>,
        info: <span className={`${iconWrap} bg-primary/15 text-primary`}><Info className="size-5" /></span>,
        loading: <span className={`${iconWrap} bg-muted text-muted-foreground`}><Loader2 className="size-5 animate-spin" /></span>,
      }}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast:
            "group toast font-sans flex w-full items-center gap-3 rounded-3xl border border-border/60 bg-card/85 p-3.5 pe-4 text-card-foreground shadow-[0_18px_40px_-12px_rgb(0_0_0/0.55)] backdrop-blur-xl ring-1 ring-foreground/5",
          icon: "!m-0 !size-auto",
          content: "flex-1 min-w-0 space-y-0.5",
          title: "text-sm font-semibold leading-6",
          description: "text-xs leading-6 text-muted-foreground",
          actionButton:
            "shrink-0 rounded-xl bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition hover:opacity-90",
          cancelButton:
            "shrink-0 rounded-xl bg-muted px-3 py-1.5 text-xs font-medium text-muted-foreground transition hover:text-foreground",
          closeButton: "!bg-muted !border-border !text-muted-foreground",
          success: "border-income/30",
          error: "border-destructive/30",
          warning: "border-warning/30",
          info: "border-primary/30",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
