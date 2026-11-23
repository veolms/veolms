import { MyFiles } from "./MyFiles";
import { StorageSpaceSummary } from "./StorageSpaceSummary";

/**
 * Chats > Settings > Media storage: the space, then the learner's own files
 * to look through and delete (WhatsApp's "Manage storage").
 */
export function StorageSpaceDetails({
  onToast,
}: {
  onToast?: (message: string) => void;
}) {
  return (
    <div className="grid gap-5">
      <StorageSpaceSummary />
      <MyFiles onToast={onToast} />
    </div>
  );
}
