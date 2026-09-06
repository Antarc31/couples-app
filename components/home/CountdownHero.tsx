import Card from "@/components/ui/Card";
import Sticker from "@/components/ui/Sticker";
import IconBadge from "@/components/ui/IconBadge";
import { Heart, Trophy } from "@/components/ui/icons";

interface CountdownHeroProps {
  nextSpecial: { label: string; daysUntil: number } | null;
  nextMilestone: { label: string; daysUntil: number } | null;
}

/**
 * Countdown hero di Home (redesign "Diario di coppia"): unisce due dati
 * che prima vivevano in due componenti separati (CountdownHeader/
 * MilestoneBadge) in un solo composito, come nel riferimento — nextSpecial
 * come numero enorme (font-hero, Instrument Serif italic), nextMilestone
 * come adesivo ruotato che sporge dall'angolo. Se manca solo nextSpecial,
 * l'adesivo resta da solo, non sovrapposto a nulla.
 */
export default function CountdownHero({ nextSpecial, nextMilestone }: CountdownHeroProps) {
  if (!nextSpecial && !nextMilestone) return null;

  const sticker = nextMilestone && (
    <Sticker rotate={-6} className={nextSpecial ? "absolute -bottom-4 right-3" : ""}>
      <IconBadge icon={Trophy} size={28} />
      <span>
        <span className="block text-sm font-bold">{nextMilestone.label}</span>
        <span className="block text-[10px] font-semibold uppercase tracking-wide opacity-80">
          {nextMilestone.daysUntil === 0 ? "Oggi" : `Tra ${nextMilestone.daysUntil} giorni`}
        </span>
      </span>
    </Sticker>
  );

  if (!nextSpecial) return sticker;

  return (
    <Card className="relative flex flex-col gap-0.5 pb-6">
      <div className="flex items-start justify-between">
        <p className="font-hand text-lg text-couple">prossimo traguardo</p>
        <Heart size={20} strokeWidth={2} className="text-couple" />
      </div>
      <p className="font-hero text-[72px] italic leading-[0.85] text-ink">
        {nextSpecial.daysUntil === 0 ? "Oggi" : nextSpecial.daysUntil}
      </p>
      {nextSpecial.daysUntil > 0 && <p className="text-sm font-bold uppercase tracking-wide text-ink">giorni</p>}
      <p className="text-sm text-ink-soft">
        {nextSpecial.daysUntil === 0 ? nextSpecial.label : `al ${nextSpecial.label}`}
      </p>
      {sticker}
    </Card>
  );
}
