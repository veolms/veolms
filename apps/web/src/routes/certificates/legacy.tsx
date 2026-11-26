import { Navigate, useLocation, useParams } from "react-router";

/**
 * `/certificate/<code>`, the address used before 27 Nov 2026 (older QR codes
 * and shared links): sends people on to `/verify/<code>`. The website
 * Worker already answers it with a redirect; this covers in-app navigation.
 */
export default function CertificateLegacyRoute() {
  const { code = "" } = useParams();
  const { search, hash } = useLocation();
  return (
    <Navigate
      to={`/verify/${encodeURIComponent(code)}${search}${hash}`}
      replace
    />
  );
}
