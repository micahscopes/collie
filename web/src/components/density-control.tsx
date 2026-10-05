import { Minimize2 } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { useLocale } from "@/hooks/use-locale";
import { setDesignDensity, useDensity } from "@/lib/design";
import { t } from "@/lib/i18n";

// Compact layout (lib/design.ts § Density): this fork's default. Off puts upstream's roomier header,
// spacing and space-view cards back. Per device, like every card on this page.
export function DensityControl() {
  useLocale();
  const density = useDensity();
  return (
    <Card className="gap-0 py-0">
      <div className="flex items-center justify-between gap-4 p-4">
        <div className="flex min-w-0 items-start gap-3">
          <Minimize2 className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <div className="font-medium">{t("settings.density.title")}</div>
            <p className="text-sm text-muted-foreground">{t("settings.density.description")}</p>
          </div>
        </div>
        <div className="flex h-6 w-11 shrink-0 items-center justify-center">
          <Switch
            checked={density === "compact"}
            onCheckedChange={(on) => setDesignDensity(on ? "compact" : "comfortable")}
            aria-label={t("settings.density.ariaLabel")}
          />
        </div>
      </div>
    </Card>
  );
}
