import projectCompletedIcon from "../../../assets/icons/dashboard-metrics/projetos-concluidos.png";
import proposalsAcceptedIcon from "../../../assets/icons/dashboard-metrics/propostas-aceitas.png";
import proposalsSentIcon from "../../../assets/icons/dashboard-metrics/propostas-enviadas.png";
import earningsIcon from "../../../assets/icons/dashboard-metrics/seus-ganhos.png";
import profileViewsIcon from "../../../assets/icons/dashboard-metrics/views-no-perfil.png";
import flagDestaqueIcon from "../../../assets/icons/project-flags/flag-destaque.png";
import flagExclusiveIcon from "../../../assets/icons/project-flags/flag-exclusive.png";
import flagUrgentIcon from "../../../assets/icons/project-flags/flag-urgent.png";
import warningIcon from "../../../assets/icons/project-status/icon-warning.png";
import verifiedIcon from "../../../assets/icons/project-status/verified.png";
import starHalfIcon from "../../../assets/icons/rating/star-half.png";
import starOffIcon from "../../../assets/icons/rating/star-off.png";
import starOnIcon from "../../../assets/icons/rating/star-on.png";

export const metricIcons = {
  earnings: earningsIcon,
  sentProposals: proposalsSentIcon,
  acceptedProposals: proposalsAcceptedIcon,
  profileViews: profileViewsIcon,
  completedProjects: projectCompletedIcon,
} as const;

export const ratingIcons = {
  on: starOnIcon,
  off: starOffIcon,
  half: starHalfIcon,
} as const;

export const projectFlagIcons = {
  highlight: flagDestaqueIcon,
  exclusive: flagExclusiveIcon,
  urgent: flagUrgentIcon,
} as const;

export const statusIcons = {
  warning: warningIcon,
  verified: verifiedIcon,
} as const;
