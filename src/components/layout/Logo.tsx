/** The app mark (same artwork as the app icon). */
export function Logo({ className }: { className?: string }) {
  return <img src={`${import.meta.env.BASE_URL}icon.png`} alt="" aria-hidden className={className} draggable={false} />;
}
