import type {
  PlayerKeyboardRegistration,
  PlayerKeyboardRegistrationHandle,
} from "./types.js";

interface StoredRegistration extends PlayerKeyboardRegistration {
  order: number;
}

/**
 * Coordinates page-wide keyboard ownership when more than one player exists.
 *
 * A player becomes active explicitly through its registration handle or when a
 * keyboard event originates inside its root. Events outside every player are
 * routed only to the active player, matching the existing VeoLMS page-wide
 * shortcut behavior without allowing every mounted player to react.
 */
export class PlayerKeyboardArbiter {
  private readonly registrations = new Map<string, StoredRegistration>();
  private activeId: string | null = null;
  private nextOrder = 0;

  register(
    registration: PlayerKeyboardRegistration,
  ): PlayerKeyboardRegistrationHandle {
    if (this.registrations.has(registration.id)) {
      throw new Error(
        `A player keyboard registration with id "${registration.id}" already exists.`,
      );
    }
    const stored = { ...registration, order: this.nextOrder++ };
    this.registrations.set(registration.id, stored);
    if (
      registration.activateOnRegister === true ||
      (registration.activateOnRegister !== false && this.activeId === null)
    ) {
      this.activeId = registration.id;
    }

    let registered = true;
    return {
      activate: () => {
        if (registered && this.registrations.has(registration.id)) {
          this.activeId = registration.id;
        }
      },
      deactivate: () => {
        if (this.activeId === registration.id) this.activeId = null;
      },
      isActive: () => registered && this.activeId === registration.id,
      unregister: () => {
        if (!registered) return;
        registered = false;
        this.registrations.delete(registration.id);
        if (this.activeId === registration.id) {
          this.activeId = this.mostRecentlyRegistered()?.id ?? null;
        }
        registration.controller.dispose();
      },
    };
  }

  getActivePlayerId(): string | null {
    return this.activeId;
  }

  handleKeyDown(event: KeyboardEvent): boolean {
    return (
      this.registrationForEvent(event)?.controller.handleKeyDown(event) ?? false
    );
  }

  handleKeyUp(event: KeyboardEvent): boolean {
    return (
      this.registrationForEvent(event)?.controller.handleKeyUp(event) ?? false
    );
  }

  handleBlur(): void {
    this.activeRegistration()?.controller.handleBlur();
  }

  attach(target: Window | Document): () => void {
    const handleKeyDown = (event: Event) => {
      if (event instanceof KeyboardEvent) this.handleKeyDown(event);
    };
    const handleKeyUp = (event: Event) => {
      if (event instanceof KeyboardEvent) this.handleKeyUp(event);
    };
    const handleBlur = () => this.handleBlur();

    target.addEventListener("keydown", handleKeyDown, true);
    target.addEventListener("keyup", handleKeyUp, true);
    target.addEventListener("blur", handleBlur);
    return () => {
      target.removeEventListener("keydown", handleKeyDown, true);
      target.removeEventListener("keyup", handleKeyUp, true);
      target.removeEventListener("blur", handleBlur);
    };
  }

  dispose(): void {
    for (const registration of this.registrations.values()) {
      registration.controller.dispose();
    }
    this.registrations.clear();
    this.activeId = null;
  }

  private registrationForEvent(
    event: KeyboardEvent,
  ): StoredRegistration | null {
    const targetRegistration = this.registrationContaining(event.target);
    if (targetRegistration) this.activeId = targetRegistration.id;
    return targetRegistration ?? this.activeRegistration();
  }

  private registrationContaining(
    target: EventTarget | null,
  ): StoredRegistration | null {
    if (!(target instanceof Node)) return null;
    return (
      [...this.registrations.values()]
        .sort((left, right) => right.order - left.order)
        .find((registration) => registration.getRoot()?.contains(target)) ??
      null
    );
  }

  private activeRegistration(): StoredRegistration | null {
    return this.activeId
      ? (this.registrations.get(this.activeId) ?? null)
      : null;
  }

  private mostRecentlyRegistered(): StoredRegistration | null {
    return (
      [...this.registrations.values()].sort(
        (left, right) => right.order - left.order,
      )[0] ?? null
    );
  }
}
