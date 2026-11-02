export type WheelTemplate = {
  name: string;
  options: string[];
};

export const wheelTemplates: WheelTemplate[] = [
  { name: "Yes or no", options: ["Yes", "No"] },
  { name: "Yes, no or maybe", options: ["Yes", "No", "Maybe"] },
  { name: "1 to 10", options: Array.from({ length: 10 }, (_, index) => String(index + 1)) },
  { name: "Dinner ideas", options: ["Pizza", "Sushi", "Tacos", "Curry", "Burgers", "Pasta", "Stir-fry", "Salad"] },
  { name: "Weekend plans", options: ["Beach", "Movie night", "Bushwalk", "Board games", "Brunch", "Day trip"] },
  { name: "Chores", options: ["Dishes", "Vacuuming", "Laundry", "Bins", "Bathroom", "Groceries"] },
  { name: "Truth or dare", options: ["Truth", "Dare"] },
];
