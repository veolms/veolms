import { LoginView } from "../auth/LoginView";
import { getAuthRouteMeta, productName } from "../routing/routeDescriptors";

export function meta() {
  return Object.entries(
    getAuthRouteMeta(
      "Log in",
      `Log in to ${productName} with a secure one-time code.`,
    ),
  ).map(([name, content]) =>
    name === "title" ? { title: content } : { name, content },
  );
}

export default function LoginRoute() {
  return <LoginView />;
}
