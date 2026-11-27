import { policiesDocument } from "../../legal/documents/policies";
import { createLegalRoute } from "../../legal/legalRoute";

const route = createLegalRoute(policiesDocument);

export const meta = route.meta;

export default route.LegalRoute;
