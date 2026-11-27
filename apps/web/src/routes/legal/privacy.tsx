import { privacyDocument } from "../../legal/documents/privacy";
import { createLegalRoute } from "../../legal/legalRoute";

const route = createLegalRoute(privacyDocument);

export const meta = route.meta;

export default route.LegalRoute;
