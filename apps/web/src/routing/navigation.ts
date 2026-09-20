export interface NavigationOptions {
  preserveScroll?: boolean;
  exact?: boolean;
  replace?: boolean;
}

export type NavigateTo = (
  destination: string,
  options?: NavigationOptions,
) => void;
