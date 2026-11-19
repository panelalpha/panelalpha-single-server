import { api } from '@/shared/api/client'

// The WooCommerce calls of the General screen (Installation card): `PUT .../wordpress/plugins/woocommerce/update` (update, no body) and
// `POST .../wordpress/plugins/new/woocommerce/install` (install, no body).
// Paths start at `/instances/` so the client rewrites them to `/projects` under single server.

/** `PUT /instances/{id}/wordpress/plugins/woocommerce/update`. */
export async function updateWoocommerce (id: number): Promise<void> {
  await api.put(`/instances/${id}/wordpress/plugins/woocommerce/update`)
}

/**
 * `POST /instances/{id}/wordpress/plugins/new/woocommerce/install`. The panel queues the install
 * in a job and answers `202 {"success":true}` with no plugin list; the finished job notifies the page, which reads the project again.
 */
export async function installWoocommerce (id: number): Promise<void> {
  await api.post(`/instances/${id}/wordpress/plugins/new/woocommerce/install`)
}
