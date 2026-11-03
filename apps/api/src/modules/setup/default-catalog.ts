// Njiro Legacy rooms and restaurant menu, created when the hotel is first set up.
// The same data is added to an already set-up hotel by the
// 202611030001_njiro_rooms_and_menu and 202611030002_buffet_menu_item database migrations — keep them in step.

// Room rates start at 0 and are set from the admin workspace (room type rates).
export const defaultRoomType = { code: "STD", name: "Standard Room", baseOccupancy: 1, maxOccupancy: 2 } as const;

function roomRange(from: number, to: number, pad: number) {
  return Array.from({ length: to - from + 1 }, (_, index) => String(from + index).padStart(pad, "0"));
}

export const defaultRoomFloors = [
  { name: "Ground Floor", sortOrder: 0, rooms: roomRange(5, 13, 3) },
  { name: "First Floor", sortOrder: 1, rooms: roomRange(101, 110, 3) },
  { name: "Second Floor", sortOrder: 2, rooms: roomRange(201, 210, 3) },
  { name: "Rooms 1-4", sortOrder: 3, rooms: roomRange(1, 4, 1) }
] as const;

type MenuItem = readonly [name: string, priceTzs: number, priceUsd: number];
type MenuSection = { category: string; skuPrefix: string; items: readonly MenuItem[] };

// Prices from the Njiro Legacy food menu: TSh price and USD price.
export const defaultMenu: readonly MenuSection[] = [
  {
    category: "Buffet",
    skuPrefix: "BUF",
    items: [["Buffet", 40000, 15]]
  },
  {
    category: "Soups",
    skuPrefix: "SOUP",
    items: [
      ["Zesty Spicy Broccoli", 6000, 3],
      ["Creamy Pumpkin and Leek Potage", 6000, 3],
      ["Forest Mushroom Cream", 6000, 3],
      ["Rustic Chicken and Vegetable Broth", 6000, 3]
    ]
  },
  {
    category: "Appetizers",
    skuPrefix: "APP",
    items: [
      ["Chicken Nuggets", 6000, 3],
      ["Bruschetta Classica", 6000, 3]
    ]
  },
  {
    category: "Chicken Lovers",
    skuPrefix: "CHK",
    items: [
      ["Paprika Honey Soy Wings", 25000, 10],
      ["Garlic and Herb Crispy Chicken", 25000, 10],
      ["Coconut Infused Roast Chicken", 25000, 10],
      ["Mixed Veggies Chicken Steak", 25000, 10],
      ["Chargrilled Chicken Steak", 25000, 10]
    ]
  },
  {
    category: "Beef Corner",
    skuPrefix: "BEEF",
    items: [
      ["Creamy Beef Fillet Strips", 20000, 8],
      ["African Spiced Roast Beef", 20000, 8],
      ["Swahili Grilled Beef", 20000, 8]
    ]
  },
  {
    category: "Salads",
    skuPrefix: "SAL",
    items: [
      ["Coleslaw Salad", 10000, 5],
      ["Garden Fresh Salad", 10000, 5],
      ["Tropical Mango Cilantro", 10000, 5],
      ["Avocado Bliss", 10000, 5],
      ["Tropical Fruits Salad", 10000, 5],
      ["Swahili Salad", 10000, 5]
    ]
  },
  {
    category: "Desserts",
    skuPrefix: "DES",
    items: [
      ["Red Velvet Cake", 16000, 7],
      ["Chocolate Cake", 16000, 7],
      ["Lemon Cake", 16000, 7]
    ]
  },
  {
    category: "Hot Beverages",
    skuPrefix: "HOT",
    items: [
      ["Ginger Tea", 5000, 2],
      ["Tea Masala", 5000, 2],
      ["Black Tea", 5000, 2],
      ["Herbal Tea", 5000, 2]
    ]
  },
  {
    category: "Oven Pizza",
    skuPrefix: "PIZ",
    items: [
      ["Margherita Pizza", 25000, 10],
      ["Mediterranean Pizza", 28000, 12],
      ["Four Season Pizza (Artichoke, Mushrooms)", 25000, 10],
      ["BBQ Chicken Pizza", 25000, 10]
    ]
  },
  {
    category: "Pasta",
    skuPrefix: "PAS",
    items: [
      ["Creamy Coconut Chicken Pasta", 15000, 6],
      ["Savory Beef and Vegetable Pasta", 15000, 6],
      ["Chef's Seasonal Vegetable Pasta", 15000, 6]
    ]
  },
  {
    category: "Tanzania Local Menu",
    skuPrefix: "LOC",
    items: [
      ["Fries and Sausage", 10000, 5],
      ["Chips Mayai", 10000, 5],
      ["Chips Vuruga", 15000, 6],
      ["Kisinia Pilau (4 portions)", 45000, 18]
    ]
  },
  {
    category: "Side Dishes",
    skuPrefix: "SIDE",
    items: [
      ["Plain Ugali", 5000, 2],
      ["Fluffy White Rice", 5000, 2],
      ["Fried Fries", 5000, 2],
      ["Pasta (Side)", 5000, 2],
      ["Creamy Mashed Potatoes", 5000, 2],
      ["Fried Plantains", 2000, 1]
    ]
  },
  {
    category: "Vegetarian Options",
    skuPrefix: "VEG",
    items: [
      ["Creamy Peas", 10000, 5],
      ["Seasonal Creamy Veggies", 10000, 5],
      ["Creamy Green Beans", 10000, 5],
      ["Spicy Lentils in Coconut Sauce", 10000, 5]
    ]
  }
];

export function menuSku(section: MenuSection, index: number) {
  return `${section.skuPrefix}-${String(index + 1).padStart(2, "0")}`;
}
