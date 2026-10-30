/**
 * Each pair of figures stands in a box of its own fixed width, so nothing
 * after it moves as the seconds change, whatever widths the face gives its
 * figures. The box is two figures and their letter spacing wide.
 */
export const figurePairClasses = "inline-block w-[calc(2ch_+_0.32em)]";

/** The figures' boxes as markup, for the script that fills the line early. */
const FIGURE_PAIR_CLASSES_JS = JSON.stringify(figurePairClasses);

/**
 * Puts the reader's own date and time into the line before it is first
 * drawn. A page built ahead of time carries the hour it was built at; this
 * runs as the browser reads the line, long before the page's code does, and
 * writes the same words the component would (see `formatDay` and
 * `timeParts` in LearnerHeroClock.tsx).
 * The function on its own (given the line's <time>) also sets the clock of
 * a home put back as it was (see learnerHomeSnapshot.ts).
 */
export const FILL_CLOCK_FUNCTION = `function(t){var d=new Date(),p=new Intl.DateTimeFormat("en-GB",{weekday:"long",day:"numeric",month:"long"}).formatToParts(d),g=function(k){for(var i=0;i<p.length;i++)if(p[i].type===k)return p[i].value;return""};t.firstChild.data=g("weekday")+", "+g("day")+" "+g("month");var q=new Intl.DateTimeFormat("en-US",{hour:"2-digit",minute:"2-digit",second:"2-digit",hour12:!0}).formatToParts(d),v=function(k){for(var i=0;i<q.length;i++)if(q[i].type===k)return q[i].value;return""},b=function(x){return'<span class="'+${FIGURE_PAIR_CLASSES_JS}+'">'+x+"</span>"};t.lastChild.innerHTML=b(v("hour"))+":"+b(v("minute"))+":"+b(v("second"))+"<span> "+v("dayPeriod").toUpperCase()+"</span>";t.dateTime=d.toISOString()}`;
