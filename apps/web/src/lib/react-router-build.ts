export const isReactRouterBuildRequest = () =>
  typeof process !== "undefined" &&
  process.env?.IS_RR_BUILD_REQUEST === "yes";
