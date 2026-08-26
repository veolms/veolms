export interface NavigationOptions {
  preserveScroll?: boolean;
  exact?: boolean;
}

export type NavigateTo = (
  destination: string,
  options?: NavigationOptions,
) => void;
