import { contactDocument } from "../../legal/documents/contact";
import { createLegalRoute } from "../../legal/legalRoute";

const route = createLegalRoute(contactDocument);

export const meta = route.meta;

export default route.LegalRoute;
