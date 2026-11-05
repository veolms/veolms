/**
 * `https://procodrr.dev./` (a dot after the name) is a valid address for the
 * same site, and browsers keep the dot. Its origin is not the site's origin,
 * so the API refuses its requests (CORS) and sign-in showed "Can't reach our
 * server". Sends the visitor to the same page without the dot before
 * anything else runs.
 */
export function getTrailingDotHostRedirectScript(): string {
  return `(function(){try{var l=window.location,h=l.hostname;if(h.length>1&&h.charAt(h.length-1)==="."){l.replace(l.protocol+"//"+h.replace(/\\.+$/,"")+(l.port?":"+l.port:"")+l.pathname+l.search+l.hash)}}catch(e){}})();`;
}
