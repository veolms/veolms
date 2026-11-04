import {
  filterControlClasses,
  filterSelectTriggerClasses,
} from "../components/FilterBar";
import { ThemedSelect, type ThemedSelectProps } from "../ThemedSelect";

/** A `ThemedSelect` in the framed look the Orders filters have. */
export function SupportSelect<Value extends string>({
  className = "",
  ...props
}: ThemedSelectProps<Value>) {
  return (
    <div className={`${filterControlClasses} ${className}`}>
      <ThemedSelect
        {...props}
        triggerClassName={`${filterSelectTriggerClasses} w-full`}
      />
    </div>
  );
}
