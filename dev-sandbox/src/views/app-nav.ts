// The dev sandbox's mirror of the public build's small "dev" shortcut (`.demo-dev` in src/demo):
// the same quiet monospace pill, the same BASE_URL-relative hop, pointing the other way.
// Kept out of the bottom chrome bar's row so neither control covers the other.
export function createProdLink(): HTMLAnchorElement {
  const link = document.createElement('a');
  link.className = 'app-prod';
  link.textContent = 'prod';
  link.title = 'Public build';
  link.href = import.meta.env.BASE_URL;
  return link;
}
