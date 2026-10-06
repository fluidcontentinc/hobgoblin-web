import type { DriverRepository } from './DriverRepository';
import type { DriverOfferDto, DriverActiveDeliveryDto, DriverEarningsDto, DriverPlaceDto } from '../contracts/dto';
import type { DriverDeliveryStatus } from '../contracts/status';
import api from '../api/client';
import { addDeclinedOffer, getDeclinedOffers, getDriverOnline, setDriverOnline } from '../../utils/portal';

/**
 * Engine delivery-job endpoints:
 *   GET  /jobs?status=open              open offers (approved drivers only)
 *   GET  /jobs?mine=1&status=...        the driver's own jobs
 *   POST /jobs/{id}/accept | pickup | complete | release
 *   GET  /driver/earnings
 * Money comes back in cents; the UI works in dollars.
 */
export class ApiDriverRepository implements DriverRepository {
  async getState() {
    const [online, me, active] = await Promise.all([
      getDriverOnline(),
      api.get('/me').catch(() => null),
      this.getActive().catch(() => null),
    ]);
    return {
      online,
      approved: !!me?.driver_approved_at,
      activeDeliveryId: active?.id ?? null,
    };
  }

  async goOnline() {
    await setDriverOnline(true);
  }

  async goOffline() {
    await setDriverOnline(false);
  }

  async getOffers(): Promise<DriverOfferDto[]> {
    const [data, declined] = await Promise.all([api.get('/jobs?status=open&per_page=25'), getDeclinedOffers()]);
    const skip = new Set(declined);
    return rows(data)
      .filter((j: any) => j.status === 'open' && !skip.has(j.id))
      .map(toOffer);
  }

  async acceptOffer(id: number): Promise<DriverActiveDeliveryDto> {
    return toActive(await api.post(`/jobs/${id}/accept`, {}));
  }

  async declineOffer(id: number) {
    await addDeclinedOffer(id);
  }

  async getActive(): Promise<DriverActiveDeliveryDto | null> {
    const data = await api.get('/jobs?mine=1&status=accepted,picked_up&per_page=5');
    const job = rows(data)[0];
    return job ? toActive(job) : null;
  }

  async confirmPickup(id: number): Promise<DriverActiveDeliveryDto> {
    return toActive(await api.post(`/jobs/${id}/pickup`, {}));
  }

  async completeDelivery(id: number) {
    await api.post(`/jobs/${id}/complete`, {});
  }

  async releaseDelivery(id: number) {
    await api.post(`/jobs/${id}/release`, {});
  }

  async getEarnings(): Promise<DriverEarningsDto> {
    const data = await api.get('/driver/earnings');
    return {
      approved: !!data?.approved,
      todayTotal: cents(data?.today_cents),
      weekTotal: cents(data?.week_cents),
      deliveries: (Array.isArray(data?.deliveries) ? data.deliveries : []).map((d: any) => ({
        id: d.id,
        orderId: d.order_id,
        payout: cents(d.payout_cents),
        deliveredAt: d.delivered_at ?? '',
        restaurantName: d.restaurant_name ?? 'Restaurant',
      })),
    };
  }
}

function rows(data: any): any[] {
  return Array.isArray(data) ? data : (data?.data ?? []);
}

function cents(v: any): number {
  return typeof v === 'number' ? v / 100 : 0;
}

function place(p: any): DriverPlaceDto {
  return {
    address: p?.address ?? null,
    lat: typeof p?.lat === 'number' ? p.lat : null,
    lng: typeof p?.lng === 'number' ? p.lng : null,
  };
}

function toOffer(j: any): DriverOfferDto {
  return {
    id: j.id,
    status: j.status as DriverDeliveryStatus,
    orderId: j.order?.id ?? null,
    restaurantName: j.pickup?.name ?? 'Restaurant',
    pickup: place(j.pickup),
    payout: cents(j.payout_cents),
    itemCount: j.order?.item_count ?? 0,
    createdAt: j.created_at ?? '',
  };
}

function toActive(j: any): DriverActiveDeliveryDto {
  return {
    id: j.id,
    status: j.status as DriverDeliveryStatus,
    orderId: j.order?.id ?? null,
    orderState: j.order?.state ?? '',
    restaurantName: j.pickup?.name ?? 'Restaurant',
    restaurantPhone: j.pickup?.phone ?? null,
    pickup: place(j.pickup),
    dropoff: {
      ...place(j.dropoff),
      notes: j.dropoff?.notes ?? null,
      customerName: j.dropoff?.customer_name ?? null,
    },
    items: (Array.isArray(j.order?.items) ? j.order.items : []).map((i: any) => ({
      name: i.title ?? 'Item',
      quantity: i.quantity ?? 1,
    })),
    payout: cents(j.payout_cents),
    total: cents(j.order?.total_cents),
    createdAt: j.created_at ?? '',
  };
}
