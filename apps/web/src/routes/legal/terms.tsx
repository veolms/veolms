import { termsDocument } from "../../legal/documents/terms";
import { createLegalRoute } from "../../legal/legalRoute";

const route = createLegalRoute(termsDocument);

export const meta = route.meta;

export default route.LegalRoute;
