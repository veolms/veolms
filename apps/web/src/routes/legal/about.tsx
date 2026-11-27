import { aboutDocument } from "../../legal/documents/about";
import { createLegalRoute } from "../../legal/legalRoute";

const route = createLegalRoute(aboutDocument);

export const meta = route.meta;

export default route.LegalRoute;
