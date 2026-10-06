import type { MerchantRepository, ParsedMenuRow } from './MerchantRepository';
import type { MenuItemDto, MerchantHoursDto, MerchantOrderDto, StoreDto } from '../contracts/dto';
import type { MerchantOrdersTab, MerchantOrderStatus } from '../contracts/status';
import api from '../api/client';
import { resolveAssetUrl } from '../api/config';

/**
 * Marketplace-engine merchant routes:
 *   /api/merchant/store              — restaurant profile
 *   /api/merchant/hours              — open/close hours per day
 *   /api/merchant/menu               — menu CRUD (collection)
 *   /api/merchant/menu/{id}          — menu CRUD (item)
 *
 * Engine does NOT have /api/merchant/orders — restaurants use the generic
 * /api/orders endpoint, scoped by the visibility filter (seller_id ==
 * caller). Tabs (pending / preparing / ready / done) map to `state`.
 */
export class ApiMerchantRepository implements MerchantRepository {
  // ── store ─────────────────────────────────────────────────────────────────

  async getStore(): Promise<StoreDto> {
    const data = await api.get('/merchant/store');
    return this.transformStore(data);
  }

  async createStore(input: { name: string; cuisine?: string }): Promise<StoreDto> {
    const data = await api.post('/merchant/store', input);
    return this.transformStore(data);
  }

  async patchStore(
    input: Partial<Pick<StoreDto, 'status' | 'name' | 'cuisine' | 'description' | 'address' | 'notification_email' | 'notification_phone'>>,
  ): Promise<StoreDto> {
    const data = await api.patch('/merchant/store', input);
    return this.transformStore(data);
  }

  /** POST /api/merchant/store/logo — multipart with `logo` file field. */
  async uploadLogo(file: any): Promise<{ logo_url: string }> {
    const res = await api.postMultipart('/merchant/store/logo', { logo: file });
    return { logo_url: res?.logo_url ?? '' };
  }

  private transformStore(data: any): StoreDto {
    return {
      id:                 data?.id,
      name:               data?.name ?? '',
      status:             data?.status ?? 'open',
      cuisine:            data?.cuisine ?? null,
      description:        data?.description ?? null,
      address:            data?.address ?? null,
      logo_url:           resolveAssetUrl(data?.logo_url) || null,
      notification_email: data?.notification_email ?? null,
      notification_phone: data?.notification_phone ?? null,
    };
  }

  // ── hours ─────────────────────────────────────────────────────────────────

  /**
   * Engine returns an array of 7 DayHoursDto (one per mon→sun). If a day
   * row hasn't been written yet for this restaurant the engine just omits
   * it, so we fill defaults so the component always renders 7 rows.
   */
  async getHours(): Promise<MerchantHoursDto> {
    const data = await api.get('/merchant/hours');
    const rows: any[] = Array.isArray(data) ? data : [];
    const byDay: Record<string, any> = {};
    rows.forEach((r) => { byDay[r.day] = r; });

    const DAYS: Array<'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'> =
      ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

    return DAYS.map((d) => {
      const row = byDay[d];
      if (row) {
        return {
          day:        d,
          open_time:  this.toShortTime(row.open_time),
          close_time: this.toShortTime(row.close_time),
          is_closed:  Boolean(row.is_closed),
        };
      }
      // Default for a day never set: open 09:00-21:00 (better default than blank).
      return { day: d, open_time: '09:00', close_time: '21:00', is_closed: false };
    });
  }

  /**
   * Engine PATCH expects { hours: [...] }. Always send all 7 days so partial
   * state on the client can't drift apart from the server's representation.
   */
  async patchHours(hours: MerchantHoursDto): Promise<MerchantHoursDto> {
    await api.patch('/merchant/hours', {
      hours: hours.map((h) => ({
        day:        h.day,
        open_time:  h.is_closed ? null : h.open_time,
        close_time: h.is_closed ? null : h.close_time,
        is_closed:  Boolean(h.is_closed),
      })),
    });
    // Re-fetch to get the canonical post-save state.
    return await this.getHours();
  }

  /** Trim 'HH:MM:SS' → 'HH:MM' since the UI's <input type="time"> expects 5 chars. */
  private toShortTime(t: string | null | undefined): string | null {
    if (!t) return null;
    return t.length >= 5 ? t.substring(0, 5) : t;
  }

  // ── orders (engine: /api/orders + state filter) ───────────────────────────

  async getOrders(input: { tab: MerchantOrdersTab }): Promise<MerchantOrderDto[]> {
    const state = mapTabToState(input.tab);
    const path = state ? `/orders?state=${encodeURIComponent(state)}` : '/orders';
    const data = await api.get(path);
    const rows = Array.isArray(data) ? data : (data?.data ?? []);
    return rows.map((r: any) => this.transformMerchantOrder(r));
  }

  async getOrder(id: number): Promise<MerchantOrderDto | null> {
    try {
      const data = await api.get(`/orders/${id}`);
      return data ? this.transformMerchantOrder(data) : null;
    } catch {
      return null;
    }
  }

  async patchOrder(
    id: number,
    input: { status?: MerchantOrderStatus; prepTimeMinutes?: number; reject?: boolean },
  ): Promise<MerchantOrderDto> {
    // Engine state transitions live at PATCH /api/orders/{id}/status with
    // body { state }. `reject` maps to state=cancelled; other tabs map directly.
    let nextState: string | undefined;
    if (input.reject) {
      nextState = 'cancelled';
    } else if (input.status) {
      nextState = mapMerchantStatusToState(input.status);
    }

    if (nextState) {
      await api.patch(`/orders/${id}/status`, { state: nextState });
    }

    // prepTimeMinutes — engine has no dedicated column; stash in metadata for now.
    if (input.prepTimeMinutes !== undefined) {
      // (no-op until we add a /orders/{id}/metadata endpoint)
    }

    const fresh = await api.get(`/orders/${id}`);
    return this.transformMerchantOrder(fresh);
  }

  private transformMerchantOrder(o: any): MerchantOrderDto {
    return {
      id:         o.id,
      buyerEmail: o.buyer?.email ?? o.buyer_email ?? '',
      buyerName:  o.buyer?.name  ?? '',
      status:     o.state ?? o.status ?? 'pending',
      driverName: o.driver?.name ?? null,
      total:      typeof o.total_cents === 'number' ? o.total_cents / 100 : parseFloat(o.total) || 0,
      createdAt:  o.created_at ?? o.placed_at ?? '',   // matches MerchantOrderDto.createdAt
      items:      Array.isArray(o.items) ? o.items.map(transformMerchantItem) : [],
    } as any;
  }

  // ── menu ──────────────────────────────────────────────────────────────────

  async getMenu(): Promise<MenuItemDto[]> {
    const data = await api.get('/merchant/menu');
    const rows: any[] = Array.isArray(data) ? data : [];
    // Rebase uploaded photo URLs so they load on device, not just the dev browser.
    return rows.map((it: any) => ({
      ...it,
      image_url: resolveAssetUrl(it?.image_url ?? it?.image) || null,
    }));
  }

  /** Send a menu photo to the vision endpoint; returns candidate rows to review. */
  async importMenuPhoto(file: any): Promise<ParsedMenuRow[]> {
    const res = await api.postMultipart('/merchant/menu/import', { image: file });
    const items: any[] = Array.isArray(res?.items) ? res.items : [];
    return items
      .map((r: any): ParsedMenuRow => {
        const priceNum =
          typeof r?.price === 'number'
            ? r.price
            : (r?.price != null && Number.isFinite(parseFloat(r.price)) ? parseFloat(r.price) : null);
        return {
          name: String(r?.name ?? '').trim(),
          price: priceNum,
          description: r?.description ? String(r.description) : '',
        };
      })
      .filter((r) => r.name.length > 0);
  }

  /**
   * Create a menu item. When `image` is provided, switches to multipart so
   * item + photo upload land in a single request (matches the new UX flow
   * where the merchant fills the form with a photo and hits Save once).
   */
  async postMenuItem(input: Omit<MenuItemDto, 'id'> & { image?: File | Blob | null }): Promise<MenuItemDto> {
    const { image, price, ...rest } = input as any;
    // Always send price_cents (integer) — avoids float validation edge-cases with Laravel's `numeric` rule.
    const body: Record<string, any> = {
      ...rest,
      price_cents: typeof price === 'number' ? Math.round(price * 100) : (rest.price_cents ?? 0),
    };
    if (image) {
      // Multipart: arrays/objects need to be JSON-stringified to survive the FormData hop.
      const fields: Record<string, any> = { ...body, image };
      if (Array.isArray(body.ingredients)) {
        fields.ingredients = JSON.stringify(body.ingredients);
      }
      return await api.postMultipart('/merchant/menu', fields);
    }
    return await api.post('/merchant/menu', body);
  }

  async patchMenuItem(
    id: number,
    input: Partial<Omit<MenuItemDto, 'id'>> & { image?: File | Blob | null },
  ): Promise<MenuItemDto> {
    const { image, price, ...rest } = input as any;
    const body: Record<string, any> = { ...rest };
    if (price !== undefined) {
      body.price_cents = Math.round((price as number) * 100);
    }
    if (image) {
      const fields: Record<string, any> = { ...body, image };
      if (Array.isArray(body.ingredients)) {
        fields.ingredients = JSON.stringify(body.ingredients);
      }
      return await api.patchMultipart(`/merchant/menu/${id}`, fields);
    }
    return await api.patch(`/merchant/menu/${id}`, body);
  }

  async patchMenuItemAvailability(id: number, input: { available: boolean }): Promise<MenuItemDto> {
    return await api.patch(`/merchant/menu/${id}/availability`, input);
  }

  async deleteMenuItem(id: number): Promise<void> {
    await api.delete(`/merchant/menu/${id}`);
  }
}

// ── helpers ─────────────────────────────────────────────────────────────────

function mapTabToState(tab: MerchantOrdersTab): string | undefined {
  // Frontend tab names → engine `state` values (the engine accepts a comma-separated list).
  const map: Record<string, string> = {
    new:        'pending',
    preparing:  'confirmed,preparing',
    ready:      'ready',
    history:    'picked_up,delivered,completed,cancelled',
  };
  return map[tab as string];
}

function mapMerchantStatusToState(s: MerchantOrderStatus): string | undefined {
  const map: Record<string, string> = {
    confirmed: 'confirmed',
    preparing: 'preparing',
    ready:     'ready',
    cancelled: 'cancelled',
  };
  return map[s as string];
}

function transformMerchantItem(it: any) {
  return {
    id:        it.id,
    menuItemId:it.menu_item_id ?? it.menuItem?.id,
    // Order items returned by OrderController have a flat `name` field.
    // Legacy shapes may nest it under `menuItem.name` or `title`.
    name:      it.menuItem?.name ?? it.title ?? it.name ?? '',
    price:     typeof it.price_cents === 'number' ? it.price_cents / 100 : parseFloat(it.price) || 0,
    quantity:  it.quantity ?? 1,
    imageUrl:  resolveAssetUrl(it.menuItem?.image_url) || null,
  };
}
