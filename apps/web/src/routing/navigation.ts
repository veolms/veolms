export interface NavigationOptions {
  preserveScroll?: boolean;
  exact?: boolean;
  skipAutosync?: boolean;
}

export type NavigateTo = (
  destination: string,
  options?: NavigationOptions,
) => void;
