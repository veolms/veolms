import { OctopusIllustration } from "../../components/OctopusIllustration";

/**
 * The picture that goes with "Something went wrong" in the lesson player:
 * the brand's octopus in one of its three mishaps, a different one from
 * visit to visit. A failed player's stage follows the page's theme, so the
 * drawing does.
 */
export function LessonTroubleIllustration({
  className,
}: {
  className?: string;
}) {
  // The player cuts off what leaves it, so a lead that hangs from above is
  // carried on to the video's top edge and comes in from outside it.
  return (
    <OctopusIllustration kind="went-wrong" wireToTop className={className} />
  );
}
