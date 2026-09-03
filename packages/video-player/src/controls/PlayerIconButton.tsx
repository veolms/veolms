import type { ButtonHTMLAttributes, ReactNode } from "react";
import { classNames } from "../utils/classNames";
import { playerControlClass } from "./controlStyles";

export interface PlayerIconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  icon: ReactNode;
  pressed?: boolean;
}

export function PlayerIconButton({
  className,
  icon,
  label,
  pressed,
  type = "button",
  ...props
}: PlayerIconButtonProps) {
  return (
    <button
      {...props}
      type={type}
      className={classNames(playerControlClass, className)}
      aria-label={label}
      aria-pressed={pressed}
      data-player-control=""
      title={props.title ?? label}
    >
      {icon}
    </button>
  );
}
