export type StaffRole = "barber" | "admin" | "master";

export function canAccessPanel(
  role: string | null | undefined,
  barberActive = false,
) {
  return role === "admin" || role === "master" || (role === "barber" && barberActive);
}

export function canCreateTeamRole(
  actorRole: string,
  requestedRole: "barber" | "admin",
) {
  return (
    requestedRole === "barber" && ["admin", "master"].includes(actorRole)
  ) || (requestedRole === "admin" && actorRole === "master");
}