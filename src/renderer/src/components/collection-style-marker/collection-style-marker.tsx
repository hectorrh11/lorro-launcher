import {
  CheckCircleFillIcon,
  ClockIcon,
  DiamondIcon,
  PackageIcon,
  StarFillIcon,
  TrophyIcon,
  XCircleFillIcon,
} from "@primer/octicons-react";
import type { CollectionStyleEmblem } from "@shared";

import "./collection-style-marker.scss";

interface CollectionStyleEmblemIconProps {
  emblem: CollectionStyleEmblem;
  size?: number;
}

export function CollectionStyleEmblemIcon({
  emblem,
  size = 12,
}: Readonly<CollectionStyleEmblemIconProps>) {
  switch (emblem) {
    case "trophy":
      return <TrophyIcon size={size} />;
    case "gem":
      return <DiamondIcon size={size} />;
    case "star":
      return <StarFillIcon size={size} />;
    case "check":
      return <CheckCircleFillIcon size={size} />;
    case "clock":
      return <ClockIcon size={size} />;
    case "abandoned":
      return <XCircleFillIcon size={size} />;
    case "package":
      return <PackageIcon size={size} />;
    default:
      return null;
  }
}

interface CollectionStyleMarkerProps {
  emblem: CollectionStyleEmblem;
  color?: string | null;
  size?: number;
  className?: string;
}

export function CollectionStyleMarker({
  emblem,
  color,
  size = 12,
  className,
}: Readonly<CollectionStyleMarkerProps>) {
  if (emblem === "none") return null;

  return (
    <span
      className={className}
      style={color ? { color } : undefined}
      aria-hidden="true"
      data-collection-emblem={emblem}
    >
      <CollectionStyleEmblemIcon emblem={emblem} size={size} />
    </span>
  );
}
