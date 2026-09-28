const configuredApiBaseUrl = import.meta.env.VITE_API_BASE_URL || "/v1";

/**
 * Start shell-critical reads while the browser is still parsing the
 * prerendered document and downloading the application modules. The API
 * client consumes successful responses, so the normal query/service flow
 * remains the source of state. Failed prefetches use its regular request path.
 */
export function getEarlyApiBootstrapScript(): string {
  const configuredBase = JSON.stringify(configuredApiBaseUrl);

  return String.raw`(() => {
  try {
    const pathname = location.pathname.endsWith('/') && location.pathname.length > 1
      ? location.pathname.slice(0, -1)
      : location.pathname;
    if (['/login', '/register', '/mfa-setup', '/auth/callback'].includes(pathname)) return;

    let hasSessionHint = false;
    let isCreatorWorkspaceHint = false;
    const isCourseCataloguePath = ['/', '/courses', '/my-courses', '/wishlist'].includes(pathname);
    if (isCourseCataloguePath) {
      try {
        const savedIdentity = sessionStorage.getItem('veolms-auth-identity');
        if (savedIdentity) {
          try {
            const identity = JSON.parse(savedIdentity);
            hasSessionHint = typeof identity?.displayName === 'string' && Boolean(identity.displayName.trim());
          } catch {
            hasSessionHint = Boolean(savedIdentity.trim());
          }
        }
        let userId;
        try {
          const identity = JSON.parse(savedIdentity || 'null');
          if (identity && typeof identity.userId === 'string') userId = identity.userId;
        } catch {}

        const roleKey = userId ? 'veolms-role-' + userId : 'veolms-role';
        isCreatorWorkspaceHint = localStorage.getItem(roleKey) === 'creator';
        if (isCreatorWorkspaceHint) {
          window.__VEO_CREATOR_CATALOGUE_HINT__ = true;
          const hidePrerenderedCourseGrid = () => {
            const grid = document.querySelector('[data-course-catalogue-grid]');
            if (!grid) return;
            grid.style.visibility = 'hidden';
            observer.disconnect();
          };
          const observer = new MutationObserver(hidePrerenderedCourseGrid);
          observer.observe(document.documentElement, { childList: true, subtree: true });
          hidePrerenderedCourseGrid();
        }
      } catch {}
    }

    const configuredUrl = new URL(${configuredBase}, location.origin);
    const hostOctets = location.hostname.split('.').map(Number);
    const isPrivateIpv4 = hostOctets[0] === 10 ||
      (hostOctets[0] === 192 && hostOctets[1] === 168) ||
      (hostOctets[0] === 172 && hostOctets[1] >= 16 && hostOctets[1] <= 31);
    if (
      isPrivateIpv4 &&
      (configuredUrl.hostname === 'localhost' || configuredUrl.hostname === '127.0.0.1') &&
      configuredUrl.protocol === 'http:'
    ) {
      configuredUrl.hostname = location.hostname;
    }

    let apiBaseUrl = configuredUrl.origin === location.origin
      ? configuredUrl.pathname
      : configuredUrl.origin + configuredUrl.pathname;
    while (apiBaseUrl.endsWith('/')) apiBaseUrl = apiBaseUrl.slice(0, -1);

    const requests = window.__VEO_EARLY_API_REQUESTS__ ||
      (window.__VEO_EARLY_API_REQUESTS__ = Object.create(null));
    const earlyPaths = ['/auth/me', '/navigation/sidenav'];
    if (isCourseCataloguePath && hasSessionHint && !isCreatorWorkspaceHint) {
      earlyPaths.push('/enrollments/courses');
    }
    for (const path of earlyPaths) {
      if (requests[path]) continue;
      const startedAt = Date.now();
      const requestPath = path.startsWith('/') ? path.slice(1) : path;
      const promise = fetch(apiBaseUrl + '/' + requestPath, {
        credentials: 'include',
        cache: 'no-store',
        headers: { accept: 'application/json' },
      })
        .then(async (response) => ({
          ok: response.ok,
          status: response.status,
          body: response.ok ? await response.json() : undefined,
        }))
        .catch(() => null);
      requests[path] = { startedAt, promise };
    }
  } catch {}
})();`;
}
