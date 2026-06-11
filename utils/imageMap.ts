/**
 * Image mapping utility for menu items
 * Maps image identifiers to local require() calls
 */

// Fallback placeholder image
const placeholderImage = require('../assets/icon.png');

const imageMap: Record<string, any> = {
  'autumn-harvest-bowl': require('../assets/autumn-harvest-bowl.jpg'),
  'seasonal-berry-tart': require('../assets/seasonal-berry-tart.jpg'),
  'gobbler-burger': require('../assets/gobbler-burger.jpg'),
  'strawberry-salad': require('../assets/strawberry-salad.jpg'),
  'artisan-toast': require('../assets/artisan-toast.jpg'),
  // New food images
  'smore_melted_marshmallow': require('../assets/smore_melted_marshmallow.png'),
  'Peanut_Butter_Marshmallow_Bars_': require('../assets/Peanut_Butter_Marshmallow_Bars_.png'),
  'Goulash_Oreos': require('../assets/Goulash_Oreos.png'),
  'decadent_Smore': require('../assets/decadent_Smore.png'),
  'smores_homemade_cookies_': require('../assets/smores_homemade_cookies_.png'),
  'cake_jar_layers_detailed_strawberry_shortcake': require('../assets/cake_jar_layers_detailed_strawberry_shortcake.png'),
  'Chocolate_Wafer_Icebox_Cake_Homemade': require('../assets/Chocolate_Wafer_Icebox_Cake_Homemade.png'),
  'Nutella_Stuffed_French_Toast_Sticks': require('../assets/Nutella_Stuffed_French_Toast_Sticks.png'),
  'crispy_Thai_banana_roti_topped_with_crushed_Oreos': require('../assets/crispy_Thai_banana_roti_topped_with_crushed_Oreos.png'),
  'chocolate_bon_bons': require('../assets/chocolate_bon_bons.png'),
  'chocolate_bonbon_': require('../assets/chocolate_bonbon_.png'),
  'a_bowl_of_sour_path_kids': require('../assets/a_bowl_of_sour_path_kids.png'),
};

/**
 * Get image source for a menu item
 * Returns require() for local images, or { uri: ... } for URLs
 */
export function getImageSource(imagePath: string) {
  // Check if it's a local image identifier
  if (imagePath && imagePath in imageMap) {
    return imageMap[imagePath];
  }
  
  // If it's a URL (starts with http:// or https://), use as URI
  if (imagePath && (imagePath.startsWith('http://') || imagePath.startsWith('https://'))) {
    return { uri: imagePath };
  }
  
  // Fallback to placeholder
  return placeholderImage;
}

