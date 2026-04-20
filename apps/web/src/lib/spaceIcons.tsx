import {
  BriefcaseIcon,
  BuildingsIcon,
  UsersThreeIcon,
  FolderIcon,
  FolderStarIcon,
  BookOpenIcon,
  BookmarkIcon,
  NotebookIcon,
  RocketLaunchIcon,
  LightningIcon,
  FireIcon,
  SparkleIcon,
  StarIcon,
  HeartIcon,
  GlobeIcon,
  CloudIcon,
  SunIcon,
  MoonIcon,
  TreeIcon,
  LeafIcon,
  GearIcon,
  CompassIcon,
  ChatCircleIcon,
  PaletteIcon,
  CodeIcon,
  GameControllerIcon,
  MusicNotesIcon,
  CameraIcon,
  MegaphoneSimpleIcon,
  CrownIcon,
  DiamondIcon,
  TrophyIcon,
  ShieldIcon,
  FlagIcon,
  HashIcon,
  AtIcon,
} from "@phosphor-icons/react"
import type { IconProps } from "@phosphor-icons/react"
import type { ComponentType } from "react"

type IconComponent = ComponentType<IconProps>

// Curated, stable list of icon choices for spaces. Keys are stored in the DB
// as `Space.icon`, so once added here they shouldn't be renamed or removed
// without a migration.
export const SPACE_ICONS: { key: string; label: string; Icon: IconComponent }[] = [
  { key: "briefcase", label: "Briefcase", Icon: BriefcaseIcon },
  { key: "buildings", label: "Buildings", Icon: BuildingsIcon },
  { key: "users", label: "Team", Icon: UsersThreeIcon },
  { key: "folder", label: "Folder", Icon: FolderIcon },
  { key: "folder-star", label: "Starred folder", Icon: FolderStarIcon },
  { key: "book", label: "Book", Icon: BookOpenIcon },
  { key: "bookmark", label: "Bookmark", Icon: BookmarkIcon },
  { key: "notebook", label: "Notebook", Icon: NotebookIcon },
  { key: "rocket", label: "Rocket", Icon: RocketLaunchIcon },
  { key: "lightning", label: "Lightning", Icon: LightningIcon },
  { key: "fire", label: "Fire", Icon: FireIcon },
  { key: "sparkle", label: "Sparkle", Icon: SparkleIcon },
  { key: "star", label: "Star", Icon: StarIcon },
  { key: "heart", label: "Heart", Icon: HeartIcon },
  { key: "globe", label: "Globe", Icon: GlobeIcon },
  { key: "cloud", label: "Cloud", Icon: CloudIcon },
  { key: "sun", label: "Sun", Icon: SunIcon },
  { key: "moon", label: "Moon", Icon: MoonIcon },
  { key: "tree", label: "Tree", Icon: TreeIcon },
  { key: "leaf", label: "Leaf", Icon: LeafIcon },
  { key: "gear", label: "Gear", Icon: GearIcon },
  { key: "compass", label: "Compass", Icon: CompassIcon },
  { key: "chat", label: "Chat", Icon: ChatCircleIcon },
  { key: "palette", label: "Palette", Icon: PaletteIcon },
  { key: "code", label: "Code", Icon: CodeIcon },
  { key: "game", label: "Game", Icon: GameControllerIcon },
  { key: "music", label: "Music", Icon: MusicNotesIcon },
  { key: "camera", label: "Camera", Icon: CameraIcon },
  { key: "megaphone", label: "Megaphone", Icon: MegaphoneSimpleIcon },
  { key: "crown", label: "Crown", Icon: CrownIcon },
  { key: "diamond", label: "Diamond", Icon: DiamondIcon },
  { key: "trophy", label: "Trophy", Icon: TrophyIcon },
  { key: "shield", label: "Shield", Icon: ShieldIcon },
  { key: "flag", label: "Flag", Icon: FlagIcon },
  { key: "hash", label: "Hash", Icon: HashIcon },
  { key: "at", label: "At", Icon: AtIcon },
]

const byKey = new Map(SPACE_ICONS.map((x) => [x.key, x]))

export function getSpaceIcon(key: string | null | undefined) {
  if (!key) return null
  return byKey.get(key) ?? null
}
