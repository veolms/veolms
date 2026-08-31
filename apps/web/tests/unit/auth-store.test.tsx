import { act, waitFor } from "@testing-library/react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  authStore,
  type AuthUser,
  useAuthStore,
} from "../../src/store/auth.store.ts";

function AuthStateProbe() {
  const displayName = useAuthStore(
    (state) => state.user?.displayName ?? "anonymous",
  );
  return <span>{displayName}</span>;
}

beforeEach(() => {
  authStore.clearAuth();
});

describe("useAuthStore", () => {
  it("keeps hydration anonymous before applying a stored user", async () => {
    authStore.setUser({ displayName: "Stored learner" } as AuthUser);
    const serverMarkup = renderToString(<AuthStateProbe />);
    const container = document.createElement("div");
    container.innerHTML = serverMarkup;
    document.body.append(container);
    const onRecoverableError = vi.fn();

    expect(container).toHaveTextContent("anonymous");

    const root = hydrateRoot(container, <AuthStateProbe />, {
      onRecoverableError,
    });

    await waitFor(() => expect(container).toHaveTextContent("Stored learner"));
    expect(onRecoverableError).not.toHaveBeenCalled();

    act(() => root.unmount());
    container.remove();
  });
});
