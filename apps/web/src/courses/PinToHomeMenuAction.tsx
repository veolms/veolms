import { PushPinIcon as PushPin } from "@phosphor-icons/react/PushPin";
import { PushPinSlashIcon as PushPinSlash } from "@phosphor-icons/react/PushPinSlash";
import {
  pinHomeCourse,
  usePinnedHomeCourseId,
} from "../home/learner/pinnedHomeCourse";
import { MenuAction } from "./CourseActionMenu";

interface PinToHomeMenuActionProps {
  courseId: string;
  courseTitle: string;
  onDone: (action: () => void) => void;
  setNotice: (notice: string) => void;
}

/**
 * Pins an enrolled course to the learner's home, or takes the pin off, as
 * the course cards on the home itself do. It lives only while the menu is
 * open, so only the open menu listens for pin changes.
 */
export function PinToHomeMenuAction({
  courseId,
  courseTitle,
  onDone,
  setNotice,
}: PinToHomeMenuActionProps) {
  const pinned = usePinnedHomeCourseId() === courseId;

  return (
    <MenuAction
      Icon={pinned ? PushPinSlash : PushPin}
      label={pinned ? "Unpin from Home" : "Pin to Home"}
      onClick={() =>
        onDone(() => {
          pinHomeCourse(pinned ? null : courseId);
          setNotice(
            pinned
              ? "Unpinned from Home."
              : `${courseTitle} is pinned to Home.`,
          );
        })
      }
    />
  );
}
