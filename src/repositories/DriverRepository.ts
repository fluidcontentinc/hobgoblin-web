import type { DriverOfferDto, DriverActiveDeliveryDto } from '../contracts/dto';
import type { DriverDeliveryStatus } from '../contracts/status';

export interface DriverRepository {
  getState(): Promise<{ online: boolean; activeDeliveryId: number | null }>;
  goOnline(): Promise<void>;
  goOffline(): Promise<void>;

  getOffers(): Promise<DriverOfferDto[]>;
  acceptOffer(id: number): Promise<{ activeDeliveryId: number }>;
  declineOffer(id: number): Promise<void>;

  getActive(): Promise<DriverActiveDeliveryDto | null>;
  advanceDelivery(id: number, input: { status: DriverDeliveryStatus }): Promise<void>;

  getEarnings(): Promise<{ todayTotal: number; weekTotal: number; deliveries: Array<{ id: number; payout: number; createdAt: string; restaurantName: string }> }>;
}


