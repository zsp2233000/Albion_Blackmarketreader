import type { ImgHTMLAttributes } from "react";
import { iconMap, type IconName } from "./icons";
import { cn } from "../ui/cn";

interface IconProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> {
  name: IconName;
}

export function Icon({ name, alt = "", className, ...rest }: IconProps) {
  return (
    <img
      {...rest}
      src={iconMap[name]}
      alt={alt}
      loading={rest.loading || "lazy"}
      decoding={rest.decoding || "async"}
      className={cn("inline-block", className)}
    />
  );
}

