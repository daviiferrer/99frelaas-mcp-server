import { projectFlagIcons } from "../../assets/iconRegistry";
import type { ProjectFlagKey } from "../../types/dashboard";

type ProjectFlagProps = {
  flag: ProjectFlagKey;
};

export function ProjectFlag({ flag }: ProjectFlagProps): JSX.Element {
  const src = projectFlagIcons[flag];

  return <img src={src} alt={flag} style={{ width: 24, height: 30, display: "block" }} />;
}
