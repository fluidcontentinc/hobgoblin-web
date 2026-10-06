import type { DriverOfferDto, DriverActiveDeliveryDto, DriverEarningsDto } from '../contracts/dto';

export interface DriverRepository {
  /** `online` is a local toggle; `approved` comes from the engine (admin approval). */
  getState(): Promise<{ online: boolean; approved: boolean; activeDeliveryId: number | null }>;
  goOnline(): Promise<void>;
  goOffline(): Promise<void>;

  getOffers(): Promise<DriverOfferDto[]>;
  acceptOffer(id: number): Promise<DriverActiveDeliveryDto>;
  declineOffer(id: number): Promise<void>;

  getActive(): Promise<DriverActiveDeliveryDto | null>;
  confirmPickup(id: number): Promise<DriverActiveDeliveryDto>;
  completeDelivery(id: number): Promise<void>;
  releaseDelivery(id: number): Promise<void>;

  getEarnings(): Promise<DriverEarningsDto>;
}
