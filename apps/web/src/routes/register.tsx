import { redirect } from "react-router";

// /login serves new and returning visitors alike; this path is kept only so
// existing links resolve instead of 404ing.
export function clientLoader() {
  return redirect("/login");
}

export default function RegisterRoute() {
  return null;
}
