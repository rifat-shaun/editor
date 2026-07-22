/**
 * Shared host for every portaled editor surface (menus, popovers, dialogs,
 * toasts). React portals default to `document.body`, which would render them
 * OUTSIDE the editor's scope anchor — and the shipped stylesheet scopes every
 * rule under `[data-docs-editor-root]`, so a body-level popover would lose all
 * its styling. Routing them through this host (which carries the attribute)
 * keeps them inside the scope: tokens and component styles reach them, and
 * nothing leaks to the host app.
 *
 * `display:contents` means the host generates no box of its own, so fixed-
 * positioned panels stay viewport-relative exactly as if they were direct
 * children of <body>.
 */
let host: HTMLElement | null = null;

export function getPortalHost(): HTMLElement {
  if (host?.isConnected) return host;
  host = document.createElement('div');
  host.setAttribute('data-docs-editor-root', '');
  host.setAttribute('data-docs-portal', '');
  host.style.display = 'contents';
  document.body.appendChild(host);
  return host;
}
