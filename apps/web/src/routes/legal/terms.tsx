import { termsDocument as page } from "../../legal/documents/terms";
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
