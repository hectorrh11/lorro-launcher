import type { CSSProperties } from "react";
import {
  BeakerIcon,
  BookIcon,
  BookmarkFillIcon,
  BroadcastIcon,
  CheckCircleFillIcon,
  CircleSlashIcon,
  ClockIcon,
  DiamondIcon,
  DotFillIcon,
  FlameIcon,
  GoalIcon,
  HeartFillIcon,
  MoonIcon,
  PackageIcon,
  PinIcon,
  RocketIcon,
  ShieldCheckIcon,
  SparkleFillIcon,
  StarFillIcon,
  StopIcon,
  SunIcon,
  TagIcon,
  TrophyIcon,
  XCircleFillIcon,
  ZapIcon,
} from "@primer/octicons-react";
import type {
  CollectionStyleEmblem,
  ResolvedVisualCollectionStyle,
} from "@shared";

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
    case "heart":
      return <HeartFillIcon size={size} />;
    case "flame":
      return <FlameIcon size={size} />;
    case "pin":
      return <PinIcon size={size} />;
    case "bookmark":
      return <BookmarkFillIcon size={size} />;
    case "book":
      return <BookIcon size={size} />;
    case "rocket":
      return <RocketIcon size={size} />;
    case "shield":
      return <ShieldCheckIcon size={size} />;
    case "sun":
      return <SunIcon size={size} />;
    case "moon":
      return <MoonIcon size={size} />;
    case "zap":
      return <ZapIcon size={size} />;
    case "goal":
      return <GoalIcon size={size} />;
    case "tag":
      return <TagIcon size={size} />;
    case "sparkle":
      return <SparkleFillIcon size={size} />;
    case "beaker":
      return <BeakerIcon size={size} />;
    case "broadcast":
      return <BroadcastIcon size={size} />;
    case "stop":
      return <StopIcon size={size} />;
    case "slash":
      return <CircleSlashIcon size={size} />;
    case "dot":
      return <DotFillIcon size={size} />;
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

export function getCollectionTextStyle(
  style: ResolvedVisualCollectionStyle | null | undefined,
  { includeColor = true }: { includeColor?: boolean } = {}
): CSSProperties | undefined {
  if (!style) return undefined;

  const textDecoration = [
    style.underline ? "underline" : null,
    style.strikethrough ? "line-through" : null,
  ]
    .filter(Boolean)
    .join(" ");

  const css: CSSProperties = {};
  let hasValue = false;

  if (includeColor && style.color && !style.dimmed) {
    css.color = style.color;
    hasValue = true;
  }
  if (style.bold) {
    css.fontWeight = 700;
    hasValue = true;
  }
  if (style.italic) {
    css.fontStyle = "italic";
    hasValue = true;
  }
  if (textDecoration) {
    css.textDecoration = textDecoration;
    hasValue = true;
  }
  if (style.uppercase) {
    css.textTransform = "uppercase";
    css.letterSpacing = "0.04em";
    hasValue = true;
  }

  return hasValue ? css : undefined;
}
