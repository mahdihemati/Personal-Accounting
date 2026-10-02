import wallet from "@/assets/illustrations/wallet.png.asset.json";
import money from "@/assets/illustrations/money.png.asset.json";
import safe from "@/assets/illustrations/safe.png.asset.json";
import charts from "@/assets/illustrations/charts.png.asset.json";
import jar from "@/assets/illustrations/jar.png.asset.json";
import exchange from "@/assets/illustrations/exchange.png.asset.json";
import cards from "@/assets/illustrations/cards.png.asset.json";
import calculator from "@/assets/illustrations/calculator.png.asset.json";
import { cn } from "@/lib/utils";

const SRC = { wallet, money, safe, charts, jar, exchange, cards, calculator };

/** Decorative 3D illustration with a soft glow and optional float motion. */
export function Illustration({ name, size = 56, float = true, className }: { name: keyof typeof SRC; size?: number; float?: boolean; className?: string }) {
  return (
    <img
      src={SRC[name].url}
      alt=""
      aria-hidden
      loading="lazy"
      width={size}
      height={size}
      style={{ width: size, height: size }}
      className={cn("shrink-0 select-none drop-shadow-glow", float && "animate-float", className)}
    />
  );
}
