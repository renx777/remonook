import NumberFlow, { useIsSupported } from "@number-flow/react";
import "./number-flow.css";

export { NumberFlowGroup as NumberGroup } from "@number-flow/react";

const transformTiming = { duration: 360, easing: "cubic-bezier(0.22, 1, 0.36, 1)" };
const opacityTiming = { duration: 160, easing: "ease-out" };
const format = { useGrouping: false, maximumFractionDigits: 0 };

/** A shared, quiet transition for changing counts, with a plain-text fallback. */
export function FlowNumber({ value, suffix = "" }: { value: number; suffix?: string }) {
  const supported = useIsSupported();
  if (!supported) return <span className="flow-number">{value}{suffix}</span>;
  return <NumberFlow className="flow-number" value={value} suffix={suffix}
    format={format} transformTiming={transformTiming} opacityTiming={opacityTiming}
    respectMotionPreference />;
}
