// Stands in for next/link inside the dashboard file: a claim link opens the claim on the site (which asks for the sign-in).
export default function Link({ href, children, className }) {
  const base = (typeof window !== "undefined" && window.__DASH__?.site) || "";
  return (
    <a href={`${base}${href}`} target="_blank" rel="noopener noreferrer" className={className}>
      {children}
    </a>
  );
}
