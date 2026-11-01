import heroPhone480 from "../../assets/home/guest-hero-phone-480.webp";
import heroPhone800 from "../../assets/home/guest-hero-phone-800.webp";
import heroPhone1000 from "../../assets/home/guest-hero-phone-1000.webp";
import heroWide960 from "../../assets/home/guest-hero-960.webp";
import heroWide1440 from "../../assets/home/guest-hero-1440.webp";
import heroWide2000 from "../../assets/home/guest-hero-2000.webp";
import lampOffPhone480 from "../../assets/home/guest-hero-lamp-off-phone-480.webp";
import lampOffPhone800 from "../../assets/home/guest-hero-lamp-off-phone-800.webp";
import lampOffPhone1000 from "../../assets/home/guest-hero-lamp-off-phone-1000.webp";
import lampOffWide960 from "../../assets/home/guest-hero-lamp-off-960.webp";
import lampOffWide1440 from "../../assets/home/guest-hero-lamp-off-1440.webp";
import lampOffWide2000 from "../../assets/home/guest-hero-lamp-off-2000.webp";
import dayPhone480 from "../../assets/home/guest-hero-day-phone-480.webp";
import dayPhone800 from "../../assets/home/guest-hero-day-phone-800.webp";
import dayPhone1000 from "../../assets/home/guest-hero-day-phone-1000.webp";
import dayWide960 from "../../assets/home/guest-hero-day-960.webp";
import dayWide1440 from "../../assets/home/guest-hero-day-1440.webp";
import dayWide2000 from "../../assets/home/guest-hero-day-2000.webp";
import dayLampOnPhone480 from "../../assets/home/guest-hero-day-lamp-on-phone-480.webp";
import dayLampOnPhone800 from "../../assets/home/guest-hero-day-lamp-on-phone-800.webp";
import dayLampOnPhone1000 from "../../assets/home/guest-hero-day-lamp-on-phone-1000.webp";
import dayLampOnWide960 from "../../assets/home/guest-hero-day-lamp-on-960.webp";
import dayLampOnWide1440 from "../../assets/home/guest-hero-day-lamp-on-1440.webp";
import dayLampOnWide2000 from "../../assets/home/guest-hero-day-lamp-on-2000.webp";

export interface GuestHeroPicture {
  phone: GuestHeroPictureSource;
  wide: GuestHeroPictureSource;
}

interface GuestHeroPictureSource {
  media: string;
  src: string;
  srcSet: string;
  sizes: string;
  width: number;
  height: number;
}

/** Every hero picture is the same scene in the same two crops. */
function heroPicture(
  phone: readonly [string, string, string],
  wide: readonly [string, string, string],
): GuestHeroPicture {
  return {
    phone: {
      media: "(max-width: 639.98px)",
      src: phone[1],
      srcSet: `${phone[0]} 480w, ${phone[1]} 800w, ${phone[2]} 1000w`,
      sizes: "100vw",
      width: 1000,
      height: 667,
    },
    wide: {
      media: "(min-width: 640px)",
      src: wide[1],
      srcSet: `${wide[0]} 960w, ${wide[1]} 1440w, ${wide[2]} 2000w`,
      sizes: "100vw",
      width: 2000,
      height: 667,
    },
  };
}

/**
 * The guest home hero picture: the desk at night with the lamp on, shown in
 * the dark theme. Phones get a crop of the desk scene (the wide picture's
 * left half is empty space for the headline, which sits below the picture on
 * a phone); wider screens get the full panorama.
 *
 * The page shell preloads the same sources so the download starts with the
 * prerendered document, before the lazy guest home has loaded.
 */
export const guestHeroImage = heroPicture(
  [heroPhone480, heroPhone800, heroPhone1000],
  [heroWide960, heroWide1440, heroWide2000],
);

/** The night scene after the visitor switches the lamp off. */
export const guestHeroLampOffImage = heroPicture(
  [lampOffPhone480, lampOffPhone800, lampOffPhone1000],
  [lampOffWide960, lampOffWide1440, lampOffWide2000],
);

/** The desk by day with the lamp off, shown in the light theme. */
export const guestHeroDayImage = heroPicture(
  [dayPhone480, dayPhone800, dayPhone1000],
  [dayWide960, dayWide1440, dayWide2000],
);

/** The day scene after the visitor switches the lamp on. */
export const guestHeroDayLampOnImage = heroPicture(
  [dayLampOnPhone480, dayLampOnPhone800, dayLampOnPhone1000],
  [dayLampOnWide960, dayLampOnWide1440, dayLampOnWide2000],
);
