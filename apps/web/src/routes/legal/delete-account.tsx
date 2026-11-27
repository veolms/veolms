import { deleteAccountDocument } from "../../legal/documents/delete-account";
import { createLegalRoute } from "../../legal/legalRoute";

const route = createLegalRoute(deleteAccountDocument);

export const meta = route.meta;

export default route.LegalRoute;
