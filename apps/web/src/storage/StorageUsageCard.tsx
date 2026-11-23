import { CloudArrowUpIcon as CloudArrowUp } from "@phosphor-icons/react/CloudArrowUp";
import { FolderOpenIcon as FolderOpen } from "@phosphor-icons/react/FolderOpen";
import { useState } from "react";

import { Button } from "../components/Button";
import { MyFiles } from "./MyFiles";
import { MyFilesSheet } from "./MyFilesSheet";
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

/**
 * Settings > Learning: the learner's media storage, as a settings card,
 * with "Manage files" (their files, to delete some).
 */
export function StorageUsageCard() {
  const [managing, setManaging] = useState(false);
  return (
    <section
      className="settings-learning-card"
      aria-labelledby="storage-space-heading"
    >
      <header className="settings-learning-card__heading">
        <CloudArrowUp size={21} weight="duotone" />
        <h3 id="storage-space-heading">Media storage</h3>
      </header>
      <StorageSpaceSummary />
      <div className="pt-1">
        <Button
          variant="quiet"
          elevation="flat"
          className="h-9 gap-1.5 text-[0.8rem]!"
          onClick={() => setManaging(true)}
        >
          <FolderOpen size={16} aria-hidden="true" />
          Manage files
        </Button>
      </div>
      {managing ? <MyFilesSheet onClose={() => setManaging(false)} /> : null}
    </section>
  );
}
