import { useEffect, useState } from "react";
import { FILL_CLOCK_FUNCTION, figurePairClasses } from "./heroClockFill";

const SECOND_MS = 1_000;

/** The time it is now, read again as each second begins. */
function useCurrentSecond() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    let timer = 0;
    const waitForNextSecond = () => {
      // A little past the second, so a timer that fires early still reads
      // the new one.
      timer = window.setTimeout(
        () => {
          setNow(new Date());
          waitForNextSecond();
        },
        SECOND_MS - (Date.now() % SECOND_MS) + 20,
      );
    };
    waitForNextSecond();
    return () => window.clearTimeout(timer);
  }, []);
  return now;
}

/**
 * The page is in English, so the day and the month are named in English
 * whatever the device's language. The time is always told in twelve hours
 * with AM or PM, and with its seconds, whatever the device's own setting.
 */
const dayFormat = new Intl.DateTimeFormat("en-GB", {
  weekday: "long",
  day: "numeric",
  month: "long",
});

function formatDay(date: Date) {
  const parts = dayFormat.formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((entry) => entry.type === type)?.value ?? "";
  return `${part("weekday")}, ${part("day")} ${part("month")}`;
}

const timeFormat = new Intl.DateTimeFormat("en-US", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: true,
});

/** "07", "20", "41" and "PM": the hour always has two figures. */
function timeParts(date: Date) {
  const parts = timeFormat.formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((entry) => entry.type === type)?.value ?? "";
  return {
    hour: part("hour"),
    minute: part("minute"),
    second: part("second"),
    period: part("dayPeriod").toUpperCase(),
  };
}

const FILL_CLOCK_SCRIPT = `(()=>{try{(${FILL_CLOCK_FUNCTION})(document.currentScript.previousElementSibling.firstElementChild)}catch(e){}})();`;

/**
 * The line over the learner's greeting: today's date and the time, which
 * keeps itself current.
 *
 * It reads the clock while rendering, which is right in the browser. Where
 * it may also be rendered ahead of time (the home's shell), `fillBeforePaint`
 * adds a script that corrects the words as the browser reads them; the page's
 * code then leaves them as it finds them and carries on from there.
 */
export function LearnerHeroClock({
  className,
  fillBeforePaint = false,
}: {
  className: string;
  fillBeforePaint?: boolean;
}) {
  const now = useCurrentSecond();
  const time = timeParts(now);
  return (
    <>
      <p className={className}>
        {/* Figures of one width, so the line keeps still as the seconds
            change. */}
        <time
          dateTime={now.toISOString()}
          suppressHydrationWarning
          className="tabular-nums"
        >
          {formatDay(now)}
          <span aria-hidden="true" className="mx-[0.6em]">
            ·
          </span>
          {/* Each figure box holds the time the page was built at until the
              page's code takes over (the early script has written the
              reader's own by then), so each is allowed to differ. The
              period is one text node, as the early script writes it. */}
          <span>
            <span className={figurePairClasses} suppressHydrationWarning>
              {time.hour}
            </span>
            :
            <span className={figurePairClasses} suppressHydrationWarning>
              {time.minute}
            </span>
            :
            <span className={figurePairClasses} suppressHydrationWarning>
              {time.second}
            </span>
            <span suppressHydrationWarning>{` ${time.period}`}</span>
          </span>
        </time>
      </p>
      {fillBeforePaint ? (
        <script dangerouslySetInnerHTML={{ __html: FILL_CLOCK_SCRIPT }} />
      ) : null}
    </>
  );
}
