import { ratingIcons, statusIcons } from "../../assets/iconRegistry";
import { dashboardTokens } from "../../theme/tokens";
import type { ProfileSummary } from "../../types/dashboard";
import { SectionCard } from "./SectionCard";

type ProfileCardProps = {
  profile: ProfileSummary;
};

function buildInitials(name: string): string {
  const parts = name
    .split(" ")
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 2);

  if (parts.length === 0) return "?";
  return parts.map((part) => part[0]?.toUpperCase() ?? "").join("");
}

function buildRatingStars(ratingText: string): string[] {
  const ratingValue = Number.parseFloat(ratingText.replace(",", "."));
  const normalizedRating = Number.isFinite(ratingValue) ? Math.max(0, Math.min(5, ratingValue)) : 0;

  return Array.from({ length: 5 }, (_, index) => {
    const starNumber = index + 1;
    if (normalizedRating >= starNumber) return ratingIcons.on;
    if (normalizedRating >= starNumber - 0.5) return ratingIcons.half;
    return ratingIcons.off;
  });
}

export function ProfileCard({ profile }: ProfileCardProps): JSX.Element {
  const stars = buildRatingStars(profile.ratingText);
  const initials = buildInitials(profile.name);

  return (
    <SectionCard title="Meu perfil" bodyStyle={{ padding: "clamp(10px, 2vw, 12px)" }}>
      <div style={{ display: "flex", gap: dashboardTokens.spacing.md, alignItems: "center", minWidth: 0 }}>
        <div
          style={{
            width: "clamp(56px, 8vw, 64px)",
            height: "clamp(56px, 8vw, 64px)",
            borderRadius: 4,
            overflow: "hidden",
            background: dashboardTokens.color.cardBackgroundMuted,
            border: `1px solid ${dashboardTokens.color.borderSubtle}`,
            flexShrink: 0,
          }}
        >
          {profile.avatarSrc ? (
            <img
              src={profile.avatarSrc}
              alt={profile.name}
              style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
            />
          ) : (
            <div
              aria-hidden="true"
              style={{
                width: "100%",
                height: "100%",
                display: "grid",
                placeItems: "center",
                color: dashboardTokens.color.textMuted,
                fontSize: "clamp(20px, 3vw, 24px)",
                fontWeight: 700,
              }}
            >
              {initials}
            </div>
          )}
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              flexWrap: "nowrap",
              minWidth: 0,
            }}
          >
            <div
              style={{
                fontSize: "clamp(15px, 2.2vw, 16px)",
                fontWeight: 700,
                color: dashboardTokens.color.brandBlue,
                lineHeight: 1.15,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {profile.name}
            </div>
            {profile.isVerified ? (
              <img
                src={statusIcons.verified}
                alt="Verificado"
                style={{ width: "clamp(16px, 2.4vw, 18px)", height: "clamp(16px, 2.4vw, 18px)", flexShrink: 0 }}
              />
            ) : null}
          </div>
          <div
            style={{
              marginTop: 6,
              display: "flex",
              alignItems: "center",
              gap: 4,
              flexWrap: "wrap",
            }}
          >
            {stars.map((star, index) => (
              <img
                key={`${profile.name}-star-${index}`}
                src={star}
                alt=""
                style={{ width: "clamp(14px, 2.2vw, 16px)", height: "clamp(14px, 2.2vw, 16px)" }}
              />
            ))}
            <span style={{ color: dashboardTokens.color.textMuted, fontSize: "clamp(12px, 2vw, 14px)" }}>
              {profile.reviewCountLabel}
            </span>
          </div>
            <div
              style={{
                marginTop: 6,
                fontSize: "clamp(14px, 2.1vw, 15px)",
                fontWeight: 700,
                color: dashboardTokens.color.textStrong,
                lineHeight: 1.2,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
            {profile.membershipLabel}{" "}
            {profile.membershipAccentLabel ? (
              <span style={{ color: dashboardTokens.color.success }}>
                ({profile.membershipAccentLabel})
              </span>
            ) : null}
          </div>
          {profile.connectionsLabel ? (
            <div
              style={{
                marginTop: 8,
                fontSize: 13,
                fontWeight: 600,
                color: dashboardTokens.color.textPrimary,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {profile.connectionsLabel}
            </div>
          ) : null}
        </div>
      </div>
    </SectionCard>
  );
}
