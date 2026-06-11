import { ApiAuthRepository } from '../repositories/ApiAuthRepository';
import { ApiRestaurantsRepository } from '../repositories/ApiRestaurantsRepository';
import { ApiMissionsRepository } from '../repositories/ApiMissionsRepository';
import { ApiOrdersRepository } from '../repositories/ApiOrdersRepository';
import { ApiAdventureRepository } from '../repositories/ApiAdventureRepository';
import { ApiParentRepository } from '../repositories/ApiParentRepository';
import { ApiMerchantRepository } from '../repositories/ApiMerchantRepository';
import { ApiPathMapRepository } from '../repositories/ApiPathMapRepository';

const apiAuthRepository = new ApiAuthRepository();
const apiRestaurantsRepository = new ApiRestaurantsRepository();
const apiMissionsRepository = new ApiMissionsRepository();
const apiOrdersRepository = new ApiOrdersRepository();
const apiAdventureRepository = new ApiAdventureRepository();
const apiParentRepository = new ApiParentRepository();
const apiMerchantRepository = new ApiMerchantRepository();
// Backend-backed shared map. LocalPathMapRepository remains in the tree for
// reference / offline fallback experiments but is no longer wired up.
const pathMapRepository = new ApiPathMapRepository();

export const Repos = {
  auth: apiAuthRepository,
  restaurants: apiRestaurantsRepository,
  missions: apiMissionsRepository,
  orders: apiOrdersRepository,
  adventure: apiAdventureRepository,
  parent: apiParentRepository,
  merchant: apiMerchantRepository,
  pathMap: pathMapRepository,
  driver: null as any, // TODO: Add ApiDriverRepository when driver backend is built
};
