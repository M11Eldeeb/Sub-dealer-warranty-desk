/** A person's main page: the home dashboard for dealer, admin and manager, their own first page for everyone else. */
export function homeHref(role) {
  if (role === "dealer" || role === "admin" || role === "manager") return "/dashboard";
  if (role === "parts_team") return "/dashboard/parts-team";
  if (role === "technical_team") return "/dashboard/technical-team";
  return "/dashboard/sub-dealer";
}
