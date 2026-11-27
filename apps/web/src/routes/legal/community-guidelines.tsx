import { communityGuidelinesDocument } from "../../legal/documents/community-guidelines";
import { createLegalRoute } from "../../legal/legalRoute";

const route = createLegalRoute(communityGuidelinesDocument);

export const meta = route.meta;

export default route.LegalRoute;
