export const navigationKeys = {
  all: ["navigation"] as const,
  sidenav: () => [...navigationKeys.all, "sidenav"] as const,
};
