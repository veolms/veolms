import { deleteAccountDocument as page } from "../../legal/documents/delete-account";
import { LegalPageLayout } from "../../legal/LegalPageLayout";

export function meta() {
  return [
    { title: page.title },
    { name: "description", content: page.description },
  ];
}

export default function LegalRoute() {
  return <LegalPageLayout document={page} />;
}
